'use client';

import {
  useBotUsageBreakdown,
  useBotUsageStats,
  useBotUsageTrend,
} from '@/hooks/useBotUsage';
import { Link } from '@/i18n/navigation';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@repo/ui';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Building2,
  CheckCircle,
  ChevronDown,
  Clock,
  Cpu,
  DollarSign,
  Download,
  Info,
  Lightbulb,
  Minus,
  RefreshCw,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';

// ============================================
// Types
// ============================================

type Period = 'day' | 'week' | 'month';
type GroupBy = 'vendor' | 'model' | 'status' | 'protocol';
type SortBy = 'count' | 'tokens' | 'cost';

interface TrendPoint {
  timestamp: Date;
  requestTokens: number;
  responseTokens: number;
  requestCount: number;
  errorCount: number;
  estimatedCost: number;
}

interface BreakdownItem {
  key: string;
  requestTokens: number;
  responseTokens: number;
  requestCount: number;
  percentage: number;
  estimatedCost: number;
}

interface Stats {
  totalTokens: number;
  requestTokens: number;
  responseTokens: number;
  requestCount: number;
  successCount: number;
  errorCount: number;
  errorRate: number;
  avgDurationMs: number | null;
  estimatedCost: number;
}

// ============================================
// Helper Functions
// ============================================

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
}

function formatTimestamp(timestamp: Date, granularity: 'hour' | 'day'): string {
  const date = new Date(timestamp);
  if (granularity === 'hour') {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
  });
}

function getStatusColor(errorRate: number): 'success' | 'warning' | 'error' {
  if (errorRate === 0) return 'success';
  if (errorRate < 5) return 'warning';
  return 'error';
}

// ============================================
// StatCard Component
// ============================================

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  loading,
  trend,
  trendValue,
  status,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  description?: string;
  loading?: boolean;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: string;
  status?: 'success' | 'warning' | 'error';
}) {
  const getTrendIcon = () => {
    if (!trend) return null;
    switch (trend) {
      case 'up':
        return <ArrowUp className="h-3 w-3" />;
      case 'down':
        return <ArrowDown className="h-3 w-3" />;
      default:
        return <Minus className="h-3 w-3" />;
    }
  };

  const getTrendColor = () => {
    if (!trend) return '';
    switch (trend) {
      case 'up':
        return 'text-red-500'; // For cost/tokens, up is usually "more cost"
      case 'down':
        return 'text-green-500';
      default:
        return 'text-muted-foreground';
    }
  };

  const getStatusStyles = () => {
    switch (status) {
      case 'error':
        return 'border-red-500/50 bg-red-500/5';
      case 'warning':
        return 'border-amber-500/50 bg-amber-500/5';
      case 'success':
        return 'border-green-500/50 bg-green-500/5';
      default:
        return '';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-4" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-20" />
          {description && <Skeleton className="mt-1 h-3 w-32" />}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`transition-all duration-200 ${getStatusStyles()}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="text-muted-foreground h-4 w-4" />
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <div className="text-2xl font-bold">{value}</div>
          {trend && trendValue && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={`flex items-center gap-0.5 text-xs ${getTrendColor()}`}
                >
                  {getTrendIcon()}
                  <span>{trendValue}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <span>Compared to previous period</span>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        {description && (
          <p className="text-muted-foreground text-xs">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// InsightsPanel Component
// ============================================

function InsightsPanel({
  stats,
  trend,
  breakdown,
  loading,
  period,
}: {
  stats: Stats | null | undefined;
  trend: TrendPoint[] | undefined;
  breakdown: BreakdownItem[] | undefined;
  loading: boolean;
  period: Period;
}) {
  const t = useTranslations('usage');

  const insights = useMemo(() => {
    if (loading || !stats || !trend || trend.length === 0) {
      return [];
    }

    const result: Array<{
      type: 'info' | 'warning' | 'success';
      icon: React.ElementType;
      text: string;
    }> = [];

    // 1. Peak usage time
    const peakPoint = trend.reduce((max, point) =>
      point.requestCount > max.requestCount ? point : max,
    );
    if (peakPoint.requestCount > 0) {
      const granularity = period === 'day' ? 'hour' : 'day';
      result.push({
        type: 'info',
        icon: Activity,
        text: t('insights.peakUsage', {
          time: formatTimestamp(peakPoint.timestamp, granularity),
        }),
      });
    }

    // 2. Error rate analysis
    if (stats.errorRate > 5) {
      result.push({
        type: 'warning',
        icon: AlertTriangle,
        text: t('insights.errorRateHigh'),
      });
    } else if (stats.errorRate > 0) {
      result.push({
        type: 'success',
        icon: CheckCircle,
        text: t('insights.errorRateNormal'),
      });
    }

    // 3. Average tokens per request
    if (stats.requestCount > 0) {
      const avgTokens = Math.round(stats.totalTokens / stats.requestCount);
      result.push({
        type: 'info',
        icon: Zap,
        text: t('insights.avgTokensPerRequest', { count: avgTokens }),
      });
    }

    // 4. Top model (if breakdown available)
    if (breakdown && breakdown.length > 0) {
      const topItem = breakdown[0];
      if (topItem) {
        result.push({
          type: 'info',
          icon: Cpu,
          text: t('insights.topModel', { model: topItem.key }),
        });
      }
    }

    return result;
  }, [stats, trend, breakdown, loading, period, t]);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-5 w-24" />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-6 w-32" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (insights.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-500" />
          <CardTitle className="text-base">{t('insights.title')}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-wrap gap-2">
          {insights.map((insight, index) => {
            const colors = {
              info: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
              warning: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
              success: 'bg-green-500/10 text-green-600 border-green-500/20',
            };
            return (
              <Badge
                key={index}
                variant="outline"
                className={`px-2 py-1 text-xs ${colors[insight.type]}`}
              >
                <insight.icon className="mr-1 h-3 w-3" />
                {insight.text}
              </Badge>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// SimpleTrendChart Component
// ============================================

function SimpleTrendChart({
  data,
  loading,
  noDataText,
  inputLabel,
  outputLabel,
  granularity,
}: {
  data: TrendPoint[];
  loading?: boolean;
  noDataText: string;
  inputLabel: string;
  outputLabel: string;
  granularity: 'hour' | 'day';
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [zoomRange, setZoomRange] = useState<{
    start: number;
    end: number;
  } | null>(null);

  // Data sampling for performance
  const sampledData = useMemo(() => {
    if (!data || data.length <= 100) return data;
    const step = Math.ceil(data.length / 100);
    return data.filter((_, index) => index % step === 0);
  }, [data]);

  // Apply zoom
  const displayData = useMemo(() => {
    if (!sampledData) return [];
    if (!zoomRange) return sampledData;
    return sampledData.slice(zoomRange.start, zoomRange.end);
  }, [sampledData, zoomRange]);

  // Calculate max value for scaling
  const maxValue = useMemo(() => {
    if (!displayData || displayData.length === 0) return 0;
    return Math.max(
      ...displayData.map((d) => Math.max(d.requestTokens, d.responseTokens)),
    );
  }, [displayData]);

  // Zoom handlers
  const handleZoomIn = () => {
    if (!sampledData || sampledData.length < 10) return;
    const currentStart = zoomRange?.start ?? 0;
    const currentEnd = zoomRange?.end ?? sampledData.length;
    const range = currentEnd - currentStart;
    if (range <= 10) return;

    const mid = (currentStart + currentEnd) / 2;
    const newRange = Math.max(10, Math.floor(range / 2));
    setZoomRange({
      start: Math.max(0, Math.floor(mid - newRange / 2)),
      end: Math.min(sampledData.length, Math.floor(mid + newRange / 2)),
    });
  };

  const handleZoomOut = () => {
    if (!sampledData) return;
    if (!zoomRange) return;

    const range = zoomRange.end - zoomRange.start;
    const newRange = Math.min(sampledData.length, range * 2);
    const mid = (zoomRange.start + zoomRange.end) / 2;

    setZoomRange({
      start: Math.max(0, Math.floor(mid - newRange / 2)),
      end: Math.min(sampledData.length, Math.floor(mid + newRange / 2)),
    });
  };

  const handleResetZoom = () => {
    setZoomRange(null);
  };

  // Chart bars rendering
  const chartBars = useMemo(() => {
    if (!displayData || maxValue === 0) return null;

    return displayData.map((point, index) => {
      const requestHeight = (point.requestTokens / maxValue) * 100;
      const responseHeight = (point.responseTokens / maxValue) * 100;
      const isHovered = hoveredIndex === index;
      const isSelected = selectedIndex === index;
      const isActive = isHovered || isSelected;

      return (
        <Tooltip key={index}>
          <TooltipTrigger asChild>
            <div
              className={`flex flex-1 flex-col justify-end h-full cursor-pointer transition-all duration-200 ${
                isActive ? 'scale-105 z-10' : ''
              }`}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              onClick={() =>
                setSelectedIndex(selectedIndex === index ? null : index)
              }
            >
              <div className="flex w-full items-end gap-0.5 h-full">
                <div
                  className={`flex-1 rounded-t transition-all duration-200 min-h-[2px] ${
                    isActive
                      ? 'bg-blue-600 shadow-lg shadow-blue-500/50'
                      : 'bg-blue-500 hover:bg-blue-600'
                  }`}
                  style={{ height: `${requestHeight}%` }}
                />
                <div
                  className={`flex-1 rounded-t transition-all duration-200 min-h-[2px] ${
                    isActive
                      ? 'bg-green-600 shadow-lg shadow-green-500/50'
                      : 'bg-green-500 hover:bg-green-600'
                  }`}
                  style={{ height: `${responseHeight}%` }}
                />
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="bg-popover text-popover-foreground border shadow-lg"
            sideOffset={8}
          >
            <div className="space-y-1.5 px-1 py-0.5">
              <div className="font-medium text-xs">
                {formatTimestamp(point.timestamp, granularity)}
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="h-2 w-2 rounded bg-blue-500" />
                <span>
                  {inputLabel}: {point.requestTokens.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="h-2 w-2 rounded bg-green-500" />
                <span>
                  {outputLabel}: {point.responseTokens.toLocaleString()}
                </span>
              </div>
              <div className="border-t pt-1 mt-1 text-xs font-medium">
                Total: {(point.requestTokens + point.responseTokens).toLocaleString()}
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      );
    });
  }, [
    displayData,
    maxValue,
    hoveredIndex,
    selectedIndex,
    inputLabel,
    outputLabel,
    granularity,
  ]);

  const selectedPoint =
    selectedIndex !== null ? displayData?.[selectedIndex] : null;

  if (loading) {
    return (
      <div className="flex h-[300px] items-center justify-center">
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-muted-foreground flex h-[300px] items-center justify-center">
        {noDataText}
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Zoom controls */}
      <div className="flex items-center justify-end gap-2 mb-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleZoomIn}
          disabled={!sampledData || sampledData.length < 10 || (zoomRange !== null && zoomRange.end - zoomRange.start <= 10)}
          className="h-7 px-2 text-xs"
        >
          Zoom In
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleZoomOut}
          disabled={!zoomRange}
          className="h-7 px-2 text-xs"
        >
          Zoom Out
        </Button>
        {zoomRange && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetZoom}
            className="h-7 px-2 text-xs"
          >
            Reset
          </Button>
        )}
      </div>

      <div className="flex h-[280px] w-full items-end gap-1">{chartBars}</div>

      {/* Selected data detail card */}
      {selectedPoint && (
        <div className="mt-4 p-4 rounded-lg border bg-muted/50 animate-in fade-in-0 slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-primary animate-pulse" />
              <span className="font-medium text-sm">
                {formatTimestamp(selectedPoint.timestamp, granularity)}
              </span>
            </div>
            <button
              onClick={() => setSelectedIndex(null)}
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              Click to deselect
            </button>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <div className="h-2 w-2 rounded bg-blue-500" />
                <span className="text-xs text-muted-foreground">{inputLabel}</span>
              </div>
              <div className="font-bold text-lg">
                {selectedPoint.requestTokens.toLocaleString()}
              </div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <div className="h-2 w-2 rounded bg-green-500" />
                <span className="text-xs text-muted-foreground">{outputLabel}</span>
              </div>
              <div className="font-bold text-lg">
                {selectedPoint.responseTokens.toLocaleString()}
              </div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Activity className="h-2 w-2 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Requests</span>
              </div>
              <div className="font-bold text-lg">
                {selectedPoint.requestCount}
              </div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <DollarSign className="h-2 w-2 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Cost</span>
              </div>
              <div className="font-bold text-lg text-primary">
                ${selectedPoint.estimatedCost.toFixed(4)}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-2 flex justify-center gap-4 text-xs">
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded bg-blue-500" />
          <span>{inputLabel}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded bg-green-500" />
          <span>{outputLabel}</span>
        </div>
      </div>
    </div>
  );
}

// ============================================
// BreakdownList Component
// ============================================

function BreakdownList({
  data,
  loading,
  noDataText,
  requestsLabel,
  groupBy,
  sortBy,
  onSortChange,
}: {
  data: BreakdownItem[];
  loading?: boolean;
  noDataText: string;
  requestsLabel: string;
  groupBy: GroupBy;
  sortBy: SortBy;
  onSortChange: (sortBy: SortBy) => void;
}) {
  const t = useTranslations('usage');

  const getIcon = (key: string) => {
    if (groupBy === 'vendor') return Building2;
    if (groupBy === 'model') return Cpu;
    if (groupBy === 'status') return key === 'success' ? CheckCircle : AlertCircle;
    if (groupBy === 'protocol') return Zap;
    return Activity;
  };

  const getIconColor = (key: string) => {
    if (groupBy === 'vendor') return 'text-blue-500';
    if (groupBy === 'model') return 'text-purple-500';
    if (groupBy === 'status') return key === 'success' ? 'text-green-500' : 'text-red-500';
    if (groupBy === 'protocol') return 'text-amber-500';
    return 'text-muted-foreground';
  };

  const getBarColor = (key: string) => {
    if (groupBy === 'vendor') return 'bg-blue-500';
    if (groupBy === 'model') return 'bg-purple-500';
    if (groupBy === 'status') return key === 'success' ? 'bg-green-500' : 'bg-red-500';
    if (groupBy === 'protocol') return 'bg-amber-500';
    return 'bg-primary';
  };

  // Sort data
  const sortedData = useMemo(() => {
    if (!data) return [];
    const sorted = [...data];
    switch (sortBy) {
      case 'count':
        return sorted.sort((a, b) => b.requestCount - a.requestCount);
      case 'tokens':
        return sorted.sort(
          (a, b) =>
            b.requestTokens +
            b.responseTokens -
            (a.requestTokens + a.responseTokens),
        );
      case 'cost':
        return sorted.sort((a, b) => b.estimatedCost - a.estimatedCost);
      default:
        return sorted;
    }
  }, [data, sortBy]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-muted-foreground py-8 text-center">{noDataText}</div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Sort dropdown */}
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground">{t('breakdown.sortBy')}:</span>
        <Select value={sortBy} onValueChange={(v) => onSortChange(v as SortBy)}>
          <SelectTrigger className="w-32 h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="count">{t('breakdown.sortOptions.count')}</SelectItem>
            <SelectItem value="tokens">{t('breakdown.sortOptions.tokens')}</SelectItem>
            <SelectItem value="cost">{t('breakdown.sortOptions.cost')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {sortedData.map((item) => {
        const Icon = getIcon(item.key);
        const iconColor = getIconColor(item.key);
        const barColor = getBarColor(item.key);

        return (
          <div
            key={item.key}
            className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
          >
            <div className="flex-1 flex items-center gap-3">
              <div className={`p-2 rounded-md bg-muted ${iconColor}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="font-medium">{item.key}</div>
                <div className="text-muted-foreground text-sm">
                  {item.requestCount.toLocaleString()} {requestsLabel} ·{' '}
                  {(item.requestTokens + item.responseTokens).toLocaleString()}{' '}
                  tokens
                </div>
                {/* Percentage bar */}
                <div className="mt-1.5 h-1.5 w-full max-w-[200px] rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-medium">{item.percentage.toFixed(1)}%</div>
              <div className="text-muted-foreground text-sm">
                ${item.estimatedCost.toFixed(2)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================
// Export Functions
// ============================================

function exportToCSV(data: TrendPoint[], filename: string) {
  const headers = ['Timestamp', 'Input Tokens', 'Output Tokens', 'Total Tokens', 'Requests', 'Errors', 'Cost'];
  const rows = data.map((d) => [
    new Date(d.timestamp).toISOString(),
    d.requestTokens,
    d.responseTokens,
    d.requestTokens + d.responseTokens,
    d.requestCount,
    d.errorCount,
    d.estimatedCost.toFixed(4),
  ]);

  const csvContent = [headers, ...rows].map((row) => row.join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.csv`;
  link.click();
}

function exportToJSON(data: TrendPoint[], stats: Stats | null | undefined, filename: string) {
  const exportData = {
    exportedAt: new Date().toISOString(),
    stats: stats,
    trend: data.map((d) => ({
      timestamp: new Date(d.timestamp).toISOString(),
      requestTokens: d.requestTokens,
      responseTokens: d.responseTokens,
      totalTokens: d.requestTokens + d.responseTokens,
      requestCount: d.requestCount,
      errorCount: d.errorCount,
      estimatedCost: d.estimatedCost,
    })),
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: 'application/json',
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.json`;
  link.click();
}

// ============================================
// Alert Banner Component
// ============================================

function AlertBanner({
  stats,
  loading,
}: {
  stats: Stats | null | undefined;
  loading: boolean;
}) {
  const t = useTranslations('usage');

  if (loading || !stats) return null;

  const alerts: Array<{ type: 'warning' | 'error'; message: string }> = [];

  // Error rate alert
  if (stats.errorRate > 10) {
    alerts.push({
      type: 'error',
      message: t('alerts.errorRateWarning', { rate: 10 }),
    });
  } else if (stats.errorRate > 5) {
    alerts.push({
      type: 'warning',
      message: t('alerts.errorRateWarning', { rate: 5 }),
    });
  }

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((alert, index) => (
        <Alert
          key={index}
          variant={alert.type === 'error' ? 'destructive' : 'default'}
          className={alert.type === 'warning' ? 'border-amber-500 bg-amber-500/10' : ''}
        >
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t('alerts.warning')}</AlertTitle>
          <AlertDescription>{alert.message}</AlertDescription>
        </Alert>
      ))}
    </div>
  );
}

// ============================================
// Main Page Component
// ============================================

export default function BotUsagePage() {
  const params = useParams<{ hostname: string }>();
  const hostname = params.hostname;
  const t = useTranslations('usage');

  const [period, setPeriod] = useState<Period>('week');
  const [groupBy, setGroupBy] = useState<GroupBy>('vendor');
  const [sortBy, setSortBy] = useState<SortBy>('count');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  // Calculate date range
  const dateRange = useMemo(() => {
    const now = new Date();
    const endDate = new Date(now);
    let startDate: Date;

    switch (period) {
      case 'day':
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 7);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'month':
        startDate = new Date(now);
        startDate.setMonth(startDate.getMonth() - 1);
        startDate.setHours(0, 0, 0, 0);
        break;
    }

    return { startDate, endDate };
  }, [period]);

  // Fetch data
  const {
    data: statsResponse,
    isLoading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useBotUsageStats({
    hostname,
    period,
  });
  const stats = statsResponse?.body?.data;

  const {
    data: trendResponse,
    isLoading: trendLoading,
    error: trendError,
    refetch: refetchTrend,
  } = useBotUsageTrend({
    hostname,
    granularity: period === 'day' ? 'hour' : 'day',
    startDate: dateRange.startDate.toISOString(),
    endDate: dateRange.endDate.toISOString(),
  });
  const trend = trendResponse?.body?.data;

  const {
    data: breakdownResponse,
    isLoading: breakdownLoading,
    error: breakdownError,
    refetch: refetchBreakdown,
  } = useBotUsageBreakdown({
    hostname,
    groupBy,
    startDate: dateRange.startDate.toISOString(),
    endDate: dateRange.endDate.toISOString(),
  });
  const breakdown = breakdownResponse?.body?.data;

  const refetchAll = () => {
    refetchStats();
    refetchTrend();
    refetchBreakdown();
  };

  // Check for errors
  const hasError = !!statsError || !!trendError || !!breakdownError;

  // Check for no data
  const hasNoData =
    !statsLoading && !stats?.requestCount && !stats?.totalTokens;

  // Export handlers
  const handleExportCSV = () => {
    if (trend?.dataPoints) {
      exportToCSV(trend.dataPoints, `bot-usage-${hostname}-${period}`);
    }
    setExportMenuOpen(false);
  };

  const handleExportJSON = () => {
    if (trend?.dataPoints) {
      exportToJSON(trend.dataPoints, stats, `bot-usage-${hostname}-${period}`);
    }
    setExportMenuOpen(false);
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/bots"
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold">{t('title')}</h1>
              <p className="text-muted-foreground text-sm">{hostname}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Export dropdown */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExportMenuOpen(!exportMenuOpen)}
                className="h-8"
              >
                <Download className="h-4 w-4 mr-1" />
                {t('export.title')}
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
              {exportMenuOpen && (
                <div className="absolute right-0 mt-1 w-36 bg-popover border rounded-md shadow-lg z-10">
                  <button
                    onClick={handleExportCSV}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    {t('export.csv')}
                  </button>
                  <button
                    onClick={handleExportJSON}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    {t('export.json')}
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={refetchAll}
              className="text-muted-foreground hover:text-foreground p-2 rounded-md hover:bg-muted"
              title={t('refresh')}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <Select
              value={period}
              onValueChange={(v) => setPeriod(v as Period)}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">{t('periods.today')}</SelectItem>
                <SelectItem value="week">{t('periods.week')}</SelectItem>
                <SelectItem value="month">{t('periods.month')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Alert Banner */}
        <AlertBanner stats={stats} loading={statsLoading} />

        {/* Error Alert */}
        {hasError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t('noData')}</AlertTitle>
            <AlertDescription>{t('loadError')}</AlertDescription>
          </Alert>
        )}

        {/* No Data Alert */}
        {hasNoData && !hasError && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t('noData')}</AlertTitle>
            <AlertDescription>{t('noDataDescription')}</AlertDescription>
          </Alert>
        )}

        {/* Stats Cards - Now 5 cards including Performance */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <StatCard
            title={t('stats.totalTokens')}
            value={formatNumber(stats?.totalTokens || 0)}
            icon={Zap}
            description={`${t('stats.inputTokens')} ${formatNumber(stats?.requestTokens || 0)} / ${t('stats.outputTokens')} ${formatNumber(stats?.responseTokens || 0)}`}
            loading={statsLoading}
          />
          <StatCard
            title={t('stats.requests')}
            value={formatNumber(stats?.requestCount || 0)}
            icon={Activity}
            description={`${t('stats.success')} ${stats?.successCount || 0} / ${t('stats.failed')} ${stats?.errorCount || 0}`}
            loading={statsLoading}
          />
          <StatCard
            title={t('stats.errorRate')}
            value={`${(stats?.errorRate || 0).toFixed(1)}%`}
            icon={AlertTriangle}
            description={`${stats?.errorCount || 0} ${t('stats.errors')}`}
            loading={statsLoading}
            status={getStatusColor(stats?.errorRate || 0)}
          />
          <StatCard
            title={t('stats.estimatedCost')}
            value={`$${(stats?.estimatedCost || 0).toFixed(2)}`}
            icon={DollarSign}
            description={t('stats.costDescription')}
            loading={statsLoading}
          />
          <StatCard
            title={t('stats.avgResponseTime')}
            value={stats?.avgDurationMs ? `${stats.avgDurationMs.toFixed(0)} ms` : '-'}
            icon={Clock}
            description={stats?.requestCount ? t('stats.basedOnRequests', { count: stats.requestCount }) : ''}
            loading={statsLoading}
          />
        </div>

        {/* Insights Panel */}
        <InsightsPanel
          stats={stats}
          trend={trend?.dataPoints}
          breakdown={breakdown?.groups}
          loading={statsLoading || trendLoading}
          period={period}
        />

        {/* Detailed Data Tabs */}
        <Tabs defaultValue="trend" className="space-y-4">
          <TabsList>
            <TabsTrigger value="trend">
              <TrendingUp className="mr-2 h-4 w-4" />
              {t('tabs.trend')}
            </TabsTrigger>
            <TabsTrigger value="breakdown">
              <Activity className="mr-2 h-4 w-4" />
              {t('tabs.breakdown')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="trend">
            <Card>
              <CardHeader>
                <CardTitle>{t('trend.title')}</CardTitle>
                <CardDescription>
                  {period === 'day' ? t('trend.byHour') : t('trend.byDay')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SimpleTrendChart
                  data={trend?.dataPoints || []}
                  loading={trendLoading}
                  noDataText={t('noData')}
                  inputLabel={t('trend.inputToken')}
                  outputLabel={t('trend.outputToken')}
                  granularity={period === 'day' ? 'hour' : 'day'}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="breakdown">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>{t('breakdown.title')}</CardTitle>
                  <CardDescription>{t('breakdown.description')}</CardDescription>
                </div>
                <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vendor">{t('breakdown.byVendor')}</SelectItem>
                    <SelectItem value="model">{t('breakdown.byModel')}</SelectItem>
                    <SelectItem value="status">{t('breakdown.byStatus')}</SelectItem>
                    <SelectItem value="protocol">{t('breakdown.byProtocol')}</SelectItem>
                  </SelectContent>
                </Select>
              </CardHeader>
              <CardContent>
                <BreakdownList
                  data={breakdown?.groups || []}
                  loading={breakdownLoading}
                  noDataText={t('noData')}
                  requestsLabel={t('breakdown.requests')}
                  groupBy={groupBy}
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
