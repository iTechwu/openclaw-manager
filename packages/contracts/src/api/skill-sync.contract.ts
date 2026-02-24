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
  // 处理 ts-rest jsonQuery: true 导致的 JSON 序列化
  // 前端传入 'true' → JSON序列化为 "true" → URL编码为 %22true%22
  // 需要先 JSON.parse 再处理
  isSystem: z.preprocess(
    (val) => {
      if (val === undefined || val === null) return undefined;
      // 如果是布尔值，直接返回
      if (typeof val === 'boolean') return val;
      // 尝试 JSON 解析（处理 JSON 序列化的字符串）
      if (typeof val === 'string') {
        try {
          const parsed = JSON.parse(val);
          // 如果解析结果是布尔值，返回
          if (typeof parsed === 'boolean') return parsed;
          // 如果解析结果是字符串 'true' 或 'false'，返回对应的布尔值
          if (parsed === 'true') return true;
          if (parsed === 'false') return false;
          // 如果不是上述情况，直接处理原始字符串
        } catch {
          // JSON 解析失败，直接处理原始字符串
        }
        // 直接处理原始字符串
        if (val === 'true') return true;
        if (val === 'false') return false;
      }
      return undefined;
    },
    z.boolean().optional(),
  ),
  search: z.string().optional(),
});

// 使用 z.output 获取转换后的类型（isSystem 为 boolean | undefined）
export type SkillSyncListQuery = z.output<typeof SkillSyncListQuerySchema>;

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
