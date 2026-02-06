'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useWizard } from '../wizard-context';
import { usePersonaTemplates } from '@/hooks/usePersonaTemplates';
import { SCRATCH_TEMPLATE } from '@/lib/config';
import { Input, Label, Skeleton, cn } from '@repo/ui';
import { IconSelector } from '@/app/[locale]/(main)/templates/components/icon-selector';
import { Search, User, Check } from 'lucide-react';
import type { PersonaTemplate } from '@repo/contracts';

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

function TemplateIcon({
  template,
  size = 'md',
}: {
  template: Pick<PersonaTemplate, 'emoji' | 'avatarUrl' | 'name'>;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClasses = {
    sm: 'size-8 text-lg',
    md: 'size-10 text-2xl',
    lg: 'size-12 text-3xl',
  };

  const iconSizeClasses = {
    sm: 'size-4',
    md: 'size-5',
    lg: 'size-6',
  };

  if (template.emoji) {
    return (
      <span
        className={cn('flex items-center justify-center', sizeClasses[size])}
      >
        {template.emoji}
      </span>
    );
  }

  if (template.avatarUrl) {
    return (
      <Image
        src={template.avatarUrl}
        alt={template.name}
        width={size === 'lg' ? 48 : size === 'md' ? 40 : 32}
        height={size === 'lg' ? 48 : size === 'md' ? 40 : 32}
        className={cn('rounded-full object-cover', sizeClasses[size])}
      />
    );
  }

  return (
    <div
      className={cn(
        'bg-muted flex items-center justify-center rounded-full',
        sizeClasses[size],
      )}
    >
      <User className={cn('text-muted-foreground', iconSizeClasses[size])} />
    </div>
  );
}

interface TemplateCardProps {
  isSelected: boolean;
  onClick: () => void;
  emoji?: string;
  name?: string;
  tagline?: string;
  template?: Pick<PersonaTemplate, 'emoji' | 'avatarUrl' | 'name' | 'tagline'>;
}

function TemplateCard({
  isSelected,
  onClick,
  emoji,
  name,
  tagline,
  template,
}: TemplateCardProps) {
  const displayEmoji = emoji || template?.emoji;
  const displayName = name || template?.name || '';
  const displayTagline = tagline || template?.tagline || '';

  return (
    <button
      type="button"
      className={cn(
        'group relative flex items-start gap-3 rounded-xl border p-4 text-left transition-all',
        isSelected
          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
          : 'border-border hover:border-muted-foreground/50 hover:bg-muted/30',
      )}
      onClick={onClick}
    >
      {/* Selection indicator */}
      {isSelected && (
        <div className="bg-primary absolute right-2 top-2 flex size-5 items-center justify-center rounded-full">
          <Check className="text-primary-foreground size-3" />
        </div>
      )}

      {/* Icon */}
      <div
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-lg text-2xl transition-transform group-hover:scale-105',
          isSelected ? 'bg-primary/10' : 'bg-muted',
        )}
      >
        {template ? (
          <TemplateIcon template={template} size="md" />
        ) : (
          displayEmoji
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pr-4">
        <div
          className={cn(
            'truncate text-sm font-medium',
            isSelected && 'text-primary',
          )}
        >
          {displayName}
        </div>
        <div className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
          {displayTagline}
        </div>
      </div>
    </button>
  );
}

export function Step1Basic() {
  const t = useTranslations('bots.wizard.step1');
  const t2 = useTranslations('bots.wizard.step2');
  const { state, dispatch } = useWizard();
  const [searchQuery, setSearchQuery] = useState('');
  const { templates, loading } = usePersonaTemplates();

  // Localized scratch template
  const localizedScratchTemplate = {
    ...SCRATCH_TEMPLATE,
    name: t('scratchTemplate.name'),
    tagline: t('scratchTemplate.tagline'),
    soulPreview: t('scratchTemplate.soulPreview'),
  };

  const filteredTemplates = useMemo(() => {
    if (!searchQuery.trim()) return templates;
    const query = searchQuery.toLowerCase();
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(query) ||
        t.tagline.toLowerCase().includes(query),
    );
  }, [searchQuery, templates]);

  const handleSelect = (
    templateId: string,
    template?: { emoji?: string; avatarUrl?: string; soulMarkdown: string },
  ) => {
    dispatch({ type: 'SELECT_TEMPLATE', templateId, template });
  };

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
    <div className="space-y-8">
      {/* Identity Section - Centered Card */}
      <div className="rounded-xl border bg-gradient-to-b from-muted/30 to-transparent p-6">
        <div className="flex flex-col items-center gap-6">
          {/* Centered Icon Selector */}
          <div className="flex flex-col items-center gap-2">
            <Label className="text-muted-foreground text-sm">
              {t2('avatar')}
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

          {/* Name and Hostname - Full Width */}
          <div className="w-full max-w-md space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bot-name" className="text-sm font-medium">
                {t2('botName')}
              </Label>
              <Input
                id="bot-name"
                type="text"
                value={state.botName}
                onChange={handleNameChange}
                placeholder={t2('botNamePlaceholder')}
                className="h-11 text-base"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="hostname" className="text-sm font-medium">
                {t2('hostname')}
              </Label>
              <Input
                id="hostname"
                type="text"
                value={state.hostname}
                onChange={handleHostnameChange}
                placeholder={t2('hostnamePlaceholder')}
                className="h-11 font-mono text-sm"
              />
              <p className="text-muted-foreground text-xs">
                {t2('hostnameHint')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Template Selection Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">{t('title')}</h3>
            <p className="text-muted-foreground text-sm">{t('description')}</p>
          </div>
          <div className="relative w-52">
            <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              type="text"
              className="h-9 pl-9 text-sm"
              placeholder={t('searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="grid max-h-[240px] grid-cols-2 gap-3 overflow-y-auto pr-1">
          {/* Scratch Template */}
          <TemplateCard
            isSelected={state.selectedTemplateId === 'scratch'}
            onClick={() => handleSelect('scratch', SCRATCH_TEMPLATE)}
            emoji={localizedScratchTemplate.emoji}
            name={localizedScratchTemplate.name}
            tagline={localizedScratchTemplate.tagline}
          />

          {/* Loading Skeletons */}
          {loading &&
            [1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-xl border p-4"
              >
                <Skeleton className="size-10 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}

          {/* API Templates */}
          {!loading &&
            filteredTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                isSelected={state.selectedTemplateId === template.id}
                onClick={() =>
                  handleSelect(template.id, {
                    emoji: template.emoji ?? undefined,
                    avatarUrl: template.avatarUrl ?? undefined,
                    soulMarkdown: template.soulMarkdown,
                  })
                }
                template={template}
              />
            ))}
        </div>

        {!loading && filteredTemplates.length === 0 && searchQuery && (
          <div className="text-muted-foreground py-8 text-center text-sm">
            {t('noMatch', { query: searchQuery })}
          </div>
        )}
      </div>
    </div>
  );
}
