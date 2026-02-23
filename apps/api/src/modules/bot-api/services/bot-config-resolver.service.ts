import { Injectable, Logger } from '@nestjs/common';
import {
  BotModelService,
  BotChannelService,
  ProviderKeyService,
  ModelAvailabilityService,
} from '@app/db';

/**
 * Bot 运行时配置信息
 * 从 BotModel 和 BotChannel 派生，不再依赖 Bot 表中的冗余字段
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
 * 负责从 BotModel 和 BotChannel 表派生 Bot 的运行时配置
 * 替代原来存储在 Bot 表中的 aiProvider、model、channelType 冗余字段
 *
 * 设计原则：
 * - 单一数据源：配置信息只存储在 BotModel 和 BotChannel 中
 * - 派生计算：运行时配置通过查询关联表动态计算
 * - 缓存友好：返回的配置对象可以被上层服务缓存
 */
@Injectable()
export class BotConfigResolverService {
  private readonly logger = new Logger(BotConfigResolverService.name);

  constructor(
    private readonly botModelService: BotModelService,
    private readonly botChannelService: BotChannelService,
    private readonly providerKeyService: ProviderKeyService,
    private readonly modelAvailabilityService: ModelAvailabilityService,
  ) {}

  /**
   * 获取 Bot 的运行时配置
   * 从 BotModel (isPrimary=true) 和 BotChannel 派生
   *
   * @param botId - Bot ID
   * @returns BotRuntimeConfig 或 null（如果没有配置）
   */
  async getBotRuntimeConfig(botId: string): Promise<BotRuntimeConfig | null> {
    // 1. 获取主要 Model 配置
    let primaryBotModel = await this.botModelService.get({
      botId,
      isPrimary: true,
    });

    // 2. 获取第一个启用的 Channel 配置
    const { list: channels } = await this.botChannelService.list(
      { botId, isEnabled: true },
      { limit: 1 },
    );
    const primaryChannel = channels[0];

    // 如果没有主要 Model，尝试获取任意一个 Model
    if (!primaryBotModel) {
      const { list: allModels } = await this.botModelService.list(
        { botId },
        { limit: 1 },
      );
      primaryBotModel = allModels[0] || null;
    }

    // 获取 ModelAvailability 和 ProviderKey 信息
    let providerKey = null;
    let providerKeyId: string | null = null;

    if (primaryBotModel) {
      // 通过 modelId 查找所有 ModelAvailability，优先选择可用的且 ProviderKey 有效的
      const { list: availabilities } = await this.modelAvailabilityService.list(
        { model: primaryBotModel.modelId },
        { limit: 100 },
      );
      // 按 isAvailable 排序：可用的优先
      const sorted = [
        ...availabilities.filter((a) => a.isAvailable),
        ...availabilities.filter((a) => !a.isAvailable),
      ];
      // 遍历找到第一个 ProviderKey 仍然有效（未被软删除）的记录
      for (const availability of sorted) {
        if (!availability.providerKeyId) continue;
        const pk = await this.providerKeyService.getById(
          availability.providerKeyId,
        );
        if (pk) {
          providerKeyId = availability.providerKeyId;
          providerKey = pk;
          break;
        }
      }
    }

    // 如果没有任何配置，返回 null
    if (!primaryBotModel && !primaryChannel) {
      this.logger.debug(`Bot ${botId} has no model or channel configuration`);
      return null;
    }

    const config: BotRuntimeConfig = {
      aiProvider: providerKey?.vendor || '',
      model: primaryBotModel?.modelId || '',
      channelType: primaryChannel?.channelType || '',
      providerKeyId: providerKeyId,
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
   * 从主要 BotModel 派生
   */
  async getAiProvider(botId: string): Promise<string> {
    const config = await this.getBotRuntimeConfig(botId);
    return config?.aiProvider || '';
  }

  /**
   * 获取 Bot 的主要模型名称
   * 从主要 BotModel 的 modelId 派生
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
   * 检查 Bot 是否已完成配置
   * 只需要判断：1) BotModel 中存在记录  2) BotChannel 中存在记录
   * 不再要求完整的运行时配置解析（ProviderKey 等）
   */
  async isConfigured(botId: string): Promise<boolean> {
    const { total: modelCount } = await this.botModelService.list(
      { botId },
      { limit: 1 },
    );
    const { total: channelCount } = await this.botChannelService.list(
      { botId },
      { limit: 1 },
    );
    return modelCount > 0 && channelCount > 0;
  }
}
