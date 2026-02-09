'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Button,
} from '@repo/ui';
import { Terminal, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@repo/ui/lib/utils';
import { useTranslations } from 'next-intl';

interface RealtimeLogsProps {
  logs: string[];
  loading?: boolean;
  onRefresh: () => void;
}

// 尝试格式化 JSON 字符串
function tryFormatJson(str: string): { isJson: boolean; formatted: string } {
  // 查找字符串中的 JSON 部分
  const jsonMatch = str.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (!jsonMatch || !jsonMatch[1]) {
    return { isJson: false, formatted: str };
  }

  try {
    const jsonStr = jsonMatch[1];
    const matchIndex = jsonMatch.index ?? 0;
    const parsed = JSON.parse(jsonStr);
    const formatted = JSON.stringify(parsed, null, 2);
    // 替换原始 JSON 为格式化后的版本
    const prefix = str.substring(0, matchIndex);
    const suffix = str.substring(matchIndex + jsonStr.length);
    return { isJson: true, formatted: `${prefix}\n${formatted}${suffix}` };
  } catch {
    return { isJson: false, formatted: str };
  }
}

export function RealtimeLogs({ logs, loading, onRefresh }: RealtimeLogsProps) {
  const t = useTranslations('bots.detail.dashboard');
  const [expanded, setExpanded] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isAtBottom, setIsAtBottom] = useState(false);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // 检查是否滚动到底部
  const checkIfAtBottom = useCallback(() => {
    const container = logsContainerRef.current;
    if (!container) return true;
    const threshold = 50; // 允许50px的误差
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  }, []);

  // 监听滚动事件
  const handleScroll = useCallback(() => {
    setIsAtBottom(checkIfAtBottom());
  }, [checkIfAtBottom]);

  // 只有在用户已经在底部时才自动滚动
  useEffect(() => {
    if (expanded && isAtBottom && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, expanded, isAtBottom]);

  // 自动刷新
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(onRefresh, 2000);
    return () => clearInterval(interval);
  }, [autoRefresh, onRefresh]);

  const getLogLineClass = (line: string) => {
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('error') || lowerLine.includes('err')) {
      return 'text-red-400';
    }
    if (lowerLine.includes('warn')) {
      return 'text-yellow-400';
    }
    if (lowerLine.includes('info')) {
      return 'text-green-400';
    }
    return 'text-zinc-400';
  };

  // 手动滚动到底部
  const scrollToBottom = () => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
      setIsAtBottom(true);
    }
  };

  // 处理日志格式化
  const formattedLogs = useMemo(() => {
    return logs.map((line) => {
      const { isJson, formatted } = tryFormatJson(line);
      return { original: line, formatted, isJson };
    });
  }, [logs]);

  return (
    <Card>
      {/* 标题栏 */}
      <CardHeader
        className="pb-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="size-4 text-muted-foreground" />
            <CardTitle className="text-lg font-semibold">
              {t('realtimeLogs')}
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              ({logs.length} {t('lines')})
            </span>
          </div>
          <div className="flex items-center gap-3">
            {expanded && (
              <>
                {!isAtBottom && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      scrollToBottom();
                    }}
                  >
                    滚动到底部
                  </Button>
                )}
                <label
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Checkbox
                    checked={autoRefresh}
                    onCheckedChange={(checked) =>
                      setAutoRefresh(checked === true)
                    }
                    className="size-3"
                  />
                  {t('autoRefresh')}
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRefresh();
                  }}
                  disabled={loading}
                >
                  <RefreshCw
                    className={cn('size-3.5', loading && 'animate-spin')}
                  />
                </Button>
              </>
            )}
            {expanded ? (
              <ChevronUp className="size-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>

      {/* 日志内容 - 增大高度以提供更好的阅读体验 */}
      {expanded && (
        <CardContent className="pt-0">
          <div
            ref={logsContainerRef}
            onScroll={handleScroll}
            className="h-[500px] overflow-y-auto overflow-x-auto rounded-lg bg-zinc-900 dark:bg-zinc-950 p-4 font-mono text-xs leading-relaxed"
          >
            {logs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                <p>{t('noLogs')}</p>
              </div>
            ) : (
              <div className="space-y-1">
                {formattedLogs.map((log, index) => (
                  <div
                    key={index}
                    className={cn(
                      'py-1 px-2 rounded hover:bg-zinc-800/50 whitespace-pre-wrap break-words',
                      getLogLineClass(log.original),
                    )}
                  >
                    <span className="text-zinc-500 select-none mr-3 inline-block w-8 text-right">
                      {index + 1}
                    </span>
                    <span className="whitespace-pre-wrap">{log.formatted}</span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
