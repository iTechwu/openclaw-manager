'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useWizard } from '../wizard-context';
import { useChannelDefinitions } from '@/lib/api/queries/channel';
import { Input, Label, Badge, Checkbox, Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui';
import { Key, Layers, Loader2, Star, ExternalLink, Bot, MessageSquare } from 'lucide-react';
import { useProviderKeys, useProviderKeyModels } from '@/hooks/useProviderKeys';
import { ProviderAvatar } from '@/app/[locale]/(main)/secrets/components/provider-avatar';
import { ChannelIcon } from '@/lib/config/channels/channel-icons';
import type { ProviderVendor, ProviderModel } from '@repo/contracts';
import { getProviderConfig } from '@repo/contracts';
import { cn } from '@repo/ui/lib/utils';

// API protocol type labels
const API_TYPE_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  'openai-response': 'OpenAI Response',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  'azure-openai': 'Azure OpenAI',
  'aws-bedrock': 'AWS Bedrock',
  vertexai: 'Vertex AI',
  ollama: 'Ollama',
  'new-api': 'New API',
  gateway: 'Gateway',
};

const TTS_VOICES = [
  { id: 'alloy', label: 'Alloy' },
  { id: 'echo', label: 'Echo' },
  { id: 'fable', label: 'Fable' },
  { id: 'onyx', label: 'Onyx' },
  { id: 'nova', label: 'Nova' },
  { id: 'shimmer', label: 'Shimmer' },
];

export function Step4Config() {
  const t = useTranslations('bots.wizard.step4');
  const { state, dispatch } = useWizard();
  const { keys: providerKeys } = useProviderKeys();
  const { getModels } = useProviderKeyModels();
  const { getChannel, isLoading: isLoadingChannels } = useChannelDefinitions();

  // State for fetched models per provider key
  const [keyModels, setKeyModels] = useState<Record<string, ProviderModel[]>>(
    {},
  );
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set());

  // Fetch models when a provider key is selected
  const fetchModelsForKey = useCallback(
    async (keyId: string) => {
      if (keyModels[keyId] || loadingKeys.has(keyId)) return;

      setLoadingKeys((prev) => new Set(prev).add(keyId));
      try {
        const result = await getModels(keyId);
        if (result?.models) {
          setKeyModels((prev) => ({ ...prev, [keyId]: result.models || [] }));
        }
      } catch (error) {
        console.error('Failed to fetch models for key:', keyId, error);
      } finally {
        setLoadingKeys((prev) => {
          const next = new Set(prev);
          next.delete(keyId);
          return next;
        });
      }
    },
    [getModels, keyModels, loadingKeys],
  );

  // Fetch models for all selected provider keys on mount
  useEffect(() => {
    state.enabledProviders.forEach((providerId) => {
      const config = state.providerConfigs[providerId];
      if (config?.keyId) {
        fetchModelsForKey(config.keyId);
      }
    });
  }, [state.enabledProviders, state.providerConfigs, fetchModelsForKey]);

  // Handle model toggle (add/remove from selected models)
  const handleModelToggle = (providerId: string, modelId: string, checked: boolean) => {
    const config = state.providerConfigs[providerId] || { models: [] };
    const currentModels = config.models || [];

    let newModels: string[];
    if (checked) {
      newModels = [...currentModels, modelId];
    } else {
      newModels = currentModels.filter((m) => m !== modelId);
    }

    // If removing the primary model, set a new primary
    let newPrimary = config.primaryModel;
    if (!checked && config.primaryModel === modelId) {
      newPrimary = newModels[0] || undefined;
    }
    // If this is the first model, make it primary
    if (checked && newModels.length === 1) {
      newPrimary = modelId;
    }

    dispatch({
      type: 'SET_PROVIDER_CONFIG',
      providerId,
      config: { models: newModels, primaryModel: newPrimary },
    });
  };

  // Handle setting primary model
  const handleSetPrimary = (providerId: string, modelId: string) => {
    dispatch({
      type: 'SET_PROVIDER_CONFIG',
      providerId,
      config: { primaryModel: modelId },
    });
  };

  // Handle credential change
  const handleCredentialChange = (channelId: string, key: string, value: string) => {
    dispatch({ type: 'SET_CHANNEL_CREDENTIAL', channelId, key, value });
  };

  const handleTtsVoiceChange = (voice: string) => {
    dispatch({ type: 'SET_FEATURE', feature: 'ttsVoice', value: voice });
  };

  const handleSandboxTimeoutChange = (timeout: number) => {
    dispatch({
      type: 'SET_FEATURE',
      feature: 'sandboxTimeout',
      value: timeout,
    });
  };

  // Get display name for a key
  const getKeyDisplayName = (keyId: string) => {
    const key = providerKeys.find((k) => k.id === keyId);
    if (!key) return keyId.slice(0, 8) + '...';
    if (key.label) return key.label;
    if (key.tag) return key.tag;
    return key.id.slice(0, 8) + '...';
  };

  // Get provider key info
  const getProviderKeyInfo = (keyId: string) => {
    return providerKeys.find((k) => k.id === keyId);
  };

  // Determine which tabs to show
  const hasProviders = state.enabledProviders.length > 0;
  const hasChannels = state.enabledChannels.length > 0;
  const hasFeatures = state.features.tts || state.features.sandbox;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">{t('title')}</h3>
        <p className="text-muted-foreground text-sm">{t('description')}</p>
      </div>

      {/* Tabs for LLM / Channels / Features */}
      <Tabs defaultValue={hasProviders ? 'llm' : hasChannels ? 'channels' : 'features'} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="llm" disabled={!hasProviders} className="gap-2">
            <Bot className="size-4" />
            {t('llmConfig')}
          </TabsTrigger>
          <TabsTrigger value="channels" disabled={!hasChannels} className="gap-2">
            <MessageSquare className="size-4" />
            {t('channelConfig')}
          </TabsTrigger>
          <TabsTrigger value="features" disabled={!hasFeatures} className="gap-2">
            {t('featureSettings')}
          </TabsTrigger>
        </TabsList>

        {/* LLM Provider Configuration Tab */}
        <TabsContent value="llm" className="space-y-4 mt-4">
          {state.enabledProviders.map((providerId) => {
            const config = state.providerConfigs[providerId] || { models: [] };
            const keyId = config.keyId;
            const providerKey = keyId ? getProviderKeyInfo(keyId) : null;
            const providerConfig = getProviderConfig(providerId as ProviderVendor);

            // Get API type from provider key or provider config
            const apiType = providerKey?.apiType || providerConfig?.apiType;

            // Get models from fetched data or empty array
            const availableModels = keyId && keyModels[keyId] ? keyModels[keyId] : [];
            const isLoadingModels = keyId ? loadingKeys.has(keyId) : false;
            const selectedModels = config.models || [];
            const primaryModel = config.primaryModel;

            return (
              <div key={providerId} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ProviderAvatar
                      providerId={providerId as ProviderVendor}
                      size="lg"
                    />
                    <div>
                      <div className="font-medium">
                        {providerConfig?.name || providerId}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        {apiType && (
                          <span className="flex items-center gap-1">
                            <Layers className="size-3" />
                            {API_TYPE_LABELS[apiType] || apiType}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {keyId && (
                    <Badge variant="secondary" className="gap-1.5">
                      <Key className="size-3" />
                      {getKeyDisplayName(keyId)}
                    </Badge>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>{t('selectModels')}</Label>
                    {selectedModels.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {t('selectedCount', { count: selectedModels.length })}
                      </span>
                    )}
                  </div>

                  {isLoadingModels ? (
                    <div className="flex items-center gap-2 h-10 px-3 border rounded-md">
                      <Loader2 className="size-4 animate-spin" />
                      <span className="text-sm text-muted-foreground">
                        {t('loadingModels')}
                      </span>
                    </div>
                  ) : availableModels.length > 0 ? (
                    <div className="border rounded-md max-h-48 overflow-y-auto">
                      {availableModels.map((model) => {
                        const isSelected = selectedModels.includes(model.id);
                        const isPrimary = primaryModel === model.id;

                        return (
                          <div
                            key={model.id}
                            className={cn(
                              'flex items-center gap-3 px-3 py-2 hover:bg-muted/50 border-b last:border-b-0',
                              isSelected && 'bg-muted/30',
                            )}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) =>
                                handleModelToggle(providerId, model.id, !!checked)
                              }
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">
                                {model.name || model.id}
                              </div>
                              {model.name && model.name !== model.id && (
                                <div className="text-xs text-muted-foreground truncate">
                                  {model.id}
                                </div>
                              )}
                            </div>
                            {isSelected && (
                              <button
                                type="button"
                                onClick={() => handleSetPrimary(providerId, model.id)}
                                className={cn(
                                  'p-1 rounded hover:bg-muted',
                                  isPrimary ? 'text-yellow-500' : 'text-muted-foreground',
                                )}
                                title={isPrimary ? t('primaryModel') : t('setAsPrimary')}
                              >
                                <Star
                                  className={cn('size-4', isPrimary && 'fill-current')}
                                />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <Input
                      value={selectedModels.join(', ')}
                      onChange={(e) => {
                        const models = e.target.value
                          .split(',')
                          .map((m) => m.trim())
                          .filter(Boolean);
                        dispatch({
                          type: 'SET_PROVIDER_CONFIG',
                          providerId,
                          config: {
                            models,
                            primaryModel: models[0] || undefined,
                          },
                        });
                      }}
                      placeholder={t('enterModelIds')}
                    />
                  )}

                  {selectedModels.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {selectedModels.map((modelId) => (
                        <Badge
                          key={modelId}
                          variant={primaryModel === modelId ? 'default' : 'secondary'}
                          className="gap-1"
                        >
                          {primaryModel === modelId && (
                            <Star className="size-3 fill-current" />
                          )}
                          {modelId}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </TabsContent>

        {/* Channel Configuration Tab */}
        <TabsContent value="channels" className="space-y-4 mt-4">
          {isLoadingChannels ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            state.enabledChannels.map((channelId) => {
              const channel = getChannel(channelId);
              const config = state.channelConfigs[channelId] || {};

              return (
                <div key={channelId} className="rounded-lg border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="bg-muted flex size-10 items-center justify-center rounded-lg">
                        <ChannelIcon channelId={channelId} className="size-6" />
                      </div>
                      <div>
                        <div className="font-medium">
                          {channel?.label || channelId}
                        </div>
                        {channel?.tokenHint && (
                          <div className="text-muted-foreground text-xs">
                            {channel.tokenHint}
                          </div>
                        )}
                      </div>
                    </div>
                    {channel?.helpUrl && (
                      <a
                        href={channel.helpUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="size-3" />
                        {channel.helpText || t('getCredentials')}
                      </a>
                    )}
                  </div>

                {/* Credential Fields */}
                <div className="grid gap-3">
                  {channel?.credentialFields?.map((field) => (
                    <div key={field.key} className="space-y-1.5">
                      <Label className="text-sm">
                        {field.label}
                        {field.required && <span className="text-destructive ml-1">*</span>}
                      </Label>
                      <Input
                        type={field.fieldType}
                        value={config[field.key] || ''}
                        onChange={(e) =>
                          handleCredentialChange(channelId, field.key, e.target.value)
                        }
                        placeholder={field.placeholder}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })
          )}
        </TabsContent>

        {/* Feature Settings Tab */}
        <TabsContent value="features" className="space-y-4 mt-4">
          {state.features.tts && (
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="bg-muted flex size-10 items-center justify-center rounded-lg text-lg">
                  🔊
                </div>
                <div className="font-medium">{t('tts')}</div>
              </div>
              <div className="space-y-2">
                <Label>{t('voice')}</Label>
                <Select
                  value={state.features.ttsVoice}
                  onValueChange={handleTtsVoiceChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('selectVoice')} />
                  </SelectTrigger>
                  <SelectContent>
                    {TTS_VOICES.map((voice) => (
                      <SelectItem key={voice.id} value={voice.id}>
                        {voice.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {state.features.sandbox && (
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="bg-muted flex size-10 items-center justify-center rounded-lg text-lg">
                  📦
                </div>
                <div className="font-medium">{t('sandboxMode')}</div>
              </div>
              <div className="space-y-2">
                <Label>{t('timeout')}</Label>
                <Input
                  type="number"
                  value={state.features.sandboxTimeout}
                  onChange={(e) =>
                    handleSandboxTimeoutChange(parseInt(e.target.value) || 30)
                  }
                  min={5}
                  max={300}
                />
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Empty State */}
      {!hasProviders && !hasChannels && (
        <div className="text-muted-foreground py-8 text-center">
          <p>{t('emptyState')}</p>
          <p>{t('emptyStateHint')}</p>
        </div>
      )}
    </div>
  );
}
