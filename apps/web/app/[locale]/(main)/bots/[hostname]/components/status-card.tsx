'use client';

import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@repo/ui';
import { Activity, Cpu, HardDrive, Clock } from 'lucide-react';
import { cn } from '@repo/ui/lib/utils';
import { useTranslations } from 'next-intl';

interface ServiceStatus {
  running: boolean;
  port?: number;
  pid?: number | null;
  containerId?: string | null;
  memoryMb?: number | null;
  uptimeSeconds?: number | null;
}

interface StatusCardProps {
  status: ServiceStatus | null;
  loading?: boolean;
}

export function StatusCard({ status, loading }: StatusCardProps) {
  const t = useTranslations('bots.detail.dashboard');

  const formatUptime = (seconds: number | null | undefined) => {
    if (!seconds) return '--';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const isRunning = status?.running ?? false;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">
            {t('serviceStatus')}
          </CardTitle>
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'size-2.5 rounded-full',
                loading
                  ? 'bg-yellow-500 animate-pulse'
                  : isRunning
                    ? 'bg-green-500'
                    : 'bg-red-500',
              )}
            />
            <span
              className={cn(
                'text-sm font-medium',
                loading
                  ? 'text-yellow-500'
                  : isRunning
                    ? 'text-green-500'
                    : 'text-red-500',
              )}
            >
              {loading ? '检测中...' : isRunning ? '运行中' : '已停止'}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* 端口 */}
          <div className="bg-muted/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="size-4 text-cyan-500" />
              <span className="text-xs text-muted-foreground">{t('port')}</span>
            </div>
            {loading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <p className="text-xl font-semibold">{status?.port || '--'}</p>
            )}
          </div>

          {/* 进程 ID / 容器 ID */}
          <div className="bg-muted/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="size-4 text-purple-500" />
              <span className="text-xs text-muted-foreground">
                {status?.pid ? t('processId') : t('containerId')}
              </span>
            </div>
            {loading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <p className="text-xl font-semibold">
                {status?.pid || status?.containerId || '--'}
              </p>
            )}
          </div>

          {/* 内存 */}
          <div className="bg-muted/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <HardDrive className="size-4 text-green-500" />
              <span className="text-xs text-muted-foreground">
                {t('memory')}
              </span>
            </div>
            {loading ? (
              <Skeleton className="h-7 w-20" />
            ) : (
              <p className="text-xl font-semibold">
                {status?.memoryMb ? `${status.memoryMb.toFixed(1)} MB` : '--'}
              </p>
            )}
          </div>

          {/* 运行时间 */}
          <div className="bg-muted/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="size-4 text-amber-500" />
              <span className="text-xs text-muted-foreground">
                {t('uptime')}
              </span>
            </div>
            {loading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <p className="text-xl font-semibold">
                {formatUptime(status?.uptimeSeconds)}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
