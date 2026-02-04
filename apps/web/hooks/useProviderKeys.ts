'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { providerKeyApi, providerKeyClient } from '@/lib/api/contracts/client';
import type {
  AddProviderKeyInput,
  ProviderKey,
  VerifyProviderKeyInput,
  VerifyProviderKeyResponse,
} from '@repo/contracts';

/**
 * Query keys for provider key-related queries
 */
export const providerKeyKeys = {
  all: ['provider-keys'] as const,
  list: () => [...providerKeyKeys.all, 'list'] as const,
  health: () => [...providerKeyKeys.all, 'health'] as const,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQueryOptions = any;

/**
 * Hook for managing provider keys (API keys for AI providers)
 */
export function useProviderKeys() {
  const queryClient = useQueryClient();

  // Query for listing all provider keys
  // ts-rest v4 API: useQuery(queryKey, args)
  const keysQuery = providerKeyApi.list.useQuery(providerKeyKeys.list(), {});

  // Mutation for adding a provider key
  const addMutation = providerKeyApi.add.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: providerKeyKeys.all });
    },
  });

  // Mutation for deleting a provider key
  const deleteMutation = providerKeyApi.delete.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: providerKeyKeys.all });
    },
  });

  // Extract keys from response - handle both success and error cases
  const responseBody = keysQuery.data?.body;
  const keys: ProviderKey[] =
    responseBody && 'data' in responseBody && responseBody.data
      ? ((responseBody.data as { keys: ProviderKey[] }).keys ?? [])
      : [];

  return {
    // Data
    keys,
    loading: keysQuery.isLoading,
    error: keysQuery.error instanceof Error ? keysQuery.error.message : null,

    // Actions
    refresh: () => keysQuery.refetch(),
    handleAdd: async (input: AddProviderKeyInput) => {
      const result = await addMutation.mutateAsync({ body: input });
      if (result.body && 'data' in result.body) {
        return result.body.data;
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

    // Loading states
    actionLoading: addMutation.isPending || deleteMutation.isPending,
    addLoading: addMutation.isPending,
    deleteLoading: deleteMutation.isPending,
  };
}

/**
 * Hook for provider key health status
 */
export function useProviderKeyHealth() {
  // ts-rest v4 API: useQuery(queryKey, args, options)
  const healthQuery = providerKeyApi.health.useQuery(
    providerKeyKeys.health(),
    {},
    { refetchInterval: 60000 } as AnyQueryOptions, // Poll every minute
  );

  const responseBody = healthQuery.data?.body;
  const health =
    responseBody && 'data' in responseBody ? responseBody.data : undefined;

  return {
    health,
    loading: healthQuery.isLoading,
    error:
      healthQuery.error instanceof Error ? healthQuery.error.message : null,
    refresh: () => healthQuery.refetch(),
  };
}

/**
 * Hook for verifying provider key and getting models
 */
export function useVerifyProviderKey() {
  const verifyMutation = providerKeyApi.verify.useMutation();

  const verify = async (
    input: VerifyProviderKeyInput,
  ): Promise<VerifyProviderKeyResponse | null> => {
    const result = await verifyMutation.mutateAsync({ body: input });
    if (result.body && 'data' in result.body) {
      return result.body.data as VerifyProviderKeyResponse;
    }
    return null;
  };

  return {
    verify,
    loading: verifyMutation.isPending,
    error:
      verifyMutation.error instanceof Error
        ? verifyMutation.error.message
        : null,
  };
}

/**
 * Hook for fetching models for an existing provider key
 */
export function useProviderKeyModels() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getModels = async (
    keyId: string,
  ): Promise<VerifyProviderKeyResponse | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await providerKeyClient.getModels({
        params: { id: keyId },
      });
      if (
        result.body &&
        typeof result.body === 'object' &&
        'data' in result.body
      ) {
        return result.body.data as VerifyProviderKeyResponse;
      }
      return null;
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Failed to fetch models';
      setError(errorMsg);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return {
    getModels,
    loading,
    error,
  };
}
