import { Controller, Req, VERSION_NEUTRAL } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { pluginContract, botPluginContract } from '@repo/contracts';
import { success } from '@/common/ts-rest/response.helper';
import { AuthenticatedRequest, Auth, AdminAuth } from '@app/auth';
import { PluginApiService } from './plugin-api.service';

const pluginC = pluginContract;
const botPluginC = botPluginContract;

@Controller({
  version: VERSION_NEUTRAL,
})
@Auth()
export class PluginApiController {
  constructor(private readonly pluginApiService: PluginApiService) {}

  // ============================================================================
  // Plugin Market APIs (插件市场)
  // ============================================================================

  @TsRestHandler(pluginC.list)
  async listPlugins(): Promise<any> {
    return tsRestHandler(pluginC.list, async ({ query }) => {
      const result = await this.pluginApiService.listPlugins(query);
      return success(result);
    });
  }

  @TsRestHandler(pluginC.getById)
  async getPluginById(): Promise<any> {
    return tsRestHandler(pluginC.getById, async ({ params }) => {
      const result = await this.pluginApiService.getPluginById(params.pluginId);
      return success(result);
    });
  }

  @TsRestHandler(pluginC.create)
  @AdminAuth()
  async createPlugin(): Promise<any> {
    return tsRestHandler(pluginC.create, async ({ body }) => {
      const result = await this.pluginApiService.createPlugin(body);
      return success(result);
    });
  }

  @TsRestHandler(pluginC.update)
  @AdminAuth()
  async updatePlugin(): Promise<any> {
    return tsRestHandler(pluginC.update, async ({ params, body }) => {
      const result = await this.pluginApiService.updatePlugin(
        params.pluginId,
        body,
      );
      return success(result);
    });
  }

  @TsRestHandler(pluginC.delete)
  @AdminAuth()
  async deletePlugin(): Promise<any> {
    return tsRestHandler(pluginC.delete, async ({ params }) => {
      const result = await this.pluginApiService.deletePlugin(params.pluginId);
      return success(result);
    });
  }

  // ============================================================================
  // Bot Plugin APIs (Bot 插件管理)
  // ============================================================================

  @TsRestHandler(botPluginC.list)
  async listBotPlugins(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(botPluginC.list, async ({ params }) => {
      const result = await this.pluginApiService.getBotPlugins(
        req.userId,
        params.hostname,
      );
      return success(result);
    });
  }

  @TsRestHandler(botPluginC.install)
  async installPlugin(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(botPluginC.install, async ({ params, body }) => {
      const result = await this.pluginApiService.installPlugin(
        req.userId,
        params.hostname,
        body,
      );
      return success(result);
    });
  }

  @TsRestHandler(botPluginC.updateConfig)
  async updateBotPluginConfig(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(botPluginC.updateConfig, async ({ params, body }) => {
      const result = await this.pluginApiService.updateBotPluginConfig(
        req.userId,
        params.hostname,
        params.pluginId,
        body,
      );
      return success(result);
    });
  }

  @TsRestHandler(botPluginC.uninstall)
  async uninstallPlugin(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(botPluginC.uninstall, async ({ params }) => {
      const result = await this.pluginApiService.uninstallPlugin(
        req.userId,
        params.hostname,
        params.pluginId,
      );
      return success(result);
    });
  }
}
