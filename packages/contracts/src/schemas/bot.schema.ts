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

export const BotSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  hostname: z.string(),
  aiProvider: z.string(),
  model: z.string(),
  channelType: z.string(),
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
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  containerStatus: ContainerStatusSchema.nullable().optional(),
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
// Container Stats Schema
// ============================================================================

export const ContainerStatsSchema = z.object({
  hostname: z.string(),
  name: z.string(),
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
