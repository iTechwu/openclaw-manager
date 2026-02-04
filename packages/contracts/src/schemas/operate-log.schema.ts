/**
 * OperateLog API Schemas
 * 操作日志相关的 Zod Schema 定义
 */

import { z } from 'zod';
import { PaginationQuerySchema, PaginatedResponseSchema } from '../base';

// ============================================================================
// OperateLog Enums - 从 Prisma 生成的枚举导入
// ============================================================================

// Note: OperateTypeSchema, OperateType, OperateTargetSchema, OperateTarget
// are exported from prisma-enums.generated.ts (auto-generated from Prisma schema)
// Import them here for local use in this file
import {
  OperateTypeSchema,
  OperateTargetSchema,
} from './prisma-enums.generated';

// ============================================================================
// OperateLog Schemas - 操作日志
// ============================================================================

/**
 * 操作日志用户信息 Schema
 */
export const OperateLogUserSchema = z.object({
  id: z.string(),
  nickname: z.string().nullable(),
  avatarFileId: z.string().nullable(),
});

export type OperateLogUser = z.infer<typeof OperateLogUserSchema>;

/**
 * 操作日志项 Schema
 */
export const OperateLogItemSchema = z.object({
  id: z.string(),
  userId: z.string(),
  operateType: OperateTypeSchema,
  target: OperateTargetSchema,
  targetId: z.string().nullable(),
  targetName: z.string().nullable(),
  detail: z.any().nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.coerce.date(),
  user: OperateLogUserSchema.optional(),
});

export type OperateLogItem = z.infer<typeof OperateLogItemSchema>;

/**
 * 操作日志列表查询参数 Schema
 */
export const OperateLogListQuerySchema = PaginationQuerySchema.extend({
  operateType: OperateTypeSchema.optional(),
  target: OperateTargetSchema.optional(),
  targetId: z.string().uuid().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export type OperateLogListQuery = z.infer<typeof OperateLogListQuerySchema>;

/**
 * 操作日志列表响应 Schema
 */
export const OperateLogListResponseSchema = PaginatedResponseSchema(
  OperateLogItemSchema,
);

export type OperateLogListResponse = z.infer<typeof OperateLogListResponseSchema>;
