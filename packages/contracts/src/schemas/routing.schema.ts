import { z } from 'zod';

// ============================================================================
// Model Catalog Schema - 模型目录（原 Model Pricing）
// ============================================================================

export const ModelCatalogSchema = z.object({
  id: z.string().uuid(),
  model: z.string(),
  vendor: z.string(),
  displayName: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  // 定价信息（美元/百万 tokens）
  inputPrice: z.number(),
  outputPrice: z.number(),
  cacheReadPrice: z.number().nullable().optional(),
  cacheWritePrice: z.number().nullable().optional(),
  thinkingPrice: z.number().nullable().optional(),
  // 能力评分（0-100）
  reasoningScore: z.number().default(50),
  codingScore: z.number().default(50),
  creativityScore: z.number().default(50),
  speedScore: z.number().default(50),
  contextLength: z.number().default(128000),
  // 特性支持
  supportsExtendedThinking: z.boolean().default(false),
  supportsCacheControl: z.boolean().default(false),
  supportsVision: z.boolean().default(false),
  supportsFunctionCalling: z.boolean().default(true),
  supportsStreaming: z.boolean().default(true),
  // 推荐场景
  recommendedScenarios: z.array(z.string()).nullable().optional(),
  // 状态
  isEnabled: z.boolean().default(true),
  isDeprecated: z.boolean().default(false),
  deprecationDate: z.string().nullable().optional(),
  priceUpdatedAt: z.string(),
  notes: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ModelCatalog = z.infer<typeof ModelCatalogSchema>;

// ============================================================================
// Capability Tag Schema - 能力标签
// ============================================================================

export const CapabilityTagCategorySchema = z.enum([
  'reasoning',
  'search',
  'code',
  'vision',
  'audio',
  'cost',
  'context',
]);

export type CapabilityTagCategory = z.infer<typeof CapabilityTagCategorySchema>;

export const CapabilityTagSchema = z.object({
  id: z.string().uuid(),
  tagId: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  category: z.string(),
  priority: z.number().default(50),
  // 路由要求
  requiredProtocol: z.string().nullable().optional(),
  requiredSkills: z.array(z.string()).nullable().optional(),
  requiredModels: z.array(z.string()).nullable().optional(),
  // 特性要求
  requiresExtendedThinking: z.boolean().default(false),
  requiresCacheControl: z.boolean().default(false),
  requiresVision: z.boolean().default(false),
  maxCostPerMToken: z.number().nullable().optional(),
  // 状态
  isActive: z.boolean().default(true),
  isBuiltin: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CapabilityTag = z.infer<typeof CapabilityTagSchema>;

// ============================================================================
// Fallback Chain Schema - Fallback 链
// ============================================================================

/**
 * 旧版 Fallback 模型配置（JSON 硬编码，兼容迁移期）
 */
export const FallbackModelSchema = z.object({
  vendor: z.string(),
  model: z.string(),
  protocol: z.enum(['openai-compatible', 'anthropic-native']),
  features: z
    .object({
      extendedThinking: z.boolean().optional(),
      cacheControl: z.boolean().optional(),
    })
    .optional(),
});

export type FallbackModel = z.infer<typeof FallbackModelSchema>;

/**
 * 新版 Fallback 链模型配置（引用 ModelCatalog）
 */
export const FallbackChainModelSchema = z.object({
  id: z.string().uuid(),
  modelCatalogId: z.string().uuid(),
  priority: z.number().int().min(0),
  protocolOverride: z.string().nullable().optional(),
  featuresOverride: z
    .object({
      extendedThinking: z.boolean().optional(),
      cacheControl: z.boolean().optional(),
    })
    .nullable()
    .optional(),
  // 展示用字段（从 ModelCatalog 获取）
  model: z.string(),
  vendor: z.string(),
  displayName: z.string().nullable().optional(),
  // 模型能力（从 ModelCatalog 获取）
  supportsExtendedThinking: z.boolean().optional(),
  supportsCacheControl: z.boolean().optional(),
  supportsVision: z.boolean().optional(),
  supportsFunctionCalling: z.boolean().optional(),
});

export type FallbackChainModelItem = z.infer<typeof FallbackChainModelSchema>;

export const FallbackChainSchema = z.object({
  id: z.string().uuid(),
  chainId: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  /** @deprecated 旧版 JSON 模型列表，迁移后使用 chainModels */
  models: z.array(FallbackModelSchema).optional(),
  /** 新版：通过关联表引用的模型列表 */
  chainModels: z.array(FallbackChainModelSchema).optional(),
  // 触发条件
  triggerStatusCodes: z.array(z.number()),
  triggerErrorTypes: z.array(z.string()),
  triggerTimeoutMs: z.number().default(60000),
  // 行为配置
  maxRetries: z.number().default(3),
  retryDelayMs: z.number().default(2000),
  preserveProtocol: z.boolean().default(false),
  // 状态
  isActive: z.boolean().default(true),
  isBuiltin: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type FallbackChain = z.infer<typeof FallbackChainSchema>;

// ============================================================================
// Cost Strategy Schema - 成本策略
// ============================================================================

export const CostStrategySchema = z.object({
  id: z.string().uuid(),
  strategyId: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  // 优化权重（0-1）
  costWeight: z.number().default(0.5),
  performanceWeight: z.number().default(0.3),
  capabilityWeight: z.number().default(0.2),
  // 约束条件
  maxCostPerRequest: z.number().nullable().optional(),
  maxLatencyMs: z.number().nullable().optional(),
  minCapabilityScore: z.number().nullable().optional(),
  // 场景权重
  scenarioWeights: z
    .object({
      reasoning: z.number().optional(),
      coding: z.number().optional(),
      creativity: z.number().optional(),
      speed: z.number().optional(),
    })
    .nullable()
    .optional(),
  // 状态
  isActive: z.boolean().default(true),
  isBuiltin: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CostStrategy = z.infer<typeof CostStrategySchema>;

// ============================================================================
// Bot Routing Config Schema - Bot 路由配置
// ============================================================================

export const BotRoutingConfigSchema = z.object({
  id: z.string().uuid(),
  botId: z.string().uuid(),
  // 路由配置
  routingEnabled: z.boolean().default(true),
  routingMode: z
    .enum(['auto', 'manual', 'cost-optimized', 'complexity-based'])
    .default('auto'),
  // Fallback 配置
  fallbackEnabled: z.boolean().default(true),
  fallbackChainId: z.string().nullable().optional(),
  // 成本控制配置
  costControlEnabled: z.boolean().default(false),
  costStrategyId: z.string().nullable().optional(),
  dailyBudget: z.number().nullable().optional(),
  monthlyBudget: z.number().nullable().optional(),
  alertThreshold: z.number().default(0.8),
  autoDowngrade: z.boolean().default(false),
  downgradeModel: z.string().nullable().optional(),
  // 复杂度路由配置
  complexityRoutingEnabled: z.boolean().default(false),
  complexityRoutingConfigId: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type BotRoutingConfig = z.infer<typeof BotRoutingConfigSchema>;

// ============================================================================
// Config Load Status Schema - 配置加载状态
// ============================================================================

export const ConfigLoadStatusSchema = z.object({
  modelCatalog: z.object({
    loaded: z.boolean(),
    count: z.number(),
    lastUpdate: z.string().optional(),
  }),
  capabilityTags: z.object({
    loaded: z.boolean(),
    count: z.number(),
    lastUpdate: z.string().optional(),
  }),
  fallbackChains: z.object({
    loaded: z.boolean(),
    count: z.number(),
    lastUpdate: z.string().optional(),
  }),
  costStrategies: z.object({
    loaded: z.boolean(),
    count: z.number(),
    lastUpdate: z.string().optional(),
  }),
  complexityRoutingConfigs: z.object({
    loaded: z.boolean(),
    count: z.number(),
    lastUpdate: z.string().optional(),
  }),
});

export type ConfigLoadStatus = z.infer<typeof ConfigLoadStatusSchema>;

// ============================================================================
// Cost Calculation Schema - 成本计算
// ============================================================================

export const CostCalculationSchema = z.object({
  inputCost: z.number(),
  outputCost: z.number(),
  thinkingCost: z.number(),
  cacheCost: z.number(),
  totalCost: z.number(),
  currency: z.literal('USD'),
});

export type CostCalculation = z.infer<typeof CostCalculationSchema>;

// ============================================================================
// Budget Status Schema - 预算状态
// ============================================================================

export const BudgetStatusSchema = z.object({
  dailyUsed: z.number(),
  dailyLimit: z.number().optional(),
  dailyRemaining: z.number().optional(),
  monthlyUsed: z.number(),
  monthlyLimit: z.number().optional(),
  monthlyRemaining: z.number().optional(),
  alertTriggered: z.boolean(),
  shouldDowngrade: z.boolean(),
});

export type BudgetStatus = z.infer<typeof BudgetStatusSchema>;

// ============================================================================
// Complexity Routing Schema - 复杂度路由配置
// ============================================================================

/**
 * 复杂度等级
 */
export const ComplexityLevelSchema = z.enum([
  'super_easy',
  'easy',
  'medium',
  'hard',
  'super_hard',
]);

export type ComplexityLevel = z.infer<typeof ComplexityLevelSchema>;

/**
 * 复杂度模型配置
 */
export const ComplexityModelConfigSchema = z.object({
  vendor: z.string(),
  model: z.string(),
  apiType: z.string().nullable().optional(),
  baseUrl: z.string().nullable().optional(),
});

export type ComplexityModelConfig = z.infer<typeof ComplexityModelConfigSchema>;

/**
 * 分类器配置
 */
export const ClassifierConfigSchema = z.object({
  model: z.string().default('deepseek-v3-250324'),
  vendor: z.string().default('deepseek'),
  baseUrl: z.string().nullable().optional(),
});

export type ClassifierConfig = z.infer<typeof ClassifierConfigSchema>;

/**
 * 复杂度路由配置
 */
export const ComplexityRoutingConfigSchema = z.object({
  id: z.string().uuid(),
  configId: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  // 是否启用
  isEnabled: z.boolean().default(true),
  // 各复杂度对应的模型配置
  models: z.object({
    super_easy: ComplexityModelConfigSchema,
    easy: ComplexityModelConfigSchema,
    medium: ComplexityModelConfigSchema,
    hard: ComplexityModelConfigSchema,
    super_hard: ComplexityModelConfigSchema,
  }),
  // 分类器配置（用于判断消息复杂度的模型）
  classifierModel: z.string().default('deepseek-v3-250324'),
  classifierVendor: z.string().default('deepseek'),
  classifierBaseUrl: z.string().nullable().optional(),
  // 分类器配置（嵌套对象形式，可选）
  classifier: ClassifierConfigSchema.optional(),
  // 工具调用时的最低复杂度
  toolMinComplexity: ComplexityLevelSchema.optional(),
  // 是否为内置配置
  isBuiltin: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ComplexityRoutingConfig = z.infer<
  typeof ComplexityRoutingConfigSchema
>;

/**
 * 创建复杂度路由配置请求
 */
export const CreateComplexityRoutingConfigSchema =
  ComplexityRoutingConfigSchema.omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  });

export type CreateComplexityRoutingConfig = z.infer<
  typeof CreateComplexityRoutingConfigSchema
>;

/**
 * 更新复杂度路由配置请求
 */
export const UpdateComplexityRoutingConfigSchema =
  CreateComplexityRoutingConfigSchema.partial();

export type UpdateComplexityRoutingConfig = z.infer<
  typeof UpdateComplexityRoutingConfigSchema
>;

/**
 * 复杂度分类结果
 */
export const ComplexityClassificationResultSchema = z.object({
  level: ComplexityLevelSchema,
  latencyMs: z.number(),
  inheritedFromContext: z.boolean().optional(),
  rawResponse: z.string().optional(),
});

export type ComplexityClassificationResult = z.infer<
  typeof ComplexityClassificationResultSchema
>;

/**
 * 复杂度路由决策结果
 */
export const ComplexityRouteDecisionSchema = z.object({
  complexity: ComplexityClassificationResultSchema,
  selectedModel: ComplexityModelConfigSchema,
  protocol: z.enum(['openai-compatible', 'anthropic-native']),
});

export type ComplexityRouteDecision = z.infer<
  typeof ComplexityRouteDecisionSchema
>;

// ============================================================================
// Complexity Routing Model Mapping Schema - 复杂度路由模型映射（新架构）
// ============================================================================

export const ComplexityRoutingModelMappingSchema = z.object({
  id: z.string().uuid(),
  complexityConfigId: z.string().uuid(),
  complexityLevel: ComplexityLevelSchema,
  modelCatalogId: z.string().uuid(),
  priority: z.number().int().min(0).default(0),
  // 展示用字段（从 ModelCatalog 获取）
  model: z.string(),
  vendor: z.string(),
  displayName: z.string().nullable().optional(),
});

export type ComplexityRoutingModelMapping = z.infer<
  typeof ComplexityRoutingModelMappingSchema
>;

// ============================================================================
// Routing Available Model Schema - 可用于路由配置的模型
// ============================================================================

/**
 * 用于路由配置页面的可用模型信息
 * 只返回 isAvailable=true 的模型，包含定价和能力标签
 */
export const RoutingAvailableModelSchema = z.object({
  /** ModelAvailability ID */
  id: z.string().uuid(),
  /** 模型标识符 */
  model: z.string(),
  /** 服务商 */
  vendor: z.string(),
  /** 显示名称 */
  displayName: z.string().nullable().optional(),
  /** API 协议类型 */
  apiType: z.string().nullable().optional(),
  /** 模型类型 */
  modelType: z.string(),
  /** 是否可用 */
  isAvailable: z.boolean(),
  /** 最后验证时间 */
  lastVerifiedAt: z.string().nullable().optional(),
  // 定价信息（来自 ModelCatalog）
  inputPrice: z.number().nullable().optional(),
  outputPrice: z.number().nullable().optional(),
  // 能力评分（来自 ModelCatalog）
  reasoningScore: z.number().nullable().optional(),
  codingScore: z.number().nullable().optional(),
  creativityScore: z.number().nullable().optional(),
  speedScore: z.number().nullable().optional(),
  // 特性支持
  supportsExtendedThinking: z.boolean().optional(),
  supportsCacheControl: z.boolean().optional(),
  supportsVision: z.boolean().optional(),
  supportsFunctionCalling: z.boolean().optional(),
  // 能力标签
  capabilityTags: z.array(z.string()).optional(),
});

export type RoutingAvailableModel = z.infer<typeof RoutingAvailableModelSchema>;
