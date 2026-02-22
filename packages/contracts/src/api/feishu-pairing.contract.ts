import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { ApiResponseSchema, withVersion, API_VERSION } from '../base';
import {
  FeishuPairingListResponseSchema,
  ApprovePairingRequestSchema,
  RejectPairingRequestSchema,
  PairingActionResponseSchema,
  FeishuPairingConfigSchema,
  UpdateFeishuPairingConfigRequestSchema,
} from '../schemas/feishu-pairing.schema';

const c = initContract();

/**
 * Feishu Pairing API Contract
 * 飞书配对管理相关的 API 契约定义
 */
export const feishuPairingContract = c.router(
  {
    /**
     * GET /bot/:hostname/feishu-pairing - 获取配对请求列表
     */
    list: {
      method: 'GET',
      path: '',
      query: z.object({
        status: z.enum(['pending', 'approved', 'rejected', 'expired']).optional(),
      }),
      responses: {
        200: ApiResponseSchema(FeishuPairingListResponseSchema),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '获取飞书配对请求列表',
    },

    /**
     * POST /bot/:hostname/feishu-pairing/approve - 批准配对请求
     */
    approve: {
      method: 'POST',
      path: '/approve',
      body: ApprovePairingRequestSchema,
      responses: {
        200: ApiResponseSchema(PairingActionResponseSchema),
        400: ApiResponseSchema(z.object({ error: z.string() })),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '批准飞书配对请求',
    },

    /**
     * POST /bot/:hostname/feishu-pairing/reject - 拒绝配对请求
     */
    reject: {
      method: 'POST',
      path: '/reject',
      body: RejectPairingRequestSchema,
      responses: {
        200: ApiResponseSchema(PairingActionResponseSchema),
        400: ApiResponseSchema(z.object({ error: z.string() })),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '拒绝飞书配对请求',
    },

    /**
     * GET /bot/:hostname/feishu-pairing/config - 获取配对配置
     */
    getConfig: {
      method: 'GET',
      path: '/config',
      responses: {
        200: ApiResponseSchema(FeishuPairingConfigSchema),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '获取飞书配对配置',
    },

    /**
     * PUT /bot/:hostname/feishu-pairing/config - 更新配对配置
     */
    updateConfig: {
      method: 'PUT',
      path: '/config',
      body: UpdateFeishuPairingConfigRequestSchema,
      responses: {
        200: ApiResponseSchema(FeishuPairingConfigSchema),
        400: ApiResponseSchema(z.object({ error: z.string() })),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '更新飞书配对配置',
    },

    /**
     * DELETE /bot/:hostname/feishu-pairing/:code - 删除配对记录
     * 用于清理已处理的配对请求
     */
    delete: {
      method: 'DELETE',
      path: '/:code',
      pathParams: z.object({
        code: z.string(),
      }),
      responses: {
        200: ApiResponseSchema(PairingActionResponseSchema),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '删除飞书配对记录',
    },
  },
  {
    pathPrefix: '/bot/:hostname/feishu-pairing',
  },
);

/**
 * 带版本元数据的 Feishu Pairing Contract
 */
export const feishuPairingContractVersioned = withVersion(feishuPairingContract, {
  version: API_VERSION.V1,
  pathPrefix: '/bot/:hostname/feishu-pairing',
});

export type FeishuPairingContract = typeof feishuPairingContract;
