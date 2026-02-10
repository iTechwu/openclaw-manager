import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  ApiResponseSchema,
  SuccessResponseSchema,
  withVersion,
  API_VERSION,
} from '../base';
import {
  AvailableModelsResponseSchema,
  BotModelsResponseSchema,
  UpdateBotModelsInputSchema,
  RefreshModelsInputSchema,
  RefreshModelsResponseSchema,
  VerifySingleModelInputSchema,
  VerifySingleModelResponseSchema,
} from '../schemas/model.schema';

const c = initContract();

/**
 * Model API Contract
 * 模型管理相关的 API 契约定义
 *
 * 设计原则：
 * - 普通用户只看到"可用模型列表"，无需了解 Provider 概念
 * - Admin 用户可以管理 API 密钥、查看 Provider 详情
 * - Bot 模型绑定：新建 Bot 默认绑定所有可用模型，用户可自定义
 */
export const modelContract = c.router(
  {
    // ============================================================================
    // 可用模型列表 (所有用户)
    // ============================================================================

    /**
     * GET /model - 获取所有可用模型列表
     * 返回系统中所有可用的模型，包括可用性状态
     */
    list: {
      method: 'GET',
      path: '',
      responses: {
        200: ApiResponseSchema(AvailableModelsResponseSchema),
      },
      summary: '获取所有可用模型列表',
    },

    /**
     * POST /model/verify - 手动触发模型可用性验证
     * 验证所有 Provider Key 的模型可用性
     * 仅限管理员访问
     */
    verify: {
      method: 'POST',
      path: '/verify',
      body: z.object({}).optional(),
      responses: {
        200: ApiResponseSchema(
          z.object({
            success: z.boolean(),
            message: z.string(),
          }),
        ),
      },
      summary: '手动触发模型可用性验证',
    },

    /**
     * POST /model/refresh-models - 刷新模型列表
     * 从 Provider 端点获取最新的模型列表（不进行验证）
     * 仅限管理员访问
     */
    refreshModels: {
      method: 'POST',
      path: '/refresh-models',
      body: RefreshModelsInputSchema,
      responses: {
        200: ApiResponseSchema(RefreshModelsResponseSchema),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '刷新模型列表（从端点获取）',
    },

    /**
     * POST /model/verify-single - 验证单个模型可用性
     * 通过实际调用模型 API 验证单个模型是否可用
     * 仅限管理员访问
     */
    verifySingle: {
      method: 'POST',
      path: '/verify-single',
      body: VerifySingleModelInputSchema,
      responses: {
        200: ApiResponseSchema(VerifySingleModelResponseSchema),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '验证单个模型可用性',
    },
  },
  {
    pathPrefix: '/model',
  },
);

/**
 * Bot Model API Contract
 * Bot 模型管理相关的 API 契约定义
 */
export const botModelContract = c.router(
  {
    // ============================================================================
    // Bot 模型管理 (所有用户)
    // ============================================================================

    /**
     * GET /bot/:hostname/models - 获取 Bot 的模型列表
     */
    list: {
      method: 'GET',
      path: '/:hostname/models',
      pathParams: z.object({ hostname: z.string() }),
      responses: {
        200: ApiResponseSchema(BotModelsResponseSchema),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '获取 Bot 的模型列表',
    },

    /**
     * PUT /bot/:hostname/models - 更新 Bot 的模型配置
     */
    update: {
      method: 'PUT',
      path: '/:hostname/models',
      pathParams: z.object({ hostname: z.string() }),
      body: UpdateBotModelsInputSchema,
      responses: {
        200: ApiResponseSchema(SuccessResponseSchema),
        400: ApiResponseSchema(z.object({ error: z.string() })),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '更新 Bot 的模型配置',
    },
  },
  {
    pathPrefix: '/bot',
  },
);

/**
 * 带版本元数据的 Model Contract
 */
export const modelContractVersioned = withVersion(modelContract, {
  version: API_VERSION.V1,
  pathPrefix: '/model',
});

/**
 * 带版本元数据的 Bot Model Contract
 */
export const botModelContractVersioned = withVersion(botModelContract, {
  version: API_VERSION.V1,
  pathPrefix: '/bot',
});

export type ModelContract = typeof modelContract;
export type BotModelContract = typeof botModelContract;
