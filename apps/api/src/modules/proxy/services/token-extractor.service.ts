import { Injectable, Inject } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

/**
 * Token 使用量信息
 */
export interface TokenUsage {
  requestTokens: number | null;
  responseTokens: number | null;
  model?: string;
}

/**
 * Token 提取服务
 * 从各种 AI 提供商的响应中提取 Token 使用量
 */
@Injectable()
export class TokenExtractorService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  /**
   * 从 AI 响应中提取 Token 使用量
   * 支持多种 AI 提供商的响应格式
   */
  extractTokens(vendor: string, responseBody: unknown): TokenUsage {
    if (!responseBody || typeof responseBody !== 'object') {
      return { requestTokens: null, responseTokens: null };
    }

    try {
      switch (vendor) {
        case 'openai':
        case 'azure-openai':
        case 'openrouter':
        case 'together':
        case 'fireworks':
        case 'perplexity':
          return this.extractOpenAITokens(responseBody);

        case 'anthropic':
          return this.extractAnthropicTokens(responseBody);

        case 'google':
          return this.extractGoogleTokens(responseBody);

        case 'deepseek':
        case 'zhipu':
        case 'moonshot':
        case 'baichuan':
        case 'dashscope':
        case 'stepfun':
        case 'doubao':
        case 'minimax':
        case 'yi':
        case 'hunyuan':
        case 'siliconflow':
          // 这些国内提供商大多兼容 OpenAI 格式
          return this.extractOpenAITokens(responseBody);

        case 'groq':
        case 'mistral':
        case 'cohere':
          return this.extractOpenAITokens(responseBody);

        default:
          // 默认尝试 OpenAI 格式
          return this.extractOpenAITokens(responseBody);
      }
    } catch (error) {
      this.logger.warn('Failed to extract tokens', { vendor, error });
      return { requestTokens: null, responseTokens: null };
    }
  }

  /**
   * OpenAI 格式
   * { usage: { prompt_tokens, completion_tokens, total_tokens }, model }
   */
  private extractOpenAITokens(body: unknown): TokenUsage {
    const data = body as Record<string, unknown>;
    const usage = data?.usage as Record<string, unknown> | undefined;

    return {
      requestTokens:
        typeof usage?.prompt_tokens === 'number' ? usage.prompt_tokens : null,
      responseTokens:
        typeof usage?.completion_tokens === 'number'
          ? usage.completion_tokens
          : null,
      model: typeof data?.model === 'string' ? data.model : undefined,
    };
  }

  /**
   * Anthropic 格式
   * { usage: { input_tokens, output_tokens }, model }
   */
  private extractAnthropicTokens(body: unknown): TokenUsage {
    const data = body as Record<string, unknown>;
    const usage = data?.usage as Record<string, unknown> | undefined;

    return {
      requestTokens:
        typeof usage?.input_tokens === 'number' ? usage.input_tokens : null,
      responseTokens:
        typeof usage?.output_tokens === 'number' ? usage.output_tokens : null,
      model: typeof data?.model === 'string' ? data.model : undefined,
    };
  }

  /**
   * Google 格式
   * { usageMetadata: { promptTokenCount, candidatesTokenCount, totalTokenCount } }
   */
  private extractGoogleTokens(body: unknown): TokenUsage {
    const data = body as Record<string, unknown>;
    const usageMetadata = data?.usageMetadata as
      | Record<string, unknown>
      | undefined;

    return {
      requestTokens:
        typeof usageMetadata?.promptTokenCount === 'number'
          ? usageMetadata.promptTokenCount
          : null,
      responseTokens:
        typeof usageMetadata?.candidatesTokenCount === 'number'
          ? usageMetadata.candidatesTokenCount
          : null,
      model:
        typeof data?.modelVersion === 'string' ? data.modelVersion : undefined,
    };
  }

  /**
   * 从流式响应的最后一个 chunk 提取 Token
   * SSE 格式: data: {...}
   */
  extractFromStreamChunk(vendor: string, chunk: string): TokenUsage | null {
    try {
      // SSE 格式: data: {...}
      if (!chunk.startsWith('data: ') || chunk === 'data: [DONE]') {
        return null;
      }

      const jsonStr = chunk.slice(6).trim();
      if (!jsonStr) return null;

      const data = JSON.parse(jsonStr);

      // 检查是否包含 usage 信息（通常在最后一个 chunk）
      if (data.usage || data.usageMetadata) {
        return this.extractTokens(vendor, data);
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * 从完整的流式响应中累积提取 Token
   * 解析所有 SSE 行，找到包含 usage 的那一行
   */
  extractFromStreamResponse(vendor: string, fullResponse: string): TokenUsage {
    const lines = fullResponse.split('\n');
    let lastUsage: TokenUsage = { requestTokens: null, responseTokens: null };

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('data: ') && trimmedLine !== 'data: [DONE]') {
        const usage = this.extractFromStreamChunk(vendor, trimmedLine);
        if (
          usage &&
          (usage.requestTokens !== null || usage.responseTokens !== null)
        ) {
          lastUsage = usage;
        }
      }
    }

    return lastUsage;
  }

  /**
   * 从响应中提取 Token 使用量
   * 自动检测响应类型（JSON 或 SSE）
   */
  extractFromResponse(
    vendor: string,
    responseData: string,
    contentType: string,
  ): TokenUsage | null {
    if (!responseData) {
      return null;
    }

    try {
      // SSE 流式响应
      if (
        contentType.includes('text/event-stream') ||
        responseData.includes('data: ')
      ) {
        const usage = this.extractFromStreamResponse(vendor, responseData);
        if (usage.requestTokens !== null || usage.responseTokens !== null) {
          return usage;
        }
        return null;
      }

      // JSON 响应
      if (
        contentType.includes('application/json') ||
        responseData.trim().startsWith('{')
      ) {
        const jsonData = JSON.parse(responseData);
        const usage = this.extractTokens(vendor, jsonData);
        if (usage.requestTokens !== null || usage.responseTokens !== null) {
          return usage;
        }
        return null;
      }

      return null;
    } catch (error) {
      this.logger.debug('Failed to extract tokens from response', {
        vendor,
        contentType,
        error,
      });
      return null;
    }
  }
}
