'use client';

import { useState, useMemo, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useWizard } from '../wizard-context';
import { POPULAR_CHANNELS, OTHER_CHANNELS, getProvider } from '@/lib/config';
import { useProviderKeys } from '@/hooks/useProviderKeys';
import { getUser } from '@/lib/storage';
import { Input, Badge, Button } from '@repo/ui';
import { ChevronDown, ChevronUp, Key, Plus, AlertCircle } from 'lucide-react';
import type { ProviderKey, UserInfo } from '@repo/contracts';

type SessionScope = 'user' | 'channel' | 'global';

export function Step3Features() {
  const t = useTranslations('bots.wizard.step3');
  const router = useRouter();
  const { state, dispatch } = useWizard();
  const { keys: providerKeys, loading: keysLoading } = useProviderKeys();
  const [showAllChannels, setShowAllChannels] = useState(false);
  const [user, setUser] = useState<UserInfo | null>(null);

  // Get user info from localStorage
  useEffect(() => {
    const storedUser = getUser();
    setUser(storedUser);
  }, []);

  // Group API keys by vendor
  const keysByVendor = useMemo(() => {
    const grouped: Record<string, ProviderKey[]> = {};
    providerKeys.forEach((key) => {
      if (!grouped[key.vendor]) {
        grouped[key.vendor] = [];
      }
      grouped[key.vendor]!.push(key);
    });
    return grouped;
  }, [providerKeys]);

  // Get vendor list sorted by key count
  const vendors = useMemo(() => {
    return Object.keys(keysByVendor).sort((a, b) => {
      return keysByVendor[b]!.length - keysByVendor[a]!.length;
    });
  }, [keysByVendor]);

  const handleKeyToggle = (key: ProviderKey) => {
    const isSelected = state.providerConfigs[key.vendor]?.keyId === key.id;

    if (isSelected) {
      // Deselect: remove this provider
      dispatch({ type: 'TOGGLE_PROVIDER', providerId: key.vendor });
    } else {
      // Select: add provider if not exists, then set keyId
      if (!state.enabledProviders.includes(key.vendor)) {
        dispatch({ type: 'TOGGLE_PROVIDER', providerId: key.vendor });
      }
      dispatch({
        type: 'SET_PROVIDER_CONFIG',
        providerId: key.vendor,
        config: { keyId: key.id }
      });
    }
  };

  const handleChannelToggle = (channelId: string) => {
    dispatch({ type: 'TOGGLE_CHANNEL', channelId });
  };

  const handleFeatureChange = (
    feature: 'commands' | 'tts' | 'sandbox',
    value: boolean
  ) => {
    dispatch({ type: 'SET_FEATURE', feature, value });
  };

  const handleSessionScopeChange = (scope: SessionScope) => {
    dispatch({ type: 'SET_FEATURE', feature: 'sessionScope', value: scope });
  };

  const handleTagsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const tags = value
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0 && /^[a-z0-9-]+$/.test(t));
    dispatch({ type: 'SET_ROUTING_TAGS', tags });
  };

  const handleGoToSettings = () => {
    router.push('/secrets');
  };

  // Check if a key is selected
  const isKeySelected = (key: ProviderKey) => {
    return state.providerConfigs[key.vendor]?.keyId === key.id;
  };

  // Get display name for a key
  const getKeyDisplayName = (key: ProviderKey) => {
    if (key.label) return key.label;
    if (key.tag) return key.tag;
    return `${key.id.slice(0, 8)}...`;
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">{t('title')}</h3>
        <p className="text-muted-foreground text-sm">
          {t('description')}
        </p>
      </div>

      {/* API Keys Selection */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">{t('apiKeys')}</h4>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGoToSettings}
            className="gap-1.5"
          >
            <Plus className="size-3.5" />
            {t('addApiKey')}
          </Button>
        </div>

        {keysLoading ? (
          <div className="text-muted-foreground py-8 text-center text-sm">
            {t('loadingKeys')}
          </div>
        ) : providerKeys.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <AlertCircle className="text-muted-foreground mx-auto mb-3 size-10" />
            <p className="text-muted-foreground mb-4 text-sm">
              {t('noApiKeysConfigured')}
            </p>
            <Button onClick={handleGoToSettings} className="gap-2">
              <Key className="size-4" />
              {t('goToSettings')}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {vendors.map((vendor) => {
              const keys = keysByVendor[vendor]!;
              const provider = getProvider(vendor);
              const providerLabel = provider?.label || vendor;

              return (
                <div key={vendor} className="space-y-2">
                  <div className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                    {providerLabel}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {keys.map((key) => (
                      <label
                        key={key.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 transition-colors ${
                          isKeySelected(key)
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-muted-foreground'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isKeySelected(key)}
                          onChange={() => handleKeyToggle(key)}
                          className="size-4 rounded border-gray-300"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <Key className="text-muted-foreground size-3.5 shrink-0" />
                            <span className="truncate text-sm font-medium">
                              {getKeyDisplayName(key)}
                            </span>
                          </div>
                          {key.tag && key.label && (
                            <Badge variant="secondary" className="mt-1 text-xs">
                              {key.tag}
                            </Badge>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Selected Keys Summary */}
        {state.enabledProviders.length > 0 && (
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="text-muted-foreground mb-2 text-xs font-medium">
              {t('selectedKeys')}
            </div>
            <div className="flex flex-wrap gap-2">
              {state.enabledProviders.map((providerId) => {
                const provider = getProvider(providerId);
                const keyId = state.providerConfigs[providerId]?.keyId;
                const key = providerKeys.find((k) => k.id === keyId);
                return (
                  <Badge key={providerId} variant="default" className="gap-1">
                    {provider?.label || providerId}
                    {key && `: ${getKeyDisplayName(key)}`}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Channels */}
      <section className="space-y-3">
        <h4 className="text-sm font-medium">{t('channels')}</h4>
        <div className="grid grid-cols-3 gap-2">
          {POPULAR_CHANNELS.map((channel) => (
            <label
              key={channel.id}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 transition-colors ${
                state.enabledChannels.includes(channel.id)
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-muted-foreground'
              }`}
            >
              <input
                type="checkbox"
                checked={state.enabledChannels.includes(channel.id)}
                onChange={() => handleChannelToggle(channel.id)}
                className="size-4 rounded border-gray-300"
              />
              <span className="mr-1">{channel.icon}</span>
              <span className="text-sm">{channel.label}</span>
            </label>
          ))}
        </div>
        {OTHER_CHANNELS.length > 0 && (
          <>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
              onClick={() => setShowAllChannels(!showAllChannels)}
            >
              {showAllChannels ? (
                <>
                  <ChevronUp className="size-4" />
                  {t('showLess')}
                </>
              ) : (
                <>
                  <ChevronDown className="size-4" />
                  {t('showAll', { count: OTHER_CHANNELS.length })}
                </>
              )}
            </button>
            {showAllChannels && (
              <div className="grid grid-cols-4 gap-2">
                {OTHER_CHANNELS.map((channel) => (
                  <label
                    key={channel.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm transition-colors ${
                      state.enabledChannels.includes(channel.id)
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-muted-foreground'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={state.enabledChannels.includes(channel.id)}
                      onChange={() => handleChannelToggle(channel.id)}
                      className="size-3 rounded border-gray-300"
                    />
                    <span className="text-xs">{channel.icon}</span>
                    <span className="truncate text-xs">{channel.label}</span>
                  </label>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* Features */}
      <section className="space-y-3">
        <h4 className="text-sm font-medium">{t('features')}</h4>
        <div className="grid grid-cols-3 gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border p-3">
            <input
              type="checkbox"
              checked={state.features.commands}
              onChange={(e) => handleFeatureChange('commands', e.target.checked)}
              className="size-4 rounded border-gray-300"
            />
            <div>
              <div className="text-sm">{t('commands')}</div>
              <div className="text-muted-foreground text-xs">
                {t('commandsDesc')}
              </div>
            </div>
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border p-3">
            <input
              type="checkbox"
              checked={state.features.tts}
              onChange={(e) => handleFeatureChange('tts', e.target.checked)}
              className="size-4 rounded border-gray-300"
            />
            <div>
              <div className="text-sm">{t('tts')}</div>
              <div className="text-muted-foreground text-xs">
                {t('ttsDesc')}
              </div>
            </div>
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border p-3">
            <input
              type="checkbox"
              checked={state.features.sandbox}
              onChange={(e) => handleFeatureChange('sandbox', e.target.checked)}
              className="size-4 rounded border-gray-300"
            />
            <div>
              <div className="text-sm">{t('sandbox')}</div>
              <div className="text-muted-foreground text-xs">
                {t('sandboxDesc')}
              </div>
            </div>
          </label>
        </div>
      </section>

      {/* Session Scope - Only visible to admin users */}
      {user?.isAdmin && (
        <section className="space-y-3">
          <h4 className="text-sm font-medium">{t('sessionScope')}</h4>
          <div className="flex gap-4">
            {(['user', 'channel', 'global'] as SessionScope[]).map((scope) => (
              <label key={scope} className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="sessionScope"
                  value={scope}
                  checked={state.features.sessionScope === scope}
                  onChange={() => handleSessionScopeChange(scope)}
                  className="size-4"
                />
                <span className="text-sm">{t(`sessionScopes.${scope}`)}</span>
              </label>
            ))}
          </div>
        </section>
      )}

      {/* API Routing Tags */}
      <section className="space-y-3">
        <h4 className="text-sm font-medium">{t('routingTags')}</h4>
        <div className="space-y-2">
          <Input
            type="text"
            placeholder={t('routingTagsPlaceholder')}
            defaultValue={state.routingTags.join(', ')}
            onChange={handleTagsChange}
          />
          <p className="text-muted-foreground text-xs">
            {t('routingTagsHint')}
          </p>
          {state.routingTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {state.routingTags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
