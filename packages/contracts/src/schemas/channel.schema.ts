import { z } from 'zod';
import {
  ChannelConnectionStatusSchema,
  type ChannelConnectionStatus,
} from './prisma-enums.generated';

// ============================================================================
// Channel Credential Field Schema
// ============================================================================

export const ChannelCredentialFieldSchema = z.object({
  id: z.string().uuid(),
  channelId: z.string(),
  key: z.string(),
  label: z.string(),
  placeholder: z.string(),
  fieldType: z.enum(['text', 'password']),
  required: z.boolean(),
  sortOrder: z.number(),
});

export type ChannelCredentialField = z.infer<
  typeof ChannelCredentialFieldSchema
>;

// ============================================================================
// Channel Definition Schema
// ============================================================================

export const ChannelDefinitionSchema = z.object({
  id: z.string(),
  label: z.string(),
  icon: z.string(),
  popular: z.boolean(),
  popularLocales: z.array(z.string()), // Locales where this channel is popular
  tokenHint: z.string(),
  tokenPlaceholder: z.string(),
  helpUrl: z.string().nullable(),
  helpText: z.string().nullable(),
  sortOrder: z.number(),
  credentialFields: z.array(ChannelCredentialFieldSchema),
});

export type ChannelDefinition = z.infer<typeof ChannelDefinitionSchema>;

// ============================================================================
// Channel Definition List Response Schema
// ============================================================================

export const ChannelDefinitionListResponseSchema = z.object({
  channels: z.array(ChannelDefinitionSchema),
  popularChannels: z.array(ChannelDefinitionSchema),
  otherChannels: z.array(ChannelDefinitionSchema),
});

export type ChannelDefinitionListResponse = z.infer<
  typeof ChannelDefinitionListResponseSchema
>;

// ============================================================================
// Bot Channel Schema - Bot 渠道配置
// ============================================================================

// Channel connection status enum now comes from prisma-enums.generated

// Bot Channel Item Schema (返回给前端，不包含加密凭证)
export const BotChannelItemSchema = z.object({
  id: z.string().uuid(),
  botId: z.string().uuid(),
  channelType: z.string(),
  name: z.string(),
  config: z.record(z.string(), z.unknown()).nullable(),
  // 凭证掩码信息，用于前端显示已配置状态（如 { appId: "cli_***abc", appSecret: "***" }）
  credentialsMasked: z.record(z.string(), z.string()).nullable(),
  isEnabled: z.boolean(),
  connectionStatus: ChannelConnectionStatusSchema,
  lastConnectedAt: z.string().datetime().nullable(),
  lastError: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type BotChannelItem = z.infer<typeof BotChannelItemSchema>;

// Bot Channel List Response
export const BotChannelListResponseSchema = z.object({
  list: z.array(BotChannelItemSchema),
  total: z.number(),
});

export type BotChannelListResponse = z.infer<
  typeof BotChannelListResponseSchema
>;

// Create Bot Channel Request
export const CreateBotChannelRequestSchema = z.object({
  channelType: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  credentials: z.record(z.string(), z.string()), // 凭证键值对，如 { appId: 'xxx', appSecret: 'xxx' }
  config: z.record(z.string(), z.unknown()).optional(),
  isEnabled: z.boolean().optional().default(true),
});

export type CreateBotChannelRequest = z.infer<
  typeof CreateBotChannelRequestSchema
>;

// Update Bot Channel Request
export const UpdateBotChannelRequestSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  credentials: z.record(z.string(), z.string()).optional(), // 可选更新凭证
  config: z.record(z.string(), z.unknown()).optional(),
  isEnabled: z.boolean().optional(),
});

export type UpdateBotChannelRequest = z.infer<
  typeof UpdateBotChannelRequestSchema
>;

// Bot Channel Connection Action
export const BotChannelConnectionActionSchema = z.enum([
  'connect',
  'disconnect',
]);

export type BotChannelConnectionAction = z.infer<
  typeof BotChannelConnectionActionSchema
>;

// ============================================================================
// Channel Test Schemas - 渠道快速测试
// ============================================================================

/**
 * 凭证验证请求 Schema（保存前验证）
 */
export const ValidateCredentialsRequestSchema = z.object({
  channelType: z.string().min(1).max(50),
  credentials: z.record(z.string(), z.string()),
  config: z.record(z.string(), z.unknown()).optional(),
});

export type ValidateCredentialsRequest = z.infer<
  typeof ValidateCredentialsRequestSchema
>;

/**
 * 渠道测试请求 Schema
 */
export const ChannelTestRequestSchema = z.object({
  message: z
    .string()
    .min(1)
    .max(1000)
    .optional()
    .default('Hello from ClawBot!'),
});

export type ChannelTestRequest = z.infer<typeof ChannelTestRequestSchema>;

/**
 * 渠道测试结果状态
 */
export const ChannelTestStatusSchema = z.enum(['success', 'warning', 'error']);

export type ChannelTestStatus = z.infer<typeof ChannelTestStatusSchema>;

/**
 * 渠道测试响应 Schema
 */
export const ChannelTestResponseSchema = z.object({
  status: ChannelTestStatusSchema,
  message: z.string(),
  latency: z.number().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type ChannelTestResponse = z.infer<typeof ChannelTestResponseSchema>;
