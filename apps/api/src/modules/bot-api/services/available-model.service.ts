import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import {
  ModelAvailabilityService,
  ModelPricingService,
  BotModelService,
  ProviderKeyService,
} from '@app/db';

/**
 * Provider 信息（仅管理员可见）
 */
export interface ProviderInfo {
  providerKeyId: string;
  label: string | null;
  vendor: string;
}

/**
 * 可用模型信息（面向用户展示）
 */
export interface AvailableModel {
  /** 模型唯一标识 */
  id: string;
  /** 模型名称 */
  model: string;
  /** 显示名称 */
  displayName: string;
  /** 模型供应商（内部使用，不对普通用户显示） */
  vendor: string;
  /** 模型分类 */
  category: string;
  /** 能力标签 */
  capabilities: string[];
  /** 是否可用（有有效的 API Key） */
  isAvailable: boolean;
  /** 最后验证时间 */
  lastVerifiedAt: Date | null;
  /** 推理能力评分 */
  reasoningScore?: number;
  /** 编码能力评分 */
  codingScore?: number;
  /** 创意能力评分 */
  creativityScore?: number;
  /** 速度评分 */
  speedScore?: number;
  /** Provider 信息列表（仅管理员可见） */
  providers?: ProviderInfo[];
}

/**
 * Bot 模型信息
 */
export interface BotModelInfo {
  /** 模型 ID */
  modelId: string;
  /** 显示名称 */
  displayName: string;
  /** 是否启用 */
  isEnabled: boolean;
  /** 是否为主模型 */
  isPrimary: boolean;
  /** 是否可用（有有效的 API Key） */
  isAvailable: boolean;
}

/**
 * 模型分类映射
 */
const MODEL_CATEGORIES: Record<string, string> = {
  // Anthropic
  'claude-opus-4-20250514': 'reasoning',
  'claude-sonnet-4-20250514': 'balanced',
  'claude-3-5-haiku-20241022': 'fast',
  // OpenAI
  o1: 'reasoning',
  'o1-mini': 'reasoning',
  'o3-mini': 'reasoning',
  'gpt-4o': 'balanced',
  'gpt-4o-mini': 'fast',
  'gpt-4-turbo': 'balanced',
  // DeepSeek
  'deepseek-reasoner': 'reasoning',
  'deepseek-chat': 'balanced',
  'deepseek-v3': 'balanced',
  // Google
  'gemini-2.0-flash': 'fast',
  'gemini-1.5-pro': 'balanced',
  // Others
  'llama-3.3-70b-versatile': 'balanced',
};

/**
 * 模型能力标签
 */
const MODEL_CAPABILITIES: Record<string, string[]> = {
  // Anthropic
  'claude-opus-4-20250514': [
    'vision',
    'tools',
    'streaming',
    'extended-thinking',
  ],
  'claude-sonnet-4-20250514': [
    'vision',
    'tools',
    'streaming',
    'extended-thinking',
  ],
  'claude-3-5-haiku-20241022': ['vision', 'tools', 'streaming'],
  // OpenAI
  o1: ['reasoning', 'tools'],
  'o1-mini': ['reasoning', 'tools'],
  'o3-mini': ['reasoning', 'tools'],
  'gpt-4o': ['vision', 'tools', 'streaming'],
  'gpt-4o-mini': ['vision', 'tools', 'streaming'],
  'gpt-4-turbo': ['vision', 'tools', 'streaming'],
  // DeepSeek
  'deepseek-reasoner': ['reasoning', 'tools', 'streaming'],
  'deepseek-chat': ['tools', 'streaming'],
  'deepseek-v3': ['tools', 'streaming'],
  // Google
  'gemini-2.0-flash': ['vision', 'tools', 'streaming'],
  'gemini-1.5-pro': ['vision', 'tools', 'streaming'],
};

/**
 * 模型显示名称
 */
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  // Anthropic
  'claude-opus-4-20250514': 'Claude Opus 4',
  'claude-sonnet-4-20250514': 'Claude Sonnet 4',
  'claude-3-5-haiku-20241022': 'Claude 3.5 Haiku',
  // OpenAI
  o1: 'OpenAI o1',
  'o1-mini': 'OpenAI o1 Mini',
  'o3-mini': 'OpenAI o3 Mini',
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o Mini',
  'gpt-4-turbo': 'GPT-4 Turbo',
  // DeepSeek
  'deepseek-reasoner': 'DeepSeek Reasoner',
  'deepseek-chat': 'DeepSeek Chat',
  'deepseek-v3': 'DeepSeek V3',
  // Google
  'gemini-2.0-flash': 'Gemini 2.0 Flash',
  'gemini-1.5-pro': 'Gemini 1.5 Pro',
  // Others
  'llama-3.3-70b-versatile': 'Llama 3.3 70B',
};

/**
 * AvailableModelService
 *
 * 负责聚合模型信息，提供面向用户的模型列表
 *
 * 功能：
 * 1. 获取所有可用模型列表（聚合 ModelAvailability 和 ModelPricing）
 * 2. 获取 Bot 的模型列表
 * 3. 更新 Bot 的模型配置
 */
@Injectable()
export class AvailableModelService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly modelAvailabilityService: ModelAvailabilityService,
    private readonly modelPricingService: ModelPricingService,
    private readonly botModelService: BotModelService,
    private readonly providerKeyService: ProviderKeyService,
  ) {}

  /**
   * 获取所有可用模型列表
   * @param includeProviderInfo 是否包含 Provider 信息（仅管理员）
   */
  async getAvailableModels(
    includeProviderInfo = false,
  ): Promise<AvailableModel[]> {
    // 1. 获取所有模型定价信息
    const pricingList = await this.modelPricingService.listAll();

    // 2. 获取所有 Provider Key（用于获取 vendor 信息）
    const { list: providerKeys } = await this.providerKeyService.list(
      {},
      { limit: 1000 },
    );
    const providerKeyMap = new Map(providerKeys.map((pk) => [pk.id, pk]));

    // 3. 获取所有模型可用性信息（仅可用的）
    const { list: availableList } = await this.modelAvailabilityService.list(
      { isAvailable: true },
      { limit: 1000 },
    );

    // 4. 构建可用模型集合（vendor 从 ProviderKey 获取）
    const availableModelsSet = new Set(
      availableList
        .map((a) => {
          const pk = providerKeyMap.get(a.providerKeyId);
          return pk ? `${pk.vendor}:${a.model}` : null;
        })
        .filter((key): key is string => key !== null),
    );

    // 5. 构建最后验证时间映射（从可用列表）
    const lastVerifiedMap = new Map<string, Date>();
    for (const a of availableList) {
      const pk = providerKeyMap.get(a.providerKeyId);
      if (!pk) continue;
      const key = `${pk.vendor}:${a.model}`;
      const existing = lastVerifiedMap.get(key);
      if (!existing || a.lastVerifiedAt > existing) {
        lastVerifiedMap.set(key, a.lastVerifiedAt);
      }
    }

    // 6. 如果需要 Provider 信息，构建 Provider 映射
    const providerInfoMap = new Map<string, ProviderInfo[]>();
    const providerKeysByVendor = new Map<string, ProviderInfo[]>();
    if (includeProviderInfo) {
      // 构建 vendor 到 Provider 的映射（用于没有 ModelAvailability 记录时的回退）
      for (const pk of providerKeys) {
        const providers = providerKeysByVendor.get(pk.vendor) || [];
        providers.push({
          providerKeyId: pk.id,
          label: pk.label,
          vendor: pk.vendor,
        });
        providerKeysByVendor.set(pk.vendor, providers);
      }

      // 获取所有模型可用性记录（包括不可用的），用于构建 Provider 映射
      const { list: allAvailabilityList } =
        await this.modelAvailabilityService.list({}, { limit: 1000 });

      // 构建模型到 Provider 的映射（包括所有记录，不仅仅是可用的）
      for (const a of allAvailabilityList) {
        const providerKey = providerKeyMap.get(a.providerKeyId);
        if (!providerKey) continue;
        const key = `${providerKey.vendor}:${a.model}`;
        const providers = providerInfoMap.get(key) || [];
        // 避免重复添加同一个 Provider
        if (!providers.some((p) => p.providerKeyId === a.providerKeyId)) {
          providers.push({
            providerKeyId: a.providerKeyId,
            label: providerKey.label,
            vendor: providerKey.vendor,
          });
        }
        providerInfoMap.set(key, providers);
      }

      // 同时更新最后验证时间（从所有记录）
      for (const a of allAvailabilityList) {
        const pk = providerKeyMap.get(a.providerKeyId);
        if (!pk) continue;
        const key = `${pk.vendor}:${a.model}`;
        const existing = lastVerifiedMap.get(key);
        if (!existing || a.lastVerifiedAt > existing) {
          lastVerifiedMap.set(key, a.lastVerifiedAt);
        }
      }
    }

    // 7. 聚合模型信息
    const models: AvailableModel[] = [];

    for (const pricing of pricingList) {
      const key = `${pricing.vendor}:${pricing.model}`;
      const isAvailable = availableModelsSet.has(key);

      const model: AvailableModel = {
        id: pricing.model,
        model: pricing.model,
        displayName: MODEL_DISPLAY_NAMES[pricing.model] || pricing.model,
        vendor: pricing.vendor,
        category: MODEL_CATEGORIES[pricing.model] || 'general',
        capabilities: MODEL_CAPABILITIES[pricing.model] || [
          'tools',
          'streaming',
        ],
        isAvailable,
        lastVerifiedAt: lastVerifiedMap.get(key) || null,
        reasoningScore: pricing.reasoningScore || undefined,
        codingScore: pricing.codingScore || undefined,
        creativityScore: pricing.creativityScore || undefined,
        speedScore: pricing.speedScore || undefined,
      };

      // 添加 Provider 信息（仅管理员）
      if (includeProviderInfo) {
        // 优先使用 ModelAvailability 记录中的 Provider 信息
        // 如果没有，则回退到基于 vendor 匹配的 Provider 信息
        const providersFromAvailability = providerInfoMap.get(key);
        if (providersFromAvailability && providersFromAvailability.length > 0) {
          model.providers = providersFromAvailability;
        } else {
          // 回退：使用 vendor 匹配的 Provider
          model.providers = providerKeysByVendor.get(pricing.vendor) || [];
        }
      }

      models.push(model);
    }

    // 7. 按可用性和分类排序
    models.sort((a, b) => {
      // 可用的排在前面
      if (a.isAvailable !== b.isAvailable) {
        return a.isAvailable ? -1 : 1;
      }
      // 按分类排序
      const categoryOrder = ['reasoning', 'balanced', 'fast', 'general'];
      const aOrder = categoryOrder.indexOf(a.category);
      const bOrder = categoryOrder.indexOf(b.category);
      return aOrder - bOrder;
    });

    return models;
  }

  /**
   * 获取 Bot 的模型列表
   */
  async getBotModels(botId: string): Promise<BotModelInfo[]> {
    // 1. 获取 Bot 的模型配置
    const { list: botModels } = await this.botModelService.list(
      { botId },
      { limit: 100 },
    );

    // 2. 获取所有可用模型
    const availableModels = await this.getAvailableModels();
    const availableModelsMap = new Map(
      availableModels.map((m) => [m.model, m]),
    );

    // 3. 构建 Bot 模型信息
    const models: BotModelInfo[] = [];

    for (const bm of botModels) {
      const available = availableModelsMap.get(bm.modelId);

      models.push({
        modelId: bm.modelId,
        displayName: MODEL_DISPLAY_NAMES[bm.modelId] || bm.modelId,
        isEnabled: bm.isEnabled,
        isPrimary: bm.isPrimary,
        isAvailable: available?.isAvailable || false,
      });
    }

    return models;
  }

  /**
   * 更新 Bot 的模型配置
   */
  async updateBotModels(
    botId: string,
    enabledModels: string[],
    primaryModel?: string,
  ): Promise<void> {
    // 1. 获取当前 Bot 的模型配置
    const { list: currentModels } = await this.botModelService.list(
      { botId },
      { limit: 100 },
    );

    const currentModelIds = new Set(currentModels.map((m) => m.modelId));
    const enabledModelIds = new Set(enabledModels);

    // 2. 删除不再启用的模型
    for (const model of currentModels) {
      if (!enabledModelIds.has(model.modelId)) {
        await this.botModelService.delete({ id: model.id });
      }
    }

    // 3. 添加新启用的模型
    for (const modelId of enabledModels) {
      if (!currentModelIds.has(modelId)) {
        await this.botModelService.create({
          bot: { connect: { id: botId } },
          modelId,
          isEnabled: true,
          isPrimary: modelId === primaryModel,
        });
      }
    }

    // 4. 更新主模型
    if (primaryModel) {
      // 先清除所有主模型标记
      for (const model of currentModels) {
        if (model.isPrimary && model.modelId !== primaryModel) {
          await this.botModelService.update(
            { id: model.id },
            { isPrimary: false },
          );
        }
      }

      // 设置新的主模型
      const primaryModelRecord = currentModels.find(
        (m) => m.modelId === primaryModel,
      );
      if (primaryModelRecord && !primaryModelRecord.isPrimary) {
        await this.botModelService.update(
          { id: primaryModelRecord.id },
          { isPrimary: true },
        );
      }
    }

    this.logger.info('[AvailableModel] Updated bot models', {
      botId,
      enabledModels,
      primaryModel,
    });
  }

  /**
   * 为新 Bot 绑定所有可用模型
   */
  async bindAllAvailableModels(
    botId: string,
    primaryModel?: string,
  ): Promise<void> {
    const availableModels = await this.getAvailableModels();
    const enabledModels = availableModels
      .filter((m) => m.isAvailable)
      .map((m) => m.model);

    // 如果没有指定主模型，使用第一个可用模型
    const primary = primaryModel || enabledModels[0];

    for (const modelId of enabledModels) {
      await this.botModelService.create({
        bot: { connect: { id: botId } },
        modelId,
        isEnabled: true,
        isPrimary: modelId === primary,
      });
    }

    this.logger.info('[AvailableModel] Bound all available models to bot', {
      botId,
      modelCount: enabledModels.length,
      primaryModel: primary,
    });
  }
}
