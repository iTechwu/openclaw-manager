import { z } from 'zod';
import { initContract } from '@ts-rest/core';
import {
  createApiResponse,
  PaginationQuerySchema,
  PaginatedResponseSchema,
} from '../base';
import { SkillTypeWithCountSchema, SkillItemSchema } from '../schemas/skill.schema';

const c = initContract();

/**
 * 同步结果 Schema
 */
export const SyncResultSchema = z.object({
  total: z.number(),
  added: z.number(),
  updated: z.number(),
  skipped: z.number(),
  errors: z.number(),
  syncedAt: z.date(),
});

export type SyncResult = z.infer<typeof SyncResultSchema>;

/**
 * 同步状态 Schema
 */
export const SyncStatusSchema = z.object({
  totalSkills: z.number(),
  systemSkills: z.number(),
  customSkills: z.number(),
  translatedSkills: z.number(),
  lastSyncedAt: z.date().nullable(),
  skillTypes: z.array(SkillTypeWithCountSchema),
});

export type SyncStatus = z.infer<typeof SyncStatusSchema>;

/**
 * 翻译结果 Schema
 */
export const TranslateResultSchema = z.object({
  total: z.number(),
  translated: z.number(),
  errors: z.number(),
});

export type TranslateResult = z.infer<typeof TranslateResultSchema>;

/**
 * 技能类型列表 Schema
 */
export const SkillTypeListSchema = z.object({
  skillTypes: z.array(SkillTypeWithCountSchema),
});

/**
 * 技能列表查询参数 Schema
 */
export const SkillSyncListQuerySchema = PaginationQuerySchema.extend({
  skillTypeId: z.string().uuid().optional(),
  isSystem: z
    .enum(['true', 'false', 'all'])
    .optional()
    .default('all')
    .transform((val) => {
      if (val === 'all') return undefined;
      return val === 'true';
    }),
  search: z.string().optional(),
});

export type SkillSyncListQuery = z.input<typeof SkillSyncListQuerySchema>;

/**
 * 技能列表响应 Schema
 */
export const SkillSyncListResponseSchema = PaginatedResponseSchema(
  SkillItemSchema,
);

export type SkillSyncListResponse = z.infer<typeof SkillSyncListResponseSchema>;

/**
 * Skill Sync Contract
 */
export const skillSyncContract = c.router(
  {
    /**
     * 触发全量同步
     */
    sync: {
      method: 'POST',
      path: '/sync',
      body: z.object({
        enableTranslation: z.boolean().optional().default(true),
      }),
      responses: {
        200: createApiResponse(SyncResultSchema),
      },
      summary: '触发 OpenClaw 技能全量同步',
      description:
        '从 GitHub 仓库同步所有 OpenClaw 技能到数据库，可选择是否启用翻译',
    },

    /**
     * 翻译未翻译的技能
     */
    translate: {
      method: 'POST',
      path: '/translate',
      body: z.object({}),
      responses: {
        200: createApiResponse(TranslateResultSchema),
      },
      summary: '翻译未翻译的技能',
      description: '对已同步但未翻译的技能进行中文翻译',
    },

    /**
     * 获取同步状态
     */
    status: {
      method: 'GET',
      path: '/status',
      responses: {
        200: createApiResponse(SyncStatusSchema),
      },
      summary: '获取同步状态',
      description:
        '获取 OpenClaw 技能同步状态，包括总数、最后同步时间和技能类型统计',
    },

    /**
     * 获取所有技能类型
     */
    skillTypes: {
      method: 'GET',
      path: '/skill-types',
      responses: {
        200: createApiResponse(SkillTypeListSchema),
      },
      summary: '获取所有技能类型',
      description: '获取所有技能类型及其技能数量',
    },

    /**
     * 获取技能列表（分页）
     */
    skills: {
      method: 'GET',
      path: '/skills',
      query: SkillSyncListQuerySchema,
      responses: {
        200: createApiResponse(SkillSyncListResponseSchema),
      },
      summary: '获取技能列表',
      description:
        '获取 OpenClaw 同步的技能列表，支持分页、按类型筛选、按系统/自定义筛选、搜索',
    },
  },
  {
    pathPrefix: '/skill-sync',
  },
);
