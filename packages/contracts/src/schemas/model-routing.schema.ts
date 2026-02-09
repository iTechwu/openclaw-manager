import { z } from 'zod';

// ============================================================================
// Model Routing Type Enum
// ============================================================================

export const ModelRoutingTypeSchema = z.enum([
  'FUNCTION_ROUTE',
  'LOAD_BALANCE',
  'FAILOVER',
]);

export type ModelRoutingType = z.infer<typeof ModelRoutingTypeSchema>;

// ============================================================================
// Routing Target Schema
// ============================================================================

/**
 * 路由目标 - 指定 Provider 和模型
 */
export const RoutingTargetSchema = z.object({
  providerKeyId: z.string().uuid(),
  model: z.string().min(1),
});

export type RoutingTarget = z.infer<typeof RoutingTargetSchema>;

// ============================================================================
// Function Route Config Schema
// ============================================================================

/**
 * 功能路由规则
 */
export const FunctionRouteRuleSchema = z.object({
  /** 匹配模式：正则表达式或关键词 */
  pattern: z.string().min(1),
  /** 匹配类型 */
  matchType: z.enum(['regex', 'keyword', 'intent']),
  /** 目标 Provider 和模型 */
  target: RoutingTargetSchema,
});

export type FunctionRouteRule = z.infer<typeof FunctionRouteRuleSchema>;

/**
 * 功能路由配置
 * 根据消息内容匹配规则，选择不同的模型
 */
export const FunctionRouteConfigSchema = z.object({
  type: z.literal('FUNCTION_ROUTE'),
  /** 路由规则列表 */
  rules: z.array(FunctionRouteRuleSchema).min(1),
  /** 默认目标（无匹配时使用） */
  defaultTarget: RoutingTargetSchema,
});

export type FunctionRouteConfig = z.infer<typeof FunctionRouteConfigSchema>;

// ============================================================================
// Load Balance Config Schema
// ============================================================================

/**
 * 负载均衡目标（带权重）
 */
export const LoadBalanceTargetSchema = RoutingTargetSchema.extend({
  /** 权重（0-100） */
  weight: z.number().min(0).max(100).default(1),
});

export type LoadBalanceTarget = z.infer<typeof LoadBalanceTargetSchema>;

/**
 * 负载均衡策略
 */
export const LoadBalanceStrategySchema = z.enum([
  'round_robin', // 轮询
  'weighted', // 加权
  'least_latency', // 最低延迟
]);

export type LoadBalanceStrategy = z.infer<typeof LoadBalanceStrategySchema>;

/**
 * 负载均衡配置
 * 在多个模型之间分配流量
 */
export const LoadBalanceConfigSchema = z.object({
  type: z.literal('LOAD_BALANCE'),
  /** 负载均衡策略 */
  strategy: LoadBalanceStrategySchema,
  /** 目标列表 */
  targets: z.array(LoadBalanceTargetSchema).min(2),
});

export type LoadBalanceConfig = z.infer<typeof LoadBalanceConfigSchema>;

// ============================================================================
// Failover Config Schema
// ============================================================================

/**
 * 重试配置
 */
export const RetryConfigSchema = z.object({
  /** 最大重试次数 */
  maxAttempts: z.number().min(1).max(5).default(3),
  /** 重试延迟（毫秒） */
  delayMs: z.number().min(100).max(10000).default(1000),
});

export type RetryConfig = z.infer<typeof RetryConfigSchema>;

/**
 * 故障转移配置
 * 主模型失败时自动切换到备用模型
 */
export const FailoverConfigSchema = z.object({
  type: z.literal('FAILOVER'),
  /** 主要目标 */
  primary: RoutingTargetSchema,
  /** 备用目标链 */
  fallbackChain: z.array(RoutingTargetSchema).min(1),
  /** 重试配置 */
  retry: RetryConfigSchema,
});

export type FailoverConfig = z.infer<typeof FailoverConfigSchema>;

// ============================================================================
// Union Routing Config Schema
// ============================================================================

/**
 * 路由配置联合类型
 */
export const RoutingConfigSchema = z.discriminatedUnion('type', [
  FunctionRouteConfigSchema,
  LoadBalanceConfigSchema,
  FailoverConfigSchema,
]);

export type RoutingConfig = z.infer<typeof RoutingConfigSchema>;

// ============================================================================
// Bot Model Routing Schema
// ============================================================================

/**
 * Bot 模型路由配置
 */
export const BotModelRoutingSchema = z.object({
  id: z.string().uuid(),
  botId: z.string().uuid(),
  routingType: ModelRoutingTypeSchema,
  name: z.string().min(1).max(100),
  config: RoutingConfigSchema,
  priority: z.number().int().default(100),
  isEnabled: z.boolean().default(true),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type BotModelRouting = z.infer<typeof BotModelRoutingSchema>;

// ============================================================================
// Create/Update Routing Config Schemas
// ============================================================================

/**
 * 创建路由配置输入
 */
export const CreateRoutingConfigInputSchema = z.object({
  name: z.string().min(1).max(100),
  config: RoutingConfigSchema,
  priority: z.number().int().optional(),
});

export type CreateRoutingConfigInput = z.infer<
  typeof CreateRoutingConfigInputSchema
>;

/**
 * 更新路由配置输入
 */
export const UpdateRoutingConfigInputSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  config: RoutingConfigSchema.optional(),
  priority: z.number().int().optional(),
  isEnabled: z.boolean().optional(),
});

export type UpdateRoutingConfigInput = z.infer<
  typeof UpdateRoutingConfigInputSchema
>;

// ============================================================================
// Routing Test Schemas
// ============================================================================

/**
 * 路由测试输入
 */
export const RoutingTestInputSchema = z.object({
  message: z.string().min(1),
  routingHint: z.string().optional(),
});

export type RoutingTestInput = z.infer<typeof RoutingTestInputSchema>;

/**
 * 路由测试结果
 */
export const RoutingTestResultSchema = z.object({
  selectedModel: z.string(),
  selectedProvider: z.string(),
  providerKeyId: z.string().uuid(),
  reason: z.string(),
  matchedRule: z.string().optional(),
});

export type RoutingTestResult = z.infer<typeof RoutingTestResultSchema>;

// ============================================================================
// Routing Statistics Schema
// ============================================================================

/**
 * 路由统计信息
 */
export const RoutingStatisticsSchema = z.object({
  routingId: z.string().uuid(),
  totalRequests: z.number(),
  successCount: z.number(),
  failureCount: z.number(),
  avgLatencyMs: z.number(),
  targetStats: z.array(
    z.object({
      model: z.string(),
      vendor: z.string(),
      requestCount: z.number(),
      successRate: z.number(),
      avgLatencyMs: z.number(),
    }),
  ),
});

export type RoutingStatistics = z.infer<typeof RoutingStatisticsSchema>;

// ============================================================================
// Routing Suggestion Schemas
// ============================================================================

/**
 * Model capability analysis
 */
export const ModelCapabilitySchema = z.object({
  modelId: z.string(),
  providerKeyId: z.string().uuid(),
  vendor: z.string(),
  strengths: z.array(z.string()),
  bestFor: z.array(z.string()),
  score: z.record(z.string(), z.number()),
});

export type ModelCapability = z.infer<typeof ModelCapabilitySchema>;

/**
 * Suggested routing rule
 */
export const SuggestedRoutingRuleSchema = z.object({
  name: z.string(),
  description: z.string(),
  pattern: z.string(),
  matchType: z.enum(['keyword', 'regex', 'intent']),
  target: RoutingTargetSchema,
  confidence: z.number().min(0).max(100),
  reasoning: z.string(),
});

export type SuggestedRoutingRule = z.infer<typeof SuggestedRoutingRuleSchema>;

/**
 * Routing suggestion result
 */
export const RoutingSuggestionResultSchema = z.object({
  functionRouteRules: z.array(SuggestedRoutingRuleSchema),
  defaultTarget: RoutingTargetSchema,
  failoverSuggestion: z
    .object({
      primary: RoutingTargetSchema,
      fallbackChain: z.array(RoutingTargetSchema),
    })
    .optional(),
  analysis: z.object({
    modelCapabilities: z.array(ModelCapabilitySchema),
    summary: z.string(),
  }),
});

export type RoutingSuggestionResult = z.infer<typeof RoutingSuggestionResultSchema>;
