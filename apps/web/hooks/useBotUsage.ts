'use client';

/**
 * useBotUsage Hooks
 * 用于获取 Bot 用量统计数据
 * 使用 ts-rest 客户端进行类型安全的 API 调用
 */

import { botUsageApi } from '@/lib/api/contracts/client';

/**
 * 用量统计查询参数
 */
interface UsageStatsParams {
  hostname: string;
  period?: 'day' | 'week' | 'month';
  startDate?: string;
  endDate?: string;
}

/**
 * 用量趋势查询参数
 */
interface UsageTrendParams {
  hostname: string;
  granularity?: 'hour' | 'day' | 'week';
  startDate: string;
  endDate: string;
}

/**
 * 用量分组查询参数
 */
interface UsageBreakdownParams {
  hostname: string;
  groupBy?: 'vendor' | 'model' | 'status' | 'protocol';
  startDate?: string;
  endDate?: string;
}

/**
 * 用量日志查询参数
 */
interface UsageLogsParams {
  hostname: string;
  page?: number;
  limit?: number;
  vendor?: string;
  model?: string;
  statusCode?: number;
  startDate?: string;
  endDate?: string;
}

/**
 * 用量查询 keys
 */
export const usageKeys = {
  all: ['bot-usage'] as const,
  stats: (hostname: string, params?: Partial<UsageStatsParams>) =>
    [...usageKeys.all, 'stats', hostname, params] as const,
  trend: (hostname: string, params?: Partial<UsageTrendParams>) =>
    [...usageKeys.all, 'trend', hostname, params] as const,
  breakdown: (hostname: string, params?: Partial<UsageBreakdownParams>) =>
    [...usageKeys.all, 'breakdown', hostname, params] as const,
  logs: (hostname: string, params?: Partial<UsageLogsParams>) =>
    [...usageKeys.all, 'logs', hostname, params] as const,
};

/**
 * 获取 Bot 用量统计
 */
export function useBotUsageStats(params: UsageStatsParams) {
  const { hostname, period = 'week', startDate, endDate } = params;

  // ts-rest v4 API: useQuery(queryKey, args)
  return botUsageApi.getStats.useQuery(
    usageKeys.stats(hostname, { period, startDate, endDate }),
    {
      params: { hostname },
      query: {
        period,
        startDate,
        endDate,
      },
    },
  );
}

/**
 * 获取 Bot 用量趋势
 */
export function useBotUsageTrend(params: UsageTrendParams) {
  const { hostname, granularity = 'day', startDate, endDate } = params;

  // ts-rest v4 API: useQuery(queryKey, args)
  return botUsageApi.getTrend.useQuery(
    usageKeys.trend(hostname, { granularity, startDate, endDate }),
    {
      params: { hostname },
      query: {
        granularity,
        startDate,
        endDate,
      },
    },
  );
}

/**
 * 获取 Bot 用量分组统计
 */
export function useBotUsageBreakdown(params: UsageBreakdownParams) {
  const { hostname, groupBy = 'vendor', startDate, endDate } = params;

  // ts-rest v4 API: useQuery(queryKey, args)
  return botUsageApi.getBreakdown.useQuery(
    usageKeys.breakdown(hostname, { groupBy, startDate, endDate }),
    {
      params: { hostname },
      query: {
        groupBy,
        startDate,
        endDate,
      },
    },
  );
}

/**
 * 获取 Bot 用量日志列表
 */
export function useBotUsageLogs(params: UsageLogsParams) {
  const {
    hostname,
    page = 1,
    limit = 20,
    vendor,
    model,
    statusCode,
    startDate,
    endDate,
  } = params;

  // ts-rest v4 API: useQuery(queryKey, args)
  return botUsageApi.getLogs.useQuery(
    usageKeys.logs(hostname, {
      page,
      limit,
      vendor,
      model,
      statusCode,
      startDate,
      endDate,
    }),
    {
      params: { hostname },
      query: {
        page,
        limit,
        vendor,
        model,
        statusCode,
        startDate,
        endDate,
      },
    },
  );
}

export default {
  useBotUsageStats,
  useBotUsageTrend,
  useBotUsageBreakdown,
  useBotUsageLogs,
};
