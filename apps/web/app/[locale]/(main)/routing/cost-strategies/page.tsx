'use client';

import { useState } from 'react';
import { routingAdminApi } from '@/lib/api/contracts/client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
  Skeleton,
  Input,
  Button,
} from '@repo/ui';
import {
  Search,
  TrendingUp,
  DollarSign,
  Zap,
  Target,
  Clock,
  CheckCircle,
  XCircle,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import type { CostStrategy } from '@repo/contracts';

/**
 * 权重条
 */
function WeightBar({
  weight,
  label,
  color,
}: {
  weight: number;
  label: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-xs w-16">{label}</span>
      <div className="flex-1 bg-muted rounded-full h-2">
        <div
          className={`${color} rounded-full h-2 transition-all`}
          style={{ width: `${weight * 100}%` }}
        />
      </div>
      <span className="text-xs w-12 text-right">{(weight * 100).toFixed(0)}%</span>
    </div>
  );
}

/**
 * 成本策略卡片
 */
function CostStrategyCard({ strategy }: { strategy: CostStrategy }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-lg">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">{strategy.name}</CardTitle>
              <CardDescription className="text-xs">
                {strategy.strategyId}
              </CardDescription>
            </div>
          </div>
          <div className="flex gap-1">
            {strategy.isBuiltin && (
              <Badge variant="secondary" className="text-xs">
                内置
              </Badge>
            )}
            <Badge variant={strategy.isActive ? 'default' : 'outline'} className="text-xs">
              {strategy.isActive ? (
                <CheckCircle className="mr-1 h-3 w-3" />
              ) : (
                <XCircle className="mr-1 h-3 w-3" />
              )}
              {strategy.isActive ? '启用' : '禁用'}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 描述 */}
        {strategy.description && (
          <p className="text-sm text-muted-foreground">{strategy.description}</p>
        )}

        {/* 优化权重 */}
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground mb-2">优化权重:</div>
          <WeightBar
            weight={strategy.costWeight}
            label="成本"
            color="bg-green-500"
          />
          <WeightBar
            weight={strategy.performanceWeight}
            label="性能"
            color="bg-blue-500"
          />
          <WeightBar
            weight={strategy.capabilityWeight}
            label="能力"
            color="bg-purple-500"
          />
        </div>

        {/* 约束条件 */}
        <div className="flex flex-wrap gap-2">
          {strategy.maxCostPerRequest && (
            <Badge variant="outline" className="text-xs">
              <DollarSign className="mr-1 h-3 w-3" />
              单次上限: ${strategy.maxCostPerRequest}
            </Badge>
          )}
          {strategy.maxLatencyMs && (
            <Badge variant="outline" className="text-xs">
              <Clock className="mr-1 h-3 w-3" />
              延迟上限: {strategy.maxLatencyMs}ms
            </Badge>
          )}
          {strategy.minCapabilityScore && (
            <Badge variant="outline" className="text-xs">
              <Target className="mr-1 h-3 w-3" />
              能力下限: {strategy.minCapabilityScore}
            </Badge>
          )}
        </div>

        {/* 场景权重 */}
        {strategy.scenarioWeights && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">场景权重:</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {strategy.scenarioWeights.reasoning !== undefined && (
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">推理:</span>
                  <span>{(strategy.scenarioWeights.reasoning * 100).toFixed(0)}%</span>
                </div>
              )}
              {strategy.scenarioWeights.coding !== undefined && (
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">编码:</span>
                  <span>{(strategy.scenarioWeights.coding * 100).toFixed(0)}%</span>
                </div>
              )}
              {strategy.scenarioWeights.creativity !== undefined && (
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">创意:</span>
                  <span>{(strategy.scenarioWeights.creativity * 100).toFixed(0)}%</span>
                </div>
              )}
              {strategy.scenarioWeights.speed !== undefined && (
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">速度:</span>
                  <span>{(strategy.scenarioWeights.speed * 100).toFixed(0)}%</span>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * 成本策略卡片骨架屏
 */
function CostStrategyCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div>
              <Skeleton className="h-4 w-24 mb-1" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
          <Skeleton className="h-5 w-12" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-4 w-full" />
        <div className="space-y-2">
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-2 w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-24" />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * 成本策略管理页面
 */
export default function CostStrategiesPage() {
  const [search, setSearch] = useState('');

  const { data: response, isLoading } =
    routingAdminApi.getCostStrategies.useQuery(
      ['cost-strategies'],
      {},
      { staleTime: 60000 } as any
    );

  const strategyList = response?.body?.data?.list || [];

  // 过滤策略
  const filteredList = strategyList.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.strategyId.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center gap-4">
        <Link href="/routing">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">成本策略管理</h1>
          <p className="text-muted-foreground text-sm">
            定义成本优化策略和约束条件，平衡成本与性能
          </p>
        </div>
      </div>

      {/* 搜索 */}
      <div className="relative max-w-md">
        <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        <Input
          placeholder="搜索成本策略名称..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* 策略列表 */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <CostStrategyCardSkeleton key={i} />
          ))}
        </div>
      ) : filteredList.length === 0 ? (
        <div className="text-muted-foreground py-12 text-center">
          <TrendingUp className="mx-auto mb-4 h-12 w-12 opacity-50" />
          <p>未找到成本策略</p>
          {search && <p className="mt-1 text-sm">尝试其他搜索关键词</p>}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredList.map((strategy) => (
            <CostStrategyCard key={strategy.id} strategy={strategy} />
          ))}
        </div>
      )}
    </div>
  );
}
