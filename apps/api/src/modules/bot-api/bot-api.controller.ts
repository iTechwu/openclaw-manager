import { Controller, Req, VERSION_NEUTRAL } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import {
  botContract as bc,
  providerKeyContract as pkc,
} from '@repo/contracts/api';
import { success, created } from '@/common/ts-rest/response.helper';
import { BotApiService } from './bot-api.service';
import { AuthenticatedRequest, Auth } from '@app/auth';

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
  constructor(private readonly botApiService: BotApiService) {}

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

  @TsRestHandler(bc.delete)
  async deleteBot(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(bc.delete, async ({ params }) => {
      const userId = req.userId;
      await this.botApiService.deleteBot(params.hostname, userId);
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
  // Diagnostics (TODO: Implement)
  // ============================================================================

  @TsRestHandler(bc.getStats)
  async getStats(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(bc.getStats, async () => {
      const userId = req.userId;
      const stats = await this.botApiService.getContainerStats(userId);
      return success({ stats });
    });
  }

  @TsRestHandler(bc.getOrphans)
  async getOrphans(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(bc.getOrphans, async () => {
      const userId = req.userId;
      const orphanReport = await this.botApiService.getOrphanReport(userId);
      return success(orphanReport);
    });
  }

  @TsRestHandler(bc.cleanup)
  async cleanup(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(bc.cleanup, async () => {
      const userId = req.userId;
      const cleanupReport = await this.botApiService.cleanupOrphans(userId);
      return success(cleanupReport);
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
  async addProviderKey(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(pkc.add, async ({ body }) => {
      const userId = req.userId;
      const result = await this.botApiService.addProviderKey(body, userId);
      return created(result);
    });
  }

  @TsRestHandler(pkc.delete)
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
}
