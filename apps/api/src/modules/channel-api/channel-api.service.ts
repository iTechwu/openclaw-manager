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
   */
  async listChannels(): Promise<ChannelDefinitionListResponse> {
    const channels = await this.channelDefinitionService.findMany({
      where: { isDeleted: false },
      orderBy: [{ popular: 'desc' }, { sortOrder: 'asc' }, { label: 'asc' }],
      include: {
        credentialFields: {
          where: { isDeleted: false },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    const mappedChannels: ChannelDefinition[] = channels.map((channel) =>
      this.mapChannelToDto(channel),
    );

    const popularChannels = mappedChannels.filter((c) => c.popular);
    const otherChannels = mappedChannels.filter((c) => !c.popular);

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
    const channel = await this.channelDefinitionService.findFirst({
      where: { id, isDeleted: false },
      include: {
        credentialFields: {
          where: { isDeleted: false },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

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
