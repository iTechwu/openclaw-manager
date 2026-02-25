'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Badge,
  ScrollArea,
} from '@repo/ui';
import { Bell, CheckCheck, Loader2, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { messageApi } from '@/lib/api/contracts/client';
import { formatDistanceToNow } from 'date-fns';
import { zhCN, enUS } from 'date-fns/locale';
import { useLocale } from 'next-intl';
import Link from 'next/link';
import { cn } from '@repo/ui/lib/utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQueryOptions = any;

/**
 * NotificationDropdown - 通知下拉组件
 * 显示用户的消息通知，支持标记已读和展开查看全部内容
 */
export function NotificationDropdown() {
  const t = useTranslations('common.notifications');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  // Mark all as read mutation
  const markAllAsReadMutation = messageApi.markAllAsRead.useMutation({
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
    await markAllAsReadMutation.mutateAsync({ body: {} });
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

  const getMessageContent = (content: unknown): string => {
    if (typeof content === 'string') return content;
    if (typeof content === 'object' && content !== null) {
      const c = content as Record<string, unknown>;
      if (c.message) return String(c.message);
      if (c.text) return String(c.text);
      if (c.title) {
        const title = String(c.title);
        const body = c.body ? `\n${String(c.body)}` : '';
        const description = c.description ? `\n${String(c.description)}` : '';
        return `${title}${body}${description}`;
      }
      return JSON.stringify(content);
    }
    return JSON.stringify(content);
  };

  const toggleExpand = (id: string, isRead: boolean, messageId: string) => {
    // 如果未读，先标记为已读
    if (!isRead) {
      handleMarkAsRead([messageId]);
    }
    // 切换展开状态
    setExpandedId((prev) => (prev === id ? null : id));
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
              disabled={markAllAsReadMutation.isPending}
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
            <div className="flex flex-col">
              {messages.map((item) => {
                const isExpanded = expandedId === item.id;
                const content = getMessageContent(item.message.content);
                const isLongContent = content.length > 60;

                return (
                  <div
                    key={item.id}
                    className={cn(
                      'flex flex-col gap-1 p-3 cursor-pointer hover:bg-accent transition-colors border-b last:border-b-0',
                      !item.isRead && 'bg-primary/5',
                    )}
                    onClick={() => toggleExpand(item.id, item.isRead, item.message.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        {!item.isRead && (
                          <div className="size-2 rounded-full bg-primary shrink-0 mt-1.5" />
                        )}
                        <span
                          className={cn(
                            'text-sm flex-1',
                            item.isRead ? 'text-muted-foreground' : 'font-medium',
                            !isExpanded && isLongContent && 'line-clamp-2',
                          )}
                        >
                          {content}
                        </span>
                      </div>
                      {isLongContent && (
                        <button
                          type="button"
                          className="shrink-0 p-0.5 hover:bg-muted rounded transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(item.id, item.isRead, item.message.id);
                          }}
                        >
                          {isExpanded ? (
                            <ChevronUp className="size-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="size-4 text-muted-foreground" />
                          )}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center justify-between pl-4">
                      <span className="text-xs text-muted-foreground">
                        {formatTime(item.createdAt)}
                      </span>
                      {item.isRead && item.readAt && (
                        <span className="text-xs text-muted-foreground">
                          {t('readAt', { time: formatTime(item.readAt) })}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
        {messages.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="p-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-center text-primary hover:text-primary/80"
                asChild
              >
                <Link href="/messages" onClick={() => setIsOpen(false)}>
                  <ExternalLink className="size-3 mr-2" />
                  {t('viewMore')}
                </Link>
              </Button>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
