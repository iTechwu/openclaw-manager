import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { ApiResponseSchema, withVersion, API_VERSION } from '../base';
import {
  ChannelDefinitionSchema,
  ChannelDefinitionListResponseSchema,
  BotChannelItemSchema,
  BotChannelListResponseSchema,
  CreateBotChannelRequestSchema,
  UpdateBotChannelRequestSchema,
  BotChannelConnectionActionSchema,
  ChannelTestRequestSchema,
  ChannelTestResponseSchema,
  ValidateCredentialsRequestSchema,
} from '../schemas/channel.schema';

const c = initContract();

/**
 * Channel Definition API Contract
 * 渠道定义管理相关的 API 契约定义
 */
export const channelContract = c.router(
  {
    /**
     * GET /channel - 列出所有渠道定义
     */
    list: {
      method: 'GET',
      path: '',
      query: z.object({
        locale: z.string().optional(), // Locale for filtering popular channels
      }),
      responses: {
        200: ApiResponseSchema(ChannelDefinitionListResponseSchema),
      },
      summary: '列出所有渠道定义',
    },

    /**
     * GET /channel/:id - 获取单个渠道定义
     */
    getById: {
      method: 'GET',
      path: '/:id',
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: ApiResponseSchema(ChannelDefinitionSchema),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '获取单个渠道定义',
    },
  },
  {
    pathPrefix: '/channel',
  },
);

/**
 * Bot Channel API Contract
 * Bot 渠道配置管理相关的 API 契约定义
 */
export const botChannelContract = c.router(
  {
    /**
     * GET /bot/:hostname/channels - 列出 Bot 的所有渠道配置
     */
    list: {
      method: 'GET',
      path: '',
      responses: {
        200: ApiResponseSchema(BotChannelListResponseSchema),
      },
      summary: '列出 Bot 的所有渠道配置',
    },

    /**
     * GET /bot/:hostname/channels/:channelId - 获取单个渠道配置
     */
    getById: {
      method: 'GET',
      path: '/:channelId',
      pathParams: z.object({ channelId: z.string().uuid() }),
      responses: {
        200: ApiResponseSchema(BotChannelItemSchema),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '获取单个渠道配置',
    },

    /**
     * POST /bot/:hostname/channels - 添加渠道配置
     */
    create: {
      method: 'POST',
      path: '',
      body: CreateBotChannelRequestSchema,
      responses: {
        201: ApiResponseSchema(BotChannelItemSchema),
        400: ApiResponseSchema(z.object({ error: z.string() })),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '添加渠道配置',
    },

    /**
     * PUT /bot/:hostname/channels/:channelId - 更新渠道配置
     */
    update: {
      method: 'PUT',
      path: '/:channelId',
      pathParams: z.object({ channelId: z.string().uuid() }),
      body: UpdateBotChannelRequestSchema,
      responses: {
        200: ApiResponseSchema(BotChannelItemSchema),
        400: ApiResponseSchema(z.object({ error: z.string() })),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '更新渠道配置',
    },

    /**
     * DELETE /bot/:hostname/channels/:channelId - 删除渠道配置
     */
    delete: {
      method: 'DELETE',
      path: '/:channelId',
      pathParams: z.object({ channelId: z.string().uuid() }),
      responses: {
        200: ApiResponseSchema(z.object({ success: z.boolean() })),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '删除渠道配置',
    },

    /**
     * POST /bot/:hostname/channels/:channelId/connection - 连接/断开渠道
     */
    connection: {
      method: 'POST',
      path: '/:channelId/connection',
      pathParams: z.object({ channelId: z.string().uuid() }),
      body: z.object({ action: BotChannelConnectionActionSchema }),
      responses: {
        200: ApiResponseSchema(BotChannelItemSchema),
        400: ApiResponseSchema(z.object({ error: z.string() })),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '连接或断开渠道',
    },

    /**
     * POST /bot/:hostname/channels/:channelId/test - 快速测试渠道
     */
    test: {
      method: 'POST',
      path: '/:channelId/test',
      pathParams: z.object({ channelId: z.string().uuid() }),
      body: ChannelTestRequestSchema,
      responses: {
        200: ApiResponseSchema(ChannelTestResponseSchema),
        400: ApiResponseSchema(z.object({ error: z.string() })),
        404: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '快速测试渠道配置',
    },

    /**
     * POST /bot/:hostname/channels/validate - 验证凭证（保存前验证）
     */
    validateCredentials: {
      method: 'POST',
      path: '/validate',
      body: ValidateCredentialsRequestSchema,
      responses: {
        200: ApiResponseSchema(ChannelTestResponseSchema),
        400: ApiResponseSchema(z.object({ error: z.string() })),
      },
      summary: '验证渠道凭证（保存前验证）',
    },
  },
  {
    pathPrefix: '/bot/:hostname/channels',
  },
);

/**
 * 带版本元数据的 Channel Contract
 */
export const channelContractVersioned = withVersion(channelContract, {
  version: API_VERSION.V1,
  pathPrefix: '/channel',
});

export const botChannelContractVersioned = withVersion(botChannelContract, {
  version: API_VERSION.V1,
  pathPrefix: '/bot/:hostname/channels',
});

export type ChannelContract = typeof channelContract;
export type BotChannelContract = typeof botChannelContract;
