import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { firstValueFrom } from 'rxjs';
import type { AxiosError } from 'axios';
import { getKeysConfig } from '@/config/configuration';
import type { OpenAIConfig } from '@/config/validation';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
}

export interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
  }>;
}

@Injectable()
export class OpenAIClient implements OnModuleInit {
  private baseUrl: string = '';
  private apiKey: string = '';
  private openaiConfig: OpenAIConfig | undefined;

  constructor(
    private readonly httpService: HttpService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  onModuleInit() {
    const keysConfig = getKeysConfig();
    this.openaiConfig = keysConfig?.openai;

    this.apiKey = this.openaiConfig?.apiKey || '';
    this.baseUrl = this.openaiConfig?.baseUrl;

    if (!this.apiKey) {
      this.logger.warn('OpenAI API Key not configured');
    }

    this.logger.info(`OpenAI Client initialized with baseUrl: ${this.baseUrl}`);
  }

  private getAuthHeaders() {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  async chatCompletion(
    request: ChatCompletionRequest,
  ): Promise<ChatCompletionResponse> {
    try {
      this.logger.info('[OpenAI] Calling chat completion', {
        model: request.model,
        messageCount: request.messages.length,
      });

      const response = await firstValueFrom(
        this.httpService.post<ChatCompletionResponse>(
          `${this.baseUrl}/chat/completions`,
          request,
          {
            headers: this.getAuthHeaders(),
            timeout: 120000,
          },
        ),
      );

      this.logger.info('[OpenAI] Chat completion successful', {
        model: request.model,
        responseId: response.data.id,
      });

      return response.data;
    } catch (error) {
      this.handleError('chatCompletion', error as AxiosError, {
        baseUrl: this.baseUrl,
        apiKey: this.apiKey,
        model: request.model,
      });
    }
  }

  private handleError(
    operation: string,
    error: AxiosError,
    context?: Record<string, any>,
  ): never {
    const errorMessage = this.extractErrorMessage(error);
    const statusCode = error.response?.status;

    this.logger.error(`OpenAI API Error [${operation}]: ${errorMessage}`, {
      statusCode,
      context,
      responseData: error.response?.data,
    });

    if (statusCode === 401) {
      throw new Error('OpenAI API authentication failed');
    } else if (statusCode === 429) {
      throw new Error('OpenAI API rate limit exceeded');
    } else if (statusCode === 500) {
      throw new Error(`OpenAI server error: ${errorMessage}`);
    } else if (error.code === 'ECONNREFUSED') {
      throw new Error(`Cannot connect to OpenAI server: ${this.baseUrl}`);
    } else if (error.code === 'ETIMEDOUT') {
      throw new Error(`OpenAI request timeout: ${operation}`);
    } else {
      throw new Error(`OpenAI API error: ${errorMessage}`);
    }
  }

  private extractErrorMessage(error: AxiosError): string {
    if (error.response?.data) {
      const data = error.response.data as any;
      return (
        data.error?.message || data.message || data.error || 'Unknown error'
      );
    }
    return error.message || 'Unknown error';
  }
}
