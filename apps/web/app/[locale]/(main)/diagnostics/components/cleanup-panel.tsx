'use client';

import { useState } from 'react';
import { useOrphans } from '@/hooks/useBots';
import type { OrphanReport } from '@repo/contracts';
import { useTranslations } from 'next-intl';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Skeleton,
  Alert,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui';
import { Trash2, RefreshCw, CheckCircle, AlertCircle, AlertTriangle } from 'lucide-react';

export function CleanupPanel() {
  const t = useTranslations('bots.diagnostics.cleanupPanel');
  const { orphans, loading, error, refresh, handleCleanup, cleanupLoading } =
    useOrphans();
  const [result, setResult] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const onCleanup = async () => {
    setConfirmOpen(false);
    try {
      const report = await handleCleanup();
      if (report) {
        const total =
          report.containersRemoved +
          report.workspacesRemoved +
          report.secretsRemoved;
        setResult(t('cleanedUp', { count: total }));
      }
    } catch {
      // Error handled by hook
    }
  };

  const orphanReport = orphans as OrphanReport | undefined;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Trash2 className="size-4" />
          {t('title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center py-4">
            <Skeleton className="size-5 rounded-full" />
            <span className="text-muted-foreground ml-2 text-sm">
              {t('scanning')}
            </span>
          </div>
        ) : error ? (
          <div className="py-2">
            <p className="text-destructive text-sm">{error}</p>
            <Button variant="link" size="sm" onClick={refresh} className="mt-2 p-0">
              {t('retry')}
            </Button>
          </div>
        ) : (
          <>
            {result && (
              <Alert className="mb-3">
                <CheckCircle className="size-4" />
                <span className="ml-2">{result}</span>
              </Alert>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">
                  {t('orphanedContainers')}
                </span>
                <Badge
                  variant={
                    orphanReport && orphanReport.orphanedContainers.length > 0
                      ? 'secondary'
                      : 'outline'
                  }
                >
                  {orphanReport?.orphanedContainers.length ?? 0}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">
                  {t('orphanedWorkspaces')}
                </span>
                <Badge
                  variant={
                    orphanReport && orphanReport.orphanedWorkspaces.length > 0
                      ? 'secondary'
                      : 'outline'
                  }
                >
                  {orphanReport?.orphanedWorkspaces.length ?? 0}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">
                  {t('orphanedSecrets')}
                </span>
                <Badge
                  variant={
                    orphanReport && orphanReport.orphanedSecrets.length > 0
                      ? 'secondary'
                      : 'outline'
                  }
                >
                  {orphanReport?.orphanedSecrets.length ?? 0}
                </Badge>
              </div>
            </div>

            {orphanReport && orphanReport.total > 0 ? (
              <div className="mt-4 flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setConfirmOpen(true)}
                  disabled={cleanupLoading}
                >
                  {cleanupLoading
                    ? t('cleaning')
                    : `${t('cleanUp')} ${orphanReport.total}`}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={refresh}
                  disabled={cleanupLoading}
                >
                  <RefreshCw className="mr-1 size-4" />
                  {t('refresh')}
                </Button>

                {/* 清理确认对话框 */}
                <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="size-5 text-destructive" />
                        {t('confirmTitle')}
                      </DialogTitle>
                      <DialogDescription>
                        {t('confirmDescription', { count: orphanReport.total })}
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setConfirmOpen(false)}
                      >
                        {t('cancel')}
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={onCleanup}
                        disabled={cleanupLoading}
                      >
                        {t('confirmCleanup')}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <CheckCircle className="size-5" />
                {t('noOrphanedResources')}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
