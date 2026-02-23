import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { z } from 'zod';
import {
  CreateTaskRequest,
  CreateTaskResponse,
  TaskStatusResponse,
  CancelTaskResponse,
} from './interfaces/task.interface';
import { AgentXConfigHelper, getKeysConfig } from '@/config/configuration';
import type { AgentXConfig } from '@/config/validation';
import enviromentUtil from 'libs/infra/utils/enviroment.util';

// ============================================================================
// Types - 协同过滤推荐
// ============================================================================

export interface CollaborativeRecommendationRequest {
  team_id: string;
  user_id: string;
  algorithm?: 'item-based' | 'user-based' | 'hybrid';
  top_k?: number;
  time_window_days?: number;
  exclude_ids?: string[];
  min_similarity?: number;
  k_neighbors?: number;
  item_weight?: number;
  user_weight?: number;
}

export interface CollaborativeRecommendationItem {
  knowledge_id: string;
  title: string | null;
  recommendation_score: number;
  reason: string;
  similarity_score: number;
  matched_tags: string[] | null;
}

export interface CollaborativeRecommendationResponse {
  user_id: string;
  team_id: string;
  algorithm: string;
  recommendations: CollaborativeRecommendationItem[];
  total: number;
  execution_time_ms: number;
  metadata: {
    time_window_days: number;
    excluded_count: number;
  };
}

// ============================================================================
// Types - AI 关键词生成
// ============================================================================

export interface GenerateProductKeywordsRequest {
  productName: string;
  productSellingPoints: string;
}

// ============================================================================
// Types - LLM Chat Completions
// ============================================================================

export interface LLMChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMChatCompletionRequest {
  model: string;
  messages: LLMChatMessage[];
  stream?: boolean;
  temperature?: number;
  response_format?: { type: 'json_object' | 'text' };
}

export interface LLMChatCompletionResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ============================================================================
// Types - Image Generation (Zod-first)
// ============================================================================

/**
 * 图像生成请求 Schema
 */
export const ImageGenerationRequestSchema = z.object({
  model: z.string().min(1, '模型名称不能为空'),
  prompt: z.string().min(1, '提示词不能为空'),
  n: z.number().int().positive().optional().default(1),
  response_format: z
    .enum(['url', 'b64_json'] as const)
    .optional()
    .default('url'),
  aspect_ratio: z.string().optional(),
  image_size: z.string().optional(),
});

export type ImageGenerationRequest = z.infer<
  typeof ImageGenerationRequestSchema
>;

/**
 * 图像编辑请求 Schema
 */
export const ImageEditRequestSchema = ImageGenerationRequestSchema.extend({
  image: z
    .array(z.string().url('图片URL格式不正确'))
    .min(1, '至少需要一张图片'),
});

export type ImageEditRequest = z.infer<typeof ImageEditRequestSchema>;

/**
 * 图像生成响应 Schema
 */
export const ImageGenerationResponseSchema = z.object({
  data: z.array(
    z.object({
      url: z.string().url().optional(),
      b64_json: z.string().optional().nullable(),
    }),
  ),
  created: z.number().int(),
});

export type ImageGenerationResponse = z.infer<
  typeof ImageGenerationResponseSchema
>;

/**
 * AgentX Internal Client
 *
 * 封装所有与 Python AgentX API 的交互
 * - 统一的 HTTP 请求处理
 * - 统一的错误处理和重试机制
 * - 统一的超时管理
 * - 统一的 callback URL 管理
 * - 协同过滤推荐
 * - 健康检查
 */
@Injectable()
export class AgentXClient implements OnModuleInit {
  private readonly logger = new Logger(AgentXClient.name);
  private baseUrl: string = '';
  private internalApiUrl: string = '';
  private agentxConfig: AgentXConfig | undefined;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const keysConfig = getKeysConfig();
    this.agentxConfig = keysConfig?.agentx;
    this.baseUrl = this.agentxConfig?.baseUrl || '';

    if (!this.baseUrl) {
      throw new Error('AgentXClient: baseUrl not configured');
    }

    // 初始化 internalApiUrl 用于 callback
    this.internalApiUrl = enviromentUtil
      .generateEnvironmentUrls()
      .internalApi.replace(/\/+$/, ''); // 去除末尾斜杠

    this.logger.log(`AgentX Client initialized with baseUrl: ${this.baseUrl}`);
    this.logger.log(`Callback URL: ${this.internalApiUrl}/webhook/python-task`);
  }

  /**
   * 获取包含认证头的请求配置
   */
  private getAuthHeaders(additionalHeaders: Record<string, string> = {}) {
    return {
      ...additionalHeaders,
      ...AgentXConfigHelper.getAuthHeaders(),
      ...{ 'Content-Type': 'application/json' },
    };
  }

  /**
   * 创建 Python 任务
   *
   * @param request 创建任务请求参数
   * @returns 任务 ID
   */
  async createTask(request: CreateTaskRequest): Promise<string> {
    this.logger.log(`Creating task: ${request.name}`);

    // 自动添加统一的 callback URL（如果未提供）
    const callbackUrl =
      request.callback || `${this.internalApiUrl}/webhook/python-task`;

    try {
      const response = await firstValueFrom(
        this.httpService.post<CreateTaskResponse>(
          `${this.baseUrl}/task`,
          {
            name: request.name,
            params: request.params,
            callback: callbackUrl,
          },
          {
            headers: this.getAuthHeaders(),
            timeout: 30000, // 30 秒超时
          },
        ),
      );

      const taskId = response.data.id;
      this.logger.log(
        `Task created successfully: ${taskId}, callback: ${callbackUrl}`,
      );
      return taskId;
    } catch (error) {
      this.handleError('createTask', error as AxiosError, {
        taskName: request.name,
      });
    }
  }

  /**
   * 查询任务状态
   *
   * @param taskId 任务 ID
   * @returns 任务状态信息
   */
  async getTaskStatus(taskId: string): Promise<TaskStatusResponse> {
    this.logger.debug(`Getting task status: ${taskId}`);

    try {
      const response = await firstValueFrom(
        this.httpService.get<TaskStatusResponse>(
          `${this.baseUrl}/task/${taskId}`,
          {
            headers: this.getAuthHeaders(),
            timeout: 10000, // 10 秒超时
          },
        ),
      );

      return response.data;
    } catch (error) {
      this.handleError('getTaskStatus', error as AxiosError, { taskId });
    }
  }

  /**
   * 取消任务
   *
   * @param taskId 任务 ID
   * @returns 取消结果
   */
  async cancelTask(taskId: string): Promise<CancelTaskResponse> {
    this.logger.log(`Cancelling task: ${taskId}`);

    try {
      const response = await firstValueFrom(
        this.httpService.delete<CancelTaskResponse>(
          `${this.baseUrl}/task/${taskId}`,
          {
            headers: this.getAuthHeaders(),
            timeout: 10000, // 10 秒超时
          },
        ),
      );

      this.logger.log(`Task cancelled successfully: ${taskId}`);
      return response.data;
    } catch (error) {
      this.handleError('cancelTask', error as AxiosError, { taskId });
    }
  }

  /**
   * 统一错误处理
   *
   * @param operation 操作名称
   * @param error Axios 错误对象
   * @param context 上下文信息
   */
  private handleError(
    operation: string,
    error: AxiosError,
    context?: Record<string, any>,
  ): never {
    const errorMessage = this.extractErrorMessage(error);
    const statusCode = error.response?.status;

    this.logger.error(`AgentX API Error [${operation}]: ${errorMessage}`, {
      statusCode,
      context,
      responseData: error.response?.data,
    });

    // 根据 HTTP 状态码抛出不同的错误
    if (statusCode === 404) {
      throw new Error(`Task not found: ${context?.taskId || 'unknown'}`);
    } else if (statusCode === 400) {
      throw new Error(`Invalid request: ${errorMessage}`);
    } else if (statusCode === 500) {
      throw new Error(`AgentX server error: ${errorMessage}`);
    } else if (statusCode === 503) {
      throw new Error(`AgentX service unavailable: ${errorMessage}`);
    } else if (error.code === 'ECONNREFUSED') {
      throw new Error(`Cannot connect to AgentX server: ${this.baseUrl}`);
    } else if (error.code === 'ETIMEDOUT') {
      throw new Error(`AgentX request timeout: ${operation}`);
    } else {
      throw new Error(`AgentX API error: ${errorMessage}`);
    }
  }

  /**
   * 提取错误消息
   *
   * @param error Axios 错误对象
   * @returns 错误消息
   */
  private extractErrorMessage(error: AxiosError): string {
    if (error.response?.data) {
      const data = error.response.data as any;
      return data.message || data.error || data.detail || 'Unknown error';
    }
    return error.message || 'Unknown error';
  }

  /**
   * 通用 GET 请求
   */
  async get<T = any>(url: string, config?: any): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<T>(`${this.baseUrl}${url}`, config),
      );
      return response.data;
    } catch (error) {
      this.handleError('get', error as AxiosError, { url });
    }
  }

  /**
   * 通用 POST 请求
   */
  async post<T = any>(url: string, data?: any, config?: any): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<T>(`${this.baseUrl}${url}`, data, config),
      );
      return response.data;
    } catch (error) {
      this.handleError('post', error as AxiosError, { url });
    }
  }

  /**
   * 通用 PUT 请求
   */
  async put<T = any>(url: string, data?: any, config?: any): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.put<T>(`${this.baseUrl}${url}`, data, config),
      );
      return response.data;
    } catch (error) {
      this.handleError('put', error as AxiosError, { url });
    }
  }

  /**
   * 通用 DELETE 请求
   */
  async delete<T = any>(url: string, config?: any): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.delete<T>(`${this.baseUrl}${url}`, config),
      );
      return response.data;
    } catch (error) {
      this.handleError('delete', error as AxiosError, { url });
    }
  }

  /**
   * 检查 AgentX 服务是否可用
   *
   * @returns 是否可用
   */
  async isHealthy(): Promise<boolean> {
    try {
      await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/health`, {
          timeout: 5000,
        }),
      );
      return true;
    } catch (error) {
      this.logger.warn('AgentX health check failed', {
        error: (error as Error).message,
      });
      return false;
    }
  }

  /**
   * 健康检查（别名方法，兼容旧代码）
   */
  async healthCheck(): Promise<boolean> {
    return this.isHealthy();
  }

  /**
   * 生成协同过滤推荐
   *
   * @param request - 推荐请求参数
   * @returns 推荐结果
   * @throws 如果 AgentX 服务不可用或返回错误
   */
  async generateCollaborativeRecommendations(
    request: CollaborativeRecommendationRequest,
  ): Promise<CollaborativeRecommendationResponse> {
    const endpoint = '/api/recommendation/collaborative';

    try {
      this.logger.log('[AgentX] Generating collaborative recommendations', {
        teamId: request.team_id,
        userId: request.user_id,
        algorithm: request.algorithm || 'hybrid',
      });

      const response = await firstValueFrom(
        this.httpService.post<CollaborativeRecommendationResponse>(
          `${this.baseUrl}${endpoint}`,
          request,
          {
            headers: this.getAuthHeaders(),
            timeout: 30000,
          },
        ),
      );

      this.logger.log('[AgentX] Collaborative recommendations generated', {
        total: response.data.total,
        executionTime: response.data.execution_time_ms,
      });

      return response.data;
    } catch (error) {
      this.logger.error(
        '[AgentX] Failed to generate collaborative recommendations',
        {
          error: (error as Error).message,
          teamId: request.team_id,
          userId: request.user_id,
        },
      );

      throw new Error(
        `AgentX collaborative recommendation failed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * 生成产品关键词
   *
   * @param request - 关键词生成请求参数
   * @returns 关键词数组
   * @throws 如果 AgentX 服务不可用或返回错误
   */
  async generateProductKeywords(
    request: GenerateProductKeywordsRequest,
  ): Promise<string[]> {
    const endpoint = '/api/ai/keywords';

    try {
      this.logger.log('[AgentX] Generating product keywords', {
        productName: request.productName,
      });

      const response = await firstValueFrom(
        this.httpService.post<{ keywords: string[] }>(
          `${this.baseUrl}${endpoint}`,
          {
            product_name: request.productName,
            product_selling_points: request.productSellingPoints,
          },
          {
            headers: this.getAuthHeaders(),
            timeout: 30000,
          },
        ),
      );

      this.logger.log('[AgentX] Product keywords generated', {
        count: response.data.keywords.length,
      });

      return response.data.keywords;
    } catch (error) {
      this.logger.error('[AgentX] Failed to generate product keywords', {
        error: (error as Error).message,
        productName: request.productName,
      });

      throw new Error(
        `AgentX product keywords generation failed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * LLM Chat Completion
   *
   * @param request - LLM 请求参数
   * @returns LLM 响应
   * @throws 如果 AgentX 服务不可用或返回错误
   */
  async chatCompletion(
    request: LLMChatCompletionRequest,
  ): Promise<LLMChatCompletionResponse> {
    const endpoint = '/ai/v1/chat/completions';

    try {
      this.logger.log('[AgentX] Calling LLM chat completion', {
        model: request.model,
        messageCount: request.messages.length,
      });

      const response = await firstValueFrom(
        this.httpService.post<LLMChatCompletionResponse>(
          `${this.baseUrl}${endpoint}`,
          request,
          {
            headers: this.getAuthHeaders(),
            timeout: 120000, // 2分钟超时
          },
        ),
      );

      this.logger.log('[AgentX] LLM chat completion successful', {
        model: request.model,
        finishReason: response.data.choices?.[0]?.finish_reason,
      });

      return response.data;
    } catch (error) {
      this.logger.error('[AgentX] LLM chat completion failed', {
        error: (error as Error).message,
        model: request.model,
      });

      throw new Error(
        `AgentX LLM chat completion failed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * 生成图像
   *
   * @param request - 图像生成请求参数
   * @returns 图像生成响应
   * @throws 如果 AgentX 服务不可用或返回错误
   */
  async generateImage(
    request: ImageGenerationRequest,
  ): Promise<ImageGenerationResponse> {
    const endpoint = '/ai/v1/images/generations';

    try {
      // Zod 验证请求参数
      const validatedRequest = ImageGenerationRequestSchema.parse(request);

      this.logger.log('[AgentX] Generating image', {
        model: validatedRequest.model,
        prompt: validatedRequest.prompt.substring(0, 50),
      });

      const response = await firstValueFrom(
        this.httpService.post<ImageGenerationResponse>(
          `${this.baseUrl}${endpoint}`,
          {
            model: validatedRequest.model,
            prompt: validatedRequest.prompt,
            n: validatedRequest.n,
            response_format: validatedRequest.response_format,
            aspect_ratio: validatedRequest.aspect_ratio,
            image_size: validatedRequest.image_size,
          },
          {
            headers: this.getAuthHeaders(),
            timeout: 120000, // 2分钟超时
          },
        ),
      );

      // Zod 验证响应数据
      const validatedResponse = ImageGenerationResponseSchema.parse(
        response.data,
      );

      this.logger.log('[AgentX] Image generated successfully', {
        model: validatedRequest.model,
        imageCount: validatedResponse.data.length,
      });

      return validatedResponse;
    } catch (error) {
      if (error instanceof z.ZodError) {
        this.logger.error('[AgentX] Image generation validation failed', {
          errors: error.issues,
        });
        throw new Error(
          `AgentX image generation validation failed: ${error.issues.map((e) => e.message).join(', ')}`,
        );
      }

      this.logger.error('[AgentX] Image generation failed', {
        error: (error as Error).message,
        model: request.model,
      });

      throw new Error(
        `AgentX image generation failed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * 编辑图像
   *
   * @param request - 图像编辑请求参数
   * @returns 图像生成响应
   * @throws 如果 AgentX 服务不可用或返回错误
   */
  async editImage(request: ImageEditRequest): Promise<ImageGenerationResponse> {
    const endpoint = '/ai/v1/images/edits';

    try {
      // Zod 验证请求参数
      const validatedRequest = ImageEditRequestSchema.parse(request);

      this.logger.log('[AgentX] Editing image', {
        model: validatedRequest.model,
        prompt: validatedRequest.prompt.substring(0, 50),
        imageCount: validatedRequest.image.length,
      });

      const response = await firstValueFrom(
        this.httpService.post<ImageGenerationResponse>(
          `${this.baseUrl}${endpoint}`,
          {
            model: validatedRequest.model,
            image: validatedRequest.image,
            prompt: validatedRequest.prompt,
            response_format: validatedRequest.response_format,
            aspect_ratio: validatedRequest.aspect_ratio,
            image_size: validatedRequest.image_size,
          },
          {
            headers: this.getAuthHeaders(),
            timeout: 120000,
          },
        ),
      );

      // Zod 验证响应数据
      const validatedResponse = ImageGenerationResponseSchema.parse(
        response.data,
      );

      this.logger.log('[AgentX] Image edited successfully', {
        model: validatedRequest.model,
        imageCount: validatedResponse.data.length,
      });

      return validatedResponse;
    } catch (error) {
      if (error instanceof z.ZodError) {
        this.logger.error('[AgentX] Image editing validation failed', {
          errors: error.issues,
        });
        throw new Error(
          `AgentX image editing validation failed: ${error.issues.map((e) => e.message).join(', ')}`,
        );
      }

      this.logger.error('[AgentX] Image editing failed', {
        error: (error as Error).message,
        model: request.model,
      });

      throw new Error(
        `AgentX image editing failed: ${(error as Error).message}`,
      );
    }
  }

  // ============================================================================
  // Memory Management APIs
  // ============================================================================

  /**
   * 创建对话记忆
   */
  async createConversationMemory(request: {
    user_id: string;
    team_id: string;
    session_id: string;
    user_message: string;
    agent_response: string;
    intent?: string;
    importance_score?: number;
    metadata?: Record<string, any>;
  }): Promise<{
    memory_id: string;
    message: string;
    summary: string;
    entities?: string[];
    keywords?: string[];
    indexed: boolean;
    created_at: string;
  }> {
    const endpoint = '/api/memory/conversations';

    try {
      this.logger.log('[AgentX] Creating conversation memory', {
        teamId: request.team_id,
        userId: request.user_id,
        sessionId: request.session_id,
      });

      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}${endpoint}`, request, {
          headers: this.getAuthHeaders(),
          timeout: 30000,
        }),
      );

      this.logger.log('[AgentX] Conversation memory created', {
        memoryId: response.data.memory_id,
      });

      return response.data;
    } catch (error) {
      this.handleError('createConversationMemory', error as AxiosError, {
        teamId: request.team_id,
        userId: request.user_id,
      });
    }
  }

  /**
   * 创建任务记忆
   */
  async createTaskMemory(request: {
    user_id: string;
    team_id: string;
    task_id: string;
    task_name: string;
    task_result: Record<string, any>;
    success: boolean;
    importance_score?: number;
    metadata?: Record<string, any>;
  }): Promise<{
    memory_id: string;
    message: string;
    summary: string;
    entities?: string[];
    keywords?: string[];
    indexed: boolean;
    created_at: string;
  }> {
    const endpoint = '/api/memory/tasks';

    try {
      this.logger.log('[AgentX] Creating task memory', {
        taskId: request.task_id,
        taskName: request.task_name,
      });

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}${endpoint}`,
          {
            ...request,
            task_result: JSON.stringify(request.task_result),
          },
          {
            headers: this.getAuthHeaders(),
            timeout: 30000,
          },
        ),
      );

      return response.data;
    } catch (error) {
      this.handleError('createTaskMemory', error as AxiosError, {
        taskId: request.task_id,
      });
    }
  }

  /**
   * 创建决策记忆
   */
  async createDecisionMemory(request: {
    user_id: string;
    team_id: string;
    decision_context: string;
    decision_result: Record<string, any>;
    workflow_id?: string;
    importance_score?: number;
    metadata?: Record<string, any>;
  }): Promise<{
    memory_id: string;
    message: string;
    summary: string;
    entities?: string[];
    keywords?: string[];
    indexed: boolean;
    created_at: string;
  }> {
    const endpoint = '/api/memory/decisions';

    try {
      this.logger.log('[AgentX] Creating decision memory', {
        userId: request.user_id,
        workflowId: request.workflow_id,
      });

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}${endpoint}`,
          {
            ...request,
            decision_result: JSON.stringify(request.decision_result),
          },
          {
            headers: this.getAuthHeaders(),
            timeout: 30000,
          },
        ),
      );

      return response.data;
    } catch (error) {
      this.handleError('createDecisionMemory', error as AxiosError, {
        userId: request.user_id,
      });
    }
  }

  /**
   * 搜索记忆 (GET)
   */
  async searchMemories(params: {
    q: string;
    user_id: string;
    team_id: string;
    memory_types?: string;
    top_k?: number;
    min_score?: number;
    time_decay?: boolean;
  }): Promise<{
    query: string;
    results_count: number;
    memories: Array<{
      memory_id: string;
      memory_type: string;
      content: string;
      summary: string;
      entities?: string[];
      keywords?: string[];
      similarity_score: number;
      importance_score: number;
      final_score: number;
      access_count: number;
      session_id?: string;
      created_at: string;
      last_accessed_at?: string;
    }>;
  }> {
    const endpoint = '/api/memory/search';

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}${endpoint}`, {
          params,
          headers: this.getAuthHeaders(),
          timeout: 30000,
        }),
      );

      return response.data;
    } catch (error) {
      this.handleError('searchMemories', error as AxiosError, {
        query: params.q,
      });
    }
  }

  /**
   * 搜索记忆 (POST - 复杂查询)
   */
  async searchMemoriesPost(data: {
    user_id: string;
    team_id: string;
    query: string;
    memory_types?: string[];
    session_id?: string;
    top_k?: number;
    min_score?: number;
    time_decay?: boolean;
    filters?: {
      importanceMin?: number;
      importanceMax?: number;
      startDate?: string;
      endDate?: string;
      hasEntities?: string[];
      hasKeywords?: string[];
    };
  }): Promise<{
    query: string;
    results_count: number;
    memories: Array<{
      memory_id: string;
      memory_type: string;
      content: string;
      summary: string;
      entities?: string[];
      keywords?: string[];
      similarity_score: number;
      importance_score: number;
      final_score: number;
      access_count: number;
      session_id?: string;
      created_at: string;
      last_accessed_at?: string;
    }>;
  }> {
    const endpoint = '/api/memory/search';

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}${endpoint}`, data, {
          headers: this.getAuthHeaders(),
          timeout: 30000,
        }),
      );

      return response.data;
    } catch (error) {
      this.handleError('searchMemoriesPost', error as AxiosError, {
        query: data.query,
      });
    }
  }

  /**
   * 获取记忆详情
   */
  async getMemoryById(memoryId: string): Promise<{
    memory_id: string;
    team_id: string;
    user_id: string;
    memory_type: string;
    content: string;
    summary: string;
    entities?: string[];
    keywords?: string[];
    session_id?: string;
    importance_score: number;
    access_count: number;
    decay_rate: number;
    source: string;
    metadata?: Record<string, any>;
    indexed: boolean;
    created_at: string;
    last_accessed_at?: string;
  }> {
    const endpoint = `/api/memory/${memoryId}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}${endpoint}`, {
          headers: this.getAuthHeaders(),
          timeout: 10000,
        }),
      );

      return response.data;
    } catch (error) {
      this.handleError('getMemoryById', error as AxiosError, {
        memoryId,
      });
    }
  }

  /**
   * 删除记忆
   */
  async deleteMemory(memoryId: string): Promise<{
    memory_id: string;
    deleted: boolean;
    message: string;
  }> {
    const endpoint = `/api/memory/${memoryId}`;

    try {
      const response = await firstValueFrom(
        this.httpService.delete(`${this.baseUrl}${endpoint}`, {
          headers: this.getAuthHeaders(),
          timeout: 10000,
        }),
      );

      return response.data;
    } catch (error) {
      this.handleError('deleteMemory', error as AxiosError, {
        memoryId,
      });
    }
  }

  /**
   * 获取记忆列表
   */
  async listMemories(params: {
    user_id: string;
    team_id: string;
    memory_types?: string;
    session_id?: string;
    page?: number;
    page_size?: number;
    sort_by?: string;
    sort_order?: string;
    start_date?: string;
    end_date?: string;
  }): Promise<{
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
    memories: Array<{
      memory_id: string;
      memory_type: string;
      summary: string;
      importance_score: number;
      created_at: string;
    }>;
  }> {
    const endpoint = '/api/memory/list';

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}${endpoint}`, {
          params,
          headers: this.getAuthHeaders(),
          timeout: 30000,
        }),
      );

      return response.data;
    } catch (error) {
      this.handleError('listMemories', error as AxiosError, {
        userId: params.user_id,
      });
    }
  }

  /**
   * 获取记忆统计
   */
  async getMemoryStats(params: {
    user_id: string;
    team_id: string;
    start_date?: string;
    end_date?: string;
  }): Promise<{
    team_id: string;
    user_id?: string;
    total_memories: number;
    by_type: Record<string, number>;
    avg_importance_score: number;
    totalAccessCount: number;
    dateRange: {
      start: string;
      end: string;
    };
    recentActivity?: Array<{
      date: string;
      newMemories: number;
      totalAccesses: number;
    }>;
  }> {
    const endpoint = '/api/memory/stats';

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}${endpoint}`, {
          params,
          headers: this.getAuthHeaders(),
          timeout: 30000,
        }),
      );

      return response.data;
    } catch (error) {
      this.handleError('getMemoryStats', error as AxiosError, {
        userId: params.user_id,
      });
    }
  }

  /**
   * 获取会话历史
   */
  async getSessionHistory(sessionId: string): Promise<{
    session_id: string;
    user_id: string;
    total_messages: number;
    messages: Array<{
      memory_id: string;
      user_message: string;
      agent_response: string;
      intent?: string;
      created_at: string;
    }>;
    summary?: string;
    created_at: string;
    last_activity_at: string;
  }> {
    const endpoint = `/api/memory/sessions/${sessionId}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}${endpoint}`, {
          headers: this.getAuthHeaders(),
          timeout: 30000,
        }),
      );

      return response.data;
    } catch (error) {
      this.handleError('getSessionHistory', error as AxiosError, {
        sessionId,
      });
    }
  }

  // ============================================================================
  // Preference Management APIs
  // ============================================================================

  /**
   * 推断用户偏好
   */
  async inferPreference(request: {
    user_id: string;
    team_id: string;
    category?: string;
    preference_key: string;
    preference_value: string;
    confidence_score?: number;
    context?: Record<string, any>;
  }): Promise<{
    preference_id: string;
    created: boolean;
    confidence_score: number;
    use_count: number;
  }> {
    const endpoint = '/preferences/infer';

    try {
      this.logger.log('[AgentX] Inferring user preference', {
        teamId: request.team_id,
        userId: request.user_id,
        category: request.category,
      });

      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}${endpoint}`, request, {
          headers: this.getAuthHeaders(),
          timeout: 30000,
        }),
      );

      return response.data;
    } catch (error) {
      this.handleError('inferPreference', error as AxiosError, {
        teamId: request.team_id,
        userId: request.user_id,
      });
    }
  }

  /**
   * 获取用户偏好
   */
  async getUserPreferences(params: {
    user_id: string;
    team_id: string;
    category?: string;
    min_confidence?: number;
  }): Promise<{
    user_id: string;
    category?: string;
    preferences: Record<string, string>;
    preferences_details: Array<{
      preference_id: string;
      preference_key: string;
      preference_value: string;
      confidence_score: number;
      explicit: boolean;
      use_count: number;
      last_used_at?: string;
      created_at: string;
    }>;
  }> {
    const endpoint = '/preferences';

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}${endpoint}`, {
          params,
          headers: this.getAuthHeaders(),
          timeout: 30000,
        }),
      );

      return response.data;
    } catch (error) {
      this.handleError('getUserPreferences', error as AxiosError, {
        userId: params.user_id,
      });
    }
  }

  /**
   * 更新用户偏好
   */
  async updatePreference(
    preferenceId: string,
    data: {
      user_id: string;
      team_id: string;
      preference_value?: string;
      confidence_score?: number;
      explicit?: boolean;
    },
  ): Promise<{
    preference_id: string;
    updated: boolean;
    preference_value: string;
    confidence_score: number;
    explicit: boolean;
  }> {
    const endpoint = `/preferences/${preferenceId}`;

    try {
      const response = await firstValueFrom(
        this.httpService.put(`${this.baseUrl}${endpoint}`, data, {
          headers: this.getAuthHeaders(),
          timeout: 30000,
        }),
      );

      return response.data;
    } catch (error) {
      this.handleError('updatePreference', error as AxiosError, {
        preferenceId,
      });
    }
  }

  /**
   * 删除用户偏好
   */
  async deletePreference(
    preferenceId: string,
    params: {
      user_id: string;
      team_id: string;
    },
  ): Promise<{
    preference_id: string;
    deleted: boolean;
  }> {
    const endpoint = `/preferences/${preferenceId}`;

    try {
      const response = await firstValueFrom(
        this.httpService.delete(`${this.baseUrl}${endpoint}`, {
          params,
          headers: this.getAuthHeaders(),
          timeout: 10000,
        }),
      );

      return response.data;
    } catch (error) {
      this.handleError('deletePreference', error as AxiosError, {
        preferenceId,
      });
    }
  }

  /**
   * 获取偏好统计
   */
  async getPreferenceStats(params: {
    user_id: string;
    team_id: string;
  }): Promise<{
    user_id: string;
    total_preferences: number;
    by_category: Record<string, number>;
    explicit_preferences: number;
    inferred_preferences: number;
    avg_confidence_score: number;
    most_used?: Array<{
      category: string;
      preference_key: string;
      preference_value: string;
      use_count: number;
    }>;
  }> {
    const endpoint = '/preferences/stats';

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}${endpoint}`, {
          params,
          headers: this.getAuthHeaders(),
          timeout: 30000,
        }),
      );

      return response.data;
    } catch (error) {
      this.handleError('getPreferenceStats', error as AxiosError, {
        userId: params.user_id,
      });
    }
  }

  // ============================================================================
  // SSE Monitoring
  // ============================================================================

  /**
   * 使用 SSE 监控任务进度
   * @param taskId 任务ID
   * @returns Promise that resolves when task completes
   */
  async monitorTaskWithSSE(taskId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      let eventSource: any = null;

      // 清理函数，确保连接被正确关闭
      const cleanup = () => {
        if (eventSource) {
          eventSource.close();
          eventSource = null;
          this.logger.log('SSE connection closed');
        }
      };

      try {
        const { EventSource } = require('eventsource');
        eventSource = new EventSource(`${this.baseUrl}/task/${taskId}/sse`);

        eventSource.onmessage = (event: any) => {
          try {
            const data = JSON.parse(event.data);

            const progress = data.progress ?? 0;
            const currentStep = data.current_step ?? 'Processing';

            this.logger.debug(`Task progress: ${progress}% - ${currentStep}`);

            if (data.ready) {
              cleanup();
              if (data.state === 'SUCCESS') {
                this.logger.log(`Task ${taskId} completed successfully`);
                resolve(data);
              } else {
                this.logger.error(`Task ${taskId} failed: ${data.error}`);
                reject(new Error(data.error || 'Task failed'));
              }
            }
          } catch (error) {
            this.logger.error('Failed to parse SSE data', error);
            cleanup();
            reject(new Error('Failed to parse SSE data'));
          }
        };

        eventSource.onerror = (error: any) => {
          cleanup();
          this.logger.warn('SSE connection error, falling back to polling');
          // Fallback to polling
          this.pollTaskStatus(taskId).then(resolve).catch(reject);
        };

        eventSource.onopen = () => {
          this.logger.log(`SSE connection established for ${taskId}`);
        };
      } catch (error) {
        this.logger.warn('SSE not available, using polling mode');
        this.pollTaskStatus(taskId).then(resolve).catch(reject);
      }
    });
  }

  /**
   * 轮询任务状态（SSE 失败时的降级方案）
   */
  private async pollTaskStatus(
    taskId: string,
    timeout: number = 300000,
    checkInterval: number = 3000,
  ): Promise<any> {
    this.logger.log(`Polling task status: ${taskId}`);

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const result = await this.getTaskStatus(taskId);

      const state = result.state ?? 'UNKNOWN';
      const progress = result.progress ?? 0;
      const currentStep = result.current_step ?? 'Processing';

      this.logger.debug(
        `Task progress: ${progress}% - ${currentStep} - ${state}`,
      );

      if (result.ready) {
        if (state === 'SUCCESS') {
          this.logger.log(`Task ${taskId} completed successfully`);
          return result;
        } else {
          const errorMsg = result.error ?? 'Task failed';
          throw new Error(`Task failed: ${errorMsg}`);
        }
      }

      await this.sleep(checkInterval);
    }

    throw new Error(`Task timeout: ${taskId}`);
  }

  /**
   * 睡眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
