'use client';

import { useMemo, useState, useCallback } from 'react';
import { useAvailableModels, useModelSync } from '@/hooks/useModels';
import { useProviderKeys } from '@/hooks/useProviderKeys';
import { useIsAdmin } from '@/lib/permissions';
import type { AvailableModel } from '@repo/contracts';
import {
  Card,
  CardContent,
  Input,
  ScrollArea,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Progress,
} from '@repo/ui';
import {
  Search,
  Cpu,
  CheckCircle,
  XCircle,
  RefreshCw,
  PlayCircle,
  Key,
  Settings,
  DollarSign,
  Tag,
  Brain,
  Globe,
  Code,
  Wrench,
  Bot,
  Eye,
  Image,
  Video,
  Volume2,
  Box,
  Radio,
  FileText,
  Sparkles,
  Calculator,
  Zap,
  MessageSquare,
  Shield,
  Database,
} from 'lucide-react';
import { ModelCard } from './components/model-card';
import { toast } from 'sonner';
import Link from 'next/link';

/**
 * 能力标签图标映射（与 model-card 保持一致）
 */
const CAPABILITY_TAG_ICONS: Record<string, React.ElementType> = {
  'deep-reasoning': Brain,
  'fast-reasoning': Brain,
  reasoning: Brain,
  'extended-thinking': Sparkles,
  'web-search': Globe,
  'code-execution': Code,
  tools: Wrench,
  'function-calling': Wrench,
  'agent-capable': Bot,
  vision: Eye,
  multimodal: Eye,
  'image-generation': Image,
  'video-generation': Video,
  'audio-tts': Volume2,
  '3d-generation': Box,
  streaming: Radio,
  'long-context': FileText,
  'chinese-optimized': Globe,
  creative: Sparkles,
  'math-optimized': Calculator,
  'cost-optimized': DollarSign,
  'fast-response': Zap,
  fast: Zap,
  speed: Zap,
  premium: Sparkles,
  'general-purpose': Cpu,
  chat: MessageSquare,
  code: Code,
  coding: Code,
  document: FileText,
  multilingual: Globe,
  safety: Shield,
  moderation: Shield,
  embedding: Database,
};

export default function ModelsPage() {
  const {
    models,
    loading,
    error,
    refresh,
    refreshModels,
    refreshing,
    refreshAllModels,
    refreshingAll,
    verifySingleModel,
    verifyingModel,
    batchVerifyUnverified,
    batchVerifying,
    batchVerifyAllUnavailable,
    batchVerifyingAll,
  } = useAvailableModels();
  const {
    syncPricing,
    syncingPricing,
    syncTags,
    syncingTags,
    refreshWithSync,
    refreshingWithSync,
  } = useModelSync();
  const isAdmin = useIsAdmin();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string>('all');
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  // Get provider keys list (for admin to know if any API keys are configured)
  const { keys: providerKeys } = useProviderKeys();

  // Extract unique capability tags from all models
  const availableTags = useMemo(() => {
    const tagMap = new Map<string, string>();
    for (const model of models) {
      if (model.capabilityTags) {
        for (const tag of model.capabilityTags) {
          if (!tagMap.has(tag.tagId)) {
            tagMap.set(tag.tagId, tag.name);
          }
        }
      }
    }
    return Array.from(tagMap.entries()).map(([tagId, name]) => ({ tagId, name }));
  }, [models]);

  // Filter models by search and capability tag
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

    // Filter by capability tag
    if (activeTag !== 'all') {
      result = result.filter(
        (model) =>
          model.capabilityTags?.some((tag) => tag.tagId === activeTag),
      );
    }

    return result;
  }, [models, searchQuery, activeTag]);

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

  // Handle refresh models for a specific provider key
  const handleRefreshModels = useCallback(
    async (providerKeyId: string) => {
      const result = await refreshModels(providerKeyId);
      if (result) {
        toast.success(
          `刷新完成：${result.models.length} 个模型，新增 ${result.addedCount}，移除 ${result.removedCount}`,
        );
        refresh();
      }
    },
    [refreshModels, refresh],
  );

  // Handle verify single model
  const handleVerifySingleModel = useCallback(
    async (providerKeyId: string, model: string) => {
      const result = await verifySingleModel(providerKeyId, model);
      if (result) {
        if (result.isAvailable) {
          toast.success(`模型 ${model} 验证成功`);
        } else {
          toast.error(
            `模型 ${model} 不可用: ${result.errorMessage || '未知错误'}`,
          );
        }
        refresh();
      }
    },
    [verifySingleModel, refresh],
  );

  // Handle batch verify unverified models for a provider key
  const handleBatchVerify = useCallback(
    async (providerKeyId: string) => {
      setBatchProgress({ current: 0, total: 1 });

      const result = await batchVerifyUnverified(providerKeyId);

      setBatchProgress(null);

      if (result) {
        toast.success(
          `批量验证完成：${result.available}/${result.total} 个模型可用，${result.failed} 个失败`,
        );
        refresh();
      }
    },
    [batchVerifyUnverified, refresh],
  );

  // Handle refresh all models
  const handleRefreshAllModels = useCallback(async () => {
    const result = await refreshAllModels();
    if (result) {
      toast.success(
        `刷新完成：${result.successCount}/${result.totalProviderKeys} 个密钥成功，共 ${result.totalModels} 个模型，新增 ${result.totalAdded}，移除 ${result.totalRemoved}`,
      );
      refresh();
    }
  }, [refreshAllModels, refresh]);

  // Handle batch verify all unavailable models
  const handleBatchVerifyAll = useCallback(async () => {
    setBatchProgress({ current: 0, total: 1 });

    const result = await batchVerifyAllUnavailable();

    setBatchProgress(null);

    if (result) {
      toast.success(
        `批量验证完成：${result.totalAvailable}/${result.totalVerified} 个模型可用，${result.totalFailed} 个失败`,
      );
      refresh();
    }
  }, [batchVerifyAllUnavailable, refresh]);

  // Handle sync pricing
  const handleSyncPricing = useCallback(async () => {
    const result = await syncPricing();
    if (result) {
      toast.success(
        `定价同步完成：${result.synced} 个已同步，${result.skipped} 个跳过`,
      );
      refresh();
    }
  }, [syncPricing, refresh]);

  // Handle sync tags
  const handleSyncTags = useCallback(async () => {
    const result = await syncTags();
    if (result) {
      toast.success(
        `标签同步完成：${result.processed} 个已处理，${result.tagsAssigned} 个标签已分配`,
      );
      refresh();
    }
  }, [syncTags, refresh]);

  // Handle refresh with sync
  const handleRefreshWithSync = useCallback(
    async (providerKeyId: string) => {
      const result = await refreshWithSync(providerKeyId);
      if (result) {
        toast.success(
          `刷新并同步完成：${result.refresh.models.length} 个模型，定价同步 ${result.pricingSync.synced} 个，标签同步 ${result.tagsSync.processed} 个`,
        );
        refresh();
      }
    },
    [refreshWithSync, refresh],
  );

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
          {isAdmin && providerKeys.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    refreshing || refreshingAll || batchProgress !== null
                  }
                >
                  <RefreshCw
                    className={`mr-1.5 size-4 ${refreshing || refreshingAll ? 'animate-spin' : ''}`}
                  />
                  {refreshing || refreshingAll ? '刷新中...' : '刷新模型列表'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={handleRefreshAllModels}
                  className="font-medium"
                >
                  <RefreshCw className="mr-2 size-4" />
                  刷新所有密钥
                </DropdownMenuItem>
                <div className="my-1 h-px bg-border" />
                {providerKeys.map((pk) => (
                  <DropdownMenuItem
                    key={pk.id}
                    onClick={() => handleRefreshModels(pk.id)}
                  >
                    <RefreshCw className="mr-2 size-4" />
                    {pk.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {isAdmin && providerKeys.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    batchProgress !== null ||
                    batchVerifying ||
                    batchVerifyingAll
                  }
                >
                  <PlayCircle
                    className={`mr-1.5 size-4 ${batchVerifying || batchVerifyingAll ? 'animate-spin' : ''}`}
                  />
                  {batchVerifying || batchVerifyingAll
                    ? '验证中...'
                    : '批量验证'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={handleBatchVerifyAll}
                  className="font-medium"
                >
                  <PlayCircle className="mr-2 size-4" />
                  验证所有不可用模型
                </DropdownMenuItem>
                <div className="my-1 h-px bg-border" />
                {providerKeys.map((pk) => (
                  <DropdownMenuItem
                    key={pk.id}
                    onClick={() => handleBatchVerify(pk.id)}
                  >
                    <PlayCircle className="mr-2 size-4" />
                    {pk.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {isAdmin && providerKeys.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={syncingPricing || syncingTags || refreshingWithSync}
                >
                  <Settings
                    className={`mr-1.5 size-4 ${syncingPricing || syncingTags || refreshingWithSync ? 'animate-spin' : ''}`}
                  />
                  {syncingPricing || syncingTags || refreshingWithSync
                    ? '同步中...'
                    : '同步操作'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleSyncPricing}>
                  <DollarSign className="mr-2 size-4" />
                  同步定价信息
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSyncTags}>
                  <Tag className="mr-2 size-4" />
                  同步能力标签
                </DropdownMenuItem>
                <div className="my-1 h-px bg-border" />
                <DropdownMenuItem
                  onClick={() => {
                    const firstKey = providerKeys[0];
                    if (firstKey) {
                      handleRefreshWithSync(firstKey.id);
                    }
                  }}
                  className="font-medium"
                >
                  <RefreshCw className="mr-2 size-4" />
                  刷新并同步全部
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Admin Notice: No Provider Keys */}
      {isAdmin && providerKeys.length === 0 && (
        <Card className="mb-4 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
          <CardContent className="flex items-center gap-3 py-3">
            <Key className="size-5 text-amber-600 dark:text-amber-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                尚未配置 API 密钥
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                请先在「密钥管理」页面添加 API 密钥，然后才能刷新和验证模型
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900"
              asChild
            >
              <Link href="/secrets">
                <Key className="mr-1.5 size-4" />
                添加密钥
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Batch Progress */}
      {batchProgress && (
        <div className="mb-4 shrink-0">
          <div className="flex items-center justify-between text-sm mb-1">
            <span>批量验证进度</span>
            <span>
              {batchProgress.current} / {batchProgress.total}
            </span>
          </div>
          <Progress
            value={(batchProgress.current / batchProgress.total) * 100}
          />
        </div>
      )}

      {/* Search and Filter */}
      <div className="mb-4 shrink-0 space-y-3">
        <div className="relative max-w-md">
          <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            placeholder="搜索模型..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge
            variant={activeTag === 'all' ? 'default' : 'outline'}
            className="cursor-pointer gap-1 px-3 py-1 text-xs select-none"
            onClick={() => setActiveTag('all')}
          >
            <Cpu className="size-3" />
            全部
          </Badge>
          {availableTags.map((tag) => {
            const Icon = CAPABILITY_TAG_ICONS[tag.tagId] || Cpu;
            const isActive = activeTag === tag.tagId;
            return (
              <Badge
                key={tag.tagId}
                variant={isActive ? 'default' : 'outline'}
                className="cursor-pointer gap-1 px-3 py-1 text-xs select-none"
                onClick={() => setActiveTag(isActive ? 'all' : tag.tagId)}
              >
                <Icon className="size-3" />
                {tag.name}
              </Badge>
            );
          })}
        </div>
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
                    <ModelCard
                      key={model.id}
                      model={model}
                      isAdmin={isAdmin}
                      onVerify={handleVerifySingleModel}
                      verifying={verifyingModel === model.model}
                    />
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
                    <ModelCard
                      key={model.id}
                      model={model}
                      isAdmin={isAdmin}
                      onVerify={handleVerifySingleModel}
                      verifying={verifyingModel === model.model}
                    />
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
