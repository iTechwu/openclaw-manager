import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { PrismaService } from '@app/prisma';
import { TransactionalServiceBase } from '@app/shared-db';
import { HandlePrismaError, DbOperationType } from '@/utils/prisma-error.util';
import { AppConfig } from '@/config/validation';
import { Prisma } from '@prisma/client';
import type { BotUsageLog } from '@prisma/client';

@Injectable()
export class BotUsageLogService extends TransactionalServiceBase {
  private appConfig: AppConfig;

  constructor(
    prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {
    super(prisma);
    this.appConfig = config.getOrThrow<AppConfig>('app');
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async get(
    where: Prisma.BotUsageLogWhereInput,
    additional?: { select?: Prisma.BotUsageLogSelect },
  ): Promise<BotUsageLog | null> {
    return this.getReadClient().botUsageLog.findFirst({
      where: where,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getById(
    id: string,
    additional?: { select?: Prisma.BotUsageLogSelect },
  ): Promise<BotUsageLog | null> {
    return this.getReadClient().botUsageLog.findUnique({
      where: { id: id },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async list(
    where: Prisma.BotUsageLogWhereInput,
    pagination?: {
      orderBy?: Prisma.BotUsageLogOrderByWithRelationInput;
      limit?: number;
      page?: number;
    },
    additional?: { select?: Prisma.BotUsageLogSelect },
  ): Promise<{ list: BotUsageLog[]; total: number; page: number; limit: number }> {
    const {
      orderBy = { createdAt: 'desc' },
      limit = this.appConfig.MaxPageSize,
      page = 1,
    } = pagination || {};
    const skip = (page - 1) * limit;

    const [list, total] = await Promise.all([
      this.getReadClient().botUsageLog.findMany({
        where: where,
        orderBy,
        take: limit,
        skip,
        ...additional,
      }),
      this.getReadClient().botUsageLog.count({
        where: where,
      }),
    ]);

    return { list, total, page, limit };
  }

  @HandlePrismaError(DbOperationType.CREATE)
  async create(
    data: Prisma.BotUsageLogCreateInput,
    additional?: { select?: Prisma.BotUsageLogSelect },
  ): Promise<BotUsageLog> {
    return this.getWriteClient().botUsageLog.create({ data, ...additional });
  }

  @HandlePrismaError(DbOperationType.UPDATE)
  async update(
    where: Prisma.BotUsageLogWhereUniqueInput,
    data: Prisma.BotUsageLogUpdateInput,
    additional?: { select?: Prisma.BotUsageLogSelect },
  ): Promise<BotUsageLog> {
    return this.getWriteClient().botUsageLog.update({
      where,
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async delete(where: Prisma.BotUsageLogWhereUniqueInput): Promise<BotUsageLog> {
    return this.getWriteClient().botUsageLog.delete({ where });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async listByBotId(
    botId: string,
    options?: { startDate?: Date; endDate?: Date },
  ): Promise<BotUsageLog[]> {
    const where: Prisma.BotUsageLogWhereInput = { botId };
    if (options?.startDate) {
      where.createdAt = { gte: options.startDate };
    }
    if (options?.endDate) {
      where.createdAt = {
        ...((where.createdAt as object) || {}),
        lte: options.endDate,
      };
    }
    return this.getReadClient().botUsageLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * 获取路由统计信息
   * 根据 botId 和可选的模型过滤条件统计请求数据
   */
  @HandlePrismaError(DbOperationType.QUERY)
  async getRoutingStats(
    botId: string,
    options?: {
      models?: string[];
      startDate?: Date;
      endDate?: Date;
    },
  ): Promise<{
    totalRequests: number;
    successCount: number;
    failureCount: number;
    avgLatencyMs: number;
    targetStats: Array<{
      model: string;
      vendor: string;
      requestCount: number;
      successCount: number;
      failureCount: number;
      avgLatencyMs: number;
      totalCost: number;
    }>;
  }> {
    const where: Prisma.BotUsageLogWhereInput = { botId };

    if (options?.models && options.models.length > 0) {
      where.model = { in: options.models };
    }
    if (options?.startDate) {
      where.createdAt = { gte: options.startDate };
    }
    if (options?.endDate) {
      where.createdAt = {
        ...((where.createdAt as object) || {}),
        lte: options.endDate,
      };
    }

    // 获取所有匹配的日志
    const logs = await this.getReadClient().botUsageLog.findMany({
      where,
      select: {
        model: true,
        vendor: true,
        statusCode: true,
        durationMs: true,
        totalCost: true,
      },
    });

    // 计算总体统计
    const totalRequests = logs.length;
    const successCount = logs.filter(
      (l) => l.statusCode && l.statusCode >= 200 && l.statusCode < 300,
    ).length;
    const failureCount = totalRequests - successCount;
    const avgLatencyMs =
      totalRequests > 0
        ? logs.reduce((sum, l) => sum + (l.durationMs || 0), 0) / totalRequests
        : 0;

    // 按模型分组统计
    const modelStats = new Map<
      string,
      {
        model: string;
        vendor: string;
        requestCount: number;
        successCount: number;
        failureCount: number;
        totalLatency: number;
        totalCost: number;
      }
    >();

    for (const log of logs) {
      const key = `${log.vendor}:${log.model || 'unknown'}`;
      const existing = modelStats.get(key) || {
        model: log.model || 'unknown',
        vendor: log.vendor,
        requestCount: 0,
        successCount: 0,
        failureCount: 0,
        totalLatency: 0,
        totalCost: 0,
      };

      existing.requestCount++;
      if (log.statusCode && log.statusCode >= 200 && log.statusCode < 300) {
        existing.successCount++;
      } else {
        existing.failureCount++;
      }
      existing.totalLatency += log.durationMs || 0;
      existing.totalCost += log.totalCost ? Number(log.totalCost) : 0;

      modelStats.set(key, existing);
    }

    const targetStats = Array.from(modelStats.values()).map((stat) => ({
      model: stat.model,
      vendor: stat.vendor,
      requestCount: stat.requestCount,
      successCount: stat.successCount,
      failureCount: stat.failureCount,
      avgLatencyMs:
        stat.requestCount > 0 ? stat.totalLatency / stat.requestCount : 0,
      totalCost: stat.totalCost,
    }));

    return {
      totalRequests,
      successCount,
      failureCount,
      avgLatencyMs,
      targetStats,
    };
  }

  /**
   * 用量统计聚合查询
   * 返回指定时间范围内的总用量统计
   */
  @HandlePrismaError(DbOperationType.QUERY)
  async aggregateStats(
    where: Prisma.BotUsageLogWhereInput,
  ): Promise<{
    totalRequestTokens: number;
    totalResponseTokens: number;
    totalDurationMs: number;
    requestCount: number;
    avgDurationMs: number | null;
  }> {
    const result = await this.getReadClient().botUsageLog.aggregate({
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
    });

    return {
      totalRequestTokens: result._sum.requestTokens || 0,
      totalResponseTokens: result._sum.responseTokens || 0,
      totalDurationMs: result._sum.durationMs || 0,
      requestCount: result._count.id,
      avgDurationMs: result._avg.durationMs,
    };
  }

  /**
   * 错误计数查询
   * 返回指定条件下的错误请求数量
   */
  @HandlePrismaError(DbOperationType.QUERY)
  async countErrors(
    where: Prisma.BotUsageLogWhereInput,
  ): Promise<number> {
    return this.getReadClient().botUsageLog.count({
      where: {
        ...where,
        OR: [{ statusCode: { gte: 400 } }, { errorMessage: { not: null } }],
      },
    });
  }

  /**
   * 按时间桶聚合查询（原生 SQL）
   * 用于生成趋势数据
   *
   * 优化说明：
   * - 使用 timezone-aware date_trunc 确保结果一致性
   * - 利用 b_usage_log_bot_id_created_at_idx 索引优化查询性能
   */
  @HandlePrismaError(DbOperationType.QUERY)
  async aggregateByTimeBucket(
    botId: string,
    startDate: Date,
    endDate: Date,
    granularity: 'hour' | 'day' | 'week',
  ): Promise<Array<{
    bucket: Date;
    requestTokens: number;
    responseTokens: number;
    requestCount: number;
    errorCount: number;
  }>> {
    const truncFormat =
      granularity === 'hour' ? 'hour' : granularity === 'day' ? 'day' : 'week';

    // 使用 timezone-aware date_trunc 确保 UTC 时区的一致性
    // created_at 是 timestamptz 类型，AT TIME ZONE 'UTC' 转换为 UTC 时区后再截断
    const result = await this.getReadClient().$queryRaw<
      Array<{
        bucket: Date;
        request_tokens: bigint | null;
        response_tokens: bigint | null;
        request_count: bigint;
        error_count: bigint;
      }>
    >`
      SELECT
        date_trunc(${truncFormat}, created_at AT TIME ZONE 'UTC') as bucket,
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
      bucket: row.bucket,
      requestTokens: Number(row.request_tokens || 0),
      responseTokens: Number(row.response_tokens || 0),
      requestCount: Number(row.request_count),
      errorCount: Number(row.error_count),
    }));
  }

  /**
   * 按分组聚合查询
   * 用于生成分组统计数据
   *
   * 优化说明：
   * - vendor、model、protocol 使用 Prisma groupBy（安全、类型安全）
   * - status 使用 $queryRaw（因为需要 CASE 表达式，但参数化处理）
   */
  @HandlePrismaError(DbOperationType.QUERY)
  async aggregateByGroup(
    botId: string,
    startDate: Date | undefined,
    endDate: Date | undefined,
    groupBy: 'vendor' | 'model' | 'status' | 'protocol',
  ): Promise<Array<{
    groupKey: string;
    requestTokens: number;
    responseTokens: number;
    requestCount: number;
  }>> {
    // 构建 where 条件
    const where: Prisma.BotUsageLogWhereInput = { botId };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    // 对于 vendor、model、protocol，使用 Prisma groupBy（类型安全）
    if (groupBy === 'vendor' || groupBy === 'model') {
      const result = await this.getReadClient().botUsageLog.groupBy({
        by: [groupBy],
        where,
        _sum: {
          requestTokens: true,
          responseTokens: true,
        },
        _count: {
          id: true,
        },
        orderBy: {
          _count: {
            id: 'desc',
          },
        },
      });

      return result.map((row) => ({
        groupKey: row[groupBy] || 'unknown',
        requestTokens: row._sum.requestTokens || 0,
        responseTokens: row._sum.responseTokens || 0,
        requestCount: row._count.id,
      }));
    }

    // 对于 protocol，使用 protocolType 字段
    if (groupBy === 'protocol') {
      const result = await this.getReadClient().botUsageLog.groupBy({
        by: ['protocolType'],
        where,
        _sum: {
          requestTokens: true,
          responseTokens: true,
        },
        _count: {
          id: true,
        },
        orderBy: {
          _count: {
            id: 'desc',
          },
        },
      });

      return result.map((row) => ({
        groupKey: row.protocolType || 'unknown',
        requestTokens: row._sum.requestTokens || 0,
        responseTokens: row._sum.responseTokens || 0,
        requestCount: row._count.id,
      }));
    }

    // 对于 status，使用安全的参数化查询
    // groupBy 已限制为 'status'，CASE 表达式是静态的，无 SQL 注入风险
    const result = await this.getReadClient().$queryRaw<
      Array<{
        group_key: string;
        request_tokens: bigint | null;
        response_tokens: bigint | null;
        request_count: bigint;
      }>
    >`
      SELECT
        CASE
          WHEN status_code >= 400 OR error_message IS NOT NULL
          THEN 'error'
          ELSE 'success'
        END as group_key,
        SUM(request_tokens) as request_tokens,
        SUM(response_tokens) as response_tokens,
        COUNT(*) as request_count
      FROM b_usage_log
      WHERE bot_id = ${botId}::uuid
        ${startDate ? Prisma.sql`AND created_at >= ${startDate}` : Prisma.empty}
        ${endDate ? Prisma.sql`AND created_at <= ${endDate}` : Prisma.empty}
      GROUP BY group_key
      ORDER BY request_count DESC
    `;

    return result.map((row) => ({
      groupKey: row.group_key || 'unknown',
      requestTokens: Number(row.request_tokens || 0),
      responseTokens: Number(row.response_tokens || 0),
      requestCount: Number(row.request_count),
    }));
  }

  /**
   * 按模型聚合成本查询（原生 SQL）
   * 用于计算总成本
   */
  @HandlePrismaError(DbOperationType.QUERY)
  async aggregateCostByModel(
    botId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Array<{
    model: string | null;
    requestTokens: number;
    responseTokens: number;
  }>> {
    const result = await this.getReadClient().$queryRaw<
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

    return result.map((row) => ({
      model: row.model,
      requestTokens: Number(row.request_tokens || 0),
      responseTokens: Number(row.response_tokens || 0),
    }));
  }
}
