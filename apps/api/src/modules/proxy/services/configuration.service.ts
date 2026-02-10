import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { RoutingEngineService, CapabilityTag } from './routing-engine.service';
import {
  FallbackEngineService,
  FallbackChain,
  FallbackModel,
} from './fallback-engine.service';
import {
  CostTrackerService,
  CostStrategy,
  ModelPricing,
} from './cost-tracker.service';
import {
  ModelPricingService,
  CapabilityTagService,
  FallbackChainService,
  CostStrategyService,
  ComplexityRoutingConfigService,
} from '@app/db';
import type {
  ModelPricing as DbModelPricing,
  CapabilityTag as DbCapabilityTag,
  FallbackChain as DbFallbackChain,
  CostStrategy as DbCostStrategy,
  ComplexityRoutingConfig as DbComplexityRoutingConfig,
} from '@prisma/client';
import type { ConfigLoadStatus } from '@repo/contracts';

/**
 * ConfigurationService - 数据库驱动的配置管理服务
 *
 * 负责：
 * - 从数据库加载路由配置
 * - 定期刷新配置
 * - 配置变更通知
 * - 配置状态监控
 */
@Injectable()
export class ConfigurationService implements OnModuleInit {
  private loadStatus: ConfigLoadStatus = {
    modelPricing: { loaded: false, count: 0 },
    capabilityTags: { loaded: false, count: 0 },
    fallbackChains: { loaded: false, count: 0 },
    costStrategies: { loaded: false, count: 0 },
    complexityRoutingConfigs: { loaded: false, count: 0 },
  };

  private refreshInterval: NodeJS.Timeout | null = null;
  private readonly REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 分钟

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly routingEngine: RoutingEngineService,
    private readonly fallbackEngine: FallbackEngineService,
    private readonly costTracker: CostTrackerService,
    // DB Services for loading configuration from database
    private readonly modelPricingDb: ModelPricingService,
    private readonly capabilityTagDb: CapabilityTagService,
    private readonly fallbackChainDb: FallbackChainService,
    private readonly costStrategyDb: CostStrategyService,
    private readonly complexityRoutingConfigDb: ComplexityRoutingConfigService,
  ) {}

  /**
   * 模块初始化时加载配置
   */
  async onModuleInit(): Promise<void> {
    this.logger.info('[ConfigurationService] Initializing...');

    // 首次加载配置
    await this.loadAllConfigurations();

    // 启动定期刷新
    this.startPeriodicRefresh();

    this.logger.info('[ConfigurationService] Initialization completed');
  }

  /**
   * 加载所有配置
   */
  async loadAllConfigurations(): Promise<void> {
    this.logger.info('[ConfigurationService] Loading all configurations...');

    try {
      // 并行加载所有配置
      await Promise.all([
        this.loadModelPricing(),
        this.loadCapabilityTags(),
        this.loadFallbackChains(),
        this.loadCostStrategies(),
        this.loadComplexityRoutingConfigs(),
      ]);

      this.logger.info(
        '[ConfigurationService] All configurations loaded successfully',
      );
    } catch (error) {
      this.logger.error(
        '[ConfigurationService] Failed to load configurations',
        { error },
      );
    }
  }

  /**
   * 加载模型定价配置
   * 优先从数据库加载，如果数据库为空则使用默认配置
   */
  async loadModelPricing(): Promise<void> {
    try {
      // 从数据库加载
      const dbPricing = await this.modelPricingDb.listAll();

      let pricing: ModelPricing[];

      if (dbPricing && dbPricing.length > 0) {
        // 转换数据库格式为内部格式
        pricing = dbPricing.map((p: DbModelPricing) =>
          this.convertDbModelPricing(p),
        );
        this.logger.info(
          `[ConfigurationService] Loaded ${pricing.length} model pricing entries from database`,
        );
      } else {
        // 使用默认配置
        pricing = this.getDefaultModelPricing();
        this.logger.info(
          `[ConfigurationService] Using ${pricing.length} default model pricing entries (database empty)`,
        );
      }

      await this.costTracker.loadModelPricingFromDb(pricing);

      this.loadStatus.modelPricing = {
        loaded: true,
        count: pricing.length,
        lastUpdate: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('[ConfigurationService] Failed to load model pricing', {
        error,
      });
      this.loadStatus.modelPricing.loaded = false;
    }
  }

  /**
   * 加载能力标签配置
   * 优先从数据库加载，如果数据库为空则使用默认配置
   */
  async loadCapabilityTags(): Promise<void> {
    try {
      // 从数据库加载
      const { list: dbTags } = await this.capabilityTagDb.list(
        { isActive: true },
        { orderBy: { priority: 'desc' }, limit: 1000 },
      );

      let tags: CapabilityTag[];

      if (dbTags && dbTags.length > 0) {
        // 转换数据库格式为内部格式
        tags = dbTags.map((t: DbCapabilityTag) =>
          this.convertDbCapabilityTag(t),
        );
        this.logger.info(
          `[ConfigurationService] Loaded ${tags.length} capability tags from database`,
        );
      } else {
        // 使用默认配置
        tags = this.getDefaultCapabilityTags();
        this.logger.info(
          `[ConfigurationService] Using ${tags.length} default capability tags (database empty)`,
        );
      }

      await this.routingEngine.loadCapabilityTagsFromDb(tags);

      this.loadStatus.capabilityTags = {
        loaded: true,
        count: tags.length,
        lastUpdate: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(
        '[ConfigurationService] Failed to load capability tags',
        { error },
      );
      this.loadStatus.capabilityTags.loaded = false;
    }
  }

  /**
   * 加载 Fallback 链配置
   * 优先从数据库加载，如果数据库为空则使用默认配置
   */
  async loadFallbackChains(): Promise<void> {
    try {
      // 从数据库加载
      const { list: dbChains } = await this.fallbackChainDb.list(
        { isActive: true },
        { orderBy: { createdAt: 'asc' }, limit: 1000 },
      );

      let chains: FallbackChain[];

      if (dbChains && dbChains.length > 0) {
        // 转换数据库格式为内部格式
        chains = dbChains.map((c: DbFallbackChain) =>
          this.convertDbFallbackChain(c),
        );
        this.logger.info(
          `[ConfigurationService] Loaded ${chains.length} fallback chains from database`,
        );
      } else {
        // 使用默认配置
        chains = this.getDefaultFallbackChains();
        this.logger.info(
          `[ConfigurationService] Using ${chains.length} default fallback chains (database empty)`,
        );
      }

      await this.fallbackEngine.loadFallbackChainsFromDb(chains);

      this.loadStatus.fallbackChains = {
        loaded: true,
        count: chains.length,
        lastUpdate: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(
        '[ConfigurationService] Failed to load fallback chains',
        { error },
      );
      this.loadStatus.fallbackChains.loaded = false;
    }
  }

  /**
   * 加载成本策略配置
   * 优先从数据库加载，如果数据库为空则使用默认配置
   */
  async loadCostStrategies(): Promise<void> {
    try {
      // 从数据库加载
      const { list: dbStrategies } = await this.costStrategyDb.list(
        { isActive: true },
        { orderBy: { createdAt: 'asc' }, limit: 1000 },
      );

      let strategies: CostStrategy[];

      if (dbStrategies && dbStrategies.length > 0) {
        // 转换数据库格式为内部格式
        strategies = dbStrategies.map((s: DbCostStrategy) =>
          this.convertDbCostStrategy(s),
        );
        this.logger.info(
          `[ConfigurationService] Loaded ${strategies.length} cost strategies from database`,
        );
      } else {
        // 使用默认配置
        strategies = this.getDefaultCostStrategies();
        this.logger.info(
          `[ConfigurationService] Using ${strategies.length} default cost strategies (database empty)`,
        );
      }

      await this.costTracker.loadCostStrategiesFromDb(strategies);

      this.loadStatus.costStrategies = {
        loaded: true,
        count: strategies.length,
        lastUpdate: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(
        '[ConfigurationService] Failed to load cost strategies',
        { error },
      );
      this.loadStatus.costStrategies.loaded = false;
    }
  }

  /**
   * 加载复杂度路由配置
   * 优先从数据库加载，如果数据库为空则使用默认配置
   */
  async loadComplexityRoutingConfigs(): Promise<void> {
    try {
      // 从数据库加载启用的配置
      const { list: dbConfigs } = await this.complexityRoutingConfigDb.list(
        { isEnabled: true },
        { orderBy: { createdAt: 'asc' }, limit: 100 },
      );

      if (dbConfigs.length > 0) {
        this.logger.info(
          `[ConfigurationService] Loaded ${dbConfigs.length} complexity routing configs from database`,
        );

        // 使用第一个启用的配置
        const activeConfig = dbConfigs[0];
        const models = activeConfig.models as Record<
          string,
          { vendor: string; model: string }
        >;

        this.routingEngine.setComplexityRoutingConfig({
          enabled: true,
          models: {
            super_easy: models.super_easy,
            easy: models.easy,
            medium: models.medium,
            hard: models.hard,
            super_hard: models.super_hard,
          },
          toolMinComplexity: activeConfig.toolMinComplexity as
            | 'super_easy'
            | 'easy'
            | 'medium'
            | 'hard'
            | 'super_hard'
            | undefined,
          classifier: {
            model: activeConfig.classifierModel,
            vendor: activeConfig.classifierVendor,
          },
        });

        this.loadStatus.complexityRoutingConfigs = {
          loaded: true,
          count: dbConfigs.length,
          lastUpdate: new Date().toISOString(),
        };
      } else {
        // 数据库为空，使用默认配置但不启用复杂度路由
        this.logger.info(
          '[ConfigurationService] No complexity routing configs in database, complexity routing disabled',
        );

        // 设置为禁用状态
        this.routingEngine.setComplexityRoutingConfig({
          enabled: false,
          models: this.getDefaultComplexityRoutingConfigs()[0].models,
          toolMinComplexity: 'easy',
          classifier: {
            model: 'deepseek-v3-250324',
            vendor: 'deepseek',
          },
        });

        this.loadStatus.complexityRoutingConfigs = {
          loaded: true,
          count: 0,
          lastUpdate: new Date().toISOString(),
        };
      }
    } catch (error) {
      this.logger.error(
        '[ConfigurationService] Failed to load complexity routing configs',
        { error },
      );
      this.loadStatus.complexityRoutingConfigs.loaded = false;
    }
  }

  /**
   * 启动定期刷新
   */
  private startPeriodicRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    this.refreshInterval = setInterval(async () => {
      this.logger.debug('[ConfigurationService] Periodic refresh triggered');
      await this.loadAllConfigurations();
    }, this.REFRESH_INTERVAL_MS);

    this.logger.info(
      `[ConfigurationService] Periodic refresh started (interval: ${this.REFRESH_INTERVAL_MS / 1000}s)`,
    );
  }

  /**
   * 停止定期刷新
   */
  stopPeriodicRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
      this.logger.info('[ConfigurationService] Periodic refresh stopped');
    }
  }

  /**
   * 手动触发配置刷新
   */
  async refreshConfigurations(): Promise<void> {
    this.logger.info('[ConfigurationService] Manual refresh triggered');
    await this.loadAllConfigurations();
  }

  /**
   * 获取配置加载状态
   */
  getLoadStatus(): ConfigLoadStatus {
    return { ...this.loadStatus };
  }

  /**
   * 检查配置是否已加载
   */
  isConfigLoaded(): boolean {
    return (
      this.loadStatus.modelPricing.loaded &&
      this.loadStatus.capabilityTags.loaded &&
      this.loadStatus.fallbackChains.loaded &&
      this.loadStatus.costStrategies.loaded &&
      this.loadStatus.complexityRoutingConfigs.loaded
    );
  }

  // ============================================================================
  // 数据库格式转换方法
  // ============================================================================

  /**
   * 转换数据库 ModelPricing 为内部格式
   */
  private convertDbModelPricing(db: DbModelPricing): ModelPricing {
    return {
      model: db.model,
      vendor: db.vendor,
      inputPrice: Number(db.inputPrice),
      outputPrice: Number(db.outputPrice),
      cacheReadPrice: db.cacheReadPrice ? Number(db.cacheReadPrice) : undefined,
      cacheWritePrice: db.cacheWritePrice
        ? Number(db.cacheWritePrice)
        : undefined,
      thinkingPrice: db.thinkingPrice ? Number(db.thinkingPrice) : undefined,
      reasoningScore: db.reasoningScore,
      codingScore: db.codingScore,
      creativityScore: db.creativityScore,
      speedScore: db.speedScore,
    };
  }

  /**
   * 转换数据库 CapabilityTag 为内部格式
   */
  private convertDbCapabilityTag(db: DbCapabilityTag): CapabilityTag {
    return {
      tagId: db.tagId,
      name: db.name,
      category: db.category,
      priority: db.priority,
      requiredProtocol: db.requiredProtocol as
        | 'openai-compatible'
        | 'anthropic-native'
        | undefined,
      requiredSkills: (db.requiredSkills as string[]) || undefined,
      requiredModels: (db.requiredModels as string[]) || undefined,
      requiresExtendedThinking: db.requiresExtendedThinking,
      requiresCacheControl: db.requiresCacheControl,
      requiresVision: db.requiresVision,
    };
  }

  /**
   * 转换数据库 FallbackChain 为内部格式
   */
  private convertDbFallbackChain(db: DbFallbackChain): FallbackChain {
    return {
      chainId: db.chainId,
      name: db.name,
      models: db.models as unknown as FallbackModel[],
      triggerStatusCodes: db.triggerStatusCodes as number[],
      triggerErrorTypes: db.triggerErrorTypes as string[],
      triggerTimeoutMs: db.triggerTimeoutMs,
      maxRetries: db.maxRetries,
      retryDelayMs: db.retryDelayMs,
      preserveProtocol: db.preserveProtocol,
    };
  }

  /**
   * 转换数据库 CostStrategy 为内部格式
   */
  private convertDbCostStrategy(db: DbCostStrategy): CostStrategy {
    return {
      strategyId: db.strategyId,
      name: db.name,
      costWeight: Number(db.costWeight),
      performanceWeight: Number(db.performanceWeight),
      capabilityWeight: Number(db.capabilityWeight),
      maxCostPerRequest: db.maxCostPerRequest
        ? Number(db.maxCostPerRequest)
        : undefined,
      maxLatencyMs: db.maxLatencyMs || undefined,
      minCapabilityScore: db.minCapabilityScore || undefined,
      scenarioWeights:
        (db.scenarioWeights as Record<string, number>) || undefined,
    };
  }

  // ============================================================================
  // 默认配置方法
  // ============================================================================

  /**
   * 获取默认模型定价配置
   */
  private getDefaultModelPricing(): ModelPricing[] {
    return [
      // Anthropic 模型
      {
        model: 'claude-opus-4-20250514',
        vendor: 'anthropic',
        inputPrice: 15,
        outputPrice: 75,
        cacheReadPrice: 1.5,
        cacheWritePrice: 18.75,
        thinkingPrice: 15,
        reasoningScore: 100,
        codingScore: 98,
        creativityScore: 95,
        speedScore: 60,
      },
      {
        model: 'claude-sonnet-4-20250514',
        vendor: 'anthropic',
        inputPrice: 3,
        outputPrice: 15,
        cacheReadPrice: 0.3,
        cacheWritePrice: 3.75,
        thinkingPrice: 3,
        reasoningScore: 92,
        codingScore: 95,
        creativityScore: 90,
        speedScore: 80,
      },
      {
        model: 'claude-3-5-haiku-20241022',
        vendor: 'anthropic',
        inputPrice: 0.8,
        outputPrice: 4,
        cacheReadPrice: 0.08,
        cacheWritePrice: 1,
        reasoningScore: 75,
        codingScore: 80,
        creativityScore: 75,
        speedScore: 95,
      },
      // OpenAI 模型
      {
        model: 'gpt-4o',
        vendor: 'openai',
        inputPrice: 2.5,
        outputPrice: 10,
        reasoningScore: 90,
        codingScore: 92,
        creativityScore: 88,
        speedScore: 85,
      },
      {
        model: 'gpt-4o-mini',
        vendor: 'openai',
        inputPrice: 0.15,
        outputPrice: 0.6,
        reasoningScore: 78,
        codingScore: 82,
        creativityScore: 75,
        speedScore: 95,
      },
      {
        model: 'o1',
        vendor: 'openai',
        inputPrice: 15,
        outputPrice: 60,
        thinkingPrice: 15,
        reasoningScore: 98,
        codingScore: 95,
        creativityScore: 85,
        speedScore: 50,
      },
      // DeepSeek 模型
      {
        model: 'deepseek-chat',
        vendor: 'deepseek',
        inputPrice: 0.14,
        outputPrice: 0.28,
        cacheReadPrice: 0.014,
        cacheWritePrice: 0.14,
        reasoningScore: 85,
        codingScore: 92,
        creativityScore: 80,
        speedScore: 90,
      },
      {
        model: 'deepseek-reasoner',
        vendor: 'deepseek',
        inputPrice: 0.55,
        outputPrice: 2.19,
        thinkingPrice: 0.55,
        reasoningScore: 95,
        codingScore: 94,
        creativityScore: 82,
        speedScore: 65,
      },
      // Google 模型
      {
        model: 'gemini-2.0-flash',
        vendor: 'google',
        inputPrice: 0.1,
        outputPrice: 0.4,
        reasoningScore: 82,
        codingScore: 85,
        creativityScore: 80,
        speedScore: 95,
      },
      // Groq 模型
      {
        model: 'llama-3.3-70b-versatile',
        vendor: 'groq',
        inputPrice: 0.59,
        outputPrice: 0.79,
        reasoningScore: 80,
        codingScore: 82,
        creativityScore: 78,
        speedScore: 98,
      },
    ];
  }

  /**
   * 获取默认能力标签配置
   */
  private getDefaultCapabilityTags(): CapabilityTag[] {
    return [
      {
        tagId: 'deep-reasoning',
        name: '深度推理',
        category: 'reasoning',
        priority: 100,
        requiredProtocol: 'anthropic-native',
        requiredModels: [
          'claude-opus-4-20250514',
          'claude-sonnet-4-20250514',
          'o1',
          'deepseek-reasoner',
        ],
        requiresExtendedThinking: true,
      },
      {
        tagId: 'code-generation',
        name: '代码生成',
        category: 'code',
        priority: 90,
        requiredModels: ['claude-sonnet-4-20250514', 'gpt-4o', 'deepseek-chat'],
      },
      {
        tagId: 'cost-optimized',
        name: '成本优化',
        category: 'cost',
        priority: 90,
        requiredModels: [
          'deepseek-chat',
          'gpt-4o-mini',
          'claude-3-5-haiku-20241022',
          'gemini-2.0-flash',
        ],
        requiresCacheControl: true,
      },
      {
        tagId: 'fast-response',
        name: '快速响应',
        category: 'speed',
        priority: 85,
        requiredModels: [
          'llama-3.3-70b-versatile',
          'gemini-2.0-flash',
          'gpt-4o-mini',
        ],
      },
    ];
  }

  /**
   * 获取默认 Fallback 链配置
   */
  private getDefaultFallbackChains(): FallbackChain[] {
    return [
      {
        chainId: 'default',
        name: '默认 Fallback 链',
        models: [
          {
            vendor: 'anthropic',
            model: 'claude-sonnet-4-20250514',
            protocol: 'openai-compatible',
          },
          {
            vendor: 'openai',
            model: 'gpt-4o',
            protocol: 'openai-compatible',
          },
          {
            vendor: 'deepseek',
            model: 'deepseek-chat',
            protocol: 'openai-compatible',
          },
        ] as FallbackModel[],
        triggerStatusCodes: [429, 500, 502, 503, 504],
        triggerErrorTypes: ['rate_limit', 'overloaded', 'timeout'],
        triggerTimeoutMs: 60000,
        maxRetries: 3,
        retryDelayMs: 2000,
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
            vendor: 'google',
            model: 'gemini-2.0-flash',
            protocol: 'openai-compatible',
          },
          {
            vendor: 'openai',
            model: 'gpt-4o-mini',
            protocol: 'openai-compatible',
          },
        ] as FallbackModel[],
        triggerStatusCodes: [429, 500, 502, 503, 504],
        triggerErrorTypes: ['rate_limit', 'overloaded', 'timeout'],
        triggerTimeoutMs: 30000,
        maxRetries: 5,
        retryDelayMs: 1000,
        preserveProtocol: false,
      },
    ];
  }

  /**
   * 获取默认成本策略配置
   */
  private getDefaultCostStrategies(): CostStrategy[] {
    return [
      {
        strategyId: 'lowest-cost',
        name: '最低成本',
        costWeight: 0.8,
        performanceWeight: 0.1,
        capabilityWeight: 0.1,
        maxCostPerRequest: 0.01,
      },
      {
        strategyId: 'best-value',
        name: '最佳性价比',
        costWeight: 0.5,
        performanceWeight: 0.2,
        capabilityWeight: 0.3,
      },
      {
        strategyId: 'performance-first',
        name: '性能优先',
        costWeight: 0.1,
        performanceWeight: 0.3,
        capabilityWeight: 0.6,
        minCapabilityScore: 85,
      },
      {
        strategyId: 'balanced',
        name: '均衡策略',
        costWeight: 0.33,
        performanceWeight: 0.33,
        capabilityWeight: 0.34,
      },
    ];
  }

  /**
   * 获取默认复杂度路由配置
   */
  private getDefaultComplexityRoutingConfigs(): Array<{
    configId: string;
    name: string;
    models: {
      super_easy: { vendor: string; model: string };
      easy: { vendor: string; model: string };
      medium: { vendor: string; model: string };
      hard: { vendor: string; model: string };
      super_hard: { vendor: string; model: string };
    };
    toolMinComplexity?:
      | 'super_easy'
      | 'easy'
      | 'medium'
      | 'hard'
      | 'super_hard';
    classifier?: {
      model: string;
      vendor: string;
      baseUrl?: string;
    };
  }> {
    return [
      {
        configId: 'default',
        name: '默认复杂度路由',
        models: {
          super_easy: { vendor: 'deepseek', model: 'deepseek-v3' },
          easy: { vendor: 'deepseek', model: 'deepseek-v3' },
          medium: { vendor: 'openai', model: 'gpt-4o' },
          hard: { vendor: 'anthropic', model: 'claude-opus-4-20250514' },
          super_hard: { vendor: 'anthropic', model: 'claude-opus-4-20250514' },
        },
        toolMinComplexity: 'easy',
        classifier: {
          model: 'deepseek-v3-250324',
          vendor: 'deepseek',
        },
      },
      {
        configId: 'cost-optimized',
        name: '成本优化复杂度路由',
        models: {
          super_easy: { vendor: 'deepseek', model: 'deepseek-v3' },
          easy: { vendor: 'deepseek', model: 'deepseek-v3' },
          medium: { vendor: 'deepseek', model: 'deepseek-v3' },
          hard: { vendor: 'openai', model: 'gpt-4o' },
          super_hard: {
            vendor: 'anthropic',
            model: 'claude-sonnet-4-20250514',
          },
        },
        toolMinComplexity: 'easy',
        classifier: {
          model: 'deepseek-v3-250324',
          vendor: 'deepseek',
        },
      },
      {
        configId: 'performance-first',
        name: '性能优先复杂度路由',
        models: {
          super_easy: { vendor: 'openai', model: 'gpt-4o-mini' },
          easy: { vendor: 'openai', model: 'gpt-4o' },
          medium: { vendor: 'anthropic', model: 'claude-sonnet-4-20250514' },
          hard: { vendor: 'anthropic', model: 'claude-opus-4-20250514' },
          super_hard: { vendor: 'anthropic', model: 'claude-opus-4-20250514' },
        },
        toolMinComplexity: 'medium',
        classifier: {
          model: 'gpt-4o-mini',
          vendor: 'openai',
        },
      },
    ];
  }
}
