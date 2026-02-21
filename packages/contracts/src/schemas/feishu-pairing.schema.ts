import { z } from 'zod';

// ============================================================================
// Feishu Pairing Request Schema - 飞书配对请求
// ============================================================================

/**
 * 飞书配对请求状态
 */
export const FeishuPairingStatusSchema = z.enum(['pending', 'approved', 'rejected', 'expired']);

export type FeishuPairingStatus = z.infer<typeof FeishuPairingStatusSchema>;

/**
 * 飞书配对请求项
 */
export const FeishuPairingRequestItemSchema = z.object({
  /** 配对码 */
  code: z.string(),
  /** 飞书用户 Open ID */
  feishuOpenId: z.string(),
  /** 配对状态 */
  status: FeishuPairingStatusSchema,
  /** 创建时间 */
  createdAt: z.string().datetime(),
  /** 过期时间 */
  expiresAt: z.string().datetime(),
  /** 批准时间（如果已批准） */
  approvedAt: z.string().datetime().nullable(),
  /** 批准者（如果已批准） */
  approvedBy: z.string().nullable(),
});

export type FeishuPairingRequestItem = z.infer<typeof FeishuPairingRequestItemSchema>;

/**
 * 飞书配对请求列表响应
 */
export const FeishuPairingListResponseSchema = z.object({
  list: z.array(FeishuPairingRequestItemSchema),
  total: z.number(),
});

export type FeishuPairingListResponse = z.infer<typeof FeishuPairingListResponseSchema>;

// ============================================================================
// Feishu Pairing Action Schemas - 飞书配对操作
// ============================================================================

/**
 * 批准配对请求参数
 */
export const ApprovePairingRequestSchema = z.object({
  /** 配对码 */
  code: z.string().min(1),
});

export type ApprovePairingRequest = z.infer<typeof ApprovePairingRequestSchema>;

/**
 * 拒绝配对请求参数
 */
export const RejectPairingRequestSchema = z.object({
  /** 配对码 */
  code: z.string().min(1),
});

export type RejectPairingRequest = z.infer<typeof RejectPairingRequestSchema>;

/**
 * 配对操作响应
 */
export const PairingActionResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  /** 被批准/拒绝的用户 Open ID */
  feishuOpenId: z.string().optional(),
});

export type PairingActionResponse = z.infer<typeof PairingActionResponseSchema>;

// ============================================================================
// Feishu Pairing Config Schema - 飞书配对配置
// ============================================================================

/**
 * 飞书配对策略
 */
export const FeishuDmPolicySchema = z.enum(['pairing', 'allowlist', 'open', 'disabled']);

export type FeishuDmPolicy = z.infer<typeof FeishuDmPolicySchema>;

/**
 * 飞书配对配置
 */
export const FeishuPairingConfigSchema = z.object({
  /** DM 策略 */
  dmPolicy: FeishuDmPolicySchema,
  /** 允许的用户列表（当 dmPolicy 为 allowlist 时使用） */
  allowFrom: z.array(z.string()),
});

export type FeishuPairingConfig = z.infer<typeof FeishuPairingConfigSchema>;

/**
 * 更新飞书配对配置请求
 */
export const UpdateFeishuPairingConfigRequestSchema = z.object({
  dmPolicy: FeishuDmPolicySchema.optional(),
  allowFrom: z.array(z.string()).optional(),
});

export type UpdateFeishuPairingConfigRequest = z.infer<
  typeof UpdateFeishuPairingConfigRequestSchema
>;
