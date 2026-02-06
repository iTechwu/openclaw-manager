'use client';

import { useQueryClient } from '@tanstack/react-query';
import { personaTemplateApi } from '@/lib/api/contracts/client';
import type {
  PersonaTemplate,
  CreatePersonaTemplateInput,
  UpdatePersonaTemplateInput,
  DuplicatePersonaTemplateInput,
} from '@repo/contracts';

/**
 * Query keys for persona template-related queries
 */
export const personaTemplateKeys = {
  all: ['personaTemplates'] as const,
  list: (locale?: string) =>
    locale
      ? ([...personaTemplateKeys.all, 'list', locale] as const)
      : ([...personaTemplateKeys.all, 'list'] as const),
  detail: (id: string) => [...personaTemplateKeys.all, 'detail', id] as const,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQueryOptions = any;

/**
 * Hook for managing persona templates
 * Provides CRUD operations for persona templates
 * @param locale Optional locale to filter system templates (e.g., 'en', 'zh-CN')
 */
export function usePersonaTemplates(locale?: string) {
  const queryClient = useQueryClient();

  // Query for listing all templates
  const templatesQuery = personaTemplateApi.list.useQuery(
    personaTemplateKeys.list(locale),
    { query: { locale } },
    {} as AnyQueryOptions,
  );

  // Mutation for creating a template
  const createMutation = personaTemplateApi.create.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: personaTemplateKeys.all });
    },
  });

  // Mutation for updating a template
  const updateMutation = personaTemplateApi.update.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: personaTemplateKeys.all });
    },
  });

  // Mutation for deleting a template
  const deleteMutation = personaTemplateApi.delete.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: personaTemplateKeys.all });
    },
  });

  // Mutation for duplicating a template
  const duplicateMutation = personaTemplateApi.duplicate.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: personaTemplateKeys.all });
    },
  });

  // Extract templates from response
  const responseBody = templatesQuery.data?.body;
  const data =
    responseBody && 'data' in responseBody && responseBody.data
      ? (responseBody.data as {
          templates: PersonaTemplate[];
          systemCount: number;
          userCount: number;
        })
      : { templates: [], systemCount: 0, userCount: 0 };

  const templates = data.templates;
  const systemTemplates = templates.filter((t) => t.isSystem);
  const userTemplates = templates.filter((t) => !t.isSystem);

  return {
    // Data
    templates,
    systemTemplates,
    userTemplates,
    systemCount: data.systemCount,
    userCount: data.userCount,
    loading: templatesQuery.isLoading,
    error:
      templatesQuery.error instanceof Error
        ? templatesQuery.error.message
        : null,

    // Actions
    refresh: () => templatesQuery.refetch(),
    handleCreate: async (input: CreatePersonaTemplateInput) => {
      const result = await createMutation.mutateAsync({ body: input });
      if (result.body && 'data' in result.body) {
        return result.body.data as PersonaTemplate;
      }
      return undefined;
    },
    handleUpdate: async (id: string, input: UpdatePersonaTemplateInput) => {
      const result = await updateMutation.mutateAsync({
        params: { id },
        body: input,
      });
      if (result.body && 'data' in result.body) {
        return result.body.data as PersonaTemplate;
      }
      return undefined;
    },
    handleDelete: async (id: string) => {
      const result = await deleteMutation.mutateAsync({
        params: { id },
        body: {},
      });
      if (result.body && 'data' in result.body) {
        return result.body.data;
      }
      return undefined;
    },
    handleDuplicate: async (input: DuplicatePersonaTemplateInput) => {
      const result = await duplicateMutation.mutateAsync({ body: input });
      if (result.body && 'data' in result.body) {
        return result.body.data as PersonaTemplate;
      }
      return undefined;
    },

    // Loading states
    actionLoading:
      createMutation.isPending ||
      updateMutation.isPending ||
      deleteMutation.isPending ||
      duplicateMutation.isPending,
    createLoading: createMutation.isPending,
    updateLoading: updateMutation.isPending,
    deleteLoading: deleteMutation.isPending,
    duplicateLoading: duplicateMutation.isPending,
  };
}

/**
 * Hook for getting a single persona template by ID
 */
export function usePersonaTemplate(id: string) {
  const templatesQuery = personaTemplateApi.getById.useQuery(
    personaTemplateKeys.detail(id),
    { params: { id } },
    { enabled: !!id } as AnyQueryOptions,
  );

  const responseBody = templatesQuery.data?.body;
  const template: PersonaTemplate | undefined =
    responseBody && 'data' in responseBody
      ? (responseBody.data as PersonaTemplate)
      : undefined;

  return {
    template,
    loading: templatesQuery.isLoading,
    error:
      templatesQuery.error instanceof Error
        ? templatesQuery.error.message
        : null,
    refresh: () => templatesQuery.refetch(),
  };
}
