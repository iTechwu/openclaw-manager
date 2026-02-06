import { Injectable, Logger } from '@nestjs/common';
import {
  BotProviderKeyService,
  BotChannelService,
  ProviderKeyService,
} from '@app/db';

/**
 * Bot 运行时配置信息
 * 从 BotProviderKey 和 BotChannel 派生，不再依赖 Bot 表中的冗余字段
 */
export interface BotRuntimeConfig {
  /** AI Provider vendor ID (e.g., 'openai', 'anthropic', 'deepseek') */
  aiProvider: string;
  /** Primary model name (e.g., 'gpt-4', 'claude-3-opus') */
  model: string;
  /** Primary channel type (e.g., 'feishu', 'telegram', 'discord') */
  channelType: string;
  /** Provider key ID for the primary provider */
  providerKeyId: string | null;
  /** API type for the provider (e.g., 'openai', 'anthropic') */
  apiType: string | null;
  /** Custom base URL for the provider */
  baseUrl: string | null;
}

/**
 * BotConfigResolverService
 *
 * 负责从 BotProviderKey 和 BotChannel 表派生 Bot 的运行时配置
 * 替代原来存储在 Bot 表中的 aiProvider、model、channelType 冗余字段
 *
 * 设计原则：
 * - 单一数据源：配置信息只存储在 BotProviderKey 和 BotChannel 中
 * - 派生计算：运行时配置通过查询关联表动态计算
 * - 缓存友好：返回的配置对象可以被上层服务缓存
 */
@Injectable()
export class BotConfigResolverService {
  private readonly logger = new Logger(BotConfigResolverService.name);

  constructor(
    private readonly botProviderKeyService: BotProviderKeyService,
    private readonly botChannelService: BotChannelService,
    private readonly providerKeyService: ProviderKeyService,
  ) {}

  /**
   * 获取 Bot 的运行时配置
   * 从 BotProviderKey (isPrimary=true) 和 BotChannel 派生
   *
   * @param botId - Bot ID
   * @returns BotRuntimeConfig 或 null（如果没有配置）
   */
  async getBotRuntimeConfig(botId: string): Promise<BotRuntimeConfig | null> {
    // 1. 获取主要 Provider 配置
    const primaryBotProviderKey = await this.botProviderKeyService.get({
      botId,
      isPrimary: true,
    });

    // 2. 获取第一个启用的 Channel 配置
    const { list: channels } = await this.botChannelService.list(
      { botId, isEnabled: true },
      { limit: 1 },
    );
    const primaryChannel = channels[0];

    // 如果没有主要 Provider，尝试获取任意一个 Provider
    let providerKey = null;
    let botProviderKey = primaryBotProviderKey;

    if (!botProviderKey) {
      const { list: allProviderKeys } = await this.botProviderKeyService.list(
        { botId },
        { limit: 1 },
      );
      botProviderKey = allProviderKeys[0] || null;
    }

    if (botProviderKey) {
      providerKey = await this.providerKeyService.getById(
        botProviderKey.providerKeyId,
      );
    }

    // 如果没有任何配置，返回 null
    if (!providerKey && !primaryChannel) {
      this.logger.debug(
        `Bot ${botId} has no provider or channel configuration`,
      );
      return null;
    }

    const config: BotRuntimeConfig = {
      aiProvider: providerKey?.vendor || '',
      model: botProviderKey?.primaryModel || '',
      channelType: primaryChannel?.channelType || '',
      providerKeyId: botProviderKey?.providerKeyId || null,
      apiType: providerKey?.apiType || null,
      baseUrl: providerKey?.baseUrl || null,
    };

    this.logger.debug(
      `Resolved runtime config for bot ${botId}: provider=${config.aiProvider}, model=${config.model}, channel=${config.channelType}`,
    );

    return config;
  }

  /**
   * 获取 Bot 的 AI Provider vendor ID
   * 从主要 BotProviderKey 派生
   */
  async getAiProvider(botId: string): Promise<string> {
    const config = await this.getBotRuntimeConfig(botId);
    return config?.aiProvider || '';
  }

  /**
   * 获取 Bot 的主要模型名称
   * 从主要 BotProviderKey 的 primaryModel 派生
   */
  async getModel(botId: string): Promise<string> {
    const config = await this.getBotRuntimeConfig(botId);
    return config?.model || '';
  }

  /**
   * 获取 Bot 的主要渠道类型
   * 从第一个启用的 BotChannel 派生
   */
  async getChannelType(botId: string): Promise<string> {
    const config = await this.getBotRuntimeConfig(botId);
    return config?.channelType || '';
  }

  /**
   * 检查 Bot 是否已完成配置（有 Provider 和 Channel）
   */
  async isConfigured(botId: string): Promise<boolean> {
    const config = await this.getBotRuntimeConfig(botId);
    return !!(config?.aiProvider && config?.channelType);
  }
}
