'use client';

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { modelApi, botModelApi, modelClient } from '@/lib/api/contracts/client';
import type {
  AvailableModel,
  BotModelInfo,
  UpdateBotModelsInput,
  RefreshModelsResponse,
  VerifySingleModelResponse,
  BatchVerifyResponse,
  ModelAvailabilityItem,
  RefreshAllModelsResponse,
  BatchVerifyAllResponse,
  ModelSyncStatus,
  SyncPricingResponse,
  SyncTagsResponse,
  RefreshWithSyncResponse,
} from '@repo/contracts';

/**
 * Query keys for model-related queries
 */
export const modelKeys = {
  all: ['models'] as const,
  list: () => [...modelKeys.all, 'list'] as const,
  availability: (providerKeyId?: string) =>
    [...modelKeys.all, 'availability', providerKeyId] as const,
  botModels: (hostname: string) => [...modelKeys.all, 'bot', hostname] as const,
};

/**
 * Hook for fetching available models list
 * Returns all models with their availability status
 */
export function useAvailableModels() {
  const queryClient = useQueryClient();
  const modelsQuery = modelApi.list.useQuery(modelKeys.list(), {}, {
    staleTime: 60000, // 60s 内不重复请求
  } as any);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [verifyingModel, setVerifyingModel] = useState<string | null>(null);
  const [batchVerifying, setBatchVerifying] = useState(false);
  const [batchVerifyingAll, setBatchVerifyingAll] = useState(false);

  const responseBody = modelsQuery.data?.body;
  const models: AvailableModel[] =
    responseBody && 'data' in responseBody && responseBody.data
      ? ((responseBody.data as { list: AvailableModel[] }).list ?? [])
      : [];

  // Refresh model list from provider endpoint (admin only)
  const refreshModels = useCallback(
    async (providerKeyId: string): Promise<RefreshModelsResponse | null> => {
      setRefreshing(true);
      try {
        const result = await modelClient.refresh({
          body: { providerKeyId },
        });
        // Refresh models list
        queryClient.invalidateQueries({ queryKey: modelKeys.list() });
        queryClient.invalidateQueries({ queryKey: modelKeys.availability() });
        const body = result.body;
        if (body && typeof body === 'object' && 'data' in body && body.data) {
          return body.data as RefreshModelsResponse;
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
        const result = await modelClient.verify({
          body: { providerKeyId, model },
        });
        // Refresh models list
        queryClient.invalidateQueries({ queryKey: modelKeys.list() });
        queryClient.invalidateQueries({ queryKey: modelKeys.availability() });
        const body = result.body;
        if (body && typeof body === 'object' && 'data' in body && body.data) {
          return body.data as VerifySingleModelResponse;
        }
        return null;
      } finally {
        setVerifyingModel(null);
      }
    },
    [queryClient],
  );

  // Batch verify unverified models (admin only)
  const batchVerifyUnverified = useCallback(
    async (providerKeyId: string): Promise<BatchVerifyResponse | null> => {
      setBatchVerifying(true);
      try {
        const result = await modelClient.batchVerify({
          body: { providerKeyId },
        });
        // Refresh models list
        queryClient.invalidateQueries({ queryKey: modelKeys.list() });
        queryClient.invalidateQueries({ queryKey: modelKeys.availability() });
        const body = result.body;
        if (body && typeof body === 'object' && 'data' in body && body.data) {
          return body.data as BatchVerifyResponse;
        }
        return null;
      } finally {
        setBatchVerifying(false);
      }
    },
    [queryClient],
  );

  // Refresh all provider keys' models (admin only)
  const refreshAllModels =
    useCallback(async (): Promise<RefreshAllModelsResponse | null> => {
      setRefreshingAll(true);
      try {
        const result = await modelClient.refreshAll({
          body: {},
        });
        // Refresh models list
        queryClient.invalidateQueries({ queryKey: modelKeys.list() });
        queryClient.invalidateQueries({ queryKey: modelKeys.availability() });
        const body = result.body;
        if (body && typeof body === 'object' && 'data' in body && body.data) {
          return body.data as RefreshAllModelsResponse;
        }
        return null;
      } finally {
        setRefreshingAll(false);
      }
    }, [queryClient]);

  // Batch verify all unavailable models (admin only)
  const batchVerifyAllUnavailable =
    useCallback(async (): Promise<BatchVerifyAllResponse | null> => {
      setBatchVerifyingAll(true);
      try {
        const result = await modelClient.batchVerifyAll({
          body: {},
        });
        // Refresh models list
        queryClient.invalidateQueries({ queryKey: modelKeys.list() });
        queryClient.invalidateQueries({ queryKey: modelKeys.availability() });
        const body = result.body;
        if (body && typeof body === 'object' && 'data' in body && body.data) {
          return body.data as BatchVerifyAllResponse;
        }
        return null;
      } finally {
        setBatchVerifyingAll(false);
      }
    }, [queryClient]);

  return {
    models,
    loading: modelsQuery.isLoading,
    error:
      modelsQuery.error instanceof Error ? modelsQuery.error.message : null,
    refresh: () => modelsQuery.refetch(),
    // Admin functions
    refreshModels,
    refreshing,
    refreshAllModels,
    refreshingAll,
    verifySingleModel,
    verifyingModel,
    batchVerifyUnverified,
    batchVerifying,
    batchVerifyAllUnavailable,
    batchVerifyingAll,
  };
}

/**
 * Hook for fetching ModelAvailability list (admin only)
 */
export function useModelAvailability(providerKeyId?: string) {
  const queryClient = useQueryClient();
  const availabilityQuery = modelApi.getAvailability.useQuery(
    modelKeys.availability(providerKeyId),
    {
      query: providerKeyId ? { providerKeyId } : undefined,
    },
  );

  const responseBody = availabilityQuery.data?.body;
  const availability: ModelAvailabilityItem[] =
    responseBody && 'data' in responseBody && responseBody.data
      ? ((responseBody.data as { list: ModelAvailabilityItem[] }).list ?? [])
      : [];

  return {
    availability,
    loading: availabilityQuery.isLoading,
    error:
      availabilityQuery.error instanceof Error
        ? availabilityQuery.error.message
        : null,
    refresh: () => {
      availabilityQuery.refetch();
      queryClient.invalidateQueries({ queryKey: modelKeys.list() });
    },
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

/**
 * Hook for model sync operations (admin only)
 */
export function useModelSync() {
  const queryClient = useQueryClient();
  const [syncingPricing, setSyncingPricing] = useState(false);
  const [syncingTags, setSyncingTags] = useState(false);
  const [refreshingWithSync, setRefreshingWithSync] = useState(false);

  // Sync pricing for all models or a specific model
  const syncPricing = useCallback(
    async (
      modelAvailabilityId?: string,
    ): Promise<SyncPricingResponse | null> => {
      setSyncingPricing(true);
      try {
        const result = await modelClient.syncPricing({
          body: modelAvailabilityId ? { modelAvailabilityId } : undefined,
        });
        queryClient.invalidateQueries({ queryKey: modelKeys.list() });
        queryClient.invalidateQueries({ queryKey: modelKeys.availability() });
        const body = result.body;
        if (body && typeof body === 'object' && 'data' in body && body.data) {
          return body.data as SyncPricingResponse;
        }
        return null;
      } finally {
        setSyncingPricing(false);
      }
    },
    [queryClient],
  );

  // Sync tags for all models or a specific model
  const syncTags = useCallback(
    async (modelCatalogId?: string): Promise<SyncTagsResponse | null> => {
      setSyncingTags(true);
      try {
        const result = await modelClient.syncTags({
          body: modelCatalogId ? { modelCatalogId } : undefined,
        });
        queryClient.invalidateQueries({ queryKey: modelKeys.list() });
        queryClient.invalidateQueries({ queryKey: modelKeys.availability() });
        const body = result.body;
        if (body && typeof body === 'object' && 'data' in body && body.data) {
          return body.data as SyncTagsResponse;
        }
        return null;
      } finally {
        setSyncingTags(false);
      }
    },
    [queryClient],
  );

  // Refresh models and sync pricing and tags
  const refreshWithSync = useCallback(
    async (providerKeyId: string): Promise<RefreshWithSyncResponse | null> => {
      setRefreshingWithSync(true);
      try {
        const result = await modelClient.refreshWithSync({
          body: { providerKeyId },
        });
        queryClient.invalidateQueries({ queryKey: modelKeys.list() });
        queryClient.invalidateQueries({ queryKey: modelKeys.availability() });
        const body = result.body;
        if (body && typeof body === 'object' && 'data' in body && body.data) {
          return body.data as RefreshWithSyncResponse;
        }
        return null;
      } finally {
        setRefreshingWithSync(false);
      }
    },
    [queryClient],
  );

  return {
    syncPricing,
    syncingPricing,
    syncTags,
    syncingTags,
    refreshWithSync,
    refreshingWithSync,
  };
}

/**
 * Hook for fetching model sync status (admin only)
 */
export function useModelSyncStatus() {
  const syncStatusQuery = modelApi.getSyncStatus.useQuery(
    [...modelKeys.all, 'sync-status'],
    {},
  );

  const responseBody = syncStatusQuery.data?.body;
  const syncStatus: ModelSyncStatus | null =
    responseBody && 'data' in responseBody && responseBody.data
      ? (responseBody.data as ModelSyncStatus)
      : null;

  return {
    syncStatus,
    loading: syncStatusQuery.isLoading,
    error:
      syncStatusQuery.error instanceof Error
        ? syncStatusQuery.error.message
        : null,
    refresh: () => syncStatusQuery.refetch(),
  };
}
