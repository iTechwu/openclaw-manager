'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
  Badge,
  Input,
  ScrollArea,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui';
import {
  Search,
  Check,
  Clock,
  DollarSign,
  ChevronDown,
  Zap,
  Sparkles,
  Info,
} from 'lucide-react';
import type { RoutingTarget } from '@repo/contracts';
import type { ModelApiType } from '@repo/contracts';
import {
  getModelSupportedApiTypes,
  shouldRecommendAnthropic,
} from '@repo/contracts';
import type { EnhancedModelInfo } from '@/hooks/useRoutingConfig';

interface ModelOption {
  model: string;
  vendor: string;
  providerKeyId: string;
  providerLabel: string;
  isAvailable: boolean;
  lastVerifiedAt: Date | null;
  pricing: {
    inputPrice: number;
    outputPrice: number;
  } | null;
  capabilityTags: Array<{
    id: string;
    name: string;
    tagType?: string;
  }>;
  /** 支持的协议类型 */
  supportedApiTypes: ModelApiType[];
  /** 是否推荐 Anthropic 协议 */
  recommendAnthropic: boolean;
  /** 推荐原因 */
  recommendReason?: string;
}

/**
 * Provider info needed for model selection
 */
interface ProviderInfo {
  providerKeyId: string;
  vendor: string;
  label?: string;
  allowedModels: string[];
}

/**
 * Extended RoutingTarget with protocol preference
 */
export interface ExtendedRoutingTarget extends RoutingTarget {
  preferredApiType?: ModelApiType | null;
}

interface EnhancedModelSelectorProps {
  providers: ProviderInfo[];
  value: ExtendedRoutingTarget | null;
  onChange: (target: ExtendedRoutingTarget) => void;
  enhancedModels?: EnhancedModelInfo[];
  showAvailability?: boolean;
  showPricing?: boolean;
  showCapabilities?: boolean;
  showProtocolSelector?: boolean;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Enhanced Model Selector Component
 * Allows direct model selection without requiring provider selection first.
 * Shows model availability, pricing, and capability tags.
 * When showProtocolSelector is true, also shows protocol selector for multi-protocol models.
 */
export function EnhancedModelSelector({
  providers,
  value,
  onChange,
  enhancedModels = [],
  showAvailability = true,
  showPricing = false,
  showCapabilities = false,
  showProtocolSelector = false,
  label,
  placeholder,
  disabled = false,
}: EnhancedModelSelectorProps) {
  const t = useTranslations('bots.detail.modelRouting');
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedProtocol, setSelectedProtocol] = useState<ModelApiType | null>(
    value?.preferredApiType ?? null,
  );

  // Build flat list of all available models from providers
  const modelOptions: ModelOption[] = useMemo(() => {
    const options: ModelOption[] = [];
    const seenModels = new Set<string>();

    providers.forEach((provider) => {
      provider.allowedModels.forEach((modelId) => {
        // Find enhanced model info if available
        const enhancedInfo = enhancedModels.find(
          (m) =>
            m.model === modelId && m.providerKeyId === provider.providerKeyId,
        );

        // Create unique key for deduplication
        const uniqueKey = `${provider.providerKeyId}:${modelId}`;
        if (seenModels.has(uniqueKey)) return;
        seenModels.add(uniqueKey);

        // Get supported API types for this model
        const supportedApiTypes = getModelSupportedApiTypes(
          provider.vendor,
          modelId,
        );

        // Check if Anthropic protocol is recommended
        const recommendation = shouldRecommendAnthropic(
          provider.vendor,
          modelId,
        );

        options.push({
          model: modelId,
          vendor: provider.vendor,
          providerKeyId: provider.providerKeyId,
          providerLabel: provider.label || provider.vendor,
          isAvailable: enhancedInfo?.isAvailable ?? true,
          lastVerifiedAt: enhancedInfo?.lastVerifiedAt ?? null,
          pricing: enhancedInfo?.pricing ?? null,
          capabilityTags: enhancedInfo?.capabilityTags ?? [],
          supportedApiTypes,
          recommendAnthropic: recommendation.recommend,
          recommendReason: recommendation.reason,
        });
      });
    });

    // Sort by vendor, then by model name
    return options.sort((a, b) => {
      if (a.vendor !== b.vendor) return a.vendor.localeCompare(b.vendor);
      return a.model.localeCompare(b.model);
    });
  }, [providers, enhancedModels]);

  // Filter models by search query
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return modelOptions;
    const query = searchQuery.toLowerCase();
    return modelOptions.filter(
      (option) =>
        option.model.toLowerCase().includes(query) ||
        option.vendor.toLowerCase().includes(query) ||
        option.providerLabel.toLowerCase().includes(query),
    );
  }, [modelOptions, searchQuery]);

  // Group models by vendor for display
  const groupedOptions = useMemo(() => {
    const groups: Record<string, ModelOption[]> = {};
    filteredOptions.forEach((option) => {
      const vendorGroup = groups[option.vendor];
      if (!vendorGroup) {
        groups[option.vendor] = [option];
      } else {
        vendorGroup.push(option);
      }
    });
    return groups;
  }, [filteredOptions]);

  // Get current selected model display
  const selectedModel = useMemo(() => {
    if (!value?.model || !value?.providerKeyId) return null;
    return modelOptions.find(
      (m) => m.model === value.model && m.providerKeyId === value.providerKeyId,
    );
  }, [value, modelOptions]);

  const handleSelect = useCallback(
    (option: ModelOption) => {
      // Determine the initial protocol preference
      let initialProtocol: ModelApiType | null = null;

      if (option.supportedApiTypes.length > 1) {
        // If model supports multiple protocols, check for recommendation
        if (option.recommendAnthropic && option.supportedApiTypes.includes('anthropic')) {
          initialProtocol = 'anthropic';
        } else {
          // Default to first supported protocol
          initialProtocol = option.supportedApiTypes[0] ?? null;
        }
      }

      setSelectedProtocol(initialProtocol);

      onChange({
        providerKeyId: option.providerKeyId,
        model: option.model,
        preferredApiType: initialProtocol,
      });
      setIsOpen(false);
      setSearchQuery('');
    },
    [onChange],
  );

  // Handle protocol change
  const handleProtocolChange = useCallback(
    (protocol: ModelApiType | null) => {
      setSelectedProtocol(protocol);
      if (value) {
        onChange({
          ...value,
          preferredApiType: protocol,
        });
      }
    },
    [value, onChange],
  );

  const formatPrice = (price: number) => {
    if (price < 0.001) return `$${(price * 1000000).toFixed(2)}/M`;
    if (price < 1) return `$${price.toFixed(4)}`;
    return `$${price.toFixed(2)}`;
  };

  return (
    <div className="space-y-2">
      {label && <Label>{label}</Label>}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={isOpen}
            className="w-full justify-between font-normal"
            disabled={disabled}
          >
            {selectedModel ? (
              <div className="flex items-center gap-2 truncate">
                {showAvailability && (
                  <span
                    className={`size-2 rounded-full ${
                      selectedModel.isAvailable ? 'bg-green-500' : 'bg-red-500'
                    }`}
                  />
                )}
                <span className="truncate">{selectedModel.model}</span>
                {showCapabilities && selectedModel.capabilityTags.length > 0 ? (
                  <>
                    {selectedModel.capabilityTags.slice(0, 2).map((tag) => (
                      <Badge key={tag.id} variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                        {tag.name}
                      </Badge>
                    ))}
                    {selectedModel.capabilityTags.length > 2 && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                        +{selectedModel.capabilityTags.length - 2}
                      </Badge>
                    )}
                  </>
                ) : (
                  <Badge variant="outline" className="text-xs shrink-0">
                    {selectedModel.vendor}
                  </Badge>
                )}
              </div>
            ) : (
              <span className="text-muted-foreground">
                {placeholder || t('form.selectModel')}
              </span>
            )}
            <ChevronDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder={t('form.searchModels')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
          <ScrollArea className="h-[300px]">
            {Object.keys(groupedOptions).length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm">
                {t('form.noModelsFound')}
              </div>
            ) : (
              <div className="p-1">
                {Object.entries(groupedOptions).map(([vendor, options]) => (
                  <div key={vendor} className="mb-2">
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {vendor}
                    </div>
                    {options.map((option) => {
                      const isSelected =
                        value?.model === option.model &&
                        value?.providerKeyId === option.providerKeyId;
                      return (
                        <button
                          key={`${option.providerKeyId}:${option.model}`}
                          type="button"
                          onClick={() => handleSelect(option)}
                          className={`w-full flex items-start gap-2 px-2 py-2 rounded-md text-left transition-colors ${
                            isSelected
                              ? 'bg-primary/10 text-primary'
                              : 'hover:bg-muted'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {showAvailability && (
                                <span
                                  className={`size-2 rounded-full shrink-0 ${
                                    option.isAvailable
                                      ? 'bg-green-500'
                                      : 'bg-red-500'
                                  }`}
                                  title={
                                    option.isAvailable
                                      ? t('form.modelAvailable')
                                      : t('form.modelUnavailable')
                                  }
                                />
                              )}
                              <span className="font-medium truncate">
                                {option.model}
                              </span>
                              {isSelected && (
                                <Check className="size-4 text-primary shrink-0" />
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                              <span>{option.providerLabel}</span>
                              {showPricing && option.pricing && (
                                <>
                                  <span>·</span>
                                  <span className="flex items-center gap-0.5">
                                    <DollarSign className="size-3" />
                                    {formatPrice(option.pricing.inputPrice)}/
                                    {formatPrice(option.pricing.outputPrice)}
                                  </span>
                                </>
                              )}
                              {showAvailability && option.lastVerifiedAt && (
                                <>
                                  <span>·</span>
                                  <span
                                    className="flex items-center gap-0.5"
                                    title={t('form.lastVerified')}
                                  >
                                    <Clock className="size-3" />
                                    {new Date(
                                      option.lastVerifiedAt,
                                    ).toLocaleDateString()}
                                  </span>
                                </>
                              )}
                            </div>
                            {showCapabilities &&
                              option.capabilityTags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {option.capabilityTags.slice(0, 3).map((tag) => (
                                    <Badge
                                      key={tag.id}
                                      variant="secondary"
                                      className="text-[10px] px-1.5 py-0"
                                    >
                                      {tag.name}
                                    </Badge>
                                  ))}
                                  {option.capabilityTags.length > 3 && (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] px-1.5 py-0"
                                    >
                                      +{option.capabilityTags.length - 3}
                                    </Badge>
                                  )}
                                </div>
                              )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {/* Protocol Selector - shown when model supports multiple protocols */}
      {showProtocolSelector && selectedModel && selectedModel.supportedApiTypes.length > 1 && (
        <div className="mt-3 p-3 border rounded-md bg-muted/30">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">{t('protocol.label')}</span>
            {selectedModel.recommendAnthropic && (
              <Badge variant="secondary" className="text-xs">
                <Sparkles className="size-3 mr-1" />
                {t('protocol.recommended')}
              </Badge>
            )}
          </div>
          <Select
            value={selectedProtocol ?? undefined}
            onValueChange={(v) => handleProtocolChange(v as ModelApiType)}
            disabled={disabled}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t('protocol.select')} />
            </SelectTrigger>
            <SelectContent>
              {selectedModel.supportedApiTypes.map((apiType) => (
                <SelectItem key={apiType} value={apiType}>
                  <div className="flex items-center gap-2">
                    <span>{t(`protocol.types.${apiType}`)}</span>
                    {apiType === 'anthropic' && selectedModel.recommendAnthropic && (
                      <Sparkles className="size-3 text-primary" />
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Recommendation hint */}
          {selectedModel.recommendAnthropic && selectedModel.recommendReason && (
            <div className="flex items-start gap-2 mt-2 p-2 bg-primary/5 rounded">
              <Info className="size-4 text-primary mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                {t('protocol.recommendationHint', { reason: selectedModel.recommendReason })}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
