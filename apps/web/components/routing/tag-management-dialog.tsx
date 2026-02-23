'use client';

import { useState, useCallback } from 'react';
import { routingAdminApi, routingAdminClient } from '@/lib/api/contracts/client';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui';
import { Plus, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface CatalogTag {
  id: string;
  capabilityTagId: string;
  tagId: string;
  name: string;
  matchSource: string;
  confidence: number;
}

interface TagManagementDialogProps {
  /** ModelCatalog ID */
  catalogId: string | null;
  /** Display label for the dialog subtitle */
  catalogLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TagManagementDialog({
  catalogId,
  catalogLabel,
  open,
  onOpenChange,
}: TagManagementDialogProps) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [selectedTagId, setSelectedTagId] = useState('');

  const { data: tagsResponse, refetch: refetchTags } =
    routingAdminApi.getModelCatalogTags.useQuery(
      ['model-catalog-tags', catalogId],
      { params: { id: catalogId ?? '' } },
      { enabled: !!catalogId, staleTime: 0 } as any,
    );

  const { data: allTagsResponse } =
    routingAdminApi.getCapabilityTags.useQuery(
      ['capability-tags'],
      {},
      { staleTime: 60000 } as any,
    );

  const currentTags: CatalogTag[] = tagsResponse?.body?.data?.list ?? [];
  const allTags = allTagsResponse?.body?.data?.list ?? [];

  const assignedTagIds = new Set(currentTags.map((t) => t.capabilityTagId));
  const availableTags = allTags.filter(
    (t: any) => t.isActive && !assignedTagIds.has(t.id),
  );

  const handleAddTag = useCallback(async () => {
    if (!catalogId || !selectedTagId) return;
    setAdding(true);
    try {
      await routingAdminClient.addModelCatalogTag({
        params: { id: catalogId },
        body: { capabilityTagId: selectedTagId },
      });
      toast.success('标签已添加');
      setSelectedTagId('');
      refetchTags();
    } catch {
      toast.error('添加标签失败');
    } finally {
      setAdding(false);
    }
  }, [catalogId, selectedTagId, refetchTags]);

  const handleRemoveTag = useCallback(
    async (capabilityTagId: string) => {
      if (!catalogId) return;
      setRemoving(capabilityTagId);
      try {
        await routingAdminClient.removeModelCatalogTag({
          params: { id: catalogId, capabilityTagId },
          body: {},
        });
        toast.success('标签已移除');
        refetchTags();
      } catch {
        toast.error('移除标签失败');
      } finally {
        setRemoving(null);
      }
    },
    [catalogId, refetchTags],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>管理能力标签</DialogTitle>
          <DialogDescription>{catalogLabel}</DialogDescription>
        </DialogHeader>

        {/* 当前标签 */}
        <div className="space-y-3">
          <p className="text-sm font-medium">当前标签</p>
          {currentTags.length === 0 ? (
            <p className="text-muted-foreground text-sm">暂无标签</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {currentTags.map((tag) => (
                <Badge
                  key={tag.id}
                  variant={tag.matchSource === 'manual' ? 'default' : 'secondary'}
                  className="gap-1 pr-1"
                >
                  {tag.name}
                  <span className="text-[10px] opacity-60">
                    ({tag.matchSource})
                  </span>
                  <button
                    type="button"
                    className="ml-1 rounded-full p-0.5 hover:bg-black/10"
                    onClick={() => handleRemoveTag(tag.capabilityTagId)}
                    disabled={removing === tag.capabilityTagId}
                  >
                    {removing === tag.capabilityTagId ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* 添加标签 */}
        <div className="space-y-3">
          <p className="text-sm font-medium">添加标签</p>
          <div className="flex gap-2">
            <Select value={selectedTagId} onValueChange={setSelectedTagId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="选择标签..." />
              </SelectTrigger>
              <SelectContent>
                {availableTags.length === 0 ? (
                  <SelectItem value="_none" disabled>
                    无可用标签
                  </SelectItem>
                ) : (
                  availableTags.map((tag: any) => (
                    <SelectItem key={tag.id} value={tag.id}>
                      {tag.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={handleAddTag}
              disabled={!selectedTagId || adding}
            >
              {adding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
