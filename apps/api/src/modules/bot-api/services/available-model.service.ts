import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import {
  ModelAvailabilityService,
  ModelPricingService,
  BotModelService,
} from '@app/db';

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
  ) {}

  /**
   * 获取所有可用模型列表
   */
  async getAvailableModels(): Promise<AvailableModel[]> {
    // 1. 获取所有模型定价信息
    const pricingList = await this.modelPricingService.listAll();

    // 2. 获取所有模型可用性信息
    const { list: availabilityList } = await this.modelAvailabilityService.list(
      { isAvailable: true },
      { limit: 1000 },
    );

    // 3. 构建可用模型集合
    const availableModelsSet = new Set(
      availabilityList.map((a) => `${a.vendor}:${a.model}`),
    );

    // 4. 构建最后验证时间映射
    const lastVerifiedMap = new Map<string, Date>();
    for (const a of availabilityList) {
      const key = `${a.vendor}:${a.model}`;
      const existing = lastVerifiedMap.get(key);
      if (!existing || a.lastVerifiedAt > existing) {
        lastVerifiedMap.set(key, a.lastVerifiedAt);
      }
    }

    // 5. 聚合模型信息
    const models: AvailableModel[] = [];

    for (const pricing of pricingList) {
      const key = `${pricing.vendor}:${pricing.model}`;
      const isAvailable = availableModelsSet.has(key);

      models.push({
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
      });
    }

    // 6. 按可用性和分类排序
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
