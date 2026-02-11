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
  ScrollArea,
} from '@repo/ui';
import {
  Plus,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { FallbackChain, RoutingTarget } from '@repo/contracts';
import {
  useFallbackChains,
  useFallbackChainMutations,
} from '@/hooks/useRoutingConfig';
import { EnhancedModelSelector } from './enhanced-model-selector';

/**
 * Provider info needed for model selection
 */
interface ProviderInfo {
  providerKeyId: string;
  vendor: string;
  label?: string;
  allowedModels: string[];
}

interface FallbackChainSelectorProps {
  value: string | null; // chainId
  onChange: (chainId: string | null) => void;
  providers: ProviderInfo[];
  disabled?: boolean;
}

/**
 * FallbackChain Selector Component
 * Allows selecting from existing FallbackChains or creating new ones.
 */
export function FallbackChainSelector({
  value,
  onChange,
  providers,
  disabled = false,
}: FallbackChainSelectorProps) {
  const t = useTranslations('bots.detail.modelRouting');
  const { chains, loading } = useFallbackChains();
  const { createChain } = useFallbackChainMutations();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form state for creating new chain
  const [newChainId, setNewChainId] = useState('');
  const [newChainName, setNewChainName] = useState('');
  const [newChainDescription, setNewChainDescription] = useState('');
  const [newChainModels, setNewChainModels] = useState<
    Array<{
      vendor: string;
      model: string;
      protocol: 'openai-compatible' | 'anthropic-native';
    }>
  >([]);

  const selectedChain = useMemo(() => {
    if (!value) return null;
    return chains.find((c) => c.chainId === value) ?? null;
  }, [value, chains]);

  const resetForm = () => {
    setNewChainId('');
    setNewChainName('');
    setNewChainDescription('');
    setNewChainModels([]);
  };

  const handleCreate = async () => {
    if (!newChainId.trim() || !newChainName.trim()) {
      toast.error(t('fallbackChain.validation.required'));
      return;
    }

    if (newChainModels.length === 0) {
      toast.error(t('fallbackChain.validation.noModels'));
      return;
    }

    setCreating(true);
    try {
      const result = await createChain({
        chainId: newChainId,
        name: newChainName,
        description: newChainDescription || undefined,
        models: newChainModels,
        triggerStatusCodes: [429, 500, 502, 503, 504],
        triggerErrorTypes: ['rate_limit', 'server_error', 'timeout'],
        triggerTimeoutMs: 60000,
        maxRetries: 3,
        retryDelayMs: 2000,
        preserveProtocol: false,
        isActive: true,
      });

      if (result.status === 200 && result.body.data) {
        toast.success(t('fallbackChain.createSuccess'));
        onChange(newChainId);
        setIsCreateDialogOpen(false);
        resetForm();
      }
    } catch {
      toast.error(t('fallbackChain.createError'));
    } finally {
      setCreating(false);
    }
  };

  const addModelToChain = (target: RoutingTarget) => {
    const provider = providers.find(
      (p) => p.providerKeyId === target.providerKeyId,
    );
    if (!provider) return;

    setNewChainModels([
      ...newChainModels,
      {
        vendor: provider.vendor,
        model: target.model,
        protocol: 'openai-compatible',
      },
    ]);
  };

  const removeModelFromChain = (index: number) => {
    setNewChainModels(newChainModels.filter((_, i) => i !== index));
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        <span className="text-sm">{t('fallbackChain.loading')}</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>{t('fallbackChain.label')}</Label>
      <div className="flex gap-2">
        <Select
          value={value || '__none__'}
          onValueChange={(v) => onChange(v === '__none__' ? null : v)}
          disabled={disabled}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder={t('fallbackChain.placeholder')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">
              <span className="text-muted-foreground">
                {t('fallbackChain.none')}
              </span>
            </SelectItem>
            {chains.map((chain) => (
              <SelectItem key={chain.chainId} value={chain.chainId}>
                <div className="flex items-center gap-2">
                  <Shield className="size-4" />
                  <span>{chain.name}</span>
                  <Badge variant="outline" className="text-xs">
                    {(chain.models || []).length} {t('fallbackChain.models')}
                  </Badge>
                  {!chain.isActive && (
                    <Badge variant="secondary" className="text-xs">
                      {t('fallbackChain.inactive')}
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
          title={t('fallbackChain.create')}
        >
          <Plus className="size-4" />
        </Button>
      </div>

      {/* Selected chain details */}
      {selectedChain && (
        <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-2">
          <div className="flex items-center gap-2">
            <Shield className="size-4 text-primary" />
            <span className="font-medium">{selectedChain.name}</span>
          </div>
          {selectedChain.description && (
            <p className="text-muted-foreground text-xs">
              {selectedChain.description}
            </p>
          )}
          <div className="flex flex-wrap gap-1">
            {(selectedChain.models || []).map((model, index) => (
              <Badge
                key={`${model.vendor}:${model.model}`}
                variant={index === 0 ? 'default' : 'outline'}
                className="text-xs"
              >
                {index === 0 && (
                  <CheckCircle2 className="size-3 mr-1" />
                )}
                {model.model}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('fallbackChain.createTitle')}</DialogTitle>
            <DialogDescription>
              {t('fallbackChain.createDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('fallbackChain.form.chainId')}</Label>
                <Input
                  value={newChainId}
                  onChange={(e) => setNewChainId(e.target.value)}
                  placeholder="my-fallback-chain"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('fallbackChain.form.name')}</Label>
                <Input
                  value={newChainName}
                  onChange={(e) => setNewChainName(e.target.value)}
                  placeholder={t('fallbackChain.form.namePlaceholder')}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('fallbackChain.form.description')}</Label>
              <Textarea
                value={newChainDescription}
                onChange={(e) => setNewChainDescription(e.target.value)}
                placeholder={t('fallbackChain.form.descriptionPlaceholder')}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('fallbackChain.form.models')}</Label>
              <ScrollArea className="h-32 border rounded-lg p-2">
                {newChainModels.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    {t('fallbackChain.form.noModelsAdded')}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {newChainModels.map((model, index) => (
                      <div
                        key={`${model.vendor}:${model.model}:${index}`}
                        className="flex items-center justify-between p-2 bg-muted rounded"
                      >
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={index === 0 ? 'default' : 'outline'}
                            className="text-xs"
                          >
                            {index + 1}
                          </Badge>
                          <span className="text-sm">{model.model}</span>
                          <Badge variant="outline" className="text-xs">
                            {model.vendor}
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          onClick={() => removeModelFromChain(index)}
                        >
                          <Trash2 className="size-3 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
              <EnhancedModelSelector
                providers={providers}
                value={null}
                onChange={addModelToChain}
                placeholder={t('fallbackChain.form.addModel')}
              />
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
              {t('fallbackChain.form.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}