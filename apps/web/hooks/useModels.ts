'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  modelApi,
  botModelApi,
  botModelClient,
} from '@/lib/api/contracts/client';
import type {
  AvailableModel,
  BotModelInfo,
  UpdateBotModelsInput,
} from '@repo/contracts';

/**
 * Query keys for model-related queries
 */
export const modelKeys = {
  all: ['models'] as const,
  list: () => [...modelKeys.all, 'list'] as const,
  botModels: (hostname: string) => [...modelKeys.all, 'bot', hostname] as const,
};

/**
 * Hook for fetching available models list
 * Returns all models with their availability status
 */
export function useAvailableModels() {
  const queryClient = useQueryClient();
  const modelsQuery = modelApi.list.useQuery(modelKeys.list(), {});
  const [verifying, setVerifying] = useState(false);

  const responseBody = modelsQuery.data?.body;
  const models: AvailableModel[] =
    responseBody && 'data' in responseBody && responseBody.data
      ? ((responseBody.data as { list: AvailableModel[] }).list ?? [])
      : [];

  // Verify models (admin only)
  const verifyModels = async () => {
    setVerifying(true);
    try {
      const result = await modelApi.verify.mutation({
        body: {},
      });
      // Refresh models list after a short delay to allow verification to complete
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: modelKeys.list() });
      }, 3000);
      return result;
    } finally {
      setVerifying(false);
    }
  };

  return {
    models,
    loading: modelsQuery.isLoading,
    error:
      modelsQuery.error instanceof Error ? modelsQuery.error.message : null,
    refresh: () => modelsQuery.refetch(),
    verifyModels,
    verifying,
  };
}

/**
 * Hook for managing bot models
 */
export function useBotModels(hostname: string) {
  const queryClient = useQueryClient();

  const modelsQuery = botModelApi.list.useQuery(modelKeys.botModels(hostname), {
    params: { hostname },
  });

  const updateMutation = botModelApi.update.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: modelKeys.botModels(hostname),
      });
    },
  });

  const responseBody = modelsQuery.data?.body;
  const models: BotModelInfo[] =
    responseBody && 'data' in responseBody && responseBody.data
      ? ((responseBody.data as { list: BotModelInfo[] }).list ?? [])
      : [];

  return {
    models,
    loading: modelsQuery.isLoading,
    error:
      modelsQuery.error instanceof Error ? modelsQuery.error.message : null,
    refresh: () => modelsQuery.refetch(),

    // Actions
    updateModels: async (input: UpdateBotModelsInput) => {
      const result = await updateMutation.mutateAsync({
        params: { hostname },
        body: input,
      });
      if (result.body && 'data' in result.body) {
        return result.body.data;
      }
      return undefined;
    },

    // Loading states
    updateLoading: updateMutation.isPending,
  };
}
