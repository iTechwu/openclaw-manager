import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { BotService, BotUsageLogService, ModelCatalogService } from '@app/db';
import type { Prisma } from '@prisma/client';
import type {
  UsageStatsQuery,
  UsageStatsResponse,
  UsageTrendQuery,
  UsageTrendResponse,
  UsageBreakdownQuery,
  UsageBreakdownResponse,
  UsageLogListQuery,
  TrendDataPoint,
  BreakdownGroup,
} from '@repo/contracts';

/**
 * AI 模型定价（每 1M tokens，美元）
 * 作为数据库不可用时的后备方案
 */
const FALLBACK_MODEL_PRICING: Record<
  string,
  { input: number; output: number }
> = {
  // OpenAI
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'gpt-4': { input: 30, output: 60 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  // Anthropic
  'claude-3-5-sonnet': { input: 3, output: 15 },
  'claude-3-opus': { input: 15, output: 75 },
  'claude-3-sonnet': { input: 3, output: 15 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },
  // DeepSeek
  'deepseek-chat': { input: 0.14, output: 0.28 },
  'deepseek-coder': { input: 0.14, output: 0.28 },
  // Default
  default: { input: 1, output: 2 },
};

@Injectable()
export class BotUsageAnalyticsService implements OnModuleInit {
  // 内存缓存的模型定价
  private pricingCache: Map<string, { input: number; output: number }> =
    new Map();
  private defaultPricing = { input: 1, output: 2 };

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly botService: BotService,
    private readonly botUsageLogService: BotUsageLogService,
    private readonly modelCatalogService: ModelCatalogService,
  ) {}

  async onModuleInit() {
    // 启动时加载定价数据到缓存
    await this.refreshPricingCache();
  }

  /**
   * 定时刷新定价缓存
   * 每 5 分钟执行一次，避免请求时刷新带来的延迟
   */
  @Cron('*/5 * * * *')
  async scheduledRefreshPricingCache(): Promise<void> {
    await this.refreshPricingCache();
  }

  /**
   * 刷新定价缓存
   */
  async refreshPricingCache(): Promise<void> {
    try {
      const pricings = await this.modelCatalogService.listAll();
      this.pricingCache.clear();

      for (const pricing of pricings) {
        this.pricingCache.set(pricing.model, {
          input: Number(pricing.inputPrice),
          output: Number(pricing.outputPrice),
        });
      }

      this.logger.info(
        `[BotUsageAnalytics] Model pricing cache refreshed with ${pricings.length} entries`,
      );
    } catch (error) {
      this.logger.warn('[BotUsageAnalytics] Failed to refresh pricing cache, using fallback', {
        error,
      });
      // 使用后备定价
      this.pricingCache.clear();
      for (const [model, pricing] of Object.entries(FALLBACK_MODEL_PRICING)) {
        if (model !== 'default') {
          this.pricingCache.set(model, pricing);
        }
      }
    }
  }

  /**
   * 获取 Bot 用量统计
   * 包含性能监控指标
   */
  async getStats(
    userId: string,
    hostname: string,
    query: UsageStatsQuery,
  ): Promise<UsageStatsResponse> {
    const startTime = Date.now();
    let requestCount = 0;
    try {
      const bot = await this.botService.get({
        hostname,
        createdById: userId,
      });

      if (!bot) {
        throw new Error('Bot not found');
      }

      const { startDate, endDate } = this.getDateRange(
        query.period,
        query.startDate,
        query.endDate,
      );

      const where: Prisma.BotUsageLogWhereInput = {
        botId: bot.id,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      };

      // 使用 BotUsageLogService 聚合查询
      const [aggregation, errorCount] = await Promise.all([
        this.botUsageLogService.aggregateStats(where),
        this.botUsageLogService.countErrors(where),
      ]);

      requestCount = aggregation.requestCount;
      const requestTokens = aggregation.totalRequestTokens;
      const responseTokens = aggregation.totalResponseTokens;
      const successCount = requestCount - errorCount;
      const errorRate = requestCount > 0 ? errorCount / requestCount : 0;
      const avgDurationMs = aggregation.avgDurationMs;

      // 计算预估成本
      const estimatedCost = await this.calculateCost(bot.id, startDate, endDate);

      return {
        totalTokens: requestTokens + responseTokens,
        requestTokens,
        responseTokens,
        requestCount,
        successCount,
        errorCount,
        errorRate: Math.round(errorRate * 10000) / 100, // 保留两位小数的百分比
        avgDurationMs: avgDurationMs ? Math.round(avgDurationMs) : null,
        estimatedCost: Math.round(estimatedCost * 100) / 100,
      };
    } finally {
      const duration = Date.now() - startTime;
      this.logger.info('[BotUsageAnalytics] getStats completed', {
        userId,
        hostname,
        duration,
        requestCount,
      });
    }
  }

  /**
   * 获取 Bot 用量趋势
   * 包含性能监控指标
   */
  async getTrend(
    userId: string,
    hostname: string,
    query: UsageTrendQuery,
  ): Promise<UsageTrendResponse> {
    const startTime = Date.now();
    try {
      const bot = await this.botService.get({
        hostname,
        createdById: userId,
      });

      if (!bot) {
        throw new Error('Bot not found');
      }

      const { startDate, endDate, granularity } = query;

      // 根据粒度生成时间桶
      const dataPoints = await this.aggregateByTimeBucket(
        bot.id,
        startDate,
        endDate,
        granularity,
      );

      return { dataPoints };
    } finally {
      const duration = Date.now() - startTime;
      this.logger.info('[BotUsageAnalytics] getTrend completed', {
        userId,
        hostname,
        duration,
        granularity: query.granularity,
      });
    }
  }

  /**
   * 获取 Bot 用量分组统计
   * 包含性能监控指标
   */
  async getBreakdown(
    userId: string,
    hostname: string,
    query: UsageBreakdownQuery,
  ): Promise<UsageBreakdownResponse> {
    const startTime = Date.now();
    try {
      const bot = await this.botService.get({
        hostname,
        createdById: userId,
      });

      if (!bot) {
        throw new Error('Bot not found');
      }

      const { startDate, endDate } = this.getDateRange(
        'month',
        query.startDate,
        query.endDate,
      );

      const where: Prisma.BotUsageLogWhereInput = {
        botId: bot.id,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      };

      const groups = await this.aggregateByGroup(where, query.groupBy);

      return { groups };
    } finally {
      const duration = Date.now() - startTime;
      this.logger.info('[BotUsageAnalytics] getBreakdown completed', {
        userId,
        hostname,
        duration,
        groupBy: query.groupBy,
      });
    }
  }

  /**
   * 获取 Bot 用量日志列表
   */
  async getLogs(userId: string, hostname: string, query: UsageLogListQuery) {
    const bot = await this.botService.get({
      hostname,
      createdById: userId,
    });

    if (!bot) {
      throw new Error('Bot not found');
    }

    const {
      limit = 20,
      page = 1,
      vendor,
      model,
      statusCode,
      startDate,
      endDate,
    } = query;

    const where: Prisma.BotUsageLogWhereInput = {
      botId: bot.id,
    };

    if (vendor) where.vendor = vendor;
    if (model) where.model = model;
    if (statusCode) where.statusCode = statusCode;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    return this.botUsageLogService.list(where, { limit, page });
  }

  /**
   * 计算日期范围
   */
  private getDateRange(
    period: 'day' | 'week' | 'month',
    startDate?: Date,
    endDate?: Date,
  ): { startDate: Date; endDate: Date } {
    const now = new Date();
    const end = endDate || now;

    if (startDate) {
      return { startDate, endDate: end };
    }

    let start: Date;
    switch (period) {
      case 'day':
        start = new Date(now);
        start.setHours(0, 0, 0, 0);
        break;
      case 'week':
        start = new Date(now);
        start.setDate(start.getDate() - 7);
        start.setHours(0, 0, 0, 0);
        break;
      case 'month':
        start = new Date(now);
        start.setMonth(start.getMonth() - 1);
        start.setHours(0, 0, 0, 0);
        break;
    }

    return { startDate: start, endDate: end };
  }

  /**
   * 按时间桶聚合数据
   */
  private async aggregateByTimeBucket(
    botId: string,
    startDate: Date,
    endDate: Date,
    granularity: 'hour' | 'day' | 'week',
  ): Promise<TrendDataPoint[]> {
    // 使用 BotUsageLogService 进行时间桶聚合
    const result = await this.botUsageLogService.aggregateByTimeBucket(
      botId,
      startDate,
      endDate,
      granularity,
    );

    return result.map((row) => ({
      timestamp: row.bucket,
      requestTokens: row.requestTokens,
      responseTokens: row.responseTokens,
      requestCount: row.requestCount,
      errorCount: row.errorCount,
      estimatedCost: this.estimateCostForTokens(
        row.requestTokens,
        row.responseTokens,
      ),
    }));
  }

  /**
   * 按分组聚合数据
   */
  private async aggregateByGroup(
    where: Prisma.BotUsageLogWhereInput,
    groupBy: 'vendor' | 'model' | 'status',
  ): Promise<BreakdownGroup[]> {
    const botId = where.botId as string;
    const startDate = (where.createdAt as { gte?: Date })?.gte;
    const endDate = (where.createdAt as { lte?: Date })?.lte;

    // 使用 BotUsageLogService 进行分组聚合
    const result = await this.botUsageLogService.aggregateByGroup(
      botId,
      startDate,
      endDate,
      groupBy,
    );

    const totalRequests = result.reduce(
      (sum, row) => sum + row.requestCount,
      0,
    );

    return result.map((row) => ({
      key: row.groupKey,
      requestTokens: row.requestTokens,
      responseTokens: row.responseTokens,
      requestCount: row.requestCount,
      percentage:
        totalRequests > 0
          ? Math.round((row.requestCount / totalRequests) * 10000) / 100
          : 0,
      estimatedCost: this.estimateCostForTokens(
        row.requestTokens,
        row.responseTokens,
      ),
    }));
  }

  /**
   * 计算成本
   * 使用定时刷新的缓存，无需在请求时检查缓存有效性
   */
  private async calculateCost(
    botId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    // 使用 BotUsageLogService 按模型聚合成本
    const result = await this.botUsageLogService.aggregateCostByModel(
      botId,
      startDate,
      endDate,
    );

    let totalCost = 0;
    for (const row of result) {
      const pricing = this.getModelCatalogPricing(row.model);
      const inputCost = (row.requestTokens / 1_000_000) * pricing.input;
      const outputCost = (row.responseTokens / 1_000_000) * pricing.output;
      totalCost += inputCost + outputCost;
    }

    return totalCost;
  }

  /**
   * 估算 Token 成本（使用默认定价）
   */
  private estimateCostForTokens(
    requestTokens: number,
    responseTokens: number,
  ): number {
    const pricing = this.defaultPricing;
    const inputCost = (requestTokens / 1_000_000) * pricing.input;
    const outputCost = (responseTokens / 1_000_000) * pricing.output;
    return Math.round((inputCost + outputCost) * 100) / 100;
  }

  /**
   * 获取模型定价（从缓存）
   */
  private getModelCatalogPricing(model: string | null): {
    input: number;
    output: number;
  } {
    if (!model) return this.defaultPricing;

    // 尝试精确匹配
    if (this.pricingCache.has(model)) {
      return this.pricingCache.get(model)!;
    }

    // 尝试前缀匹配
    for (const [key, pricing] of this.pricingCache.entries()) {
      if (model.startsWith(key)) {
        return pricing;
      }
    }

    // 后备：尝试从硬编码定价中匹配
    if (FALLBACK_MODEL_PRICING[model]) {
      return FALLBACK_MODEL_PRICING[model];
    }

    for (const [key, pricing] of Object.entries(FALLBACK_MODEL_PRICING)) {
      if (model.startsWith(key)) {
        return pricing;
      }
    }

    return this.defaultPricing;
  }
}
