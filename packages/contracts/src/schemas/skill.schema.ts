import { z } from 'zod';
import { PaginationQuerySchema, PaginatedResponseSchema } from '../base';

/**
 * 技能类型/分类 Schema
 * 用于对技能进行分类管理
 */
export const SkillTypeItemSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  nameZh: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  descriptionZh: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  sortOrder: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type SkillTypeItem = z.infer<typeof SkillTypeItemSchema>;

/**
 * 技能类型（带技能数量）Schema
 */
export const SkillTypeWithCountSchema = SkillTypeItemSchema.extend({
  _count: z.object({
    skills: z.number(),
  }),
});

export type SkillTypeWithCount = z.infer<typeof SkillTypeWithCountSchema>;

/**
 * 工具定义 Schema
 */
export const ToolDefinitionSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
  handler: z.string().optional(), // JavaScript/TypeScript code or reference
});

/**
 * 提示词模板定义 Schema
 */
export const PromptDefinitionSchema = z.object({
  template: z.string().min(1),
  variables: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        required: z.boolean().optional(),
        defaultValue: z.string().optional(),
      }),
    )
    .optional(),
});

/**
 * 工作流步骤 Schema
 */
export const WorkflowStepSchema = z.object({
  id: z.string(),
  type: z.enum(['tool', 'prompt', 'condition', 'loop']),
  config: z.record(z.string(), z.unknown()),
  next: z.string().nullable().optional(),
});

/**
 * 工作流定义 Schema
 */
export const WorkflowDefinitionSchema = z.object({
  steps: z.array(WorkflowStepSchema),
  triggers: z.array(z.string()).optional(),
  entryPoint: z.string().optional(),
});

/**
 * 技能定义 Schema (联合类型)
 */
export const SkillDefinitionSchema = z.union([
  ToolDefinitionSchema,
  PromptDefinitionSchema,
  WorkflowDefinitionSchema,
]);

export type SkillDefinition = z.infer<typeof SkillDefinitionSchema>;

/**
 * 技能示例 Schema
 */
export const SkillExampleSchema = z.object({
  input: z.string(),
  output: z.string(),
  description: z.string().optional(),
});

/**
 * 技能基础信息 Schema
 */
export const SkillItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  nameZh: z.string().nullable().optional(),
  slug: z.string(),
  description: z.string().nullable(),
  descriptionZh: z.string().nullable().optional(),
  version: z.string(),
  latestVersion: z.string().nullable().optional(),
  skillTypeId: z.string().uuid().nullable().optional(),
  skillType: SkillTypeItemSchema.nullable().optional(),
  definition: z.record(z.string(), z.unknown()),
  examples: z.array(SkillExampleSchema).nullable(),
  isSystem: z.boolean(),
  isEnabled: z.boolean(),
  createdById: z.string().uuid().nullable(),
  // 外部来源字段
  source: z.string().nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
  author: z.string().nullable().optional(),
  lastSyncedAt: z.date().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type SkillItem = z.infer<typeof SkillItemSchema>;

/**
 * 技能列表查询参数
 */
export const SkillListQuerySchema = PaginationQuerySchema.extend({
  skillTypeId: z.string().uuid().optional(),
  isSystem: z.coerce.boolean().optional(),
  search: z.string().optional(),
  source: z.string().optional(),
});

export type SkillListQuery = z.infer<typeof SkillListQuerySchema>;

/**
 * 技能列表响应
 */
export const SkillListResponseSchema = PaginatedResponseSchema(SkillItemSchema);

export type SkillListResponse = z.infer<typeof SkillListResponseSchema>;

/**
 * 创建技能请求 Schema
 */
export const CreateSkillRequestSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  version: z.string().min(1).max(20).optional().default('1.0.0'),
  skillTypeId: z.string().uuid().optional(),
  definition: z.record(z.string(), z.unknown()),
  examples: z.array(SkillExampleSchema).optional(),
});

export type CreateSkillRequest = z.infer<typeof CreateSkillRequestSchema>;

/**
 * 更新技能请求 Schema
 */
export const UpdateSkillRequestSchema = CreateSkillRequestSchema.partial();

export type UpdateSkillRequest = z.infer<typeof UpdateSkillRequestSchema>;

/**
 * Bot 技能安装信息 Schema
 */
export const BotSkillItemSchema = z.object({
  id: z.string().uuid(),
  botId: z.string().uuid(),
  skillId: z.string().uuid(),
  config: z.record(z.string(), z.unknown()).nullable(),
  isEnabled: z.boolean(),
  installedVersion: z.string().nullable().optional(),
  updateAvailable: z.boolean().optional(),
  fileCount: z.number().nullable().optional(),
  scriptExecuted: z.boolean().optional(),
  hasReferences: z.boolean().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  skill: SkillItemSchema,
});

export type BotSkillItem = z.infer<typeof BotSkillItemSchema>;

/**
 * 安装技能请求 Schema
 */
export const InstallSkillRequestSchema = z.object({
  skillId: z.string().uuid(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export type InstallSkillRequest = z.infer<typeof InstallSkillRequestSchema>;

/**
 * 更新 Bot 技能配置请求 Schema
 */
export const UpdateBotSkillRequestSchema = z.object({
  config: z.record(z.string(), z.unknown()).optional(),
  isEnabled: z.boolean().optional(),
});

export type UpdateBotSkillRequest = z.infer<typeof UpdateBotSkillRequestSchema>;

/**
 * 批量安装技能请求 Schema
 */
export const BatchInstallSkillRequestSchema = z.object({
  skillIds: z.array(z.string().uuid()).min(1).max(20),
});

export type BatchInstallSkillRequest = z.infer<
  typeof BatchInstallSkillRequestSchema
>;

/**
 * 批量安装技能响应 Schema
 */
export const BatchInstallResultSchema = z.object({
  installed: z.number(),
  skipped: z.number(),
  failed: z.number(),
});

export type BatchInstallResult = z.infer<typeof BatchInstallResultSchema>;

/**
 * 容器内置技能项 Schema（Docker 自动安装的技能）
 */
export const ContainerSkillItemSchema = z.object({
  name: z.string(),
  enabled: z.boolean(),
  description: z.string().nullable().optional(),
  version: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
});

export type ContainerSkillItem = z.infer<typeof ContainerSkillItemSchema>;

/**
 * 容器内置技能响应 Schema
 */
export const ContainerSkillsResponseSchema = z.object({
  skills: z.array(ContainerSkillItemSchema),
  source: z.enum(['docker', 'cache', 'none']),
  fetchedAt: z.string().nullable(),
});

export type ContainerSkillsResponse = z.infer<
  typeof ContainerSkillsResponseSchema
>;

/**
 * 更新技能版本响应 Schema
 */
export const UpdateBotSkillVersionResponseSchema = z.object({
  botSkill: BotSkillItemSchema,
  previousVersion: z.string().nullable(),
  newVersion: z.string(),
});

export type UpdateBotSkillVersionResponse = z.infer<
  typeof UpdateBotSkillVersionResponseSchema
>;

/**
 * 技能更新检查项 Schema
 */
export const SkillUpdateCheckItemSchema = z.object({
  skillId: z.string().uuid(),
  skillName: z.string(),
  currentVersion: z.string().nullable(),
  latestVersion: z.string(),
  updateAvailable: z.boolean(),
});

export type SkillUpdateCheckItem = z.infer<typeof SkillUpdateCheckItemSchema>;

/**
 * 批量检查更新响应 Schema
 */
export const CheckSkillUpdatesResponseSchema = z.object({
  updates: z.array(SkillUpdateCheckItemSchema),
  checkedCount: z.number(),
  updatesAvailable: z.number(),
});

export type CheckSkillUpdatesResponse = z.infer<
  typeof CheckSkillUpdatesResponseSchema
>;

/**
 * Skill 文件项 Schema
 */
export const SkillFileItemSchema = z.object({
  relativePath: z.string().max(255),
  content: z.string().max(1024 * 1024), // 1MB 单文件限制
});

export type SkillFileItem = z.infer<typeof SkillFileItemSchema>;

/**
 * 从文件安装 Skill 请求 Schema（离线安装 / 私有 skills）
 */
export const InstallSkillFromFilesRequestSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
  version: z.string().max(20).optional(),
  files: z.array(SkillFileItemSchema).min(1).max(50),
});

export type InstallSkillFromFilesRequest = z.infer<
  typeof InstallSkillFromFilesRequestSchema
>;
