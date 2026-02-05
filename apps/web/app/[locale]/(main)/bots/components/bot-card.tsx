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
import { Play, Square, Trash2, BarChart2, Puzzle, Wrench } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

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

  return (
    <Card>
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
        <div className="flex gap-2 pt-2">
          <Link href={`/bots/${bot.hostname}/usage`} className="flex-1">
            <Button variant="outline" size="sm" className="w-full">
              <BarChart2 className="mr-1 size-4" />
              {t('actions.usage')}
            </Button>
          </Link>
          <Link href={`/bots/${bot.hostname}/plugins`} className="flex-1">
            <Button variant="outline" size="sm" className="w-full">
              <Puzzle className="mr-1 size-4" />
              {t('actions.plugins')}
            </Button>
          </Link>
          <Link href={`/bots/${bot.hostname}/skills`} className="flex-1">
            <Button variant="outline" size="sm" className="w-full">
              <Wrench className="mr-1 size-4" />
              {t('actions.skills')}
            </Button>
          </Link>
        </div>
      </CardContent>
      <CardFooter className="gap-2">
        {bot.status === 'stopped' || bot.status === 'created' ? (
          <Button
            size="sm"
            onClick={onStart}
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
            onClick={onStop}
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
          onClick={onDelete}
          disabled={loading}
        >
          <Trash2 className="size-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}
