import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { ApiResponseSchema, withVersion, API_VERSION } from '../base';
import {
  BotModelRoutingSchema,
  CreateRoutingConfigInputSchema,
  UpdateRoutingConfigInputSchema,
  RoutingTestInputSchema,
  RoutingTestResultSchema,
  RoutingStatisticsSchema,
  RoutingSuggestionResultSchema,
} from '../schemas/model-routing.schema';

const c = initContract();

/**
 * Model Routing API Contract
 * 模型路由配置相关的 API 契约定义
 */
export const modelRoutingContract = c.router(
  {
    // ============================================================================
    // Routing Config CRUD
    // ============================================================================

    /**
     * GET /bot/:hostname/routing - 获取 Bot 的所有路由配置
     */
    list: {
      method: 'GET',
      path: '/:hostname/routing',
      pathParams: z.object({ hostname: z.string() }),
      responses: {
        200: ApiResponseSchema(
          z.object({
            routings: z.array(BotModelRoutingSchema),
          }),
        ),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '获取 Bot 的所有路由配置',
    },

    /**
     * GET /bot/:hostname/routing/:routingId - 获取单个路由配置
     */
    get: {
      method: 'GET',
      path: '/:hostname/routing/:routingId',
      pathParams: z.object({
        hostname: z.string(),
        routingId: z.string().uuid(),
      }),
      responses: {
        200: ApiResponseSchema(BotModelRoutingSchema),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '获取单个路由配置',
    },

    /**
     * POST /bot/:hostname/routing - 创建路由配置
     */
    create: {
      method: 'POST',
      path: '/:hostname/routing',
      pathParams: z.object({ hostname: z.string() }),
      body: CreateRoutingConfigInputSchema,
      responses: {
        201: ApiResponseSchema(BotModelRoutingSchema),
        400: ApiResponseSchema(z.object({ error: z.string() })),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '创建路由配置',
    },

    /**
     * PATCH /bot/:hostname/routing/:routingId - 更新路由配置
     */
    update: {
      method: 'PATCH',
      path: '/:hostname/routing/:routingId',
      pathParams: z.object({
        hostname: z.string(),
        routingId: z.string().uuid(),
      }),
      body: UpdateRoutingConfigInputSchema,
      responses: {
        200: ApiResponseSchema(BotModelRoutingSchema),
        400: ApiResponseSchema(z.object({ error: z.string() })),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '更新路由配置',
    },

    /**
     * DELETE /bot/:hostname/routing/:routingId - 删除路由配置
     */
    delete: {
      method: 'DELETE',
      path: '/:hostname/routing/:routingId',
      pathParams: z.object({
        hostname: z.string(),
        routingId: z.string().uuid(),
      }),
      responses: {
        200: ApiResponseSchema(z.object({ ok: z.boolean() })),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '删除路由配置',
    },

    // ============================================================================
    // Routing Test & Statistics
    // ============================================================================

    /**
     * POST /bot/:hostname/routing/test - 测试路由配置
     * 模拟请求，返回会选择哪个模型
     */
    test: {
      method: 'POST',
      path: '/:hostname/routing/test',
      pathParams: z.object({ hostname: z.string() }),
      body: RoutingTestInputSchema,
      responses: {
        200: ApiResponseSchema(RoutingTestResultSchema),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '测试路由配置',
    },

    /**
     * GET /bot/:hostname/routing/:routingId/stats - 获取路由统计信息
     */
    getStats: {
      method: 'GET',
      path: '/:hostname/routing/:routingId/stats',
      pathParams: z.object({
        hostname: z.string(),
        routingId: z.string().uuid(),
      }),
      responses: {
        200: ApiResponseSchema(RoutingStatisticsSchema),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '获取路由统计信息',
    },

    // ============================================================================
    // Routing Enable/Disable
    // ============================================================================

    /**
     * POST /bot/:hostname/routing/:routingId/enable - 启用路由配置
     */
    enable: {
      method: 'POST',
      path: '/:hostname/routing/:routingId/enable',
      pathParams: z.object({
        hostname: z.string(),
        routingId: z.string().uuid(),
      }),
      body: z.object({}),
      responses: {
        200: ApiResponseSchema(BotModelRoutingSchema),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '启用路由配置',
    },

    /**
     * POST /bot/:hostname/routing/:routingId/disable - 禁用路由配置
     */
    disable: {
      method: 'POST',
      path: '/:hostname/routing/:routingId/disable',
      pathParams: z.object({
        hostname: z.string(),
        routingId: z.string().uuid(),
      }),
      body: z.object({}),
      responses: {
        200: ApiResponseSchema(BotModelRoutingSchema),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '禁用路由配置',
    },

    // ============================================================================
    // Routing Suggestions (AI-powered)
    // ============================================================================

    /**
     * GET /bot/:hostname/routing/suggest - 获取 AI 推荐的路由配置
     * 根据 Bot 的 allowed_models 分析并生成推荐的路由规则
     */
    suggest: {
      method: 'GET',
      path: '/:hostname/routing/suggest',
      pathParams: z.object({ hostname: z.string() }),
      responses: {
        200: ApiResponseSchema(RoutingSuggestionResultSchema),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '获取 AI 推荐的路由配置',
    },
  },
  {
    pathPrefix: '/bot',
  },
);

/**
 * 带版本元数据的 Model Routing Contract
 */
export const modelRoutingContractVersioned = withVersion(modelRoutingContract, {
  version: API_VERSION.V1,
  pathPrefix: '/bot',
});

export type ModelRoutingContract = typeof modelRoutingContract;
