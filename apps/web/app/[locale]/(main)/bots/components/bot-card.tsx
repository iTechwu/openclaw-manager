'use client';

import type { Bot } from '@repo/contracts';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Badge,
  Button,
} from '@repo/ui';
import { Play, Square, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';

interface BotCardProps {
  bot: Bot;
  onStart: () => void;
  onStop: () => void;
  onDelete: () => void;
  loading: boolean;
}

const statusVariants: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  running: 'default',
  starting: 'secondary',
  stopped: 'outline',
  error: 'destructive',
  created: 'secondary',
};

export function BotCard({
  bot,
  onStart,
  onStop,
  onDelete,
  loading,
}: BotCardProps) {
  const t = useTranslations('bots');
  const router = useRouter();

  const handleCardClick = () => {
    router.push(`/bots/${bot.hostname}`);
  };

  const handleActionClick = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
  };

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={handleCardClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{bot.name}</CardTitle>
            <CardDescription>{bot.hostname}</CardDescription>
          </div>
          <Badge variant={statusVariants[bot.status] || 'outline'}>
            {t(`status.${bot.status}`)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('fields.provider')}</span>
          <span className="font-medium">{bot.aiProvider}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('fields.channel')}</span>
          <span className="font-medium">{bot.channelType}</span>
        </div>
        {bot.port && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('fields.port')}</span>
            <span className="font-medium">{bot.port}</span>
          </div>
        )}
      </CardContent>
      <CardFooter className="gap-2">
        {bot.status === 'stopped' || bot.status === 'created' ? (
          <Button
            size="sm"
            onClick={(e) => handleActionClick(e, onStart)}
            disabled={loading}
            className="flex-1"
          >
            <Play className="mr-1 size-4" />
            {t('actions.start')}
          </Button>
        ) : bot.status === 'running' ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => handleActionClick(e, onStop)}
            disabled={loading}
            className="flex-1"
          >
            <Square className="mr-1 size-4" />
            {t('actions.stop')}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="destructive"
          onClick={(e) => handleActionClick(e, onDelete)}
          disabled={loading}
        >
          <Trash2 className="size-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}
