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
    const { vendor, secret, baseUrl, apiType: inputApiType } = input;

    // Get effective API host
    const effectiveHost = getEffectiveApiHost(vendor, baseUrl);
    if (!effectiveHost) {
      return {
        valid: false,
        error: 'No API host configured for this provider',
      };
    }

    // Get provider config to determine API type
    // Use input apiType if provided, otherwise fall back to provider config
    const providerConfig = PROVIDER_CONFIGS[vendor];
    const apiType = inputApiType || providerConfig?.apiType || 'openai';

    try {
      let models: ProviderModel[] = [];

      // Handle different API types
      if (apiType === 'anthropic') {
        models = await this.verifyAnthropicKey(
          effectiveHost,
          secret,
          startTime,
        );
      } else if (apiType === 'gemini') {
        models = await this.verifyGeminiKey(effectiveHost, secret);
      } else if (apiType === 'ollama') {
        models = await this.verifyOllamaKey(effectiveHost, secret);
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

    // Return predefined Anthropic models (latest Claude 4 series)
    return [
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
      { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
    ];
  }

  /**
   * Verify Google Gemini API key by calling /models endpoint
   * Gemini API uses a different authentication method (API key in query param)
   */
  private async verifyGeminiKey(
    effectiveHost: string,
    secret: string,
  ): Promise<ProviderModel[]> {
    const modelsUrl = `${effectiveHost}/models?key=${secret}`;
    const response = await firstValueFrom(
      this.httpService.get(modelsUrl, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }),
    );

    const data = response.data;
    let models: ProviderModel[] = [];

    if (data?.models && Array.isArray(data.models)) {
      models = data.models
        .filter((m: any) => m.name?.startsWith('models/gemini'))
        .map((m: any) => ({
          id: m.name?.replace('models/', '') || m.name,
          name: m.displayName || m.name?.replace('models/', ''),
        }));
    }

    return models;
  }

  /**
   * Verify Ollama API key by calling /api/tags endpoint
   * Ollama uses a different endpoint structure
   */
  private async verifyOllamaKey(
    effectiveHost: string,
    _secret: string,
  ): Promise<ProviderModel[]> {
    // Ollama doesn't require authentication, just check if the server is running
    // The endpoint is /api/tags for listing models
    const baseHost = effectiveHost.replace(/\/v1$/, '');
    const modelsUrl = `${baseHost}/api/tags`;
    const response = await firstValueFrom(
      this.httpService.get(modelsUrl, {
        timeout: 10000,
      }),
    );

    const data = response.data;
    let models: ProviderModel[] = [];

    if (data?.models && Array.isArray(data.models)) {
      models = data.models.map((m: any) => ({
        id: m.name || m.model,
        name: m.name || m.model,
      }));
    }

    return models;
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
