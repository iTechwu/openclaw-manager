import {
  Controller,
  Get,
  MessageEvent,
  Req,
  Sse,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import {
  botContract as bc,
  providerKeyContract as pkc,
  botUsageContract as buc,
  modelContract as mc,
  botModelContract as bmc,
} from '@repo/contracts/api';
import { success, created } from '@/common/ts-rest/response.helper';
import { BotApiService } from './bot-api.service';
import { BotUsageAnalyticsService } from './services/bot-usage-analytics.service';
import { BotSseService } from './services/bot-sse.service';
import { AvailableModelService } from './services/available-model.service';
import { ModelVerificationService } from './services/model-verification.service';
import { CapabilityTagMatchingService } from './services/capability-tag-matching.service';
import { ModelSyncService } from './services/model-sync.service';
import { AuthenticatedRequest, Auth, SseAuth, AdminAuth } from '@app/auth';
import { CapabilityTagService, ModelCapabilityTagService } from '@app/db';
import type { Observable } from 'rxjs';

/**
 * Bot API 控制器
 *
 * 提供 Bot 管理相关的 API 端点，包括：
 * - Bot CRUD 操作
 * - Bot 生命周期管理（启动、停止）
 * - 容器统计和诊断
 * - Provider Key 管理
 */
@Controller({
  version: VERSION_NEUTRAL,
})
@Auth()
export class BotApiController {
  constructor(
    private readonly botApiService: BotApiService,
    private readonly usageAnalyticsService: BotUsageAnalyticsService,
    private readonly sseService: BotSseService,
    private readonly availableModelService: AvailableModelService,
    private readonly modelVerificationService: ModelVerificationService,
    private readonly capabilityTagMatchingService: CapabilityTagMatchingService,
    private readonly modelSyncService: ModelSyncService,
    private readonly capabilityTagService: CapabilityTagService,
    private readonly modelCapabilityTagService: ModelCapabilityTagService,
  ) {}

  // ============================================================================
  // Bot CRUD
  // ============================================================================

  @TsRestHandler(bc.list)
  async listBots(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(bc.list, async () => {
      const userId = req.userId;
      const bots = await this.botApiService.listBots(userId);
      return success({ bots });
    });
  }

  @TsRestHandler(bc.getByHostname)
  async getBotByHostname(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(bc.getByHostname, async ({ params }) => {
      const userId = req.userId;
      const bot = await this.botApiService.getBotByHostname(
        params.hostname,
        userId,
      );
      return success(bot);
    });
  }

  @TsRestHandler(bc.create)
  async createBot(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(bc.create, async ({ body }) => {
      const userId = req.userId;
      const bot = await this.botApiService.createBot(body, userId);
      return created(bot);
    });
  }

  @TsRestHandler(bc.createSimple)
  async createBotSimple(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(bc.createSimple, async ({ body }) => {
      const userId = req.userId;
      const bot = await this.botApiService.createBotSimple(body, userId);
      return created(bot);
    });
  }

  @TsRestHandler(bc.delete)
  async deleteBot(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(bc.delete, async ({ params }) => {
      const userId = req.userId;
      await this.botApiService.deleteBot(params.hostname, userId);
      return success({ success: true });
    });
  }

  @TsRestHandler(bc.update)
  async updateBot(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(bc.update, async ({ params, body }) => {
      const userId = req.userId;
      const bot = await this.botApiService.updateBot(
        params.hostname,
        userId,
        body,
      );
      return success(bot);
    });
  }

  @TsRestHandler(bc.applyPendingConfig)
  async applyPendingConfig(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(bc.applyPendingConfig, async ({ params }) => {
      const userId = req.userId;
      const result = await this.botApiService.applyPendingConfig(
        params.hostname,
        userId,
      );
      return success(result);
    });
  }

  @TsRestHandler(bc.clearPendingConfig)
  async clearPendingConfig(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(bc.clearPendingConfig, async ({ params }) => {
      const userId = req.userId;
      await this.botApiService.clearPendingConfig(params.hostname, userId);
      return success({ success: true });
    });
  }

  // ============================================================================
  // Bot Lifecycle
  // ============================================================================

  @TsRestHandler(bc.start)
  async startBot(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(bc.start, async ({ params }) => {
      const userId = req.userId;
      const result = await this.botApiService.startBot(params.hostname, userId);
      return success(result);
    });
  }

  @TsRestHandler(bc.stop)
  async stopBot(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(bc.stop, async ({ params }) => {
      const userId = req.userId;
      const result = await this.botApiService.stopBot(params.hostname, userId);
      return success(result);
    });
  }

  // ============================================================================
  // Container Diagnostics (Admin Only)
  // ============================================================================

  @TsRestHandler(bc.getStats)
  @AdminAuth()
  async getStats(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(bc.getStats, async () => {
      const userId = req.userId;
      const stats = await this.botApiService.getContainerStats(userId);
      return success({ stats });
    });
  }

  @TsRestHandler(bc.getOrphans)
  @AdminAuth()
  async getOrphans(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(bc.getOrphans, async () => {
      const userId = req.userId;
      const orphanReport = await this.botApiService.getOrphanReport(userId);
      return success(orphanReport);
    });
  }

  @TsRestHandler(bc.cleanup)
  @AdminAuth()
  async cleanup(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(bc.cleanup, async () => {
      const userId = req.userId;
      const cleanupReport = await this.botApiService.cleanupOrphans(userId);
      return success(cleanupReport);
    });
  }

  // ============================================================================
  // Bot Diagnostics
  // ============================================================================

  @TsRestHandler(bc.diagnose)
  async diagnoseBot(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(bc.diagnose, async ({ params, body }) => {
      const userId = req.userId;
      const result = await this.botApiService.diagnoseBot(
        params.hostname,
        userId,
        body.checks,
      );
      return success(result);
    });
  }

  // ============================================================================
  // Bot Logs
  // ============================================================================

  @TsRestHandler(bc.getLogs)
  async getBotLogs(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(bc.getLogs, async ({ params, query }) => {
      const userId = req.userId;
      const result = await this.botApiService.getBotLogs(
        params.hostname,
        userId,
        query,
      );
      return success(result);
    });
  }

  // ============================================================================
  // Provider Key Management
  // ============================================================================

  @TsRestHandler(pkc.list)
  async listProviderKeys(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(pkc.list, async () => {
      const userId = req.userId;
      const keys = await this.botApiService.listProviderKeys(userId);
      return success({ keys });
    });
  }

  @TsRestHandler(pkc.add)
  @AdminAuth()
  async addProviderKey(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(pkc.add, async ({ body }) => {
      const userId = req.userId;
      const result = await this.botApiService.addProviderKey(body, userId);
      return created(result);
    });
  }

  @TsRestHandler(pkc.delete)
  @AdminAuth()
  async deleteProviderKey(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(pkc.delete, async ({ params }) => {
      const userId = req.userId;
      const result = await this.botApiService.deleteProviderKey(
        params.id,
        userId,
      );
      return success(result);
    });
  }

  @TsRestHandler(pkc.health)
  async getProviderKeyHealth(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(pkc.health, async () => {
      const userId = req.userId;
      const health = await this.botApiService.getProviderKeyHealth(userId);
      return success(health);
    });
  }

  @TsRestHandler(pkc.verify)
  async verifyProviderKey(): Promise<any> {
    return tsRestHandler(pkc.verify, async ({ body }) => {
      const result = await this.botApiService.verifyProviderKey(body);
      return success(result);
    });
  }

  @TsRestHandler(pkc.getModels)
  async getProviderKeyModels(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(pkc.getModels, async ({ params }) => {
      const userId = req.userId;
      const result = await this.botApiService.getProviderKeyModels(
        params.id,
        userId,
      );
      return success(result);
    });
  }

  // ============================================================================
  // Bot Usage Analytics
  // ============================================================================

  @TsRestHandler(buc.getStats)
  async getUsageStats(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(buc.getStats, async ({ params, query }) => {
      const userId = req.userId;
      const stats = await this.usageAnalyticsService.getStats(
        userId,
        params.hostname,
        query,
      );
      return success(stats);
    });
  }

  @TsRestHandler(buc.getTrend)
  async getUsageTrend(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(buc.getTrend, async ({ params, query }) => {
      const userId = req.userId;
      const trend = await this.usageAnalyticsService.getTrend(
        userId,
        params.hostname,
        query,
      );
      return success(trend);
    });
  }

  @TsRestHandler(buc.getBreakdown)
  async getUsageBreakdown(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(buc.getBreakdown, async ({ params, query }) => {
      const userId = req.userId;
      const breakdown = await this.usageAnalyticsService.getBreakdown(
        userId,
        params.hostname,
        query,
      );
      return success(breakdown);
    });
  }

  @TsRestHandler(buc.getLogs)
  async getUsageLogs(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(buc.getLogs, async ({ params, query }) => {
      const userId = req.userId;
      const logs = await this.usageAnalyticsService.getLogs(
        userId,
        params.hostname,
        query,
      );
      return success(logs);
    });
  }

  // ============================================================================
  // Model Management (面向用户的模型管理，隐藏 Provider 细节)
  // ============================================================================

  /**
   * GET /model - 获取所有可用模型列表
   */
  @TsRestHandler(mc.list)
  async listAvailableModels(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(mc.list, async () => {
      // 管理员可以看到 Provider 信息
      const includeProviderInfo = req.isAdmin === true;
      const list =
        await this.availableModelService.getAvailableModels(
          includeProviderInfo,
        );
      return success({ list });
    });
  }

  /**
   * GET /model/availability - 获取 ModelAvailability 列表
   * 仅限管理员访问
   */
  @TsRestHandler(mc.getAvailability)
  @AdminAuth()
  async getModelAvailability(): Promise<any> {
    return tsRestHandler(mc.getAvailability, async ({ query }) => {
      const list = await this.modelVerificationService.getAllModelAvailability(
        query?.providerKeyId,
      );
      return success({ list });
    });
  }

  /**
   * POST /model/refresh - 刷新模型列表
   * 从 Provider 端点获取最新的模型列表并写入 ModelAvailability（不进行验证）
   * 仅限管理员访问
   */
  @TsRestHandler(mc.refresh)
  @AdminAuth()
  async refreshModels(): Promise<any> {
    return tsRestHandler(mc.refresh, async ({ body }) => {
      const result = await this.modelVerificationService.refreshModels(
        body.providerKeyId,
      );
      return success(result);
    });
  }

  /**
   * POST /model/verify - 验证单个模型可用性
   * 通过实际调用模型 API 验证单个模型是否可用
   * 仅限管理员访问
   */
  @TsRestHandler(mc.verify)
  @AdminAuth()
  async verifySingleModel(): Promise<any> {
    return tsRestHandler(mc.verify, async ({ body }) => {
      const result = await this.modelVerificationService.verifySingleModel(
        body.providerKeyId,
        body.model,
      );
      return success(result);
    });
  }

  /**
   * POST /model/batch-verify - 批量验证未验证的模型
   * 增量验证：只验证 errorMessage 为 'Not verified yet' 的模型
   * 仅限管理员访问
   */
  @TsRestHandler(mc.batchVerify)
  @AdminAuth()
  async batchVerifyModels(): Promise<any> {
    return tsRestHandler(mc.batchVerify, async ({ body }) => {
      const result = await this.modelVerificationService.batchVerifyUnverified(
        body.providerKeyId,
      );
      return success(result);
    });
  }

  /**
   * POST /model/refresh-all - 刷新所有 ProviderKeys 的模型列表
   * 遍历所有 ProviderKeys，从各自的端点获取最新的模型列表（不进行验证）
   * 仅限管理员访问
   */
  @TsRestHandler(mc.refreshAll)
  @AdminAuth()
  async refreshAllModels(): Promise<any> {
    return tsRestHandler(mc.refreshAll, async () => {
      const result = await this.modelVerificationService.refreshAllModels();
      return success(result);
    });
  }

  /**
   * POST /model/batch-verify-all - 批量验证所有不可用的模型
   * 遍历所有 ProviderKeys，验证 isAvailable=false 的模型
   * 仅限管理员访问
   */
  @TsRestHandler(mc.batchVerifyAll)
  @AdminAuth()
  async batchVerifyAllModels(): Promise<any> {
    return tsRestHandler(mc.batchVerifyAll, async () => {
      const result =
        await this.modelVerificationService.batchVerifyAllUnavailable();
      return success(result);
    });
  }

  // ============================================================================
  // Capability Tag Management (管理员)
  // ============================================================================

  /**
   * GET /model/capability-tags - 获取所有能力标签
   * 返回系统中所有可用的能力标签
   * 仅限管理员访问
   */
  @TsRestHandler(mc.getCapabilityTags)
  @AdminAuth()
  async getCapabilityTags(): Promise<any> {
    return tsRestHandler(mc.getCapabilityTags, async () => {
      const { list } = await this.capabilityTagService.list(
        { isActive: true, isDeleted: false },
        { limit: 100 },
      );
      return success({
        list: list.map((tag) => ({
          id: tag.id,
          tagId: tag.tagId,
          name: tag.name,
          description: tag.description,
          isActive: tag.isActive,
        })),
      });
    });
  }

  /**
   * GET /model/:modelCatalogId/tags - 获取模型的能力标签
   * 返回指定模型的所有能力标签关联
   * 仅限管理员访问
   */
  @TsRestHandler(mc.getModelTags)
  @AdminAuth()
  async getModelTags(): Promise<any> {
    return tsRestHandler(mc.getModelTags, async ({ params }) => {
      const { list } = await this.modelCapabilityTagService.list(
        { modelCatalogId: params.modelCatalogId },
        { limit: 100 },
        {
          select: {
            id: true,
            modelCatalogId: true,
            capabilityTagId: true,
            matchSource: true,
            confidence: true,
            createdAt: true,
            capabilityTag: { select: { tagId: true } },
          },
        },
      );
      return success({
        list: list.map((item) => ({
          id: item.id,
          modelCatalogId: item.modelCatalogId,
          capabilityTagId: item.capabilityTagId,
          tagId:
            (item as { capabilityTag?: { tagId: string } }).capabilityTag
              ?.tagId || '',
          matchSource: item.matchSource as
            | 'pattern'
            | 'feature'
            | 'scenario'
            | 'manual',
          confidence: item.confidence,
          createdAt: item.createdAt,
        })),
      });
    });
  }

  /**
   * POST /model/tags - 为模型添加能力标签
   * 手动为模型添加能力标签
   * 仅限管理员访问
   */
  @TsRestHandler(mc.addModelTag)
  @AdminAuth()
  async addModelTag(): Promise<any> {
    return tsRestHandler(mc.addModelTag, async ({ body }) => {
      await this.capabilityTagMatchingService.addManualTag(
        body.modelCatalogId,
        body.capabilityTagId,
      );
      return success({ success: true });
    });
  }

  /**
   * DELETE /model/tags - 移除模型的能力标签
   * 移除模型的指定能力标签
   * 仅限管理员访问
   */
  @TsRestHandler(mc.removeModelTag)
  @AdminAuth()
  async removeModelTag(): Promise<any> {
    return tsRestHandler(mc.removeModelTag, async ({ body }) => {
      await this.capabilityTagMatchingService.removeTag(
        body.modelCatalogId,
        body.capabilityTagId,
      );
      return success({ success: true });
    });
  }

  // ============================================================================
  // Model Sync Management (管理员)
  // ============================================================================

  /**
   * GET /model/sync-status - 获取模型同步状态
   * 返回模型定价和标签的同步状态概览
   * 仅限管理员访问
   */
  @TsRestHandler(mc.getSyncStatus)
  @AdminAuth()
  async getSyncStatus(): Promise<any> {
    return tsRestHandler(mc.getSyncStatus, async () => {
      const status = await this.modelSyncService.getSyncStatus();
      return success(status);
    });
  }

  /**
   * POST /model/sync-pricing - 同步模型定价信息
   * 从 ModelPricing 表查找匹配的定价并关联到 ModelAvailability
   * 仅限管理员访问
   */
  @TsRestHandler(mc.syncPricing)
  @AdminAuth()
  async syncPricing(): Promise<any> {
    return tsRestHandler(mc.syncPricing, async ({ body }) => {
      if (body?.modelAvailabilityId) {
        await this.modelSyncService.syncModelPricing(body.modelAvailabilityId);
        return success({ synced: 1, skipped: 0, errors: [] });
      }
      const result = await this.modelSyncService.syncAllPricing();
      return success(result);
    });
  }

  /**
   * POST /model/sync-tags - 重新分配能力标签
   * 根据匹配规则重新分配所有模型的能力标签
   * 仅限管理员访问
   */
  @TsRestHandler(mc.syncTags)
  @AdminAuth()
  async syncTags(): Promise<any> {
    return tsRestHandler(mc.syncTags, async ({ body }) => {
      if (body?.modelCatalogId) {
        await this.modelSyncService.reassignModelCapabilityTags(
          body.modelCatalogId,
        );
        return success({ processed: 1, tagsAssigned: 1, errors: [] });
      }
      const result = await this.modelSyncService.reassignAllCapabilityTags();
      return success(result);
    });
  }

  /**
   * POST /model/refresh-with-sync - 刷新模型并同步定价和标签
   * 刷新模型列表后自动同步定价和能力标签
   * 仅限管理员访问
   */
  @TsRestHandler(mc.refreshWithSync)
  @AdminAuth()
  async refreshWithSync(): Promise<any> {
    return tsRestHandler(mc.refreshWithSync, async ({ body }) => {
      // 1. 刷新模型列表
      const refreshResult = await this.modelVerificationService.refreshModels(
        body.providerKeyId,
      );

      // 2. 同步定价
      const pricingResult = await this.modelSyncService.syncAllPricing();

      // 3. 同步能力标签
      const tagsResult =
        await this.modelSyncService.reassignAllCapabilityTags();

      return success({
        refresh: refreshResult,
        pricingSync: pricingResult,
        tagsSync: tagsResult,
      });
    });
  }

  /**
   * GET /model/:id/details - 获取模型详情
   * 返回模型的完整信息，包括定价、能力标签、关联的路由配置等
   * 仅限管理员访问
   */
  @TsRestHandler(mc.getModelDetails)
  @AdminAuth()
  async getModelDetails(): Promise<any> {
    return tsRestHandler(mc.getModelDetails, async ({ params }) => {
      const details = await this.availableModelService.getModelDetails(
        params.id,
      );
      if (!details) {
        return {
          status: 404,
          body: {
            code: 404,
            msg: 'Model not found',
            data: { error: 'Model not found' },
          },
        };
      }
      return success(details as any);
    });
  }

  /**
   * GET /bot/:hostname/models - 获取 Bot 的模型列表
   */
  @TsRestHandler(bmc.list)
  async getBotModels(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(bmc.list, async ({ params }) => {
      const userId = req.userId;
      const bot = await this.botApiService.getBotByHostname(
        params.hostname,
        userId,
      );
      const list = await this.availableModelService.getBotModels(bot.id);
      return success({ list });
    });
  }

  /**
   * PUT /bot/:hostname/models - 更新 Bot 的模型配置
   */
  @TsRestHandler(bmc.update)
  async updateBotModels(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(bmc.update, async ({ params, body }) => {
      const userId = req.userId;
      const bot = await this.botApiService.getBotByHostname(
        params.hostname,
        userId,
      );
      await this.availableModelService.updateBotModels(
        bot.id,
        body.models,
        body.primaryModel,
      );
      return success({ success: true });
    });
  }

  /**
   * POST /bot/:hostname/models/add - 批量添加模型到 Bot
   */
  @TsRestHandler(bmc.addModels)
  async addBotModels(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(bmc.addModels, async ({ params, body }) => {
      const userId = req.userId;
      const bot = await this.botApiService.getBotByHostname(
        params.hostname,
        userId,
      );
      const result = await this.availableModelService.addModelsByAvailabilityIds(
        bot.id,
        body.modelAvailabilityIds,
        body.primaryModelAvailabilityId,
      );
      // 检查并更新 Bot 状态（从 draft 到 created）
      await this.botApiService.checkAndUpdateBotStatus(bot.id);
      return created(result);
    });
  }

  /**
   * DELETE /bot/:hostname/models/:modelAvailabilityId - 从 Bot 移除模型
   */
  @TsRestHandler(bmc.removeModel)
  async removeBotModel(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(bmc.removeModel, async ({ params }) => {
      const userId = req.userId;
      const bot = await this.botApiService.getBotByHostname(
        params.hostname,
        userId,
      );
      await this.availableModelService.removeModelByAvailabilityId(
        bot.id,
        params.modelAvailabilityId,
      );
      return success({ success: true });
    });
  }

  // ============================================================================
  // Real-time Status Stream (SSE) - 已迁移到 SseApiModule
  // ============================================================================
  // SSE 端点已迁移到 /api/sse/bot/status-stream
  // 请使用 SseApiController 中的端点
  // 保留此端点用于向后兼容，将在未来版本中移除

  /**
   * @deprecated 请使用 /api/sse/bot/status-stream
   * SSE 端点：实时推送 Bot 状态变更
   */
  @Get('bot/status-stream')
  @SseAuth()
  @Sse()
  statusStream(@Req() req: AuthenticatedRequest): Observable<MessageEvent> {
    const userId = req.userId;
    return this.sseService.getUserStream(userId);
  }
}
