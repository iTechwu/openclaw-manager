'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Badge,
  ScrollArea,
} from '@repo/ui';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { messageApi } from '@/lib/api/contracts/client';
import { formatDistanceToNow } from 'date-fns';
import { zhCN, enUS } from 'date-fns/locale';
import { useLocale } from 'next-intl';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQueryOptions = any;

/**
 * NotificationDropdown - 通知下拉组件
 * 显示用户的消息通知，支持标记已读
 */
export function NotificationDropdown() {
  const t = useTranslations('common.notifications');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Avoid Radix-generated ids on server so SSR and client HTML match (hydration-safe).
  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch unread count
  // ts-rest v4 API: useQuery(queryKey, args, options)
  const { data: unreadData } = messageApi.getUnreadCount.useQuery(
    ['messages', 'unread-count'],
    {},
    { refetchInterval: 30000 } as AnyQueryOptions,
  );

  // Fetch messages when dropdown is open
  // ts-rest v4 API: useQuery(queryKey, args, options)
  const { data: messagesData, isLoading } = messageApi.list.useQuery(
    ['messages', 'list'],
    { query: { limit: 10, page: 1 } },
    { enabled: isOpen } as AnyQueryOptions,
  );

  // Mark as read mutation
  const markAsReadMutation = messageApi.setRead.useMutation({
    onSuccess: () => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
  });

  const unreadCount = unreadData?.body?.data?.total || 0;
  const messages = messagesData?.body?.data?.list || [];

  const handleMarkAsRead = async (messageIds: string[]) => {
    await markAsReadMutation.mutateAsync({
      body: { messageIds },
    });
  };

  const handleMarkAllAsRead = async () => {
    const unreadMessageIds = messages
      .filter((msg) => !msg.isRead)
      .map((msg) => msg.message.id);
    if (unreadMessageIds.length > 0) {
      await handleMarkAsRead(unreadMessageIds);
    }
  };

  const getDateLocale = () => {
    return locale === 'zh-CN' ? zhCN : enUS;
  };

  const formatTime = (date: Date) => {
    return formatDistanceToNow(new Date(date), {
      addSuffix: true,
      locale: getDateLocale(),
    });
  };

  const getMessageContent = (content: any): string => {
    if (typeof content === 'string') return content;
    if (content?.message) return content.message;
    if (content?.text) return content.text;
    return JSON.stringify(content);
  };

  // Placeholder until mounted so Radix never runs on server (avoids non-deterministic id).
  // No badge in placeholder so server and client render identical HTML.
  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="size-8 relative"
        type="button"
      >
        <Bell className="size-4" />
        <span className="sr-only">{t('title')}</span>
      </Button>
    );
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8 relative">
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 size-4 p-0 flex items-center justify-center text-[10px]"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
          <span className="sr-only">{t('title')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>{t('title')}</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={handleMarkAllAsRead}
              disabled={markAsReadMutation.isPending}
            >
              <CheckCheck className="size-3 mr-1" />
              {t('markAllRead')}
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="h-[300px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Bell className="size-8 mb-2 opacity-50" />
              <span className="text-sm">{t('empty')}</span>
            </div>
          ) : (
            messages.map((item) => (
              <DropdownMenuItem
                key={item.id}
                className="flex flex-col items-start gap-1 p-3 cursor-pointer"
                onClick={() => {
                  if (!item.isRead) {
                    handleMarkAsRead([item.message.id]);
                  }
                }}
              >
                <div className="flex items-start justify-between w-full gap-2">
                  <span
                    className={`text-sm font-medium line-clamp-2 ${
                      item.isRead ? 'text-muted-foreground' : ''
                    }`}
                  >
                    {getMessageContent(item.message.content)}
                  </span>
                  {!item.isRead && (
                    <div className="size-2 rounded-full bg-primary shrink-0 mt-1.5" />
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatTime(item.createdAt)}
                </span>
              </DropdownMenuItem>
            ))
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
