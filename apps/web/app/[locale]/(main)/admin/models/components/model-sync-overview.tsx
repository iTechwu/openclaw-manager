'use client';

import { useModelSyncStatus, useModelSync } from '@/hooks/useModels';
import { useProviderKeys } from '@/hooks/useProviderKeys';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Progress,
  Skeleton,
} from '@repo/ui';
import {
  RefreshCw,
  DollarSign,
  Tag,
  CheckCircle,
  Clock,
  AlertCircle,
  Cpu,
  GitBranch,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

export function ModelSyncOverview() {
  const { syncStatus, loading, refresh } = useModelSyncStatus();
  const { keys: providerKeys } = useProviderKeys();
  const {
    syncPricing,
    syncingPricing,
    syncTags,
    syncingTags,
    refreshWithSync,
    refreshingWithSync,
  } = useModelSync();

  const handleSyncPricing = async () => {
    const result = await syncPricing();
    if (result) {
      toast.success(`定价同步完成：${result.synced} 个已同步`);
      refresh();
    }
  };

  const handleSyncTags = async () => {
    const result = await syncTags();
    if (result) {
      toast.success(`标签同步完成：${result.processed} 个已处理`);
      refresh();
    }
  };

  const handleRefreshWithSync = async () => {
    const firstKey = providerKeys[0];
    if (!firstKey) {
      toast.error('请先配置 API 密钥');
      return;
    }
    const result = await refreshWithSync(firstKey.id);
    if (result) {
      toast.success(`刷新并同步完成：${result.refresh.models.length} 个模型`);
      refresh();
    }
  };

  if (loading) {
    return <SyncOverviewSkeleton />;
  }

  const pricingProgress = syncStatus
    ? (syncStatus.catalogSynced / syncStatus.totalModels) * 100
    : 0;
  const tagsProgress = syncStatus
    ? (syncStatus.tagsSynced / syncStatus.totalModels) * 100
    : 0;

  return (
    <div className="space-y-6">
      {/* 快速操作 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">快速操作</CardTitle>
          <CardDescription>一键同步模型定价和能力标签</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={handleSyncPricing}
              disabled={syncingPricing}
            >
              <DollarSign
                className={`mr-2 size-4 ${syncingPricing ? 'animate-spin' : ''}`}
              />
              {syncingPricing ? '同步中...' : '同步定价'}
            </Button>
            <Button
              variant="outline"
              onClick={handleSyncTags}
              disabled={syncingTags}
            >
              <Tag
                className={`mr-2 size-4 ${syncingTags ? 'animate-spin' : ''}`}
              />
              {syncingTags ? '同步中...' : '同步标签'}
            </Button>
            <Button
              onClick={handleRefreshWithSync}
              disabled={refreshingWithSync || providerKeys.length === 0}
            >
              <RefreshCw
                className={`mr-2 size-4 ${refreshingWithSync ? 'animate-spin' : ''}`}
              />
              {refreshingWithSync ? '刷新中...' : '刷新并同步全部'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 同步状态卡片 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatusCard
          title="总模型数"
          value={syncStatus?.totalModels ?? 0}
          icon={Cpu}
          description="系统中的模型总数"
        />
        <StatusCard
          title="定价已同步"
          value={syncStatus?.catalogSynced ?? 0}
          total={syncStatus?.totalModels ?? 0}
          icon={DollarSign}
          description="已关联定价信息的模型"
          progress={pricingProgress}
        />
        <StatusCard
          title="标签已同步"
          value={syncStatus?.tagsSynced ?? 0}
          total={syncStatus?.totalModels ?? 0}
          icon={Tag}
          description="已分配能力标签的模型"
          progress={tagsProgress}
        />
        <StatusCard
          title="最后同步"
          value={
            syncStatus?.lastSyncAt
              ? new Date(syncStatus.lastSyncAt).toLocaleString()
              : '从未'
          }
          icon={Clock}
          description="上次同步时间"
          isDate
        />
      </div>

      {/* 快捷链接 */}
      <div className="grid gap-4 md:grid-cols-3">
        <QuickLinkCard
          title="模型目录"
          description="管理各模型的定价信息"
          href="/routing/model-catalog"
          icon={DollarSign}
        />
        <QuickLinkCard
          title="能力标签"
          description="定义和管理能力标签"
          href="/routing/capability-tags"
          icon={Tag}
        />
        <QuickLinkCard
          title="Fallback 链"
          description="配置模型 Fallback 策略"
          href="/routing/fallback-chains"
          icon={GitBranch}
        />
      </div>
    </div>
  );
}

function StatusCard({
  title,
  value,
  total,
  icon: Icon,
  description,
  progress,
  isDate,
}: {
  title: string;
  value: number | string;
  total?: number;
  icon: React.ElementType;
  description: string;
  progress?: number;
  isDate?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="text-muted-foreground size-4" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {isDate ? (
            <span className="text-base">{value}</span>
          ) : (
            <>
              {value}
              {total !== undefined && (
                <span className="text-muted-foreground text-sm font-normal">
                  {' '}
                  / {total}
                </span>
              )}
            </>
          )}
        </div>
        <p className="text-muted-foreground text-xs">{description}</p>
        {progress !== undefined && (
          <Progress value={progress} className="mt-2 h-1" />
        )}
      </CardContent>
    </Card>
  );
}

function QuickLinkCard({
  title,
  description,
  href,
  icon: Icon,
}: {
  title: string;
  description: string;
  href: string;
  icon: React.ElementType;
}) {
  return (
    <Link href={href}>
      <Card className="hover:border-primary/50 cursor-pointer transition-colors">
        <CardHeader className="flex flex-row items-center gap-3 pb-2">
          <div className="bg-muted flex size-10 items-center justify-center rounded-lg">
            <Icon className="size-5" />
          </div>
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription className="text-xs">{description}</CardDescription>
          </div>
        </CardHeader>
      </Card>
    </Link>
  );
}

function SyncOverviewSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-32" />
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-20" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="mt-1 h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
