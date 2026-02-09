import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { createApiResponse } from '../base';
import {
  NotificationItemSchema,
  NotificationListQuerySchema,
  NotificationListResponseSchema,
  NotificationUnreadCountResponseSchema,
  MarkReadRequestSchema,
  MarkReadResponseSchema,
} from '../schemas/notification.schema';

const c = initContract();

/**
 * 通知 API 契约
 */
export const notificationContract = c.router(
  {
    /**
     * 获取通知列表
     */
    list: {
      method: 'GET',
      path: '/notifications',
      query: NotificationListQuerySchema,
      responses: {
        200: createApiResponse(NotificationListResponseSchema),
      },
      summary: '获取通知列表',
      description: '获取当前用户的通知列表，支持类型筛选和已读状态筛选',
    },

    /**
     * 获取单个通知详情
     */
    getById: {
      method: 'GET',
      path: '/notifications/:notificationId',
      pathParams: z.object({ notificationId: z.string().uuid() }),
      responses: {
        200: createApiResponse(NotificationItemSchema),
        404: createApiResponse(z.object({ error: z.string() })),
      },
      summary: '获取通知详情',
      description: '获取指定通知的详细信息',
    },

    /**
     * 获取未读通知数量
     */
    getUnreadCount: {
      method: 'GET',
      path: '/notifications/unread-count',
      responses: {
        200: createApiResponse(NotificationUnreadCountResponseSchema),
      },
      summary: '获取未读通知数量',
      description: '获取当前用户的未读通知数量',
    },

    /**
     * 标记通知为已读
     */
    markRead: {
      method: 'POST',
      path: '/notifications/mark-read',
      body: MarkReadRequestSchema,
      responses: {
        200: createApiResponse(MarkReadResponseSchema),
      },
      summary: '标记通知已读',
      description: '将指定的通知标记为已读',
    },

    /**
     * 标记全部通知为已读
     */
    markAllRead: {
      method: 'POST',
      path: '/notifications/mark-all-read',
      body: z.object({}),
      responses: {
        200: createApiResponse(MarkReadResponseSchema),
      },
      summary: '标记全部已读',
      description: '将当前用户的所有通知标记为已读',
    },

    /**
     * 删除通知
     */
    delete: {
      method: 'DELETE',
      path: '/notifications/:notificationId',
      pathParams: z.object({ notificationId: z.string().uuid() }),
      body: z.object({}),
      responses: {
        200: createApiResponse(z.object({ success: z.boolean() })),
        404: createApiResponse(z.object({ error: z.string() })),
      },
      summary: '删除通知',
      description: '删除指定的通知',
    },
  },
  { pathPrefix: '' },
);

export type NotificationContract = typeof notificationContract;
