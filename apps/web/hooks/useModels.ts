'use client';

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  modelApi,
  botModelApi,
  botModelClient,
  modelClient,
} from '@/lib/api/contracts/client';
import type {
  AvailableModel,
  BotModelInfo,
  UpdateBotModelsInput,
  RefreshModelsResponse,
  VerifySingleModelResponse,
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
  const [refreshing, setRefreshing] = useState(false);
  const [verifyingModel, setVerifyingModel] = useState<string | null>(null);

  const responseBody = modelsQuery.data?.body;
  const models: AvailableModel[] =
    responseBody && 'data' in responseBody && responseBody.data
      ? ((responseBody.data as { list: AvailableModel[] }).list ?? [])
      : [];

  // Verify all models (admin only) - legacy function
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

  // Refresh model list from provider endpoint (admin only)
  const refreshModels = useCallback(
    async (providerKeyId: string): Promise<RefreshModelsResponse | null> => {
      setRefreshing(true);
      try {
        const result = await modelClient.refreshModels({
          body: { providerKeyId },
        });
        // Refresh models list
        queryClient.invalidateQueries({ queryKey: modelKeys.list() });
        if (result.body && 'data' in result.body && result.body.data) {
          return result.body.data as RefreshModelsResponse;
        }
        return null;
      } finally {
        setRefreshing(false);
      }
    },
    [queryClient],
  );

  // Verify single model availability (admin only)
  const verifySingleModel = useCallback(
    async (
      providerKeyId: string,
      model: string,
    ): Promise<VerifySingleModelResponse | null> => {
      setVerifyingModel(model);
      try {
        const result = await modelClient.verifySingle({
          body: { providerKeyId, model },
        });
        // Refresh models list
        queryClient.invalidateQueries({ queryKey: modelKeys.list() });
        if (result.body && 'data' in result.body && result.body.data) {
          return result.body.data as VerifySingleModelResponse;
        }
        return null;
      } finally {
        setVerifyingModel(null);
      }
    },
    [queryClient],
  );

  // Batch verify models with polling (admin only)
  const batchVerifyModels = useCallback(
    async (
      providerKeyId: string,
      modelList: string[],
      onProgress?: (current: number, total: number, result: VerifySingleModelResponse) => void,
      delayMs: number = 1000,
    ): Promise<VerifySingleModelResponse[]> => {
      const results: VerifySingleModelResponse[] = [];
      for (let i = 0; i < modelList.length; i++) {
        const model = modelList[i];
        const result = await verifySingleModel(providerKeyId, model);
        if (result) {
          results.push(result);
          onProgress?.(i + 1, modelList.length, result);
        }
        // Add delay between requests to avoid rate limiting
        if (i < modelList.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
      return results;
    },
    [verifySingleModel],
  );

  return {
    models,
    loading: modelsQuery.isLoading,
    error:
      modelsQuery.error instanceof Error ? modelsQuery.error.message : null,
    refresh: () => modelsQuery.refetch(),
    // Legacy verify all
    verifyModels,
    verifying,
    // New functions
    refreshModels,
    refreshing,
    verifySingleModel,
    verifyingModel,
    batchVerifyModels,
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
