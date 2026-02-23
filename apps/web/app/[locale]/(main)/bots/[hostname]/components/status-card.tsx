'use client';

import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@repo/ui';
import { Activity, Cpu, HardDrive, Clock, Loader2 } from 'lucide-react';
import { cn } from '@repo/ui/lib/utils';
import { useTranslations } from 'next-intl';

type BotStatus = 'draft' | 'created' | 'starting' | 'running' | 'stopped' | 'error';

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
  /** Bot 当前状态 */
  botStatus?: BotStatus;
  loading?: boolean;
}

export function StatusCard({ status, botStatus, loading }: StatusCardProps) {
  const t = useTranslations('bots.detail.dashboard');

  const formatUptime = (seconds: number | null | undefined) => {
    if (!seconds) return '--';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // 根据 Bot 状态获取状态显示信息
  const getStatusInfo = () => {
    if (loading) {
      return {
        color: 'yellow',
        dotClass: 'bg-yellow-500 animate-pulse',
        textClass: 'text-yellow-500',
        text: t('checking'),
        icon: <Loader2 className="size-3 animate-spin" />,
      };
    }

    switch (botStatus) {
      case 'starting':
        return {
          color: 'amber',
          dotClass: 'bg-amber-500 animate-pulse',
          textClass: 'text-amber-500',
          text: t('starting'),
          icon: <Loader2 className="size-3 animate-spin" />,
        };
      case 'running':
        return {
          color: 'green',
          dotClass: 'bg-green-500',
          textClass: 'text-green-500',
          text: t('running'),
          icon: null,
        };
      case 'error':
        return {
          color: 'red',
          dotClass: 'bg-red-500',
          textClass: 'text-red-500',
          text: t('error'),
          icon: null,
        };
      case 'stopped':
        return {
          color: 'gray',
          dotClass: 'bg-gray-500',
          textClass: 'text-gray-500',
          text: t('stopped'),
          icon: null,
        };
      case 'draft':
        return {
          color: 'gray',
          dotClass: 'bg-gray-400',
          textClass: 'text-gray-400',
          text: t('draft'),
          icon: null,
        };
      case 'created':
        return {
          color: 'blue',
          dotClass: 'bg-blue-500',
          textClass: 'text-blue-500',
          text: t('created'),
          icon: null,
        };
      default:
        return {
          color: 'gray',
          dotClass: 'bg-gray-500',
          textClass: 'text-gray-500',
          text: t('unknown'),
          icon: null,
        };
    }
  };

  const statusInfo = getStatusInfo();

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
                'size-2.5 rounded-full flex items-center justify-center',
                statusInfo.dotClass,
              )}
            >
              {statusInfo.icon}
            </div>
            <span
              className={cn(
                'text-sm font-medium',
                statusInfo.textClass,
              )}
            >
              {statusInfo.text}
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
                {status?.pid || (status?.containerId ? status.containerId.slice(0, 12) : '--')}
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
