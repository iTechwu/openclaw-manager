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
  DollarSign,
  Brain,
  Code,
  Sparkles,
  Zap,
  Eye,
  MessageSquare,
  CheckCircle,
  XCircle,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import type { ModelPricing } from '@repo/contracts';

/**
 * 能力评分条
 */
function ScoreBar({ score, label }: { score: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-xs w-16">{label}</span>
      <div className="flex-1 bg-muted rounded-full h-2">
        <div
          className="bg-primary rounded-full h-2 transition-all"
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs w-8 text-right">{score}</span>
    </div>
  );
}

/**
 * 特性徽章
 */
function FeatureBadge({
  supported,
  label,
}: {
  supported: boolean;
  label: string;
}) {
  return (
    <Badge variant={supported ? 'default' : 'outline'} className="text-xs">
      {supported ? (
        <CheckCircle className="mr-1 h-3 w-3" />
      ) : (
        <XCircle className="mr-1 h-3 w-3" />
      )}
      {label}
    </Badge>
  );
}

/**
 * 模型定价卡片
 */
function ModelPricingCard({ pricing }: { pricing: ModelPricing }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">
              {pricing.displayName || pricing.model}
            </CardTitle>
            <CardDescription className="text-xs">
              {pricing.vendor} · {pricing.model}
            </CardDescription>
          </div>
          <div className="flex gap-1">
            {pricing.isDeprecated && (
              <Badge variant="destructive" className="text-xs">
                已弃用
              </Badge>
            )}
            {!pricing.isEnabled && (
              <Badge variant="secondary" className="text-xs">
                已禁用
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 定价信息 */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <span>输入: ${pricing.inputPrice}/M</span>
          </div>
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <span>输出: ${pricing.outputPrice}/M</span>
          </div>
          {pricing.thinkingPrice && (
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-muted-foreground" />
              <span>思考: ${pricing.thinkingPrice}/M</span>
            </div>
          )}
          {pricing.cacheReadPrice && (
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <span>缓存读: ${pricing.cacheReadPrice}/M</span>
            </div>
          )}
        </div>

        {/* 能力评分 */}
        <div className="space-y-2">
          <ScoreBar score={pricing.reasoningScore} label="推理" />
          <ScoreBar score={pricing.codingScore} label="编码" />
          <ScoreBar score={pricing.creativityScore} label="创意" />
          <ScoreBar score={pricing.speedScore} label="速度" />
        </div>

        {/* 特性支持 */}
        <div className="flex flex-wrap gap-1">
          <FeatureBadge
            supported={pricing.supportsExtendedThinking}
            label="扩展思考"
          />
          <FeatureBadge
            supported={pricing.supportsCacheControl}
            label="缓存控制"
          />
          <FeatureBadge supported={pricing.supportsVision} label="视觉" />
          <FeatureBadge
            supported={pricing.supportsFunctionCalling}
            label="函数调用"
          />
        </div>

        {/* 上下文长度 */}
        <div className="text-xs text-muted-foreground">
          上下文长度: {pricing.contextLength}K tokens
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * 模型定价卡片骨架屏
 */
function ModelPricingCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <Skeleton className="h-4 w-32 mb-1" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-2 w-full" />
        </div>
        <div className="flex gap-1">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-16" />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * 模型定价管理页面
 */
export default function ModelPricingPage() {
  const [search, setSearch] = useState('');

  const { data: response, isLoading } =
    routingAdminApi.getModelPricingList.useQuery(
      ['model-pricing-list'],
      {},
      { staleTime: 60000 } as any
    );

  const pricingList = response?.body?.data?.list || [];

  // 过滤模型
  const filteredList = pricingList.filter(
    (p) =>
      p.model.toLowerCase().includes(search.toLowerCase()) ||
      p.vendor.toLowerCase().includes(search.toLowerCase()) ||
      p.displayName?.toLowerCase().includes(search.toLowerCase())
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
          <h1 className="text-2xl font-bold">模型定价管理</h1>
          <p className="text-muted-foreground text-sm">
            查看和管理各模型的定价信息、能力评分和特性支持
          </p>
        </div>
      </div>

      {/* 搜索 */}
      <div className="relative max-w-md">
        <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        <Input
          placeholder="搜索模型名称或供应商..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* 模型列表 */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <ModelPricingCardSkeleton key={i} />
          ))}
        </div>
      ) : filteredList.length === 0 ? (
        <div className="text-muted-foreground py-12 text-center">
          <DollarSign className="mx-auto mb-4 h-12 w-12 opacity-50" />
          <p>未找到模型定价信息</p>
          {search && <p className="mt-1 text-sm">尝试其他搜索关键词</p>}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredList.map((pricing) => (
            <ModelPricingCard key={pricing.id} pricing={pricing} />
          ))}
        </div>
      )}
    </div>
  );
}
