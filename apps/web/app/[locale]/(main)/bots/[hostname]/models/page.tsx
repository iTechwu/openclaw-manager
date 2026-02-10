'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useBotModels, useAvailableModels } from '@/hooks/useModels';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Switch,
  Badge,
  Input,
} from '@repo/ui';
import { cn } from '@repo/ui/lib/utils';
import {
  Search,
  Star,
  StarOff,
  Cpu,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

export default function BotModelsPage() {
  const params = useParams<{ hostname: string }>();
  const hostname = params.hostname;
  const t = useTranslations('bots.detail.models');

  const {
    models: botModels,
    loading: botModelsLoading,
    updateModels,
    updateLoading,
    refresh: refreshBotModels,
  } = useBotModels(hostname);

  const { models: availableModels, loading: availableModelsLoading } =
    useAvailableModels();

  const [searchQuery, setSearchQuery] = useState('');
  const [pendingChanges, setPendingChanges] = useState<Map<string, boolean>>(
    new Map(),
  );
  const [pendingPrimary, setPendingPrimary] = useState<string | null>(null);

  // Merge bot models with available models info
  const mergedModels = useMemo(() => {
    return botModels.map((bm) => {
      const availableModel = availableModels.find(
        (am) => am.model === bm.modelId,
      );
      return {
        ...bm,
        vendor: availableModel?.vendor ?? '',
        category: availableModel?.category ?? '',
        capabilities: availableModel?.capabilities ?? [],
      };
    });
  }, [botModels, availableModels]);

  // Filter models by search query
  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) return mergedModels;
    const query = searchQuery.toLowerCase();
    return mergedModels.filter(
      (m) =>
        m.modelId.toLowerCase().includes(query) ||
        m.displayName.toLowerCase().includes(query) ||
        m.vendor.toLowerCase().includes(query),
    );
  }, [mergedModels, searchQuery]);

  // Group models by category
  const groupedModels = useMemo(() => {
    const groups: Record<string, typeof filteredModels> = {};
    filteredModels.forEach((model) => {
      const category = model.category || 'other';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(model);
    });
    return groups;
  }, [filteredModels]);

  // Check if there are pending changes
  const hasPendingChanges = pendingChanges.size > 0 || pendingPrimary !== null;

  // Get effective enabled state (considering pending changes)
  const getEffectiveEnabled = (modelId: string, currentEnabled: boolean) => {
    return pendingChanges.has(modelId)
      ? pendingChanges.get(modelId)!
      : currentEnabled;
  };

  // Get effective primary state
  const getEffectivePrimary = (modelId: string, currentPrimary: boolean) => {
    if (pendingPrimary !== null) {
      return modelId === pendingPrimary;
    }
    return currentPrimary;
  };

  const handleToggleModel = (modelId: string, currentEnabled: boolean) => {
    setPendingChanges((prev) => {
      const next = new Map(prev);
      const newValue = !currentEnabled;
      // If toggling back to original state, remove from pending
      const originalModel = botModels.find((m) => m.modelId === modelId);
      if (originalModel && originalModel.isEnabled === newValue) {
        next.delete(modelId);
      } else {
        next.set(modelId, newValue);
      }
      return next;
    });
  };

  const handleSetPrimary = (modelId: string) => {
    const originalPrimary = botModels.find((m) => m.isPrimary)?.modelId;
    if (modelId === originalPrimary) {
      setPendingPrimary(null);
    } else {
      setPendingPrimary(modelId);
    }
  };

  const handleSaveChanges = async () => {
    // Calculate final enabled models
    const enabledModels = botModels
      .filter((m) => {
        const effectiveEnabled = getEffectiveEnabled(m.modelId, m.isEnabled);
        return effectiveEnabled;
      })
      .map((m) => m.modelId);

    if (enabledModels.length === 0) {
      toast.error(t('atLeastOneModel'));
      return;
    }

    // Determine primary model
    let primaryModel: string | undefined;
    if (pendingPrimary !== null) {
      primaryModel = pendingPrimary;
    } else {
      const currentPrimary = botModels.find((m) => m.isPrimary);
      if (currentPrimary && enabledModels.includes(currentPrimary.modelId)) {
        primaryModel = currentPrimary.modelId;
      }
    }

    // If primary model is not in enabled list, use first enabled
    if (primaryModel && !enabledModels.includes(primaryModel)) {
      primaryModel = enabledModels[0];
    }

    try {
      await updateModels({
        models: enabledModels,
        primaryModel,
      });
      toast.success(t('saveSuccess'));
      setPendingChanges(new Map());
      setPendingPrimary(null);
    } catch {
      toast.error(t('saveFailed'));
    }
  };

  const handleDiscardChanges = () => {
    setPendingChanges(new Map());
    setPendingPrimary(null);
  };

  const loading = botModelsLoading || availableModelsLoading;

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-full max-w-md" />
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">{t('description')}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => refreshBotModels()}
          disabled={updateLoading}
        >
          <RefreshCw
            className={cn('size-4', updateLoading && 'animate-spin')}
          />
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder={t('searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Pending Changes Bar */}
      {hasPendingChanges && (
        <div className="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
          <span className="text-sm text-amber-700 dark:text-amber-300">
            {t('unsavedChanges')}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDiscardChanges}
              disabled={updateLoading}
            >
              {t('discard')}
            </Button>
            <Button
              size="sm"
              onClick={handleSaveChanges}
              disabled={updateLoading}
            >
              {updateLoading && (
                <Loader2 className="size-4 mr-2 animate-spin" />
              )}
              {t('saveChanges')}
            </Button>
          </div>
        </div>
      )}

      {/* Models List */}
      {filteredModels.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Cpu className="size-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">
              {searchQuery ? t('noMatchingModels') : t('noModels')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedModels).map(([category, models]) => (
            <div key={category}>
              <h3 className="text-sm font-medium text-muted-foreground mb-3 capitalize">
                {t(`categories.${category}`, { defaultValue: category })}
              </h3>
              <div className="grid gap-3">
                {models.map((model) => {
                  const effectiveEnabled = getEffectiveEnabled(
                    model.modelId,
                    model.isEnabled,
                  );
                  const effectivePrimary = getEffectivePrimary(
                    model.modelId,
                    model.isPrimary,
                  );
                  const hasChange =
                    pendingChanges.has(model.modelId) ||
                    (pendingPrimary !== null &&
                      (model.isPrimary || model.modelId === pendingPrimary));

                  return (
                    <Card
                      key={model.modelId}
                      className={cn(
                        'transition-all',
                        hasChange && 'ring-2 ring-amber-400',
                        !effectiveEnabled && 'opacity-60',
                      )}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            {/* Enable/Disable Switch */}
                            <Switch
                              checked={effectiveEnabled}
                              onCheckedChange={() =>
                                handleToggleModel(
                                  model.modelId,
                                  effectiveEnabled,
                                )
                              }
                            />

                            {/* Model Info */}
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">
                                  {model.displayName}
                                </span>
                                {effectivePrimary && (
                                  <Badge variant="default" className="text-xs">
                                    {t('primary')}
                                  </Badge>
                                )}
                                {model.isAvailable ? (
                                  <CheckCircle2 className="size-4 text-green-500" />
                                ) : (
                                  <XCircle className="size-4 text-red-500" />
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-muted-foreground">
                                  {model.modelId}
                                </span>
                                {model.vendor && (
                                  <Badge variant="outline" className="text-xs">
                                    {model.vendor}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Set as Primary Button */}
                          <Button
                            variant={effectivePrimary ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => handleSetPrimary(model.modelId)}
                            disabled={!effectiveEnabled}
                            className="gap-1"
                          >
                            {effectivePrimary ? (
                              <Star className="size-4 fill-current" />
                            ) : (
                              <StarOff className="size-4" />
                            )}
                            <span className="hidden sm:inline">
                              {effectivePrimary
                                ? t('primaryModel')
                                : t('setAsPrimary')}
                            </span>
                          </Button>
                        </div>

                        {/* Capabilities */}
                        {model.capabilities.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t">
                            {model.capabilities.slice(0, 5).map((cap) => (
                              <Badge
                                key={cap}
                                variant="secondary"
                                className="text-xs"
                              >
                                {cap}
                              </Badge>
                            ))}
                            {model.capabilities.length > 5 && (
                              <Badge variant="secondary" className="text-xs">
                                +{model.capabilities.length - 5}
                              </Badge>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
