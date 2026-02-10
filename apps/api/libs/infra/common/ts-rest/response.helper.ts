/**
 * ts-rest Response Helpers
 * ts-rest 响应辅助工具
 *
 * 提供标准化的响应格式：
 * - 成功响应：{ code: 200, msg: 'ok', data: ... }
 * - 错误响应：{ code: xxx, msg: 'xxxx', error?: ... }
 *
 * 配合 createApiResponse 定义的 Contract 使用
 */

import {
  ApiErrorCode,
  getErrorType,
  getHttpStatus,
  getErrorMessage,
} from '@repo/contracts/errors';

/**
 * 标准成功响应格式
 */
export interface SuccessBody<T> {
  code: number;
  msg: string;
  data: T;
}

/**
 * 标准错误响应格式
 */
export interface ErrorBody {
  code: number;
  msg: string;
  error?: unknown;
}

/**
 * ts-rest 处理器响应类型
 */
export type TsRestResponse<T, S extends number = 200> = {
  status: S;
  body: SuccessBody<T> | ErrorBody;
};

/**
 * ts-rest 成功响应类型（仅包含成功体）
 */
export type TsRestSuccessResponse<T, S extends number = 200> = {
  status: S;
  body: SuccessBody<T>;
};

/**
 * 创建成功响应
 *
 * @example
 * ```typescript
 * @TsRestHandler(c.getItem)
 * async getItem() {
 *   return tsRestHandler(c.getItem, async ({ params }) => {
 *     const data = await this.service.findById(params.id);
 *     return success(data);
 *   });
 * }
 * ```
 */
export function success<T>(
  data: T,
  status: 200 = 200,
): TsRestSuccessResponse<T, 200> {
  return {
    status,
    body: {
      code: 200,
      msg: 'ok',
      data: serializeDates(data),
    },
  };
}

/**
 * 创建分页成功响应
 *
 * @example
 * ```typescript
 * return paginated(items, total, query.page, query.limit);
 * ```
 */
export function paginated<T>(
  list: T[],
  total: number,
  page: number,
  limit: number,
): TsRestSuccessResponse<
  { list: T[]; total: number; page: number; limit: number },
  200
> {
  return success({ list, total, page, limit });
}

/**
 * 创建 201 响应（创建成功）
 */
export function created<T>(data: T): TsRestSuccessResponse<T, 201> {
  return {
    status: 201,
    body: {
      code: 200,
      msg: 'ok',
      data: serializeDates(data),
    },
  };
}

/**
 * 创建删除成功响应
 */
export function deleted(): TsRestResponse<{ success: boolean }, 200> {
  return {
    status: 200,
    body: {
      code: 200,
      msg: 'ok',
      data: { success: true },
    },
  };
}

// ============================================================================
// Plain NestJS Controller Helpers (不使用 ts-rest 的控制器)
// ============================================================================

/**
 * 创建成功响应体（用于普通 NestJS 控制器，不使用 ts-rest）
 *
 * @example
 * ```typescript
 * @Get('items')
 * async getItems() {
 *   const items = await this.service.findAll();
 *   return successBody({ list: items });
 * }
 * ```
 */
export function successBody<T>(data: T): SuccessBody<T> {
  return {
    code: 200,
    msg: 'ok',
    data: serializeDates(data),
  };
}

/**
 * 创建分页成功响应体（用于普通 NestJS 控制器）
 */
export function paginatedBody<T>(
  list: T[],
  total: number,
  page: number,
  limit: number,
): SuccessBody<{ list: T[]; total: number; page: number; limit: number }> {
  return successBody({ list, total, page, limit });
}

/**
 * 创建删除成功响应体（用于普通 NestJS 控制器）
 */
export function deletedBody(): SuccessBody<{ success: boolean }> {
  return {
    code: 200,
    msg: 'ok',
    data: { success: true },
  };
}

/**
 * 创建错误响应体（用于普通 NestJS 控制器）
 */
export function errorBody(
  errorCode: ApiErrorCode,
  errorData?: unknown,
): ErrorBody {
  const errorType = getErrorType(errorCode) || 'unknown';
  const numericCode = Number(errorCode);
  const msg = getErrorMessage(errorType);

  return {
    code: numericCode,
    msg,
    error: errorData,
  };
}

export function deletedWithData<T>(data: T): TsRestResponse<T, 200> {
  return {
    status: 200,
    body: {
      code: 200,
      msg: 'ok',
      data: serializeDates(data),
    },
  };
}

/**
 * 从错误码创建错误响应
 *
 * @example
 * ```typescript
 * if (!item) {
 *   return error(CommonErrorCode.NotFound);
 * }
 * ```
 */
export function error(
  errorCode: ApiErrorCode,
  errorData?: unknown,
): TsRestResponse<never> {
  const errorType = getErrorType(errorCode) || 'unknown';
  const httpStatus = getHttpStatus(errorCode);
  const numericCode = Number(errorCode);
  const msg = getErrorMessage(errorType);

  return {
    status: httpStatus as 200,
    body: {
      code: numericCode,
      msg,
      error: errorData,
    },
  };
}

/**
 * 从错误类型字符串创建错误响应
 *
 * @example
 * ```typescript
 * return errorFromType('userNotFound', 200401, 404);
 * ```
 */
export function errorFromType(
  errorType: string,
  errorCode: number,
  httpStatus: number = 400,
  errorData?: unknown,
): TsRestResponse<never> {
  const msg = getErrorMessage(errorType);

  return {
    status: httpStatus as 200,
    body: {
      code: errorCode,
      msg,
      error: errorData,
    },
  };
}

/**
 * 创建简单错误响应（不带 error 详情）
 */
export function errorSimple(
  code: number,
  msg: string,
  httpStatus: number = 400,
): TsRestResponse<never> {
  return {
    status: httpStatus as 200,
    body: {
      code,
      msg,
    },
  };
}

/**
 * 递归地将对象中的 Date 类型转换为 ISO 字符串
 * 用于确保 ts-rest 响应符合 zod schema（Date 字段定义为 z.coerce.date()）
 *
 * @example
 * ```typescript
 * const data = await this.service.findById(id);
 * return success(serializeDates(data));
 * ```
 */
export function serializeDates<T>(obj: T): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (obj instanceof Date) {
    return obj.toISOString() as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => serializeDates(item)) as unknown as T;
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeDates(value);
    }
    return result as T;
  }

  return obj;
}
