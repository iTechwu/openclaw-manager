import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import {
  ProviderKeyService,
  ModelAvailabilityService,
  ModelCatalogService,
} from '@app/db';
import { EncryptionService } from './encryption.service';
import { CapabilityTagMatchingService } from './capability-tag-matching.service';
import {
  PROVIDER_CONFIGS,
  type ProviderVendor,
  type ModelType as ApiModelType,
} from '@repo/contracts';
import type { ModelType } from '@prisma/client';

/**
 * 模型名称模式匹配规则
 * 用于根据模型名称推断模型类型
 */
const MODEL_TYPE_PATTERNS: Array<{
  patterns: RegExp[];
  type: ModelType;
}> = [
  // 图像生成模型
  {
    patterns: [
      /dall-e/i,
      /gpt-image/i,
      /midjourney/i,
      /flux/i,
      /ideogram/i,
      /seedream/i,
      /kling-image/i,
      /grok-.*-image/i,
      /stable-diffusion/i,
      /sd-/i,
      /sdxl/i,
    ],
    type: 'image',
  },
  // 视频生成模型
  {
    patterns: [
      /sora/i,
      /veo/i,
      /kling-v/i,
      /kling-video/i,
      /hailuo/i,
      /viduq/i,
      /wan-/i,
      /wan2/i,
      /seedance/i,
      /pika/i,
      /runway/i,
    ],
    type: 'video',
  },
  // 语音合成模型 (TTS)
  {
    patterns: [/tts/i, /speech/i],
    type: 'tts',
  },
  // 语音识别模型 (STT)
  {
    patterns: [/whisper/i, /stt/i, /transcribe/i, /asr/i],
    type: 'speech2text',
  },
  // 向量嵌入模型
  {
    patterns: [/embed/i, /embedding/i, /text-embedding/i, /bge-/i],
    type: 'text_embedding',
  },
  // 重排序模型
  {
    patterns: [/rerank/i, /re-rank/i],
    type: 'rerank',
  },
  // 内容审核模型
  {
    patterns: [/moderation/i, /content-filter/i],
    type: 'moderation',
  },
];

/**
 * 模型验证结果
 */
export interface ModelVerificationResult {
  model: string;
  isAvailable: boolean;
  latencyMs?: number;
  errorMessage?: string;
}

/**
 * 批量验证结果
 */
export interface BatchVerifyResult {
  total: number;
  verified: number;
  available: number;
  failed: number;
  results: ModelVerificationResult[];
}

/**
 * ModelVerificationService
 *
 * 负责验证 API Key 的有效性并缓存结果
 *
 * 功能：
 * 1. 刷新模型列表（从 /models 端点获取并写入 ModelAvailability）
 * 2. 验证单个模型的可用性
 * 3. 批量验证未验证的模型（增量验证）
 */
@Injectable()
export class ModelVerificationService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly providerKeyService: ProviderKeyService,
    private readonly modelAvailabilityService: ModelAvailabilityService,
    private readonly modelCatalogService: ModelCatalogService,
    private readonly encryptionService: EncryptionService,
    private readonly capabilityTagMatchingService: CapabilityTagMatchingService,
  ) {}

  /**
   * 根据模型名称推断模型类型
   * @param modelName 模型名称
   * @returns 模型类型，默认为 llm
   */
  private classifyModelType(modelName: string): ModelType {
    for (const { patterns, type } of MODEL_TYPE_PATTERNS) {
      for (const pattern of patterns) {
        if (pattern.test(modelName)) {
          return type;
        }
      }
    }
    // 默认为对话模型
    return 'llm';
  }

  /**
   * 判断是否需要二次验证
   * 国内云平台的 /models 通常会返回全量模型列表，但未开通的模型无法使用，
   * 因此需要标记为 isAvailable=false，由用户手动验证。
   * @param baseUrl Provider 的 baseUrl
   * @param vendor  Provider vendor 名称
   * @returns 是否需要验证
   */
  private requiresVerification(
    baseUrl?: string | null,
    vendor?: string,
  ): boolean {
    // 按 vendor 判断：国内云平台需要开通模型才能使用
    const vendorsRequiringVerification = [
      'doubao', // 字节豆包（火山云）
      'dashscope', // 阿里百炼
      'hunyuan', // 腾讯混元
      'tencent-cloud-ti', // 腾讯云 TI
      'baidu-cloud', // 百度云千帆
      'modelscope', // 魔搭
      'xirang', // 天翼云息壤
    ];
    if (vendor && vendorsRequiringVerification.includes(vendor)) {
      return true;
    }

    // 按 baseUrl 域名兜底判断
    if (!baseUrl) return false;
    const domainsRequiringVerification = [
      'volces.com',
      'dashscope.aliyuncs.com',
      'hunyuan.cloud.tencent.com',
      'lkeap.cloud.tencent.com',
      'qianfan.baidubce.com',
    ];
    return domainsRequiringVerification.some((domain) =>
      baseUrl.includes(domain),
    );
  }

  /**
   * 刷新所有 ProviderKeys 的模型列表（仅获取，不验证）
   * 遍历所有 ProviderKeys，从各自的端点获取最新的模型列表
   */
  async refreshAllModels(): Promise<{
    totalProviderKeys: number;
    successCount: number;
    failedCount: number;
    totalModels: number;
    totalAdded: number;
    totalRemoved: number;
    results: Array<{
      providerKeyId: string;
      label: string;
      vendor: string;
      success: boolean;
      models?: string[];
      addedCount?: number;
      removedCount?: number;
      error?: string;
    }>;
  }> {
    // 获取所有未删除的 ProviderKeys
    const { list: providerKeys } = await this.providerKeyService.list(
      {},
      { limit: 1000 },
    );

    this.logger.info(
      `[ModelVerification] Refreshing models for all ${providerKeys.length} provider keys`,
    );

    const results: Array<{
      providerKeyId: string;
      label: string;
      vendor: string;
      success: boolean;
      models?: string[];
      addedCount?: number;
      removedCount?: number;
      error?: string;
    }> = [];

    let successCount = 0;
    let failedCount = 0;
    let totalModels = 0;
    let totalAdded = 0;
    let totalRemoved = 0;

    for (const providerKey of providerKeys) {
      try {
        const result = await this.refreshModels(providerKey.id);
        results.push({
          providerKeyId: providerKey.id,
          label: providerKey.label,
          vendor: providerKey.vendor,
          success: true,
          models: result.models,
          addedCount: result.addedCount,
          removedCount: result.removedCount,
        });
        successCount++;
        totalModels += result.models.length;
        totalAdded += result.addedCount;
        totalRemoved += result.removedCount;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        results.push({
          providerKeyId: providerKey.id,
          label: providerKey.label,
          vendor: providerKey.vendor,
          success: false,
          error: errorMessage,
        });
        failedCount++;
        this.logger.warn(
          `[ModelVerification] Failed to refresh models for provider key ${providerKey.id}: ${errorMessage}`,
        );
      }

      // 添加延迟以避免 API 限流
      await this.delay(500);
    }

    this.logger.info(
      `[ModelVerification] Refresh all completed: ${successCount}/${providerKeys.length} succeeded, ${totalModels} total models, ${totalAdded} added, ${totalRemoved} removed`,
    );

    return {
      totalProviderKeys: providerKeys.length,
      successCount,
      failedCount,
      totalModels,
      totalAdded,
      totalRemoved,
      results,
    };
  }

  /**
   * 批量验证所有不可用的模型（增量验证）
   * 遍历所有 ProviderKeys，验证 isAvailable=false 的模型
   */
  async batchVerifyAllUnavailable(): Promise<{
    totalProviderKeys: number;
    totalVerified: number;
    totalAvailable: number;
    totalFailed: number;
    results: Array<{
      providerKeyId: string;
      label: string;
      vendor: string;
      verified: number;
      available: number;
      failed: number;
    }>;
  }> {
    // 获取所有未删除的 ProviderKeys
    const { list: providerKeys } = await this.providerKeyService.list(
      {},
      { limit: 1000 },
    );

    this.logger.info(
      `[ModelVerification] Batch verifying unavailable models for all ${providerKeys.length} provider keys`,
    );

    const results: Array<{
      providerKeyId: string;
      label: string;
      vendor: string;
      verified: number;
      available: number;
      failed: number;
    }> = [];

    let totalVerified = 0;
    let totalAvailable = 0;
    let totalFailed = 0;

    for (const providerKey of providerKeys) {
      try {
        const result = await this.batchVerifyUnverified(providerKey.id);
        results.push({
          providerKeyId: providerKey.id,
          label: providerKey.label,
          vendor: providerKey.vendor,
          verified: result.verified,
          available: result.available,
          failed: result.failed,
        });
        totalVerified += result.verified;
        totalAvailable += result.available;
        totalFailed += result.failed;
      } catch (error) {
        this.logger.warn(
          `[ModelVerification] Failed to batch verify for provider key ${providerKey.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.info(
      `[ModelVerification] Batch verify all completed: ${totalVerified} verified, ${totalAvailable} available, ${totalFailed} failed`,
    );

    return {
      totalProviderKeys: providerKeys.length,
      totalVerified,
      totalAvailable,
      totalFailed,
      results,
    };
  }

  /**
   * 刷新模型列表（仅获取，不验证）
   * 从 Provider 端点获取最新的模型列表并更新数据库
   */
  async refreshModels(providerKeyId: string): Promise<{
    models: string[];
    addedCount: number;
    removedCount: number;
  }> {
    const providerKey = await this.providerKeyService.getById(providerKeyId);
    if (!providerKey) {
      throw new Error(`Provider key not found: ${providerKeyId}`);
    }

    const { vendor, apiType, secretEncrypted, baseUrl } = providerKey;
    const apiKey = this.encryptionService.decrypt(Buffer.from(secretEncrypted));
    const effectiveApiType = apiType || this.inferApiType(vendor);

    // 如果 ProviderKey 没有设置 baseUrl，回退到 PROVIDER_CONFIGS 中的默认 apiHost
    const providerConfig = PROVIDER_CONFIGS[vendor as ProviderVendor];
    const effectiveBaseUrl = baseUrl || providerConfig?.apiHost || null;

    this.logger.info(
      `[ModelVerification] Refreshing models for provider key: vendor=${vendor}, apiType=${effectiveApiType}, baseUrl=${effectiveBaseUrl}`,
    );

    // 从端点获取模型列表
    const models = await this.fetchAvailableModels(
      apiKey,
      effectiveBaseUrl,
      effectiveApiType,
    );

    // 获取当前数据库中的模型列表
    const { list: existingRecords } = await this.modelAvailabilityService.list(
      { providerKeyId },
      { limit: 1000 },
    );
    const existingModels = new Set(existingRecords.map((r) => r.model));

    // 计算新增和移除的模型
    const newModels = models.filter((m) => !existingModels.has(m));
    const removedModels = existingRecords.filter(
      (r) => !models.includes(r.model),
    );

    // 判断是否需要二次验证（火山云、阿里云百炼等需要开通的平台）
    const needsVerification = this.requiresVerification(
      effectiveBaseUrl,
      vendor,
    );

    // 添加新模型
    const createdModelCatalogs: Array<{ catalogId: string; model: string }> =
      [];
    for (const model of newModels) {
      const modelType = this.classifyModelType(model);

      // 查找对应的 ModelCatalog 记录
      const catalog = await this.modelCatalogService.getByModel(model);

      const created = await this.modelAvailabilityService.create({
        model,
        providerKey: { connect: { id: providerKeyId } },
        modelType,
        // volces.com 的模型需要验证，默认不可用；其他默认可用
        isAvailable: !needsVerification,
        lastVerifiedAt: needsVerification ? new Date(0) : new Date(),
        errorMessage: needsVerification ? 'Not verified yet' : null,
        // 关联 ModelCatalog（如果存在）
        ...(catalog ? { modelCatalog: { connect: { id: catalog.id } } } : {}),
      });

      if (catalog) {
        createdModelCatalogs.push({
          catalogId: catalog.id,
          model: created.model,
        });
      }
    }

    // 为新关联的 ModelCatalog 分配能力标签
    for (const { catalogId, model } of createdModelCatalogs) {
      try {
        await this.capabilityTagMatchingService.assignTagsToModelCatalog(
          catalogId,
          model,
          vendor,
        );
      } catch (error) {
        this.logger.warn(
          `[ModelVerification] Failed to assign capability tags for model ${model}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // 删除不再存在的模型
    for (const record of removedModels) {
      await this.modelAvailabilityService.delete({ id: record.id });
    }

    this.logger.info(
      `[ModelVerification] Refreshed models: ${models.length} total, ${newModels.length} added, ${removedModels.length} removed`,
    );

    return {
      models,
      addedCount: newModels.length,
      removedCount: removedModels.length,
    };
  }

  /**
   * 验证单个模型的可用性
   * 通过实际调用模型 API 验证
   */
  async verifySingleModel(
    providerKeyId: string,
    model: string,
  ): Promise<ModelVerificationResult> {
    const providerKey = await this.providerKeyService.getById(providerKeyId);
    if (!providerKey) {
      throw new Error(`Provider key not found: ${providerKeyId}`);
    }

    const { vendor, apiType, secretEncrypted, baseUrl } = providerKey;
    const apiKey = this.encryptionService.decrypt(Buffer.from(secretEncrypted));
    const effectiveApiType = apiType || this.inferApiType(vendor);

    // 回退到 PROVIDER_CONFIGS 中的默认 apiHost
    const providerConfig = PROVIDER_CONFIGS[vendor as ProviderVendor];
    const effectiveBaseUrl = baseUrl || providerConfig?.apiHost || null;

    this.logger.info(
      `[ModelVerification] Verifying single model: ${model}, vendor=${vendor}, apiType=${effectiveApiType}`,
    );

    const result = await this.verifyModel(
      effectiveApiType,
      model,
      apiKey,
      effectiveBaseUrl,
    );

    // 更新数据库记录
    await this.updateModelAvailability(
      providerKeyId,
      model,
      result.isAvailable,
      result.errorMessage,
    );

    return result;
  }

  /**
   * 批量验证模型（强制验证）
   * 验证该 providerKey 下的所有模型，无论当前状态
   */
  async batchVerifyUnverified(
    providerKeyId: string,
  ): Promise<BatchVerifyResult> {
    const providerKey = await this.providerKeyService.getById(providerKeyId);
    if (!providerKey) {
      throw new Error(`Provider key not found: ${providerKeyId}`);
    }

    const { vendor, apiType, secretEncrypted, baseUrl } = providerKey;
    const apiKey = this.encryptionService.decrypt(Buffer.from(secretEncrypted));
    const effectiveApiType = apiType || this.inferApiType(vendor);

    // 回退到 PROVIDER_CONFIGS 中的默认 apiHost
    const providerConfig = PROVIDER_CONFIGS[vendor as ProviderVendor];
    const effectiveBaseUrl = baseUrl || providerConfig?.apiHost || null;

    // 获取该 providerKey 下的所有模型，强制重新验证
    const { list: unverifiedRecords } =
      await this.modelAvailabilityService.list(
        {
          providerKeyId,
        },
        { limit: 1000 },
      );

    this.logger.info(
      `[ModelVerification] Batch verifying ${unverifiedRecords.length} models for provider key: ${providerKeyId}`,
    );

    const results: ModelVerificationResult[] = [];
    let available = 0;
    let failed = 0;

    for (const record of unverifiedRecords) {
      const result = await this.verifyModel(
        effectiveApiType,
        record.model,
        apiKey,
        effectiveBaseUrl,
      );

      // 更新数据库记录
      await this.updateModelAvailability(
        providerKeyId,
        record.model,
        result.isAvailable,
        result.errorMessage,
      );

      results.push(result);

      if (result.isAvailable) {
        available++;
      } else {
        failed++;
      }

      // 添加延迟以避免 API 限流
      await this.delay(1000);
    }

    this.logger.info(
      `[ModelVerification] Batch verification completed: ${available} available, ${failed} failed`,
    );

    return {
      total: unverifiedRecords.length,
      verified: results.length,
      available,
      failed,
      results,
    };
  }

  /**
   * 获取所有 ModelAvailability 记录（包含关联数据）
   */
  async getAllModelAvailability(providerKeyId?: string): Promise<
    Array<{
      id: string;
      model: string;
      providerKeyId: string;
      modelType: ApiModelType;
      isAvailable: boolean;
      lastVerifiedAt: Date;
      errorMessage: string | null;
      modelPricingId: string | null;
      capabilityTags: Array<{ id: string; name: string }>;
      providerKeys: Array<{
        id: string;
        vendor: string;
        apiType: string;
        label: string | null;
      }>;
    }>
  > {
    const filter = providerKeyId ? { providerKeyId } : {};
    const { list } = await this.modelAvailabilityService.list(
      filter,
      { limit: 1000 },
      {
        include: {
          providerKey: true,
          modelPricing: true,
          capabilityTags: {
            include: {
              capabilityTag: true,
            },
          },
        },
      } as any,
    );

    // Map Prisma enum values to API schema values (text_embedding -> text-embedding)
    return list.map((item: any) => ({
      id: item.id,
      model: item.model,
      providerKeyId: item.providerKeyId,
      modelType: (item.modelType === 'text_embedding'
        ? 'text-embedding'
        : item.modelType) as ApiModelType,
      isAvailable: item.isAvailable,
      lastVerifiedAt: item.lastVerifiedAt,
      errorMessage: item.errorMessage,
      modelPricingId: item.modelPricingId,
      capabilityTags:
        item.capabilityTags?.map((mct: any) => ({
          id: mct.capabilityTag?.id ?? mct.capabilityTagId,
          name: mct.capabilityTag?.name ?? 'Unknown',
        })) ?? [],
      providerKeys: item.providerKey
        ? [
            {
              id: item.providerKey.id,
              vendor: item.providerKey.vendor,
              apiType: item.providerKey.apiType ?? 'openai',
              label: item.providerKey.label ?? null,
            },
          ]
        : [],
    }));
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 根据 vendor 推断 API 类型
   */
  private inferApiType(vendor: string): string {
    const vendorToApiType: Record<string, string> = {
      openai: 'openai',
      anthropic: 'anthropic',
      google: 'gemini',
      deepseek: 'openai', // DeepSeek 使用 OpenAI 兼容 API
      groq: 'openai', // Groq 使用 OpenAI 兼容 API
      mistral: 'openai', // Mistral 使用 OpenAI 兼容 API
      custom: 'openai', // 默认使用 OpenAI 兼容 API
    };
    return vendorToApiType[vendor] || 'openai';
  }

  /**
   * 从 /models 端点动态获取可用模型列表
   * 根据 apiType 决定 API 调用方式和响应解析
   */
  private async fetchAvailableModels(
    apiKey: string,
    baseUrl?: string | null,
    apiType?: string | null,
  ): Promise<string[]> {
    if (!baseUrl) {
      this.logger.debug(
        '[ModelVerification] No baseUrl provided, skipping model fetch',
      );
      return [];
    }

    const effectiveApiType = apiType || 'openai';

    try {
      switch (effectiveApiType) {
        case 'anthropic':
          // Anthropic 没有公开的 /models 端点，使用默认列表
          this.logger.debug(
            '[ModelVerification] Anthropic API does not have /models endpoint',
          );
          return [];

        case 'gemini':
          return this.fetchGeminiModels(baseUrl, apiKey);

        default:
          // OpenAI 兼容 API（openai, new-api, gateway, ollama 等）
          return this.fetchOpenAICompatibleModels(baseUrl, apiKey);
      }
    } catch (error) {
      this.logger.warn('[ModelVerification] Error fetching models', {
        error: error instanceof Error ? error.message : String(error),
        baseUrl,
        apiType: effectiveApiType,
      });
      return [];
    }
  }

  /**
   * 从 OpenAI 兼容 API 获取模型列表
   */
  private async fetchOpenAICompatibleModels(
    baseUrl: string,
    apiKey: string,
  ): Promise<string[]> {
    const url = `${baseUrl}/models`;
    const headers = this.getAuthHeaders('openai', apiKey);

    try {
      this.logger.info(`[ModelVerification] Fetching models from: ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        this.logger.warn(
          `[ModelVerification] Failed to fetch models: ${response.status}`,
        );
        return [];
      }

      const data = (await response.json()) as {
        data?: Array<{ id: string; owned_by?: string }>;
        object?: string;
      };

      if (data.data && Array.isArray(data.data)) {
        const chatModels = data.data.map((m) => m.id);

        this.logger.info(
          `[ModelVerification] Found ${chatModels.length} chat models from endpoint`,
        );

        return chatModels;
      }
    } catch (error) {
      this.logger.warn('[ModelVerification] Error fetching OpenAI models', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return [];
  }

  /**
   * 从 Gemini API 获取模型列表
   */
  private async fetchGeminiModels(
    baseUrl: string,
    apiKey: string,
  ): Promise<string[]> {
    const url = `${baseUrl}/v1beta/models?key=${apiKey}`;

    this.logger.info(`[ModelVerification] Fetching Gemini models from: ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      this.logger.warn(
        `[ModelVerification] Failed to fetch Gemini models: ${response.status}`,
      );
      return [];
    }

    const data = (await response.json()) as {
      models?: Array<{ name: string; supportedGenerationMethods?: string[] }>;
    };

    if (data.models && Array.isArray(data.models)) {
      // 过滤出支持 generateContent 的模型
      const chatModels = data.models
        .filter((m) =>
          m.supportedGenerationMethods?.includes('generateContent'),
        )
        .map((m) => m.name.replace('models/', ''))
        .slice(0, 20);

      this.logger.info(
        `[ModelVerification] Found ${chatModels.length} Gemini chat models`,
      );

      return chatModels;
    }

    return [];
  }

  /**
   * 验证单个模型的可用性
   */
  private async verifyModel(
    apiType: string,
    model: string,
    apiKey: string,
    baseUrl?: string | null,
  ): Promise<ModelVerificationResult> {
    const startTime = Date.now();

    try {
      // 根据 apiType 选择验证方法
      const isAvailable = await this.callModelApi(
        apiType,
        model,
        apiKey,
        baseUrl,
      );
      const latencyMs = Date.now() - startTime;

      return {
        model,
        isAvailable,
        latencyMs,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        model,
        isAvailable: false,
        errorMessage,
      };
    }
  }

  /**
   * 调用模型 API 验证可用性
   * 通过实际发送请求到模型来验证是否可用
   */
  private async callModelApi(
    apiType: string,
    model: string,
    apiKey: string,
    baseUrl?: string | null,
  ): Promise<boolean> {
    // 优先使用 baseUrl，否则根据 apiType 获取默认 host
    const providerConfig = PROVIDER_CONFIGS[apiType as ProviderVendor];
    const apiHost = baseUrl || providerConfig?.apiHost;

    if (!apiHost) {
      throw new Error(`No API host for apiType: ${apiType}`);
    }

    // 根据 apiType 选择不同的验证方式（都是通过实际调用模型来验证）
    switch (apiType) {
      case 'anthropic':
        return this.verifyChatModel(apiHost, apiKey, model, 'anthropic');
      case 'gemini':
        return this.verifyGeminiModel(apiHost, apiKey, model);
      case 'azure-openai':
        return this.verifyAzureOpenAIModel(apiHost, apiKey, model);
      default:
        // OpenAI 兼容 API（openai, new-api, gateway, ollama 等）
        return this.verifyChatModel(apiHost, apiKey, model, 'openai');
    }
  }

  /**
   * 通过 chat/completions 或 messages 端点验证模型
   * 适用于 OpenAI 兼容 API 和 Anthropic
   */
  private async verifyChatModel(
    apiHost: string,
    apiKey: string,
    model: string,
    apiType: 'openai' | 'anthropic',
  ): Promise<boolean> {
    const isAnthropic = apiType === 'anthropic';

    // 构建 URL
    const url = isAnthropic
      ? `${apiHost}/messages`
      : `${apiHost}/chat/completions`;

    // 构建请求头
    const headers = {
      ...this.getAuthHeaders(apiType, apiKey),
      'Content-Type': 'application/json',
    };

    // 构建最小请求体
    const body = JSON.stringify({
      model,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'Hi' }],
    });

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(15000),
    });

    if (response.ok) {
      return true;
    }

    // 401/403 表示认证失败
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Authentication failed: ${response.status}`);
    }

    // 400/404 可能是模型不存在
    if (response.status === 400 || response.status === 404) {
      const errorData = (await response.json().catch(() => ({}))) as {
        error?: { message?: string; code?: string };
      };
      const errorMsg = errorData.error?.message || '';
      if (
        errorMsg.includes('model') ||
        errorMsg.includes('not found') ||
        errorMsg.includes('does not exist')
      ) {
        throw new Error(`Model not available: ${model}`);
      }
    }

    // 429 表示限流，但 API Key 和模型有效
    if (response.status === 429) {
      return true;
    }

    // 其他错误，假设模型可用（可能是临时问题）
    return true;
  }

  /**
   * 验证 Gemini 模型（使用 generateContent 端点）
   */
  private async verifyGeminiModel(
    apiHost: string,
    apiKey: string,
    model: string,
  ): Promise<boolean> {
    const url = `${apiHost}/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const body = JSON.stringify({
      contents: [{ parts: [{ text: 'Hi' }] }],
      generationConfig: { maxOutputTokens: 1 },
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(15000),
    });

    if (response.ok) {
      return true;
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error(`Authentication failed: ${response.status}`);
    }

    if (response.status === 404) {
      throw new Error(`Model not available: ${model}`);
    }

    // 429 表示限流，但 API Key 和模型有效
    if (response.status === 429) {
      return true;
    }

    return true;
  }

  /**
   * 验证 Azure OpenAI 模型
   */
  private async verifyAzureOpenAIModel(
    apiHost: string,
    apiKey: string,
    model: string,
  ): Promise<boolean> {
    const url = `${apiHost}/openai/deployments/${model}/chat/completions?api-version=2024-02-15-preview`;
    const headers = {
      ...this.getAuthHeaders('azure-openai', apiKey),
      'Content-Type': 'application/json',
    };

    const body = JSON.stringify({
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 1,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(15000),
    });

    if (response.ok) {
      return true;
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error(`Authentication failed: ${response.status}`);
    }

    if (response.status === 404) {
      throw new Error(`Deployment not found: ${model}`);
    }

    // 429 表示限流，但 API Key 有效
    if (response.status === 429) {
      return true;
    }

    return true;
  }

  /**
   * 获取认证头
   */
  private getAuthHeaders(
    apiType: string,
    apiKey: string,
  ): Record<string, string> {
    switch (apiType) {
      case 'anthropic':
        return {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        };
      case 'azure-openai':
        return {
          'api-key': apiKey,
        };
      case 'gemini':
        // Gemini 使用 URL 参数，这里返回空
        return {};
      default:
        return {
          Authorization: `Bearer ${apiKey}`,
        };
    }
  }

  /**
   * 更新或创建 ModelAvailability 记录
   */
  private async updateModelAvailability(
    providerKeyId: string,
    model: string,
    isAvailable: boolean,
    errorMessage?: string,
  ): Promise<void> {
    const existing = await this.modelAvailabilityService.get({
      providerKeyId,
      model,
    });

    const now = new Date();

    if (existing) {
      await this.modelAvailabilityService.update(
        { id: existing.id },
        {
          isAvailable,
          lastVerifiedAt: now,
          errorMessage: errorMessage || null,
        },
      );
    } else {
      await this.modelAvailabilityService.create({
        model,
        providerKey: { connect: { id: providerKeyId } },
        isAvailable,
        lastVerifiedAt: now,
        errorMessage: errorMessage || null,
      });
    }
  }
}
