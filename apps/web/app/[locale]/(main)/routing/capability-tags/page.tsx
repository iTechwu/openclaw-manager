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
  Tag,
  Brain,
  Globe,
  Code,
  Eye,
  Volume2,
  DollarSign,
  FileText,
  CheckCircle,
  XCircle,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import type { CapabilityTag } from '@repo/contracts';

/**
 * 分类图标映射
 */
const categoryIcons: Record<string, React.ElementType> = {
  reasoning: Brain,
  search: Globe,
  code: Code,
  vision: Eye,
  audio: Volume2,
  cost: DollarSign,
  context: FileText,
};

/**
 * 能力标签卡片
 */
function CapabilityTagCard({ tag }: { tag: CapabilityTag }) {
  const CategoryIcon = categoryIcons[tag.category] || Tag;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-lg">
              <CategoryIcon className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">{tag.name}</CardTitle>
              <CardDescription className="text-xs">{tag.tagId}</CardDescription>
              <CardDescription className="text-xs">
                优先级: {tag.priority}
              </CardDescription>
            </div>
          </div>
          <div className="flex gap-1">
            {tag.isBuiltin && (
              <Badge variant="secondary" className="text-xs">
                内置
              </Badge>
            )}
            <Badge variant={tag.isActive ? 'default' : 'outline'} className="text-xs">
              {tag.isActive ? (
                <CheckCircle className="mr-1 h-3 w-3" />
              ) : (
                <XCircle className="mr-1 h-3 w-3" />
              )}
              {tag.isActive ? '启用' : '禁用'}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 描述 */}
        {tag.description && (
          <p className="text-sm text-muted-foreground">{tag.description}</p>
        )}

        {/* 路由要求 */}
        <div className="space-y-2">
          {tag.requiredProtocol && (
            <div className="text-xs">
              <span className="text-muted-foreground">协议要求: </span>
              <Badge variant="outline" className="text-xs">
                {tag.requiredProtocol}
              </Badge>
            </div>
          )}

          {tag.requiredModels && tag.requiredModels.length > 0 && (
            <div className="text-xs">
              <span className="text-muted-foreground">指定模型: </span>
              <div className="flex flex-wrap gap-1 mt-1">
                {tag.requiredModels.map((model) => (
                  <Badge key={model} variant="outline" className="text-xs">
                    {model}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {tag.requiredSkills && tag.requiredSkills.length > 0 && (
            <div className="text-xs">
              <span className="text-muted-foreground">所需技能: </span>
              <div className="flex flex-wrap gap-1 mt-1">
                {tag.requiredSkills.map((skill) => (
                  <Badge key={skill} variant="outline" className="text-xs">
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 特性要求 */}
        <div className="flex flex-wrap gap-1">
          {tag.requiresExtendedThinking && (
            <Badge variant="secondary" className="text-xs">
              需要扩展思考
            </Badge>
          )}
          {tag.requiresCacheControl && (
            <Badge variant="secondary" className="text-xs">
              需要缓存控制
            </Badge>
          )}
          {tag.requiresVision && (
            <Badge variant="secondary" className="text-xs">
              需要视觉能力
            </Badge>
          )}
          {tag.maxCostPerMToken && (
            <Badge variant="secondary" className="text-xs">
              成本上限: ${tag.maxCostPerMToken}/M
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * 能力标签卡片骨架屏
 */
function CapabilityTagCardSkeleton() {
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
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <div className="flex gap-1">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-16" />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * 能力标签管理页面
 */
export default function CapabilityTagsPage() {
  const [search, setSearch] = useState('');

  const { data: response, isLoading } =
    routingAdminApi.getCapabilityTags.useQuery(
      ['capability-tags'],
      {},
      { staleTime: 60000 } as any
    );

  const tagList = response?.body?.data?.list || [];

  // 过滤标签
  const filteredList = tagList.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.tagId.toLowerCase().includes(search.toLowerCase()) ||
      t.category.toLowerCase().includes(search.toLowerCase())
  );

  // 按分类分组
  const groupedTags = filteredList.reduce<Record<string, CapabilityTag[]>>(
    (acc, tag) => {
      const category = tag.category;
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category]!.push(tag);
      return acc;
    },
    {}
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
          <h1 className="text-2xl font-bold">能力标签管理</h1>
          <p className="text-muted-foreground text-sm">
            定义模型能力标签和路由要求，用于智能路由选择
          </p>
        </div>
      </div>

      {/* 搜索 */}
      <div className="relative max-w-md">
        <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        <Input
          placeholder="搜索标签名称或分类..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* 标签列表 */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <CapabilityTagCardSkeleton key={i} />
          ))}
        </div>
      ) : filteredList.length === 0 ? (
        <div className="text-muted-foreground py-12 text-center">
          <Tag className="mx-auto mb-4 h-12 w-12 opacity-50" />
          <p>未找到能力标签</p>
          {search && <p className="mt-1 text-sm">尝试其他搜索关键词</p>}
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedTags).map(([category, tags]) => {
            const CategoryIcon = categoryIcons[category] || Tag;
            return (
              <div key={category}>
                <div className="flex items-center gap-2 mb-4">
                  <CategoryIcon className="h-5 w-5" />
                  <h2 className="text-lg font-semibold capitalize">{category}</h2>
                  <Badge variant="outline">{tags.length}</Badge>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {tags.map((tag) => (
                    <CapabilityTagCard key={tag.id} tag={tag} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}