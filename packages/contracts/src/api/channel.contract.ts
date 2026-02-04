import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  ApiResponseSchema,
  withVersion,
  API_VERSION,
} from '../base';
import {
  ChannelDefinitionSchema,
  ChannelDefinitionListResponseSchema,
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
 * 带版本元数据的 Channel Contract
 */
export const channelContractVersioned = withVersion(
  channelContract,
  {
    version: API_VERSION.V1,
    pathPrefix: '/channel',
  },
);

export type ChannelContract = typeof channelContract;
