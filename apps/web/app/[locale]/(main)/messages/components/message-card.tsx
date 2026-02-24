'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  Button,
  Avatar,
  AvatarImage,
  AvatarFallback,
} from '@repo/ui';
import { Check, Mail, Bell, AlertCircle, Info } from 'lucide-react';
import { cn } from '@repo/ui/lib/utils';
import type { MessageRecipient } from '@repo/contracts';

interface MessageCardProps {
  message: MessageRecipient;
  onMarkAsRead?: (messageId: string) => void;
  isMarking?: boolean;
}

// Map message types to icons and colors
const messageTypeConfig = {
  system: {
    icon: Info,
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    textColor: 'text-blue-600 dark:text-blue-400',
  },
  notification: {
    icon: Bell,
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    textColor: 'text-amber-600 dark:text-amber-400',
  },
  alert: {
    icon: AlertCircle,
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    textColor: 'text-red-600 dark:text-red-400',
  },
  message: {
    icon: Mail,
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    textColor: 'text-green-600 dark:text-green-400',
  },
};

export function MessageCard({
  message,
  onMarkAsRead,
  isMarking,
}: MessageCardProps) {
  const t = useTranslations('messages.card');

  const { isRead, readAt, createdAt, message: messageContent, receiver } = message;

  // Determine message type config (default to 'message' if type is unknown)
  const config = messageTypeConfig[messageContent.type as keyof typeof messageTypeConfig] ||
    messageTypeConfig.message;
  const IconComponent = config.icon;

  // Format the date
  const formattedDate = useMemo(() => {
    const date = new Date(createdAt);
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [createdAt]);

  // Get initials for avatar fallback
  const initials = receiver.nickname
    ? receiver.nickname
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'U';

  // Render message content based on type - parse structured content nicely
  const renderContent = () => {
    const content = messageContent.content;

    // If content is a string, display directly
    if (typeof content === 'string') {
      return <p className="text-sm text-muted-foreground">{content}</p>;
    }

    // If content is an object, try to extract meaningful information
    if (typeof content === 'object' && content !== null) {
      // Common content structures
      interface ContentObject {
        title?: string;
        body?: string;
        text?: string;
        message?: string;
        description?: string;
        action?: string;
        details?: string;
        [key: string]: unknown;
      }
      const c = content as ContentObject;

      // Pattern 1: title + body/description
      if (c.title) {
        return (
          <div className="space-y-2">
            <p className="font-medium text-foreground">{c.title}</p>
            {c.body && <p className="text-sm text-muted-foreground">{c.body}</p>}
            {c.description && <p className="text-sm text-muted-foreground">{c.description}</p>}
            {c.details && <p className="text-xs text-muted-foreground mt-1">{c.details}</p>}
          </div>
        );
      }

      // Pattern 2: simple text/message
      if (c.text) {
        return <p className="text-sm text-muted-foreground">{c.text}</p>;
      }
      if (c.message) {
        return <p className="text-sm text-muted-foreground">{c.message}</p>;
      }

      // Pattern 3: description only
      if (c.description) {
        return <p className="text-sm text-muted-foreground">{c.description}</p>;
      }

      // Pattern 4: action-based content
      if (c.action) {
        return (
          <div className="space-y-1">
            <p className="text-sm font-medium">{c.action}</p>
            {c.details && <p className="text-xs text-muted-foreground">{c.details}</p>}
          </div>
        );
      }

      // Fallback: extract values from the object and display them nicely
      const entries = Object.entries(c).filter(
        ([, value]) => typeof value === 'string' || typeof value === 'number'
      );

      if (entries.length > 0) {
        return (
          <div className="space-y-1">
            {entries.map(([key, value]) => (
              <div key={key} className="text-sm">
                <span className="text-muted-foreground capitalize">{key}: </span>
                <span>{String(value)}</span>
              </div>
            ))}
          </div>
        );
      }
    }

    return null;
  };

  return (
    <Card
      className={cn(
        'transition-all duration-200',
        !isRead && 'border-l-4 border-l-primary/50 bg-primary/5',
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex size-10 items-center justify-center rounded-full',
                config.bgColor,
              )}
            >
              <IconComponent className={cn('size-5', config.textColor)} />
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base truncate">
                {messageContent.type || t('viewDetails')}
              </CardTitle>
              <CardDescription className="text-xs">
                {t('from')}: {receiver.nickname || 'System'}
              </CardDescription>
            </div>
          </div>
          {!isRead && (
            <Badge variant="secondary" className="shrink-0">
              New
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        {renderContent()}
      </CardContent>
      <CardFooter className="flex items-center justify-between pt-0">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{formattedDate}</span>
          {isRead && readAt && (
            <>
              <span>·</span>
              <span>
                {t('receivedAt')}: {new Date(readAt).toLocaleTimeString()}
              </span>
            </>
          )}
        </div>
        {!isRead && onMarkAsRead && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onMarkAsRead(message.id)}
            disabled={isMarking}
            className="h-8"
          >
            <Check className="mr-1 size-4" />
            {t('viewDetails')}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

export function MessageCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="h-3 w-32 rounded bg-muted" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="space-y-2">
          <div className="h-3 w-full rounded bg-muted" />
          <div className="h-3 w-3/4 rounded bg-muted" />
        </div>
      </CardContent>
      <CardFooter className="pt-0">
        <div className="h-3 w-32 rounded bg-muted" />
      </CardFooter>
    </Card>
  );
}
