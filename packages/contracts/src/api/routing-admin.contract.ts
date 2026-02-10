import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { ApiResponseSchema, SuccessResponseSchema } from '../base';
import {
  ModelPricingSchema,
  CapabilityTagSchema,
  FallbackChainSchema,
  CostStrategySchema,
  ConfigLoadStatusSchema,
  CostCalculationSchema,
  BudgetStatusSchema,
  ComplexityRoutingConfigSchema,
  ComplexityLevelSchema,
  ComplexityModelConfigSchema,
  ComplexityClassificationResultSchema,
} from '../schemas/routing.schema';

const c = initContract();

// ============================================================================
// Request Schemas
// ============================================================================

export const CalculateCostInputSchema = z.object({
  model: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  thinkingTokens: z.number().optional(),
  cacheReadTokens: z.number().optional(),
  cacheWriteTokens: z.number().optional(),
});

export type CalculateCostInput = z.infer<typeof CalculateCostInputSchema>;

export const SelectModelInputSchema = z.object({
  strategyId: z.string(),
  availableModels: z.array(z.string()),
  scenario: z.enum(['reasoning', 'coding', 'creativity', 'speed']).optional(),
});

export type SelectModelInput = z.infer<typeof SelectModelInputSchema>;

export const BotBudgetQuerySchema = z.object({
  dailyLimit: z.coerce.number().optional(),
  monthlyLimit: z.coerce.number().optional(),
  alertThreshold: z.coerce.number().optional(),
});

export type BotBudgetQuery = z.infer<typeof BotBudgetQuerySchema>;

// ============================================================================
// Create/Update Input Schemas
// ============================================================================

export const CreateModelPricingInputSchema = z.object({
  model: z.string(),
  vendor: z.string(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  inputPrice: z.number(),
  outputPrice: z.number(),
  cacheReadPrice: z.number().optional(),
  cacheWritePrice: z.number().optional(),
  thinkingPrice: z.number().optional(),
  reasoningScore: z.number().default(50),
  codingScore: z.number().default(50),
  creativityScore: z.number().default(50),
  speedScore: z.number().default(50),
  contextLength: z.number().default(128),
  supportsExtendedThinking: z.boolean().default(false),
  supportsCacheControl: z.boolean().default(false),
  supportsVision: z.boolean().default(false),
  supportsFunctionCalling: z.boolean().default(true),
  supportsStreaming: z.boolean().default(true),
  recommendedScenarios: z.array(z.string()).optional(),
  isEnabled: z.boolean().default(true),
  notes: z.string().optional(),
});

export type CreateModelPricingInput = z.infer<
  typeof CreateModelPricingInputSchema
>;

export const UpdateModelPricingInputSchema =
  CreateModelPricingInputSchema.partial();

export type UpdateModelPricingInput = z.infer<
  typeof UpdateModelPricingInputSchema
>;

export const CreateCapabilityTagInputSchema = z.object({
  tagId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  category: z.string(),
  priority: z.number().default(50),
  requiredProtocol: z.string().optional(),
  requiredSkills: z.array(z.string()).optional(),
  requiredModels: z.array(z.string()).optional(),
  requiresExtendedThinking: z.boolean().default(false),
  requiresCacheControl: z.boolean().default(false),
  requiresVision: z.boolean().default(false),
  maxCostPerMToken: z.number().optional(),
  isActive: z.boolean().default(true),
});

export type CreateCapabilityTagInput = z.infer<
  typeof CreateCapabilityTagInputSchema
>;

export const UpdateCapabilityTagInputSchema =
  CreateCapabilityTagInputSchema.partial();

export type UpdateCapabilityTagInput = z.infer<
  typeof UpdateCapabilityTagInputSchema
>;

export const CreateFallbackChainInputSchema = z.object({
  chainId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  models: z.array(
    z.object({
      vendor: z.string(),
      model: z.string(),
      protocol: z.enum(['openai-compatible', 'anthropic-native']),
      features: z
        .object({
          extendedThinking: z.boolean().optional(),
          cacheControl: z.boolean().optional(),
        })
        .optional(),
    }),
  ),
  triggerStatusCodes: z.array(z.number()),
  triggerErrorTypes: z.array(z.string()),
  triggerTimeoutMs: z.number().default(60000),
  maxRetries: z.number().default(3),
  retryDelayMs: z.number().default(2000),
  preserveProtocol: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export type CreateFallbackChainInput = z.infer<
  typeof CreateFallbackChainInputSchema
>;

export const UpdateFallbackChainInputSchema =
  CreateFallbackChainInputSchema.partial();

export type UpdateFallbackChainInput = z.infer<
  typeof UpdateFallbackChainInputSchema
>;

export const CreateCostStrategyInputSchema = z.object({
  strategyId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  costWeight: z.number().default(0.5),
  performanceWeight: z.number().default(0.3),
  capabilityWeight: z.number().default(0.2),
  maxCostPerRequest: z.number().optional(),
  maxLatencyMs: z.number().optional(),
  minCapabilityScore: z.number().optional(),
  scenarioWeights: z
    .object({
      reasoning: z.number().optional(),
      coding: z.number().optional(),
      creativity: z.number().optional(),
      speed: z.number().optional(),
    })
    .optional(),
  isActive: z.boolean().default(true),
});

export type CreateCostStrategyInput = z.infer<
  typeof CreateCostStrategyInputSchema
>;

export const UpdateCostStrategyInputSchema =
  CreateCostStrategyInputSchema.partial();

export type UpdateCostStrategyInput = z.infer<
  typeof UpdateCostStrategyInputSchema
>;

// ============================================================================
// Complexity Routing Config Input Schemas
// ============================================================================

export const CreateComplexityRoutingConfigInputSchema = z.object({
  configId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  isEnabled: z.boolean().default(true),
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
  classifierBaseUrl: z.string().optional(),
  toolMinComplexity: ComplexityLevelSchema.optional(),
});

export type CreateComplexityRoutingConfigInput = z.infer<
  typeof CreateComplexityRoutingConfigInputSchema
>;

export const UpdateComplexityRoutingConfigInputSchema =
  CreateComplexityRoutingConfigInputSchema.partial();

export type UpdateComplexityRoutingConfigInput = z.infer<
  typeof UpdateComplexityRoutingConfigInputSchema
>;

export const ClassifyComplexityInputSchema = z.object({
  message: z.string(),
  context: z.string().optional(),
  hasTools: z.boolean().optional(),
});

export type ClassifyComplexityInput = z.infer<
  typeof ClassifyComplexityInputSchema
>;

// 导入/导出 Schema
export const ExportConfigResponseSchema = z.object({
  modelPricing: z.array(ModelPricingSchema),
  capabilityTags: z.array(CapabilityTagSchema),
  fallbackChains: z.array(FallbackChainSchema),
  costStrategies: z.array(CostStrategySchema),
  exportedAt: z.string(),
  version: z.string(),
});

export type ExportConfigResponse = z.infer<typeof ExportConfigResponseSchema>;

export const ImportConfigInputSchema = z.object({
  modelPricing: z.array(CreateModelPricingInputSchema).optional(),
  capabilityTags: z.array(CreateCapabilityTagInputSchema).optional(),
  fallbackChains: z.array(CreateFallbackChainInputSchema).optional(),
  costStrategies: z.array(CreateCostStrategyInputSchema).optional(),
  overwrite: z.boolean().default(false),
});

export type ImportConfigInput = z.infer<typeof ImportConfigInputSchema>;

// ============================================================================
// Response Schemas
// ============================================================================

export const ModelPricingListResponseSchema = z.object({
  list: z.array(ModelPricingSchema),
});

export const CapabilityTagListResponseSchema = z.object({
  list: z.array(CapabilityTagSchema),
});

export const FallbackChainListResponseSchema = z.object({
  list: z.array(FallbackChainSchema),
});

export const CostStrategyListResponseSchema = z.object({
  list: z.array(CostStrategySchema),
});

export const ComplexityRoutingConfigListResponseSchema = z.object({
  list: z.array(ComplexityRoutingConfigSchema),
});

export const BotUsageResponseSchema = z.object({
  dailyCost: z.number(),
  monthlyCost: z.number(),
});

export const SelectModelResponseSchema = z.object({
  selectedModel: z.string().nullable(),
  strategy: z.string(),
  scenario: z.string().optional(),
});

// ============================================================================
// Routing Admin Contract
// ============================================================================

/**
 * Routing Admin API Contract
 * 混合架构路由配置管理 API 契约定义
 */
export const routingAdminContract = c.router(
  {
    // ========================================================================
    // 配置状态
    // ========================================================================

    /**
     * GET /proxy/admin/routing/status - 获取配置加载状态
     */
    getConfigStatus: {
      method: 'GET',
      path: '/status',
      responses: {
        200: ApiResponseSchema(ConfigLoadStatusSchema),
      },
      summary: '获取配置加载状态',
    },

    /**
     * POST /proxy/admin/routing/refresh - 手动刷新配置
     */
    refreshConfig: {
      method: 'POST',
      path: '/refresh',
      body: z.object({}).optional(),
      responses: {
        200: ApiResponseSchema(
          z.object({
            message: z.string(),
            status: ConfigLoadStatusSchema,
          }),
        ),
      },
      summary: '手动刷新配置',
    },

    // ========================================================================
    // 能力标签管理
    // ========================================================================

    /**
     * GET /proxy/admin/routing/capability-tags - 获取所有能力标签
     */
    getCapabilityTags: {
      method: 'GET',
      path: '/capability-tags',
      responses: {
        200: ApiResponseSchema(CapabilityTagListResponseSchema),
      },
      summary: '获取所有能力标签',
    },

    /**
     * GET /proxy/admin/routing/capability-tags/:tagId - 获取指定能力标签
     */
    getCapabilityTag: {
      method: 'GET',
      path: '/capability-tags/:tagId',
      pathParams: z.object({ tagId: z.string() }),
      responses: {
        200: ApiResponseSchema(CapabilityTagSchema),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '获取指定能力标签',
    },

    /**
     * POST /proxy/admin/routing/capability-tags - 创建能力标签
     */
    createCapabilityTag: {
      method: 'POST',
      path: '/capability-tags',
      body: CreateCapabilityTagInputSchema,
      responses: {
        200: ApiResponseSchema(CapabilityTagSchema),
        400: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '创建能力标签',
    },

    /**
     * PUT /proxy/admin/routing/capability-tags/:id - 更新能力标签
     */
    updateCapabilityTag: {
      method: 'PUT',
      path: '/capability-tags/:id',
      pathParams: z.object({ id: z.string().uuid() }),
      body: UpdateCapabilityTagInputSchema,
      responses: {
        200: ApiResponseSchema(CapabilityTagSchema),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '更新能力标签',
    },

    /**
     * DELETE /proxy/admin/routing/capability-tags/:id - 删除能力标签
     */
    deleteCapabilityTag: {
      method: 'DELETE',
      path: '/capability-tags/:id',
      pathParams: z.object({ id: z.string().uuid() }),
      body: z.object({}).optional(),
      responses: {
        200: SuccessResponseSchema,
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '删除能力标签',
    },

    // ========================================================================
    // Fallback 链管理
    // ========================================================================

    /**
     * GET /proxy/admin/routing/fallback-chains - 获取所有 Fallback 链
     */
    getFallbackChains: {
      method: 'GET',
      path: '/fallback-chains',
      responses: {
        200: ApiResponseSchema(FallbackChainListResponseSchema),
      },
      summary: '获取所有 Fallback 链',
    },

    /**
     * GET /proxy/admin/routing/fallback-chains/:chainId - 获取指定 Fallback 链
     */
    getFallbackChain: {
      method: 'GET',
      path: '/fallback-chains/:chainId',
      pathParams: z.object({ chainId: z.string() }),
      responses: {
        200: ApiResponseSchema(FallbackChainSchema),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '获取指定 Fallback 链',
    },

    /**
     * POST /proxy/admin/routing/fallback-chains - 创建 Fallback 链
     */
    createFallbackChain: {
      method: 'POST',
      path: '/fallback-chains',
      body: CreateFallbackChainInputSchema,
      responses: {
        200: ApiResponseSchema(FallbackChainSchema),
        400: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '创建 Fallback 链',
    },

    /**
     * PUT /proxy/admin/routing/fallback-chains/:id - 更新 Fallback 链
     */
    updateFallbackChain: {
      method: 'PUT',
      path: '/fallback-chains/:id',
      pathParams: z.object({ id: z.string().uuid() }),
      body: UpdateFallbackChainInputSchema,
      responses: {
        200: ApiResponseSchema(FallbackChainSchema),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '更新 Fallback 链',
    },

    /**
     * DELETE /proxy/admin/routing/fallback-chains/:id - 删除 Fallback 链
     */
    deleteFallbackChain: {
      method: 'DELETE',
      path: '/fallback-chains/:id',
      pathParams: z.object({ id: z.string().uuid() }),
      body: z.object({}).optional(),
      responses: {
        200: SuccessResponseSchema,
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '删除 Fallback 链',
    },

    // ========================================================================
    // 成本策略管理
    // ========================================================================

    /**
     * GET /proxy/admin/routing/cost-strategies - 获取所有成本策略
     */
    getCostStrategies: {
      method: 'GET',
      path: '/cost-strategies',
      responses: {
        200: ApiResponseSchema(CostStrategyListResponseSchema),
      },
      summary: '获取所有成本策略',
    },

    /**
     * GET /proxy/admin/routing/cost-strategies/:strategyId - 获取指定成本策略
     */
    getCostStrategy: {
      method: 'GET',
      path: '/cost-strategies/:strategyId',
      pathParams: z.object({ strategyId: z.string() }),
      responses: {
        200: ApiResponseSchema(CostStrategySchema),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '获取指定成本策略',
    },

    /**
     * POST /proxy/admin/routing/cost-strategies - 创建成本策略
     */
    createCostStrategy: {
      method: 'POST',
      path: '/cost-strategies',
      body: CreateCostStrategyInputSchema,
      responses: {
        200: ApiResponseSchema(CostStrategySchema),
        400: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '创建成本策略',
    },

    /**
     * PUT /proxy/admin/routing/cost-strategies/:id - 更新成本策略
     */
    updateCostStrategy: {
      method: 'PUT',
      path: '/cost-strategies/:id',
      pathParams: z.object({ id: z.string().uuid() }),
      body: UpdateCostStrategyInputSchema,
      responses: {
        200: ApiResponseSchema(CostStrategySchema),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '更新成本策略',
    },

    /**
     * DELETE /proxy/admin/routing/cost-strategies/:id - 删除成本策略
     */
    deleteCostStrategy: {
      method: 'DELETE',
      path: '/cost-strategies/:id',
      pathParams: z.object({ id: z.string().uuid() }),
      body: z.object({}).optional(),
      responses: {
        200: SuccessResponseSchema,
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '删除成本策略',
    },

    // ========================================================================
    // 复杂度路由配置管理
    // ========================================================================

    /**
     * GET /proxy/admin/routing/complexity-configs - 获取所有复杂度路由配置
     */
    getComplexityRoutingConfigs: {
      method: 'GET',
      path: '/complexity-configs',
      responses: {
        200: ApiResponseSchema(ComplexityRoutingConfigListResponseSchema),
      },
      summary: '获取所有复杂度路由配置',
    },

    /**
     * GET /proxy/admin/routing/complexity-configs/:configId - 获取指定复杂度路由配置
     */
    getComplexityRoutingConfig: {
      method: 'GET',
      path: '/complexity-configs/:configId',
      pathParams: z.object({ configId: z.string() }),
      responses: {
        200: ApiResponseSchema(ComplexityRoutingConfigSchema),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '获取指定复杂度路由配置',
    },

    /**
     * POST /proxy/admin/routing/complexity-configs - 创建复杂度路由配置
     */
    createComplexityRoutingConfig: {
      method: 'POST',
      path: '/complexity-configs',
      body: CreateComplexityRoutingConfigInputSchema,
      responses: {
        200: ApiResponseSchema(ComplexityRoutingConfigSchema),
        400: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '创建复杂度路由配置',
    },

    /**
     * PUT /proxy/admin/routing/complexity-configs/:id - 更新复杂度路由配置
     */
    updateComplexityRoutingConfig: {
      method: 'PUT',
      path: '/complexity-configs/:id',
      pathParams: z.object({ id: z.string().uuid() }),
      body: UpdateComplexityRoutingConfigInputSchema,
      responses: {
        200: ApiResponseSchema(ComplexityRoutingConfigSchema),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '更新复杂度路由配置',
    },

    /**
     * DELETE /proxy/admin/routing/complexity-configs/:id - 删除复杂度路由配置
     */
    deleteComplexityRoutingConfig: {
      method: 'DELETE',
      path: '/complexity-configs/:id',
      pathParams: z.object({ id: z.string().uuid() }),
      body: z.object({}).optional(),
      responses: {
        200: SuccessResponseSchema,
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '删除复杂度路由配置',
    },

    /**
     * POST /proxy/admin/routing/classify-complexity - 测试复杂度分类
     */
    classifyComplexity: {
      method: 'POST',
      path: '/classify-complexity',
      body: ClassifyComplexityInputSchema,
      responses: {
        200: ApiResponseSchema(ComplexityClassificationResultSchema),
      },
      summary: '测试复杂度分类',
    },

    // ========================================================================
    // 模型定价管理
    // ========================================================================

    /**
     * GET /proxy/admin/routing/model-pricing - 获取所有模型定价
     */
    getModelPricingList: {
      method: 'GET',
      path: '/model-pricing',
      responses: {
        200: ApiResponseSchema(ModelPricingListResponseSchema),
      },
      summary: '获取所有模型定价',
    },

    /**
     * GET /proxy/admin/routing/model-pricing/:model - 获取模型定价
     */
    getModelPricing: {
      method: 'GET',
      path: '/model-pricing/:model',
      pathParams: z.object({ model: z.string() }),
      responses: {
        200: ApiResponseSchema(ModelPricingSchema),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '获取模型定价',
    },

    /**
     * POST /proxy/admin/routing/model-pricing - 创建模型定价
     */
    createModelPricing: {
      method: 'POST',
      path: '/model-pricing',
      body: CreateModelPricingInputSchema,
      responses: {
        200: ApiResponseSchema(ModelPricingSchema),
        400: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '创建模型定价',
    },

    /**
     * PUT /proxy/admin/routing/model-pricing/:id - 更新模型定价
     */
    updateModelPricing: {
      method: 'PUT',
      path: '/model-pricing/:id',
      pathParams: z.object({ id: z.string().uuid() }),
      body: UpdateModelPricingInputSchema,
      responses: {
        200: ApiResponseSchema(ModelPricingSchema),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '更新模型定价',
    },

    /**
     * DELETE /proxy/admin/routing/model-pricing/:id - 删除模型定价
     */
    deleteModelPricing: {
      method: 'DELETE',
      path: '/model-pricing/:id',
      pathParams: z.object({ id: z.string().uuid() }),
      body: z.object({}).optional(),
      responses: {
        200: SuccessResponseSchema,
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '删除模型定价',
    },

    // ========================================================================
    // 成本计算
    // ========================================================================

    /**
     * POST /proxy/admin/routing/calculate-cost - 计算请求成本
     */
    calculateCost: {
      method: 'POST',
      path: '/calculate-cost',
      body: CalculateCostInputSchema,
      responses: {
        200: ApiResponseSchema(CostCalculationSchema),
      },
      summary: '计算请求成本',
    },

    // ========================================================================
    // Bot 使用量查询
    // ========================================================================

    /**
     * GET /proxy/admin/routing/bot-usage/:botId - 获取 Bot 使用量
     */
    getBotUsage: {
      method: 'GET',
      path: '/bot-usage/:botId',
      pathParams: z.object({ botId: z.string().uuid() }),
      responses: {
        200: ApiResponseSchema(BotUsageResponseSchema),
      },
      summary: '获取 Bot 使用量',
    },

    /**
     * GET /proxy/admin/routing/bot-budget/:botId - 检查 Bot 预算状态
     */
    checkBotBudget: {
      method: 'GET',
      path: '/bot-budget/:botId',
      pathParams: z.object({ botId: z.string().uuid() }),
      query: BotBudgetQuerySchema,
      responses: {
        200: ApiResponseSchema(BudgetStatusSchema),
      },
      summary: '检查 Bot 预算状态',
    },

    // ========================================================================
    // 模型选择
    // ========================================================================

    /**
     * POST /proxy/admin/routing/select-model - 根据成本策略选择最优模型
     */
    selectOptimalModel: {
      method: 'POST',
      path: '/select-model',
      body: SelectModelInputSchema,
      responses: {
        200: ApiResponseSchema(SelectModelResponseSchema),
      },
      summary: '根据成本策略选择最优模型',
    },

    // ========================================================================
    // 配置导入/导出
    // ========================================================================

    /**
     * GET /proxy/admin/routing/export - 导出所有配置
     */
    exportConfig: {
      method: 'GET',
      path: '/export',
      responses: {
        200: ApiResponseSchema(ExportConfigResponseSchema),
      },
      summary: '导出所有配置',
    },

    /**
     * POST /proxy/admin/routing/import - 导入配置
     */
    importConfig: {
      method: 'POST',
      path: '/import',
      body: ImportConfigInputSchema,
      responses: {
        200: ApiResponseSchema(
          z.object({
            imported: z.object({
              modelPricing: z.number(),
              capabilityTags: z.number(),
              fallbackChains: z.number(),
              costStrategies: z.number(),
            }),
          }),
        ),
        400: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '导入配置',
    },
  },
  {
    pathPrefix: '/proxy/admin/routing',
  },
);

export type RoutingAdminContract = typeof routingAdminContract;
