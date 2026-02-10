'use client';

import type { ProviderKey } from '@repo/contracts';
import { Button } from '@repo/ui';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCanPerform, CanDelete } from '@/lib/permissions';

interface ProviderKeyTableProps {
  keys: ProviderKey[];
  onDelete: (id: string) => void;
  loading: boolean;
}

export function ProviderKeyTable({
  keys,
  onDelete,
  loading,
}: ProviderKeyTableProps) {
  const t = useTranslations('bots');
  const canDelete = useCanPerform('delete', 'providerKey');

  if (keys.length === 0) {
    return (
      <div className="text-muted-foreground py-8 text-center">
        {t('messages.noApiKeys')}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-muted-foreground px-4 py-3 text-left text-sm font-medium">
              {t('fields.label')}
            </th>
            <th className="text-muted-foreground px-4 py-3 text-left text-sm font-medium">
              {t('fields.tag')}
            </th>
            <th className="text-muted-foreground px-4 py-3 text-left text-sm font-medium">
              {t('fields.createdAt')}
            </th>
            {canDelete && (
              <th className="text-muted-foreground px-4 py-3 text-left text-sm font-medium">
                {t('fields.actions')}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <tr key={key.id} className="border-t">
              <td className="px-4 py-3">{key.label || '-'}</td>
              <td className="px-4 py-3">{key.tag || '-'}</td>
              <td className="px-4 py-3">
                {new Date(key.createdAt).toLocaleDateString()}
              </td>
              {canDelete && (
                <td className="px-4 py-3">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => onDelete(key.id)}
                    disabled={loading}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
