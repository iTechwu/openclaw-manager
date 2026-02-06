'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useBot } from '@/hooks/useBots';
import {
  useBotStatusSSE,
  type BotStatusEvent,
  type BotHealthEvent,
} from '@/hooks/useBotStatusSSE';
import { BotSidebar } from './components/bot-sidebar';
import { Skeleton } from '@repo/ui';
import { botClient, botChannelClient } from '@/lib/api/contracts';

export default function BotDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ hostname: string }>();
  const hostname = params.hostname;

  // 获取 Bot 基本信息
  const { bot, loading: isLoading } = useBot(hostname);

  // 配置状态
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

  // SSE 回调 - 使用 useCallback 避免重复创建导致重连
  const handleStatusChange = useCallback((event: BotStatusEvent) => {
    // 状态变更时会自动触发 React Query 缓存失效
    console.log('Bot status changed:', event);
  }, []);

  const handleHealthChange = useCallback((event: BotHealthEvent) => {
    console.log('Bot health changed:', event);
  }, []);

  // SSE 实时状态更新
  useBotStatusSSE({
    onStatusChange: handleStatusChange,
    onHealthChange: handleHealthChange,
  });

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* 侧边栏骨架屏 */}
        <aside className="w-64 border-r bg-card p-4">
          <Skeleton className="h-8 w-24 mb-4" />
          <Skeleton className="h-12 w-full mb-6" />
          <div className="space-y-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </aside>
        {/* 内容区骨架屏 */}
        <main className="flex-1 p-6">
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-64 w-full" />
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* 侧边栏导航 */}
      <BotSidebar
        hostname={hostname}
        status={
          bot?.status as
            | 'running'
            | 'stopped'
            | 'starting'
            | 'error'
            | 'created'
            | 'draft'
        }
        hasProvider={hasProvider}
        hasChannel={hasChannel}
        configLoading={configLoading}
      />

      {/* 主内容区 */}
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
