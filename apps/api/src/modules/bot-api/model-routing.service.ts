import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import {
  BotService,
  BotModelRoutingService as BotModelRoutingDbService,
  ProviderKeyService,
  BotProviderKeyService,
  BotUsageLogService,
} from '@app/db';
import { ModelRouterService } from './services/model-router.service';
import { RoutingSuggestionService } from './services/routing-suggestion.service';
import { EncryptionService } from './services/encryption.service';
import type { BotModelRouting as PrismaBotModelRouting, ModelRoutingType, Prisma } from '@prisma/client';
import type {
  BotModelRouting,
  CreateRoutingConfigInput,
  UpdateRoutingConfigInput,
  RoutingTestInput,
  RoutingTestResult,
  RoutingStatistics,
  RoutingConfig,
  RoutingSuggestionResult,
  BotProviderDetail,
} from '@repo/contracts';

/**
 * Transform Prisma BotModelRouting to contract BotModelRouting
 * Excludes internal fields (isDeleted, deletedAt) that shouldn't be exposed in API
 */
function toContractRouting(prismaRouting: PrismaBotModelRouting): BotModelRouting {
  return {
    id: prismaRouting.id,
    botId: prismaRouting.botId,
    routingType: prismaRouting.routingType,
    name: prismaRouting.name,
    config: prismaRouting.config as unknown as RoutingConfig,
    priority: prismaRouting.priority,
    isEnabled: prismaRouting.isEnabled,
    createdAt: prismaRouting.createdAt,
    updatedAt: prismaRouting.updatedAt,
  };
}

/**
 * ModelRoutingService
 * 模型路由配置业务服务
 */
@Injectable()
export class ModelRoutingService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly botService: BotService,
    private readonly botModelRoutingDbService: BotModelRoutingDbService,
    private readonly providerKeyService: ProviderKeyService,
    private readonly botProviderKeyService: BotProviderKeyService,
    private readonly botUsageLogService: BotUsageLogService,
    private readonly modelRouterService: ModelRouterService,
    private readonly routingSuggestionService: RoutingSuggestionService,
  ) {}

  /**
   * 获取 Bot 的所有路由配置
   */
  async listRoutings(
    hostname: string,
    userId: string,
  ): Promise<BotModelRouting[]> {
    const bot = await this.getBotByHostname(hostname, userId);
    const { list } = await this.botModelRoutingDbService.list(
      { botId: bot.id },
      { orderBy: { priority: 'asc' } },
    );
    return list.map(toContractRouting);
  }

  /**
   * 获取单个路由配置
   */
  async getRouting(
    hostname: string,
    routingId: string,
    userId: string,
  ): Promise<BotModelRouting> {
    const bot = await this.getBotByHostname(hostname, userId);
    const routing = await this.botModelRoutingDbService.getById(routingId);

    if (!routing || routing.botId !== bot.id) {
      throw new NotFoundException(`Routing config not found: ${routingId}`);
    }

    return toContractRouting(routing);
  }

  /**
   * 创建路由配置
   */
  async createRouting(
    hostname: string,
    input: CreateRoutingConfigInput,
    userId: string,
  ): Promise<BotModelRouting> {
    const bot = await this.getBotByHostname(hostname, userId);

    // 验证配置中的 Provider Key
    await this.validateRoutingConfig(input.config, userId);

    // 从配置中提取路由类型
    const routingType = input.config.type as ModelRoutingType;

    const routing = await this.botModelRoutingDbService.create({
      bot: { connect: { id: bot.id } },
      routingType,
      name: input.name,
      config: input.config as Prisma.InputJsonValue,
      priority: input.priority ?? 100,
      isEnabled: true,
    });

    this.logger.info('Created model routing config', {
      botId: bot.id,
      routingId: routing.id,
      routingType,
      name: input.name,
    });

    return toContractRouting(routing);
  }

  /**
   * 更新路由配置
   */
  async updateRouting(
    hostname: string,
    routingId: string,
    input: UpdateRoutingConfigInput,
    userId: string,
  ): Promise<BotModelRouting> {
    const bot = await this.getBotByHostname(hostname, userId);
    const existing = await this.botModelRoutingDbService.getById(routingId);

    if (!existing || existing.botId !== bot.id) {
      throw new NotFoundException(`Routing config not found: ${routingId}`);
    }

    // 如果更新了配置，验证 Provider Key
    if (input.config) {
      await this.validateRoutingConfig(input.config, userId);
    }

    const updateData: Record<string, unknown> = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.config !== undefined) {
      updateData.config = input.config as unknown as Record<string, unknown>;
      updateData.routingType = input.config.type;
    }
    if (input.priority !== undefined) updateData.priority = input.priority;
    if (input.isEnabled !== undefined) updateData.isEnabled = input.isEnabled;

    const routing = await this.botModelRoutingDbService.update(
      { id: routingId },
      updateData,
    );

    this.logger.info('Updated model routing config', {
      botId: bot.id,
      routingId,
    });

    // 清除负载均衡状态缓存
    this.modelRouterService.clearLoadBalanceState(routingId);

    return toContractRouting(routing);
  }

  /**
   * 删除路由配置
   */
  async deleteRouting(
    hostname: string,
    routingId: string,
    userId: string,
  ): Promise<void> {
    const bot = await this.getBotByHostname(hostname, userId);
    const existing = await this.botModelRoutingDbService.getById(routingId);

    if (!existing || existing.botId !== bot.id) {
      throw new NotFoundException(`Routing config not found: ${routingId}`);
    }

    await this.botModelRoutingDbService.delete({ id: routingId });

    this.logger.info('Deleted model routing config', {
      botId: bot.id,
      routingId,
    });

    // 清除负载均衡状态缓存
    this.modelRouterService.clearLoadBalanceState(routingId);
  }

  /**
   * 测试路由配置
   */
  async testRouting(
    hostname: string,
    input: RoutingTestInput,
    userId: string,
  ): Promise<RoutingTestResult> {
    const bot = await this.getBotByHostname(hostname, userId);

    const result = await this.modelRouterService.testRoute({
      botId: bot.id,
      message: input.message,
      routingHint: input.routingHint,
    });

    return {
      selectedModel: result.model,
      selectedProvider: result.vendor,
      providerKeyId: result.providerKeyId,
      reason: result.reason,
      matchedRule: result.matchedRule,
    };
  }

  /**
   * 获取路由统计信息
   */
  async getRoutingStats(
    hostname: string,
    routingId: string,
    userId: string,
  ): Promise<RoutingStatistics> {
    const bot = await this.getBotByHostname(hostname, userId);
    const routing = await this.botModelRoutingDbService.getById(routingId);

    if (!routing || routing.botId !== bot.id) {
      throw new NotFoundException(`Routing config not found: ${routingId}`);
    }

    // 从路由配置中提取模型列表用于统计查询
    const models = this.extractModelsFromConfig(routing.config as unknown as RoutingConfig);

    // 从 BotUsageLog 获取统计信息
    const stats = await this.botUsageLogService.getRoutingStats(bot.id, { models });

    return {
      routingId,
      totalRequests: stats.totalRequests,
      successCount: stats.successCount,
      failureCount: stats.failureCount,
      avgLatencyMs: stats.avgLatencyMs,
      targetStats: stats.targetStats.map((s) => ({
        model: s.model,
        vendor: s.vendor,
        requestCount: s.requestCount,
        successRate: s.requestCount > 0 ? s.successCount / s.requestCount : 0,
        avgLatencyMs: s.avgLatencyMs,
      })),
    };
  }

  /**
   * 启用路由配置
   */
  async enableRouting(
    hostname: string,
    routingId: string,
    userId: string,
  ): Promise<BotModelRouting> {
    return this.updateRouting(hostname, routingId, { isEnabled: true }, userId);
  }

  /**
   * 禁用路由配置
   */
  async disableRouting(
    hostname: string,
    routingId: string,
    userId: string,
  ): Promise<BotModelRouting> {
    return this.updateRouting(hostname, routingId, { isEnabled: false }, userId);
  }

  /**
   * 获取 AI 推荐的路由配置
   * 根据 Bot 的 allowed_models 分析并生成推荐的路由规则
   */
  async suggestRouting(
    hostname: string,
    userId: string,
  ): Promise<RoutingSuggestionResult> {
    const bot = await this.getBotByHostname(hostname, userId);

    // Get all bot provider keys
    const { list: botProviderKeys } = await this.botProviderKeyService.list({
      botId: bot.id,
    });

    // Build provider details for suggestion service
    const providers: BotProviderDetail[] = await Promise.all(
      botProviderKeys.map(async (bpk) => {
        const providerKey = await this.providerKeyService.get({
          id: bpk.providerKeyId,
          createdById: userId,
        });

        return {
          id: bpk.id,
          providerKeyId: bpk.providerKeyId,
          vendor: (providerKey?.vendor || 'openai') as BotProviderDetail['vendor'],
          apiType: (providerKey?.apiType || null) as BotProviderDetail['apiType'],
          label: providerKey?.label || '',
          apiKeyMasked: '****',
          baseUrl: providerKey?.baseUrl || null,
          isPrimary: bpk.isPrimary,
          allowedModels: bpk.allowedModels,
          primaryModel: bpk.primaryModel,
          createdAt: bpk.createdAt,
        };
      }),
    );

    this.logger.info('Generating routing suggestions', {
      botId: bot.id,
      hostname,
      providerCount: providers.length,
    });

    return this.routingSuggestionService.generateSuggestions(providers);
  }

  /**
   * 根据 hostname 获取 Bot
   */
  private async getBotByHostname(
    hostname: string,
    userId: string,
  ): Promise<{ id: string }> {
    const bot = await this.botService.get({
      hostname,
      createdById: userId,
    });

    if (!bot) {
      throw new NotFoundException(`Bot not found: ${hostname}`);
    }

    return bot;
  }

  /**
   * 验证路由配置中的 Provider Key
   */
  private async validateRoutingConfig(
    config: RoutingConfig,
    userId: string,
  ): Promise<void> {
    const providerKeyIds = new Set<string>();

    // 收集所有 Provider Key ID
    switch (config.type) {
      case 'FUNCTION_ROUTE':
        for (const rule of config.rules) {
          providerKeyIds.add(rule.target.providerKeyId);
        }
        providerKeyIds.add(config.defaultTarget.providerKeyId);
        break;

      case 'LOAD_BALANCE':
        for (const target of config.targets) {
          providerKeyIds.add(target.providerKeyId);
        }
        break;

      case 'FAILOVER':
        providerKeyIds.add(config.primary.providerKeyId);
        for (const target of config.fallbackChain) {
          providerKeyIds.add(target.providerKeyId);
        }
        break;
    }

    // 验证所有 Provider Key 存在且属于当前用户
    for (const keyId of providerKeyIds) {
      const providerKey = await this.providerKeyService.get({
        id: keyId,
        createdById: userId,
      });

      if (!providerKey) {
        throw new NotFoundException(`Provider key not found: ${keyId}`);
      }
    }
  }

  /**
   * 从路由配置中提取模型列表
   */
  private extractModelsFromConfig(config: RoutingConfig): string[] {
    const models = new Set<string>();

    switch (config.type) {
      case 'FUNCTION_ROUTE':
        for (const rule of config.rules) {
          models.add(rule.target.model);
        }
        models.add(config.defaultTarget.model);
        break;

      case 'LOAD_BALANCE':
        for (const target of config.targets) {
          models.add(target.model);
        }
        break;

      case 'FAILOVER':
        models.add(config.primary.model);
        for (const target of config.fallbackChain) {
          models.add(target.model);
        }
        break;
    }

    return Array.from(models);
  }
}
