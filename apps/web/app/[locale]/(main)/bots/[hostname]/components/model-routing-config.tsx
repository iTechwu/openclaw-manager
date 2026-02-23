'use client';

import { useState, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { modelRoutingClient, modelClient } from '@/lib/api/contracts';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Input,
  Label,
  Switch,
  Badge,
  ScrollArea,
  Skeleton,
  Separator,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@repo/ui';
import {
  Plus,
  Trash2,
  Edit,
  Route,
  Loader2,
  ChevronDown,
  ChevronUp,
  Scale,
  Shield,
  Zap,
  Sparkles,
  Wand2,
  Check,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  BotModelRouting,
  CreateRoutingConfigInput,
  FallbackModel,
  UpdateRoutingConfigInput,
  RoutingConfig,
  FunctionRouteRule,
  LoadBalanceTarget,
  RoutingTarget,
  RoutingSuggestionResult,
  SuggestedRoutingRule,
} from '@repo/contracts';
import { EnhancedModelSelector } from './enhanced-model-selector';
import { FallbackChainSelector } from './fallback-chain-selector';
import { CostStrategySelector } from './cost-strategy-selector';
import type { EnhancedModelInfo } from '@/hooks/useRoutingConfig';
import { useFallbackChains } from '@/hooks/useRoutingConfig';

/**
 * Provider info needed for model selection
 */
interface ProviderInfo {
  providerKeyId: string;
  vendor: string;
  label?: string;
  allowedModels: string[];
}

interface ModelRoutingConfigProps {
  hostname: string;
}

type RoutingType = 'FUNCTION_ROUTE' | 'LOAD_BALANCE' | 'FAILOVER';

const ROUTING_TYPE_ICONS: Record<RoutingType, React.ReactNode> = {
  FUNCTION_ROUTE: <Route className="size-4" />,
  LOAD_BALANCE: <Scale className="size-4" />,
  FAILOVER: <Shield className="size-4" />,
};

const PREDEFINED_INTENT_KEYS = [
  'code',
  'translation',
  'math',
  'creative',
  'analysis',
  'image',
  'video',
  'audio',
  '3d',
  'summary',
  'knowledge',
  'deepReasoning',
  'fastResponse',
  'longContext',
] as const;

// Model recommendations by scenario - based on model-catalog.data.ts
// Updated with latest model versions (2026-02-10)
const SCENARIO_MODEL_RECOMMENDATIONS: Record<
  string,
  { primary: string[]; alternatives: string[] }
> = {
  code: {
    primary: [
      'gpt-5.2-codex',
      'claude-sonnet-4-5-20250929',
      'deepseek-v3-2-251201',
      'grok-code-fast-1',
    ],
    alternatives: [
      'gpt-5.1-codex',
      'o4-mini',
      'claude-sonnet-4-20250514',
      'qwen-3.0',
      'kimi-k2',
      'glm-4.5',
    ],
  },
  translation: {
    primary: [
      'gpt-5.2',
      'claude-sonnet-4-5-20250929',
      'gemini-2.5-pro',
      'doubao-seed-1-6-251015',
    ],
    alternatives: [
      'gpt-4o',
      'gpt-4o-mini',
      'doubao-1.5-pro-32k',
      'qwen-plus-latest',
      'glm-4.5',
      'moonshot-v1-auto',
    ],
  },
  math: {
    primary: ['o3', 'claude-opus-4-6', 'deepseek-r1', 'grok-3-reasoner-r'],
    alternatives: [
      'o4-mini',
      'claude-opus-4-5-20251101',
      'doubao-seed-1.6-thinking',
      'qwen-3.0-thinking',
      'qwq-plus',
      'kimi-k2',
    ],
  },
  creative: {
    primary: ['claude-opus-4-6', 'gpt-5.2-pro', 'grok-4', 'kimi-k2'],
    alternatives: [
      'claude-opus-4-5-20251101',
      'gpt-5',
      'claude-sonnet-4-5-20250929',
      'gemini-2.5-pro',
      'qwen-max-latest',
    ],
  },
  analysis: {
    primary: [
      'claude-opus-4-6',
      'gpt-5.2-pro',
      'gemini-3-pro-preview',
      'kimi-k2',
    ],
    alternatives: [
      'claude-opus-4-5-20251101',
      'gemini-2.5-pro',
      'claude-sonnet-4-5-20250929',
      'deepseek-v3-2-251201',
      'qwen-max-latest',
      'glm-4.5',
    ],
  },
  image: {
    primary: [
      'Midjourney',
      'gpt-image-1.5-plus',
      'flux-kontext-max',
      'grok-4-image',
    ],
    alternatives: [
      'gpt-image-1.5',
      'gpt-image-1',
      'doubao-seedream-4-5-251128',
      'doubao-seedream-3.0-t2i',
      'gemini-3-pro-image-preview',
      'ideogram-generate-v3',
      'qwen-image-plus',
      'flux-kontext-pro',
      'nai-diffusion-4-5-full',
      'kling-image-o1',
    ],
  },
  video: {
    primary: [
      'sora-2-pro',
      'veo3.1-pro',
      'kling-video-o1-pro',
      'hailuo-2.3-pro',
    ],
    alternatives: [
      'sora-2',
      'veo3.1',
      'veo3',
      'kling-v2.6-pro',
      'hailuo-02-pro',
      'viduq3-pro',
      'wan2.1-14b',
      'doubao-seedance-1-0-pro',
      'doubao-seedance-1.0-lite',
    ],
  },
  audio: {
    primary: ['speech-2.6-hd', 'gpt-4o-mini-tts', 'speech-2.5-hd-preview'],
    alternatives: [
      'speech-02-turbo',
      'gemini-2.5-pro-preview-tts',
      'gemini-2.5-flash-preview-tts',
      'speech-2.5-turbo-preview',
    ],
  },
  '3d': {
    primary: ['tripo3d-v2.5'],
    alternatives: [],
  },
  summary: {
    primary: [
      'gemini-3-flash-preview',
      'claude-haiku-4-5-20251001',
      'gpt-4o-mini',
    ],
    alternatives: [
      'gemini-2.5-flash',
      'gpt-4.1-mini',
      'doubao-seed-1-6-flash',
      'qwen-turbo',
      'glm-4.5-air',
      'moonshot-v1-auto',
    ],
  },
  knowledge: {
    primary: [
      'gpt-5.2',
      'claude-sonnet-4-5-20250929',
      'gemini-2.5-pro',
      'kimi-k2',
    ],
    alternatives: [
      'gpt-4o',
      'gpt-4.1',
      'deepseek-v3-2-251201',
      'grok-3',
      'qwen-max-latest',
      'glm-4.5',
    ],
  },
  deepReasoning: {
    primary: [
      'o3',
      'claude-opus-4-6',
      'deepseek-r1',
      'grok-3-reasoner-r',
      'kimi-k2',
    ],
    alternatives: [
      'o4-mini',
      'claude-opus-4-5-20251101',
      'doubao-seed-1.6-thinking',
      'qwen-3.0-thinking',
      'qwq-plus',
      'grok-4-1-fast-reasoning',
    ],
  },
  fastResponse: {
    primary: [
      'gemini-3-flash-preview',
      'gpt-4o-mini',
      'claude-haiku-4-5-20251001',
    ],
    alternatives: [
      'gemini-2.5-flash',
      'gpt-4.1-nano',
      'gpt-5-nano',
      'doubao-seed-1-6-flash',
      'grok-3-mini',
      'glm-4.5-air',
      'moonshot-v1-auto',
    ],
  },
  longContext: {
    primary: ['gemini-3-pro-preview', 'gemini-2.5-pro', 'grok-4', 'kimi-k2'],
    alternatives: [
      'claude-opus-4-6',
      'claude-opus-4-5-20251101',
      'gpt-5.2',
      'claude-sonnet-4-5-20250929',
      'doubao-1.5-pro-256k',
      'qwen-long',
      'moonshot-v1-128k',
    ],
  },
};

const FAILOVER_TEMPLATE_KEYS = [
  'singleFallback',
  'doubleFallback',
  'tripleFallback',
] as const;

const LOAD_BALANCE_TEMPLATE_KEYS = [
  'dualEqual',
  'tripleEqual',
  'primaryHeavy',
] as const;

export function ModelRoutingConfig({ hostname }: ModelRoutingConfigProps) {
  const t = useTranslations('bots.detail.modelRouting');
  const { chains: fallbackChains } = useFallbackChains();

  const [routings, setRoutings] = useState<BotModelRouting[]>([]);
  const [botProviders, setBotProviders] = useState<ProviderInfo[]>([]);
  const [enhancedModels, setEnhancedModels] = useState<EnhancedModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRouting, setEditingRouting] = useState<BotModelRouting | null>(
    null,
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestions, setSuggestions] =
    useState<RoutingSuggestionResult | null>(null);
  const [isSuggestDialogOpen, setIsSuggestDialogOpen] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<RoutingType>('FUNCTION_ROUTE');
  const [formPriority, setFormPriority] = useState(100);

  // Function route state
  const [functionRules, setFunctionRules] = useState<FunctionRouteRule[]>([]);
  const [defaultTarget, setDefaultTarget] = useState<RoutingTarget>({
    providerKeyId: '',
    model: '',
  });
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);

  // Load balance state
  const [lbStrategy, setLbStrategy] = useState<
    'round_robin' | 'weighted' | 'least_latency'
  >('round_robin');
  const [lbTargets, setLbTargets] = useState<LoadBalanceTarget[]>([]);
  const [lbCostStrategyId, setLbCostStrategyId] = useState<string | null>(null);

  // Failover state
  const [failoverPrimary, setFailoverPrimary] = useState<RoutingTarget>({
    providerKeyId: '',
    model: '',
  });
  const [failoverChain, setFailoverChain] = useState<RoutingTarget[]>([]);
  const [selectedChainId, setSelectedChainId] = useState<string | null>(null);
  const [retryMaxAttempts, setRetryMaxAttempts] = useState(3);
  const [retryDelayMs, setRetryDelayMs] = useState(1000);

  // Fetch routings and model availability
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [routingsResponse, availabilityResponse] = await Promise.all([
        modelRoutingClient.list({ params: { hostname } }),
        modelClient.getAvailability({ query: {} }),
      ]);

      if (routingsResponse.status === 200 && routingsResponse.body.data) {
        setRoutings(routingsResponse.body.data.routings);
      }

      if (
        availabilityResponse.status === 200 &&
        availabilityResponse.body.data
      ) {
        // Transform ModelAvailabilityItem[] to ProviderInfo[]
        // Group models by providerKeyId
        const providerMap = new Map<string, ProviderInfo>();
        const availabilityList = availabilityResponse.body.data.list ?? [];
        const enhanced: EnhancedModelInfo[] = [];

        for (const item of availabilityList) {
          if (!item.isAvailable) continue; // Only include available models

          const vendor = item.providerKeys?.[0]?.vendor ?? '';

          const existing = providerMap.get(item.providerKeyId);
          if (existing) {
            if (!existing.allowedModels.includes(item.model)) {
              existing.allowedModels.push(item.model);
            }
          } else {
            providerMap.set(item.providerKeyId, {
              providerKeyId: item.providerKeyId,
              vendor,
              allowedModels: [item.model],
            });
          }

          // Build enhanced model info with capability tags
          enhanced.push({
            providerKeyId: item.providerKeyId,
            model: item.model,
            vendor,
            isAvailable: item.isAvailable,
            lastVerifiedAt: item.lastVerifiedAt ?? null,
            pricing: null,
            capabilityTags: item.capabilityTags ?? [],
            scores: null,
          });
        }

        setBotProviders(Array.from(providerMap.values()));
        setEnhancedModels(enhanced);
      }
    } catch {
      toast.error('Failed to load routing configurations');
    } finally {
      setLoading(false);
    }
  }, [hostname]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Get all providers that have a specific model
  const getProvidersForModel = useCallback(
    (modelId: string): ProviderInfo[] => {
      return botProviders.filter((p) => p.allowedModels.includes(modelId));
    },
    [botProviders],
  );

  // Apply a recommended model to the last rule
  const applyRecommendedModel = useCallback(
    (model: string, providers: ProviderInfo[]) => {
      if (providers.length === 0) {
        toast.error(
          t('functionRoute.recommendedModels.notAvailable', { model }),
        );
        return;
      }

      if (functionRules.length === 0) {
        toast.error(t('functionRoute.recommendedModels.noRuleToApply'));
        return;
      }

      const lastRuleIndex = functionRules.length - 1;
      const lastRule = functionRules[lastRuleIndex];
      if (!lastRule) return;

      // Use the first available provider
      const provider = providers[0];
      if (!provider) return;

      const newRules = [...functionRules];
      newRules[lastRuleIndex] = {
        pattern: lastRule.pattern,
        matchType: lastRule.matchType,
        target: {
          providerKeyId: provider.providerKeyId,
          model,
        },
      };
      setFunctionRules(newRules);

      const providerInfo =
        providers.length > 1 ? ` (${provider.label || provider.vendor})` : '';
      toast.success(
        t('functionRoute.recommendedModels.applied', {
          model: model + providerInfo,
        }),
      );
    },
    [functionRules, t],
  );

  const resetForm = () => {
    setFormName('');
    setFormType('FUNCTION_ROUTE');
    setFormPriority(100);
    setFunctionRules([]);
    setDefaultTarget({ providerKeyId: '', model: '' });
    setLbStrategy('round_robin');
    setLbTargets([]);
    setLbCostStrategyId(null);
    setFailoverPrimary({ providerKeyId: '', model: '' });
    setFailoverChain([]);
    setSelectedChainId(null);
    setRetryMaxAttempts(3);
    setRetryDelayMs(1000);
    setEditingRouting(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (routing: BotModelRouting) => {
    setEditingRouting(routing);
    setFormName(routing.name);
    setFormType(routing.routingType as RoutingType);
    setFormPriority(routing.priority);

    const config = routing.config as RoutingConfig;
    if (config.type === 'FUNCTION_ROUTE') {
      setFunctionRules(config.rules);
      setDefaultTarget(config.defaultTarget);
    } else if (config.type === 'LOAD_BALANCE') {
      setLbStrategy(config.strategy);
      setLbTargets(config.targets);
      setLbCostStrategyId(config.costStrategyId ?? null);
    } else if (config.type === 'FAILOVER') {
      setFailoverPrimary(config.primary);
      setFailoverChain(config.fallbackChain);
      setRetryMaxAttempts(config.retry.maxAttempts);
      setRetryDelayMs(config.retry.delayMs);
    }

    setIsDialogOpen(true);
  };

  const buildConfig = (): RoutingConfig => {
    switch (formType) {
      case 'FUNCTION_ROUTE':
        return {
          type: 'FUNCTION_ROUTE',
          rules: functionRules,
          defaultTarget,
        };
      case 'LOAD_BALANCE':
        return {
          type: 'LOAD_BALANCE',
          strategy: lbStrategy,
          targets: lbTargets,
          costStrategyId: lbCostStrategyId,
        };
      case 'FAILOVER':
        return {
          type: 'FAILOVER',
          primary: failoverPrimary,
          fallbackChain: failoverChain,
          retry: {
            maxAttempts: retryMaxAttempts,
            delayMs: retryDelayMs,
          },
        };
    }
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error('Please enter a routing name');
      return;
    }

    // 验证路由配置
    if (formType === 'LOAD_BALANCE') {
      if (lbTargets.length === 0) {
        toast.error(t('loadBalance.errors.noTargets'));
        return;
      }
      const invalidTargets = lbTargets.filter(
        (t) => !t.providerKeyId || !t.model,
      );
      if (invalidTargets.length > 0) {
        toast.error(t('loadBalance.errors.invalidTargets'));
        return;
      }
    } else if (formType === 'FAILOVER') {
      if (!failoverPrimary.providerKeyId || !failoverPrimary.model) {
        toast.error(t('failover.errors.noPrimary'));
        return;
      }
    } else if (formType === 'FUNCTION_ROUTE') {
      if (functionRules.length === 0) {
        toast.error(t('functionRoute.errors.noRules'));
        return;
      }
      const invalidRules = functionRules.filter(
        (r) => !r.target.providerKeyId || !r.target.model,
      );
      if (invalidRules.length > 0) {
        toast.error(t('functionRoute.errors.invalidRules'));
        return;
      }
      if (!defaultTarget.providerKeyId || !defaultTarget.model) {
        toast.error(t('functionRoute.errors.noDefaultTarget'));
        return;
      }
    }

    setActionLoading(true);
    try {
      const config = buildConfig();

      if (editingRouting) {
        const input: UpdateRoutingConfigInput = {
          name: formName,
          config,
          priority: formPriority,
        };
        const response = await modelRoutingClient.update({
          params: { hostname, routingId: editingRouting.id },
          body: input,
        });
        if (response.status === 200) {
          toast.success(t('messages.updateSuccess'));
          setIsDialogOpen(false);
          resetForm();
          await fetchData();
        }
      } else {
        const input: CreateRoutingConfigInput = {
          name: formName,
          config,
          priority: formPriority,
        };
        const response = await modelRoutingClient.create({
          params: { hostname },
          body: input,
        });
        if (response.status === 201) {
          toast.success(t('messages.createSuccess'));
          setIsDialogOpen(false);
          resetForm();
          await fetchData();
        }
      }
    } catch {
      toast.error('Failed to save routing configuration');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (routingId: string) => {
    if (!confirm(t('messages.deleteConfirm'))) return;

    setActionLoading(true);
    try {
      const response = await modelRoutingClient.delete({
        params: { hostname, routingId },
      });
      if (response.status === 200) {
        toast.success(t('messages.deleteSuccess'));
        await fetchData();
      }
    } catch {
      toast.error('Failed to delete routing');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleEnabled = async (routing: BotModelRouting) => {
    setActionLoading(true);
    try {
      const endpoint = routing.isEnabled
        ? modelRoutingClient.disable
        : modelRoutingClient.enable;
      const response = await endpoint({
        params: { hostname, routingId: routing.id },
        body: {},
      });
      if (response.status === 200) {
        toast.success(
          routing.isEnabled
            ? t('messages.disableSuccess')
            : t('messages.enableSuccess'),
        );
        await fetchData();
      }
    } catch {
      toast.error('Failed to toggle routing status');
    } finally {
      setActionLoading(false);
    }
  };

  // Fetch AI suggestions
  const handleFetchSuggestions = async () => {
    setSuggestionsLoading(true);
    try {
      const response = await modelRoutingClient.suggest({
        params: { hostname },
      });
      if (response.status === 200 && response.body.data) {
        setSuggestions(response.body.data);
        setIsSuggestDialogOpen(true);
      }
    } catch {
      toast.error(t('messages.suggestError'));
    } finally {
      setSuggestionsLoading(false);
    }
  };

  // Apply a suggested function route rule
  const handleApplySuggestedRule = (rule: SuggestedRoutingRule) => {
    setFunctionRules([
      ...functionRules,
      {
        pattern: rule.pattern,
        matchType: rule.matchType,
        target: rule.target,
      },
    ]);
    toast.success(t('messages.ruleApplied', { name: rule.name }));
  };

  // Apply all suggested function route rules as a new routing config
  const handleApplyAllSuggestions = async () => {
    if (!suggestions) return;

    setActionLoading(true);
    try {
      const config: RoutingConfig = {
        type: 'FUNCTION_ROUTE',
        rules: suggestions.functionRouteRules.map((rule) => ({
          pattern: rule.pattern,
          matchType: rule.matchType,
          target: rule.target,
        })),
        defaultTarget: suggestions.defaultTarget,
      };

      const input: CreateRoutingConfigInput = {
        name: t('autoGenerate.suggestedRoutingName'),
        config,
        priority: 50,
      };

      const response = await modelRoutingClient.create({
        params: { hostname },
        body: input,
      });

      if (response.status === 201) {
        toast.success(t('messages.createSuccess'));
        setIsSuggestDialogOpen(false);
        setSuggestions(null);
        await fetchData();
      }
    } catch {
      toast.error('Failed to apply suggestions');
    } finally {
      setActionLoading(false);
    }
  };

  // Apply failover suggestion
  const handleApplyFailoverSuggestion = async () => {
    if (!suggestions?.failoverSuggestion) return;

    setActionLoading(true);
    try {
      const config: RoutingConfig = {
        type: 'FAILOVER',
        primary: suggestions.failoverSuggestion.primary,
        fallbackChain: suggestions.failoverSuggestion.fallbackChain,
        retry: {
          maxAttempts: 3,
          delayMs: 1000,
        },
      };

      const input: CreateRoutingConfigInput = {
        name: t('autoGenerate.suggestedFailoverName'),
        config,
        priority: 100,
      };

      const response = await modelRoutingClient.create({
        params: { hostname },
        body: input,
      });

      if (response.status === 201) {
        toast.success(t('messages.createSuccess'));
        setIsSuggestDialogOpen(false);
        setSuggestions(null);
        await fetchData();
      }
    } catch {
      toast.error('Failed to apply failover suggestion');
    } finally {
      setActionLoading(false);
    }
  };

  // Target selector component - now uses EnhancedModelSelector for direct model selection
  const TargetSelector = ({
    target,
    onChange,
    label,
  }: {
    target: RoutingTarget;
    onChange: (target: RoutingTarget) => void;
    label: string;
  }) => {
    return (
      <EnhancedModelSelector
        providers={botProviders}
        enhancedModels={enhancedModels}
        value={target.providerKeyId && target.model ? target : null}
        onChange={onChange}
        label={label}
        showAvailability={true}
        showCapabilities={true}
      />
    );
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="size-5" />
              {t('title')}
            </CardTitle>
            <CardDescription>{t('description')}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleFetchSuggestions}
              variant="outline"
              size="sm"
              disabled={suggestionsLoading || botProviders.length === 0}
            >
              {suggestionsLoading ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
              ) : (
                <Wand2 className="size-4 mr-2" />
              )}
              {t('autoGenerate.button')}
            </Button>
            <Button onClick={openCreateDialog} size="sm">
              <Plus className="size-4 mr-2" />
              {t('addRouting')}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {routings.length === 0 ? (
          <div className="text-center py-8">
            <Route className="size-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground mb-4">{t('noRoutings')}</p>
            <Button onClick={openCreateDialog} variant="outline">
              <Plus className="size-4 mr-2" />
              {t('addFirst')}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {routings.map((routing) => (
              <div
                key={routing.id}
                className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      {ROUTING_TYPE_ICONS[routing.routingType as RoutingType]}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{routing.name}</span>
                        <Badge
                          variant={routing.isEnabled ? 'default' : 'secondary'}
                        >
                          {routing.isEnabled ? t('enabled') : t('disabled')}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {t(`types.${routing.routingType}`)} · {t('priority')}:{' '}
                        {routing.priority}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={routing.isEnabled}
                      onCheckedChange={() => handleToggleEnabled(routing)}
                      disabled={actionLoading}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setExpandedId(
                          expandedId === routing.id ? null : routing.id,
                        )
                      }
                    >
                      {expandedId === routing.id ? (
                        <ChevronUp className="size-4" />
                      ) : (
                        <ChevronDown className="size-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(routing)}
                    >
                      <Edit className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(routing.id)}
                      disabled={actionLoading}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                {expandedId === routing.id && (
                  <div className="mt-4 pt-4 border-t">
                    <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-48">
                      {JSON.stringify(routing.config, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Create/Edit Dialog */}
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open) resetForm();
          setIsDialogOpen(open);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRouting ? t('editRouting') : t('addRouting')}
            </DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('form.name')}</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={t('form.namePlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('form.priority')}</Label>
                <Input
                  type="number"
                  value={formPriority}
                  onChange={(e) =>
                    setFormPriority(parseInt(e.target.value) || 100)
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {t('form.priorityHint')}
                </p>
              </div>
            </div>

            {/* Routing Type */}
            <div className="space-y-2">
              <Label>{t('routingType')}</Label>
              <div className="grid grid-cols-3 gap-3">
                {(
                  [
                    'FUNCTION_ROUTE',
                    'LOAD_BALANCE',
                    'FAILOVER',
                  ] as RoutingType[]
                ).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFormType(type)}
                    className={`p-4 border rounded-lg text-left transition-colors ${
                      formType === type
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {ROUTING_TYPE_ICONS[type]}
                      <span className="font-medium">{t(`types.${type}`)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t(`types.${type}_DESC`)}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Type-specific configuration */}
            {formType === 'FUNCTION_ROUTE' && (
              <div className="space-y-4">
                <h4 className="font-medium">{t('functionRoute.title')}</h4>

                {/* Rules */}
                <div className="space-y-3">
                  {functionRules.map((rule, index) => (
                    <div
                      key={index}
                      className="border rounded-lg p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          Rule {index + 1}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setFunctionRules(
                              functionRules.filter((_, i) => i !== index),
                            )
                          }
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>{t('functionRoute.pattern')}</Label>
                          <Input
                            value={rule.pattern}
                            onChange={(e) => {
                              const newRules = [...functionRules];
                              newRules[index] = {
                                ...rule,
                                pattern: e.target.value,
                              };
                              setFunctionRules(newRules);
                            }}
                            placeholder={t('functionRoute.patternPlaceholder')}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t('functionRoute.matchType')}</Label>
                          <Select
                            value={rule.matchType}
                            onValueChange={(
                              value: 'keyword' | 'regex' | 'intent',
                            ) => {
                              const newRules = [...functionRules];
                              newRules[index] = { ...rule, matchType: value };
                              setFunctionRules(newRules);
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="keyword">
                                {t('functionRoute.matchTypes.keyword')}
                              </SelectItem>
                              <SelectItem value="regex">
                                {t('functionRoute.matchTypes.regex')}
                              </SelectItem>
                              <SelectItem value="intent">
                                {t('functionRoute.matchTypes.intent')}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <TargetSelector
                        target={rule.target}
                        onChange={(target) => {
                          const newRules = [...functionRules];
                          newRules[index] = { ...rule, target };
                          setFunctionRules(newRules);
                        }}
                        label={t('functionRoute.target')}
                      />
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() =>
                        setFunctionRules([
                          ...functionRules,
                          {
                            pattern: '',
                            matchType: 'keyword',
                            target: { providerKeyId: '', model: '' },
                          },
                        ])
                      }
                    >
                      <Plus className="size-4 mr-2" />
                      {t('functionRoute.addRule')}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline">
                          <Sparkles className="size-4 mr-2" />
                          {t('functionRoute.quickAdd')}
                          <ChevronDown className="size-4 ml-2" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="start"
                        className="w-96 max-h-[400px] overflow-y-auto"
                      >
                        <DropdownMenuLabel>
                          {t('functionRoute.predefinedIntents.title')}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {PREDEFINED_INTENT_KEYS.map((key) => {
                          const recommendations =
                            SCENARIO_MODEL_RECOMMENDATIONS[key];
                          return (
                            <DropdownMenuItem
                              key={key}
                              onClick={() => {
                                const pattern = t(
                                  `functionRoute.predefinedIntents.${key}.pattern`,
                                );
                                setFunctionRules([
                                  ...functionRules,
                                  {
                                    pattern,
                                    matchType: 'keyword',
                                    target: { providerKeyId: '', model: '' },
                                  },
                                ]);
                                setSelectedScenario(key);
                              }}
                            >
                              <div className="flex flex-col gap-1 w-full">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">
                                    {t(
                                      `functionRoute.predefinedIntents.${key}.name`,
                                    )}
                                  </span>
                                  {(key === 'video' ||
                                    key === 'audio' ||
                                    key === '3d') && (
                                    <Badge
                                      variant="secondary"
                                      className="text-[10px] px-1 py-0"
                                    >
                                      {key === 'video'
                                        ? 'Video'
                                        : key === 'audio'
                                          ? 'Audio'
                                          : '3D'}
                                    </Badge>
                                  )}
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {t(
                                    `functionRoute.predefinedIntents.${key}.description`,
                                  )}
                                </span>
                                {recommendations && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {recommendations.primary
                                      .slice(0, 3)
                                      .map((model) => (
                                        <Badge
                                          key={model}
                                          variant="outline"
                                          className="text-[10px] px-1.5 py-0 bg-primary/5"
                                        >
                                          {model}
                                        </Badge>
                                      ))}
                                    {recommendations.primary.length > 3 && (
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] px-1.5 py-0"
                                      >
                                        +{recommendations.primary.length - 3}
                                      </Badge>
                                    )}
                                  </div>
                                )}
                              </div>
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Model Recommendations Panel */}
                  {selectedScenario &&
                    SCENARIO_MODEL_RECOMMENDATIONS[selectedScenario] &&
                    (() => {
                      const recommendations =
                        SCENARIO_MODEL_RECOMMENDATIONS[selectedScenario];
                      return (
                        <div className="mt-4 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <Sparkles className="size-4 text-primary" />
                              <span className="font-medium text-sm">
                                {t('functionRoute.recommendedModels.title', {
                                  scenario: t(
                                    `functionRoute.predefinedIntents.${selectedScenario}.name`,
                                  ),
                                })}
                              </span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() => setSelectedScenario(null)}
                            >
                              {t('functionRoute.recommendedModels.dismiss')}
                            </Button>
                          </div>
                          <div className="space-y-3">
                            <div>
                              <p className="text-xs text-muted-foreground mb-2">
                                {t('functionRoute.recommendedModels.primary')}
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {recommendations.primary.map((model) => {
                                  const providers = getProvidersForModel(model);
                                  const isAvailable = providers.length > 0;
                                  return (
                                    <Badge
                                      key={model}
                                      variant={
                                        isAvailable ? 'default' : 'secondary'
                                      }
                                      className={`text-xs ${
                                        isAvailable
                                          ? 'cursor-pointer hover:bg-primary/80'
                                          : 'opacity-50 cursor-not-allowed'
                                      }`}
                                      onClick={() => {
                                        if (isAvailable) {
                                          applyRecommendedModel(
                                            model,
                                            providers,
                                          );
                                        } else {
                                          toast.error(
                                            t(
                                              'functionRoute.recommendedModels.notAvailable',
                                              { model },
                                            ),
                                          );
                                        }
                                      }}
                                    >
                                      {model}
                                      {isAvailable && providers.length > 1 && (
                                        <span className="ml-1 text-[10px] opacity-70">
                                          ({providers.length})
                                        </span>
                                      )}
                                      {!isAvailable && (
                                        <span className="ml-1 text-[10px]">
                                          ✗
                                        </span>
                                      )}
                                    </Badge>
                                  );
                                })}
                              </div>
                            </div>
                            {recommendations.alternatives.length > 0 && (
                              <div>
                                <p className="text-xs text-muted-foreground mb-2">
                                  {t(
                                    'functionRoute.recommendedModels.alternatives',
                                  )}
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {recommendations.alternatives.map((model) => {
                                    const providers =
                                      getProvidersForModel(model);
                                    const isAvailable = providers.length > 0;
                                    return (
                                      <Badge
                                        key={model}
                                        variant="outline"
                                        className={`text-xs ${
                                          isAvailable
                                            ? 'cursor-pointer hover:bg-muted'
                                            : 'opacity-50 cursor-not-allowed'
                                        }`}
                                        onClick={() => {
                                          if (isAvailable) {
                                            applyRecommendedModel(
                                              model,
                                              providers,
                                            );
                                          } else {
                                            toast.error(
                                              t(
                                                'functionRoute.recommendedModels.notAvailable',
                                                { model },
                                              ),
                                            );
                                          }
                                        }}
                                      >
                                        {model}
                                        {isAvailable &&
                                          providers.length > 1 && (
                                            <span className="ml-1 text-[10px] opacity-70">
                                              ({providers.length})
                                            </span>
                                          )}
                                        {!isAvailable && (
                                          <span className="ml-1 text-[10px]">
                                            ✗
                                          </span>
                                        )}
                                      </Badge>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                          {/* Availability hint */}
                          <p className="text-[10px] text-muted-foreground mt-3 flex items-center gap-1">
                            <Info className="size-3" />
                            {t(
                              'functionRoute.recommendedModels.availabilityHint',
                            )}
                          </p>
                        </div>
                      );
                    })()}
                </div>

                {/* Default Target */}
                <div className="border-t pt-4">
                  <TargetSelector
                    target={defaultTarget}
                    onChange={setDefaultTarget}
                    label={t('functionRoute.defaultTarget')}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('functionRoute.defaultTargetHint')}
                  </p>
                </div>
              </div>
            )}

            {formType === 'LOAD_BALANCE' && (
              <div className="space-y-4">
                <h4 className="font-medium">{t('loadBalance.title')}</h4>

                {/* Cost Strategy Selector */}
                <div className="p-4 bg-muted/30 rounded-lg space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Scale className="size-4" />
                    {t('loadBalance.costOptimization')}
                  </div>
                  <CostStrategySelector
                    value={lbCostStrategyId}
                    onChange={(strategyId) => {
                      setLbCostStrategyId(strategyId);
                      if (strategyId) {
                        toast.info(
                          t('loadBalance.strategySelected', { strategyId }),
                        );
                      }
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('loadBalance.costOptimizationHint')}
                  </p>
                </div>

                <Separator />

                {/* Strategy */}
                <div className="space-y-2">
                  <Label>{t('loadBalance.strategy')}</Label>
                  <Select
                    value={lbStrategy}
                    onValueChange={(v: typeof lbStrategy) => setLbStrategy(v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="round_robin">
                        {t('loadBalance.strategies.round_robin')}
                      </SelectItem>
                      <SelectItem value="weighted">
                        {t('loadBalance.strategies.weighted')}
                      </SelectItem>
                      <SelectItem value="least_latency">
                        {t('loadBalance.strategies.least_latency')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Targets */}
                <div className="space-y-3">
                  <Label>{t('loadBalance.targets')}</Label>
                  {lbTargets.map((target, index) => (
                    <div
                      key={index}
                      className="border rounded-lg p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          Target {index + 1}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setLbTargets(
                              lbTargets.filter((_, i) => i !== index),
                            )
                          }
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                      <TargetSelector
                        target={target}
                        onChange={(newTarget) => {
                          const newTargets = [...lbTargets];
                          newTargets[index] = { ...target, ...newTarget };
                          setLbTargets(newTargets);
                        }}
                        label={t('form.model')}
                      />
                      {lbStrategy === 'weighted' && (
                        <div className="space-y-2">
                          <Label>{t('loadBalance.weight')}</Label>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={target.weight}
                            onChange={(e) => {
                              const newTargets = [...lbTargets];
                              newTargets[index] = {
                                ...target,
                                weight: parseInt(e.target.value) || 1,
                              };
                              setLbTargets(newTargets);
                            }}
                          />
                          <p className="text-xs text-muted-foreground">
                            {t('loadBalance.weightHint')}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() =>
                        setLbTargets([
                          ...lbTargets,
                          { providerKeyId: '', model: '', weight: 1 },
                        ])
                      }
                    >
                      <Plus className="size-4 mr-2" />
                      {t('loadBalance.addTarget')}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline">
                          <Sparkles className="size-4 mr-2" />
                          {t('loadBalance.quickAdd')}
                          <ChevronDown className="size-4 ml-2" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-64">
                        <DropdownMenuLabel>
                          {t('loadBalance.templates.title')}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {LOAD_BALANCE_TEMPLATE_KEYS.map((key) => (
                          <DropdownMenuItem
                            key={key}
                            onClick={() => {
                              if (key === 'dualEqual') {
                                setLbStrategy('round_robin');
                                setLbTargets([
                                  { providerKeyId: '', model: '', weight: 1 },
                                  { providerKeyId: '', model: '', weight: 1 },
                                ]);
                              } else if (key === 'tripleEqual') {
                                setLbStrategy('round_robin');
                                setLbTargets([
                                  { providerKeyId: '', model: '', weight: 1 },
                                  { providerKeyId: '', model: '', weight: 1 },
                                  { providerKeyId: '', model: '', weight: 1 },
                                ]);
                              } else if (key === 'primaryHeavy') {
                                setLbStrategy('weighted');
                                setLbTargets([
                                  { providerKeyId: '', model: '', weight: 70 },
                                  { providerKeyId: '', model: '', weight: 30 },
                                ]);
                              }
                            }}
                          >
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {t(`loadBalance.templates.${key}.name`)}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {t(`loadBalance.templates.${key}.description`)}
                              </span>
                            </div>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            )}

            {formType === 'FAILOVER' && (
              <div className="space-y-4">
                <h4 className="font-medium">{t('failover.title')}</h4>

                {/* Option to use existing FallbackChain */}
                <div className="p-4 bg-muted/30 rounded-lg space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Shield className="size-4" />
                    {t('failover.useExistingChain')}
                  </div>
                  <FallbackChainSelector
                    value={selectedChainId}
                    onChange={(chainId) => {
                      setSelectedChainId(chainId);
                      if (chainId) {
                        // Resolve chain models into failover form fields
                        const chain = fallbackChains.find(
                          (c) => c.chainId === chainId,
                        );
                        const rawModels = chain?.models ?? [];
                        const chainModels: FallbackModel[] = rawModels.filter(
                          (m): m is FallbackModel => m != null,
                        );
                        if (chainModels.length > 0) {
                          const first = chainModels[0];
                          // Find matching providerKeyId for each model
                          const resolveTarget = (
                            m: FallbackModel,
                          ): RoutingTarget => {
                            const provider = botProviders.find(
                              (p) =>
                                p.vendor === m.vendor &&
                                p.allowedModels.includes(m.model),
                            );
                            return {
                              providerKeyId: provider?.providerKeyId ?? '',
                              model: m.model,
                            };
                          };
                          if (first !== undefined) {
                            setFailoverPrimary(resolveTarget(first));
                            setFailoverChain(
                              chainModels.slice(1).map(resolveTarget),
                            );
                            toast.success(
                              t('failover.chainApplied', {
                                name: chain?.name ?? chainId,
                                count: chainModels.length,
                              }),
                            );
                          }
                        } else {
                          toast.info(t('failover.chainSelected', { chainId }));
                        }
                      } else {
                        // Cleared selection — reset failover fields
                        setFailoverPrimary({ providerKeyId: '', model: '' });
                        setFailoverChain([]);
                      }
                    }}
                    providers={botProviders}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('failover.useExistingChainHint')}
                  </p>
                </div>

                <Separator />

                <p className="text-sm text-muted-foreground">
                  {t('failover.orConfigureManually')}
                </p>

                {/* Primary */}
                <TargetSelector
                  target={failoverPrimary}
                  onChange={setFailoverPrimary}
                  label={t('failover.primary')}
                />

                {/* Fallback Chain */}
                <div className="space-y-3">
                  <Label>{t('failover.fallbackChain')}</Label>
                  {failoverChain.map((target, index) => (
                    <div
                      key={index}
                      className="border rounded-lg p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          Fallback {index + 1}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setFailoverChain(
                              failoverChain.filter((_, i) => i !== index),
                            )
                          }
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                      <TargetSelector
                        target={target}
                        onChange={(newTarget) => {
                          const newChain = [...failoverChain];
                          newChain[index] = newTarget;
                          setFailoverChain(newChain);
                        }}
                        label={t('form.model')}
                      />
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() =>
                        setFailoverChain([
                          ...failoverChain,
                          { providerKeyId: '', model: '' },
                        ])
                      }
                    >
                      <Plus className="size-4 mr-2" />
                      {t('failover.addFallback')}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline">
                          <Sparkles className="size-4 mr-2" />
                          {t('failover.quickAdd')}
                          <ChevronDown className="size-4 ml-2" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-64">
                        <DropdownMenuLabel>
                          {t('failover.templates.title')}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {FAILOVER_TEMPLATE_KEYS.map((key) => (
                          <DropdownMenuItem
                            key={key}
                            onClick={() => {
                              const fallbackCount =
                                key === 'singleFallback'
                                  ? 1
                                  : key === 'doubleFallback'
                                    ? 2
                                    : 3;
                              const newChain = Array.from(
                                { length: fallbackCount },
                                () => ({
                                  providerKeyId: '',
                                  model: '',
                                }),
                              );
                              setFailoverChain(newChain);
                            }}
                          >
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {t(`failover.templates.${key}.name`)}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {t(`failover.templates.${key}.description`)}
                              </span>
                            </div>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Retry Config */}
                <div className="border-t pt-4">
                  <h5 className="font-medium mb-3">{t('failover.retry')}</h5>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t('failover.maxAttempts')}</Label>
                      <Input
                        type="number"
                        min={1}
                        max={5}
                        value={retryMaxAttempts}
                        onChange={(e) =>
                          setRetryMaxAttempts(parseInt(e.target.value) || 3)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('failover.delayMs')}</Label>
                      <Input
                        type="number"
                        min={100}
                        max={10000}
                        value={retryDelayMs}
                        onChange={(e) =>
                          setRetryDelayMs(parseInt(e.target.value) || 1000)
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={actionLoading || !formName.trim()}
            >
              {actionLoading && (
                <Loader2 className="size-4 mr-2 animate-spin" />
              )}
              {editingRouting ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Suggestions Dialog */}
      <Dialog open={isSuggestDialogOpen} onOpenChange={setIsSuggestDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="size-5" />
              {t('autoGenerate.title')}
            </DialogTitle>
            <DialogDescription>
              {t('autoGenerate.description')}
            </DialogDescription>
          </DialogHeader>

          {suggestions && (
            <div className="space-y-6 py-4">
              {/* Analysis Summary */}
              <div className="bg-muted/50 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <Info className="size-4 mt-0.5 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {suggestions.analysis.summary}
                  </p>
                </div>
              </div>

              {/* Function Route Rules */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">
                    {t('autoGenerate.suggestedRules')}
                  </h4>
                  <Button
                    size="sm"
                    onClick={handleApplyAllSuggestions}
                    disabled={
                      actionLoading ||
                      suggestions.functionRouteRules.length === 0
                    }
                  >
                    {actionLoading ? (
                      <Loader2 className="size-4 mr-2 animate-spin" />
                    ) : (
                      <Check className="size-4 mr-2" />
                    )}
                    {t('autoGenerate.applyAll')}
                  </Button>
                </div>
                <ScrollArea className="h-[300px]">
                  <div className="space-y-2 pr-4">
                    {suggestions.functionRouteRules.map((rule, index) => {
                      const provider = botProviders.find(
                        (p) => p.providerKeyId === rule.target.providerKeyId,
                      );
                      return (
                        <div
                          key={index}
                          className="border rounded-lg p-3 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium">{rule.name}</span>
                                <Badge variant="outline" className="text-xs">
                                  {rule.confidence}%
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground mb-2">
                                {rule.description}
                              </p>
                              <div className="flex items-center gap-2 text-xs">
                                <Badge variant="secondary">
                                  {provider?.label ||
                                    rule.target.providerKeyId.slice(0, 8)}
                                </Badge>
                                <span className="text-muted-foreground">→</span>
                                <code className="bg-muted px-1.5 py-0.5 rounded">
                                  {rule.target.model}
                                </code>
                              </div>
                              <p className="text-xs text-muted-foreground mt-2 italic">
                                {rule.reasoning}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleApplySuggestedRule(rule)}
                            >
                              <Plus className="size-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>

              {/* Failover Suggestion */}
              {suggestions.failoverSuggestion && (
                <div className="space-y-3 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">
                      {t('autoGenerate.suggestedFailover')}
                    </h4>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleApplyFailoverSuggestion}
                      disabled={actionLoading}
                    >
                      {actionLoading ? (
                        <Loader2 className="size-4 mr-2 animate-spin" />
                      ) : (
                        <Shield className="size-4 mr-2" />
                      )}
                      {t('autoGenerate.applyFailover')}
                    </Button>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="default">
                        {t('autoGenerate.primary')}:{' '}
                        {suggestions.failoverSuggestion.primary.model}
                      </Badge>
                      {suggestions.failoverSuggestion.fallbackChain.map(
                        (target, index) => (
                          <Badge key={index} variant="secondary">
                            {t('autoGenerate.fallback')} {index + 1}:{' '}
                            {target.model}
                          </Badge>
                        ),
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Model Capabilities */}
              <div className="space-y-3 border-t pt-4">
                <h4 className="font-medium">
                  {t('autoGenerate.modelCapabilities')}
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {suggestions.analysis.modelCapabilities
                    .slice(0, 6)
                    .map((cap, index) => (
                      <div
                        key={index}
                        className="border rounded-lg p-2 text-sm"
                      >
                        <div className="font-medium truncate">
                          {cap.modelId}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {cap.strengths.slice(0, 3).join(', ')}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsSuggestDialogOpen(false)}
            >
              {t('autoGenerate.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
