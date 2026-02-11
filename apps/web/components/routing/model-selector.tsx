'use client';

import { useState, useMemo } from 'react';
import { routingAdminApi } from '@/lib/api/contracts/client';
import {
  Badge,
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  ScrollArea,
} from '@repo/ui';
import { Check, ChevronsUpDown, Search, Cpu } from 'lucide-react';
import type { RoutingAvailableModel } from '@repo/contracts';

interface ModelSelectorProps {
  /** 当前选中的 ModelAvailability ID */
  value?: string;
  /** 选中模型时的回调 */
  onSelect: (model: RoutingAvailableModel) => void;
  /** 占位文本 */
  placeholder?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 额外的 CSS 类名 */
  className?: string;
}

/**
 * 模型选择器组件
 * 从 ModelAvailability (isAvailable=true) 获取可用模型列表
 * 支持搜索、按 vendor 分组、显示模型详情
 */
export function ModelSelector({
  value,
  onSelect,
  placeholder = '选择模型...',
  disabled = false,
  className,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data: response, isLoading } =
    routingAdminApi.getAvailableModelsForRouting.useQuery(
      ['routing-available-models'],
      {},
      { staleTime: 60000 } as any,
    );

  const models = response?.body?.data?.list || [];

  // 当前选中的模型
  const selectedModel = useMemo(
    () => models.find((m) => m.id === value),
    [models, value],
  );

  // 按 vendor 分组并过滤
  const groupedModels = useMemo(() => {
    const filtered = search
      ? models.filter(
          (m) =>
            m.model.toLowerCase().includes(search.toLowerCase()) ||
            m.vendor.toLowerCase().includes(search.toLowerCase()) ||
            m.displayName?.toLowerCase().includes(search.toLowerCase()),
        )
      : models;

    const groups: Record<string, RoutingAvailableModel[]> = {};
    for (const model of filtered) {
      const vendor = model.vendor;
      if (!groups[vendor]) groups[vendor] = [];
      groups[vendor]!.push(model);
    }
    return groups;
  }, [models, search]);

  const formatPrice = (price?: number | null) => {
    if (price == null) return '-';
    return `$${price.toFixed(2)}`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || isLoading}
          className={`w-full justify-between ${className || ''}`}
        >
          {isLoading ? (
            <Skeleton className="h-4 w-32" />
          ) : selectedModel ? (
            <span className="flex items-center gap-2 truncate">
              <Cpu className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {selectedModel.displayName || selectedModel.model}
              </span>
              <Badge variant="outline" className="text-[10px] shrink-0">
                {selectedModel.vendor}
              </Badge>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索模型..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>
        <ScrollArea className="max-h-[300px]">
          {isLoading ? (
            <div className="p-2 space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : Object.keys(groupedModels).length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              未找到可用模型
            </div>
          ) : (
            <div className="p-1">
              {Object.entries(groupedModels).map(([vendor, vendorModels]) => (
                <div key={vendor}>
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase">
                    {vendor}
                  </div>
                  {vendorModels.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      className="w-full flex items-center gap-2 px-2 py-2 text-sm rounded-md hover:bg-accent cursor-pointer text-left"
                      onClick={() => {
                        onSelect(model);
                        setOpen(false);
                        setSearch('');
                      }}
                    >
                      <Check
                        className={`h-3.5 w-3.5 shrink-0 ${
                          value === model.id ? 'opacity-100' : 'opacity-0'
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {model.displayName || model.model}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{model.model}</span>
                          {model.inputPrice != null && (
                            <span>
                              In: {formatPrice(model.inputPrice)} / Out:{' '}
                              {formatPrice(model.outputPrice)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {model.supportsExtendedThinking && (
                          <Badge variant="outline" className="text-[10px]">
                            ET
                          </Badge>
                        )}
                        {model.supportsVision && (
                          <Badge variant="outline" className="text-[10px]">
                            Vision
                          </Badge>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

/**
 * 模型多选组件 - 用于 Fallback 链等需要选择多个模型的场景
 */
interface ModelMultiSelectorProps {
  /** 已选中的模型列表 (modelAvailabilityId[]) */
  value: string[];
  /** 选中/取消选中模型时的回调 */
  onChange: (models: RoutingAvailableModel[]) => void;
  /** 占位文本 */
  placeholder?: string;
  /** 是否禁用 */
  disabled?: boolean;
}

export function ModelMultiSelector({
  value,
  onChange,
  placeholder = '添加模型...',
  disabled = false,
}: ModelMultiSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data: response, isLoading } =
    routingAdminApi.getAvailableModelsForRouting.useQuery(
      ['routing-available-models'],
      {},
      { staleTime: 60000 } as any,
    );

  const models = response?.body?.data?.list || [];

  const selectedModels = useMemo(
    () => models.filter((m) => value.includes(m.id)),
    [models, value],
  );

  // 按 vendor 分组并过滤（排除已选中的）
  const groupedModels = useMemo(() => {
    const filtered = models.filter((m) => {
      if (value.includes(m.id)) return false;
      if (!search) return true;
      return (
        m.model.toLowerCase().includes(search.toLowerCase()) ||
        m.vendor.toLowerCase().includes(search.toLowerCase()) ||
        m.displayName?.toLowerCase().includes(search.toLowerCase())
      );
    });

    const groups: Record<string, RoutingAvailableModel[]> = {};
    for (const model of filtered) {
      const vendor = model.vendor;
      if (!groups[vendor]) groups[vendor] = [];
      groups[vendor]!.push(model);
    }
    return groups;
  }, [models, value, search]);

  const handleAdd = (model: RoutingAvailableModel) => {
    onChange([...selectedModels, model]);
  };

  const handleRemove = (modelId: string) => {
    onChange(selectedModels.filter((m) => m.id !== modelId));
  };

  return (
    <div className="space-y-2">
      {/* 已选中的模型列表 */}
      {selectedModels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedModels.map((model, index) => (
            <Badge
              key={model.id}
              variant="secondary"
              className="flex items-center gap-1 pr-1"
            >
              <span className="text-xs text-muted-foreground mr-0.5">
                #{index + 1}
              </span>
              {model.displayName || model.model}
              <button
                type="button"
                className="ml-1 rounded-full p-0.5 hover:bg-muted"
                onClick={() => handleRemove(model.id)}
                disabled={disabled}
                aria-label={`移除 ${model.displayName || model.model}`}
              >
                <span className="text-xs">×</span>
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* 添加模型按钮 */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || isLoading}
            className="w-full justify-start text-muted-foreground"
          >
            {isLoading ? (
              <Skeleton className="h-4 w-24" />
            ) : (
              <>
                <Cpu className="mr-2 h-3.5 w-3.5" />
                {placeholder}
              </>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索模型..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>
          <ScrollArea className="max-h-[300px]">
            {Object.keys(groupedModels).length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {models.length === value.length
                  ? '所有模型已选中'
                  : '未找到可用模型'}
              </div>
            ) : (
              <div className="p-1">
                {Object.entries(groupedModels).map(
                  ([vendor, vendorModels]) => (
                    <div key={vendor}>
                      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase">
                        {vendor}
                      </div>
                      {vendorModels.map((model) => (
                        <button
                          key={model.id}
                          type="button"
                          className="w-full flex items-center gap-2 px-2 py-2 text-sm rounded-md hover:bg-accent cursor-pointer text-left"
                          onClick={() => {
                            handleAdd(model);
                            setSearch('');
                          }}
                        >
                          <Cpu className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">
                              {model.displayName || model.model}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {model.model}
                            </div>
                          </div>
                          {model.supportsExtendedThinking && (
                            <Badge variant="outline" className="text-[10px]">
                              ET
                            </Badge>
                          )}
                        </button>
                      ))}
                    </div>
                  ),
                )}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}
