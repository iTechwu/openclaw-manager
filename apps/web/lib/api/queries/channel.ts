/**
 * Channel API Queries
 * React Query hooks for channel definitions
 */

import { channelApi } from '@/lib/api/contracts/client';
import type { ChannelDefinition } from '@repo/contracts';

/**
 * Query keys for channel-related queries
 */
export const channelKeys = {
  all: ['channels'] as const,
  list: () => [...channelKeys.all, 'list'] as const,
  detail: (id: string) => [...channelKeys.all, 'detail', id] as const,
};

/**
 * Get all channel definitions
 */
export const useChannels = () => {
  // ts-rest v4 API: useQuery(queryKey, args)
  return channelApi.list.useQuery(channelKeys.list(), {});
};

/**
 * Get a single channel definition by ID
 */
export const useChannel = (id: string) => {
  // ts-rest v4 API: useQuery(queryKey, args)
  return channelApi.getById.useQuery(channelKeys.detail(id), {
    params: { id },
  });
};

/**
 * Helper hook to get channel data with convenient accessors
 */
export const useChannelDefinitions = () => {
  const { data, isLoading, error } = useChannels();

  // Extract data from response - handle both success and error cases
  const responseBody = data?.body;
  const responseData =
    responseBody && 'data' in responseBody && responseBody.data
      ? (responseBody.data as {
          channels: ChannelDefinition[];
          popularChannels: ChannelDefinition[];
          otherChannels: ChannelDefinition[];
        })
      : null;

  const channels = responseData?.channels ?? [];
  const popularChannels = responseData?.popularChannels ?? [];
  const otherChannels = responseData?.otherChannels ?? [];

  const getChannel = (id: string): ChannelDefinition | undefined => {
    return channels.find((c: ChannelDefinition) => c.id === id);
  };

  return {
    channels,
    popularChannels,
    otherChannels,
    getChannel,
    isLoading,
    error,
  };
};
