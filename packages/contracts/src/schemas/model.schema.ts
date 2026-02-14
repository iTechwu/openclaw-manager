import { z } from 'zod';
import { ModelTypeSchema } from './prisma-enums.generated';

// ============================================================================
// Available Model Schema (面向用户展示的模型信息)
// ============================================================================

/**
 * 模型分类
 */
export const ModelCategorySchema = z.enum([
  'reasoning',
  'balanced',
  'fast',
  'general',
]);

export type ModelCategory = z.infer<typeof ModelCategorySchema>;

/**
 * 模型能力标签
 */
export const AvailableModelCapabilitySchema = z.enum([
  'vision',
  'tools',
  'streaming',
  'reasoning',
  'extended-thinking',
]);

export type AvailableModelCapability = z.infer<
  typeof AvailableModelCapabilitySchema
>;

/**
 * Provider 信息 Schema（仅管理员可见）
 */
export const ProviderInfoSchema = z.object({
  /** Provider Key ID */
  providerKeyId: z.string(),
  /** Provider 标签 */
  label: z.string().nullable(),
  /** Provider 供应商 */
  vendor: z.string(),
});

export type ProviderInfo = z.infer<typeof ProviderInfoSchema>;

/**
 * 可用模型 Schema
 * 面向用户展示的模型信息，隐藏 Provider 细节
 */
export const AvailableModelSchema = z.object({
  /** 模型唯一标识 */
  id: z.string(),
  /** 模型名称 */
  model: z.string(),
  /** 显示名称 */
  displayName: z.string(),
  /** 模型供应商（内部使用，不对普通用户显示） */
  vendor: z.string(),
  /** 模型分类 */
  category: z.string(),
  /** 能力标签（tagId 列表，向后兼容） */
  capabilities: z.array(z.string()),
  /** 能力标签详情（来自能力标签管理） */
  capabilityTags: z
    .array(
      z.object({
        tagId: z.string(),
        name: z.string(),
        category: z.string().optional(),
      }),
    )
    .optional(),
  /** 是否可用（有有效的 API Key） */
  isAvailable: z.boolean(),
  /** 最后验证时间 */
  lastVerifiedAt: z.coerce.date().nullable(),
  /** 推理能力评分 */
  reasoningScore: z.number().optional(),
  /** 编码能力评分 */
  codingScore: z.number().optional(),
  /** 创意能力评分 */
  creativityScore: z.number().optional(),
  /** 速度评分 */
  speedScore: z.number().optional(),
  /** Provider 信息列表（仅管理员可见） */
  providers: z.array(ProviderInfoSchema).optional(),
});

export type AvailableModel = z.infer<typeof AvailableModelSchema>;

// ============================================================================
// Bot Model Schema (Bot 的模型配置)
// ============================================================================

/**
 * Bot 模型信息 Schema
 */
export const BotModelInfoSchema = z.object({
  /** 模型 ID */
  modelId: z.string(),
  /** 显示名称 */
  displayName: z.string(),
  /** 是否启用 */
  isEnabled: z.boolean(),
  /** 是否为主模型 */
  isPrimary: z.boolean(),
  /** 是否可用（有有效的 API Key） */
  isAvailable: z.boolean(),
});

export type BotModelInfo = z.infer<typeof BotModelInfoSchema>;

// ============================================================================
// API Request/Response Schemas
// ============================================================================

/**
 * 获取可用模型列表响应
 */
export const AvailableModelsResponseSchema = z.object({
  list: z.array(AvailableModelSchema),
});

export type AvailableModelsResponse = z.infer<
  typeof AvailableModelsResponseSchema
>;

/**
 * 获取 Bot 模型列表响应
 */
export const BotModelsResponseSchema = z.object({
  list: z.array(BotModelInfoSchema),
});

export type BotModelsResponse = z.infer<typeof BotModelsResponseSchema>;

/**
 * 更新 Bot 模型配置请求
 */
export const UpdateBotModelsInputSchema = z.object({
  /** 启用的模型 ID 列表 */
  models: z.array(z.string()).min(1, 'At least one model is required'),
  /** 主模型 ID */
  primaryModel: z.string().optional(),
});

export type UpdateBotModelsInput = z.infer<typeof UpdateBotModelsInputSchema>;

// ============================================================================
// Admin Model Management Schemas
// ============================================================================

/**
 * 刷新模型列表请求
 */
export const RefreshModelsInputSchema = z.object({
  /** Provider Key ID */
  providerKeyId: z.string().uuid(),
});

export type RefreshModelsInput = z.infer<typeof RefreshModelsInputSchema>;

/**
 * 刷新模型列表响应
 */
export const RefreshModelsResponseSchema = z.object({
  /** 获取到的模型列表 */
  models: z.array(z.string()),
  /** 新增的模型数量 */
  addedCount: z.number(),
  /** 移除的模型数量 */
  removedCount: z.number(),
});

export type RefreshModelsResponse = z.infer<typeof RefreshModelsResponseSchema>;

/**
 * 验证单个模型请求
 */
export const VerifySingleModelInputSchema = z.object({
  /** Provider Key ID */
  providerKeyId: z.string().uuid(),
  /** 模型名称 */
  model: z.string(),
});

export type VerifySingleModelInput = z.infer<
  typeof VerifySingleModelInputSchema
>;

/**
 * 验证单个模型响应
 */
export const VerifySingleModelResponseSchema = z.object({
  /** 模型名称 */
  model: z.string(),
  /** 是否可用 */
  isAvailable: z.boolean(),
  /** 延迟（毫秒） */
  latencyMs: z.number().optional(),
  /** 错误信息 */
  errorMessage: z.string().optional(),
});

export type VerifySingleModelResponse = z.infer<
  typeof VerifySingleModelResponseSchema
>;

/**
 * 批量验证请求（增量验证未验证的模型）
 */
export const BatchVerifyInputSchema = z.object({
  /** Provider Key ID */
  providerKeyId: z.string().uuid(),
});

export type BatchVerifyInput = z.infer<typeof BatchVerifyInputSchema>;

/**
 * 批量验证响应
 */
export const BatchVerifyResponseSchema = z.object({
  /** 总模型数 */
  total: z.number(),
  /** 已验证数 */
  verified: z.number(),
  /** 可用数 */
  available: z.number(),
  /** 失败数 */
  failed: z.number(),
  /** 验证结果列表 */
  results: z.array(VerifySingleModelResponseSchema),
});

export type BatchVerifyResponse = z.infer<typeof BatchVerifyResponseSchema>;

/**
 * ProviderKey 摘要 Schema（过滤敏感信息）
 */
export const ProviderKeySummarySchema = z.object({
  /** Provider Key ID */
  id: z.string(),
  /** 供应商 */
  vendor: z.string(),
  /** API 类型 */
  apiType: z.string(),
  /** 标签 */
  label: z.string().nullable(),
});

export type ProviderKeySummary = z.infer<typeof ProviderKeySummarySchema>;

/**
 * ModelAvailability 记录 Schema（管理员视图）
 */
export const ModelAvailabilityItemSchema = z.object({
  /** 记录 ID */
  id: z.string(),
  /** 模型名称 */
  model: z.string(),
  /** Provider Key ID */
  providerKeyId: z.string(),
  /** 模型类型 */
  modelType: ModelTypeSchema,
  /** 是否可用 */
  isAvailable: z.boolean(),
  /** 最后验证时间 */
  lastVerifiedAt: z.coerce.date(),
  /** 错误信息 */
  errorMessage: z.string().nullable(),
  /** 关联的 ModelCatalog ID */
  modelCatalogId: z.string().uuid(),
  /** 能力标签列表 */
  capabilityTags: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
      }),
    )
    .optional(),
  /** Provider Key 信息（过滤敏感信息） */
  providerKeys: z.array(ProviderKeySummarySchema).optional(),
});

export type ModelAvailabilityItem = z.infer<typeof ModelAvailabilityItemSchema>;

/**
 * ModelAvailability 列表响应
 */
export const ModelAvailabilityListResponseSchema = z.object({
  list: z.array(ModelAvailabilityItemSchema),
});

export type ModelAvailabilityListResponse = z.infer<
  typeof ModelAvailabilityListResponseSchema
>;

// ============================================================================
// Refresh All Models Schemas
// ============================================================================

/**
 * 刷新所有模型列表响应中的单个结果
 */
export const RefreshAllModelsResultItemSchema = z.object({
  /** Provider Key ID */
  providerKeyId: z.string(),
  /** Provider 标签 */
  label: z.string(),
  /** Provider 供应商 */
  vendor: z.string(),
  /** 是否成功 */
  success: z.boolean(),
  /** 获取到的模型列表 */
  models: z.array(z.string()).optional(),
  /** 新增的模型数量 */
  addedCount: z.number().optional(),
  /** 移除的模型数量 */
  removedCount: z.number().optional(),
  /** 错误信息 */
  error: z.string().optional(),
});

export type RefreshAllModelsResultItem = z.infer<
  typeof RefreshAllModelsResultItemSchema
>;

/**
 * 刷新所有模型列表响应
 */
export const RefreshAllModelsResponseSchema = z.object({
  /** 总 Provider Key 数量 */
  totalProviderKeys: z.number(),
  /** 成功数量 */
  successCount: z.number(),
  /** 失败数量 */
  failedCount: z.number(),
  /** 总模型数量 */
  totalModels: z.number(),
  /** 总新增数量 */
  totalAdded: z.number(),
  /** 总移除数量 */
  totalRemoved: z.number(),
  /** 各 Provider Key 的结果 */
  results: z.array(RefreshAllModelsResultItemSchema),
});

export type RefreshAllModelsResponse = z.infer<
  typeof RefreshAllModelsResponseSchema
>;

// ============================================================================
// Batch Verify All Schemas
// ============================================================================

/**
 * 批量验证所有不可用模型响应中的单个结果
 */
export const BatchVerifyAllResultItemSchema = z.object({
  /** Provider Key ID */
  providerKeyId: z.string(),
  /** Provider 标签 */
  label: z.string(),
  /** Provider 供应商 */
  vendor: z.string(),
  /** 已验证数 */
  verified: z.number(),
  /** 可用数 */
  available: z.number(),
  /** 失败数 */
  failed: z.number(),
});

export type BatchVerifyAllResultItem = z.infer<
  typeof BatchVerifyAllResultItemSchema
>;

/**
 * 批量验证所有不可用模型响应
 */
export const BatchVerifyAllResponseSchema = z.object({
  /** 总 Provider Key 数量 */
  totalProviderKeys: z.number(),
  /** 总已验证数 */
  totalVerified: z.number(),
  /** 总可用数 */
  totalAvailable: z.number(),
  /** 总失败数 */
  totalFailed: z.number(),
  /** 各 Provider Key 的结果 */
  results: z.array(BatchVerifyAllResultItemSchema),
});

export type BatchVerifyAllResponse = z.infer<
  typeof BatchVerifyAllResponseSchema
>;

// ============================================================================
// Capability Tag Management Schemas
// ============================================================================

/**
 * 能力标签匹配来源
 */
export const CapabilityTagMatchSourceSchema = z.enum([
  'pattern',
  'feature',
  'scenario',
  'manual',
]);

export type CapabilityTagMatchSource = z.infer<
  typeof CapabilityTagMatchSourceSchema
>;

/**
 * 模型能力标签关联 Schema
 */
export const ModelCapabilityTagItemSchema = z.object({
  /** 关联 ID */
  id: z.string(),
  /** ModelCatalog ID */
  modelCatalogId: z.string(),
  /** CapabilityTag ID */
  capabilityTagId: z.string(),
  /** 标签 ID（如 vision, tools 等） */
  tagId: z.string(),
  /** 匹配来源 */
  matchSource: CapabilityTagMatchSourceSchema,
  /** 置信度 (0-100) */
  confidence: z.number(),
  /** 创建时间 */
  createdAt: z.coerce.date(),
});

export type ModelCapabilityTagItem = z.infer<
  typeof ModelCapabilityTagItemSchema
>;

/**
 * 获取模型能力标签列表响应
 */
export const ModelCapabilityTagsResponseSchema = z.object({
  list: z.array(ModelCapabilityTagItemSchema),
});

export type ModelCapabilityTagsResponse = z.infer<
  typeof ModelCapabilityTagsResponseSchema
>;

/**
 * 添加模型能力标签请求
 */
export const AddModelCapabilityTagInputSchema = z.object({
  /** ModelCatalog ID */
  modelCatalogId: z.string().uuid(),
  /** CapabilityTag ID */
  capabilityTagId: z.string().uuid(),
});

export type AddModelCapabilityTagInput = z.infer<
  typeof AddModelCapabilityTagInputSchema
>;

/**
 * 移除模型能力标签请求
 */
export const RemoveModelCapabilityTagInputSchema = z.object({
  /** ModelCatalog ID */
  modelCatalogId: z.string().uuid(),
  /** CapabilityTag ID */
  capabilityTagId: z.string().uuid(),
});

export type RemoveModelCapabilityTagInput = z.infer<
  typeof RemoveModelCapabilityTagInputSchema
>;

/**
 * 能力标签 Schema（用于列表展示）
 */
export const CapabilityTagItemSchema = z.object({
  /** 记录 ID */
  id: z.string(),
  /** 标签 ID（如 vision, tools 等） */
  tagId: z.string(),
  /** 标签名称 */
  name: z.string(),
  /** 标签描述 */
  description: z.string().nullable(),
  /** 是否激活 */
  isActive: z.boolean(),
});

export type CapabilityTagItem = z.infer<typeof CapabilityTagItemSchema>;

/**
 * 获取所有能力标签响应
 */
export const CapabilityTagsResponseSchema = z.object({
  list: z.array(CapabilityTagItemSchema),
});

export type CapabilityTagsResponse = z.infer<
  typeof CapabilityTagsResponseSchema
>;

// ============================================================================
// Extended Available Model Schema (with pricing info)
// ============================================================================

/**
 * 扩展的可用模型 Schema（包含定价信息）
 */
export const ExtendedAvailableModelSchema = AvailableModelSchema.extend({
  /** 能力标签列表（动态获取） */
  capabilityTags: z.array(z.string()).optional(),
  /** 输入价格（每百万 token） */
  inputPrice: z.number().optional(),
  /** 输出价格（每百万 token） */
  outputPrice: z.number().optional(),
  /** 上下文长度 */
  contextLength: z.number().optional(),
  /** 是否支持视觉 */
  supportsVision: z.boolean().optional(),
  /** 是否支持扩展思考 */
  supportsExtendedThinking: z.boolean().optional(),
  /** 是否支持函数调用 */
  supportsFunctionCalling: z.boolean().optional(),
});

export type ExtendedAvailableModel = z.infer<
  typeof ExtendedAvailableModelSchema
>;

// ============================================================================
// Model Sync Schemas
// ============================================================================

/**
 * 同步状态 Schema
 */
export const ModelSyncStatusSchema = z.object({
  /** 总模型数 */
  totalModels: z.number(),
  /** 目录已同步数 */
  catalogSynced: z.number(),
  /** 目录未同步数 */
  catalogNotSynced: z.number(),
  /** 标签已同步数 */
  tagsSynced: z.number(),
  /** 标签未同步数 */
  tagsNotSynced: z.number(),
  /** 最后同步时间 */
  lastSyncAt: z.coerce.date().nullable(),
});

export type ModelSyncStatus = z.infer<typeof ModelSyncStatusSchema>;

/**
 * 同步定价请求 Schema
 */
export const SyncPricingInputSchema = z
  .object({
    /** 可选，指定单个模型 */
    modelAvailabilityId: z.string().uuid().optional(),
  })
  .optional();

export type SyncPricingInput = z.infer<typeof SyncPricingInputSchema>;

/**
 * 同步定价响应 Schema
 */
export const SyncPricingResponseSchema = z.object({
  /** 已同步数 */
  synced: z.number(),
  /** 跳过数 */
  skipped: z.number(),
  /** 错误列表 */
  errors: z.array(
    z.object({
      modelId: z.string(),
      error: z.string(),
    }),
  ),
});

export type SyncPricingResponse = z.infer<typeof SyncPricingResponseSchema>;

/**
 * 同步标签请求 Schema
 */
export const SyncTagsInputSchema = z
  .object({
    /** 可选，指定单个模型目录 */
    modelCatalogId: z.string().uuid().optional(),
  })
  .optional();

export type SyncTagsInput = z.infer<typeof SyncTagsInputSchema>;

/**
 * 同步标签响应 Schema
 */
export const SyncTagsResponseSchema = z.object({
  /** 已处理数 */
  processed: z.number(),
  /** 已分配标签数 */
  tagsAssigned: z.number(),
  /** 错误列表 */
  errors: z.array(
    z.object({
      modelId: z.string(),
      error: z.string(),
    }),
  ),
});

export type SyncTagsResponse = z.infer<typeof SyncTagsResponseSchema>;

/**
 * 刷新并同步响应 Schema
 */
export const RefreshWithSyncResponseSchema = z.object({
  /** 刷新结果 */
  refresh: RefreshModelsResponseSchema,
  /** 定价同步结果 */
  pricingSync: SyncPricingResponseSchema,
  /** 标签同步结果 */
  tagsSync: SyncTagsResponseSchema,
});

export type RefreshWithSyncResponse = z.infer<
  typeof RefreshWithSyncResponseSchema
>;

/**
 * 模型详情 Schema（包含所有关联数据）
 */
export const ModelDetailsSchema = z.object({
  /** 模型可用性信息 */
  availability: ModelAvailabilityItemSchema,
  /** 定价信息 */
  pricing: z
    .object({
      id: z.string(),
      model: z.string(),
      vendor: z.string(),
      displayName: z.string().nullable(),
      inputPrice: z.number(),
      outputPrice: z.number(),
      reasoningScore: z.number(),
      codingScore: z.number(),
      creativityScore: z.number(),
      speedScore: z.number(),
      contextLength: z.number(),
      supportsVision: z.boolean(),
      supportsExtendedThinking: z.boolean(),
      supportsFunctionCalling: z.boolean(),
    })
    .nullable(),
  /** 能力标签列表 */
  capabilityTags: z.array(ModelCapabilityTagItemSchema),
  /** 关联的 FallbackChain 列表 */
  fallbackChains: z.array(
    z.object({
      chainId: z.string(),
      name: z.string(),
      position: z.number(),
    }),
  ),
  /** 关联的路由配置列表 */
  routingConfigs: z.array(
    z.object({
      botId: z.string(),
      botName: z.string(),
      routingType: z.string(),
    }),
  ),
});

export type ModelDetails = z.infer<typeof ModelDetailsSchema>;

// ============================================================================
// FallbackChain Validation Schemas
// ============================================================================

/**
 * FallbackChain 中不可用的模型
 */
export const UnavailableModelInChainSchema = z.object({
  /** 模型名称 */
  model: z.string(),
  /** 供应商 */
  vendor: z.string(),
  /** 不可用原因 */
  reason: z.string(),
});

export type UnavailableModelInChain = z.infer<
  typeof UnavailableModelInChainSchema
>;

/**
 * FallbackChain 验证结果 Schema
 */
export const FallbackChainValidationResultSchema = z.object({
  /** 链 ID */
  chainId: z.string(),
  /** 链名称 */
  name: z.string(),
  /** 总模型数 */
  totalModels: z.number(),
  /** 可用模型数 */
  availableModels: z.number(),
  /** 不可用模型列表 */
  unavailableModels: z.array(UnavailableModelInChainSchema),
  /** 是否有效 */
  isValid: z.boolean(),
});

export type FallbackChainValidationResult = z.infer<
  typeof FallbackChainValidationResultSchema
>;

/**
 * 更新 FallbackChain 请求 Schema
 */
export const UpdateFallbackChainsInputSchema = z.object({
  /** 是否移除不可用模型 */
  removeUnavailable: z.boolean().default(false),
  /** 是否添加新可用模型 */
  addNewAvailable: z.boolean().default(false),
});

export type UpdateFallbackChainsInput = z.infer<
  typeof UpdateFallbackChainsInputSchema
>;

/**
 * 更新 FallbackChain 响应 Schema
 */
export const UpdateFallbackChainsResponseSchema = z.object({
  /** 更新的链数 */
  chainsUpdated: z.number(),
  /** 移除的模型数 */
  modelsRemoved: z.number(),
  /** 添加的模型数 */
  modelsAdded: z.number(),
  /** 错误列表 */
  errors: z.array(
    z.object({
      chainId: z.string(),
      error: z.string(),
    }),
  ),
});

export type UpdateFallbackChainsResponse = z.infer<
  typeof UpdateFallbackChainsResponseSchema
>;

/**
 * 生成 FallbackChain 请求 Schema
 */
export const GenerateFallbackChainInputSchema = z.object({
  /** 能力标签 ID */
  capabilityTagId: z.string().uuid(),
  /** 链名称 */
  name: z.string(),
  /** 最大模型数 */
  maxModels: z.number().default(5),
});

export type GenerateFallbackChainInput = z.infer<
  typeof GenerateFallbackChainInputSchema
>;
