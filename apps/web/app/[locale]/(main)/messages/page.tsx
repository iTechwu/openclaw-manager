'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@repo/ui';
import { Inbox, CheckCheck, RefreshCw } from 'lucide-react';
import { ClientOnly } from '@/components/client-only';
import {
  useMessages,
  useUnreadMessageCount,
  useMessageOperations,
} from '@/lib/api/queries/message';
import type { MessageRecipient } from '@repo/contracts';
import {
  MessageCard,
  MessageCardSkeleton,
  MessageStatsBox,
} from './components';

type FilterType = 'all' | 'unread' | 'read';

export default function MessagesPage() {
  const t = useTranslations('messages');
  const tCommon = useTranslations('common.actions');

  const [filter, setFilter] = useState<FilterType>('all');
  const [page, setPage] = useState(1);
  const limit = 20;

  // Build query based on filter
  const query = useMemo(() => {
    const q: { limit: number; page: number; read?: string } = { limit, page };
    if (filter === 'unread') {
      q.read = 'false';
    } else if (filter === 'read') {
      q.read = 'true';
    }
    return q;
  }, [filter, page]);

  // Fetch messages and unread count
  const { data: messagesData, isLoading, refetch, isRefetching } = useMessages(query);
  const { data: unreadData } = useUnreadMessageCount();
  const { markAsRead, markAllAsRead, isMarking } = useMessageOperations();

  // Access data from API response (body.data structure)
  const messages: MessageRecipient[] = (messagesData?.body as unknown as { data?: { list: MessageRecipient[] } })?.data?.list || [];
  const total = (messagesData?.body as unknown as { data?: { total: number } })?.data?.total || 0;
  const unreadCount = (unreadData?.body as unknown as { data?: { total: number } })?.data?.total || 0;

  // Calculate stats
  const stats = useMemo(
    () => ({
      total,
      unread: unreadCount,
      read: total - unreadCount,
    }),
    [total, unreadCount],
  );

  // Handle mark as read
  const handleMarkAsRead = async (messageId: string) => {
    await markAsRead([messageId]);
  };

  // Handle mark all as read - use API to mark ALL messages as read
  const handleMarkAllAsRead = async () => {
    await markAllAsRead();
  };

  // Handle filter change
  const handleFilterChange = (value: string) => {
    setFilter(value as FilterType);
    setPage(1); // Reset to first page on filter change
  };

  // Handle refresh
  const handleRefresh = () => {
    refetch();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">{t('description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefetching}
          >
            <RefreshCw
              className={`mr-2 size-4 ${isRefetching ? 'animate-spin' : ''}`}
            />
            {tCommon('refresh')}
          </Button>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllAsRead}
              disabled={isMarking}
            >
              <CheckCheck className="mr-2 size-4" />
              {t('markAllRead')}
            </Button>
          )}
        </div>
      </div>

      {/* Stats Box */}
      <ClientOnly
        fallback={<MessageStatsBox stats={{ total: 0, unread: 0, read: 0 }} loading />}
      >
        <MessageStatsBox stats={stats} loading={isLoading} />
      </ClientOnly>

      {/* Filter Tabs */}
      <Tabs value={filter} onValueChange={handleFilterChange}>
        <TabsList>
          <TabsTrigger value="all">
            {t('filter.all')}
            {total > 0 && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({total})
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="unread">
            {t('filter.unread')}
            {unreadCount > 0 && (
              <span className="ml-1.5 text-xs text-primary">
                ({unreadCount})
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="read">{t('filter.read')}</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Message List */}
      <ClientOnly
        fallback={
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <MessageCardSkeleton key={i} />
            ))}
          </div>
        }
      >
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <MessageCardSkeleton key={i} />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <Empty className="border-2 border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Inbox className="size-6" />
              </EmptyMedia>
              <EmptyTitle>{t('empty')}</EmptyTitle>
              <EmptyDescription>{t('emptyDescription')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <MessageCard
                key={message.id}
                message={message}
                onMarkAsRead={handleMarkAsRead}
                isMarking={isMarking}
              />
            ))}
          </div>
        )}
      </ClientOnly>

      {/* Pagination (simple version - can be enhanced) */}
      {!isLoading && messages.length > 0 && total > limit && (
        <div className="flex justify-center">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              {tCommon('previous')}
            </Button>
            <span className="text-sm text-muted-foreground">
              {tCommon('page')} {page}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={messages.length < limit}
            >
              {tCommon('next')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
