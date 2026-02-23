'use client';

import { useState, useEffect } from 'react';
import { useProviderKeys } from '@/hooks/useProviderKeys';
import type { ProviderVendor } from '@repo/contracts';
import { PROVIDER_DEFAULT_BASE_URLS } from '@repo/contracts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui';
import { Button, Input, Label, Alert } from '@repo/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui';
import { AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface AddProviderKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const VENDORS: ProviderVendor[] = [
  'openai',
  'anthropic',
  'google',
  'venice',
  'deepseek',
  'groq',
];

export function AddProviderKeyModal({
  isOpen,
  onClose,
}: AddProviderKeyModalProps) {
  const t = useTranslations('bots');
  const { handleAdd, addLoading } = useProviderKeys();
  const [vendor, setVendor] = useState<ProviderVendor>('openai');
  const [secret, setSecret] = useState('');
  const [label, setLabel] = useState('');
  const [tag, setTag] = useState('');
  const [baseUrl, setBaseUrl] = useState(PROVIDER_DEFAULT_BASE_URLS['openai']);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBaseUrl(PROVIDER_DEFAULT_BASE_URLS[vendor]);
  }, [vendor]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!secret.trim()) {
      setError(t('apiKeyModal.apiKeyRequired'));
      return;
    }

    try {
      const defaultUrl = PROVIDER_DEFAULT_BASE_URLS[vendor];
      const customBaseUrl = baseUrl.trim();
      const effectiveLabel = label.trim() || t(`providers.${vendor}`);

      await handleAdd({
        vendor,
        secret: secret.trim(),
        label: effectiveLabel,
        tag: tag.trim() || undefined,
        baseUrl: customBaseUrl !== defaultUrl ? customBaseUrl : undefined,
      });
      // Reset form and close
      setVendor('openai');
      setSecret('');
      setLabel('');
      setTag('');
      setBaseUrl(PROVIDER_DEFAULT_BASE_URLS['openai']);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('messages.error'));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('apiKeyModal.title')}</DialogTitle>
          <DialogDescription>{t('apiKeyModal.description')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="size-4" />
              <span className="ml-2">{error}</span>
            </Alert>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="vendor">{t('apiKeyModal.provider')}</Label>
              <Select
                value={vendor}
                onValueChange={(v) => setVendor(v as ProviderVendor)}
                disabled={addLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('apiKeyModal.selectProvider')} />
                </SelectTrigger>
                <SelectContent>
                  {VENDORS.map((v) => (
                    <SelectItem key={v} value={v}>
                      {t(`providers.${v}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="secret">{t('apiKeyModal.apiKey')} *</Label>
              <Input
                id="secret"
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="sk-..."
                disabled={addLoading}
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="baseUrl">{t('apiKeyModal.baseUrl')}</Label>
              <Input
                id="baseUrl"
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={PROVIDER_DEFAULT_BASE_URLS[vendor]}
                disabled={addLoading}
              />
              <p className="text-muted-foreground text-xs">
                {t('apiKeyModal.baseUrlDefault')}:{' '}
                {PROVIDER_DEFAULT_BASE_URLS[vendor]}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="label">{t('apiKeyModal.label')}</Label>
              <Input
                id="label"
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t('apiKeyModal.labelPlaceholder')}
                disabled={addLoading}
              />
              <p className="text-muted-foreground text-xs">
                {t('apiKeyModal.labelHint')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tag">{t('apiKeyModal.tag')}</Label>
              <Input
                id="tag"
                type="text"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder={t('apiKeyModal.tagPlaceholder')}
                disabled={addLoading}
              />
              <p className="text-muted-foreground text-xs">
                {t('apiKeyModal.tagHint')}
              </p>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={addLoading}
            >
              {t('apiKeyModal.actions.cancel')}
            </Button>
            <Button type="submit" disabled={addLoading || !secret.trim()}>
              {addLoading
                ? t('apiKeyModal.actions.adding')
                : t('apiKeyModal.actions.add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
