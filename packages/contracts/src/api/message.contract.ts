/**
 * Message API Contract
 * 消息 API 契约定义
 *
 * RESTful 变更说明：
 * - POST /message/set/read → PATCH /messages/read (设置消息已读)
 */

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { createApiResponse } from '../base';
import {
    MessageListResponseSchema,
    MessageListQuerySchema,
    SetMessageReadRequestSchema,
    UnreadCountResponseSchema,
} from '../schemas/message.schema';

const c = initContract();

export const messageContract = c.router(
    {
        /**
         * 获取消息列表
         * GET /messages
         */
        list: {
            method: 'GET',
            path: '/messages',
            query: MessageListQuerySchema,
            responses: {
                200: createApiResponse(MessageListResponseSchema),
            },
            summary: '获取消息列表',
        },

        /**
         * 设置消息已读
         * PATCH /messages/read
         * V1: POST /message/set/read
         */
        setRead: {
            method: 'PATCH',
            path: '/messages/read',
            body: SetMessageReadRequestSchema,
            responses: {
                200: createApiResponse(z.void().nullable()),
            },
            summary: '设置消息已读',
        },

        /**
         * 标记所有消息为已读
         * PATCH /messages/read/all
         */
        markAllAsRead: {
            method: 'PATCH',
            path: '/messages/read/all',
            body: z.object({}).optional(),
            responses: {
                200: createApiResponse(z.object({ count: z.number() })),
            },
            summary: '标记所有消息为已读',
        },

        /**
         * 获取未读消息数量
         * GET /messages/unread/count
         */
        getUnreadCount: {
            method: 'GET',
            path: '/messages/unread/count',
            responses: {
                200: createApiResponse(UnreadCountResponseSchema),
            },
            summary: '获取未读消息数量',
        },
    },
    {
        pathPrefix: '/message',
    },
);

export type MessageContract = typeof messageContract;
