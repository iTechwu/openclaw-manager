'use client';

import { routingAdminApi, routingAdminClient } from '@/lib/api/contracts/client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
  Skeleton,
  Button,
} from '@repo/ui';
import {
  DollarSign,
  Tag,
  GitBranch,
  TrendingUp,
  RefreshCw,
  CheckCircle,
  XCircle,
  Brain,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AdminOnly } from '@/lib/permissions';

/**
 * 配置状态卡片
 */
function ConfigStatusCard({
  title,
  description,
  loaded,
  count,
  lastUpdate,
  href,
  icon: Icon,
}: {
  title: string;
  description: string;
  loaded: boolean;
  count: number;
  lastUpdate?: string;
  href: string;
  icon: React.ElementType;
}) {
  return (
    <Link href={href}>
      <Card className="hover:border-primary/50 transition-colors cursor-pointer">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-lg">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription className="text-xs">
                  {description}
                </CardDescription>
              </div>
            </div>
            <Badge variant={loaded ? 'default' : 'destructive'}>
              {loaded ? (
                <CheckCircle className="mr-1 h-3 w-3" />
              ) : (
                <XCircle className="mr-1 h-3 w-3" />
              )}
              {loaded ? '已加载' : '未加载'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold">{count}</span>
            {lastUpdate && (
              <span className="text-muted-foreground text-xs">
                更新于 {new Date(lastUpdate).toLocaleString()}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/**
 * 配置状态卡片骨架屏
 */
function ConfigStatusCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div>
              <Skeleton className="mb-1 h-4 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
          <Skeleton className="h-5 w-16" />
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-12" />
      </CardContent>
    </Card>
  );
}

/**
 * 路由配置管理页面
 * 所有用户可查看，仅管理员可修改
 */
export default function RoutingPage() {
  const { data: response, isLoading, refetch } = routingAdminApi.getConfigStatus.useQuery(
    ['routing-config-status'],
    {},
    { staleTime: 30000 } as any
  );

  const status = response?.body?.data;

  const handleRefresh = async () => {
    try {
      await routingAdminClient.refreshConfig({ body: {} });
      await refetch();
      toast.success('配置已刷新');
    } catch {
      toast.error('刷新配置失败');
    }
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">路由配置管理</h1>
          <p className="text-muted-foreground text-sm">
            管理模型定价、能力标签、Fallback 链和成本策略
          </p>
        </div>
        <AdminOnly>
          <Button onClick={handleRefresh} variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新配置
          </Button>
        </AdminOnly>
      </div>

      {/* 配置状态卡片 */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <ConfigStatusCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <ConfigStatusCard
            title="模型目录"
            description="管理各模型的定价信息和能力评分"
            loaded={status?.modelCatalog?.loaded ?? false}
            count={status?.modelCatalog?.count ?? 0}
            lastUpdate={status?.modelCatalog?.lastUpdate}
            href="/routing/model-catalog"
            icon={DollarSign}
          />
          <ConfigStatusCard
            title="能力标签"
            description="定义模型能力标签和路由要求"
            loaded={status?.capabilityTags?.loaded ?? false}
            count={status?.capabilityTags?.count ?? 0}
            lastUpdate={status?.capabilityTags?.lastUpdate}
            href="/routing/capability-tags"
            icon={Tag}
          />
          <ConfigStatusCard
            title="Fallback 链"
            description="配置多模型 Fallback 策略"
            loaded={status?.fallbackChains?.loaded ?? false}
            count={status?.fallbackChains?.count ?? 0}
            lastUpdate={status?.fallbackChains?.lastUpdate}
            href="/routing/fallback-chains"
            icon={GitBranch}
          />
          <ConfigStatusCard
            title="成本策略"
            description="定义成本优化策略和约束条件"
            loaded={status?.costStrategies?.loaded ?? false}
            count={status?.costStrategies?.count ?? 0}
            lastUpdate={status?.costStrategies?.lastUpdate}
            href="/routing/cost-strategies"
            icon={TrendingUp}
          />
          <ConfigStatusCard
            title="复杂度路由"
            description="根据消息复杂度智能选择模型"
            loaded={status?.complexityRoutingConfigs?.loaded ?? false}
            count={status?.complexityRoutingConfigs?.count ?? 0}
            lastUpdate={status?.complexityRoutingConfigs?.lastUpdate}
            href="/routing/complexity-routing"
            icon={Brain}
          />
        </div>
      )}
    </div>
  );
}