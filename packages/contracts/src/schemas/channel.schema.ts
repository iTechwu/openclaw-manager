import { z } from 'zod';

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

export type ChannelCredentialField = z.infer<typeof ChannelCredentialFieldSchema>;

// ============================================================================
// Channel Definition Schema
// ============================================================================

export const ChannelDefinitionSchema = z.object({
  id: z.string(),
  label: z.string(),
  icon: z.string(),
  popular: z.boolean(),
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
