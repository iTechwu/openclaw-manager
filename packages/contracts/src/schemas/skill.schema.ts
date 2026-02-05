import { z } from 'zod';
import { PaginationQuerySchema, PaginatedResponseSchema } from '../base';

/**
 * 技能类型 Schema
 * tool: 工具调用
 * prompt: 提示词模板
 * workflow: 工作流
 */
export const SkillTypeSchema = z.enum(['tool', 'prompt', 'workflow']);
export type SkillType = z.infer<typeof SkillTypeSchema>;

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
  variables: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      required: z.boolean().optional(),
      defaultValue: z.string().optional(),
    }),
  ).optional(),
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
  slug: z.string(),
  description: z.string().nullable(),
  version: z.string(),
  skillType: SkillTypeSchema,
  definition: z.record(z.string(), z.unknown()),
  examples: z.array(SkillExampleSchema).nullable(),
  isSystem: z.boolean(),
  isEnabled: z.boolean(),
  createdById: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type SkillItem = z.infer<typeof SkillItemSchema>;

/**
 * 技能列表查询参数
 */
export const SkillListQuerySchema = PaginationQuerySchema.extend({
  skillType: SkillTypeSchema.optional(),
  isSystem: z.coerce.boolean().optional(),
  search: z.string().optional(),
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
  skillType: SkillTypeSchema,
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
