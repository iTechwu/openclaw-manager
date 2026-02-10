import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

/**
 * Fallback 链中的模型配置
 */
export interface FallbackModel {
  vendor: string;
  model: string;
  protocol: 'openai-compatible' | 'anthropic-native';
  features?: {
    extendedThinking?: boolean;
    cacheControl?: boolean;
  };
}

/**
 * Fallback 链配置
 */
export interface FallbackChain {
  chainId: string;
  name: string;
  models: FallbackModel[];
  triggerStatusCodes: number[];
  triggerErrorTypes: string[];
  triggerTimeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  preserveProtocol: boolean;
}

/**
 * Fallback 上下文
 */
export interface FallbackContext {
  chainId: string;
  currentIndex: number;
  retryCount: number;
  errors: Array<{
    model: string;
    statusCode?: number;
    errorType?: string;
    message?: string;
    timestamp: Date;
  }>;
}

/**
 * Fallback 决策结果
 */
export interface FallbackDecision {
  shouldFallback: boolean;
  nextModel?: FallbackModel;
  nextIndex?: number;
  exhausted?: boolean;
  reason?: string;
}

/**
 * FallbackEngineService - 多模型 Fallback 引擎
 *
 * 负责：
 * - 管理 Fallback 链配置
 * - 判断是否需要 Fallback
 * - 选择下一个 Fallback 模型
 * - 追踪 Fallback 状态
 */
@Injectable()
export class FallbackEngineService {
  // Fallback 链配置（后续从数据库加载）
  private fallbackChains: Map<string, FallbackChain> = new Map();

  // 活跃的 Fallback 上下文
  private activeContexts: Map<string, FallbackContext> = new Map();

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {
    this.initializeDefaultChains();
  }

  /**
   * 初始化默认 Fallback 链
   */
  private initializeDefaultChains(): void {
    const defaultChains: FallbackChain[] = [
      {
        chainId: 'default',
        name: '默认 Fallback 链',
        models: [
          {
            vendor: 'anthropic',
            model: 'claude-sonnet-4-20250514',
            protocol: 'openai-compatible',
          },
          { vendor: 'openai', model: 'gpt-4o', protocol: 'openai-compatible' },
          {
            vendor: 'deepseek',
            model: 'deepseek-chat',
            protocol: 'openai-compatible',
          },
        ],
        triggerStatusCodes: [429, 500, 502, 503, 504],
        triggerErrorTypes: ['rate_limit', 'overloaded', 'timeout'],
        triggerTimeoutMs: 60000,
        maxRetries: 3,
        retryDelayMs: 2000,
        preserveProtocol: false,
      },
      {
        chainId: 'deep-reasoning',
        name: '深度推理 Fallback 链',
        models: [
          {
            vendor: 'anthropic',
            model: 'claude-sonnet-4-20250514',
            protocol: 'anthropic-native',
            features: { extendedThinking: true },
          },
          {
            vendor: 'anthropic',
            model: 'claude-opus-4-20250514',
            protocol: 'anthropic-native',
            features: { extendedThinking: true },
          },
          { vendor: 'openai', model: 'o1', protocol: 'openai-compatible' },
          {
            vendor: 'deepseek',
            model: 'deepseek-reasoner',
            protocol: 'openai-compatible',
          },
        ],
        triggerStatusCodes: [429, 500, 502, 503, 504],
        triggerErrorTypes: ['rate_limit', 'overloaded', 'timeout'],
        triggerTimeoutMs: 120000,
        maxRetries: 3,
        retryDelayMs: 3000,
        preserveProtocol: false,
      },
      {
        chainId: 'cost-optimized',
        name: '成本优化 Fallback 链',
        models: [
          {
            vendor: 'deepseek',
            model: 'deepseek-chat',
            protocol: 'openai-compatible',
          },
          {
            vendor: 'openai',
            model: 'gpt-4o-mini',
            protocol: 'openai-compatible',
          },
          {
            vendor: 'google',
            model: 'gemini-2.0-flash-exp',
            protocol: 'openai-compatible',
          },
        ],
        triggerStatusCodes: [429, 500, 502, 503, 504],
        triggerErrorTypes: ['rate_limit', 'overloaded', 'timeout'],
        triggerTimeoutMs: 30000,
        maxRetries: 3,
        retryDelayMs: 1000,
        preserveProtocol: true,
      },
    ];

    for (const chain of defaultChains) {
      this.fallbackChains.set(chain.chainId, chain);
    }
  }

  /**
   * 从数据库加载 Fallback 链配置
   */
  async loadFallbackChainsFromDb(chains: FallbackChain[]): Promise<void> {
    this.fallbackChains.clear();
    for (const chain of chains) {
      this.fallbackChains.set(chain.chainId, chain);
    }
    this.logger.info(
      `[FallbackEngine] Loaded ${chains.length} fallback chains from database`,
    );
  }

  /**
   * 创建 Fallback 上下文
   */
  createContext(requestId: string, chainId: string): FallbackContext | null {
    const chain = this.fallbackChains.get(chainId);
    if (!chain) {
      this.logger.warn(`[FallbackEngine] Fallback chain not found: ${chainId}`);
      return null;
    }

    const context: FallbackContext = {
      chainId,
      currentIndex: 0,
      retryCount: 0,
      errors: [],
    };

    this.activeContexts.set(requestId, context);
    return context;
  }

  /**
   * 获取 Fallback 上下文
   */
  getContext(requestId: string): FallbackContext | undefined {
    return this.activeContexts.get(requestId);
  }

  /**
   * 清理 Fallback 上下文
   */
  clearContext(requestId: string): void {
    this.activeContexts.delete(requestId);
  }

  /**
   * 判断是否应该触发 Fallback
   */
  shouldTriggerFallback(
    chainId: string,
    statusCode?: number,
    errorType?: string,
    responseTimeMs?: number,
  ): boolean {
    const chain = this.fallbackChains.get(chainId);
    if (!chain) return false;

    // 检查状态码
    if (statusCode && chain.triggerStatusCodes.includes(statusCode)) {
      this.logger.info(
        `[FallbackEngine] Trigger fallback: status code ${statusCode}`,
      );
      return true;
    }

    // 检查错误类型
    if (errorType && chain.triggerErrorTypes.includes(errorType)) {
      this.logger.info(
        `[FallbackEngine] Trigger fallback: error type ${errorType}`,
      );
      return true;
    }

    // 检查超时
    if (responseTimeMs && responseTimeMs > chain.triggerTimeoutMs) {
      this.logger.info(
        `[FallbackEngine] Trigger fallback: timeout ${responseTimeMs}ms > ${chain.triggerTimeoutMs}ms`,
      );
      return true;
    }

    return false;
  }

  /**
   * 获取下一个 Fallback 模型
   */
  getNextFallback(
    requestId: string,
    error: {
      statusCode?: number;
      errorType?: string;
      message?: string;
    },
  ): FallbackDecision {
    const context = this.activeContexts.get(requestId);
    if (!context) {
      return {
        shouldFallback: false,
        reason: 'No active fallback context',
      };
    }

    const chain = this.fallbackChains.get(context.chainId);
    if (!chain) {
      return {
        shouldFallback: false,
        reason: 'Fallback chain not found',
      };
    }

    // 记录错误
    context.errors.push({
      model: chain.models[context.currentIndex]?.model || 'unknown',
      statusCode: error.statusCode,
      errorType: error.errorType,
      message: error.message,
      timestamp: new Date(),
    });

    // 检查是否超过最大重试次数
    if (context.retryCount >= chain.maxRetries) {
      return {
        shouldFallback: false,
        exhausted: true,
        reason: `Max retries (${chain.maxRetries}) exceeded`,
      };
    }

    // 移动到下一个模型
    const nextIndex = context.currentIndex + 1;

    // 检查是否还有可用模型
    if (nextIndex >= chain.models.length) {
      return {
        shouldFallback: false,
        exhausted: true,
        reason: 'All fallback models exhausted',
      };
    }

    // 更新上下文
    context.currentIndex = nextIndex;
    context.retryCount++;

    const nextModel = chain.models[nextIndex];

    this.logger.info(
      `[FallbackEngine] Fallback to: ${nextModel.vendor}/${nextModel.model} (attempt ${context.retryCount}/${chain.maxRetries})`,
    );

    return {
      shouldFallback: true,
      nextModel,
      nextIndex,
    };
  }

  /**
   * 获取当前模型
   */
  getCurrentModel(requestId: string): FallbackModel | null {
    const context = this.activeContexts.get(requestId);
    if (!context) return null;

    const chain = this.fallbackChains.get(context.chainId);
    if (!chain) return null;

    return chain.models[context.currentIndex] || null;
  }

  /**
   * 获取 Fallback 链配置
   */
  getFallbackChain(chainId: string): FallbackChain | undefined {
    return this.fallbackChains.get(chainId);
  }

  /**
   * 获取所有 Fallback 链
   */
  getAllFallbackChains(): FallbackChain[] {
    return Array.from(this.fallbackChains.values());
  }

  /**
   * 获取重试延迟时间
   */
  getRetryDelay(chainId: string): number {
    const chain = this.fallbackChains.get(chainId);
    return chain?.retryDelayMs || 2000;
  }

  /**
   * 获取 Fallback 统计信息
   */
  getFallbackStats(requestId: string): {
    chainId: string;
    totalAttempts: number;
    errors: FallbackContext['errors'];
  } | null {
    const context = this.activeContexts.get(requestId);
    if (!context) return null;

    return {
      chainId: context.chainId,
      totalAttempts: context.retryCount + 1,
      errors: context.errors,
    };
  }
}
