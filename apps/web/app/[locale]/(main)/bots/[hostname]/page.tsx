'use client';

import { useState, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useBot, useBots, useContainerStats } from '@/hooks/useBots';
import { StatusCard } from './components/status-card';
import { QuickActions } from './components/quick-actions';
import { RealtimeLogs } from './components/realtime-logs';
import { DraftConfigGuide } from './components/draft-config-guide';
import { toast } from 'sonner';
import { ExternalLink } from 'lucide-react';
import { Button } from '@repo/ui';
import { botClient, botChannelClient } from '@/lib/api/contracts';

export default function BotDashboardPage() {
  const params = useParams<{ hostname: string }>();
  const router = useRouter();
  const hostname = params.hostname;
  const t = useTranslations('bots.detail.dashboard');

  const { bot, loading: botLoading, refresh: refreshBot } = useBot(hostname);
  const { handleStart, handleStop, startLoading, stopLoading } = useBots();
  const { stats: containerStats } = useContainerStats();

  const [logs, setLogs] = useState<string[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [hasProvider, setHasProvider] = useState(false);
  const [hasChannel, setHasChannel] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);

  // 检查 Provider 和 Channel 配置状态
  useEffect(() => {
    const checkConfig = async () => {
      if (!hostname || !bot) return;

      setConfigLoading(true);
      try {
        // 检查 Provider
        const providerRes = await botClient.getProviders({
          params: { hostname },
        });
        if (providerRes.status === 200 && providerRes.body.data) {
          setHasProvider(providerRes.body.data.providers.length > 0);
        }

        // 检查 Channel
        const channelRes = await botChannelClient.list({
          params: { hostname },
        });
        if (channelRes.status === 200 && channelRes.body.data) {
          setHasChannel(channelRes.body.data.total > 0);
        }
      } catch {
        // 忽略错误，保持默认值
      } finally {
        setConfigLoading(false);
      }
    };

    checkConfig();
  }, [hostname, bot]);

  // 获取实时日志
  const fetchLogs = useCallback(async () => {
    if (!hostname || !bot?.containerId) return;

    setLogsLoading(true);
    try {
      const response = await botClient.getLogs({
        params: { hostname },
        query: { tail: 50 },
      });

      if (response.status === 200 && response.body.data) {
        // 将结构化日志转换为字符串数组用于显示
        const logLines = response.body.data.logs.map(
          (log) => `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`
        );
        setLogs(logLines);
      }
    } catch {
      // 忽略错误
    } finally {
      setLogsLoading(false);
    }
  }, [hostname, bot?.containerId]);

  // 初始加载日志
  useEffect(() => {
    if (bot?.status === 'running') {
      fetchLogs();
    }
  }, [bot?.status, fetchLogs]);

  const onStart = async () => {
    setActionLoading(true);
    try {
      await handleStart(hostname);
      toast.success('Bot 启动成功');
      refreshBot();
    } catch (error) {
      toast.error('启动失败');
    } finally {
      setActionLoading(false);
    }
  };

  const onStop = async () => {
    setActionLoading(true);
    try {
      await handleStop(hostname);
      toast.success('Bot 已停止');
      refreshBot();
    } catch (error) {
      toast.error('停止失败');
    } finally {
      setActionLoading(false);
    }
  };

  const onRestart = async () => {
    setActionLoading(true);
    try {
      await handleStop(hostname);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await handleStart(hostname);
      toast.success('Bot 重启成功');
      refreshBot();
    } catch (error) {
      toast.error('重启失败');
    } finally {
      setActionLoading(false);
    }
  };

  const onDiagnose = () => {
    router.push(`/bots/${hostname}/diagnostics`);
  };

  const isRunning = bot?.status === 'running';
  const isDraft = bot?.status === 'draft';
  const loading = actionLoading || startLoading || stopLoading;

  // 从容器统计中获取当前 Bot 的统计信息
  interface ContainerStat {
    hostname: string;
    memoryUsage?: number;
    cpuPercent?: number;
    pid?: number | null;
    uptimeSeconds?: number | null;
    containerId?: string;
  }

  const currentBotStats = (containerStats as ContainerStat[] | undefined)?.find(
    (s) => s.hostname === hostname,
  );

  // 构建服务状态对象
  const serviceStatus = bot
    ? {
        running: isRunning,
        port: bot.port ?? undefined,
        // 从容器统计获取 PID
        pid: currentBotStats?.pid ?? null,
        // 从容器统计获取容器 ID
        containerId: currentBotStats?.containerId ?? null,
        // 从容器统计获取内存使用量（转换为 MB）
        memoryMb: currentBotStats?.memoryUsage
          ? Math.round(currentBotStats.memoryUsage / 1024 / 1024)
          : null,
        // 从容器统计获取运行时间
        uptimeSeconds: currentBotStats?.uptimeSeconds ?? null,
        // CPU 使用率
        cpuPercent: currentBotStats?.cpuPercent ?? null,
      }
    : null;

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">{t('description')}</p>
        </div>
        {bot?.dashboardUrl && isRunning && (
          <Button variant="outline" size="sm" asChild>
            <a
              href={bot.dashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="size-4 mr-2" />
              Dashboard
            </a>
          </Button>
        )}
      </div>

      {/* Draft 状态配置引导 */}
      {isDraft && !configLoading && (
        <DraftConfigGuide
          hostname={hostname}
          hasProvider={hasProvider}
          hasChannel={hasChannel}
        />
      )}

      {/* 快捷操作 - 移到服务状态前面 */}
      <QuickActions
        isRunning={isRunning}
        loading={loading}
        hasProvider={hasProvider}
        hasChannel={hasChannel}
        configLoading={configLoading}
        onStart={onStart}
        onStop={onStop}
        onRestart={onRestart}
        onDiagnose={onDiagnose}
      />

      {/* 服务状态卡片 */}
      <StatusCard status={serviceStatus} loading={botLoading} />

      {/* 实时日志 */}
      <RealtimeLogs logs={logs} loading={logsLoading} onRefresh={fetchLogs} />
    </div>
  );
}
