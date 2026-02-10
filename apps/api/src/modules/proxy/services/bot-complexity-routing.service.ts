import { Inject, Injectable, Optional } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import {
  BotProviderKeyService,
  ProviderKeyService,
  ComplexityRoutingConfigService,
  BotModelService,
  ModelAvailabilityService,
} from '@app/db';
import {
  ComplexityClassifierService,
  type ComplexityLevel,
  COMPLEXITY_LEVELS,
} from '@app/clients/internal/complexity-classifier';

/**
 * Bot 可用模型信息
 */
export interface BotAvailableModel {
  providerKeyId: string;
  vendor: string;
  apiType: string | null;
  baseUrl: string | null;
  model: string;
  isPrimary: boolean;
}

/**
 * 复杂度路由结果
 */
export interface ComplexityRouteResult {
  /** 选中的模型 */
  model: string;
  /** Provider vendor */
  vendor: string;
  /** API type */
  apiType: string | null;
  /** Base URL */
  baseUrl: string | null;
  /** Provider Key ID */
  providerKeyId: string;
  /** 复杂度级别 */
  complexity: ComplexityLevel;
  /** 分类延迟 (ms) */
  classifyLatencyMs: number;
  /** 路由原因 */
  reason: string;
}

/**
 * 复杂度到模型的映射配置
 */
interface ComplexityModelMapping {
  super_easy: { vendor: string; model: string };
  easy: { vendor: string; model: string };
  medium: { vendor: string; model: string };
  hard: { vendor: string; model: string };
  super_hard: { vendor: string; model: string };
}

/**
 * 默认复杂度到模型的映射
 * 按成本从低到高排序
 */
const DEFAULT_COMPLEXITY_MAPPING: ComplexityModelMapping = {
  super_easy: { vendor: 'deepseek', model: 'deepseek-v3' },
  easy: { vendor: 'deepseek', model: 'deepseek-v3' },
  medium: { vendor: 'openai', model: 'gpt-4o' },
  hard: { vendor: 'anthropic', model: 'claude-sonnet-4-20250514' },
  super_hard: { vendor: 'anthropic', model: 'claude-opus-4-20250514' },
};

/**
 * 模型能力评分（用于在 bot 可用模型中选择最佳匹配）
 * 分数越高表示能力越强
 */
const MODEL_CAPABILITY_SCORES: Record<string, number> = {
  // Anthropic
  'claude-opus-4-20250514': 100,
  'claude-sonnet-4-20250514': 85,
  'claude-3-5-haiku-20241022': 60,
  // OpenAI
  o1: 95,
  'o3-mini': 80,
  'gpt-4o': 82,
  'gpt-4o-mini': 55,
  'gpt-4-turbo': 78,
  // DeepSeek
  'deepseek-reasoner': 88,
  'deepseek-v3': 70,
  'deepseek-chat': 65,
  // Google
  'gemini-2.0-flash': 68,
  'gemini-1.5-pro': 75,
  // Others
  'llama-3.3-70b-versatile': 62,
};

/**
 * 复杂度级别对应的最低能力分数
 */
const COMPLEXITY_MIN_SCORES: Record<ComplexityLevel, number> = {
  super_easy: 0,
  easy: 50,
  medium: 65,
  hard: 80,
  super_hard: 90,
};

/**
 * BotComplexityRoutingService
 *
 * 负责根据请求复杂度和 bot 可用模型选择最佳模型
 *
 * 工作流程：
 * 1. 获取 bot 的所有可用模型
 * 2. 分类请求复杂度
 * 3. 从可用模型中选择满足复杂度要求的最佳模型
 */
@Injectable()
export class BotComplexityRoutingService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly botProviderKeyService: BotProviderKeyService,
    private readonly providerKeyService: ProviderKeyService,
    private readonly complexityRoutingConfigDb: ComplexityRoutingConfigService,
    private readonly botModelService: BotModelService,
    private readonly modelAvailabilityService: ModelAvailabilityService,
    @Optional()
    private readonly complexityClassifier?: ComplexityClassifierService,
  ) {}

  /**
   * 根据复杂度路由请求
   *
   * @param botId Bot ID
   * @param message 用户消息
   * @param hasTools 是否有工具调用
   * @param context 上下文消息
   * @returns 路由结果，如果无法路由则返回 null
   */
  async routeByComplexity(
    botId: string,
    message: string,
    hasTools: boolean = false,
    context?: string,
  ): Promise<ComplexityRouteResult | null> {
    // 1. 检查是否有复杂度分类器
    if (!this.complexityClassifier) {
      this.logger.debug(
        '[BotComplexityRouting] Complexity classifier not available',
      );
      return null;
    }

    // 2. 获取 bot 的可用模型
    const availableModels = await this.getBotAvailableModels(botId);
    if (availableModels.length === 0) {
      this.logger.warn(
        `[BotComplexityRouting] No available models for bot ${botId}`,
      );
      return null;
    }

    // 3. 获取复杂度路由配置
    const routingConfig = await this.getComplexityRoutingConfig();
    if (!routingConfig || !routingConfig.enabled) {
      this.logger.debug(
        '[BotComplexityRouting] Complexity routing not enabled',
      );
      return null;
    }

    // 4. 分类请求复杂度
    const classifyResult = await this.complexityClassifier.classify({
      message,
      context,
      hasTools,
    });

    // 5. 应用工具调用的最低复杂度
    let finalLevel = classifyResult.level;
    if (hasTools && routingConfig.toolMinComplexity) {
      finalLevel = this.complexityClassifier.ensureMinComplexity(
        classifyResult.level,
        routingConfig.toolMinComplexity,
      );
    }

    // 6. 从可用模型中选择最佳模型
    const selectedModel = this.selectBestModel(
      availableModels,
      finalLevel,
      routingConfig.models,
    );

    if (!selectedModel) {
      this.logger.warn(
        `[BotComplexityRouting] No suitable model found for complexity ${finalLevel}`,
      );
      return null;
    }

    this.logger.info('[BotComplexityRouting] Route decision', {
      botId,
      complexity: finalLevel,
      originalComplexity: classifyResult.level,
      selectedModel: selectedModel.model,
      vendor: selectedModel.vendor,
      latencyMs: classifyResult.latencyMs,
    });

    return {
      model: selectedModel.model,
      vendor: selectedModel.vendor,
      apiType: selectedModel.apiType,
      baseUrl: selectedModel.baseUrl,
      providerKeyId: selectedModel.providerKeyId,
      complexity: finalLevel,
      classifyLatencyMs: classifyResult.latencyMs,
      reason: `Complexity routing: ${finalLevel} -> ${selectedModel.vendor}/${selectedModel.model}`,
    };
  }

  /**
   * 获取 bot 的所有可用模型
   *
   * 优先使用新的 BotModel 表，如果没有数据则回退到 BotProviderKey 表
   */
  async getBotAvailableModels(botId: string): Promise<BotAvailableModel[]> {
    // 首先尝试从新的 BotModel 表获取
    const { list: botModels } = await this.botModelService.list(
      { botId, isEnabled: true },
      { limit: 100 },
    );

    if (botModels.length > 0) {
      return this.getBotAvailableModelsFromBotModel(botModels);
    }

    // 回退到旧的 BotProviderKey 表
    return this.getBotAvailableModelsFromBotProviderKey(botId);
  }

  /**
   * 从新的 BotModel 表获取可用模型
   * vendor 信息从 ProviderKey 获取，不再从 ModelAvailability 获取
   */
  private async getBotAvailableModelsFromBotModel(
    botModels: Array<{ modelId: string; isPrimary: boolean }>,
  ): Promise<BotAvailableModel[]> {
    const availableModels: BotAvailableModel[] = [];

    for (const bm of botModels) {
      // 从 ModelAvailability 表获取模型的 provider key 信息
      const { list: availabilities } = await this.modelAvailabilityService.list(
        { model: bm.modelId, isAvailable: true },
        { limit: 1 },
      );

      if (availabilities.length === 0) continue;

      const availability = availabilities[0];
      const providerKey = await this.providerKeyService.getById(
        availability.providerKeyId,
      );
      if (!providerKey) continue;

      availableModels.push({
        providerKeyId: availability.providerKeyId,
        vendor: providerKey.vendor, // 从 ProviderKey 获取 vendor
        apiType: providerKey.apiType,
        baseUrl: providerKey.baseUrl,
        model: bm.modelId,
        isPrimary: bm.isPrimary,
      });
    }

    return availableModels;
  }

  /**
   * 从旧的 BotProviderKey 表获取可用模型（向后兼容）
   */
  private async getBotAvailableModelsFromBotProviderKey(
    botId: string,
  ): Promise<BotAvailableModel[]> {
    const { list: botProviderKeys } = await this.botProviderKeyService.list(
      { botId },
      { limit: 100 },
    );

    const availableModels: BotAvailableModel[] = [];

    for (const bpk of botProviderKeys) {
      const providerKey = await this.providerKeyService.getById(
        bpk.providerKeyId,
      );
      if (!providerKey) continue;

      // 添加主要模型
      if (bpk.primaryModel) {
        availableModels.push({
          providerKeyId: bpk.providerKeyId,
          vendor: providerKey.vendor,
          apiType: providerKey.apiType,
          baseUrl: providerKey.baseUrl,
          model: bpk.primaryModel,
          isPrimary: bpk.isPrimary,
        });
      }

      // 添加允许的模型
      for (const model of bpk.allowedModels) {
        if (model !== bpk.primaryModel) {
          availableModels.push({
            providerKeyId: bpk.providerKeyId,
            vendor: providerKey.vendor,
            apiType: providerKey.apiType,
            baseUrl: providerKey.baseUrl,
            model,
            isPrimary: false,
          });
        }
      }
    }

    return availableModels;
  }

  /**
   * 获取复杂度路由配置
   */
  private async getComplexityRoutingConfig(): Promise<{
    enabled: boolean;
    models: ComplexityModelMapping;
    toolMinComplexity?: ComplexityLevel;
  } | null> {
    try {
      const { list: configs } = await this.complexityRoutingConfigDb.list(
        { isEnabled: true },
        { orderBy: { createdAt: 'asc' }, limit: 1 },
      );

      if (configs.length === 0) {
        return null;
      }

      const config = configs[0];
      return {
        enabled: true,
        models: config.models as unknown as ComplexityModelMapping,
        toolMinComplexity: config.toolMinComplexity as
          | ComplexityLevel
          | undefined,
      };
    } catch (error) {
      this.logger.error(
        '[BotComplexityRouting] Failed to load complexity routing config',
        { error },
      );
      return null;
    }
  }

  /**
   * 从可用模型中选择最佳模型
   *
   * 选择策略：
   * 1. 首先尝试匹配配置中指定的模型
   * 2. 如果没有匹配，选择满足复杂度要求的最佳可用模型
   * 3. 如果仍然没有，选择能力最强的可用模型
   */
  private selectBestModel(
    availableModels: BotAvailableModel[],
    complexity: ComplexityLevel,
    configMapping: ComplexityModelMapping,
  ): BotAvailableModel | null {
    if (availableModels.length === 0) {
      return null;
    }

    // 1. 尝试匹配配置中指定的模型
    const configModel = configMapping[complexity];
    const exactMatch = availableModels.find(
      (m) =>
        m.vendor === configModel.vendor &&
        (m.model === configModel.model ||
          m.model.includes(configModel.model) ||
          configModel.model.includes(m.model)),
    );

    if (exactMatch) {
      return exactMatch;
    }

    // 2. 选择满足复杂度要求的最佳可用模型
    const minScore = COMPLEXITY_MIN_SCORES[complexity];
    const qualifiedModels = availableModels.filter((m) => {
      const score = this.getModelCapabilityScore(m.model);
      return score >= minScore;
    });

    if (qualifiedModels.length > 0) {
      // 按能力分数排序，选择最接近要求的（避免过度使用高端模型）
      qualifiedModels.sort((a, b) => {
        const scoreA = this.getModelCapabilityScore(a.model);
        const scoreB = this.getModelCapabilityScore(b.model);
        // 选择分数最接近 minScore 的模型（成本优化）
        return Math.abs(scoreA - minScore) - Math.abs(scoreB - minScore);
      });
      return qualifiedModels[0];
    }

    // 3. 如果没有满足要求的模型，选择能力最强的
    const sortedByCapability = [...availableModels].sort((a, b) => {
      const scoreA = this.getModelCapabilityScore(a.model);
      const scoreB = this.getModelCapabilityScore(b.model);
      return scoreB - scoreA;
    });

    return sortedByCapability[0];
  }

  /**
   * 获取模型能力分数
   */
  private getModelCapabilityScore(model: string): number {
    // 精确匹配
    if (MODEL_CAPABILITY_SCORES[model]) {
      return MODEL_CAPABILITY_SCORES[model];
    }

    // 模糊匹配
    for (const [key, score] of Object.entries(MODEL_CAPABILITY_SCORES)) {
      if (model.includes(key) || key.includes(model)) {
        return score;
      }
    }

    // 默认分数
    return 50;
  }
}
