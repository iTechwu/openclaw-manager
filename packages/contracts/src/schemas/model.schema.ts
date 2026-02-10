import { z } from 'zod';

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

export type AvailableModelCapability = z.infer<typeof AvailableModelCapabilitySchema>;

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
  /** 能力标签 */
  capabilities: z.array(z.string()),
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

export type AvailableModelsResponse = z.infer<typeof AvailableModelsResponseSchema>;

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
