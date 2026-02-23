import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { PrismaService } from '@app/prisma';
import { BotService, BotUsageLogService, ModelCatalogService } from '@app/db';
import type { Prisma, ModelCatalog } from '@prisma/client';
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
  private lastCacheRefresh: Date | null = null;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟缓存

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly prisma: PrismaService,
    private readonly botService: BotService,
    private readonly botUsageLogService: BotUsageLogService,
    private readonly modelCatalogService: ModelCatalogService,
  ) {}

  async onModuleInit() {
    // 启动时加载定价数据到缓存
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

      this.lastCacheRefresh = new Date();
      this.logger.info(
        `Model pricing cache refreshed with ${pricings.length} entries`,
      );
    } catch (error) {
      this.logger.warn('Failed to refresh pricing cache, using fallback', {
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
   * 检查缓存是否需要刷新
   */
  private async ensureCacheValid(): Promise<void> {
    if (
      !this.lastCacheRefresh ||
      Date.now() - this.lastCacheRefresh.getTime() > this.CACHE_TTL_MS
    ) {
      await this.refreshPricingCache();
    }
  }

  /**
   * 获取 Bot 用量统计
   */
  async getStats(
    userId: string,
    hostname: string,
    query: UsageStatsQuery,
  ): Promise<UsageStatsResponse> {
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

    // 使用 Prisma 聚合查询
    const [aggregation, errorCount] = await Promise.all([
      this.prisma.read.botUsageLog.aggregate({
        where,
        _sum: {
          requestTokens: true,
          responseTokens: true,
          durationMs: true,
        },
        _count: {
          id: true,
        },
        _avg: {
          durationMs: true,
        },
      }),
      this.prisma.read.botUsageLog.count({
        where: {
          ...where,
          OR: [{ statusCode: { gte: 400 } }, { errorMessage: { not: null } }],
        },
      }),
    ]);

    const requestTokens = aggregation._sum.requestTokens || 0;
    const responseTokens = aggregation._sum.responseTokens || 0;
    const requestCount = aggregation._count.id;
    const successCount = requestCount - errorCount;
    const errorRate = requestCount > 0 ? errorCount / requestCount : 0;
    const avgDurationMs = aggregation._avg.durationMs;

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
  }

  /**
   * 获取 Bot 用量趋势
   */
  async getTrend(
    userId: string,
    hostname: string,
    query: UsageTrendQuery,
  ): Promise<UsageTrendResponse> {
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
  }

  /**
   * 获取 Bot 用量分组统计
   */
  async getBreakdown(
    userId: string,
    hostname: string,
    query: UsageBreakdownQuery,
  ): Promise<UsageBreakdownResponse> {
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
    // 使用原生 SQL 进行时间桶聚合
    const truncFormat =
      granularity === 'hour' ? 'hour' : granularity === 'day' ? 'day' : 'week';

    const result = await this.prisma.read.$queryRaw<
      Array<{
        bucket: Date;
        request_tokens: bigint | null;
        response_tokens: bigint | null;
        request_count: bigint;
        error_count: bigint;
      }>
    >`
      SELECT
        date_trunc(${truncFormat}, created_at) as bucket,
        SUM(request_tokens) as request_tokens,
        SUM(response_tokens) as response_tokens,
        COUNT(*) as request_count,
        COUNT(*) FILTER (WHERE status_code >= 400 OR error_message IS NOT NULL) as error_count
      FROM b_usage_log
      WHERE bot_id = ${botId}::uuid
        AND created_at >= ${startDate}
        AND created_at <= ${endDate}
      GROUP BY bucket
      ORDER BY bucket ASC
    `;

    return result.map((row) => ({
      timestamp: row.bucket,
      requestTokens: Number(row.request_tokens || 0),
      responseTokens: Number(row.response_tokens || 0),
      requestCount: Number(row.request_count),
      errorCount: Number(row.error_count),
      estimatedCost: this.estimateCostForTokens(
        Number(row.request_tokens || 0),
        Number(row.response_tokens || 0),
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

    let groupColumn: string;
    switch (groupBy) {
      case 'vendor':
        groupColumn = 'vendor';
        break;
      case 'model':
        groupColumn = 'model';
        break;
      case 'status':
        groupColumn =
          "CASE WHEN status_code >= 400 OR error_message IS NOT NULL THEN 'error' ELSE 'success' END";
        break;
    }

    const result = await this.prisma.read.$queryRawUnsafe<
      Array<{
        group_key: string | null;
        request_tokens: bigint | null;
        response_tokens: bigint | null;
        request_count: bigint;
      }>
    >(
      `
      SELECT
        ${groupColumn} as group_key,
        SUM(request_tokens) as request_tokens,
        SUM(response_tokens) as response_tokens,
        COUNT(*) as request_count
      FROM b_usage_log
      WHERE bot_id = $1::uuid
        ${startDate ? `AND created_at >= $2` : ''}
        ${endDate ? `AND created_at <= $3` : ''}
      GROUP BY ${groupColumn}
      ORDER BY request_count DESC
    `,
      botId,
      startDate,
      endDate,
    );

    const totalRequests = result.reduce(
      (sum, row) => sum + Number(row.request_count),
      0,
    );

    return result.map((row) => ({
      key: row.group_key || 'unknown',
      requestTokens: Number(row.request_tokens || 0),
      responseTokens: Number(row.response_tokens || 0),
      requestCount: Number(row.request_count),
      percentage:
        totalRequests > 0
          ? Math.round((Number(row.request_count) / totalRequests) * 10000) /
            100
          : 0,
      estimatedCost: this.estimateCostForTokens(
        Number(row.request_tokens || 0),
        Number(row.response_tokens || 0),
      ),
    }));
  }

  /**
   * 计算成本
   */
  private async calculateCost(
    botId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    // 确保缓存有效
    await this.ensureCacheValid();

    // 按模型分组计算成本
    const result = await this.prisma.read.$queryRaw<
      Array<{
        model: string | null;
        request_tokens: bigint | null;
        response_tokens: bigint | null;
      }>
    >`
      SELECT
        model,
        SUM(request_tokens) as request_tokens,
        SUM(response_tokens) as response_tokens
      FROM b_usage_log
      WHERE bot_id = ${botId}::uuid
        AND created_at >= ${startDate}
        AND created_at <= ${endDate}
      GROUP BY model
    `;

    let totalCost = 0;
    for (const row of result) {
      const pricing = this.getModelCatalogPricing(row.model);
      const inputCost =
        (Number(row.request_tokens || 0) / 1_000_000) * pricing.input;
      const outputCost =
        (Number(row.response_tokens || 0) / 1_000_000) * pricing.output;
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
