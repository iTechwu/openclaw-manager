import { Controller, Req } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { modelRoutingContract } from '@repo/contracts';
import { Auth, AuthenticatedRequest } from '@app/auth';
import { success, created } from '@/common/ts-rest/response.helper';
import { ModelRoutingService } from './model-routing.service';

const c = modelRoutingContract;

/**
 * ModelRoutingController
 * 模型路由配置 API 控制器
 */
@Controller()
@Auth()
export class ModelRoutingController {
  constructor(private readonly modelRoutingService: ModelRoutingService) {}

  /**
   * GET /bot/:hostname/routing - 获取 Bot 的所有路由配置
   */
  @TsRestHandler(c.list)
  async list(@Req() req: AuthenticatedRequest) {
    return tsRestHandler(c.list, async ({ params }) => {
      const { userId } = req;
      const routings = await this.modelRoutingService.listRoutings(
        params.hostname,
        userId,
      );
      return success({ routings });
    });
  }

  /**
   * GET /bot/:hostname/routing/:routingId - 获取单个路由配置
   */
  @TsRestHandler(c.get)
  async get(@Req() req: AuthenticatedRequest) {
    return tsRestHandler(c.get, async ({ params }) => {
      const { userId } = req;
      const routing = await this.modelRoutingService.getRouting(
        params.hostname,
        params.routingId,
        userId,
      );
      return success(routing);
    });
  }

  /**
   * POST /bot/:hostname/routing - 创建路由配置
   */
  @TsRestHandler(c.create)
  async create(@Req() req: AuthenticatedRequest) {
    return tsRestHandler(c.create, async ({ params, body }) => {
      const { userId } = req;
      const routing = await this.modelRoutingService.createRouting(
        params.hostname,
        body,
        userId,
      );
      return created(routing);
    });
  }

  /**
   * PATCH /bot/:hostname/routing/:routingId - 更新路由配置
   */
  @TsRestHandler(c.update)
  async update(@Req() req: AuthenticatedRequest) {
    return tsRestHandler(c.update, async ({ params, body }) => {
      const { userId } = req;
      const routing = await this.modelRoutingService.updateRouting(
        params.hostname,
        params.routingId,
        body,
        userId,
      );
      return success(routing);
    });
  }

  /**
   * DELETE /bot/:hostname/routing/:routingId - 删除路由配置
   */
  @TsRestHandler(c.delete)
  async delete(@Req() req: AuthenticatedRequest) {
    return tsRestHandler(c.delete, async ({ params }) => {
      const { userId } = req;
      await this.modelRoutingService.deleteRouting(
        params.hostname,
        params.routingId,
        userId,
      );
      return success({ ok: true });
    });
  }

  /**
   * POST /bot/:hostname/routing/test - 测试路由配置
   */
  @TsRestHandler(c.test)
  async test(@Req() req: AuthenticatedRequest) {
    return tsRestHandler(c.test, async ({ params, body }) => {
      const { userId } = req;
      const result = await this.modelRoutingService.testRouting(
        params.hostname,
        body,
        userId,
      );
      return success(result);
    });
  }

  /**
   * GET /bot/:hostname/routing/:routingId/stats - 获取路由统计信息
   */
  @TsRestHandler(c.getStats)
  async getStats(@Req() req: AuthenticatedRequest) {
    return tsRestHandler(c.getStats, async ({ params }) => {
      const { userId } = req;
      const stats = await this.modelRoutingService.getRoutingStats(
        params.hostname,
        params.routingId,
        userId,
      );
      return success(stats);
    });
  }

  /**
   * POST /bot/:hostname/routing/:routingId/enable - 启用路由配置
   */
  @TsRestHandler(c.enable)
  async enable(@Req() req: AuthenticatedRequest) {
    return tsRestHandler(c.enable, async ({ params }) => {
      const { userId } = req;
      const routing = await this.modelRoutingService.enableRouting(
        params.hostname,
        params.routingId,
        userId,
      );
      return success(routing);
    });
  }

  /**
   * POST /bot/:hostname/routing/:routingId/disable - 禁用路由配置
   */
  @TsRestHandler(c.disable)
  async disable(@Req() req: AuthenticatedRequest) {
    return tsRestHandler(c.disable, async ({ params }) => {
      const { userId } = req;
      const routing = await this.modelRoutingService.disableRouting(
        params.hostname,
        params.routingId,
        userId,
      );
      return success(routing);
    });
  }

  /**
   * GET /bot/:hostname/routing/suggest - 获取 AI 推荐的路由配置
   */
  @TsRestHandler(c.suggest)
  async suggest(@Req() req: AuthenticatedRequest) {
    return tsRestHandler(c.suggest, async ({ params }) => {
      const { userId } = req;
      const suggestions = await this.modelRoutingService.suggestRouting(
        params.hostname,
        userId,
      );
      return success(suggestions);
    });
  }
}
