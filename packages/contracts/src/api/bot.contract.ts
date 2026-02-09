import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  ApiResponseSchema,
  SuccessResponseSchema,
  withVersion,
  API_VERSION,
} from '../base';
import {
  BotSchema,
  CreateBotInputSchema,
  SimpleCreateBotInputSchema,
  ContainerStatsSchema,
  OrphanReportSchema,
  CleanupReportSchema,
  ProviderKeySchema,
  AddProviderKeyInputSchema,
  ProviderKeyHealthSchema,
  VerifyProviderKeyInputSchema,
  VerifyProviderKeyResponseSchema,
  BotProviderDetailSchema,
  AddBotProviderInputSchema,
  SetPrimaryModelInputSchema,
  BotDiagnoseInputSchema,
  BotDiagnoseResponseSchema,
} from '../schemas/bot.schema';

const c = initContract();

/**
 * Bot API Contract
 * Bot 管理相关的 API 契约定义
 */
export const botContract = c.router(
  {
    // ============================================================================
    // Bot CRUD
    // ============================================================================

    /**
     * GET /bot - 列出所有 bots
     */
    list: {
      method: 'GET',
      path: '',
      responses: {
        200: ApiResponseSchema(z.object({ bots: z.array(BotSchema) })),
      },
      summary: '列出所有 bots',
    },

    /**
     * GET /bot/:hostname - 获取单个 bot
     */
    getByHostname: {
      method: 'GET',
      path: '/:hostname',
      pathParams: z.object({ hostname: z.string() }),
      responses: {
        200: ApiResponseSchema(BotSchema),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '获取单个 bot',
    },

    /**
     * POST /bot - 创建 bot（完整版，保留兼容）
     */
    create: {
      method: 'POST',
      path: '',
      body: CreateBotInputSchema,
      responses: {
        201: ApiResponseSchema(BotSchema),
        400: ApiResponseSchema(z.object({ error: z.string() })),
        409: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '创建 bot（完整版）',
    },

    /**
     * POST /bot/simple - 简化创建 bot
     * 只需要基本信息和人设，Provider 和 Channel 在创建后配置
     */
    createSimple: {
      method: 'POST',
      path: '/simple',
      body: SimpleCreateBotInputSchema,
      responses: {
        201: ApiResponseSchema(BotSchema),
        400: ApiResponseSchema(z.object({ error: z.string() })),
        409: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '简化创建 bot',
    },

    /**
     * DELETE /bot/:hostname - 删除 bot
     */
    delete: {
      method: 'DELETE',
      path: '/:hostname',
      pathParams: z.object({ hostname: z.string() }),
      body: z.object({}).optional(),
      responses: {
        200: ApiResponseSchema(SuccessResponseSchema),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '删除 bot',
    },

    // ============================================================================
    // Bot Lifecycle
    // ============================================================================

    /**
     * POST /bot/:hostname/start - 启动 bot
     */
    start: {
      method: 'POST',
      path: '/:hostname/start',
      pathParams: z.object({ hostname: z.string() }),
      body: z.object({}).optional(),
      responses: {
        200: ApiResponseSchema(
          z.object({ success: z.boolean(), status: z.string() }),
        ),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '启动 bot',
    },

    /**
     * POST /bot/:hostname/stop - 停止 bot
     */
    stop: {
      method: 'POST',
      path: '/:hostname/stop',
      pathParams: z.object({ hostname: z.string() }),
      body: z.object({}).optional(),
      responses: {
        200: ApiResponseSchema(
          z.object({ success: z.boolean(), status: z.string() }),
        ),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '停止 bot',
    },

    // ============================================================================
    // Diagnostics
    // ============================================================================

    /**
     * GET /bot/stats - 获取容器统计
     */
    getStats: {
      method: 'GET',
      path: '/stats',
      responses: {
        200: ApiResponseSchema(
          z.object({ stats: z.array(ContainerStatsSchema) }),
        ),
      },
      summary: '获取容器统计',
    },

    /**
     * GET /bot/admin/orphans - 获取孤立资源
     */
    getOrphans: {
      method: 'GET',
      path: '/admin/orphans',
      responses: {
        200: ApiResponseSchema(OrphanReportSchema),
      },
      summary: '获取孤立资源',
    },

    /**
     * POST /bot/admin/cleanup - 清理孤立资源
     */
    cleanup: {
      method: 'POST',
      path: '/admin/cleanup',
      body: z.object({}).optional(),
      responses: {
        200: ApiResponseSchema(CleanupReportSchema),
      },
      summary: '清理孤立资源',
    },

    // ============================================================================
    // Bot Provider Management
    // ============================================================================

    /**
     * GET /bot/:hostname/providers - 获取 Bot 的 Provider 列表
     */
    getProviders: {
      method: 'GET',
      path: '/:hostname/providers',
      pathParams: z.object({ hostname: z.string() }),
      responses: {
        200: ApiResponseSchema(
          z.object({ providers: z.array(BotProviderDetailSchema) }),
        ),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '获取 Bot 的 Provider 列表',
    },

    /**
     * POST /bot/:hostname/providers - 添加 Provider 到 Bot
     */
    addProvider: {
      method: 'POST',
      path: '/:hostname/providers',
      pathParams: z.object({ hostname: z.string() }),
      body: AddBotProviderInputSchema,
      responses: {
        201: ApiResponseSchema(BotProviderDetailSchema),
        400: ApiResponseSchema(z.object({ error: z.string() })),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '添加 Provider 到 Bot',
    },

    /**
     * DELETE /bot/:hostname/providers/:keyId - 从 Bot 移除 Provider
     */
    removeProvider: {
      method: 'DELETE',
      path: '/:hostname/providers/:keyId',
      pathParams: z.object({
        hostname: z.string(),
        keyId: z.string().uuid(),
      }),
      body: z.object({}).optional(),
      responses: {
        200: ApiResponseSchema(z.object({ ok: z.boolean() })),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '从 Bot 移除 Provider',
    },

    /**
     * PUT /bot/:hostname/providers/:keyId/primary-model - 设置主模型
     */
    setPrimaryModel: {
      method: 'PUT',
      path: '/:hostname/providers/:keyId/primary-model',
      pathParams: z.object({
        hostname: z.string(),
        keyId: z.string().uuid(),
      }),
      body: SetPrimaryModelInputSchema,
      responses: {
        200: ApiResponseSchema(z.object({ ok: z.boolean() })),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '设置主模型',
    },

    // ============================================================================
    // Bot Diagnostics
    // ============================================================================

    /**
     * POST /bot/:hostname/diagnose - 运行 Bot 诊断
     */
    diagnose: {
      method: 'POST',
      path: '/:hostname/diagnose',
      pathParams: z.object({ hostname: z.string() }),
      body: BotDiagnoseInputSchema,
      responses: {
        200: ApiResponseSchema(BotDiagnoseResponseSchema),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '运行 Bot 诊断',
    },

    // ============================================================================
    // Bot Logs
    // ============================================================================

    /**
     * GET /bot/:hostname/logs - 获取 Bot 容器日志
     */
    getLogs: {
      method: 'GET',
      path: '/:hostname/logs',
      pathParams: z.object({ hostname: z.string() }),
      query: z.object({
        tail: z.coerce.number().positive().optional().default(100),
        since: z.coerce.number().optional(),
      }),
      responses: {
        200: ApiResponseSchema(
          z.object({
            logs: z.array(
              z.object({
                id: z.string(),
                timestamp: z.string(),
                level: z.enum(['info', 'warn', 'error', 'debug']),
                message: z.string(),
              }),
            ),
            containerId: z.string().nullable(),
          }),
        ),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '获取 Bot 容器日志',
    },
  },
  {
    pathPrefix: '/bot',
  },
);

/**
 * Provider Key API Contract
 * API 密钥管理相关的 API 契约定义
 */
export const providerKeyContract = c.router(
  {
    /**
     * GET /provider-key - 列出所有 API keys
     */
    list: {
      method: 'GET',
      path: '',
      responses: {
        200: ApiResponseSchema(z.object({ keys: z.array(ProviderKeySchema) })),
      },
      summary: '列出所有 API keys',
    },

    /**
     * POST /provider-key - 添加 API key
     */
    add: {
      method: 'POST',
      path: '',
      body: AddProviderKeyInputSchema,
      responses: {
        201: ApiResponseSchema(z.object({ id: z.string().uuid() })),
        400: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '添加 API key',
    },

    /**
     * DELETE /provider-key/:id - 删除 API key
     */
    delete: {
      method: 'DELETE',
      path: '/:id',
      pathParams: z.object({ id: z.string().uuid() }),
      body: z.object({}).optional(),
      responses: {
        200: ApiResponseSchema(z.object({ ok: z.boolean() })),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '删除 API key',
    },

    /**
     * GET /provider-key/health - 健康检查
     */
    health: {
      method: 'GET',
      path: '/health',
      responses: {
        200: ApiResponseSchema(ProviderKeyHealthSchema),
      },
      summary: '健康检查',
    },

    /**
     * POST /provider-key/verify - 验证 API key 并获取模型列表
     */
    verify: {
      method: 'POST',
      path: '/verify',
      body: VerifyProviderKeyInputSchema,
      responses: {
        200: ApiResponseSchema(VerifyProviderKeyResponseSchema),
      },
      summary: '验证 API key 并获取模型列表',
    },

    /**
     * GET /provider-key/:id/models - 获取已存储 API key 的模型列表
     */
    getModels: {
      method: 'GET',
      path: '/:id/models',
      pathParams: z.object({ id: z.string().uuid() }),
      responses: {
        200: ApiResponseSchema(VerifyProviderKeyResponseSchema),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '获取已存储 API key 的模型列表',
    },
  },
  {
    pathPrefix: '/provider-key',
  },
);

/**
 * 带版本元数据的 Bot Contract
 */
export const botContractVersioned = withVersion(botContract, {
  version: API_VERSION.V1,
  pathPrefix: '/bot',
});

/**
 * 带版本元数据的 Provider Key Contract
 */
export const providerKeyContractVersioned = withVersion(providerKeyContract, {
  version: API_VERSION.V1,
  pathPrefix: '/provider-key',
});

export type BotContract = typeof botContract;
export type ProviderKeyContract = typeof providerKeyContract;
