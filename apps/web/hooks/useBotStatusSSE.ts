'use client';

/**
 * useBotStatusSSE Hook
 * 使用 SSE (Server-Sent Events) 实时接收 Bot 状态更新
 *
 * 功能：
 * - 自动连接到 SSE 端点
 * - 接收实时 Bot 状态变更（running, stopped, error）
 * - 接收实时 Bot 健康状态变更（HEALTHY, UNHEALTHY）
 * - 自动重连机制（指数退避）
 * - 页面可见性感知（隐藏时暂停，显示时恢复）
 *
 * @example
 * ```tsx
 * function BotList() {
 *   const { events, isConnected, error } = useBotStatusSSE({
 *     onStatusChange: (event) => {
 *       console.log(`Bot ${event.hostname} status: ${event.status}`);
 *       // 刷新 bot 列表
 *       refetch();
 *     },
 *     onHealthChange: (event) => {
 *       console.log(`Bot ${event.hostname} health: ${event.healthStatus}`);
 *     },
 *   });
 *
 *   return <div>{isConnected ? 'Connected' : 'Disconnected'}</div>;
 * }
 * ```
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ensureValidToken, isTokenExpired } from '@/lib/api';
import { API_CONFIG } from '@/config';

const API_BASE_URL = API_CONFIG.baseUrl || '';

/**
 * Bot 状态变更事件
 */
export interface BotStatusEvent {
  type: 'bot-status';
  hostname: string;
  status: 'running' | 'stopped' | 'error' | 'starting' | 'created';
  previousStatus?: string;
  reason?: string;
  timestamp: string;
}

/**
 * Bot 健康状态变更事件
 */
export interface BotHealthEvent {
  type: 'bot-health';
  hostname: string;
  healthStatus: 'HEALTHY' | 'UNHEALTHY' | 'UNKNOWN';
  consecutiveFailures?: number;
  timestamp: string;
}

/**
 * 连接成功事件
 */
export interface ConnectedEvent {
  type: 'connected';
  message: string;
  timestamp: string;
}

/**
 * 心跳事件
 */
export interface HeartbeatEvent {
  type: 'heartbeat';
  timestamp: string;
}

export type BotSSEEvent =
  | BotStatusEvent
  | BotHealthEvent
  | ConnectedEvent
  | HeartbeatEvent;

interface UseBotStatusSSEOptions {
  /** 是否启用 SSE 连接，默认 true */
  enabled?: boolean;
  /** 初始重连延迟（毫秒），默认 1000 */
  initialRetryDelay?: number;
  /** 最大重连延迟（毫秒），默认 30000 */
  maxRetryDelay?: number;
  /** 最大重试次数，默认 10，超过后停止重试 */
  maxRetries?: number;
  /** Bot 状态变更回调 */
  onStatusChange?: (event: BotStatusEvent) => void;
  /** Bot 健康状态变更回调 */
  onHealthChange?: (event: BotHealthEvent) => void;
  /** 连接成功回调 */
  onConnected?: () => void;
  /** 连接断开回调 */
  onDisconnected?: () => void;
}

interface UseBotStatusSSEReturn {
  /** 最近的事件列表（最多保留 50 条） */
  events: BotSSEEvent[];
  /** 是否已连接 */
  isConnected: boolean;
  /** 连接错误 */
  error: Error | null;
  /** 手动重连 */
  reconnect: () => void;
  /** 断开连接 */
  disconnect: () => void;
  /** 清空事件列表 */
  clearEvents: () => void;
}

const MAX_EVENTS = 50;

export function useBotStatusSSE(
  options: UseBotStatusSSEOptions = {},
): UseBotStatusSSEReturn {
  const {
    enabled = true,
    initialRetryDelay = 1000,
    maxRetryDelay = 30000,
    maxRetries = 10,
    onStatusChange,
    onHealthChange,
    onConnected,
    onDisconnected,
  } = options;

  const [events, setEvents] = useState<BotSSEEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const retryDelayRef = useRef(initialRetryDelay);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tokenCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isVisibleRef = useRef(true);

  // 使用 refs 存储回调，避免回调变化导致重连
  const onStatusChangeRef = useRef(onStatusChange);
  const onHealthChangeRef = useRef(onHealthChange);
  const onConnectedRef = useRef(onConnected);
  const onDisconnectedRef = useRef(onDisconnected);

  // 更新 refs
  onStatusChangeRef.current = onStatusChange;
  onHealthChangeRef.current = onHealthChange;
  onConnectedRef.current = onConnected;
  onDisconnectedRef.current = onDisconnected;

  const queryClient = useQueryClient();

  /**
   * 添加事件到列表
   */
  const addEvent = useCallback((event: BotSSEEvent) => {
    setEvents((prev) => {
      const newEvents = [event, ...prev];
      return newEvents.slice(0, MAX_EVENTS);
    });
  }, []);

  /**
   * 清理函数
   */
  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (tokenCheckIntervalRef.current) {
      clearInterval(tokenCheckIntervalRef.current);
      tokenCheckIntervalRef.current = null;
    }
    setIsConnected(false);
  }, []);

  /**
   * 连接到 SSE 端点
   */
  const connect = useCallback(async () => {
    // 清理现有连接
    cleanup();

    try {
      // 确保 token 有效
      const token = await ensureValidToken();
      if (!token) {
        setError(new Error('未登录'));
        return;
      }

      // 构建 SSE URL - 使用专用的 SSE API 路径
      const sseUrl = new URL(`${API_BASE_URL}/sse/bot/status-stream`);
      sseUrl.searchParams.set('access_token', token);

      const eventSource = new EventSource(sseUrl.toString(), {
        withCredentials: true,
      });

      eventSource.onopen = () => {
        setIsConnected(true);
        setError(null);
        retryDelayRef.current = initialRetryDelay;
        retryCountRef.current = 0;
        onConnectedRef.current?.();

        // 启动 token 过期检查
        if (tokenCheckIntervalRef.current) {
          clearInterval(tokenCheckIntervalRef.current);
        }
        tokenCheckIntervalRef.current = setInterval(() => {
          if (isTokenExpired()) {
            console.log('Token 已过期，重新连接 Bot Status SSE...');
            connect().catch((err) => {
              console.error('Token 过期后重连失败:', err);
            });
          }
        }, 30000);
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const eventType = data.type;

          // 添加到事件列表
          addEvent(data as BotSSEEvent);

          // 触发回调
          if (eventType === 'bot-status') {
            onStatusChangeRef.current?.(data as BotStatusEvent);
            // 使 bots 查询缓存失效
            queryClient.invalidateQueries({ queryKey: ['bots'] });
          } else if (eventType === 'bot-health') {
            onHealthChangeRef.current?.(data as BotHealthEvent);
            // 使 bots 查询缓存失效
            queryClient.invalidateQueries({ queryKey: ['bots'] });
          }
        } catch (err) {
          console.error('Bot Status SSE 消息解析失败:', err);
        }
      };

      eventSource.onerror = () => {
        setIsConnected(false);
        onDisconnectedRef.current?.();

        eventSource.close();
        eventSourceRef.current = null;

        // 如果页面可见且启用了 SSE，尝试重连（有重试次数限制）
        if (isVisibleRef.current && enabled) {
          retryCountRef.current++;

          if (retryCountRef.current > maxRetries) {
            setError(
              new Error(`连接失败，已达到最大重试次数 (${maxRetries})`),
            );
            console.error(
              `Bot Status SSE: 已达到最大重试次数 (${maxRetries})，停止重连`,
            );
            return;
          }

          setError(
            new Error(
              `连接断开，正在重试... (${retryCountRef.current}/${maxRetries})`,
            ),
          );

          retryTimeoutRef.current = setTimeout(() => {
            retryDelayRef.current = Math.min(
              retryDelayRef.current * 2,
              maxRetryDelay,
            );
            connect().catch((err) => {
              console.error('重连失败:', err);
            });
          }, retryDelayRef.current);
        }
      };

      eventSourceRef.current = eventSource;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('连接失败'));
      setIsConnected(false);
    }
  }, [
    cleanup,
    enabled,
    initialRetryDelay,
    maxRetryDelay,
    maxRetries,
    queryClient,
    addEvent,
    // 注意：回调使用 refs，不在依赖数组中，避免回调变化导致重连
  ]);

  /**
   * 手动重连
   */
  const reconnect = useCallback(() => {
    retryDelayRef.current = initialRetryDelay;
    retryCountRef.current = 0;
    connect();
  }, [connect, initialRetryDelay]);

  /**
   * 断开连接
   */
  const disconnect = useCallback(() => {
    cleanup();
    setError(null);
    onDisconnected?.();
  }, [cleanup, onDisconnected]);

  /**
   * 清空事件列表
   */
  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  /**
   * 页面可见性变化处理
   */
  useEffect(() => {
    const handleVisibilityChange = () => {
      isVisibleRef.current = document.visibilityState === 'visible';

      if (isVisibleRef.current && enabled && !eventSourceRef.current) {
        connect();
      } else if (!isVisibleRef.current && eventSourceRef.current) {
        cleanup();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, connect, cleanup]);

  /**
   * 初始化连接
   */
  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      cleanup();
    }

    return cleanup;
  }, [enabled, connect, cleanup]);

  return {
    events,
    isConnected,
    error,
    reconnect,
    disconnect,
    clearEvents,
  };
}

export default useBotStatusSSE;
