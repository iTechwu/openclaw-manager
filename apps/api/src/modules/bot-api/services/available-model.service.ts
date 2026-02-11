import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import {
  ModelAvailabilityService,
  ModelPricingService,
  BotModelService,
  ProviderKeyService,
  ModelCapabilityTagService,
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
  /** 能力标签（tagId 列表，向后兼容） */
  capabilities: string[];
  /** 能力标签详情（来自能力标签管理） */
  capabilityTags?: Array<{ tagId: string; name: string; category?: string }>;
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
 * 模型分类映射（作为 fallback）
 */
const MODEL_CATEGORIES_FALLBACK: Record<string, string> = {
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
 * 模型能力标签（作为 fallback）
 */
const MODEL_CAPABILITIES_FALLBACK: Record<string, string[]> = {
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
 * 模型显示名称（作为 fallback）
 */
const MODEL_DISPLAY_NAMES_FALLBACK: Record<string, string> = {
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
    private readonly modelCapabilityTagService: ModelCapabilityTagService,
  ) {}

  /**
   * 根据 modelId 获取 ModelAvailability 记录
   * 优先返回 isAvailable=true 且 ProviderKey 有效的记录
   */
  async getModelAvailabilityByModelId(modelId: string) {
    const { list } = await this.modelAvailabilityService.list(
      { model: modelId },
      { limit: 100 },
    );
    if (list.length === 0) return null;

    // 过滤出 ProviderKey 仍然有效的记录
    const { list: providerKeys } = await this.providerKeyService.list(
      {},
      { limit: 1000 },
    );
    const validProviderKeyIds = new Set(providerKeys.map((pk) => pk.id));
    const validRecords = list.filter((m) =>
      validProviderKeyIds.has(m.providerKeyId),
    );

    if (validRecords.length === 0) return null;
    // 优先返回可用的记录
    return validRecords.find((m) => m.isAvailable) ?? validRecords[0];
  }

  /**
   * 获取所有可用模型列表
   * 数据来源：ModelAvailability 表（从 Provider API 发现的模型）
   * 补充信息：ModelPricing 表（定价和评分信息）
   *
   * @param includeProviderInfo 是否包含 Provider 信息（仅管理员）
   */
  async getAvailableModels(
    includeProviderInfo = false,
  ): Promise<AvailableModel[]> {
    // 1. 获取所有 Provider Key（用于获取 vendor 信息）
    const { list: providerKeys } = await this.providerKeyService.list(
      {},
      { limit: 1000 },
    );
    const providerKeyMap = new Map(providerKeys.map((pk) => [pk.id, pk]));

    // 2. 获取所有模型可用性记录（数据主来源）
    const { list: allAvailabilityList } =
      await this.modelAvailabilityService.list({}, { limit: 1000 });

    // 3. 获取所有模型定价信息（用于补充显示名称和评分）
    const pricingList = await this.modelPricingService.listAll();
    const pricingMap = new Map(
      pricingList.map((p) => [`${p.vendor}:${p.model}`, p]),
    );

    // 4. 获取所有能力标签关联
    const { list: allCapabilityTags } =
      await this.modelCapabilityTagService.list(
        {},
        { limit: 10000 },
        {
          select: {
            modelAvailabilityId: true,
            capabilityTag: { select: { tagId: true, name: true, category: true } },
          },
        },
      );

    // 构建 modelAvailabilityId -> tagIds 映射 和 tagId -> tagInfo 映射
    interface TagInfo {
      tagId: string;
      name: string;
      category?: string;
    }
    const capabilityTagsByAvailabilityId = new Map<string, string[]>();
    const tagInfoMap = new Map<string, TagInfo>();
    for (const ct of allCapabilityTags) {
      const tags =
        capabilityTagsByAvailabilityId.get(ct.modelAvailabilityId) || [];
      const capTag = (ct as { capabilityTag?: { tagId: string; name: string; category: string } }).capabilityTag;
      const tagId = capTag?.tagId;
      if (tagId && !tags.includes(tagId)) {
        tags.push(tagId);
        if (capTag && !tagInfoMap.has(tagId)) {
          tagInfoMap.set(tagId, { tagId, name: capTag.name, category: capTag.category });
        }
      }
      capabilityTagsByAvailabilityId.set(ct.modelAvailabilityId, tags);
    }

    // 5. 按 vendor:model 聚合模型信息
    // 同一个模型可能有多个 Provider，需要聚合
    const modelAggregation = new Map<
      string,
      {
        model: string;
        vendor: string;
        isAvailable: boolean;
        lastVerifiedAt: Date;
        capabilities: string[];
        providers: ProviderInfo[];
      }
    >();

    for (const availability of allAvailabilityList) {
      const pk = providerKeyMap.get(availability.providerKeyId);
      if (!pk) continue;

      const key = `${pk.vendor}:${availability.model}`;
      const existing = modelAggregation.get(key);

      // 获取该 ModelAvailability 的能力标签
      const tags = capabilityTagsByAvailabilityId.get(availability.id) || [];

      if (existing) {
        // 聚合：如果任一 Provider 可用，则模型可用
        if (availability.isAvailable) {
          existing.isAvailable = true;
        }
        // 使用最新的验证时间
        if (availability.lastVerifiedAt > existing.lastVerifiedAt) {
          existing.lastVerifiedAt = availability.lastVerifiedAt;
        }
        // 聚合能力标签
        for (const tag of tags) {
          if (!existing.capabilities.includes(tag)) {
            existing.capabilities.push(tag);
          }
        }
        // 添加 Provider 信息
        if (
          includeProviderInfo &&
          !existing.providers.some(
            (p) => p.providerKeyId === availability.providerKeyId,
          )
        ) {
          existing.providers.push({
            providerKeyId: availability.providerKeyId,
            label: pk.label,
            vendor: pk.vendor,
          });
        }
      } else {
        // 新模型
        modelAggregation.set(key, {
          model: availability.model,
          vendor: pk.vendor,
          isAvailable: availability.isAvailable,
          lastVerifiedAt: availability.lastVerifiedAt,
          capabilities: [...tags],
          providers: includeProviderInfo
            ? [
                {
                  providerKeyId: availability.providerKeyId,
                  label: pk.label,
                  vendor: pk.vendor,
                },
              ]
            : [],
        });
      }
    }

    // 6. 构建最终模型列表
    const models: AvailableModel[] = [];

    for (const [key, aggregated] of modelAggregation) {
      // 从 ModelPricing 获取补充信息
      const pricing = pricingMap.get(key);

      // 获取能力标签，如果没有则使用 fallback
      const capabilities =
        aggregated.capabilities.length > 0
          ? aggregated.capabilities
          : MODEL_CAPABILITIES_FALLBACK[aggregated.model] || [
              'tools',
              'streaming',
            ];

      // 构建能力标签详情（来自能力标签管理）
      const capabilityTags = capabilities
        .map((tagId) => tagInfoMap.get(tagId))
        .filter((t): t is TagInfo => !!t);

      // 从能力标签推导分类
      const category = this.deriveCategoryFromCapabilities(
        capabilities,
        aggregated.model,
      );

      // 获取显示名称
      const displayName =
        pricing?.displayName ||
        MODEL_DISPLAY_NAMES_FALLBACK[aggregated.model] ||
        aggregated.model;

      const model: AvailableModel = {
        id: aggregated.model,
        model: aggregated.model,
        displayName,
        vendor: aggregated.vendor,
        category,
        capabilities,
        capabilityTags,
        isAvailable: aggregated.isAvailable,
        lastVerifiedAt: aggregated.lastVerifiedAt,
        reasoningScore: pricing?.reasoningScore || undefined,
        codingScore: pricing?.codingScore || undefined,
        creativityScore: pricing?.creativityScore || undefined,
        speedScore: pricing?.speedScore || undefined,
      };

      // 添加 Provider 信息（仅管理员）
      if (includeProviderInfo) {
        model.providers = aggregated.providers;
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
   * 从能力标签推导模型分类
   */
  private deriveCategoryFromCapabilities(
    capabilities: string[],
    modelName: string,
  ): string {
    // 优先使用 fallback 映射
    if (MODEL_CATEGORIES_FALLBACK[modelName]) {
      return MODEL_CATEGORIES_FALLBACK[modelName];
    }

    // 根据能力标签推导分类
    if (
      capabilities.includes('extended-thinking') ||
      capabilities.includes('reasoning')
    ) {
      return 'reasoning';
    }
    if (capabilities.includes('fast') || capabilities.includes('speed')) {
      return 'fast';
    }
    if (capabilities.includes('vision') && capabilities.includes('tools')) {
      return 'balanced';
    }

    return 'general';
  }

  /**
   * 获取 Bot 的模型列表
   */
  async getBotModels(botId: string): Promise<BotModelInfo[]> {
    // 1. 获取 Bot 的模型配置
    const { list: botModels } = await this.botModelService.list(
      { botId },
      { limit: 1000 },
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
        // 优先使用动态获取的 displayName，否则使用 fallback
        displayName:
          available?.displayName ||
          MODEL_DISPLAY_NAMES_FALLBACK[bm.modelId] ||
          bm.modelId,
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
      { limit: 1000 },
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
   * 获取模型详情（包含所有关联数据）
   */
  async getModelDetails(modelAvailabilityId: string): Promise<{
    availability: {
      id: string;
      model: string;
      providerKeyId: string;
      modelType: string;
      isAvailable: boolean;
      lastVerifiedAt: Date;
      errorMessage: string | null;
      providerKeys: Array<{ id: string; vendor: string; apiType: string; label: string | null }>;
    };
    pricing: {
      id: string;
      model: string;
      vendor: string;
      displayName: string | null;
      inputPrice: number;
      outputPrice: number;
      reasoningScore: number;
      codingScore: number;
      creativityScore: number;
      speedScore: number;
      contextLength: number;
      supportsVision: boolean;
      supportsExtendedThinking: boolean;
      supportsFunctionCalling: boolean;
    } | null;
    capabilityTags: Array<{
      id: string;
      modelAvailabilityId: string;
      capabilityTagId: string;
      tagId: string;
      matchSource: 'pattern' | 'feature' | 'scenario' | 'manual';
      confidence: number;
      createdAt: Date;
    }>;
    fallbackChains: Array<{
      chainId: string;
      name: string;
      position: number;
    }>;
    routingConfigs: Array<{
      botId: string;
      botName: string;
      routingType: string;
    }>;
  } | null> {
    // 1. 获取 ModelAvailability
    const availability = await this.modelAvailabilityService.get({
      id: modelAvailabilityId,
    });
    if (!availability) {
      return null;
    }

    // 2. 获取关联的 ModelPricing
    let pricing = null;
    if (availability.modelPricingId) {
      const pricingRecord = await this.modelPricingService.get({
        id: availability.modelPricingId,
      });
      if (pricingRecord) {
        pricing = {
          id: pricingRecord.id,
          model: pricingRecord.model,
          vendor: pricingRecord.vendor,
          displayName: pricingRecord.displayName,
          inputPrice: Number(pricingRecord.inputPrice),
          outputPrice: Number(pricingRecord.outputPrice),
          reasoningScore: pricingRecord.reasoningScore,
          codingScore: pricingRecord.codingScore,
          creativityScore: pricingRecord.creativityScore,
          speedScore: pricingRecord.speedScore,
          contextLength: pricingRecord.contextLength,
          supportsVision: pricingRecord.supportsVision,
          supportsExtendedThinking: pricingRecord.supportsExtendedThinking,
          supportsFunctionCalling: pricingRecord.supportsFunctionCalling,
        };
      }
    }

    // 3. 获取能力标签
    const { list: tagRecords } = await this.modelCapabilityTagService.list(
      { modelAvailabilityId },
      { limit: 100 },
      {
        select: {
          id: true,
          modelAvailabilityId: true,
          capabilityTagId: true,
          matchSource: true,
          confidence: true,
          createdAt: true,
          capabilityTag: { select: { tagId: true } },
        },
      },
    );

    const capabilityTags = tagRecords.map((tag) => ({
      id: tag.id,
      modelAvailabilityId: tag.modelAvailabilityId,
      capabilityTagId: tag.capabilityTagId,
      tagId:
        (tag as { capabilityTag?: { tagId: string } }).capabilityTag?.tagId ||
        '',
      matchSource: tag.matchSource as
        | 'pattern'
        | 'feature'
        | 'scenario'
        | 'manual',
      confidence: tag.confidence,
      createdAt: tag.createdAt,
    }));

    // 4. 获取 Provider Key 信息
    const providerKey = await this.providerKeyService.get({
      id: availability.providerKeyId,
    });

    // 5. 获取关联的 FallbackChain（简化实现，暂时返回空数组）
    const fallbackChains: Array<{
      chainId: string;
      name: string;
      position: number;
    }> = [];

    // 6. 获取关联的路由配置（简化实现，暂时返回空数组）
    const routingConfigs: Array<{
      botId: string;
      botName: string;
      routingType: string;
    }> = [];

    return {
      availability: {
        id: availability.id,
        model: availability.model,
        providerKeyId: availability.providerKeyId,
        modelType: availability.modelType,
        isAvailable: availability.isAvailable,
        lastVerifiedAt: availability.lastVerifiedAt,
        errorMessage: availability.errorMessage,
        providerKeys: providerKey
          ? [
              {
                id: providerKey.id,
                vendor: providerKey.vendor,
                apiType: (providerKey as any).apiType ?? 'openai',
                label: providerKey.label ?? null,
              },
            ]
          : [],
      },
      pricing,
      capabilityTags,
      fallbackChains,
      routingConfigs,
    };
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

  /**
   * 批量添加模型到 Bot（通过 ModelAvailability ID）
   */
  async addModelsByAvailabilityIds(
    botId: string,
    modelAvailabilityIds: string[],
    primaryModelAvailabilityId?: string,
  ): Promise<{ added: number; modelIds: string[] }> {
    // 1. 获取 ModelAvailability 记录
    const availabilityRecords = await Promise.all(
      modelAvailabilityIds.map((id) =>
        this.modelAvailabilityService.getById(id),
      ),
    );

    // 2. 获取当前 Bot 的模型配置
    const { list: currentModels } = await this.botModelService.list(
      { botId },
      { limit: 1000 },
    );
    const currentModelIds = new Set(currentModels.map((m) => m.modelId));

    // 3. 添加新模型
    const addedModelIds: string[] = [];
    for (const availability of availabilityRecords) {
      if (!availability) continue;

      // 跳过已存在的模型
      if (currentModelIds.has(availability.model)) continue;

      const isPrimary =
        primaryModelAvailabilityId === availability.id ||
        (currentModels.length === 0 && addedModelIds.length === 0);

      await this.botModelService.create({
        bot: { connect: { id: botId } },
        modelId: availability.model,
        isEnabled: true,
        isPrimary,
      });

      addedModelIds.push(availability.model);
    }

    this.logger.info('[AvailableModel] Added models to bot by availability IDs', {
      botId,
      modelAvailabilityIds,
      addedModelIds,
    });

    return { added: addedModelIds.length, modelIds: addedModelIds };
  }

  /**
   * 从 Bot 移除模型（通过 ModelAvailability ID）
   */
  async removeModelByAvailabilityId(
    botId: string,
    modelAvailabilityId: string,
  ): Promise<{ success: boolean }> {
    // 1. 获取 ModelAvailability 记录
    const availability = await this.modelAvailabilityService.get({
      id: modelAvailabilityId,
    });
    if (!availability) {
      throw new Error(`ModelAvailability not found: ${modelAvailabilityId}`);
    }

    // 2. 查找 Bot 的模型记录
    const botModel = await this.botModelService.get({
      botId,
      modelId: availability.model,
    });
    if (!botModel) {
      throw new Error(
        `Model ${availability.model} not found in bot ${botId}`,
      );
    }

    // 3. 删除模型
    await this.botModelService.delete({ id: botModel.id });

    this.logger.info('[AvailableModel] Removed model from bot by availability ID', {
      botId,
      modelAvailabilityId,
      modelId: availability.model,
    });

    return { success: true };
  }

  /**
   * 清理指定 ProviderKey 关联的 ModelAvailability 记录
   * 当 ProviderKey 被删除时调用，硬删除所有关联的 ModelAvailability
   */
  async cleanupByProviderKeyId(
    providerKeyId: string,
  ): Promise<{ deleted: number }> {
    const { list: records } = await this.modelAvailabilityService.list(
      { providerKeyId },
      { limit: 1000 },
    );

    for (const record of records) {
      await this.modelAvailabilityService.delete({ id: record.id });
    }

    this.logger.info(
      '[AvailableModel] Cleaned up ModelAvailability records for deleted ProviderKey',
      { providerKeyId, deleted: records.length },
    );

    return { deleted: records.length };
  }
}
