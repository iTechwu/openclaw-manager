import { z } from 'zod';
import { BotStatusSchema } from './prisma-enums.generated';
// 从新的 provider schema 导入
import {
  ProviderVendorSchema,
  ProviderApiTypeSchema,
  getEffectiveApiHost,
  isCustomApiHost,
  PROVIDER_DEFAULT_BASE_URLS,
} from './provider.schema';

// 重新导出 provider 相关类型和函数
export {
  ProviderVendorSchema,
  ProviderApiTypeSchema,
  getEffectiveApiHost,
  isCustomApiHost,
  PROVIDER_DEFAULT_BASE_URLS,
} from './provider.schema';
export type { ProviderVendor, ProviderApiType } from './provider.schema';

// BotStatus/BotStatusSchema 来自 prisma-enums.generated，由 index 统一导出

// ============================================================================
// Container Status Schema
// ============================================================================

export const ContainerStatusSchema = z.object({
  id: z.string(),
  state: z.string(),
  running: z.boolean(),
  exitCode: z.number(),
  startedAt: z.string(),
  finishedAt: z.string(),
});

export type ContainerStatus = z.infer<typeof ContainerStatusSchema>;

// ============================================================================
// Bot Schema
// ============================================================================

// 注意：aiProvider、model、channelType 字段已移除
// 这些值现在从 BotProviderKey 和 BotChannel 动态派生
// 使用 BotConfigResolverService.getBotRuntimeConfig() 获取这些值

export const BotSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  hostname: z.string(),
  containerId: z.string().nullable(),
  port: z.number().nullable(),
  gatewayToken: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
  status: BotStatusSchema,
  createdById: z.string().uuid(),
  personaTemplateId: z.string().uuid().nullable(),
  emoji: z.string().nullable(),
  avatarFileId: z.string().uuid().nullable(),
  avatarUrl: z.string().nullable(),
  soulMarkdown: z.string().nullable(),
  // 待生效配置：存储修改后尚未重启生效的配置
  // 使用 z.unknown() 以兼容 Prisma 的 JsonValue 类型
  // 实际类型为 PendingConfig，在使用时需要进行类型断言
  pendingConfig: z.unknown().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  containerStatus: ContainerStatusSchema.nullable().optional(),
  // Tokenized URLs for accessing the bot's OpenClaw gateway
  // These URLs include the gateway token for WebSocket authentication
  dashboardUrl: z.string().nullable().optional(),
  chatUrl: z.string().nullable().optional(),
});

export type Bot = z.infer<typeof BotSchema>;

// ============================================================================
// Bot Creation Schemas
// ============================================================================

export const BotProviderConfigSchema = z.object({
  providerId: z.string(),
  models: z.array(z.string()).min(1, 'At least one model is required'),
  primaryModel: z.string().optional(),
  keyId: z.string().uuid().optional(),
});

export type BotProviderConfig = z.infer<typeof BotProviderConfigSchema>;

// BotProviderKey Response Schema - 用于 API 响应
export const BotProviderKeyResponseSchema = z.object({
  id: z.string().uuid(),
  providerKeyId: z.string().uuid(),
  isPrimary: z.boolean(),
  allowedModels: z.array(z.string()),
  primaryModel: z.string().nullable(),
  createdAt: z.coerce.date(),
});

export type BotProviderKeyResponse = z.infer<
  typeof BotProviderKeyResponseSchema
>;

/** @deprecated 使用 BotProviderConfigSchema 代替 */
export const ProviderConfigSchema = BotProviderConfigSchema;

export const ChannelConfigSchema = z.object({
  channelType: z.string(),
  credentials: z.record(z.string(), z.string()),
});

export type ChannelConfig = z.infer<typeof ChannelConfigSchema>;

export const WizardFeaturesSchema = z.object({
  commands: z.boolean().default(true),
  tts: z.boolean().default(true),
  ttsVoice: z.string().optional(),
  sandbox: z.boolean().default(true),
  sandboxTimeout: z.number().optional(),
  sessionScope: z.enum(['user', 'channel', 'global']).default('user'),
});

export type WizardFeatures = z.infer<typeof WizardFeaturesSchema>;

export const PersonaSchema = z.object({
  name: z.string(),
  soulMarkdown: z.string(),
  emoji: z.string().max(10).optional(),
  avatarFileId: z.string().uuid().optional(),
  avatarUrl: z.string().url().optional(),
});

export type Persona = z.infer<typeof PersonaSchema>;

export const CreateBotInputSchema = z.object({
  name: z.string().min(1).max(255),
  hostname: z.string().regex(/^[a-z0-9-]{1,64}$/, {
    message:
      'Hostname must be lowercase alphanumeric with hyphens, max 64 chars',
  }),
  providers: z.array(BotProviderConfigSchema).min(1),
  primaryProvider: z.string().optional(),
  channels: z.array(ChannelConfigSchema).min(1),
  personaTemplateId: z.string().uuid().optional(),
  persona: PersonaSchema,
  features: WizardFeaturesSchema,
  tags: z.array(z.string()).optional(),
});

export type CreateBotInput = z.infer<typeof CreateBotInputSchema>;

// ============================================================================
// Simple Create Bot Schema - 简化创建
// ============================================================================

/**
 * 简化创建 Bot 输入 Schema
 * 只需要基本信息和人设，Provider 和 Channel 在创建后配置
 */
export const SimpleCreateBotInputSchema = z.object({
  name: z.string().min(1).max(255),
  hostname: z.string().regex(/^[a-z0-9-]{1,64}$/, {
    message:
      'Hostname must be lowercase alphanumeric with hyphens, max 64 chars',
  }),
  persona: PersonaSchema,
  personaTemplateId: z.string().uuid().optional(),
  tags: z.array(z.string()).optional(),
});

export type SimpleCreateBotInput = z.infer<typeof SimpleCreateBotInputSchema>;

// ============================================================================
// Update Bot Schema - 更新 Bot 配置
// ============================================================================

/**
 * 待生效配置 Schema
 * 存储修改后尚未重启生效的配置
 */
export const PendingConfigSchema = z.object({
  name: z.string().optional(),
  tags: z.array(z.string()).optional(),
  soulMarkdown: z.string().optional(),
  emoji: z.string().optional(),
  avatarFileId: z.string().uuid().optional(),
});

export type PendingConfig = z.infer<typeof PendingConfigSchema>;

/**
 * 更新 Bot 输入 Schema
 * 所有字段都是可选的，只更新提供的字段
 * 更新会存储到 pendingConfig，需要重启后生效
 */
export const UpdateBotInputSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  tags: z.array(z.string()).optional(),
  soulMarkdown: z.string().optional(),
  emoji: z.string().max(10).optional(),
  avatarFileId: z.string().uuid().optional(),
});

export type UpdateBotInput = z.infer<typeof UpdateBotInputSchema>;

/**
 * 应用待生效配置的响应
 */
export const ApplyPendingConfigResponseSchema = z.object({
  success: z.boolean(),
  appliedFields: z.array(z.string()),
});

export type ApplyPendingConfigResponse = z.infer<
  typeof ApplyPendingConfigResponseSchema
>;

// ============================================================================
// Container Stats Schema
// ============================================================================

export const ContainerStatsSchema = z.object({
  hostname: z.string(),
  name: z.string(),
  containerId: z.string().optional(),
  pid: z.number().nullable().optional(),
  uptimeSeconds: z.number().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  cpuPercent: z.number(),
  memoryUsage: z.number(),
  memoryLimit: z.number(),
  memoryPercent: z.number(),
  networkRxBytes: z.number(),
  networkTxBytes: z.number(),
  timestamp: z.string(),
});

export type ContainerStats = z.infer<typeof ContainerStatsSchema>;

// ============================================================================
// Admin Schemas
// ============================================================================

export const OrphanReportSchema = z.object({
  orphanedContainers: z.array(z.string()),
  orphanedWorkspaces: z.array(z.string()),
  orphanedSecrets: z.array(z.string()),
  total: z.number(),
});

export type OrphanReport = z.infer<typeof OrphanReportSchema>;

export const CleanupReportSchema = z.object({
  success: z.boolean(),
  containersRemoved: z.number(),
  workspacesRemoved: z.number(),
  secretsRemoved: z.number(),
});

export type CleanupReport = z.infer<typeof CleanupReportSchema>;

// ============================================================================
// Provider Key Schemas
// ============================================================================

// ProviderVendorSchema 和相关函数已从 provider.schema.ts 导入

export const ProviderKeySchema = z.object({
  id: z.string().uuid(),
  vendor: ProviderVendorSchema,
  apiType: ProviderApiTypeSchema.nullable(),
  label: z.string(),
  tag: z.string().nullable(),
  baseUrl: z.string().nullable(),
  createdAt: z.coerce.date(),
});

export type ProviderKey = z.infer<typeof ProviderKeySchema>;

/**
 * Schema for adding a new provider key.
 * baseUrl is optional - if not provided, the default for the vendor will be used.
 */
export const AddProviderKeyInputSchema = z.object({
  vendor: ProviderVendorSchema,
  apiType: ProviderApiTypeSchema.optional(),
  secret: z.string().min(1, 'API key is required'),
  label: z.string().min(1, 'Key name is required').max(255),
  tag: z.string().max(100).optional(),
  baseUrl: z
    .string()
    .url({ message: 'Must be a valid URL' })
    .optional()
    .transform((val) => (val?.trim() === '' ? undefined : val)),
});

export type AddProviderKeyInput = z.infer<typeof AddProviderKeyInputSchema>;

/**
 * Schema for provider key with resolved base URL.
 * This includes the effective base URL (custom or default).
 */
export const ProviderKeyWithEffectiveUrlSchema = ProviderKeySchema.extend({
  effectiveBaseUrl: z.string().url(),
});

export type ProviderKeyWithEffectiveUrl = z.infer<
  typeof ProviderKeyWithEffectiveUrlSchema
>;

export const ProviderKeyHealthSchema = z.object({
  status: z.string(),
  keyCount: z.number(),
  botCount: z.number(),
});

export type ProviderKeyHealth = z.infer<typeof ProviderKeyHealthSchema>;

// ============================================================================
// Provider Key Verify Schemas
// ============================================================================

/**
 * Schema for verifying a provider key.
 * Used to test if an API key is valid and get available models.
 */
export const VerifyProviderKeyInputSchema = z.object({
  vendor: ProviderVendorSchema,
  secret: z.string().min(1, 'API key is required'),
  baseUrl: z
    .string()
    .url({ message: 'Must be a valid URL' })
    .optional()
    .transform((val) => (val?.trim() === '' ? undefined : val)),
  /** API protocol type - overrides the default from PROVIDER_CONFIGS */
  apiType: ProviderApiTypeSchema.optional(),
});

export type VerifyProviderKeyInput = z.infer<
  typeof VerifyProviderKeyInputSchema
>;

/**
 * Model info returned from provider API
 */
export const ProviderModelSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  created: z.number().optional(),
  owned_by: z.string().optional(),
});

export type ProviderModel = z.infer<typeof ProviderModelSchema>;

/**
 * Response from verify endpoint
 */
export const VerifyProviderKeyResponseSchema = z.object({
  valid: z.boolean(),
  latency: z.number().optional(),
  models: z.array(ProviderModelSchema).optional(),
  error: z.string().optional(),
});

export type VerifyProviderKeyResponse = z.infer<
  typeof VerifyProviderKeyResponseSchema
>;

// ============================================================================
// Bot Provider Management Schemas
// ============================================================================

/**
 * Bot Provider 详情 Schema - 用于 API 响应
 */
export const BotProviderDetailSchema = z.object({
  id: z.string().uuid(),
  providerKeyId: z.string().uuid(),
  vendor: ProviderVendorSchema,
  apiType: ProviderApiTypeSchema.nullable(),
  label: z.string(),
  apiKeyMasked: z.string(),
  baseUrl: z.string().nullable(),
  isPrimary: z.boolean(),
  allowedModels: z.array(z.string()),
  primaryModel: z.string().nullable(),
  createdAt: z.coerce.date(),
});

export type BotProviderDetail = z.infer<typeof BotProviderDetailSchema>;

/**
 * 添加 Bot Provider 输入 Schema
 */
export const AddBotProviderInputSchema = z.object({
  keyId: z.string().uuid(),
  models: z.array(z.string()).min(1, 'At least one model is required'),
  primaryModel: z.string().optional(),
  isPrimary: z.boolean().optional().default(false),
});

export type AddBotProviderInput = z.infer<typeof AddBotProviderInputSchema>;

/**
 * 设置主模型输入 Schema
 */
export const SetPrimaryModelInputSchema = z.object({
  modelId: z.string(),
});

export type SetPrimaryModelInput = z.infer<typeof SetPrimaryModelInputSchema>;

// ============================================================================
// Bot Diagnostics Schemas
// ============================================================================

/**
 * 诊断检查类型
 */
export const DiagnosticCheckTypeSchema = z.enum([
  'provider_key',
  'model_access',
  'channel_tokens',
  'container',
  'network',
]);

export type DiagnosticCheckType = z.infer<typeof DiagnosticCheckTypeSchema>;

/**
 * 诊断状态
 */
export const DiagnosticStatusSchema = z.enum(['pass', 'warning', 'fail']);

export type DiagnosticStatus = z.infer<typeof DiagnosticStatusSchema>;

/**
 * 单个诊断检查结果
 */
export const DiagnosticCheckResultSchema = z.object({
  name: z.string(),
  status: DiagnosticStatusSchema,
  message: z.string(),
  latency: z.number().optional(),
});

export type DiagnosticCheckResult = z.infer<typeof DiagnosticCheckResultSchema>;

/**
 * 诊断请求输入 Schema
 */
export const BotDiagnoseInputSchema = z.object({
  checks: z.array(DiagnosticCheckTypeSchema).optional(),
});

export type BotDiagnoseInput = z.infer<typeof BotDiagnoseInputSchema>;

/**
 * 诊断响应 Schema
 */
export const BotDiagnoseResponseSchema = z.object({
  overall: z.enum(['healthy', 'warning', 'error']),
  checks: z.array(DiagnosticCheckResultSchema),
  recommendations: z.array(z.string()),
});

export type BotDiagnoseResponse = z.infer<typeof BotDiagnoseResponseSchema>;
