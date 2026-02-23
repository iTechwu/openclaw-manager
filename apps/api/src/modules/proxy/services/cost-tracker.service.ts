import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

/**
 * 成本策略配置
 */
export interface CostStrategy {
  strategyId: string;
  name: string;
  costWeight: number;
  performanceWeight: number;
  capabilityWeight: number;
  maxCostPerRequest?: number;
  maxLatencyMs?: number;
  minCapabilityScore?: number;
  scenarioWeights?: {
    reasoning?: number;
    coding?: number;
    creativity?: number;
    speed?: number;
  };
}

/**
 * 模型目录定价信息（来自 ModelCatalog 表）
 */
export interface ModelCatalogPricing {
  model: string;
  vendor: string;
  inputPrice: number; // 美元/百万 tokens
  outputPrice: number;
  cacheReadPrice?: number;
  cacheWritePrice?: number;
  thinkingPrice?: number;
  reasoningScore?: number;
  codingScore?: number;
  creativityScore?: number;
  speedScore?: number;
}

/**
 * Token 使用量
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  thinkingTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/**
 * 成本计算结果
 */
export interface CostCalculation {
  inputCost: number;
  outputCost: number;
  thinkingCost: number;
  cacheCost: number;
  totalCost: number;
  currency: 'USD';
}

/**
 * 预算状态
 */
export interface BudgetStatus {
  dailyUsed: number;
  dailyLimit?: number;
  dailyRemaining?: number;
  monthlyUsed: number;
  monthlyLimit?: number;
  monthlyRemaining?: number;
  alertTriggered: boolean;
  shouldDowngrade: boolean;
}

/**
 * CostTrackerService - 成本追踪与预算控制服务
 *
 * 负责：
 * - 计算请求成本
 * - 追踪 Bot 使用成本
 * - 预算控制和告警
 * - 成本优化建议
 */
@Injectable()
export class CostTrackerService {
  // 成本策略配置（后续从数据库加载）
  private costStrategies: Map<string, CostStrategy> = new Map();

  // 模型目录定价信息（从 ModelCatalog 加载）
  private modelCatalog: Map<string, ModelCatalogPricing> = new Map();

  // Bot 使用量追踪（内存缓存，定期持久化）
  private botUsage: Map<
    string,
    {
      dailyCost: number;
      monthlyCost: number;
      lastResetDate: string;
      lastResetMonth: string;
    }
  > = new Map();

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {
    this.initializeDefaultStrategies();
    this.initializeDefaultPricing();
  }

  /**
   * 初始化默认成本策略
   */
  private initializeDefaultStrategies(): void {
    const defaultStrategies: CostStrategy[] = [
      {
        strategyId: 'lowest-cost',
        name: '最低成本',
        costWeight: 0.8,
        performanceWeight: 0.1,
        capabilityWeight: 0.1,
        maxCostPerRequest: 0.01,
        scenarioWeights: {
          reasoning: 0.2,
          coding: 0.2,
          creativity: 0.2,
          speed: 0.6,
        },
      },
      {
        strategyId: 'best-value',
        name: '最佳性价比',
        costWeight: 0.5,
        performanceWeight: 0.2,
        capabilityWeight: 0.3,
        scenarioWeights: {
          reasoning: 0.4,
          coding: 0.4,
          creativity: 0.3,
          speed: 0.4,
        },
      },
      {
        strategyId: 'performance-first',
        name: '性能优先',
        costWeight: 0.1,
        performanceWeight: 0.3,
        capabilityWeight: 0.6,
        minCapabilityScore: 85,
        scenarioWeights: {
          reasoning: 0.8,
          coding: 0.7,
          creativity: 0.5,
          speed: 0.3,
        },
      },
      {
        strategyId: 'balanced',
        name: '均衡策略',
        costWeight: 0.4,
        performanceWeight: 0.3,
        capabilityWeight: 0.3,
        scenarioWeights: {
          reasoning: 0.5,
          coding: 0.5,
          creativity: 0.4,
          speed: 0.5,
        },
      },
    ];

    for (const strategy of defaultStrategies) {
      this.costStrategies.set(strategy.strategyId, strategy);
    }
  }

  /**
   * 初始化默认模型定价
   */
  private initializeDefaultPricing(): void {
    const defaultPricing: ModelCatalogPricing[] = [
      // Anthropic
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
        cacheWritePrice: 1.0,
        reasoningScore: 75,
        codingScore: 80,
        creativityScore: 70,
        speedScore: 95,
      },
      // OpenAI
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
        reasoningScore: 75,
        codingScore: 78,
        creativityScore: 72,
        speedScore: 95,
      },
      {
        model: 'o1',
        vendor: 'openai',
        inputPrice: 15,
        outputPrice: 60,
        reasoningScore: 98,
        codingScore: 95,
        creativityScore: 85,
        speedScore: 50,
      },
      // DeepSeek
      {
        model: 'deepseek-chat',
        vendor: 'deepseek',
        inputPrice: 0.14,
        outputPrice: 0.28,
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
        reasoningScore: 95,
        codingScore: 93,
        creativityScore: 78,
        speedScore: 70,
      },
    ];

    for (const pricing of defaultPricing) {
      this.modelCatalog.set(pricing.model, pricing);
    }
  }

  /**
   * 从数据库加载成本策略
   */
  async loadCostStrategiesFromDb(strategies: CostStrategy[]): Promise<void> {
    this.costStrategies.clear();
    for (const strategy of strategies) {
      this.costStrategies.set(strategy.strategyId, strategy);
    }
    this.logger.info(
      `[CostTracker] Loaded ${strategies.length} cost strategies from database`,
    );
  }

  /**
   * 从数据库加载模型目录定价
   */
  async loadModelCatalogPricingFromDb(
    pricing: ModelCatalogPricing[],
  ): Promise<void> {
    this.modelCatalog.clear();
    for (const p of pricing) {
      this.modelCatalog.set(p.model, p);
    }
    this.logger.info(
      `[CostTracker] Loaded ${pricing.length} model catalog pricing from database`,
    );
  }

  /**
   * 计算请求成本
   */
  calculateCost(model: string, usage: TokenUsage): CostCalculation {
    const pricing = this.modelCatalog.get(model);

    if (!pricing) {
      this.logger.warn(`[CostTracker] No pricing found for model: ${model}`);
      return {
        inputCost: 0,
        outputCost: 0,
        thinkingCost: 0,
        cacheCost: 0,
        totalCost: 0,
        currency: 'USD',
      };
    }

    // 计算各项成本（价格单位是美元/百万 tokens）
    const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputPrice;
    const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputPrice;

    let thinkingCost = 0;
    if (usage.thinkingTokens && pricing.thinkingPrice) {
      thinkingCost = (usage.thinkingTokens / 1_000_000) * pricing.thinkingPrice;
    }

    let cacheCost = 0;
    if (usage.cacheReadTokens && pricing.cacheReadPrice) {
      cacheCost += (usage.cacheReadTokens / 1_000_000) * pricing.cacheReadPrice;
    }
    if (usage.cacheWriteTokens && pricing.cacheWritePrice) {
      cacheCost +=
        (usage.cacheWriteTokens / 1_000_000) * pricing.cacheWritePrice;
    }

    const totalCost = inputCost + outputCost + thinkingCost + cacheCost;

    this.logger.debug(
      `[CostTracker] Cost for ${model}: $${totalCost.toFixed(6)} (input: $${inputCost.toFixed(6)}, output: $${outputCost.toFixed(6)}, thinking: $${thinkingCost.toFixed(6)}, cache: $${cacheCost.toFixed(6)})`,
    );

    return {
      inputCost,
      outputCost,
      thinkingCost,
      cacheCost,
      totalCost,
      currency: 'USD',
    };
  }

  /**
   * 追踪 Bot 使用成本
   */
  trackBotUsage(botId: string, cost: number): void {
    const today = new Date().toISOString().split('T')[0];
    const thisMonth = today.substring(0, 7);

    let usage = this.botUsage.get(botId);

    if (!usage) {
      usage = {
        dailyCost: 0,
        monthlyCost: 0,
        lastResetDate: today,
        lastResetMonth: thisMonth,
      };
      this.botUsage.set(botId, usage);
    }

    // 检查是否需要重置日使用量
    if (usage.lastResetDate !== today) {
      usage.dailyCost = 0;
      usage.lastResetDate = today;
    }

    // 检查是否需要重置月使用量
    if (usage.lastResetMonth !== thisMonth) {
      usage.monthlyCost = 0;
      usage.lastResetMonth = thisMonth;
    }

    // 累加成本
    usage.dailyCost += cost;
    usage.monthlyCost += cost;

    this.logger.debug(
      `[CostTracker] Bot ${botId} usage: daily=$${usage.dailyCost.toFixed(4)}, monthly=$${usage.monthlyCost.toFixed(4)}`,
    );
  }

  /**
   * 检查预算状态
   */
  checkBudgetStatus(
    botId: string,
    dailyLimit?: number,
    monthlyLimit?: number,
    alertThreshold: number = 0.8,
  ): BudgetStatus {
    const usage = this.botUsage.get(botId) || {
      dailyCost: 0,
      monthlyCost: 0,
      lastResetDate: new Date().toISOString().split('T')[0],
      lastResetMonth: new Date().toISOString().substring(0, 7),
    };

    const status: BudgetStatus = {
      dailyUsed: usage.dailyCost,
      dailyLimit,
      dailyRemaining: dailyLimit ? dailyLimit - usage.dailyCost : undefined,
      monthlyUsed: usage.monthlyCost,
      monthlyLimit,
      monthlyRemaining: monthlyLimit
        ? monthlyLimit - usage.monthlyCost
        : undefined,
      alertTriggered: false,
      shouldDowngrade: false,
    };

    // 检查是否触发告警
    if (dailyLimit && usage.dailyCost >= dailyLimit * alertThreshold) {
      status.alertTriggered = true;
      this.logger.warn(
        `[CostTracker] Bot ${botId} daily budget alert: ${((usage.dailyCost / dailyLimit) * 100).toFixed(1)}% used`,
      );
    }

    if (monthlyLimit && usage.monthlyCost >= monthlyLimit * alertThreshold) {
      status.alertTriggered = true;
      this.logger.warn(
        `[CostTracker] Bot ${botId} monthly budget alert: ${((usage.monthlyCost / monthlyLimit) * 100).toFixed(1)}% used`,
      );
    }

    // 检查是否应该降级
    if (
      (dailyLimit && usage.dailyCost >= dailyLimit) ||
      (monthlyLimit && usage.monthlyCost >= monthlyLimit)
    ) {
      status.shouldDowngrade = true;
      this.logger.warn(
        `[CostTracker] Bot ${botId} budget exceeded, should downgrade`,
      );
    }

    return status;
  }

  /**
   * 根据成本策略选择最优模型
   */
  selectOptimalModel(
    strategyId: string,
    availableModels: string[],
    scenario?: 'reasoning' | 'coding' | 'creativity' | 'speed',
  ): string | null {
    const strategy = this.costStrategies.get(strategyId);
    if (!strategy) {
      this.logger.warn(`[CostTracker] Strategy not found: ${strategyId}`);
      return availableModels[0] || null;
    }

    let bestModel: string | null = null;
    let bestScore = -Infinity;

    for (const modelName of availableModels) {
      const pricing = this.modelCatalog.get(modelName);
      if (!pricing) continue;

      // 检查最低能力要求
      if (strategy.minCapabilityScore) {
        const avgScore =
          ((pricing.reasoningScore || 50) +
            (pricing.codingScore || 50) +
            (pricing.creativityScore || 50) +
            (pricing.speedScore || 50)) /
          4;
        if (avgScore < strategy.minCapabilityScore) continue;
      }

      // 计算综合得分
      const costScore = 1 / (pricing.inputPrice + pricing.outputPrice + 1);
      const performanceScore = (pricing.speedScore || 50) / 100;

      let capabilityScore = 0;
      if (scenario && strategy.scenarioWeights) {
        const weight = strategy.scenarioWeights[scenario] || 0.5;
        switch (scenario) {
          case 'reasoning':
            capabilityScore = ((pricing.reasoningScore || 50) / 100) * weight;
            break;
          case 'coding':
            capabilityScore = ((pricing.codingScore || 50) / 100) * weight;
            break;
          case 'creativity':
            capabilityScore = ((pricing.creativityScore || 50) / 100) * weight;
            break;
          case 'speed':
            capabilityScore = ((pricing.speedScore || 50) / 100) * weight;
            break;
        }
      } else {
        capabilityScore =
          ((pricing.reasoningScore || 50) +
            (pricing.codingScore || 50) +
            (pricing.creativityScore || 50)) /
          300;
      }

      const totalScore =
        costScore * strategy.costWeight +
        performanceScore * strategy.performanceWeight +
        capabilityScore * strategy.capabilityWeight;

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestModel = modelName;
      }
    }

    this.logger.debug(
      `[CostTracker] Selected model: ${bestModel} (strategy: ${strategyId}, score: ${bestScore.toFixed(4)})`,
    );

    return bestModel;
  }

  /**
   * 获取成本策略
   */
  getCostStrategy(strategyId: string): CostStrategy | undefined {
    return this.costStrategies.get(strategyId);
  }

  /**
   * 获取所有成本策略
   */
  getAllCostStrategies(): CostStrategy[] {
    return Array.from(this.costStrategies.values());
  }

  /**
   * 获取模型目录定价
   */
  getModelCatalogPricing(model: string): ModelCatalogPricing | undefined {
    return this.modelCatalog.get(model);
  }

  /**
   * 获取所有模型目录定价
   */
  getAllModelCatalogPricing(): ModelCatalogPricing[] {
    return Array.from(this.modelCatalog.values());
  }

  /**
   * 获取 Bot 使用量
   */
  getBotUsage(botId: string): {
    dailyCost: number;
    monthlyCost: number;
  } | null {
    const usage = this.botUsage.get(botId);
    if (!usage) return null;

    return {
      dailyCost: usage.dailyCost,
      monthlyCost: usage.monthlyCost,
    };
  }
}
