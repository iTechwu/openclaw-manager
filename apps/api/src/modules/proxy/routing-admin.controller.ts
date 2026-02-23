import { Controller, Inject } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { AdminAuth } from '@app/auth';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { CostTrackerService } from './services/cost-tracker.service';
import { ConfigurationService } from './services/configuration.service';
import { CapabilityTagMatchingService } from '../bot-api/services/capability-tag-matching.service';
import { MODEL_CATALOG_DATA } from '../../../scripts/model-catalog.data';
import { ComplexityClassifierService } from '@app/clients/internal/complexity-classifier';
import {
  ComplexityRoutingConfigService,
  ModelAvailabilityService,
  FallbackChainService,
  FallbackChainModelService,
  ModelCatalogService,
  CapabilityTagService,
  ModelCapabilityTagService,
} from '@app/db';
import { success, error, deleted } from '@/common/ts-rest/response.helper';
import { CommonErrorCode } from '@repo/contracts/errors';
import { routingAdminContract as c } from '@repo/contracts';

/**
 * RoutingAdminController - 混合架构路由配置管理 API
 * 使用 ts-rest + Zod-first 模式
 */
@Controller()
@AdminAuth()
export class RoutingAdminController {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly costTracker: CostTrackerService,
    private readonly configService: ConfigurationService,
    private readonly complexityClassifier: ComplexityClassifierService,
    private readonly complexityRoutingConfigDb: ComplexityRoutingConfigService,
    private readonly modelAvailabilityDb: ModelAvailabilityService,
    private readonly fallbackChainDb: FallbackChainService,
    private readonly fallbackChainModelDb: FallbackChainModelService,
    private readonly modelCatalogDb: ModelCatalogService,
    private readonly capabilityTagDb: CapabilityTagService,
    private readonly modelCapabilityTagDb: ModelCapabilityTagService,
    private readonly capabilityTagMatchingService: CapabilityTagMatchingService,
  ) {}

  // ============================================================================
  // 响应映射辅助方法（消除重复映射代码）
  // ============================================================================

  private mapComplexityRoutingConfig(config: any) {
    return {
      id: config.id,
      configId: config.configId,
      name: config.name,
      description: config.description,
      isEnabled: config.isEnabled,
      models: config.models,
      classifierModel: config.classifierModel,
      classifierVendor: config.classifierVendor,
      classifierBaseUrl: null,
      toolMinComplexity: config.toolMinComplexity,
      isBuiltin: config.isBuiltin,
      createdAt: config.createdAt.toISOString(),
      updatedAt: config.updatedAt.toISOString(),
    };
  }

  private mapFallbackChain(dbChain: any, chainModels: any[]) {
    return {
      id: dbChain.id,
      chainId: dbChain.chainId,
      name: dbChain.name,
      description: dbChain.description,
      models: dbChain.models,
      triggerStatusCodes: dbChain.triggerStatusCodes,
      triggerErrorTypes: dbChain.triggerErrorTypes,
      triggerTimeoutMs: dbChain.triggerTimeoutMs,
      maxRetries: dbChain.maxRetries,
      retryDelayMs: dbChain.retryDelayMs,
      preserveProtocol: dbChain.preserveProtocol,
      isActive: dbChain.isActive,
      isBuiltin: dbChain.isBuiltin,
      createdAt: dbChain.createdAt.toISOString(),
      updatedAt: dbChain.updatedAt.toISOString(),
      chainModels: chainModels.map((cm: any) => ({
        id: cm.id,
        modelCatalogId: cm.modelCatalogId,
        priority: cm.priority,
        protocolOverride: cm.protocolOverride,
        featuresOverride: cm.featuresOverride,
        model: cm.modelCatalog?.model,
        vendor: cm.modelCatalog?.vendor,
        displayName: cm.modelCatalog?.displayName ?? null,
        supportsExtendedThinking:
          cm.modelCatalog?.supportsExtendedThinking ?? false,
        supportsCacheControl: cm.modelCatalog?.supportsCacheControl ?? false,
        supportsVision: cm.modelCatalog?.supportsVision ?? false,
        supportsFunctionCalling:
          cm.modelCatalog?.supportsFunctionCalling ?? true,
      })),
    };
  }

  private mapModelCatalog(item: any) {
    return {
      id: item.id,
      model: item.model,
      vendor: item.vendor,
      displayName: item.displayName,
      description: item.description,
      inputPrice: Number(item.inputPrice),
      outputPrice: Number(item.outputPrice),
      cacheReadPrice: item.cacheReadPrice ? Number(item.cacheReadPrice) : null,
      cacheWritePrice: item.cacheWritePrice
        ? Number(item.cacheWritePrice)
        : null,
      thinkingPrice: item.thinkingPrice ? Number(item.thinkingPrice) : null,
      reasoningScore: item.reasoningScore,
      codingScore: item.codingScore,
      creativityScore: item.creativityScore,
      speedScore: item.speedScore,
      contextLength: item.contextLength,
      supportsExtendedThinking: item.supportsExtendedThinking,
      supportsCacheControl: item.supportsCacheControl,
      supportsVision: item.supportsVision,
      supportsFunctionCalling: item.supportsFunctionCalling,
      supportsStreaming: item.supportsStreaming,
      recommendedScenarios: null,
      isEnabled: item.isEnabled,
      isDeprecated: false,
      deprecationDate: null,
      priceUpdatedAt: item.updatedAt.toISOString(),
      notes: null,
      metadata: null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  // ============================================================================
  // 配置状态
  // ============================================================================

  @TsRestHandler(c.getConfigStatus)
  async getConfigStatus() {
    return tsRestHandler(c.getConfigStatus, async () => {
      return success(this.configService.getLoadStatus()) as any;
    });
  }

  @TsRestHandler(c.refreshConfig)
  async refreshConfig() {
    return tsRestHandler(c.refreshConfig, async () => {
      await this.configService.refreshConfigurations();
      return success({
        message: 'Configuration refreshed',
        status: this.configService.getLoadStatus(),
      }) as any;
    });
  }

  // ============================================================================
  // 能力标签管理
  // ============================================================================

  @TsRestHandler(c.getCapabilityTags)
  async getCapabilityTags() {
    return tsRestHandler(c.getCapabilityTags, async () => {
      const { list: tags } = await this.capabilityTagDb.list(
        {},
        { orderBy: { priority: 'desc' }, limit: 1000 },
      );
      return success({
        list: tags.map((tag) => ({
          id: tag.id,
          tagId: tag.tagId,
          name: tag.name,
          description: tag.description,
          category: tag.category,
          priority: tag.priority,
          requiredProtocol: tag.requiredProtocol,
          requiredSkills: tag.requiredSkills,
          requiredModels: tag.requiredModels,
          requiresExtendedThinking: tag.requiresExtendedThinking,
          requiresCacheControl: tag.requiresCacheControl,
          requiresVision: tag.requiresVision,
          maxCostPerMToken: tag.maxCostPerMToken
            ? Number(tag.maxCostPerMToken)
            : null,
          isActive: tag.isActive,
          isBuiltin: tag.isBuiltin ?? true,
          createdAt: tag.createdAt.toISOString(),
          updatedAt: tag.updatedAt.toISOString(),
        })),
      }) as any;
    });
  }

  @TsRestHandler(c.getCapabilityTag)
  async getCapabilityTag() {
    return tsRestHandler(c.getCapabilityTag, async ({ params }) => {
      const tag = await this.capabilityTagDb.getByTagId(params.tagId);
      if (!tag) {
        return error(CommonErrorCode.NotFound) as any;
      }
      return success(tag) as any;
    });
  }

  @TsRestHandler(c.createCapabilityTag)
  async createCapabilityTag() {
    return tsRestHandler(c.createCapabilityTag, async ({ body }) => {
      const existing = await this.capabilityTagDb.getByTagId(body.tagId);
      if (existing) {
        return error(CommonErrorCode.BadRequest, '标签已存在') as any;
      }
      const tag = await this.capabilityTagDb.create(body as any);
      await this.configService.refreshConfigurations();
      return success(tag) as any;
    });
  }

  @TsRestHandler(c.updateCapabilityTag)
  async updateCapabilityTag() {
    return tsRestHandler(c.updateCapabilityTag, async ({ params, body }) => {
      const existing = await this.capabilityTagDb.getById(params.id);
      if (!existing) {
        return error(CommonErrorCode.NotFound) as any;
      }
      const tag = await this.capabilityTagDb.update(
        { id: params.id },
        body as any,
      );
      await this.configService.refreshConfigurations();
      return success(tag) as any;
    });
  }

  @TsRestHandler(c.deleteCapabilityTag)
  async deleteCapabilityTag() {
    return tsRestHandler(c.deleteCapabilityTag, async ({ params }) => {
      const existing = await this.capabilityTagDb.getById(params.id);
      if (!existing) {
        return error(CommonErrorCode.NotFound) as any;
      }
      await this.capabilityTagDb.update({ id: params.id }, {
        isActive: false,
      } as any);
      await this.configService.refreshConfigurations();
      return deleted() as any;
    });
  }

  // ============================================================================
  // Fallback 链管理
  // ============================================================================

  @TsRestHandler(c.getFallbackChains)
  async getFallbackChains() {
    return tsRestHandler(c.getFallbackChains, async () => {
      const { list: dbChains } = await this.fallbackChainDb.list(
        { isDeleted: false },
        { orderBy: { createdAt: 'asc' }, limit: 1000 },
      );

      const result = [];
      for (const dbChain of dbChains) {
        const chainModels = await this.fallbackChainModelDb.listByChainId(
          dbChain.id,
        );
        result.push(this.mapFallbackChain(dbChain, chainModels));
      }

      return success({ list: result }) as any;
    });
  }

  @TsRestHandler(c.getFallbackChain)
  async getFallbackChain() {
    return tsRestHandler(c.getFallbackChain, async ({ params }) => {
      const chain = await this.fallbackChainDb.getByChainId(params.chainId);
      if (!chain) {
        return error(CommonErrorCode.NotFound) as any;
      }
      const chainModels = await this.fallbackChainModelDb.listByChainId(
        chain.id,
      );
      return success(this.mapFallbackChain(chain, chainModels)) as any;
    });
  }

  @TsRestHandler(c.createFallbackChain)
  async createFallbackChain() {
    return tsRestHandler(c.createFallbackChain, async ({ body }) => {
      const existing = await this.fallbackChainDb.getByChainId(body.chainId);
      if (existing) {
        return error(CommonErrorCode.BadRequest, 'Fallback 链已存在') as any;
      }
      const { chainModels, ...chainData } = body;
      const chain = await this.fallbackChainDb.create(chainData as any);

      // 创建关联的 chainModels
      if (chainModels?.length) {
        await this.fallbackChainModelDb.replaceChainModels(
          chain.id,
          chainModels.map((cm) => ({
            modelCatalogId: cm.modelCatalogId,
            priority: cm.priority ?? 0,
            protocolOverride: cm.protocolOverride,
            featuresOverride: cm.featuresOverride as any,
          })),
        );
      }

      await this.configService.refreshConfigurations();
      return success(chain) as any;
    });
  }

  @TsRestHandler(c.updateFallbackChain)
  async updateFallbackChain() {
    return tsRestHandler(c.updateFallbackChain, async ({ params, body }) => {
      const existing = await this.fallbackChainDb.getById(params.id);
      if (!existing) {
        return error(CommonErrorCode.NotFound) as any;
      }
      const { chainModels, ...chainData } = body;
      const chain = await this.fallbackChainDb.update(
        { id: params.id },
        chainData as any,
      );

      // 更新关联的 chainModels（如果提供了）
      if (chainModels !== undefined) {
        await this.fallbackChainModelDb.replaceChainModels(
          params.id,
          (chainModels ?? []).map((cm) => ({
            modelCatalogId: cm.modelCatalogId,
            priority: cm.priority ?? 0,
            protocolOverride: cm.protocolOverride,
            featuresOverride: cm.featuresOverride as any,
          })),
        );
      }

      await this.configService.refreshConfigurations();
      return success(chain) as any;
    });
  }

  @TsRestHandler(c.deleteFallbackChain)
  async deleteFallbackChain() {
    return tsRestHandler(c.deleteFallbackChain, async ({ params }) => {
      const existing = await this.fallbackChainDb.getById(params.id);
      if (!existing) {
        return error(CommonErrorCode.NotFound) as any;
      }
      // 先删除关联的 chainModels，再软删除 chain，避免孤儿记录
      await this.fallbackChainModelDb.deleteByChainId(params.id);
      await this.fallbackChainDb.update({ id: params.id }, {
        isDeleted: true,
      } as any);
      await this.configService.refreshConfigurations();
      return deleted() as any;
    });
  }

  // ============================================================================
  // 成本策略管理
  // ============================================================================

  @TsRestHandler(c.getCostStrategies)
  async getCostStrategies() {
    return tsRestHandler(c.getCostStrategies, async () => {
      const strategies = this.costTracker.getAllCostStrategies();
      const timestamp = new Date().toISOString();
      return success({
        list: strategies.map((strategy) => ({
          // 成本策略为内存数据，使用 strategyId 的确定性 UUID
          id: `00000000-0000-4000-8000-${Buffer.from(strategy.strategyId).toString('hex').slice(0, 12).padStart(12, '0')}`,
          ...strategy,
          description: null,
          isActive: true,
          isBuiltin: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        })),
      }) as any;
    });
  }

  @TsRestHandler(c.getCostStrategy)
  async getCostStrategy() {
    return tsRestHandler(c.getCostStrategy, async ({ params }) => {
      const strategy = this.costTracker.getCostStrategy(params.strategyId);
      if (!strategy) {
        return error(CommonErrorCode.NotFound) as any;
      }
      return success(strategy) as any;
    });
  }

  // ============================================================================
  // 复杂度路由配置管理
  // ============================================================================

  @TsRestHandler(c.getComplexityRoutingConfigs)
  async getComplexityRoutingConfigs() {
    return tsRestHandler(c.getComplexityRoutingConfigs, async () => {
      const { list: configs } = await this.complexityRoutingConfigDb.list(
        {},
        { orderBy: { createdAt: 'desc' }, limit: 100 },
      );
      return success({
        list: configs.map((config) => this.mapComplexityRoutingConfig(config)),
      }) as any;
    });
  }

  @TsRestHandler(c.getComplexityRoutingConfig)
  async getComplexityRoutingConfig() {
    return tsRestHandler(c.getComplexityRoutingConfig, async ({ params }) => {
      const config = await this.complexityRoutingConfigDb.getByConfigId(
        params.configId,
      );
      if (!config) {
        return error(CommonErrorCode.NotFound) as any;
      }
      return success(this.mapComplexityRoutingConfig(config)) as any;
    });
  }

  @TsRestHandler(c.createComplexityRoutingConfig)
  async createComplexityRoutingConfig() {
    return tsRestHandler(c.createComplexityRoutingConfig, async ({ body }) => {
      const config = (await this.complexityRoutingConfigDb.create({
        configId: body.configId,
        name: body.name,
        description: body.description,
        isEnabled: body.isEnabled ?? true,
        models: body.models,
        classifierModel: body.classifierModel || 'deepseek-v3-250324',
        classifierVendor: body.classifierVendor || 'deepseek',
        toolMinComplexity: body.toolMinComplexity,
      })) as any;

      await this.configService.refreshConfigurations();
      return success(this.mapComplexityRoutingConfig(config)) as any;
    });
  }

  @TsRestHandler(c.updateComplexityRoutingConfig)
  async updateComplexityRoutingConfig() {
    return tsRestHandler(
      c.updateComplexityRoutingConfig,
      async ({ params, body }) => {
        const existing = await this.complexityRoutingConfigDb.getById(
          params.id,
        );
        if (!existing) {
          return error(CommonErrorCode.NotFound) as any;
        }

        const config = await this.complexityRoutingConfigDb.update(
          { id: params.id },
          {
            name: body.name,
            description: body.description,
            isEnabled: body.isEnabled,
            models: body.models,
            classifierModel: body.classifierModel,
            classifierVendor: body.classifierVendor,
            toolMinComplexity: body.toolMinComplexity,
          },
        );

        await this.configService.refreshConfigurations();
        return success(this.mapComplexityRoutingConfig(config)) as any;
      },
    );
  }

  @TsRestHandler(c.deleteComplexityRoutingConfig)
  async deleteComplexityRoutingConfig() {
    return tsRestHandler(
      c.deleteComplexityRoutingConfig,
      async ({ params }) => {
        const existing = await this.complexityRoutingConfigDb.getById(
          params.id,
        );
        if (!existing) {
          return error(CommonErrorCode.NotFound) as any;
        }

        await this.complexityRoutingConfigDb.update(
          { id: params.id },
          { isDeleted: true },
        );
        await this.configService.refreshConfigurations();

        return deleted() as any;
      },
    );
  }

  @TsRestHandler(c.classifyComplexity)
  async classifyComplexity() {
    return tsRestHandler(c.classifyComplexity, async ({ body }) => {
      const result = (await this.complexityClassifier.classify({
        message: body.message,
        context: body.context,
        hasTools: body.hasTools,
      })) as any;
      return success(result) as any;
    });
  }

  // ============================================================================
  // 模型目录管理
  // ============================================================================

  @TsRestHandler(c.getModelCatalogList)
  async getModelCatalogList() {
    return tsRestHandler(c.getModelCatalogList, async () => {
      const catalogList = await this.modelCatalogDb.listAll();
      return success({
        list: catalogList.map((item) => this.mapModelCatalog(item)),
      }) as any;
    });
  }

  @TsRestHandler(c.getModelCatalog)
  async getModelCatalog() {
    return tsRestHandler(c.getModelCatalog, async ({ params }) => {
      const item = await this.modelCatalogDb.getByModel(params.model);
      if (!item) {
        return error(CommonErrorCode.NotFound) as any;
      }
      return success(this.mapModelCatalog(item)) as any;
    });
  }

  @TsRestHandler(c.createModelCatalog)
  async createModelCatalog() {
    return tsRestHandler(c.createModelCatalog, async ({ body }) => {
      const existing = await this.modelCatalogDb.getByModel(body.model);
      if (existing) {
        return error(CommonErrorCode.BadRequest, '模型已存在') as any;
      }
      const item = await this.modelCatalogDb.create(body as any);
      await this.configService.refreshConfigurations();
      return success(item) as any;
    });
  }

  @TsRestHandler(c.updateModelCatalog)
  async updateModelCatalog() {
    return tsRestHandler(c.updateModelCatalog, async ({ params, body }) => {
      const existing = await this.modelCatalogDb.getById(params.id);
      if (!existing) {
        return error(CommonErrorCode.NotFound) as any;
      }
      const item = await this.modelCatalogDb.update(
        { id: params.id },
        body as any,
      );
      await this.configService.refreshConfigurations();
      return success(item) as any;
    });
  }

  @TsRestHandler(c.deleteModelCatalog)
  async deleteModelCatalog() {
    return tsRestHandler(c.deleteModelCatalog, async ({ params }) => {
      const existing = await this.modelCatalogDb.getById(params.id);
      if (!existing) {
        return error(CommonErrorCode.NotFound) as any;
      }
      await this.modelCatalogDb.update({ id: params.id }, {
        isEnabled: false,
      } as any);
      await this.configService.refreshConfigurations();
      return deleted() as any;
    });
  }

  // ============================================================================
  // 成本计算
  // ============================================================================

  @TsRestHandler(c.calculateCost)
  async calculateCost() {
    return tsRestHandler(c.calculateCost, async ({ body }) => {
      const cost = this.costTracker.calculateCost(body.model, {
        inputTokens: body.inputTokens,
        outputTokens: body.outputTokens,
        thinkingTokens: body.thinkingTokens,
        cacheReadTokens: body.cacheReadTokens,
        cacheWriteTokens: body.cacheWriteTokens,
      }) as any;
      return success(cost) as any;
    });
  }

  // ============================================================================
  // Bot 使用量查询
  // ============================================================================

  @TsRestHandler(c.getBotUsage)
  async getBotUsage() {
    return tsRestHandler(c.getBotUsage, async ({ params }) => {
      const usage = this.costTracker.getBotUsage(params.botId);
      if (!usage) {
        return success({
          dailyCost: 0,
          monthlyCost: 0,
        }) as any;
      }
      return success(usage) as any;
    });
  }

  @TsRestHandler(c.checkBotBudget)
  async checkBotBudget() {
    return tsRestHandler(c.checkBotBudget, async ({ params, query }) => {
      const status = this.costTracker.checkBudgetStatus(
        params.botId,
        query.dailyLimit,
        query.monthlyLimit,
        query.alertThreshold ?? 0.8,
      );
      return success(status) as any;
    });
  }

  // ============================================================================
  // 模型选择
  // ============================================================================

  @TsRestHandler(c.selectOptimalModel)
  async selectOptimalModel() {
    return tsRestHandler(c.selectOptimalModel, async ({ body }) => {
      const model = this.costTracker.selectOptimalModel(
        body.strategyId,
        body.availableModels,
        body.scenario,
      );
      return success({
        selectedModel: model,
        strategy: body.strategyId,
        scenario: body.scenario,
      }) as any;
    });
  }

  // ============================================================================
  // 可用模型查询（路由配置用）
  // ============================================================================

  @TsRestHandler(c.getAvailableModelsForRouting)
  async getAvailableModelsForRouting() {
    return tsRestHandler(c.getAvailableModelsForRouting, async () => {
      const { list: models } = await this.modelAvailabilityDb.list(
        { isAvailable: true },
        { orderBy: { model: 'asc' }, limit: 1000 },
        {
          include: {
            providerKey: true,
            modelCatalog: true,
          },
        } as any,
      );

      const result = models.map((m: any) => ({
        id: m.id,
        model: m.model,
        vendor: m.providerKey?.vendor ?? 'unknown',
        displayName: m.modelCatalog?.displayName ?? null,
        apiType: m.providerKey?.apiType ?? null,
        modelType: m.modelType,
        isAvailable: m.isAvailable,
        lastVerifiedAt: m.lastVerifiedAt?.toISOString() ?? null,
        inputPrice: m.modelCatalog ? Number(m.modelCatalog.inputPrice) : null,
        outputPrice: m.modelCatalog ? Number(m.modelCatalog.outputPrice) : null,
        reasoningScore: m.modelCatalog?.reasoningScore ?? null,
        codingScore: m.modelCatalog?.codingScore ?? null,
        creativityScore: m.modelCatalog?.creativityScore ?? null,
        speedScore: m.modelCatalog?.speedScore ?? null,
        supportsExtendedThinking:
          m.modelCatalog?.supportsExtendedThinking ?? false,
        supportsCacheControl: m.modelCatalog?.supportsCacheControl ?? false,
        supportsVision: m.modelCatalog?.supportsVision ?? false,
        supportsFunctionCalling:
          m.modelCatalog?.supportsFunctionCalling ?? true,
        capabilityTags: [],
      }));

      return success({ list: result }) as any;
    });
  }

  // ============================================================================
  // 自动同步
  // ============================================================================

  @TsRestHandler(c.syncModelCatalog)
  async syncModelCatalog() {
    return tsRestHandler(c.syncModelCatalog, async () => {
      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const data of MODEL_CATALOG_DATA) {
        try {
          const catalogFields = {
            vendor: data.vendor,
            inputPrice: data.inputPrice,
            outputPrice: data.outputPrice,
            displayName: data.displayName,
            cacheReadPrice: data.cacheReadPrice,
            cacheWritePrice: data.cacheWritePrice,
            thinkingPrice: data.thinkingPrice,
            reasoningScore: data.reasoningScore ?? 50,
            codingScore: data.codingScore ?? 50,
            creativityScore: data.creativityScore ?? 50,
            speedScore: data.speedScore ?? 50,
            contextLength: data.contextLength ?? 128000,
            supportsExtendedThinking: data.supportsExtendedThinking ?? false,
            supportsCacheControl: data.supportsCacheControl ?? false,
            supportsVision: data.supportsVision ?? false,
            supportsFunctionCalling: data.supportsFunctionCalling ?? true,
            supportsStreaming: data.supportsStreaming ?? true,
          };

          const existing = await this.modelCatalogDb.getByModel(data.model);
          if (existing) {
            await this.modelCatalogDb.update(
              { id: existing.id },
              catalogFields as any,
            );
            updated++;
          } else {
            await this.modelCatalogDb.create({
              model: data.model,
              ...catalogFields,
            } as any);
            created++;
          }
        } catch (e) {
          this.logger.warn(`Failed to sync model catalog: ${data.model}`, {
            error: e,
          });
          skipped++;
        }
      }

      await this.configService.refreshConfigurations();
      return success({ created, updated, skipped }) as any;
    });
  }

  @TsRestHandler(c.syncCapabilityTags)
  async syncCapabilityTags() {
    return tsRestHandler(c.syncCapabilityTags, async ({ body }) => {
      let processed = 0;
      let tagsAssigned = 0;

      if (body?.modelCatalogId) {
        // 同步单个模型的标签
        const catalog = await this.modelCatalogDb.getById(body.modelCatalogId);
        if (catalog) {
          const count =
            await this.capabilityTagMatchingService.assignTagsToModelCatalog(
              catalog.id,
              catalog.model,
              catalog.vendor,
            );
          processed = 1;
          tagsAssigned = count;
        }
      } else {
        // 同步所有模型的标签
        const catalogList = await this.modelCatalogDb.listAll();
        for (const catalog of catalogList) {
          try {
            const count =
              await this.capabilityTagMatchingService.assignTagsToModelCatalog(
                catalog.id,
                catalog.model,
                catalog.vendor,
              );
            processed++;
            tagsAssigned += count;
          } catch (e) {
            this.logger.warn(`Failed to sync tags for: ${catalog.model}`, {
              error: e,
            });
          }
        }
      }

      await this.configService.refreshConfigurations();
      return success({ processed, tagsAssigned }) as any;
    });
  }

  @TsRestHandler(c.getModelCatalogTags)
  async getModelCatalogTags() {
    return tsRestHandler(c.getModelCatalogTags, async ({ params }) => {
      const catalog = await this.modelCatalogDb.getById(params.id);
      if (!catalog) {
        return error(CommonErrorCode.NotFound) as any;
      }

      const { list: tags } = await this.modelCapabilityTagDb.list(
        { modelCatalogId: params.id },
        { limit: 100 },
        { include: { capabilityTag: true } } as any,
      );

      return success({
        list: tags.map((t: any) => ({
          id: t.id,
          capabilityTagId: t.capabilityTagId,
          tagId: t.capabilityTag?.tagId ?? '',
          name: t.capabilityTag?.name ?? 'Unknown',
          matchSource: t.matchSource,
          confidence: t.confidence,
        })),
      }) as any;
    });
  }

  @TsRestHandler(c.addModelCatalogTag)
  async addModelCatalogTag() {
    return tsRestHandler(c.addModelCatalogTag, async ({ params, body }) => {
      const catalog = await this.modelCatalogDb.getById(params.id);
      if (!catalog) {
        return error(CommonErrorCode.NotFound) as any;
      }

      try {
        await this.capabilityTagMatchingService.addManualTag(
          params.id,
          body.capabilityTagId,
        );
      } catch (e) {
        if (e instanceof Error && e.message.includes('Unique constraint')) {
          return error(CommonErrorCode.BadRequest, '该标签已存在') as any;
        }
        throw e;
      }

      return success({ message: 'ok' }) as any;
    });
  }

  @TsRestHandler(c.removeModelCatalogTag)
  async removeModelCatalogTag() {
    return tsRestHandler(c.removeModelCatalogTag, async ({ params }) => {
      const catalog = await this.modelCatalogDb.getById(params.id);
      if (!catalog) {
        return error(CommonErrorCode.NotFound) as any;
      }

      await this.capabilityTagMatchingService.removeTag(
        params.id,
        params.capabilityTagId,
      );

      return success({ message: 'ok' }) as any;
    });
  }
}
