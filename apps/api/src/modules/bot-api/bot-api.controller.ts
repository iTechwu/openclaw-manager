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
} from '@repo/contracts/api';
import { success, created } from '@/common/ts-rest/response.helper';
import { BotApiService } from './bot-api.service';
import { BotUsageAnalyticsService } from './services/bot-usage-analytics.service';
import { BotSseService } from './services/bot-sse.service';
import { AuthenticatedRequest, Auth, SseAuth, AdminAuth } from '@app/auth';
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
  // Bot Provider Management
  // ============================================================================

  @TsRestHandler(bc.getProviders)
  async getBotProviders(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(bc.getProviders, async ({ params }) => {
      const userId = req.userId;
      const providers = await this.botApiService.getBotProviders(
        params.hostname,
        userId,
      );
      return success({ providers });
    });
  }

  @TsRestHandler(bc.addProvider)
  async addBotProvider(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(bc.addProvider, async ({ params, body }) => {
      const userId = req.userId;
      const provider = await this.botApiService.addBotProvider(
        params.hostname,
        userId,
        body,
      );
      return created(provider);
    });
  }

  @TsRestHandler(bc.removeProvider)
  async removeBotProvider(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(bc.removeProvider, async ({ params }) => {
      const userId = req.userId;
      const result = await this.botApiService.removeBotProvider(
        params.hostname,
        userId,
        params.keyId,
      );
      return success(result);
    });
  }

  @TsRestHandler(bc.setPrimaryModel)
  async setBotPrimaryModel(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(bc.setPrimaryModel, async ({ params, body }) => {
      const userId = req.userId;
      const result = await this.botApiService.setBotPrimaryModel(
        params.hostname,
        userId,
        params.keyId,
        body.modelId,
      );
      return success(result);
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
