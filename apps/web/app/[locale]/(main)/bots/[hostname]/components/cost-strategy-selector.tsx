'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Badge,
  Button,
  Label,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Input,
  Textarea,
  Slider,
} from '@repo/ui';
import {
  Plus,
  DollarSign,
  Zap,
  Target,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { CostStrategy } from '@repo/contracts';
import {
  useCostStrategies,
  useCostStrategyMutations,
} from '@/hooks/useRoutingConfig';

interface CostStrategySelectorProps {
  value: string | null; // strategyId
  onChange: (strategyId: string | null) => void;
  disabled?: boolean;
}

/**
 * CostStrategy Selector Component
 * Allows selecting from existing CostStrategies or creating new ones.
 */
export function CostStrategySelector({
  value,
  onChange,
  disabled = false,
}: CostStrategySelectorProps) {
  const t = useTranslations('bots.detail.modelRouting');
  const { strategies, loading } = useCostStrategies();
  const { createStrategy } = useCostStrategyMutations();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form state for creating new strategy
  const [newStrategyId, setNewStrategyId] = useState('');
  const [newStrategyName, setNewStrategyName] = useState('');
  const [newStrategyDescription, setNewStrategyDescription] = useState('');
  const [costWeight, setCostWeight] = useState(50);
  const [performanceWeight, setPerformanceWeight] = useState(30);
  const [capabilityWeight, setCapabilityWeight] = useState(20);

  const selectedStrategy = useMemo(() => {
    if (!value) return null;
    return strategies.find((s) => s.strategyId === value) ?? null;
  }, [value, strategies]);

  const resetForm = () => {
    setNewStrategyId('');
    setNewStrategyName('');
    setNewStrategyDescription('');
    setCostWeight(50);
    setPerformanceWeight(30);
    setCapabilityWeight(20);
  };

  // Normalize weights to sum to 100
  const normalizeWeights = (
    cost: number,
    performance: number,
    capability: number,
  ) => {
    const total = cost + performance + capability;
    if (total === 0) return { cost: 0.33, performance: 0.33, capability: 0.34 };
    return {
      cost: cost / total,
      performance: performance / total,
      capability: capability / total,
    };
  };

  const handleCreate = async () => {
    if (!newStrategyId.trim() || !newStrategyName.trim()) {
      toast.error(t('costStrategy.validation.required'));
      return;
    }

    const weights = normalizeWeights(
      costWeight,
      performanceWeight,
      capabilityWeight,
    );

    setCreating(true);
    try {
      const result = await createStrategy({
        strategyId: newStrategyId,
        name: newStrategyName,
        description: newStrategyDescription || undefined,
        costWeight: weights.cost,
        performanceWeight: weights.performance,
        capabilityWeight: weights.capability,
        isActive: true,
      });

      if (result.status === 200 && result.body.data) {
        toast.success(t('costStrategy.createSuccess'));
        onChange(newStrategyId);
        setIsCreateDialogOpen(false);
        resetForm();
      }
    } catch {
      toast.error(t('costStrategy.createError'));
    } finally {
      setCreating(false);
    }
  };

  const formatWeight = (weight: number) => `${Math.round(weight * 100)}%`;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        <span className="text-sm">{t('costStrategy.loading')}</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>{t('costStrategy.label')}</Label>
      <div className="flex gap-2">
        <Select
          value={value || '__none__'}
          onValueChange={(v) => onChange(v === '__none__' ? null : v)}
          disabled={disabled}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder={t('costStrategy.placeholder')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">
              <span className="text-muted-foreground">
                {t('costStrategy.none')}
              </span>
            </SelectItem>
            {strategies.map((strategy) => (
              <SelectItem key={strategy.strategyId} value={strategy.strategyId}>
                <div className="flex items-center gap-2">
                  <DollarSign className="size-4" />
                  <span>{strategy.name}</span>
                  {!strategy.isActive && (
                    <Badge variant="secondary" className="text-xs">
                      {t('costStrategy.inactive')}
                    </Badge>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setIsCreateDialogOpen(true)}
          disabled={disabled}
          title={t('costStrategy.create')}
        >
          <Plus className="size-4" />
        </Button>
      </div>

      {/* Selected strategy details */}
      {selectedStrategy && (
        <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-2">
          <div className="flex items-center gap-2">
            <DollarSign className="size-4 text-primary" />
            <span className="font-medium">{selectedStrategy.name}</span>
          </div>
          {selectedStrategy.description && (
            <p className="text-muted-foreground text-xs">
              {selectedStrategy.description}
            </p>
          )}
          <div className="flex gap-2">
            <Badge variant="outline" className="text-xs">
              <DollarSign className="size-3 mr-1" />
              {t('costStrategy.cost')}: {formatWeight(selectedStrategy.costWeight)}
            </Badge>
            <Badge variant="outline" className="text-xs">
              <Zap className="size-3 mr-1" />
              {t('costStrategy.performance')}: {formatWeight(selectedStrategy.performanceWeight)}
            </Badge>
            <Badge variant="outline" className="text-xs">
              <Target className="size-3 mr-1" />
              {t('costStrategy.capability')}: {formatWeight(selectedStrategy.capabilityWeight)}
            </Badge>
          </div>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('costStrategy.createTitle')}</DialogTitle>
            <DialogDescription>
              {t('costStrategy.createDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('costStrategy.form.strategyId')}</Label>
                <Input
                  value={newStrategyId}
                  onChange={(e) => setNewStrategyId(e.target.value)}
                  placeholder="my-cost-strategy"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('costStrategy.form.name')}</Label>
                <Input
                  value={newStrategyName}
                  onChange={(e) => setNewStrategyName(e.target.value)}
                  placeholder={t('costStrategy.form.namePlaceholder')}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('costStrategy.form.description')}</Label>
              <Textarea
                value={newStrategyDescription}
                onChange={(e) => setNewStrategyDescription(e.target.value)}
                placeholder={t('costStrategy.form.descriptionPlaceholder')}
                rows={2}
              />
            </div>

            <div className="space-y-4">
              <Label>{t('costStrategy.form.weights')}</Label>

              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1">
                      <DollarSign className="size-3" />
                      {t('costStrategy.cost')}
                    </span>
                    <span className="text-muted-foreground">{costWeight}%</span>
                  </div>
                  <Slider
                    value={[costWeight]}
                    onValueChange={([v]) => setCostWeight(v ?? 0)}
                    max={100}
                    step={5}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1">
                      <Zap className="size-3" />
                      {t('costStrategy.performance')}
                    </span>
                    <span className="text-muted-foreground">
                      {performanceWeight}%
                    </span>
                  </div>
                  <Slider
                    value={[performanceWeight]}
                    onValueChange={([v]) => setPerformanceWeight(v ?? 0)}
                    max={100}
                    step={5}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1">
                      <Target className="size-3" />
                      {t('costStrategy.capability')}
                    </span>
                    <span className="text-muted-foreground">
                      {capabilityWeight}%
                    </span>
                  </div>
                  <Slider
                    value={[capabilityWeight]}
                    onValueChange={([v]) => setCapabilityWeight(v ?? 0)}
                    max={100}
                    step={5}
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {t('costStrategy.form.weightsHint')}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false);
                resetForm();
              }}
              disabled={creating}
            >
              {t('cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="size-4 mr-2 animate-spin" />}
              {t('costStrategy.form.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}