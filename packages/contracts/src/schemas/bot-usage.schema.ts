import { z } from 'zod';

// ============================================================================
// Bot Usage Statistics Schemas
// ============================================================================

/**
 * 用量统计查询参数
 */
export const UsageStatsQuerySchema = z.object({
  period: z.enum(['day', 'week', 'month']).default('day'),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export type UsageStatsQuery = z.infer<typeof UsageStatsQuerySchema>;

/**
 * 用量统计响应
 */
export const UsageStatsResponseSchema = z.object({
  totalTokens: z.number(),
  requestTokens: z.number(),
  responseTokens: z.number(),
  requestCount: z.number(),
  successCount: z.number(),
  errorCount: z.number(),
  errorRate: z.number(),
  avgDurationMs: z.number().nullable(),
  estimatedCost: z.number(),
});

export type UsageStatsResponse = z.infer<typeof UsageStatsResponseSchema>;

/**
 * 用量趋势查询参数
 */
export const UsageTrendQuerySchema = z.object({
  granularity: z.enum(['hour', 'day', 'week']).default('day'),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

export type UsageTrendQuery = z.infer<typeof UsageTrendQuerySchema>;

/**
 * 趋势数据点
 */
export const TrendDataPointSchema = z.object({
  timestamp: z.coerce.date(),
  requestTokens: z.number(),
  responseTokens: z.number(),
  requestCount: z.number(),
  errorCount: z.number(),
  estimatedCost: z.number(),
});

export type TrendDataPoint = z.infer<typeof TrendDataPointSchema>;

/**
 * 用量趋势响应
 */
export const UsageTrendResponseSchema = z.object({
  dataPoints: z.array(TrendDataPointSchema),
});

export type UsageTrendResponse = z.infer<typeof UsageTrendResponseSchema>;

/**
 * 用量分组查询参数
 */
export const UsageBreakdownQuerySchema = z.object({
  groupBy: z.enum(['vendor', 'model', 'status', 'protocol']).default('vendor'),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export type UsageBreakdownQuery = z.infer<typeof UsageBreakdownQuerySchema>;

/**
 * 分组统计项
 */
export const BreakdownGroupSchema = z.object({
  key: z.string(),
  requestTokens: z.number(),
  responseTokens: z.number(),
  requestCount: z.number(),
  percentage: z.number(),
  estimatedCost: z.number(),
});

export type BreakdownGroup = z.infer<typeof BreakdownGroupSchema>;

/**
 * 用量分组响应
 */
export const UsageBreakdownResponseSchema = z.object({
  groups: z.array(BreakdownGroupSchema),
});

export type UsageBreakdownResponse = z.infer<typeof UsageBreakdownResponseSchema>;

/**
 * 用量日志列表查询参数
 */
export const UsageLogListQuerySchema = z.object({
  limit: z.coerce.number().positive().optional().default(20),
  page: z.coerce.number().positive().min(1).optional().default(1),
  vendor: z.string().optional(),
  model: z.string().optional(),
  statusCode: z.coerce.number().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export type UsageLogListQuery = z.infer<typeof UsageLogListQuerySchema>;

/**
 * 用量日志项
 */
export const UsageLogItemSchema = z.object({
  id: z.string().uuid(),
  vendor: z.string(),
  model: z.string().nullable(),
  endpoint: z.string().nullable(),
  statusCode: z.number().nullable(),
  requestTokens: z.number().nullable(),
  responseTokens: z.number().nullable(),
  durationMs: z.number().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.coerce.date(),
});

export type UsageLogItem = z.infer<typeof UsageLogItemSchema>;
