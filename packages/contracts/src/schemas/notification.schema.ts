import { z } from 'zod';
import { PaginationQuerySchema, PaginatedResponseSchema } from '../base';

/**
 * 通知类型 Schema
 */
export const NotificationTypeSchema = z.enum([
  'system',    // 系统通知
  'bot',       // Bot 相关通知
  'security',  // 安全通知
  'billing',   // 账单通知
  'update',    // 更新通知
]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

/**
 * 通知优先级 Schema
 */
export const NotificationPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);
export type NotificationPriority = z.infer<typeof NotificationPrioritySchema>;

/**
 * 通知项 Schema
 */
export const NotificationItemSchema = z.object({
  id: z.string().uuid(),
  type: NotificationTypeSchema,
  priority: NotificationPrioritySchema,
  title: z.string(),
  content: z.string(),
  isRead: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.date(),
  readAt: z.date().nullable(),
});
export type NotificationItem = z.infer<typeof NotificationItemSchema>;

/**
 * 通知列表查询参数
 */
export const NotificationListQuerySchema = PaginationQuerySchema.extend({
  type: NotificationTypeSchema.optional(),
  isRead: z.coerce.boolean().optional(),
});
export type NotificationListQuery = z.infer<typeof NotificationListQuerySchema>;

/**
 * 通知列表响应
 */
export const NotificationListResponseSchema = PaginatedResponseSchema(
  NotificationItemSchema,
).extend({
  unreadCount: z.number(),
});
export type NotificationListResponse = z.infer<typeof NotificationListResponseSchema>;

/**
 * 未读通知数量响应
 */
export const NotificationUnreadCountResponseSchema = z.object({
  count: z.number(),
});
export type NotificationUnreadCountResponse = z.infer<typeof NotificationUnreadCountResponseSchema>;

/**
 * 标记已读请求 Schema
 */
export const MarkReadRequestSchema = z.object({
  notificationIds: z.array(z.string().uuid()),
});
export type MarkReadRequest = z.infer<typeof MarkReadRequestSchema>;

/**
 * 标记已读响应 Schema
 */
export const MarkReadResponseSchema = z.object({
  success: z.boolean(),
  updatedCount: z.number(),
});
export type MarkReadResponse = z.infer<typeof MarkReadResponseSchema>;
