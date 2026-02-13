'use client';

import { useMemo, useState } from 'react';
import { useModelAvailability, useModelSync } from '@/hooks/useModels';
import { useProviderKeys } from '@/hooks/useProviderKeys';
import type { ModelAvailabilityItem } from '@repo/contracts';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Button,
  Badge,
  Skeleton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui';
import {
  Search,
  MoreHorizontal,
  CheckCircle,
  XCircle,
  DollarSign,
  Tag,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

export function ModelAvailabilityTable() {
  const { availability, loading, refresh } = useModelAvailability();
  const { keys: providerKeys } = useProviderKeys();
  const { syncPricing, syncingPricing, syncTags, syncingTags } = useModelSync();
  const [searchQuery, setSearchQuery] = useState('');
  const [vendorFilter, setVendorFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Helper to get vendor from providerKeys
  const getVendor = (m: ModelAvailabilityItem) =>
    m.providerKeys?.[0]?.vendor ?? '';

  // Get unique vendors
  const vendors = useMemo(() => {
    const vendorSet = new Set(availability.map((m) => getVendor(m)));
    return Array.from(vendorSet).filter(Boolean).sort();
  }, [availability]);

  // Filter models
  const filteredModels = useMemo(() => {
    let result = [...availability];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (m) =>
          m.model.toLowerCase().includes(query) ||
          getVendor(m).toLowerCase().includes(query),
      );
    }

    if (vendorFilter !== 'all') {
      result = result.filter((m) => getVendor(m) === vendorFilter);
    }

    if (statusFilter !== 'all') {
      const isAvailable = statusFilter === 'available';
      result = result.filter((m) => m.isAvailable === isAvailable);
    }

    return result;
  }, [availability, searchQuery, vendorFilter, statusFilter]);

  const handleSyncModelPricing = async (modelId: string) => {
    const result = await syncPricing(modelId);
    if (result) {
      toast.success('定价同步完成');
      refresh();
    }
  };

  const handleSyncModelTags = async (modelId: string) => {
    const result = await syncTags(modelId);
    if (result) {
      toast.success('标签同步完成');
      refresh();
    }
  };

  if (loading) {
    return <TableSkeleton />;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">模型可用性列表</CardTitle>
          <Button variant="outline" size="sm" onClick={() => refresh()}>
            <RefreshCw className="mr-2 size-4" />
            刷新
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              placeholder="搜索模型..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={vendorFilter} onValueChange={setVendorFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="供应商" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部供应商</SelectItem>
              {vendors.map((vendor) => (
                <SelectItem key={vendor} value={vendor}>
                  {vendor}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="available">可用</SelectItem>
              <SelectItem value="unavailable">不可用</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>模型</TableHead>
                <TableHead>供应商</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>定价</TableHead>
                <TableHead>标签</TableHead>
                <TableHead className="w-[80px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredModels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <p className="text-muted-foreground">没有找到匹配的模型</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredModels.map((model) => (
                  <ModelRow
                    key={model.id}
                    model={model}
                    onSyncPricing={handleSyncModelPricing}
                    onSyncTags={handleSyncModelTags}
                    syncingPricing={syncingPricing}
                    syncingTags={syncingTags}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="text-muted-foreground mt-3 text-sm">
          共 {filteredModels.length} 个模型
          {filteredModels.length !== availability.length &&
            ` (总计 ${availability.length} 个)`}
        </div>
      </CardContent>
    </Card>
  );
}

function ModelRow({
  model,
  onSyncPricing,
  onSyncTags,
  syncingPricing,
  syncingTags,
}: {
  model: ModelAvailabilityItem;
  onSyncPricing: (id: string) => void;
  onSyncTags: (id: string) => void;
  syncingPricing: boolean;
  syncingTags: boolean;
}) {
  return (
    <TableRow>
      <TableCell className="font-medium">{model.model}</TableCell>
      <TableCell>
        <Badge variant="outline">{model.providerKeys?.[0]?.vendor ?? '-'}</Badge>
      </TableCell>
      <TableCell>
        {model.isAvailable ? (
          <Badge variant="default" className="bg-green-500">
            <CheckCircle className="mr-1 size-3" />
            可用
          </Badge>
        ) : (
          <Badge variant="destructive">
            <XCircle className="mr-1 size-3" />
            不可用
          </Badge>
        )}
      </TableCell>
      <TableCell>
        {model.modelCatalogId ? (
          <Badge variant="secondary">
            <DollarSign className="mr-1 size-3" />
            已关联
          </Badge>
        ) : (
          <span className="text-muted-foreground text-sm">未关联</span>
        )}
      </TableCell>
      <TableCell>
        {model.capabilityTags && model.capabilityTags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {model.capabilityTags.slice(0, 2).map((tag) => (
              <Badge key={tag.id} variant="outline" className="text-xs">
                {tag.name}
              </Badge>
            ))}
            {model.capabilityTags.length > 2 && (
              <Badge variant="outline" className="text-xs">
                +{model.capabilityTags.length - 2}
              </Badge>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground text-sm">无标签</span>
        )}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => onSyncPricing(model.id)}
              disabled={syncingPricing}
            >
              <DollarSign className="mr-2 size-4" />
              同步定价
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onSyncTags(model.id)}
              disabled={syncingTags}
            >
              <Tag className="mr-2 size-4" />
              同步标签
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function TableSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-32" />
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex gap-3">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-[150px]" />
          <Skeleton className="h-9 w-[120px]" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
