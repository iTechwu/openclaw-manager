'use client';

import { useQueryClient } from '@tanstack/react-query';
import { notificationApi, notificationClient } from '../client';
import type {
  NotificationListQuery,
  NotificationItem,
  NotificationListResponse,
} from '@repo/contracts';

/**
 * Notification API Hooks
 * 基于 ts-rest 契约的通知 API Hooks
 */

// ============================================================================
// Query Keys
// ============================================================================

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (params?: Partial<NotificationListQuery>) =>
    [...notificationKeys.all, 'list', params] as const,
  unreadCount: () => [...notificationKeys.all, 'unreadCount'] as const,
  detail: (id: string) => [...notificationKeys.all, 'detail', id] as const,
};

// ============================================================================
// Types
// ============================================================================

export interface NotificationsParams {
  type?: NotificationListQuery['type'];
  isRead?: boolean;
  limit?: number;
  page?: number;
}

export interface NotificationsOptions {
  /** 是否启用查询，默认 true，可用于懒加载 */
  enabled?: boolean;
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * 获取通知列表
 */
export function useNotifications(
  params?: NotificationsParams,
  options?: NotificationsOptions,
) {
  const listParams: Partial<NotificationListQuery> | undefined = params
    ? {
        type: params.type,
        isRead: params.isRead,
        limit: params.limit,
        page: params.page,
      }
    : undefined;

  const queryKey = notificationKeys.list(listParams);

  const query = notificationApi.list.useQuery(
    queryKey,
    {
      query: {
        type: params?.type as NotificationListQuery['type'],
        isRead: params?.isRead,
        limit: params?.limit,
        page: params?.page,
      },
    },
    {
      queryKey,
      enabled: options?.enabled !== false,
      staleTime: 30000,
    },
  );

  const responseBody = query.data?.body;
  const data: NotificationListResponse | undefined =
    responseBody && 'data' in responseBody
      ? (responseBody.data as NotificationListResponse)
      : undefined;

  return {
    data,
    notifications: data?.list || [],
    unreadCount: data?.unreadCount || 0,
    total: data?.total || 0,
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: () => query.refetch(),
  };
}

/**
 * 获取未读通知数量
 */
export function useUnreadNotificationCount() {
  const queryKey = notificationKeys.unreadCount();

  const query = notificationApi.getUnreadCount.useQuery(
    queryKey,
    {},
    {
      queryKey,
      staleTime: 30000,
      refetchInterval: 60000, // 每分钟刷新一次
    },
  );

  const responseBody = query.data?.body;
  const count =
    responseBody && 'data' in responseBody
      ? (responseBody.data as { count: number }).count
      : 0;

  return {
    count,
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: () => query.refetch(),
  };
}

/**
 * 标记通知已读
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  const mutation = notificationApi.markRead.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });

  return {
    mutate: (params: { notificationIds: string[] }) =>
      mutation.mutate({ body: params }),
    mutateAsync: async (params: { notificationIds: string[] }) => {
      const result = await mutation.mutateAsync({ body: params });
      if (result.body && 'data' in result.body) {
        return result.body.data;
      }
      return undefined;
    },
    isLoading: mutation.isPending,
    isPending: mutation.isPending,
  };
}

/**
 * 标记全部通知已读
 */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  const mutation = notificationApi.markAllRead.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });

  return {
    mutate: () => mutation.mutate({ body: {} }),
    mutateAsync: async () => {
      const result = await mutation.mutateAsync({ body: {} });
      if (result.body && 'data' in result.body) {
        return result.body.data;
      }
      return undefined;
    },
    isLoading: mutation.isPending,
    isPending: mutation.isPending,
  };
}

/**
 * 删除通知
 */
export function useDeleteNotification() {
  const queryClient = useQueryClient();

  const mutation = notificationApi.delete.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });

  return {
    mutate: (params: { notificationId: string }) =>
      mutation.mutate({
        params: { notificationId: params.notificationId },
        body: {},
      }),
    mutateAsync: async (params: { notificationId: string }) => {
      const result = await mutation.mutateAsync({
        params: { notificationId: params.notificationId },
        body: {},
      });
      if (result.body && 'data' in result.body) {
        return result.body.data;
      }
      return undefined;
    },
    isLoading: mutation.isPending,
    isPending: mutation.isPending,
  };
}
