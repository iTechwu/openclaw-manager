import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { createApiResponse } from '../base';
import {
  SkillItemSchema,
  SkillListQuerySchema,
  SkillListResponseSchema,
  BotSkillItemSchema,
  CreateSkillRequestSchema,
  UpdateSkillRequestSchema,
  InstallSkillRequestSchema,
  UpdateBotSkillRequestSchema,
  BatchInstallSkillRequestSchema,
  BatchInstallResultSchema,
  ContainerSkillsResponseSchema,
  UpdateBotSkillVersionResponseSchema,
  CheckSkillUpdatesResponseSchema,
  InstallSkillFromFilesRequestSchema,
} from '../schemas/skill.schema';

const c = initContract();

/**
 * 技能 API 契约
 */
export const skillContract = c.router(
  {
    /**
     * 获取技能列表
     */
    list: {
      method: 'GET',
      path: '/skills',
      query: SkillListQuerySchema,
      responses: {
        200: createApiResponse(SkillListResponseSchema),
      },
      summary: '获取技能列表',
      description: '获取所有可用技能，支持类型筛选和搜索',
    },

    /**
     * 获取技能详情
     */
    getById: {
      method: 'GET',
      path: '/skills/:skillId',
      pathParams: z.object({ skillId: z.string().uuid() }),
      responses: {
        200: createApiResponse(SkillItemSchema),
      },
      summary: '获取技能详情',
      description: '获取指定技能的详细信息',
    },

    /**
     * 创建技能
     */
    create: {
      method: 'POST',
      path: '/skills',
      body: CreateSkillRequestSchema,
      responses: {
        200: createApiResponse(SkillItemSchema),
      },
      summary: '创建技能',
      description: '创建新的自定义技能',
    },

    /**
     * 更新技能
     */
    update: {
      method: 'PUT',
      path: '/skills/:skillId',
      pathParams: z.object({ skillId: z.string().uuid() }),
      body: UpdateSkillRequestSchema,
      responses: {
        200: createApiResponse(SkillItemSchema),
      },
      summary: '更新技能',
      description: '更新技能信息',
    },

    /**
     * 删除技能
     */
    delete: {
      method: 'DELETE',
      path: '/skills/:skillId',
      pathParams: z.object({ skillId: z.string().uuid() }),
      body: z.object({}),
      responses: {
        200: createApiResponse(z.object({ success: z.boolean() })),
      },
      summary: '删除技能',
      description: '删除自定义技能',
    },
  },
  { pathPrefix: '' },
);

/**
 * Bot 技能管理 API 契约
 */
export const botSkillContract = c.router(
  {
    /**
     * 获取 Bot 已安装的技能列表
     */
    list: {
      method: 'GET',
      path: '/:hostname/skills',
      pathParams: z.object({ hostname: z.string() }),
      responses: {
        200: createApiResponse(z.array(BotSkillItemSchema)),
      },
      summary: '获取 Bot 技能列表',
      description: '获取指定 Bot 已安装的所有技能',
    },

    /**
     * 获取容器内置技能列表
     */
    containerSkills: {
      method: 'GET',
      path: '/:hostname/skills/container',
      pathParams: z.object({ hostname: z.string() }),
      responses: {
        200: createApiResponse(ContainerSkillsResponseSchema),
      },
      summary: '获取容器内置技能',
      description: '获取 Docker 容器中自动安装的内置技能列表',
    },

    /**
     * 安装技能到 Bot
     */
    install: {
      method: 'POST',
      path: '/:hostname/skills',
      pathParams: z.object({ hostname: z.string() }),
      body: InstallSkillRequestSchema,
      responses: {
        200: createApiResponse(BotSkillItemSchema),
        409: createApiResponse(z.null()),
      },
      summary: '安装技能',
      description: '为指定 Bot 安装技能',
    },

    /**
     * 批量安装技能到 Bot
     */
    batchInstall: {
      method: 'POST',
      path: '/:hostname/skills/batch',
      pathParams: z.object({ hostname: z.string() }),
      body: BatchInstallSkillRequestSchema,
      responses: {
        200: createApiResponse(BatchInstallResultSchema),
      },
      summary: '批量安装技能',
      description: '为指定 Bot 批量安装多个技能',
    },

    /**
     * 更新 Bot 技能配置
     */
    updateConfig: {
      method: 'PUT',
      path: '/:hostname/skills/:skillId',
      pathParams: z.object({
        hostname: z.string(),
        skillId: z.string().uuid(),
      }),
      body: UpdateBotSkillRequestSchema,
      responses: {
        200: createApiResponse(BotSkillItemSchema),
      },
      summary: '更新技能配置',
      description: '更新 Bot 已安装技能的配置',
    },

    /**
     * 更新已安装技能到最新版本
     */
    updateVersion: {
      method: 'POST',
      path: '/:hostname/skills/:skillId/update',
      pathParams: z.object({
        hostname: z.string(),
        skillId: z.string().uuid(),
      }),
      body: z.object({}),
      responses: {
        200: createApiResponse(UpdateBotSkillVersionResponseSchema),
      },
      summary: '更新技能版本',
      description: '从 GitHub 重新拉取技能内容并更新到最新版本',
    },

    /**
     * 批量检查已安装技能的更新
     */
    checkUpdates: {
      method: 'POST',
      path: '/:hostname/skills/check-updates',
      pathParams: z.object({ hostname: z.string() }),
      body: z.object({}),
      responses: {
        200: createApiResponse(CheckSkillUpdatesResponseSchema),
      },
      summary: '批量检查技能更新',
      description: '检查所有已安装的 OpenClaw 技能是否有新版本',
    },

    /**
     * 从文件安装 Skill（离线安装 / 私有 skills）
     */
    installFromFiles: {
      method: 'POST',
      path: '/:hostname/skills/install-from-files',
      pathParams: z.object({ hostname: z.string() }),
      body: InstallSkillFromFilesRequestSchema,
      responses: {
        200: createApiResponse(BotSkillItemSchema),
        400: createApiResponse(z.null()),
        409: createApiResponse(z.null()),
      },
      summary: '从文件安装技能',
      description: '直接上传 skill 文件安装到 Bot，支持离线安装和私有 skills',
    },

    /**
     * 卸载 Bot 技能
     */
    uninstall: {
      method: 'DELETE',
      path: '/:hostname/skills/:skillId',
      pathParams: z.object({
        hostname: z.string(),
        skillId: z.string().uuid(),
      }),
      body: z.object({}),
      responses: {
        200: createApiResponse(z.object({ success: z.boolean() })),
      },
      summary: '卸载技能',
      description: '从 Bot 卸载指定技能',
    },
  },
  { pathPrefix: '/bot' },
);

export type SkillContract = typeof skillContract;
export type BotSkillContract = typeof botSkillContract;
