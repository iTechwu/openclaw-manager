'use client';

import { useState } from 'react';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@repo/ui';
import {
  Play,
  Square,
  Trash2,
  Tag,
  Clock,
  Settings,
  Puzzle,
  Sparkles,
  BarChart3,
  Cpu,
  MessageSquare,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { ChannelIcon } from '@/lib/config/channels/channel-icons';

interface BotCardProps {
  bot: Bot;
  channels?: string[]; // Array of channel types (e.g., ['telegram', 'discord'])
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
  draft: 'outline',
};

function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function BotCard({
  bot,
  channels,
  onStart,
  onStop,
  onDelete,
  loading,
}: BotCardProps) {
  const t = useTranslations('bots');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [showStopDialog, setShowStopDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [stopConfirmInput, setStopConfirmInput] = useState('');
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');

  const handleCardClick = () => {
    router.push(`/bots/${bot.hostname}`);
  };

  const handleActionClick = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
  };

  const handleStopClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setStopConfirmInput('');
    setShowStopDialog(true);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirmInput('');
    setShowDeleteDialog(true);
  };

  const handleConfirmStop = () => {
    if (stopConfirmInput !== bot.name) return;
    setShowStopDialog(false);
    setStopConfirmInput('');
    onStop();
  };

  const handleConfirmDelete = () => {
    if (deleteConfirmInput !== bot.name) return;
    setShowDeleteDialog(false);
    setDeleteConfirmInput('');
    onDelete();
  };

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={handleCardClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {bot.emoji && <span className="text-2xl">{bot.emoji}</span>}
            <div>
              <CardTitle className="text-lg">{bot.name}</CardTitle>
              <CardDescription className="font-mono text-xs">
                {bot.hostname}
              </CardDescription>
            </div>
          </div>
          <Badge variant={statusVariants[bot.status] || 'outline'}>
            {t(`status.${bot.status}`)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {/* Persona Preview */}
        {bot.soulMarkdown && (
          <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
            {bot.soulMarkdown
              .replace(/^#.*\n?/gm, '')
              .trim()
              .slice(0, 100)}
            {bot.soulMarkdown.length > 100 && '...'}
          </p>
        )}

        {/* Tags */}
        {bot.tags && bot.tags.length > 0 && (
          <div className="flex items-center gap-2">
            <Tag className="text-muted-foreground size-3.5" />
            <div className="flex flex-wrap gap-1">
              {bot.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
              {bot.tags.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{bot.tags.length - 3}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Channel Icons */}
        {channels && channels.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">
              {t('fields.channels')}
            </span>
            <div className="flex items-center gap-1.5">
              {channels.map((channel) => (
                <ChannelIcon key={channel} channelId={channel} size={16} />
              ))}
            </div>
          </div>
        )}

        {/* Created At */}
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground flex items-center gap-1">
            <Clock className="size-3.5" />
            {t('fields.createdAt')}
          </span>
          <span className="text-xs">{formatDate(bot.createdAt)}</span>
        </div>

        {/* Quick Links - Different buttons based on draft status */}
        {bot.status === 'draft' ? (
          /* Draft status: Settings, AI Config, Channels Config */
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 flex-1 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/bots/${bot.hostname}/settings`);
              }}
            >
              <Settings className="mr-1 size-3" />
              {t('detail.nav.settings')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 flex-1 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/bots/${bot.hostname}/models`);
              }}
            >
              <Cpu className="mr-1 size-3" />
              {t('detail.nav.ai')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 flex-1 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/bots/${bot.hostname}/channels`);
              }}
            >
              <MessageSquare className="mr-1 size-3" />
              {t('detail.nav.channels')}
            </Button>
          </div>
        ) : (
          /* Non-draft status: Plugins, Skills, Usage */
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 flex-1 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/bots/${bot.hostname}/plugins`);
              }}
            >
              <Puzzle className="mr-1 size-3" />
              {t('actions.plugins')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 flex-1 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/bots/${bot.hostname}/skills`);
              }}
            >
              <Sparkles className="mr-1 size-3" />
              {t('actions.skills')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 flex-1 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/bots/${bot.hostname}/usage`);
              }}
            >
              <BarChart3 className="mr-1 size-3" />
              {t('actions.usage')}
            </Button>
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
            onClick={handleStopClick}
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
          onClick={handleDeleteClick}
          disabled={loading}
        >
          <Trash2 className="size-4" />
        </Button>
      </CardFooter>

      {/* Stop Confirmation Dialog */}
      <Dialog open={showStopDialog} onOpenChange={setShowStopDialog}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>{t('confirm.stopTitle')}</DialogTitle>
            <DialogDescription>
              {t('confirm.stopDescription', { name: bot.name })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor="stop-confirm">
              {t('confirm.inputHint', { name: bot.name })}
            </Label>
            <Input
              id="stop-confirm"
              value={stopConfirmInput}
              onChange={(e) => setStopConfirmInput(e.target.value)}
              placeholder={bot.name}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStopDialog(false)}>
              {tCommon('actions.cancel')}
            </Button>
            <Button
              variant="secondary"
              onClick={handleConfirmStop}
              disabled={stopConfirmInput !== bot.name}
            >
              {t('actions.stop')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>{t('confirm.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('confirm.deleteDescription', { name: bot.name })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor="delete-confirm">
              {t('confirm.inputHint', { name: bot.name })}
            </Label>
            <Input
              id="delete-confirm"
              value={deleteConfirmInput}
              onChange={(e) => setDeleteConfirmInput(e.target.value)}
              placeholder={bot.name}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              {tCommon('actions.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteConfirmInput !== bot.name}
            >
              {t('actions.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
