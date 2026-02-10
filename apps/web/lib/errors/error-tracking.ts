/**
 * Error Tracking Service
 * 错误追踪服务
 *
 * 用于在生产环境中收集和上报错误信息
 * 支持 Sentry 等第三方错误追踪服务
 */

import type { ErrorInfo } from 'react';

/**
 * 错误上下文信息
 */
export interface ErrorContext {
  /** 组件堆栈 */
  componentStack?: string | null;
  /** 用户 ID */
  userId?: string;
  /** 页面 URL */
  url?: string | null;
  /** 额外的元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 错误追踪配置
 */
interface ErrorTrackingConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 采样率 (0-1) */
  sampleRate: number;
  /** 忽略的错误模式 */
  ignorePatterns: RegExp[];
}

const config: ErrorTrackingConfig = {
  enabled: process.env.NODE_ENV === 'production',
  sampleRate: 1.0,
  ignorePatterns: [
    /ResizeObserver loop/i,
    /Loading chunk \d+ failed/i,
    /Network request failed/i,
  ],
};

/**
 * 检查错误是否应该被忽略
 */
function shouldIgnoreError(error: Error): boolean {
  const message = error.message || '';
  return config.ignorePatterns.some((pattern) => pattern.test(message));
}

/**
 * 检查是否应该采样
 */
function shouldSample(): boolean {
  return Math.random() < config.sampleRate;
}

/**
 * 获取用户信息
 */
function getUserId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      return user.id;
    }
  } catch {
    // ignore
  }
  return undefined;
}

/**
 * 追踪错误
 * @param error 错误对象
 * @param errorInfo React 错误信息
 * @param context 额外上下文
 */
export function trackError(
  error: Error,
  errorInfo?: ErrorInfo,
  context?: Partial<ErrorContext>,
): void {
  if (!config.enabled) {
    return;
  }

  if (shouldIgnoreError(error)) {
    return;
  }

  if (!shouldSample()) {
    return;
  }

  const errorContext: ErrorContext = {
    componentStack: errorInfo?.componentStack,
    userId: getUserId(),
    url: typeof window !== 'undefined' ? window.location.href : undefined,
    ...context,
  };

  // 发送到错误追踪服务
  sendToErrorService(error, errorContext);
}

/**
 * 发送错误到追踪服务
 */
function sendToErrorService(error: Error, context: ErrorContext): void {
  // 如果配置了 Sentry，使用 Sentry
  if (
    typeof window !== 'undefined' &&
    (window as unknown as { Sentry?: unknown }).Sentry
  ) {
    const Sentry = (
      window as unknown as {
        Sentry: { captureException: (e: Error, c: unknown) => void };
      }
    ).Sentry;
    Sentry.captureException(error, {
      extra: context,
    });
    return;
  }

  // 否则发送到自定义错误收集端点
  const errorPayload = {
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...context,
    timestamp: new Date().toISOString(),
  };

  // 使用 sendBeacon 确保错误能够被发送
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const blob = new Blob([JSON.stringify(errorPayload)], {
      type: 'application/json',
    });
    navigator.sendBeacon('/api/error-report', blob);
  } else {
    // 降级到 fetch
    fetch('/api/error-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(errorPayload),
      keepalive: true,
    }).catch(() => {
      // 静默失败，避免错误上报本身导致问题
    });
  }
}

/**
 * 追踪未捕获的 Promise 错误
 */
export function trackUnhandledRejection(event: PromiseRejectionEvent): void {
  const error =
    event.reason instanceof Error
      ? event.reason
      : new Error(String(event.reason));

  trackError(error, undefined, {
    metadata: { type: 'unhandledRejection' },
  });
}

/**
 * 追踪全局错误
 */
export function trackGlobalError(event: ErrorEvent): void {
  const error =
    event.error instanceof Error ? event.error : new Error(event.message);

  trackError(error, undefined, {
    metadata: {
      type: 'globalError',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    },
  });
}

/**
 * 初始化全局错误追踪
 */
export function initErrorTracking(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('unhandledrejection', trackUnhandledRejection);
  window.addEventListener('error', trackGlobalError);
}

/**
 * 清理全局错误追踪
 */
export function cleanupErrorTracking(): void {
  if (typeof window === 'undefined') return;

  window.removeEventListener('unhandledrejection', trackUnhandledRejection);
  window.removeEventListener('error', trackGlobalError);
}
