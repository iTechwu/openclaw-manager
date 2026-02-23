'use client';

import { useState, useMemo } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Input,
  ScrollArea,
  Skeleton,
} from '@repo/ui';
import {
  CheckCircle2,
  XCircle,
  Search,
  Plus,
  Trash2,
  Cpu,
} from 'lucide-react';
import { cn } from '@repo/ui/lib/utils';
import type { ModelAvailabilityItem } from '@repo/contracts';

interface ModelAvailabilityTableProps {
  /** 所有可用模型列表 */
  models: ModelAvailabilityItem[];
  /** 已添加到 Bot 的模型 ID 列表 */
  addedModelIds: Set<string>;
  /** 加载状态 */
  loading?: boolean;
  /** 添加模型回调 */
  onAddModels: (models: ModelAvailabilityItem[]) => void;
  /** 移除模型回调 */
  onRemoveModel: (model: ModelAvailabilityItem) => void;
  /** 是否显示添加按钮 */
  showAddButton?: boolean;
}

export function ModelAvailabilityTable({
  models,
  addedModelIds,
  loading,
  onAddModels,
  onRemoveModel,
  showAddButton = true,
}: ModelAvailabilityTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(true);
  const [showOnlyAdded, setShowOnlyAdded] = useState(false);

  // 过滤模型
  const filteredModels = useMemo(() => {
    return models.filter((model) => {
      // 搜索过滤（仅按模型名称）
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!model.model.toLowerCase().includes(query)) {
          return false;
        }
      }
      // 可用性过滤
      if (showOnlyAvailable && !model.isAvailable) {
        return false;
      }
      // 已添加过滤
      if (showOnlyAdded && !addedModelIds.has(model.id)) {
        return false;
      }
      return true;
    });
  }, [models, searchQuery, showOnlyAvailable, showOnlyAdded, addedModelIds]);

  // 切换模型选择
  const toggleModelSelection = (modelId: string) => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) {
        next.delete(modelId);
      } else {
        next.add(modelId);
      }
      return next;
    });
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    const selectableModels = filteredModels.filter(
      (m) => !addedModelIds.has(m.id),
    );
    const allSelected = selectableModels.every((m) => selectedModels.has(m.id));

    setSelectedModels((prev) => {
      const next = new Set(prev);
      selectableModels.forEach((m) => {
        if (allSelected) {
          next.delete(m.id);
        } else {
          next.add(m.id);
        }
      });
      return next;
    });
  };

  // 添加选中的模型
  const handleAddSelected = () => {
    const modelsToAdd = models.filter((m) => selectedModels.has(m.id));
    if (modelsToAdd.length > 0) {
      onAddModels(modelsToAdd);
      setSelectedModels(new Set());
    }
  };

  const selectableModels = filteredModels.filter(
    (m) => !addedModelIds.has(m.id),
  );
  const allSelected =
    selectableModels.length > 0 &&
    selectableModels.every((m) => selectedModels.has(m.id));
  const someSelected =
    selectableModels.some((m) => selectedModels.has(m.id)) && !allSelected;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 搜索和过滤 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="搜索模型名称..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <Checkbox
              checked={showOnlyAvailable}
              onCheckedChange={(checked) => setShowOnlyAvailable(checked === true)}
            />
            仅可用
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <Checkbox
              checked={showOnlyAdded}
              onCheckedChange={(checked) => setShowOnlyAdded(checked === true)}
            />
            仅已添加
          </label>
        </div>

        {showAddButton && selectedModels.size > 0 && (
          <Button onClick={handleAddSelected} size="sm">
            <Plus className="size-4 mr-1" />
            添加 {selectedModels.size} 个模型
          </Button>
        )}
      </div>

      {/* 统计信息 */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>共 {filteredModels.length} 个模型</span>
        <span>·</span>
        <span className="text-green-600">
          {filteredModels.filter((m) => m.isAvailable).length} 可用
        </span>
        <span>·</span>
        <span className="text-blue-600">
          {filteredModels.filter((m) => addedModelIds.has(m.id)).length} 已添加
        </span>
      </div>

      {/* 模型列表 */}
      <ScrollArea className="h-[500px] border rounded-lg">
        <div className="divide-y">
          {/* 表头 */}
          <div className="flex items-center gap-4 px-4 py-3 bg-muted/50 sticky top-0 z-10">
            {showAddButton && selectableModels.length > 0 && (
              <Checkbox
                checked={someSelected ? 'indeterminate' : allSelected}
                onCheckedChange={toggleSelectAll}
              />
            )}
            <div className="flex-1 font-medium text-sm">模型名称</div>
            <div className="w-20 text-center font-medium text-sm">状态</div>
            <div className="w-40 text-center font-medium text-sm">能力标签</div>
            <div className="w-20 text-center font-medium text-sm">操作</div>
          </div>

          {/* 模型行 */}
          {filteredModels.length === 0 ? (
            <div className="py-12 text-center">
              <Cpu className="size-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">没有找到匹配的模型</p>
            </div>
          ) : (
            filteredModels.map((model) => {
              const isAdded = addedModelIds.has(model.id);
              const isSelected = selectedModels.has(model.id);

              return (
                <div
                  key={model.id}
                  className={cn(
                    'flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors',
                    isAdded && 'bg-blue-50/50 dark:bg-blue-950/20',
                    isSelected && !isAdded && 'bg-primary/5',
                  )}
                >
                  {/* 选择框 */}
                  {showAddButton && !isAdded && (
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleModelSelection(model.id)}
                    />
                  )}
                  {showAddButton && isAdded && <div className="w-4" />}

                  {/* 模型名称 */}
                  <div className="flex-1 flex items-center gap-2">
                    <span className="font-medium text-sm">{model.model}</span>
                    {isAdded && (
                      <Badge variant="secondary" className="text-xs">
                        已添加
                      </Badge>
                    )}
                  </div>

                  {/* 状态 */}
                  <div className="w-20 flex justify-center">
                    {model.isAvailable ? (
                      <div className="flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="size-4" />
                        <span className="text-xs">可用</span>
                      </div>
                    ) : (
                      <div
                        className="flex items-center gap-1 text-red-500"
                        title={model.errorMessage || '不可用'}
                      >
                        <XCircle className="size-4" />
                        <span className="text-xs">不可用</span>
                      </div>
                    )}
                  </div>

                  {/* 能力标签 */}
                  <div className="w-40 flex justify-center gap-1 flex-wrap">
                    {model.capabilityTags && model.capabilityTags.length > 0 ? (
                      model.capabilityTags.slice(0, 3).map((tag) => (
                        <Badge
                          key={tag.id}
                          variant="outline"
                          className="text-xs"
                        >
                          {tag.name}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                    {model.capabilityTags && model.capabilityTags.length > 3 && (
                      <span className="text-xs text-muted-foreground">
                        +{model.capabilityTags.length - 3}
                      </span>
                    )}
                  </div>

                  {/* 操作 */}
                  <div className="w-20 flex justify-center">
                    {isAdded ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                        onClick={() => onRemoveModel(model)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        onClick={() => onAddModels([model])}
                      >
                        <Plus className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
