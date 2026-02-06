import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { PluginService, BotPluginService, BotService } from '@app/db';
import type { Prisma } from '@prisma/client';
import type {
  PluginListQuery,
  PluginItem,
  BotPluginItem,
  CreatePluginRequest,
  UpdatePluginRequest,
  InstallPluginRequest,
  UpdatePluginConfigRequest,
} from '@repo/contracts';

@Injectable()
export class PluginApiService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly pluginService: PluginService,
    private readonly botPluginService: BotPluginService,
    private readonly botService: BotService,
  ) {}

  /**
   * 获取插件列表
   */
  async listPlugins(query: PluginListQuery): Promise<{
    list: PluginItem[];
    total: number;
    page: number;
    limit: number;
  }> {
    const {
      page = 1,
      limit = 20,
      category,
      region,
      isOfficial,
      search,
    } = query;

    const where: Prisma.PluginWhereInput = {
      isEnabled: true,
    };

    if (category) {
      where.category = category;
    }

    // 区域过滤：如果指定了区域，返回该区域和 global 的插件
    if (region) {
      where.region = { in: [region, 'global'] };
    }

    if (isOfficial !== undefined) {
      where.isOfficial = isOfficial;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    const result = await this.pluginService.list(where, { page, limit });

    return {
      list: result.list.map(this.mapPluginToItem),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  /**
   * 获取插件详情
   */
  async getPluginById(pluginId: string): Promise<PluginItem> {
    const plugin = await this.pluginService.getById(pluginId);
    if (!plugin) {
      throw new NotFoundException('插件不存在');
    }
    return this.mapPluginToItem(plugin);
  }

  /**
   * 创建插件（管理员）
   */
  async createPlugin(data: CreatePluginRequest): Promise<PluginItem> {
    const plugin = await this.pluginService.create({
      name: data.name,
      slug: data.slug,
      description: data.description,
      version: data.version,
      author: data.author,
      category: data.category,
      configSchema: data.configSchema as Prisma.InputJsonValue,
      defaultConfig: data.defaultConfig as Prisma.InputJsonValue,
      mcpConfig: data.mcpConfig as Prisma.InputJsonValue,
      isOfficial: data.isOfficial ?? false,
      downloadUrl: data.downloadUrl,
      iconEmoji: data.iconEmoji,
      iconUrl: data.iconUrl,
    });

    this.logger.info('Plugin created', {
      pluginId: plugin.id,
      slug: plugin.slug,
    });
    return this.mapPluginToItem(plugin);
  }

  /**
   * 更新插件（管理员）
   */
  async updatePlugin(
    pluginId: string,
    data: UpdatePluginRequest,
  ): Promise<PluginItem> {
    const existing = await this.pluginService.getById(pluginId);
    if (!existing) {
      throw new NotFoundException('插件不存在');
    }

    const plugin = await this.pluginService.update(
      { id: pluginId },
      {
        ...(data.name && { name: data.name }),
        ...(data.slug && { slug: data.slug }),
        ...(data.description !== undefined && {
          description: data.description,
        }),
        ...(data.version && { version: data.version }),
        ...(data.author !== undefined && { author: data.author }),
        ...(data.category && { category: data.category }),
        ...(data.configSchema !== undefined && {
          configSchema: data.configSchema as Prisma.InputJsonValue,
        }),
        ...(data.defaultConfig !== undefined && {
          defaultConfig: data.defaultConfig as Prisma.InputJsonValue,
        }),
        ...(data.mcpConfig !== undefined && {
          mcpConfig: data.mcpConfig as Prisma.InputJsonValue,
        }),
        ...(data.isOfficial !== undefined && { isOfficial: data.isOfficial }),
        ...(data.downloadUrl !== undefined && {
          downloadUrl: data.downloadUrl,
        }),
        ...(data.iconEmoji !== undefined && { iconEmoji: data.iconEmoji }),
        ...(data.iconUrl !== undefined && { iconUrl: data.iconUrl }),
      },
    );

    this.logger.info('Plugin updated', { pluginId: plugin.id });
    return this.mapPluginToItem(plugin);
  }

  /**
   * 删除插件（管理员）
   */
  async deletePlugin(pluginId: string): Promise<{ success: boolean }> {
    const existing = await this.pluginService.getById(pluginId);
    if (!existing) {
      throw new NotFoundException('插件不存在');
    }

    await this.pluginService.update({ id: pluginId }, { isDeleted: true });
    this.logger.info('Plugin deleted', { pluginId });
    return { success: true };
  }

  /**
   * 获取 Bot 已安装的插件列表
   */
  async getBotPlugins(
    userId: string,
    hostname: string,
  ): Promise<BotPluginItem[]> {
    const bot = await this.botService.get({ hostname, createdById: userId });
    if (!bot) {
      throw new NotFoundException('Bot 不存在');
    }

    const botPlugins = await this.botPluginService.list(
      { botId: bot.id },
      { limit: 100 },
      {
        select: {
          id: true,
          botId: true,
          pluginId: true,
          config: true,
          isEnabled: true,
          createdAt: true,
          updatedAt: true,
          plugin: true,
        },
      },
    );

    return botPlugins.list.map((bp) => this.mapBotPluginToItem(bp));
  }

  /**
   * 安装插件到 Bot
   */
  async installPlugin(
    userId: string,
    hostname: string,
    data: InstallPluginRequest,
  ): Promise<BotPluginItem> {
    const bot = await this.botService.get({ hostname, createdById: userId });
    if (!bot) {
      throw new NotFoundException('Bot 不存在');
    }

    const plugin = await this.pluginService.getById(data.pluginId);
    if (!plugin) {
      throw new NotFoundException('插件不存在');
    }

    // 检查是否已安装
    const existing = await this.botPluginService.get({
      botId: bot.id,
      pluginId: data.pluginId,
    });
    if (existing) {
      throw new Error('插件已安装');
    }

    const botPlugin = await this.botPluginService.create({
      bot: { connect: { id: bot.id } },
      plugin: { connect: { id: data.pluginId } },
      config: (data.config ?? plugin.defaultConfig) as Prisma.InputJsonValue,
      isEnabled: true,
    });

    this.logger.info('Plugin installed', {
      botId: bot.id,
      pluginId: data.pluginId,
      hostname,
    });

    // 获取完整的 BotPlugin 数据（包含 plugin 关联）
    const fullBotPlugin = await this.botPluginService.getById(botPlugin.id, {
      select: {
        id: true,
        botId: true,
        pluginId: true,
        config: true,
        isEnabled: true,
        createdAt: true,
        updatedAt: true,
        plugin: true,
      },
    });

    return this.mapBotPluginToItem(fullBotPlugin!);
  }

  /**
   * 更新 Bot 插件配置
   */
  async updateBotPluginConfig(
    userId: string,
    hostname: string,
    pluginId: string,
    data: UpdatePluginConfigRequest,
  ): Promise<BotPluginItem> {
    const bot = await this.botService.get({ hostname, createdById: userId });
    if (!bot) {
      throw new NotFoundException('Bot 不存在');
    }

    const botPlugin = await this.botPluginService.get({
      botId: bot.id,
      pluginId,
    });
    if (!botPlugin) {
      throw new NotFoundException('插件未安装');
    }

    const updated = await this.botPluginService.update(
      { id: botPlugin.id },
      {
        ...(data.config !== undefined && {
          config: data.config as Prisma.InputJsonValue,
        }),
        ...(data.isEnabled !== undefined && { isEnabled: data.isEnabled }),
      },
    );

    this.logger.info('Bot plugin config updated', {
      botId: bot.id,
      pluginId,
      hostname,
    });

    // 获取完整的 BotPlugin 数据
    const fullBotPlugin = await this.botPluginService.getById(updated.id, {
      select: {
        id: true,
        botId: true,
        pluginId: true,
        config: true,
        isEnabled: true,
        createdAt: true,
        updatedAt: true,
        plugin: true,
      },
    });

    return this.mapBotPluginToItem(fullBotPlugin!);
  }

  /**
   * 卸载 Bot 插件
   */
  async uninstallPlugin(
    userId: string,
    hostname: string,
    pluginId: string,
  ): Promise<{ success: boolean }> {
    const bot = await this.botService.get({ hostname, createdById: userId });
    if (!bot) {
      throw new NotFoundException('Bot 不存在');
    }

    const botPlugin = await this.botPluginService.get({
      botId: bot.id,
      pluginId,
    });
    if (!botPlugin) {
      throw new NotFoundException('插件未安装');
    }

    await this.botPluginService.delete({ id: botPlugin.id });

    this.logger.info('Plugin uninstalled', {
      botId: bot.id,
      pluginId,
      hostname,
    });

    return { success: true };
  }

  /**
   * 映射 Plugin 到 PluginItem
   */
  private mapPluginToItem(plugin: any): PluginItem {
    return {
      id: plugin.id,
      name: plugin.name,
      slug: plugin.slug,
      description: plugin.description,
      version: plugin.version,
      author: plugin.author,
      category: plugin.category,
      region: plugin.region,
      configSchema: plugin.configSchema as Record<string, unknown> | null,
      defaultConfig: plugin.defaultConfig as Record<string, unknown> | null,
      mcpConfig: plugin.mcpConfig as Record<string, unknown> | null,
      isOfficial: plugin.isOfficial,
      isEnabled: plugin.isEnabled,
      downloadUrl: plugin.downloadUrl,
      iconEmoji: plugin.iconEmoji,
      iconUrl: plugin.iconUrl,
      createdAt: plugin.createdAt,
      updatedAt: plugin.updatedAt,
    };
  }

  /**
   * 映射 BotPlugin 到 BotPluginItem
   */
  private mapBotPluginToItem(botPlugin: any): BotPluginItem {
    return {
      id: botPlugin.id,
      botId: botPlugin.botId,
      pluginId: botPlugin.pluginId,
      config: botPlugin.config as Record<string, unknown> | null,
      isEnabled: botPlugin.isEnabled,
      createdAt: botPlugin.createdAt,
      updatedAt: botPlugin.updatedAt,
      plugin: this.mapPluginToItem(botPlugin.plugin),
    };
  }
}
