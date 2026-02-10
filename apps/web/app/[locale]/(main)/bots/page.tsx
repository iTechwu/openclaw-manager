'use client';

import { useBots } from '@/hooks/useBots';
import { useProviderKeys, useProviderKeyHealth } from '@/hooks/useProviderKeys';
import { useState } from 'react';
import { CreateBotWizard } from '@/components/bots/create-wizard';
import { ClientOnly } from '@/components/client-only';
import { BotCard, BotCardSkeleton, StatusStatsBox } from './components';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui';
import { Plus, Key, AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { useIsAdmin } from '@/lib/permissions';

export default function BotsPage() {
  const t = useTranslations('bots');
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [showNoKeysDialog, setShowNoKeysDialog] = useState(false);

  const {
    bots,
    loading: botsLoading,
    handleStart,
    handleStop,
    handleDelete,
    actionLoading,
  } = useBots();
  const { health } = useProviderKeyHealth();
  const { keys, loading: keysLoading } = useProviderKeys();

  // Calculate bot statistics
  const runningBots = bots.filter((bot) => bot.status === 'running').length;
  const stoppedBots = bots.filter((bot) => bot.status === 'stopped').length;

  // Handle create bot button click
  const handleCreateBotClick = () => {
    // Check if user has any API keys
    if (!keysLoading && keys.length === 0) {
      setShowNoKeysDialog(true);
    } else {
      setShowCreateWizard(true);
    }
  };

  // Handle go to secrets page
  const handleGoToSecrets = () => {
    setShowNoKeysDialog(false);
    router.push('/secrets/add');
  };

  // Handle continue anyway (close dialog and open wizard)
  const handleContinueAnyway = () => {
    setShowNoKeysDialog(false);
    setShowCreateWizard(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">{t('description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/secrets">
              <Key className="mr-2 size-4" />
              {isAdmin ? t('actions.manageApiKeys') : t('actions.viewApiKeys')}
            </Link>
          </Button>
          <Button onClick={handleCreateBotClick}>
            <Plus className="mr-2 size-4" />
            {t('actions.createBot')}
          </Button>
        </div>
      </div>

      <ClientOnly
        fallback={
          <StatusStatsBox
            stats={{ total: 0, running: 0, stopped: 0 }}
            loading
          />
        }
      >
        <StatusStatsBox
          health={health}
          stats={{
            total: bots.length,
            running: runningBots,
            stopped: stoppedBots,
          }}
          loading={botsLoading}
        />
      </ClientOnly>

      <ClientOnly
        fallback={
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <BotCardSkeleton key={i} />
            ))}
          </div>
        }
      >
        {botsLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <BotCardSkeleton key={i} />
            ))}
          </div>
        ) : bots.length === 0 ? (
          <div className="text-muted-foreground py-8 text-center">
            {t('messages.noBots')}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {bots.map((bot) => (
              <BotCard
                key={bot.id}
                bot={bot}
                onStart={() => handleStart(bot.hostname)}
                onStop={() => handleStop(bot.hostname)}
                onDelete={() => handleDelete(bot.hostname)}
                loading={actionLoading}
              />
            ))}
          </div>
        )}
      </ClientOnly>

      <CreateBotWizard
        isOpen={showCreateWizard}
        onClose={() => setShowCreateWizard(false)}
      />

      {/* No API Keys Dialog */}
      <Dialog open={showNoKeysDialog} onOpenChange={setShowNoKeysDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                <AlertTriangle className="size-5 text-amber-600 dark:text-amber-400" />
              </div>
              <DialogTitle>{t('noApiKeysDialog.title')}</DialogTitle>
            </div>
            <DialogDescription className="pt-2">
              {t('noApiKeysDialog.description')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={handleContinueAnyway}>
              {t('noApiKeysDialog.continueAnyway')}
            </Button>
            <Button onClick={handleGoToSecrets}>
              <Key className="mr-2 size-4" />
              {t('noApiKeysDialog.goToSecrets')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
