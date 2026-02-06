'use client';

import { useTranslations } from 'next-intl';
import { useWizard } from '../wizard-context';
import { Input, Label } from '@repo/ui';
import { IconSelector } from '@/app/[locale]/(main)/templates/components/icon-selector';
import { Bot } from 'lucide-react';

/**
 * Derive hostname from display name.
 * Converts to lowercase, replaces non-alphanumeric chars with hyphens, trims to 64 chars.
 */
function deriveHostname(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

export function Step2BasicInfo() {
  const t = useTranslations('bots.wizard.step2');
  const { state, dispatch } = useWizard();

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    dispatch({ type: 'SET_BOT_NAME', name });
    const derivedHostname = deriveHostname(name);
    dispatch({ type: 'SET_HOSTNAME', hostname: derivedHostname });
  };

  const handleHostnameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    dispatch({ type: 'SET_HOSTNAME', hostname: value.slice(0, 64) });
  };

  const handleEmojiChange = (emoji: string) => {
    dispatch({ type: 'SET_EMOJI', emoji });
  };

  const handleAvatarChange = (fileId: string, previewUrl: string) => {
    dispatch({ type: 'SET_AVATAR', fileId, previewUrl });
  };

  const handleClearIcon = () => {
    dispatch({ type: 'CLEAR_AVATAR' });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="mb-8 shrink-0 text-center">
        <div className="bg-primary/10 mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl">
          <Bot className="text-primary size-7" />
        </div>
        <h2 className="text-xl font-semibold">{t('title')}</h2>
        <p className="text-muted-foreground mt-1 text-sm">{t('description')}</p>
      </div>

      {/* Form Content */}
      <div className="mx-auto w-full max-w-md flex-1 space-y-8">
        {/* Icon Selector - Centered */}
        <div className="flex flex-col items-center">
          <Label className="text-muted-foreground mb-3 text-sm">
            {t('avatar')}
          </Label>
          <IconSelector
            emoji={state.emoji || undefined}
            avatarFileId={state.avatarFileId || undefined}
            avatarPreviewUrl={state.avatarPreviewUrl || undefined}
            onEmojiChange={handleEmojiChange}
            onAvatarChange={handleAvatarChange}
            onClear={handleClearIcon}
            className="w-full max-w-xs"
          />
        </div>

        {/* Name and Hostname Fields */}
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="bot-name" className="text-sm font-medium">
              {t('botName')}
            </Label>
            <Input
              id="bot-name"
              type="text"
              value={state.botName}
              onChange={handleNameChange}
              placeholder={t('botNamePlaceholder')}
              className="h-12 text-base"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hostname" className="text-sm font-medium">
              {t('hostname')}
            </Label>
            <Input
              id="hostname"
              type="text"
              value={state.hostname}
              onChange={handleHostnameChange}
              placeholder={t('hostnamePlaceholder')}
              className="h-12 font-mono text-sm"
            />
            <p className="text-muted-foreground text-xs">{t('hostnameHint')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
