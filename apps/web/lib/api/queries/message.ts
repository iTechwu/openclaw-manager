/**
 * Message API Queries
 * React Query hooks for message operations
 */

import { tsRestClient } from '@/lib/api/contracts/client';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Get user's message list
 */
export const useMessages = (options?: {
  read?: string;
  limit?: number;
  page?: number;
}) => {
  return tsRestClient.message.list.useQuery(['messages', options], {
    query: {
      read: options?.read,
      limit: options?.limit,
      page: options?.page,
    },
  });
};

/**
 * Get unread message count
 */
export const useUnreadMessageCount = () => {
  return tsRestClient.message.getUnreadCount.useQuery([
    'messages',
    'unread-count',
  ]);
};

/**
 * Mark messages as read
 */
export const useMarkMessagesAsRead = () => {
  const queryClient = useQueryClient();

  return tsRestClient.message.setRead.useMutation({
    onSuccess: () => {
      // Invalidate message queries to refetch
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
  });
};

/**
 * Mark all messages as read
 */
export const useMarkAllMessagesAsRead = () => {
  const queryClient = useQueryClient();

  return tsRestClient.message.markAllAsRead.useMutation({
    onSuccess: () => {
      // Invalidate message queries to refetch
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
  });
};

/**
 * Helper hook for message operations
 */
export const useMessageOperations = () => {
  const markAsReadMutation = useMarkMessagesAsRead();
  const markAllAsReadMutation = useMarkAllMessagesAsRead();

  const markAsRead = async (messageIds: string[]) => {
    try {
      await markAsReadMutation.mutateAsync({
        body: { messageIds },
      });
    } catch (error) {
      console.error('Failed to mark messages as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await markAllAsReadMutation.mutateAsync({ body: {} });
    } catch (error) {
      console.error('Failed to mark all messages as read:', error);
    }
  };

  return {
    markAsRead,
    markAllAsRead,
    isMarking: markAsReadMutation.isPending || markAllAsReadMutation.isPending,
  };
};
