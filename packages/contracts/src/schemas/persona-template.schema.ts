import { z } from 'zod';

// ============================================================================
// Persona Template Schemas
// ============================================================================

/**
 * PersonaTemplate - 人格模板
 * 支持系统预设模板和用户自定义模板
 * 图标支持两种形式（二选一）：
 * - emoji: emoji 字符串（如 "🤖"）
 * - avatarFileId: 上传的头像文件 ID（关联 FileSource）
 * - avatarUrl: 当 avatarFileId 存在时，后端生成的头像下载链接
 */
export const PersonaTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  emoji: z.string().nullable(),
  avatarFileId: z.string().uuid().nullable(),
  avatarUrl: z.string().nullable(),
  tagline: z.string(),
  soulMarkdown: z.string(),
  soulPreview: z.string().nullable(),
  locale: z.string(),
  isSystem: z.boolean(),
  createdById: z.string().uuid().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type PersonaTemplate = z.infer<typeof PersonaTemplateSchema>;

/**
 * CreatePersonaTemplateInput - 创建用户模板输入
 * 图标必须提供（二选一）：emoji 字符串 或 上传的头像文件 ID
 */
export const CreatePersonaTemplateInputSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(255),
    emoji: z.string().max(10).optional(),
    avatarFileId: z.string().uuid().optional(),
    tagline: z.string().min(1, 'Tagline is required').max(500),
    soulMarkdown: z.string().min(1, 'Soul markdown is required'),
    soulPreview: z.string().max(500).optional(),
  })
  .refine((data) => data.emoji || data.avatarFileId, {
    message: 'Icon is required: provide either emoji or avatarFileId',
    path: ['emoji'],
  });

export type CreatePersonaTemplateInput = z.infer<
  typeof CreatePersonaTemplateInputSchema
>;

/**
 * UpdatePersonaTemplateInput - 更新用户模板输入（部分字段）
 * 更新时图标字段（emoji/avatarFileId）可以都不传（保持原值）
 * 如需更换图标类型，设置新值并将另一个设为 null
 */
export const UpdatePersonaTemplateInputSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  emoji: z.string().max(10).nullish(),
  avatarFileId: z.string().uuid().nullish(),
  tagline: z.string().min(1).max(500).optional(),
  soulMarkdown: z.string().min(1).optional(),
  soulPreview: z.string().max(500).nullish(),
});

export type UpdatePersonaTemplateInput = z.infer<
  typeof UpdatePersonaTemplateInputSchema
>;

/**
 * DuplicatePersonaTemplateInput - 复制模板输入
 */
export const DuplicatePersonaTemplateInputSchema = z.object({
  sourceTemplateId: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
});

export type DuplicatePersonaTemplateInput = z.infer<
  typeof DuplicatePersonaTemplateInputSchema
>;

/**
 * PersonaTemplateListResponse - 模板列表响应
 */
export const PersonaTemplateListResponseSchema = z.object({
  templates: z.array(PersonaTemplateSchema),
  systemCount: z.number(),
  userCount: z.number(),
});

export type PersonaTemplateListResponse = z.infer<
  typeof PersonaTemplateListResponseSchema
>;

/**
 * PersonaTemplateListQuery - 模板列表查询参数
 */
export const PersonaTemplateListQuerySchema = z.object({
  locale: z.string().optional(),
});

export type PersonaTemplateListQuery = z.infer<
  typeof PersonaTemplateListQuerySchema
>;
