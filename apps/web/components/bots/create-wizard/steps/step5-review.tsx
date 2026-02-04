'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useWizard } from '../wizard-context';
import { getProvider, getChannel } from '@/lib/config';
import { Badge } from '@repo/ui';
import { ChevronDown, Check, X } from 'lucide-react';

function maskToken(token: string): string {
  if (token.length <= 4) return '****';
  return '****' + token.slice(-4);
}

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ title, defaultOpen = true, children }: SectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="hover:bg-muted/50 flex w-full items-center justify-between rounded-lg border p-3 font-medium"
      >
        {title}
        <ChevronDown
          className={`size-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && <div className="px-3 pt-3">{children}</div>}
    </div>
  );
}

export function Step5Review() {
  const t = useTranslations('bots.wizard.step5');
  const { state } = useWizard();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">{t('title')}</h3>
        <p className="text-muted-foreground text-sm">
          {t('description')}
        </p>
      </div>

      {/* Persona */}
      <Section title={t('persona')} defaultOpen={true}>
        <div className="flex items-start gap-4">
          <div className="bg-muted flex size-16 items-center justify-center rounded-lg">
            {state.avatarPreviewUrl ? (
              <img
                src={state.avatarPreviewUrl}
                alt="Avatar"
                className="size-full rounded-lg object-cover"
              />
            ) : (
              <span className="text-3xl">{state.emoji}</span>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-4">
              <div>
                <div className="text-muted-foreground text-xs">{t('name')}</div>
                <div className="font-medium">
                  {state.botName || t('notSet')}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">{t('hostname')}</div>
                <div className="font-medium font-mono text-sm">
                  {state.hostname || t('notSet')}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">{t('emoji')}</div>
                <div className="text-lg">{state.emoji}</div>
              </div>
            </div>
          </div>
        </div>
        {state.soulMarkdown && (
          <div className="mt-4 space-y-2">
            <div className="text-muted-foreground text-xs">{t('soulPreview')}</div>
            <pre className="bg-muted max-h-32 overflow-y-auto rounded-lg p-3 text-xs">
              {state.soulMarkdown.slice(0, 500)}
              {state.soulMarkdown.length > 500 && '...'}
            </pre>
          </div>
        )}
      </Section>

      {/* Providers */}
      <Section title={t('providers')} defaultOpen={true}>
        {state.enabledProviders.length === 0 ? (
          <span className="text-muted-foreground text-sm">
            {t('noProviders')}
          </span>
        ) : (
          <div className="space-y-2">
            {state.enabledProviders.map((providerId) => {
              const provider = getProvider(providerId);
              const config = state.providerConfigs[providerId];
              return (
                <div
                  key={providerId}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <div className="bg-muted flex size-8 items-center justify-center rounded text-sm font-semibold">
                    {provider?.label.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-sm">
                      {provider?.label || providerId}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {t('modelLabel', { model: config?.primaryModel || config?.models?.[0] || t('defaultModel') })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Channels */}
      <Section title={t('channels')} defaultOpen={true}>
        {state.enabledChannels.length === 0 ? (
          <span className="text-muted-foreground text-sm">
            {t('noChannels')}
          </span>
        ) : (
          <div className="space-y-2">
            {state.enabledChannels.map((channelId) => {
              const channel = getChannel(channelId);
              const config = state.channelConfigs[channelId];
              return (
                <div
                  key={channelId}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <div className="bg-muted flex size-8 items-center justify-center rounded text-lg">
                    {channel?.icon}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-sm">
                      {channel?.label || channelId}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {t('tokenLabel', { token: maskToken(config?.token || '') })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Features */}
      <Section title={t('features')} defaultOpen={true}>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="flex items-center gap-2">
              {state.features.commands ? (
                <Check className="text-green-500 size-4" />
              ) : (
                <X className="text-muted-foreground size-4" />
              )}
              <span className="text-sm">{t('commands')}</span>
            </div>
            <div className="flex items-center gap-2">
              {state.features.tts ? (
                <Check className="text-green-500 size-4" />
              ) : (
                <X className="text-muted-foreground size-4" />
              )}
              <span className="text-sm">
                {t('tts')}{state.features.tts && ` (${state.features.ttsVoice})`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {state.features.sandbox ? (
                <Check className="text-green-500 size-4" />
              ) : (
                <X className="text-muted-foreground size-4" />
              )}
              <span className="text-sm">
                {t('sandbox')}
                {state.features.sandbox && ` (${state.features.sandboxTimeout}s)`}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">{t('sessionScope')}</span>
              <span className="capitalize">{state.features.sessionScope}</span>
            </div>
          </div>
          {state.routingTags.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm">
                {t('routingTags')}
              </span>
              <div className="flex flex-wrap gap-1">
                {state.routingTags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
