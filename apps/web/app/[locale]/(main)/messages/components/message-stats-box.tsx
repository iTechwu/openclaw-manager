'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@repo/ui';
import { Mail, MailOpen, Inbox } from 'lucide-react';
import { cn } from '@repo/ui/lib/utils';

interface MessageStatsBoxProps {
  stats: {
    total: number;
    unread: number;
    read: number;
  };
  loading?: boolean;
  className?: string;
}

export function MessageStatsBox({
  stats,
  loading,
  className,
}: MessageStatsBoxProps) {
  const t = useTranslations('messages.stats');

  const items = [
    {
      label: t('total'),
      value: stats.total,
      icon: Inbox,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      label: t('unread'),
      value: stats.unread,
      icon: Mail,
      color: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    },
    {
      label: t('read'),
      value: stats.read,
      icon: MailOpen,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
    },
  ];

  return (
    <Card className={cn('', className)}>
      <CardContent className="p-4">
        <div className="grid grid-cols-3 gap-4">
          {items.map((item) => (
            <div key={item.label} className="flex items-center gap-3">
              <div
                className={cn(
                  'flex size-10 items-center justify-center rounded-lg',
                  item.bgColor,
                )}
              >
                <item.icon className={cn('size-5', item.color)} />
              </div>
              <div>
                {loading ? (
                  <div className="h-6 w-8 animate-pulse rounded bg-muted" />
                ) : (
                  <p className="text-2xl font-bold">{item.value}</p>
                )}
                <p className="text-xs text-muted-foreground">{item.label}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
