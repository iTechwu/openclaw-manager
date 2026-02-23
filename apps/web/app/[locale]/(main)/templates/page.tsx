'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Plus, Sparkles, User } from 'lucide-react';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui';
import { toast } from 'sonner';
import { ClientOnly } from '@/components/client-only';
import { usePersonaTemplates } from '@/hooks/usePersonaTemplates';
import {
  TemplateCard,
  TemplateCardSkeleton,
  CreateTemplateDialog,
  EditTemplateDialog,
  DeleteTemplateDialog,
  DuplicateTemplateDialog,
} from './components';
import type { PersonaTemplate } from '@repo/contracts';

export default function TemplatesPage() {
  const t = useTranslations('templates');
  const locale = useLocale();
  const {
    systemTemplates,
    userTemplates,
    loading,
    handleCreate,
    handleUpdate,
    handleDelete,
    handleDuplicate,
    createLoading,
    updateLoading,
    deleteLoading,
    duplicateLoading,
  } = usePersonaTemplates(locale);

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editTemplate, setEditTemplate] = useState<PersonaTemplate | null>(
    null,
  );
  const [deleteTemplate, setDeleteTemplate] = useState<PersonaTemplate | null>(
    null,
  );
  const [duplicateTemplate, setDuplicateTemplate] =
    useState<PersonaTemplate | null>(null);

  const handleCreateWithToast = async (
    data: Parameters<typeof handleCreate>[0],
  ) => {
    try {
      await handleCreate(data);
      toast.success(t('messages.createSuccess'));
    } catch {
      toast.error(t('messages.createError'));
    }
  };

  const handleUpdateWithToast = async (
    id: string,
    data: Parameters<typeof handleUpdate>[1],
  ) => {
    try {
      await handleUpdate(id, data);
      toast.success(t('messages.updateSuccess'));
    } catch {
      toast.error(t('messages.updateError'));
    }
  };

  const handleDeleteWithToast = async (id: string) => {
    try {
      await handleDelete(id);
      toast.success(t('messages.deleteSuccess'));
    } catch {
      toast.error(t('messages.deleteError'));
    }
  };

  const handleDuplicateWithToast = async (
    data: Parameters<typeof handleDuplicate>[0],
  ) => {
    try {
      await handleDuplicate(data);
      toast.success(t('messages.duplicateSuccess'));
    } catch {
      toast.error(t('messages.duplicateError'));
    }
  };

  const renderTemplateGrid = (
    templates: PersonaTemplate[],
    isSystem: boolean,
  ) => {
    if (loading) {
      return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <TemplateCardSkeleton key={i} />
          ))}
        </div>
      );
    }

    if (templates.length === 0) {
      return (
        <div className="text-muted-foreground py-8 text-center">
          {isSystem
            ? t('messages.noSystemTemplates')
            : t('messages.noUserTemplates')}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            onEdit={isSystem ? undefined : () => setEditTemplate(template)}
            onDelete={isSystem ? undefined : () => setDeleteTemplate(template)}
            onDuplicate={() => setDuplicateTemplate(template)}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">{t('description')}</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 size-4" />
          {t('actions.create')}
        </Button>
      </div>

      <ClientOnly
        fallback={
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <TemplateCardSkeleton key={i} />
            ))}
          </div>
        }
      >
        <Tabs defaultValue="system" className="w-full">
          <TabsList>
            <TabsTrigger value="system" className="gap-2">
              <Sparkles className="size-4" />
              {t('tabs.system')} ({systemTemplates.length})
            </TabsTrigger>
            <TabsTrigger value="user" className="gap-2">
              <User className="size-4" />
              {t('tabs.user')} ({userTemplates.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="system" className="mt-4">
            {renderTemplateGrid(systemTemplates, true)}
          </TabsContent>
          <TabsContent value="user" className="mt-4">
            {renderTemplateGrid(userTemplates, false)}
          </TabsContent>
        </Tabs>
      </ClientOnly>

      <CreateTemplateDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={handleCreateWithToast}
        loading={createLoading}
      />

      <EditTemplateDialog
        template={editTemplate}
        open={!!editTemplate}
        onOpenChange={(open) => !open && setEditTemplate(null)}
        onSubmit={(data) =>
          editTemplate
            ? handleUpdateWithToast(editTemplate.id, data)
            : Promise.resolve()
        }
        loading={updateLoading}
      />

      <DeleteTemplateDialog
        template={deleteTemplate}
        open={!!deleteTemplate}
        onOpenChange={(open) => !open && setDeleteTemplate(null)}
        onConfirm={() =>
          deleteTemplate
            ? handleDeleteWithToast(deleteTemplate.id)
            : Promise.resolve()
        }
        loading={deleteLoading}
      />

      <DuplicateTemplateDialog
        template={duplicateTemplate}
        open={!!duplicateTemplate}
        onOpenChange={(open) => !open && setDuplicateTemplate(null)}
        onSubmit={(name) =>
          duplicateTemplate
            ? handleDuplicateWithToast({
                sourceTemplateId: duplicateTemplate.id,
                name,
              })
            : Promise.resolve()
        }
        loading={duplicateLoading}
      />
    </div>
  );
}
