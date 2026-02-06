'use client';

import { useState, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import Image from 'next/image';
import { useWizard } from '../wizard-context';
import { usePersonaTemplates } from '@/hooks/usePersonaTemplates';
import { SCRATCH_TEMPLATE } from '@/lib/config';
import { Input, Skeleton, cn } from '@repo/ui';
import { Search, User, Check, Sparkles } from 'lucide-react';
import type { PersonaTemplate } from '@repo/contracts';

function TemplateIcon({
  template,
  size = 'md',
}: {
  template: Pick<PersonaTemplate, 'emoji' | 'avatarUrl' | 'name'>;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClasses = {
    sm: 'size-8 text-lg',
    md: 'size-12 text-3xl',
    lg: 'size-16 text-4xl',
  };

  const iconSizeClasses = {
    sm: 'size-4',
    md: 'size-6',
    lg: 'size-8',
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
        width={size === 'lg' ? 64 : size === 'md' ? 48 : 32}
        height={size === 'lg' ? 64 : size === 'md' ? 48 : 32}
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
  featured?: boolean;
}

function TemplateCard({
  isSelected,
  onClick,
  emoji,
  name,
  tagline,
  template,
  featured,
}: TemplateCardProps) {
  const displayEmoji = emoji || template?.emoji;
  const displayName = name || template?.name || '';
  const displayTagline = tagline || template?.tagline || '';

  return (
    <button
      type="button"
      className={cn(
        'group relative flex flex-col items-center gap-3 rounded-2xl border-2 p-5 text-center transition-all',
        isSelected
          ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
          : 'border-border hover:border-primary/30 hover:bg-muted/50',
        featured && 'col-span-2 sm:col-span-1',
      )}
      onClick={onClick}
    >
      {/* Selection indicator */}
      {isSelected && (
        <div className="bg-primary absolute right-3 top-3 flex size-6 items-center justify-center rounded-full">
          <Check className="text-primary-foreground size-3.5" />
        </div>
      )}

      {/* Icon */}
      <div
        className={cn(
          'flex size-16 items-center justify-center rounded-2xl text-4xl transition-transform group-hover:scale-110',
          isSelected ? 'bg-primary/10' : 'bg-muted',
        )}
      >
        {template ? (
          <TemplateIcon template={template} size="lg" />
        ) : (
          displayEmoji
        )}
      </div>

      {/* Content */}
      <div className="space-y-1">
        <div
          className={cn('text-sm font-semibold', isSelected && 'text-primary')}
        >
          {displayName}
        </div>
        <div className="text-muted-foreground line-clamp-2 text-xs">
          {displayTagline}
        </div>
      </div>
    </button>
  );
}

export function Step1Template() {
  const t = useTranslations('bots.wizard.step1');
  const locale = useLocale();
  const { state, dispatch } = useWizard();
  const [searchQuery, setSearchQuery] = useState('');
  const { templates, loading } = usePersonaTemplates(locale);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="mb-4 shrink-0 text-center">
        <div className="bg-primary/10 mx-auto mb-2 flex size-10 items-center justify-center rounded-xl">
          <Sparkles className="text-primary size-5" />
        </div>
        <h2 className="text-base font-semibold">{t('title')}</h2>
        <p className="text-muted-foreground mt-0.5 text-xs">
          {t('description')}
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-4 shrink-0">
        <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
        <Input
          type="text"
          className="h-10 pl-10"
          placeholder={t('searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Template Grid */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 gap-3 pb-2 sm:grid-cols-3">
          {/* Scratch Template - Featured */}
          <TemplateCard
            isSelected={state.selectedTemplateId === 'scratch'}
            onClick={() => handleSelect('scratch', SCRATCH_TEMPLATE)}
            emoji={localizedScratchTemplate.emoji}
            name={localizedScratchTemplate.name}
            tagline={localizedScratchTemplate.tagline}
            featured
          />

          {/* Loading Skeletons */}
          {loading &&
            [1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="flex flex-col items-center gap-3 rounded-2xl border-2 p-5"
              >
                <Skeleton className="size-16 rounded-2xl" />
                <div className="w-full space-y-2">
                  <Skeleton className="mx-auto h-4 w-20" />
                  <Skeleton className="mx-auto h-3 w-full" />
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
          <div className="text-muted-foreground py-12 text-center text-sm">
            {t('noMatch', { query: searchQuery })}
          </div>
        )}
      </div>
    </div>
  );
}
