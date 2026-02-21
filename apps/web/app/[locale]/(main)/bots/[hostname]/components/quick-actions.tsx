'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui';
import { Play, Square, RotateCcw, Stethoscope, Loader2 } from 'lucide-react';
import { cn } from '@repo/ui/lib/utils';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

type BotStatus = 'draft' | 'created' | 'starting' | 'running' | 'stopped' | 'error';

interface QuickActionsProps {
  /** Bot 当前状态 */
  botStatus: BotStatus;
  /** 操作加载中 */
  loading?: boolean;
  /** 是否配置了 Provider */
  hasProvider?: boolean;
  /** 是否配置了 Channel */
  hasChannel?: boolean;
  /** 配置检查中 */
  configLoading?: boolean;
  /** 启动回调 */
  onStart: () => void;
  /** 停止回调 */
  onStop: () => void;
  /** 重启回调 */
  onRestart: () => void;
  /** 诊断回调 */
  onDiagnose: () => void;
}

export function QuickActions({
  botStatus,
  loading,
  hasProvider,
  hasChannel,
  configLoading,
  onStart,
  onStop,
  onRestart,
  onDiagnose,
}: QuickActionsProps) {
  const t = useTranslations('bots.detail.dashboard');

  // 检查配置是否完成
  const isConfigComplete = hasProvider && hasChannel;
  const isConfigChecking = configLoading;

  // 状态判断
  const isRunning = botStatus === 'running';
  const isStarting = botStatus === 'starting';
  const isTransitioning = isStarting || loading; // 正在启动或操作中

  // 包装操作函数，在配置未完成时显示提示
  const wrapActionWithConfigCheck = (
    action: () => void,
    requiresConfig: boolean,
  ) => {
    return () => {
      if (requiresConfig && !isConfigChecking && !isConfigComplete) {
        const missingItems: string[] = [];
        if (!hasProvider) missingItems.push(t('configRequired.provider'));
        if (!hasChannel) missingItems.push(t('configRequired.channel'));
        toast.warning(t('configRequired.title'), {
          description: t('configRequired.description', {
            items: missingItems.join('、'),
          }),
        });
        return;
      }
      action();
    };
  };

  const actions = [
    {
      id: 'start',
      label: isStarting ? t('starting') : t('start'),
      icon: Play,
      onClick: wrapActionWithConfigCheck(onStart, true),
      // 启动按钮：正在运行或正在启动时禁用
      disabled: loading || isRunning || isStarting,
      color: 'green',
      hoverBg: 'hover:bg-green-500/20 hover:border-green-500/50',
      iconBg: isRunning || isStarting ? 'bg-muted' : 'bg-green-500/20',
      iconColor: isRunning || isStarting ? 'text-muted-foreground' : 'text-green-500',
      showSpinner: isStarting,
    },
    {
      id: 'stop',
      label: t('stop'),
      icon: Square,
      onClick: onStop,
      // 停止按钮：未运行或正在启动时禁用
      disabled: loading || !isRunning || isStarting,
      color: 'red',
      hoverBg: 'hover:bg-red-500/20 hover:border-red-500/50',
      iconBg: !isRunning || isStarting ? 'bg-muted' : 'bg-red-500/20',
      iconColor: !isRunning || isStarting ? 'text-muted-foreground' : 'text-red-500',
      showSpinner: false,
    },
    {
      id: 'restart',
      label: isStarting ? t('restarting') : t('restart'),
      icon: RotateCcw,
      onClick: wrapActionWithConfigCheck(onRestart, true),
      // 重启按钮：正在启动时禁用
      disabled: loading || isStarting,
      color: 'amber',
      hoverBg: 'hover:bg-amber-500/20 hover:border-amber-500/50',
      iconBg: isStarting ? 'bg-amber-500/20' : 'bg-amber-500/20',
      iconColor: isStarting ? 'text-amber-500' : 'text-amber-500',
      showSpinner: loading || isStarting,
    },
    {
      id: 'diagnose',
      label: t('diagnose'),
      icon: Stethoscope,
      onClick: wrapActionWithConfigCheck(onDiagnose, true),
      // 诊断按钮：正在启动时禁用
      disabled: loading || isStarting,
      color: 'purple',
      hoverBg: 'hover:bg-purple-500/20 hover:border-purple-500/50',
      iconBg: 'bg-purple-500/20',
      iconColor: 'text-purple-500',
      showSpinner: false,
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold">
          {t('quickActions')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                onClick={action.onClick}
                disabled={action.disabled}
                className={cn(
                  'flex flex-col items-center gap-3 p-4 rounded-xl transition-all',
                  'border bg-card',
                  action.disabled
                    ? 'opacity-50 cursor-not-allowed'
                    : action.hoverBg,
                )}
              >
                <div
                  className={cn(
                    'size-12 rounded-full flex items-center justify-center',
                    action.iconBg,
                    action.showSpinner && 'animate-pulse',
                  )}
                >
                  {action.showSpinner ? (
                    <Loader2
                      className={cn('size-5 animate-spin', action.iconColor)}
                    />
                  ) : (
                    <Icon className={cn('size-5', action.iconColor)} />
                  )}
                </div>
                <span
                  className={cn(
                    'text-sm font-medium',
                    action.disabled
                      ? 'text-muted-foreground'
                      : 'text-foreground',
                  )}
                >
                  {action.label}
                </span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
