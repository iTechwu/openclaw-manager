'use client';

import { useTranslations } from 'next-intl';
import { useProviderKeys, useProviderKeyHealth } from '@/hooks/useProviderKeys';
import { useState } from 'react';
import { AddProviderKeyModal } from '@/components/bots/add-provider-key-modal';
import { ProviderKeyTable } from '../../bots/components/provider-key-table';
import { HealthStatus } from '../../bots/components/health-status';
import { ClientOnly } from '@/components/client-only';
import { Button, Skeleton, Card, CardContent } from '@repo/ui';
import { Plus, Key } from 'lucide-react';
import { CanCreate } from '@/lib/permissions';

export default function ApiKeysPage() {
  const t = useTranslations('settings');
  const tBots = useTranslations('bots');
  const [showAddKeyModal, setShowAddKeyModal] = useState(false);

  const {
    keys,
    loading: keysLoading,
    handleDelete: handleDeleteKey,
    deleteLoading,
  } = useProviderKeys();
  const { health } = useProviderKeyHealth();

  // Calculate provider statistics
  const providerCounts = keys.reduce(
    (acc, key) => {
      acc[key.vendor] = (acc[key.vendor] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{t('apiKeys')}</h2>
          <p className="text-muted-foreground text-sm">
            {t('apiKeysDescription')}
          </p>
        </div>
        <CanCreate module="providerKey">
          <Button onClick={() => setShowAddKeyModal(true)}>
            <Plus className="mr-2 size-4" />
            {tBots('actions.addApiKey')}
          </Button>
        </CanCreate>
      </div>

      {health && <HealthStatus health={health} />}

      <ClientOnly
        fallback={
          <Card className="py-4">
            <CardContent className="flex items-center gap-6">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-6 w-24" />
            </CardContent>
          </Card>
        }
      >
        <Card className="py-4">
          <CardContent className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <Key className="text-muted-foreground size-4" />
              <span className="text-muted-foreground text-sm">
                {t('stats.totalKeys')}:
              </span>
              <span className="font-medium">{keys.length}</span>
            </div>
            {Object.entries(providerCounts).map(([provider, count]) => (
              <div key={provider} className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">
                  {provider}:
                </span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </ClientOnly>

      {keysLoading ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : (
        <ProviderKeyTable
          keys={keys}
          onDelete={handleDeleteKey}
          loading={deleteLoading}
        />
      )}

      <CanCreate module="providerKey">
        <AddProviderKeyModal
          isOpen={showAddKeyModal}
          onClose={() => setShowAddKeyModal(false)}
        />
      </CanCreate>
    </div>
  );
}
