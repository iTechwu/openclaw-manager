'use client';

import { useMemo, useState } from 'react';
import { useAvailableModels } from '@/hooks/useModels';
import { useIsAdmin } from '@/lib/permissions';
import type { AvailableModel } from '@repo/contracts';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Input,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Button,
} from '@repo/ui';
import {
  Search,
  Cpu,
  Zap,
  Brain,
  Sparkles,
  CheckCircle,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import { ModelCard } from './components/model-card';

/**
 * 模型分类配置
 */
const MODEL_CATEGORIES = [
  { id: 'all', label: '全部', icon: Cpu },
  { id: 'reasoning', label: '推理', icon: Brain },
  { id: 'balanced', label: '均衡', icon: Sparkles },
  { id: 'fast', label: '快速', icon: Zap },
] as const;

export default function ModelsPage() {
  const { models, loading, error, verifyModels, verifying, refresh } =
    useAvailableModels();
  const isAdmin = useIsAdmin();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  // Filter models by search and category
  const filteredModels = useMemo(() => {
    let result = [...models];

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (model) =>
          model.displayName.toLowerCase().includes(query) ||
          model.model.toLowerCase().includes(query) ||
          model.vendor.toLowerCase().includes(query),
      );
    }

    // Filter by category
    if (activeCategory !== 'all') {
      result = result.filter((model) => model.category === activeCategory);
    }

    return result;
  }, [models, searchQuery, activeCategory]);

  // Group models by availability
  const { availableModels, unavailableModels } = useMemo(() => {
    const available: AvailableModel[] = [];
    const unavailable: AvailableModel[] = [];

    filteredModels.forEach((model) => {
      if (model.isAvailable) {
        available.push(model);
      } else {
        unavailable.push(model);
      }
    });

    return { availableModels: available, unavailableModels: unavailable };
  }, [filteredModels]);

  // Stats
  const stats = useMemo(() => {
    const total = models.length;
    const available = models.filter((m) => m.isAvailable).length;
    return { total, available };
  }, [models]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Card className="max-w-md text-center">
          <CardContent className="pt-6">
            <XCircle className="text-destructive mx-auto mb-4 size-16" />
            <h2 className="mb-2 text-xl font-semibold">加载失败</h2>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden p-6">
      {/* Header */}
      <div className="mb-4 flex shrink-0 items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">可用模型</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            查看系统中所有可用的 AI 模型
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="text-green-500 size-4" />
            <span className="text-sm">
              {stats.available} / {stats.total} 可用
            </span>
          </div>
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={verifyModels}
              disabled={verifying}
            >
              <RefreshCw
                className={`mr-1.5 size-4 ${verifying ? 'animate-spin' : ''}`}
              />
              {verifying ? '验证中...' : '验证模型'}
            </Button>
          )}
        </div>
      </div>

      {/* Search and Filter */}
      <div className="mb-4 flex shrink-0 items-center gap-4">
        <div className="relative max-w-md flex-1">
          <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            placeholder="搜索模型..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Tabs value={activeCategory} onValueChange={setActiveCategory}>
          <TabsList>
            {MODEL_CATEGORIES.map((cat) => (
              <TabsTrigger key={cat.id} value={cat.id} className="gap-1.5">
                <cat.icon className="size-4" />
                {cat.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Models List */}
      <ScrollArea className="min-h-0 flex-1">
        {filteredModels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Cpu className="text-muted-foreground mb-4 size-16 opacity-50" />
            <h3 className="text-muted-foreground text-lg font-medium">
              {searchQuery ? '没有找到匹配的模型' : '暂无可用模型'}
            </h3>
          </div>
        ) : (
          <div className="space-y-6 pb-6">
            {/* Available Models */}
            {availableModels.length > 0 && (
              <div>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <CheckCircle className="text-green-500 size-4" />
                  可用模型 ({availableModels.length})
                </h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {availableModels.map((model) => (
                    <ModelCard key={model.id} model={model} />
                  ))}
                </div>
              </div>
            )}

            {/* Unavailable Models */}
            {unavailableModels.length > 0 && (
              <div>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <XCircle className="size-4" />
                  不可用模型 ({unavailableModels.length})
                </h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 opacity-60">
                  {unavailableModels.map((model) => (
                    <ModelCard key={model.id} model={model} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
