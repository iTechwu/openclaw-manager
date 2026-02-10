import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ProviderKeyService, ModelAvailabilityService } from '@app/db';
import { EncryptionService } from './encryption.service';
import { PROVIDER_CONFIGS, type ProviderVendor } from '@repo/contracts';

/**
 * 模型验证结果
 */
export interface ModelVerificationResult {
  vendor: string;
  model: string;
  isAvailable: boolean;
  latencyMs?: number;
  errorMessage?: string;
}

/**
 * API 类型到默认模型的映射（作为端点获取失败时的回退）
 */
const API_TYPE_DEFAULT_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022'],
  gemini: ['gemini-2.0-flash', 'gemini-1.5-pro'],
  'azure-openai': ['gpt-4o', 'gpt-4o-mini'],
  ollama: [], // Ollama 需要动态查询
  'new-api': [], // New API 从端点获取
  gateway: [], // Gateway 从端点获取
};

/**
 * ModelVerificationService
 *
 * 负责验证 API Key 的有效性并缓存结果
 *
 * 功能：
 * 1. 验证单个 API Key 对特定模型的可用性
 * 2. 批量验证所有 Provider Key 的模型可用性
 * 3. 定时任务自动刷新验证状态
 */
@Injectable()
export class ModelVerificationService implements OnModuleInit {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly providerKeyService: ProviderKeyService,
    private readonly modelAvailabilityService: ModelAvailabilityService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async onModuleInit() {
    // 启动时执行一次验证（延迟 10 秒，等待其他服务初始化）
    setTimeout(() => {
      this.verifyAllProviderKeys().catch((err) => {
        this.logger.error('[ModelVerification] Initial verification failed', {
          error: err,
        });
      });
    }, 10000);
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

    this.logger.info(
      `[ModelVerification] Refreshing models for provider key: vendor=${vendor}, apiType=${effectiveApiType}`,
    );

    // 从端点获取模型列表
    let models = await this.fetchAvailableModels(
      apiKey,
      baseUrl,
      effectiveApiType,
    );

    // 如果端点获取失败，使用默认模型列表
    if (models.length === 0) {
      models = API_TYPE_DEFAULT_MODELS[effectiveApiType] || [];
    }

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

    // 添加新模型（标记为未验证）
    for (const model of newModels) {
      await this.modelAvailabilityService.create({
        model,
        providerKey: { connect: { id: providerKeyId } },
        isAvailable: false, // 未验证，默认不可用
        lastVerifiedAt: new Date(),
        errorMessage: 'Not verified yet',
      });
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
  ): Promise<{
    model: string;
    isAvailable: boolean;
    latencyMs?: number;
    errorMessage?: string;
  }> {
    const providerKey = await this.providerKeyService.getById(providerKeyId);
    if (!providerKey) {
      throw new Error(`Provider key not found: ${providerKeyId}`);
    }

    const { vendor, apiType, secretEncrypted, baseUrl } = providerKey;
    const apiKey = this.encryptionService.decrypt(Buffer.from(secretEncrypted));
    const effectiveApiType = apiType || this.inferApiType(vendor);

    this.logger.info(
      `[ModelVerification] Verifying single model: ${model}, vendor=${vendor}, apiType=${effectiveApiType}`,
    );

    const result = await this.verifyModel(
      vendor,
      effectiveApiType,
      model,
      apiKey,
      baseUrl,
    );

    // 更新数据库记录
    await this.updateModelAvailability(
      providerKeyId,
      model,
      result.isAvailable,
      result.errorMessage,
    );

    return {
      model: result.model,
      isAvailable: result.isAvailable,
      latencyMs: result.latencyMs,
      errorMessage: result.errorMessage,
    };
  }

  /**
   * 定时任务：每小时验证所有 Provider Key
   */
  @Cron(CronExpression.EVERY_HOUR)
  async scheduledVerification() {
    this.logger.info('[ModelVerification] Starting scheduled verification');
    await this.verifyAllProviderKeys();
  }

  /**
   * 验证所有 Provider Key 的模型可用性
   */
  async verifyAllProviderKeys(): Promise<void> {
    const { list: providerKeys } = await this.providerKeyService.list(
      { isDeleted: false },
      { limit: 1000 },
    );

    this.logger.info(
      `[ModelVerification] Verifying ${providerKeys.length} provider keys`,
    );

    for (const key of providerKeys) {
      try {
        await this.verifyProviderKey(key.id);
      } catch (error) {
        this.logger.error(
          `[ModelVerification] Failed to verify provider key ${key.id}`,
          { error },
        );
      }
    }

    this.logger.info('[ModelVerification] Verification completed');
  }

  /**
   * 验证单个 Provider Key 的模型可用性
   * 根据 apiType 从端点获取可用模型列表
   */
  async verifyProviderKey(
    providerKeyId: string,
  ): Promise<ModelVerificationResult[]> {
    const providerKey = await this.providerKeyService.getById(providerKeyId);
    if (!providerKey) {
      throw new Error(`Provider key not found: ${providerKeyId}`);
    }

    const { vendor, apiType, secretEncrypted, baseUrl } = providerKey;
    const apiKey = this.encryptionService.decrypt(Buffer.from(secretEncrypted));

    // 确定实际使用的 API 类型
    const effectiveApiType = apiType || this.inferApiType(vendor);

    this.logger.info(
      `[ModelVerification] Verifying provider key: vendor=${vendor}, apiType=${effectiveApiType}, baseUrl=${baseUrl}`,
    );

    // 根据 apiType 从端点获取可用模型列表
    let models = await this.fetchAvailableModels(
      apiKey,
      baseUrl,
      effectiveApiType,
    );

    // 如果端点获取失败，使用 apiType 对应的默认模型列表作为回退
    if (models.length === 0) {
      models = API_TYPE_DEFAULT_MODELS[effectiveApiType] || [];
      if (models.length > 0) {
        this.logger.info(
          `[ModelVerification] Using fallback models for apiType '${effectiveApiType}': ${models.join(', ')}`,
        );
      }
    }

    if (models.length === 0) {
      this.logger.warn(
        `[ModelVerification] No models found for apiType: ${effectiveApiType}`,
      );
      return [];
    }

    this.logger.info(
      `[ModelVerification] Verifying ${models.length} models: ${models.join(', ')}`,
    );

    const results: ModelVerificationResult[] = [];

    for (const model of models) {
      const result = await this.verifyModel(
        vendor,
        effectiveApiType,
        model,
        apiKey,
        baseUrl,
      );

      // 更新或创建 ModelAvailability 记录
      await this.updateModelAvailability(
        providerKeyId,
        model,
        result.isAvailable,
        result.errorMessage,
      );

      results.push(result);
    }

    return results;
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
      const headers = this.getAuthHeaders(effectiveApiType, apiKey);

      // 根据 apiType 确定 models 端点路径
      let url: string;
      if (effectiveApiType === 'anthropic') {
        // Anthropic 没有 /models 端点，直接返回空
        this.logger.debug(
          '[ModelVerification] Anthropic API does not have /models endpoint',
        );
        return [];
      } else {
        // OpenAI 兼容 API（包括 new-api, gateway 等）
        url = `${baseUrl}/models`;
      }

      this.logger.info(`[ModelVerification] Fetching models from: ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        this.logger.warn(
          `[ModelVerification] Failed to fetch models: ${response.status} ${response.statusText}`,
        );
        return [];
      }

      const data = (await response.json()) as {
        data?: Array<{ id: string; owned_by?: string }>;
        object?: string;
      };

      // OpenAI 格式的响应
      if (data.data && Array.isArray(data.data)) {
        // 过滤出聊天模型（排除 embedding、whisper 等非聊天模型）
        const chatModels = data.data
          .map((m) => m.id)
          .filter((id) => this.isChatModel(id))
          .slice(0, 20); // 最多取 20 个模型

        this.logger.info(
          `[ModelVerification] Found ${chatModels.length} chat models from endpoint`,
        );

        return chatModels;
      }

      return [];
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
   * 判断模型是否为聊天模型
   */
  private isChatModel(modelId: string): boolean {
    const lowerModelId = modelId.toLowerCase();

    // 排除非聊天模型
    const excludePatterns = [
      'embedding',
      'whisper',
      'tts',
      'dall-e',
      'moderation',
      'text-embedding',
      'ada',
      'babbage',
      'curie',
      'davinci',
    ];

    if (excludePatterns.some((pattern) => lowerModelId.includes(pattern))) {
      return false;
    }

    // 包含常见聊天模型关键词
    const includePatterns = [
      'gpt',
      'claude',
      'gemini',
      'deepseek',
      'llama',
      'mistral',
      'qwen',
      'yi-',
      'glm',
      'chat',
      'turbo',
      'sonnet',
      'opus',
      'haiku',
    ];

    return includePatterns.some((pattern) => lowerModelId.includes(pattern));
  }

  /**
   * 验证单个模型的可用性
   * @param vendor 供应商（用于结果报告）
   * @param apiType API 类型（用于确定调用方式）
   */
  private async verifyModel(
    vendor: string,
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
        vendor,
        model,
        isAvailable,
        latencyMs,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        vendor,
        model,
        isAvailable: false,
        errorMessage,
      };
    }
  }

  /**
   * 调用模型 API 验证可用性
   * 根据 apiType 使用不同的验证方式
   * @param apiType API 类型（用于确定调用方式和认证头）
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

    // 根据 apiType 选择不同的验证方式
    switch (apiType) {
      case 'anthropic':
        return this.verifyAnthropicApi(apiHost, apiKey, model);
      case 'gemini':
        return this.verifyGeminiApi(apiHost, apiKey);
      case 'azure-openai':
        return this.verifyAzureOpenAIApi(apiHost, apiKey, model);
      default:
        // OpenAI 兼容 API（openai, new-api, gateway, ollama 等）
        return this.verifyOpenAICompatibleApi(apiHost, apiKey);
    }
  }

  /**
   * 验证 OpenAI 兼容 API（使用 /v1/models 端点）
   */
  private async verifyOpenAICompatibleApi(
    apiHost: string,
    apiKey: string,
  ): Promise<boolean> {
    const url = `${apiHost}/v1/models`;
    const headers = this.getAuthHeaders('openai', apiKey);

    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      return true;
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error(`Authentication failed: ${response.status}`);
    }

    return true;
  }

  /**
   * 验证 Anthropic API（使用 /v1/messages 端点发送最小请求）
   */
  private async verifyAnthropicApi(
    apiHost: string,
    apiKey: string,
    model: string,
  ): Promise<boolean> {
    const url = `${apiHost}/v1/messages`;
    const headers = {
      ...this.getAuthHeaders('anthropic', apiKey),
      'Content-Type': 'application/json',
    };

    // 发送最小的请求来验证 API Key
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

    if (response.status === 401 || response.status === 403) {
      throw new Error(`Authentication failed: ${response.status}`);
    }

    // 400 可能是模型不存在
    if (response.status === 400) {
      const errorData = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      if (errorData.error?.message?.includes('model')) {
        throw new Error(`Model not available: ${model}`);
      }
    }

    // 429 表示限流，但 API Key 有效
    if (response.status === 429) {
      return true;
    }

    return true;
  }

  /**
   * 验证 Gemini API（使用 /v1beta/models 端点）
   */
  private async verifyGeminiApi(
    apiHost: string,
    apiKey: string,
  ): Promise<boolean> {
    // Gemini API 使用 URL 参数传递 API Key
    const url = `${apiHost}/v1beta/models?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      return true;
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error(`Authentication failed: ${response.status}`);
    }

    return true;
  }

  /**
   * 验证 Azure OpenAI API
   */
  private async verifyAzureOpenAIApi(
    apiHost: string,
    apiKey: string,
    model: string,
  ): Promise<boolean> {
    // Azure OpenAI 使用不同的端点格式
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
   * @param apiType API 类型
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
   * vendor 信息从 ProviderKey 中获取，不再单独存储
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

  /**
   * 获取模型的可用性状态
   * vendor 信息从 ProviderKey 中获取
   */
  async getModelAvailability(
    vendor: string,
    model: string,
  ): Promise<{ isAvailable: boolean; lastVerifiedAt: Date | null }> {
    // 先获取该 vendor 的所有 ProviderKey
    const { list: providerKeys } = await this.providerKeyService.list(
      { vendor },
      { limit: 100 },
    );

    if (providerKeys.length === 0) {
      return {
        isAvailable: false,
        lastVerifiedAt: null,
      };
    }

    const providerKeyIds = providerKeys.map((pk) => pk.id);

    // 查询这些 ProviderKey 对应的模型可用性
    const { list: records } = await this.modelAvailabilityService.list(
      {
        model,
        isAvailable: true,
        providerKeyId: { in: providerKeyIds },
      },
      { limit: 1 },
    );

    if (records.length > 0) {
      return {
        isAvailable: true,
        lastVerifiedAt: records[0].lastVerifiedAt,
      };
    }

    return {
      isAvailable: false,
      lastVerifiedAt: null,
    };
  }

  /**
   * 获取所有可用的模型列表
   * vendor 信息从 ProviderKey 中获取
   */
  async getAllAvailableModels(): Promise<
    Array<{ vendor: string; model: string; lastVerifiedAt: Date }>
  > {
    // 获取所有可用的模型记录
    const { list: records } = await this.modelAvailabilityService.list(
      { isAvailable: true },
      { limit: 1000 },
    );

    // 获取所有 ProviderKey 用于获取 vendor 信息
    const { list: providerKeys } = await this.providerKeyService.list(
      {},
      { limit: 1000 },
    );
    const providerKeyMap = new Map(providerKeys.map((pk) => [pk.id, pk]));

    // 去重（同一个模型可能有多个 provider key）
    const uniqueModels = new Map<
      string,
      { vendor: string; model: string; lastVerifiedAt: Date }
    >();

    for (const record of records) {
      const providerKey = providerKeyMap.get(record.providerKeyId);
      if (!providerKey) continue;

      const vendor = providerKey.vendor;
      const key = `${vendor}:${record.model}`;
      const existing = uniqueModels.get(key);

      // 保留最新验证的记录
      if (!existing || record.lastVerifiedAt > existing.lastVerifiedAt) {
        uniqueModels.set(key, {
          vendor,
          model: record.model,
          lastVerifiedAt: record.lastVerifiedAt,
        });
      }
    }

    return Array.from(uniqueModels.values());
  }
}
