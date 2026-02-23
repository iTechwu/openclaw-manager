'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Alert, AlertDescription, AlertTitle, Button } from '@repo/ui';
import { Settings, MessageSquare, Bot, CheckCircle2, Circle } from 'lucide-react';

interface DraftConfigGuideProps {
  hostname: string;
  hasProvider: boolean;
  hasChannel: boolean;
}

export function DraftConfigGuide({
  hostname,
  hasProvider,
  hasChannel,
}: DraftConfigGuideProps) {
  const t = useTranslations('bots.detail.draftGuide');

  const allConfigured = hasProvider && hasChannel;

  return (
    <Alert className="border-amber-500/50 bg-amber-500/10">
      <Bot className="size-4 text-amber-500" />
      <AlertTitle className="text-amber-700 dark:text-amber-400">
        {t('title')}
      </AlertTitle>
      <AlertDescription className="mt-3">
        <p className="text-muted-foreground mb-4">{t('description')}</p>

        <div className="space-y-3">
          {/* AI Provider 配置 */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-3">
              {hasProvider ? (
                <CheckCircle2 className="size-5 text-green-500" />
              ) : (
                <Circle className="size-5 text-muted-foreground" />
              )}
              <div>
                <div className="font-medium">{t('configureProvider')}</div>
                <div className="text-muted-foreground text-sm">
                  {t('configureProviderDesc')}
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/bots/${hostname}/models`}>
                <Settings className="size-4 mr-2" />
                {t('configure')}
              </Link>
            </Button>
          </div>

          {/* 消息渠道配置 */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-3">
              {hasChannel ? (
                <CheckCircle2 className="size-5 text-green-500" />
              ) : (
                <Circle className="size-5 text-muted-foreground" />
              )}
              <div>
                <div className="font-medium">{t('configureChannel')}</div>
                <div className="text-muted-foreground text-sm">
                  {t('configureChannelDesc')}
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/bots/${hostname}/channels`}>
                <MessageSquare className="size-4 mr-2" />
                {t('configure')}
              </Link>
            </Button>
          </div>
        </div>

        {allConfigured && (
          <p className="text-green-600 dark:text-green-400 mt-4 text-sm font-medium">
            {t('readyToStart')}
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}
