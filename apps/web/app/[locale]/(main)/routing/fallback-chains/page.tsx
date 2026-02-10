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
  GitBranch,
  ArrowRight,
  Clock,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import type { FallbackChain, FallbackModel } from '@repo/contracts';

/**
 * 模型节点
 */
function ModelNode({ model, isLast }: { model: FallbackModel; isLast: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="bg-muted rounded-lg px-3 py-2 text-sm">
        <div className="font-medium">{model.model}</div>
        <div className="text-xs text-muted-foreground">
          {model.vendor} · {model.protocol}
        </div>
        {model.features && (
          <div className="flex gap-1 mt-1">
            {model.features.extendedThinking && (
              <Badge variant="outline" className="text-xs">ET</Badge>
            )}
            {model.features.cacheControl && (
              <Badge variant="outline" className="text-xs">CC</Badge>
            )}
          </div>
        )}
      </div>
      {!isLast && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
    </div>
  );
}

/**
 * Fallback 链卡片
 */
function FallbackChainCard({ chain }: { chain: FallbackChain }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-lg">
              <GitBranch className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">{chain.name}</CardTitle>
              <CardDescription className="text-xs">
                {chain.chainId}
              </CardDescription>
            </div>
          </div>
          <div className="flex gap-1">
            {chain.isBuiltin && (
              <Badge variant="secondary" className="text-xs">
                内置
              </Badge>
            )}
            <Badge variant={chain.isActive ? 'default' : 'outline'} className="text-xs">
              {chain.isActive ? (
                <CheckCircle className="mr-1 h-3 w-3" />
              ) : (
                <XCircle className="mr-1 h-3 w-3" />
              )}
              {chain.isActive ? '启用' : '禁用'}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 描述 */}
        {chain.description && (
          <p className="text-sm text-muted-foreground">{chain.description}</p>
        )}

        {/* 模型链 */}
        <div>
          <div className="text-xs text-muted-foreground mb-2">Fallback 链:</div>
          <div className="flex flex-wrap items-center gap-2">
            {chain.models.map((model, index) => (
              <ModelNode
                key={`${model.vendor}-${model.model}`}
                model={model}
                isLast={index === chain.models.length - 1}
              />
            ))}
          </div>
        </div>

        {/* 触发条件 */}
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">触发条件:</div>
          <div className="flex flex-wrap gap-2">
            {chain.triggerStatusCodes.length > 0 && (
              <div className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs">
                  状态码: {chain.triggerStatusCodes.join(', ')}
                </span>
              </div>
            )}
            {chain.triggerErrorTypes.length > 0 && (
              <div className="flex items-center gap-1">
                <XCircle className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs">
                  错误类型: {chain.triggerErrorTypes.join(', ')}
                </span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs">
                超时: {chain.triggerTimeoutMs / 1000}s
              </span>
            </div>
          </div>
        </div>

        {/* 行为配置 */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="text-xs">
            <RefreshCw className="mr-1 h-3 w-3" />
            最大重试: {chain.maxRetries}
          </Badge>
          <Badge variant="outline" className="text-xs">
            <Clock className="mr-1 h-3 w-3" />
            重试延迟: {chain.retryDelayMs}ms
          </Badge>
          {chain.preserveProtocol && (
            <Badge variant="secondary" className="text-xs">
              保持协议
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Fallback 链卡片骨架屏
 */
function FallbackChainCardSkeleton() {
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
        <div className="flex gap-2">
          <Skeleton className="h-12 w-24" />
          <Skeleton className="h-12 w-24" />
          <Skeleton className="h-12 w-24" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Fallback 链管理页面
 */
export default function FallbackChainsPage() {
  const [search, setSearch] = useState('');

  const { data: response, isLoading } =
    routingAdminApi.getFallbackChains.useQuery(
      ['fallback-chains'],
      {},
      { staleTime: 60000 } as any
    );

  const chainList = response?.body?.data?.list || [];

  // 过滤链
  const filteredList = chainList.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.chainId.toLowerCase().includes(search.toLowerCase())
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
          <h1 className="text-2xl font-bold">Fallback 链管理</h1>
          <p className="text-muted-foreground text-sm">
            配置多模型 Fallback 策略，确保服务高可用性
          </p>
        </div>
      </div>

      {/* 搜索 */}
      <div className="relative max-w-md">
        <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        <Input
          placeholder="搜索 Fallback 链名称..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* 链列表 */}
      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <FallbackChainCardSkeleton key={i} />
          ))}
        </div>
      ) : filteredList.length === 0 ? (
        <div className="text-muted-foreground py-12 text-center">
          <GitBranch className="mx-auto mb-4 h-12 w-12 opacity-50" />
          <p>未找到 Fallback 链</p>
          {search && <p className="mt-1 text-sm">尝试其他搜索关键词</p>}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredList.map((chain) => (
            <FallbackChainCard key={chain.id} chain={chain} />
          ))}
        </div>
      )}
    </div>
  );
}
