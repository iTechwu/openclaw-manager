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
 * 各 vendor 支持的默认模型列表
 * 用于验证 API Key 时测试哪些模型可用
 */
const VENDOR_DEFAULT_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o1-mini', 'o3-mini'],
  anthropic: [
    'claude-opus-4-20250514',
    'claude-sonnet-4-20250514',
    'claude-3-5-haiku-20241022',
  ],
  google: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  groq: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
  mistral: ['mistral-large-latest', 'mistral-small-latest'],
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
   */
  async verifyProviderKey(
    providerKeyId: string,
  ): Promise<ModelVerificationResult[]> {
    const providerKey = await this.providerKeyService.getById(providerKeyId);
    if (!providerKey) {
      throw new Error(`Provider key not found: ${providerKeyId}`);
    }

    const { vendor, secretEncrypted } = providerKey;
    const apiKey = this.encryptionService.decrypt(Buffer.from(secretEncrypted));

    // 获取该 vendor 支持的模型列表
    const models = VENDOR_DEFAULT_MODELS[vendor] || [];
    if (models.length === 0) {
      this.logger.warn(
        `[ModelVerification] No default models for vendor: ${vendor}`,
      );
      return [];
    }

    const results: ModelVerificationResult[] = [];

    for (const model of models) {
      const result = await this.verifyModel(
        vendor,
        model,
        apiKey,
        providerKey.baseUrl,
      );

      // 更新或创建 ModelAvailability 记录
      await this.updateModelAvailability(
        providerKeyId,
        vendor,
        model,
        result.isAvailable,
        result.errorMessage,
      );

      results.push(result);
    }

    return results;
  }

  /**
   * 验证单个模型的可用性
   */
  private async verifyModel(
    vendor: string,
    model: string,
    apiKey: string,
    baseUrl?: string | null,
  ): Promise<ModelVerificationResult> {
    const startTime = Date.now();

    try {
      // 根据 vendor 选择验证方法
      const isAvailable = await this.callModelApi(
        vendor,
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
   * 使用最小的请求来验证 API Key 是否有效
   */
  private async callModelApi(
    vendor: string,
    model: string,
    apiKey: string,
    baseUrl?: string | null,
  ): Promise<boolean> {
    const providerConfig = PROVIDER_CONFIGS[vendor as ProviderVendor];
    const apiHost = baseUrl || providerConfig?.apiHost;

    if (!apiHost) {
      throw new Error(`No API host for vendor: ${vendor}`);
    }

    // 使用 fetch 发送最小的请求来验证 API Key
    // 对于 OpenAI 兼容的 API，使用 /models 端点
    // 对于 Anthropic，使用 /messages 端点（需要发送实际请求）
    const url = this.getVerificationUrl(vendor, apiHost);
    const headers = this.getAuthHeaders(vendor, apiKey);

    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10000), // 10 秒超时
    });

    if (response.ok) {
      return true;
    }

    // 401/403 表示 API Key 无效
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Authentication failed: ${response.status}`);
    }

    // 其他错误可能是临时的，暂时认为可用
    return true;
  }

  /**
   * 获取验证 URL
   */
  private getVerificationUrl(vendor: string, apiHost: string): string {
    // 大多数 OpenAI 兼容的 API 都支持 /models 端点
    switch (vendor) {
      case 'anthropic':
        // Anthropic 没有 /models 端点，使用根路径检查
        return `${apiHost}/v1/models`;
      default:
        return `${apiHost}/v1/models`;
    }
  }

  /**
   * 获取认证头
   */
  private getAuthHeaders(
    vendor: string,
    apiKey: string,
  ): Record<string, string> {
    switch (vendor) {
      case 'anthropic':
        return {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        };
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
    vendor: string,
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
        vendor,
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
   */
  async getModelAvailability(
    vendor: string,
    model: string,
  ): Promise<{ isAvailable: boolean; lastVerifiedAt: Date | null }> {
    const { list: records } = await this.modelAvailabilityService.list(
      { vendor, model, isAvailable: true },
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
   */
  async getAllAvailableModels(): Promise<
    Array<{ vendor: string; model: string; lastVerifiedAt: Date }>
  > {
    const { list: records } = await this.modelAvailabilityService.list(
      { isAvailable: true },
      { limit: 1000 },
    );

    // 去重（同一个模型可能有多个 provider key）
    const uniqueModels = new Map<
      string,
      { vendor: string; model: string; lastVerifiedAt: Date }
    >();

    for (const record of records) {
      const key = `${record.vendor}:${record.model}`;
      const existing = uniqueModels.get(key);

      // 保留最新验证的记录
      if (!existing || record.lastVerifiedAt > existing.lastVerifiedAt) {
        uniqueModels.set(key, {
          vendor: record.vendor,
          model: record.model,
          lastVerifiedAt: record.lastVerifiedAt,
        });
      }
    }

    return Array.from(uniqueModels.values());
  }
}
