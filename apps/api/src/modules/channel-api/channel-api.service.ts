import { Injectable, Inject } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import {
  ChannelDefinitionService,
  ChannelCredentialFieldService,
} from '@app/db';
import type {
  ChannelDefinition,
  ChannelDefinitionListResponse,
} from '@repo/contracts';

@Injectable()
export class ChannelApiService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly channelDefinitionService: ChannelDefinitionService,
    private readonly channelCredentialFieldService: ChannelCredentialFieldService,
  ) {}

  /**
   * List all channel definitions with their credential fields
   * @param locale - Optional locale to filter popular channels
   */
  async listChannels(locale?: string): Promise<ChannelDefinitionListResponse> {
    const { list: channels } = await this.channelDefinitionService.list(
      {},
      {
        orderBy: { popular: 'desc' },
      },
      {
        select: {
          id: true,
          label: true,
          icon: true,
          popular: true,
          popularLocales: true,
          tokenHint: true,
          tokenPlaceholder: true,
          helpUrl: true,
          helpText: true,
          sortOrder: true,
          credentialFields: {
            where: { isDeleted: false },
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              channelId: true,
              key: true,
              label: true,
              placeholder: true,
              fieldType: true,
              required: true,
              sortOrder: true,
            },
          },
        },
      },
    );

    const mappedChannels: ChannelDefinition[] = channels.map((channel) =>
      this.mapChannelToDto(channel),
    );

    // Filter popular channels based on locale
    const popularChannels = mappedChannels.filter((c) => {
      if (locale && c.popularLocales.length > 0) {
        // Check if the locale matches any of the popularLocales
        return c.popularLocales.some(
          (l) =>
            l === locale ||
            locale.startsWith(l) ||
            l.startsWith(locale.split('-')[0]),
        );
      }
      // Fallback to the popular field if no locale specified or no popularLocales defined
      return c.popular;
    });

    const popularChannelIds = new Set(popularChannels.map((c) => c.id));
    const otherChannels = mappedChannels.filter(
      (c) => !popularChannelIds.has(c.id),
    );

    return {
      channels: mappedChannels,
      popularChannels,
      otherChannels,
    };
  }

  /**
   * Get a single channel definition by ID
   */
  async getChannelById(id: string): Promise<ChannelDefinition | null> {
    const channel = await this.channelDefinitionService.get(
      { id },
      {
        select: {
          id: true,
          label: true,
          icon: true,
          popular: true,
          popularLocales: true,
          tokenHint: true,
          tokenPlaceholder: true,
          helpUrl: true,
          helpText: true,
          sortOrder: true,
          credentialFields: {
            where: { isDeleted: false },
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              channelId: true,
              key: true,
              label: true,
              placeholder: true,
              fieldType: true,
              required: true,
              sortOrder: true,
            },
          },
        },
      },
    );

    if (!channel) {
      return null;
    }

    return this.mapChannelToDto(channel);
  }

  private mapChannelToDto(channel: any): ChannelDefinition {
    return {
      id: channel.id,
      label: channel.label,
      icon: channel.icon,
      popular: channel.popular,
      popularLocales: channel.popularLocales || [],
      tokenHint: channel.tokenHint,
      tokenPlaceholder: channel.tokenPlaceholder,
      helpUrl: channel.helpUrl,
      helpText: channel.helpText,
      sortOrder: channel.sortOrder,
      credentialFields: (channel.credentialFields || []).map((field: any) => ({
        id: field.id,
        channelId: field.channelId,
        key: field.key,
        label: field.label,
        placeholder: field.placeholder,
        fieldType: field.fieldType as 'text' | 'password',
        required: field.required,
        sortOrder: field.sortOrder,
      })),
    };
  }
}
