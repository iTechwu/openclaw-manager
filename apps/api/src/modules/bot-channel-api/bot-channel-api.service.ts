/**
 * Bot Channel API Service
 *
 * 职责：
 * - Bot 渠道配置的 CRUD 操作
 * - 渠道连接管理
 * - 凭证加密/解密
 * - 凭证验证（基于 ChannelDefinition）
 */
import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import {
  BotChannelService,
  BotService,
  ChannelDefinitionService,
} from '@app/db';
import { CryptClient } from '@app/clients/internal/crypt';
import { FeishuClientService } from '@app/clients/internal/feishu';
import type { Prisma } from '@prisma/client';
import type {
  BotChannelItem,
  BotChannelListResponse,
  CreateBotChannelRequest,
  UpdateBotChannelRequest,
  ChannelConnectionStatus,
} from '@repo/contracts';

@Injectable()
export class BotChannelApiService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly botChannelDb: BotChannelService,
    private readonly botDb: BotService,
    private readonly channelDefinitionDb: ChannelDefinitionService,
    private readonly cryptClient: CryptClient,
    private readonly feishuClientService: FeishuClientService,
  ) {}

  /**
   * 获取 Bot 的所有渠道配置
   */
  async listChannels(
    userId: string,
    hostname: string,
  ): Promise<BotChannelListResponse> {
    const bot = await this.getBotByHostname(userId, hostname);

    const { list, total } = await this.botChannelDb.list(
      { botId: bot.id },
      { orderBy: { createdAt: 'desc' } },
    );

    return {
      list: list.map((channel) => this.mapToItem(channel)),
      total,
    };
  }

  /**
   * 获取单个渠道配置
   */
  async getChannelById(
    userId: string,
    hostname: string,
    channelId: string,
  ): Promise<BotChannelItem> {
    const bot = await this.getBotByHostname(userId, hostname);
    const channel = await this.botChannelDb.get({
      id: channelId,
      botId: bot.id,
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    return this.mapToItem(channel);
  }

  /**
   * 创建渠道配置
   */
  async createChannel(
    userId: string,
    hostname: string,
    request: CreateBotChannelRequest,
  ): Promise<BotChannelItem> {
    const bot = await this.getBotByHostname(userId, hostname);

    // 验证渠道类型是否存在
    await this.validateChannelCredentials(
      request.channelType,
      request.credentials,
    );

    // 加密凭证
    const credentialsEncrypted = this.cryptClient.encrypt(
      JSON.stringify(request.credentials),
    );

    const channel = await this.botChannelDb.create({
      bot: { connect: { id: bot.id } },
      channelType: request.channelType,
      name: request.name,
      credentialsEncrypted: Buffer.from(credentialsEncrypted),
      config: request.config as Prisma.InputJsonValue,
      isEnabled: request.isEnabled ?? true,
      connectionStatus: 'DISCONNECTED',
    });

    this.logger.info('Bot channel created', {
      botId: bot.id,
      channelId: channel.id,
      channelType: request.channelType,
    });

    return this.mapToItem(channel);
  }

  /**
   * 更新渠道配置
   */
  async updateChannel(
    userId: string,
    hostname: string,
    channelId: string,
    request: UpdateBotChannelRequest,
  ): Promise<BotChannelItem> {
    const bot = await this.getBotByHostname(userId, hostname);
    const existingChannel = await this.botChannelDb.get({
      id: channelId,
      botId: bot.id,
    });

    if (!existingChannel) {
      throw new NotFoundException('Channel not found');
    }

    const updateData: Prisma.BotChannelUpdateInput = {};

    if (request.name !== undefined) {
      updateData.name = request.name;
    }

    if (request.credentials !== undefined) {
      updateData.credentialsEncrypted = Buffer.from(
        this.cryptClient.encrypt(JSON.stringify(request.credentials)),
      );
    }

    if (request.config !== undefined) {
      updateData.config = request.config as Prisma.InputJsonValue;
    }

    if (request.isEnabled !== undefined) {
      updateData.isEnabled = request.isEnabled;
    }

    const channel = await this.botChannelDb.update(
      { id: channelId },
      updateData,
    );

    this.logger.info('Bot channel updated', {
      botId: bot.id,
      channelId,
    });

    return this.mapToItem(channel);
  }

  /**
   * 删除渠道配置
   */
  async deleteChannel(
    userId: string,
    hostname: string,
    channelId: string,
  ): Promise<void> {
    const bot = await this.getBotByHostname(userId, hostname);
    const channel = await this.botChannelDb.get({
      id: channelId,
      botId: bot.id,
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    // 如果是飞书渠道，先断开连接
    if (channel.channelType === 'feishu') {
      this.feishuClientService.disconnect(channelId);
    }

    await this.botChannelDb.delete({ id: channelId });

    this.logger.info('Bot channel deleted', {
      botId: bot.id,
      channelId,
    });
  }

  /**
   * 连接渠道
   */
  async connectChannel(
    userId: string,
    hostname: string,
    channelId: string,
  ): Promise<BotChannelItem> {
    const bot = await this.getBotByHostname(userId, hostname);
    const channel = await this.botChannelDb.get({
      id: channelId,
      botId: bot.id,
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    // 更新状态为连接中
    await this.botChannelDb.update(
      { id: channelId },
      { connectionStatus: 'CONNECTING', lastError: null },
    );

    try {
      if (channel.channelType === 'feishu') {
        await this.connectFeishuChannel(channel);
      } else {
        throw new Error(`Unsupported channel type: ${channel.channelType}`);
      }

      // 更新状态为已连接
      const updatedChannel = await this.botChannelDb.update(
        { id: channelId },
        {
          connectionStatus: 'CONNECTED',
          lastConnectedAt: new Date(),
          lastError: null,
        },
      );

      this.logger.info('Bot channel connected', {
        botId: bot.id,
        channelId,
        channelType: channel.channelType,
      });

      return this.mapToItem(updatedChannel);
    } catch (error) {
      // 更新状态为错误
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const updatedChannel = await this.botChannelDb.update(
        { id: channelId },
        {
          connectionStatus: 'ERROR',
          lastError: errorMessage,
        },
      );

      this.logger.error('Failed to connect bot channel', {
        botId: bot.id,
        channelId,
        error: errorMessage,
      });

      return this.mapToItem(updatedChannel);
    }
  }

  /**
   * 断开渠道连接
   */
  async disconnectChannel(
    userId: string,
    hostname: string,
    channelId: string,
  ): Promise<BotChannelItem> {
    const bot = await this.getBotByHostname(userId, hostname);
    const channel = await this.botChannelDb.get({
      id: channelId,
      botId: bot.id,
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    if (channel.channelType === 'feishu') {
      this.feishuClientService.disconnect(channelId);
    }

    const updatedChannel = await this.botChannelDb.update(
      { id: channelId },
      { connectionStatus: 'DISCONNECTED' },
    );

    this.logger.info('Bot channel disconnected', {
      botId: bot.id,
      channelId,
    });

    return this.mapToItem(updatedChannel);
  }

  /**
   * 连接飞书渠道
   */
  private async connectFeishuChannel(channel: any): Promise<void> {
    // 解密凭证
    const credentialsJson = this.cryptClient.decrypt(
      channel.credentialsEncrypted.toString(),
    );
    const credentials = JSON.parse(credentialsJson);

    const config = (channel.config as Record<string, unknown>) || {};

    // 创建连接
    await this.feishuClientService.createConnection(
      channel.id,
      {
        appId: credentials.appId,
        appSecret: credentials.appSecret,
      },
      {
        requireMention: (config.requireMention as boolean) ?? true,
        replyInThread: (config.replyInThread as boolean) ?? false,
        showTyping: (config.showTyping as boolean) ?? true,
        domain: (config.domain as 'feishu' | 'lark') ?? 'feishu',
      },
      async (event) => {
        // TODO: 实现消息处理逻辑
        this.logger.info('Received Feishu message', {
          channelId: channel.id,
          messageId: event.event?.message?.message_id,
        });
      },
    );

    // 建立 WebSocket 连接
    await this.feishuClientService.connect(channel.id);
  }

  /**
   * 验证渠道凭证
   * 根据 ChannelDefinition 验证必填字段
   */
  private async validateChannelCredentials(
    channelType: string,
    credentials: Record<string, string>,
  ): Promise<void> {
    // 获取渠道定义（使用类型断言处理关联查询结果）
    const channelDefinition = (await this.channelDefinitionDb.get(
      { id: channelType },
      {
        select: {
          id: true,
          label: true,
          credentialFields: {
            where: { isDeleted: false },
            orderBy: { sortOrder: 'asc' },
            select: {
              key: true,
              label: true,
              required: true,
            },
          },
        },
      },
    )) as unknown as {
      id: string;
      label: string;
      credentialFields: Array<{ key: string; label: string; required: boolean }>;
    } | null;

    if (!channelDefinition) {
      throw new BadRequestException(`Unsupported channel type: ${channelType}`);
    }

    // 验证必填字段
    const missingFields: string[] = [];
    for (const field of channelDefinition.credentialFields) {
      if (field.required && !credentials[field.key]?.trim()) {
        missingFields.push(field.label);
      }
    }

    if (missingFields.length > 0) {
      throw new BadRequestException(
        `Missing required credentials: ${missingFields.join(', ')}`,
      );
    }
  }

  /**
   * 根据 hostname 获取 Bot
   */
  private async getBotByHostname(userId: string, hostname: string) {
    const bot = await this.botDb.get({
      hostname,
      createdById: userId,
    });

    if (!bot) {
      throw new NotFoundException('Bot not found');
    }

    return bot;
  }

  /**
   * 映射到 API 响应格式
   */
  private mapToItem(channel: any): BotChannelItem {
    return {
      id: channel.id,
      botId: channel.botId,
      channelType: channel.channelType,
      name: channel.name,
      config: channel.config as Record<string, unknown> | null,
      isEnabled: channel.isEnabled,
      connectionStatus:
        channel.connectionStatus as ChannelConnectionStatus,
      lastConnectedAt: channel.lastConnectedAt?.toISOString() ?? null,
      lastError: channel.lastError,
      createdAt: channel.createdAt.toISOString(),
      updatedAt: channel.updatedAt.toISOString(),
    };
  }
}
