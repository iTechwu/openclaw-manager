import { Inject, Injectable, Optional, OnModuleDestroy } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { FallbackChainService, FallbackChainModelService } from '@app/db';
import { ModelResolverService, ResolvedModel } from './model-resolver.service';

/**
 * Fallback 链中的模型配置
 */
export interface FallbackModel {
  /** 关联的 ModelCatalog ID（模型级引用） */
  modelCatalogId?: string;
  vendor: string;
  model: string;
  protocol: 'openai-compatible' | 'anthropic-native';
  features?: {
    extendedThinking?: boolean;
    cacheControl?: boolean;
  };
  /** 模型显示名称（来自 ModelCatalog.displayName） */
  displayName?: string;
}

/**
 * Fallback 链配置
 */
export interface FallbackChain {
  id?: string;
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
export class FallbackEngineService implements OnModuleDestroy {
  // Fallback 链配置（运行时缓存）
  private fallbackChains: Map<string, FallbackChain> = new Map();
  // Fallback 链缓存（数据库加载的配置）
  private chainCache = new Map<
    string,
    { chain: FallbackChain; expiry: number }
  >();
  private readonly chainCacheTTL = 5 * 60 * 1000; // 5 分钟

  // 活跃的 Fallback 上下文
  private activeContexts: Map<string, FallbackContext> = new Map();

  // 定期清理过期缓存的定时器
  private cleanupInterval?: NodeJS.Timeout;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    @Optional() private readonly modelResolverService?: ModelResolverService,
    @Optional() private readonly fallbackChainService?: FallbackChainService,
    @Optional()
    private readonly fallbackChainModelService?: FallbackChainModelService,
  ) {
    this.initializeDefaultChains();
    // 每分钟清理过期缓存
    this.cleanupInterval = setInterval(() => this.cleanupCache(), 60 * 1000);
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  /**
   * 清理过期缓存
   */
  private cleanupCache(): void {
    const now = Date.now();
    for (const [chainId, entry] of this.chainCache) {
      if (entry.expiry < now) {
        this.chainCache.delete(chainId);
      }
    }
  }

  /**
   * 清除 Fallback 链缓存
   */
  clearChainCache(chainId?: string): void {
    if (chainId) {
      this.chainCache.delete(chainId);
      this.fallbackChains.delete(chainId);
    } else {
      this.chainCache.clear();
      // 重新初始化默认链
      this.initializeDefaultChains();
    }
  }

  /**
   * 从数据库加载 Fallback 链配置
   */
  async loadFallbackChainFromDb(
    chainId: string,
  ): Promise<FallbackChain | null> {
    // 检查缓存
    const cached = this.chainCache.get(chainId);
    if (cached && cached.expiry > Date.now()) {
      return cached.chain;
    }

    // 从数据库加载
    if (this.fallbackChainService && this.fallbackChainModelService) {
      try {
        const dbChain = await this.fallbackChainService.getByChainId(chainId);
        if (!dbChain) {
          return null;
        }

        // 获取模型列表
        const models = await this.fallbackChainModelService.listByChainId(
          dbChain.id,
        );

        // 构建 FallbackChain 对象
        const chain = this.buildFallbackChain(dbChain, models);

        // 缓存结果
        this.chainCache.set(chainId, {
          chain,
          expiry: Date.now() + this.chainCacheTTL,
        });

        this.logger.info(
          `[FallbackEngine] Loaded fallback chain from DB: ${chainId}`,
        );

        return chain;
      } catch (error) {
        this.logger.warn(
          `[FallbackEngine] Failed to load fallback chain ${chainId} from DB`,
          { error },
        );
      }
    }

    return null;
  }

  /**
   * 从数据库记录构建 FallbackChain 对象
   */
  private buildFallbackChain(dbChain: any, models: any[]): FallbackChain {
    const fallbackModels: FallbackModel[] = models.map((m) => ({
      modelCatalogId: m.modelCatalogId,
      vendor: m.modelCatalog?.vendor || 'openai',
      model: m.modelCatalog?.model || m.modelId,
      protocol: this.inferProtocol(m.modelCatalog?.vendor),
      displayName: m.modelCatalog?.displayName,
    }));

    return {
      id: dbChain.id,
      chainId: dbChain.chainId,
      name: dbChain.name,
      models: fallbackModels,
      triggerStatusCodes: (dbChain.triggerStatusCodes as number[]) || [
        429, 500, 502, 503, 504,
      ],
      triggerErrorTypes: (dbChain.triggerErrorTypes as string[]) || [
        'rate_limit',
        'overloaded',
        'timeout',
      ],
      triggerTimeoutMs: dbChain.triggerTimeoutMs || 60000,
      maxRetries: dbChain.maxRetries || 3,
      retryDelayMs: dbChain.retryDelayMs || 2000,
      preserveProtocol: dbChain.preserveProtocol ?? false,
    };
  }

  /**
   * 从 vendor 推断协议
   */
  private inferProtocol(
    vendor?: string,
  ): 'openai-compatible' | 'anthropic-native' {
    return vendor === 'anthropic' ? 'anthropic-native' : 'openai-compatible';
  }

  /**
   * 初始化默认 Fallback 链
   * GLM-5 优先链路: GLM-5 -> Claude Opus 4.6 -> DeepSeek V3.2
   */
  private initializeDefaultChains(): void {
    const defaultChains: FallbackChain[] = [
      {
        chainId: 'default',
        name: '默认 Fallback 链',
        models: [
          {
            vendor: 'zhipu',
            model: 'glm-5',
            protocol: 'openai-compatible',
          },
          {
            vendor: 'anthropic',
            model: 'claude-opus-4-6',
            protocol: 'anthropic-native',
          },
          {
            vendor: 'deepseek',
            model: 'deepseek-v3-2-251201',
            protocol: 'openai-compatible',
          },
          { vendor: 'openai', model: 'gpt-4o', protocol: 'openai-compatible' },
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
            vendor: 'zhipu',
            model: 'glm-5',
            protocol: 'openai-compatible',
            features: { extendedThinking: true },
          },
          {
            vendor: 'anthropic',
            model: 'claude-opus-4-6',
            protocol: 'anthropic-native',
            features: { extendedThinking: true },
          },
          {
            vendor: 'deepseek',
            model: 'deepseek-v3-2-251201',
            protocol: 'openai-compatible',
          },
          { vendor: 'openai', model: 'o1', protocol: 'openai-compatible' },
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
            model: 'deepseek-v3-2-251201',
            protocol: 'openai-compatible',
          },
          {
            vendor: 'openai',
            model: 'gpt-4o-mini',
            protocol: 'openai-compatible',
          },
          {
            vendor: 'zhipu',
            model: 'glm-4.5-flash',
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
   * 根据 bot 的可用模型动态生成 Fallback 链
   * 主模型作为链首，其余按 vendor 多样性排列
   *
   * @param botId Bot ID
   * @param availableModels Bot 的可用模型（包含 isPrimary）
   * @param chainId 可选的链 ID，如果未提供则自动生成
   * @returns 生成的 Fallback 链
   */
  buildDynamicFallbackChain(
    botId: string,
    availableModels: { model: string; vendor: string; isPrimary: boolean }[],
    chainId?: string,
  ): FallbackChain {
    if (availableModels.length === 0) {
      throw new Error(`No available models for bot ${botId}`);
    }

    // 1. 找到主模型
    const primaryModel = availableModels.find((m) => m.isPrimary);
    const nonPrimaryModels = availableModels.filter((m) => !m.isPrimary);

    // 2. 构建模型列表：主模型在首位
    const models: FallbackModel[] = [];

    if (primaryModel) {
      models.push({
        vendor: primaryModel.vendor,
        model: primaryModel.model,
        protocol: this.inferProtocol(primaryModel.vendor),
      });
    }

    // 3. 按 vendor 多样性排列非主模型
    const usedVendors = new Set(primaryModel ? [primaryModel.vendor] : []);

    // 第一轮：不同 vendor 的模型
    for (const m of nonPrimaryModels) {
      if (models.length >= 4) break; // 最多 4 个模型
      if (!usedVendors.has(m.vendor)) {
        models.push({
          vendor: m.vendor,
          model: m.model,
          protocol: this.inferProtocol(m.vendor),
        });
        usedVendors.add(m.vendor);
      }
    }

    // 第二轮：填充剩余位置
    for (const m of nonPrimaryModels) {
      if (models.length >= 4) break;
      if (!models.some((existing) => existing.model === m.model)) {
        models.push({
          vendor: m.vendor,
          model: m.model,
          protocol: this.inferProtocol(m.vendor),
        });
      }
    }

    const effectiveChainId = chainId || `bot-${botId}-dynamic`;

    return {
      chainId: effectiveChainId,
      name: `Bot ${botId} 动态 Fallback 链`,
      models,
      triggerStatusCodes: [429, 500, 502, 503, 504],
      triggerErrorTypes: ['rate_limit', 'overloaded', 'timeout'],
      triggerTimeoutMs: 60000,
      maxRetries: Math.min(models.length, 3),
      retryDelayMs: 2000,
      preserveProtocol: false,
    };
  }

  /**
   * 为 bot 注册动态 Fallback 链（替代硬编码默认链）
   *
   * @param botId Bot ID
   * @param availableModels Bot 的可用模型
   * @returns 注册的 chainId
   */
  registerBotFallbackChain(
    botId: string,
    availableModels: { model: string; vendor: string; isPrimary: boolean }[],
  ): string {
    const chain = this.buildDynamicFallbackChain(botId, availableModels);
    this.fallbackChains.set(chain.chainId, chain);
    this.logger.info(
      `[FallbackEngine] Registered dynamic chain for bot ${botId}: ${chain.models.map((m) => m.model).join(' → ')}`,
    );
    return chain.chainId;
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
   * 获取 Fallback 链配置（同步版本，仅返回已缓存的链）
   */
  getFallbackChain(chainId: string): FallbackChain | undefined {
    return this.fallbackChains.get(chainId);
  }

  /**
   * 获取 Fallback 链配置（异步版本，尝试从数据库加载）
   */
  async getFallbackChainAsync(
    chainId: string,
  ): Promise<FallbackChain | undefined> {
    // 先检查内存缓存
    const cached = this.fallbackChains.get(chainId);
    if (cached) {
      return cached;
    }

    // 尝试从数据库加载
    const dbChain = await this.loadFallbackChainFromDb(chainId);
    if (dbChain) {
      // 更新内存缓存
      this.fallbackChains.set(chainId, dbChain);
      return dbChain;
    }

    return undefined;
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

  /**
   * 解析 Fallback 模型的最优 vendor 实例
   *
   * 使用 ModelResolverService 按 vendorPriority/healthScore 排序选择最优 vendor。
   * 支持排除已失败的 providerKeyIds（同模型多 vendor 容错）。
   *
   * @param model 模型名称
   * @param excludeProviderKeyIds 排除的 ProviderKey IDs（已失败的）
   * @returns 解析后的 vendor 实例，或 null
   */
  async resolveModelVendor(
    model: string,
    excludeProviderKeyIds?: string[],
  ): Promise<ResolvedModel | null> {
    if (!this.modelResolverService) {
      this.logger.debug(
        '[FallbackEngine] ModelResolverService not available, skipping vendor resolution',
      );
      return null;
    }

    return this.modelResolverService.resolve(model, { excludeProviderKeyIds });
  }

  /**
   * 解析 Fallback 模型的所有可用 vendor 实例（按优先级排序）
   * 用于同模型内多 vendor 容错
   */
  async resolveAllModelVendors(
    model: string,
    excludeProviderKeyIds?: string[],
  ): Promise<ResolvedModel[]> {
    if (!this.modelResolverService) {
      return [];
    }

    return this.modelResolverService.resolveAll(model, {
      excludeProviderKeyIds,
    });
  }

  /**
   * 报告模型请求结果，更新健康评分
   */
  async reportModelResult(
    providerKeyId: string,
    model: string,
    success: boolean,
  ): Promise<void> {
    if (!this.modelResolverService) return;

    await this.modelResolverService.updateHealthScore(
      providerKeyId,
      model,
      success,
    );
  }
}
