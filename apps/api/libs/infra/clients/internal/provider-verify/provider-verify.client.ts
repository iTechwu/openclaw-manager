import { Injectable, Inject } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { firstValueFrom } from 'rxjs';
import type {
  VerifyProviderKeyInput,
  VerifyProviderKeyResponse,
  ProviderModel,
  ProviderVendor,
} from '@repo/contracts';
import { PROVIDER_CONFIGS, getEffectiveApiHost } from '@repo/contracts';

/**
 * ProviderVerifyClient - Provider Key 验证客户端
 *
 * 负责调用各 AI 提供商的 API 验证密钥有效性并获取模型列表
 * 支持 OpenAI 兼容 API 和 Anthropic API
 */
@Injectable()
export class ProviderVerifyClient {
  constructor(
    private readonly httpService: HttpService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  /**
   * Verify a provider key and get available models
   */
  async verify(
    input: VerifyProviderKeyInput,
  ): Promise<VerifyProviderKeyResponse> {
    const startTime = Date.now();
    const { vendor, secret, baseUrl } = input;

    // Get effective API host
    const effectiveHost = getEffectiveApiHost(vendor, baseUrl);
    if (!effectiveHost) {
      return {
        valid: false,
        error: 'No API host configured for this provider',
      };
    }

    // Get provider config to determine API type
    const providerConfig = PROVIDER_CONFIGS[vendor];
    const apiType = providerConfig?.apiType || 'openai';

    try {
      let models: ProviderModel[] = [];

      // Handle different API types
      if (apiType === 'anthropic') {
        models = await this.verifyAnthropicKey(
          effectiveHost,
          secret,
          startTime,
        );
      } else {
        models = await this.verifyOpenAICompatibleKey(effectiveHost, secret);
      }

      const latency = Date.now() - startTime;
      return {
        valid: true,
        latency,
        models,
      };
    } catch (error: any) {
      return this.handleError(error, vendor, startTime);
    }
  }

  /**
   * Verify Anthropic API key
   * Anthropic doesn't have a models endpoint, so we verify by calling messages endpoint
   */
  private async verifyAnthropicKey(
    effectiveHost: string,
    secret: string,
    startTime: number,
  ): Promise<ProviderModel[]> {
    const response = await firstValueFrom(
      this.httpService.get(`${effectiveHost}/v1/messages`, {
        headers: {
          'x-api-key': secret,
          'anthropic-version': '2023-06-01',
        },
        timeout: 10000,
        validateStatus: (status) => status < 500,
      }),
    );

    // 401 means invalid key
    if (response.status === 401) {
      throw { response: { status: 401 } };
    }

    // Return predefined Anthropic models
    return [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
      { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
    ];
  }

  /**
   * Verify OpenAI-compatible API key by calling /models endpoint
   */
  private async verifyOpenAICompatibleKey(
    effectiveHost: string,
    secret: string,
  ): Promise<ProviderModel[]> {
    const modelsUrl = `${effectiveHost}/models`;
    const response = await firstValueFrom(
      this.httpService.get(modelsUrl, {
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }),
    );

    const data = response.data;
    let models: ProviderModel[] = [];

    if (data?.data && Array.isArray(data.data)) {
      models = data.data.map((m: any) => ({
        id: m.id,
        name: m.name || m.id,
        created: m.created,
        owned_by: m.owned_by,
      }));
    } else if (data?.models && Array.isArray(data.models)) {
      // Some providers use 'models' instead of 'data'
      models = data.models.map((m: any) => ({
        id: m.id || m.name,
        name: m.name || m.id,
        created: m.created,
        owned_by: m.owned_by,
      }));
    }
    console.log('tech: models', modelsUrl, models);
    return models;
  }

  /**
   * Handle errors and return appropriate response
   */
  private handleError(
    error: any,
    vendor: ProviderVendor,
    startTime: number,
  ): VerifyProviderKeyResponse {
    const latency = Date.now() - startTime;
    let errorMessage = 'Connection failed';

    if (error.response) {
      const status = error.response.status;
      if (status === 401) {
        errorMessage = 'Invalid API key';
      } else if (status === 403) {
        errorMessage = 'Access denied';
      } else if (status === 404) {
        errorMessage = 'API endpoint not found';
      } else if (status === 429) {
        errorMessage = 'Rate limit exceeded';
      } else {
        errorMessage = error.response.data?.error?.message || `HTTP ${status}`;
      }
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Connection refused';
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      errorMessage = 'Connection timeout';
    } else if (error.message) {
      errorMessage = error.message;
    }

    this.logger.warn(
      `Provider key verification failed for ${vendor}: ${errorMessage}`,
    );

    return {
      valid: false,
      latency,
      error: errorMessage,
    };
  }
}
