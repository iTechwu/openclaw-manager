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
  BotProviderKeyService,
} from '@app/db';
import { CryptClient } from '@app/clients/internal/crypt';
import { FeishuClientService } from '@app/clients/internal/feishu';
import { FeishuMessageHandlerService } from './feishu-message-handler.service';
import type { Prisma } from '@prisma/client';
import type {
  BotChannelItem,
  BotChannelListResponse,
  CreateBotChannelRequest,
  UpdateBotChannelRequest,
  ChannelConnectionStatus,
  ChannelTestRequest,
  ChannelTestResponse,
  ValidateCredentialsRequest,
} from '@repo/contracts';

@Injectable()
export class BotChannelApiService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly botChannelDb: BotChannelService,
    private readonly botDb: BotService,
    private readonly botProviderKeyDb: BotProviderKeyService,
    private readonly channelDefinitionDb: ChannelDefinitionService,
    private readonly cryptClient: CryptClient,
    private readonly feishuClientService: FeishuClientService,
    private readonly feishuMessageHandler: FeishuMessageHandlerService,
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

    this.logger.info('Creating bot channel', {
      botId: bot.id,
      channelType: request.channelType,
      name: request.name,
      credentialsKeys: Object.keys(request.credentials || {}),
      hasCredentials: !!request.credentials,
      credentialsLength: JSON.stringify(request.credentials || {}).length,
      hasConfig: request.config !== undefined,
      configKeys: request.config ? Object.keys(request.config) : [],
      configValue: request.config,
    });

    // 验证渠道类型是否存在
    await this.validateChannelCredentials(
      request.channelType,
      request.credentials,
    );

    // 加密凭证 (credentials_encrypted 字段用于安全存储敏感凭证，如 appId/appSecret)
    const credentialsEncrypted = this.cryptClient.encrypt(
      JSON.stringify(request.credentials),
    );

    this.logger.debug('Encrypted credentials', {
      originalLength: JSON.stringify(request.credentials).length,
      encryptedLength: credentialsEncrypted.length,
      encryptedPreview: credentialsEncrypted.substring(0, 30),
    });

    // 处理 config 字段：确保 undefined 转换为 null，避免 Prisma 忽略该字段
    const configValue =
      request.config !== undefined
        ? (request.config as Prisma.InputJsonValue)
        : null;

    this.logger.debug('Config value to save', {
      hasConfig: request.config !== undefined,
      configValue,
    });

    const channel = await this.botChannelDb.create({
      bot: { connect: { id: bot.id } },
      channelType: request.channelType,
      name: request.name,
      credentialsEncrypted: Buffer.from(credentialsEncrypted),
      config: configValue,
      isEnabled: request.isEnabled ?? true,
      connectionStatus: 'DISCONNECTED',
    });

    this.logger.info('Bot channel created', {
      botId: bot.id,
      channelId: channel.id,
      channelType: request.channelType,
    });

    // 检查并更新 Bot 状态（从 draft 到 created）
    await this.checkAndUpdateBotStatus(bot.id);

    // 对于飞书渠道，自动建立 WebSocket 长连接
    if (request.channelType === 'feishu') {
      try {
        await this.connectFeishuChannel(channel);
        // 更新状态为已连接
        const updatedChannel = await this.botChannelDb.update(
          { id: channel.id },
          {
            connectionStatus: 'CONNECTED',
            lastConnectedAt: new Date(),
            lastError: null,
          },
        );
        this.logger.info('Feishu channel auto-connected after creation', {
          channelId: channel.id,
        });
        return this.mapToItem(updatedChannel);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(
          'Failed to auto-connect Feishu channel after creation',
          {
            channelId: channel.id,
            error: errorMessage,
          },
        );
        // 更新状态为错误，但不影响创建成功
        await this.botChannelDb.update(
          { id: channel.id },
          {
            connectionStatus: 'ERROR',
            lastError: errorMessage,
          },
        );
      }
    }

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

    this.logger.info('Updating bot channel', {
      botId: bot.id,
      channelId,
      hasName: request.name !== undefined,
      hasCredentials: request.credentials !== undefined,
      hasConfig: request.config !== undefined,
      configValue: request.config,
      hasIsEnabled: request.isEnabled !== undefined,
    });

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

    this.logger.debug('Update data prepared', {
      channelId,
      updateDataKeys: Object.keys(updateData),
      configInUpdateData: 'config' in updateData,
      configValue: updateData.config,
    });

    const channel = await this.botChannelDb.update(
      { id: channelId },
      updateData,
    );

    this.logger.info('Bot channel updated', {
      botId: bot.id,
      channelId,
      savedConfig: channel.config,
    });

    // 检查并更新 Bot 状态（从 draft 到 created）
    await this.checkAndUpdateBotStatus(bot.id);

    // 对于飞书渠道，如果凭证或配置更新了，需要重新建立连接
    if (
      existingChannel.channelType === 'feishu' &&
      (request.credentials !== undefined || request.config !== undefined)
    ) {
      try {
        // 先断开现有连接
        this.feishuClientService.disconnect(channelId);

        // 重新建立连接
        await this.connectFeishuChannel(channel);

        // 更新状态为已连接
        const updatedChannel = await this.botChannelDb.update(
          { id: channelId },
          {
            connectionStatus: 'CONNECTED',
            lastConnectedAt: new Date(),
            lastError: null,
          },
        );
        this.logger.info('Feishu channel reconnected after update', {
          channelId,
        });
        return this.mapToItem(updatedChannel);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn('Failed to reconnect Feishu channel after update', {
          channelId,
          error: errorMessage,
        });
        // 更新状态为错误
        await this.botChannelDb.update(
          { id: channelId },
          {
            connectionStatus: 'ERROR',
            lastError: errorMessage,
          },
        );
      }
    }

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
   * 快速测试渠道配置
   */
  async testChannel(
    userId: string,
    hostname: string,
    channelId: string,
    request: ChannelTestRequest,
  ): Promise<ChannelTestResponse> {
    const bot = await this.getBotByHostname(userId, hostname);
    const channel = await this.botChannelDb.get({
      id: channelId,
      botId: bot.id,
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    return this.executeChannelTestWithTiming(channel.channelType, async () => {
      // 解密凭证
      const encryptedBuffer = channel.credentialsEncrypted;
      const encryptedStr = Buffer.from(encryptedBuffer).toString('utf8');
      const credentialsJson = this.cryptClient.decrypt(encryptedStr);
      const credentials = JSON.parse(credentialsJson);

      return this.executeChannelTest(
        channel.channelType,
        credentials,
        channel.config as Record<string, unknown> | null,
        request.message,
      );
    });
  }

  /**
   * 验证凭证（保存前验证）
   * 不需要先保存渠道，直接验证凭证是否有效
   */
  async validateCredentials(
    userId: string,
    hostname: string,
    request: ValidateCredentialsRequest,
  ): Promise<ChannelTestResponse> {
    // 验证用户有权限访问该 Bot
    await this.getBotByHostname(userId, hostname);

    // 验证渠道类型是否存在
    await this.validateChannelCredentials(
      request.channelType,
      request.credentials,
    );

    this.logger.info('Validating credentials before save', {
      channelType: request.channelType,
      credentialsKeys: Object.keys(request.credentials),
      hasConfig: !!request.config,
    });

    return this.executeChannelTestWithTiming(request.channelType, async () => {
      return this.executeChannelTest(
        request.channelType,
        request.credentials,
        (request.config as Record<string, unknown>) || null,
      );
    });
  }

  /**
   * 执行渠道测试并计时
   */
  private async executeChannelTestWithTiming(
    channelType: string,
    testFn: () => Promise<Omit<ChannelTestResponse, 'latency'>>,
  ): Promise<ChannelTestResponse> {
    const startTime = Date.now();

    try {
      const testResult = await testFn();
      const latency = Date.now() - startTime;

      this.logger.info('Channel test completed', {
        channelType,
        status: testResult.status,
        latency,
      });

      return {
        ...testResult,
        latency,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.logger.error('Channel test failed', {
        channelType,
        error: errorMessage,
        latency,
      });

      return {
        status: 'error',
        message: `Test failed: ${errorMessage}`,
        latency,
      };
    }
  }

  /**
   * 执行渠道测试
   */
  private async executeChannelTest(
    channelType: string,
    credentials: Record<string, string>,
    config: Record<string, unknown> | null,
    _message?: string,
  ): Promise<Omit<ChannelTestResponse, 'latency'>> {
    switch (channelType) {
      case 'feishu':
        return this.testFeishuChannel(credentials, config);
      case 'telegram':
        return this.testTelegramChannel(credentials);
      case 'discord':
        return this.testDiscordChannel(credentials);
      default:
        return {
          status: 'warning',
          message: `Channel type '${channelType}' does not support quick test yet`,
        };
    }
  }

  /**
   * 测试飞书渠道
   */
  private async testFeishuChannel(
    credentials: Record<string, string>,
    config: Record<string, unknown> | null,
  ): Promise<Omit<ChannelTestResponse, 'latency'>> {
    const { appId, appSecret } = credentials;

    if (!appId || !appSecret) {
      return {
        status: 'error',
        message: 'Missing required credentials: App ID or App Secret',
      };
    }

    try {
      // 尝试获取 tenant_access_token 来验证凭证
      const domain = (config?.domain as 'feishu' | 'lark') ?? 'feishu';
      const baseUrl =
        domain === 'lark'
          ? 'https://open.larksuite.com'
          : 'https://open.feishu.cn';

      const response = await fetch(
        `${baseUrl}/open-apis/auth/v3/tenant_access_token/internal`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
        },
      );

      const data = (await response.json()) as {
        code: number;
        msg: string;
        tenant_access_token?: string;
        expire?: number;
      };

      if (data.code === 0 && data.tenant_access_token) {
        return {
          status: 'success',
          message: 'Feishu credentials verified successfully',
          details: {
            tokenExpire: data.expire,
            domain,
          },
        };
      } else {
        return {
          status: 'error',
          message: `Feishu API error: ${data.msg || 'Unknown error'}`,
          details: { code: data.code },
        };
      }
    } catch (error) {
      return {
        status: 'error',
        message: `Failed to connect to Feishu API: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * 测试 Telegram 渠道
   */
  private async testTelegramChannel(
    credentials: Record<string, string>,
  ): Promise<Omit<ChannelTestResponse, 'latency'>> {
    const { botToken } = credentials;

    if (!botToken) {
      return {
        status: 'error',
        message: 'Missing required credential: Bot Token',
      };
    }

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/getMe`,
      );
      const data = (await response.json()) as {
        ok: boolean;
        result?: { username: string; first_name: string };
        description?: string;
      };

      if (data.ok && data.result) {
        return {
          status: 'success',
          message: `Telegram bot verified: @${data.result.username}`,
          details: {
            username: data.result.username,
            firstName: data.result.first_name,
          },
        };
      } else {
        return {
          status: 'error',
          message: `Telegram API error: ${data.description || 'Unknown error'}`,
        };
      }
    } catch (error) {
      return {
        status: 'error',
        message: `Failed to connect to Telegram API: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * 测试 Discord 渠道
   */
  private async testDiscordChannel(
    credentials: Record<string, string>,
  ): Promise<Omit<ChannelTestResponse, 'latency'>> {
    const { botToken } = credentials;

    if (!botToken) {
      return {
        status: 'error',
        message: 'Missing required credential: Bot Token',
      };
    }

    try {
      const response = await fetch('https://discord.com/api/v10/users/@me', {
        headers: { Authorization: `Bot ${botToken}` },
      });

      if (response.ok) {
        const data = (await response.json()) as {
          username: string;
          discriminator: string;
          id: string;
        };
        return {
          status: 'success',
          message: `Discord bot verified: ${data.username}#${data.discriminator}`,
          details: {
            username: data.username,
            discriminator: data.discriminator,
            id: data.id,
          },
        };
      } else {
        const errorData = (await response.json()) as { message?: string };
        return {
          status: 'error',
          message: `Discord API error: ${errorData.message || response.statusText}`,
        };
      }
    } catch (error) {
      return {
        status: 'error',
        message: `Failed to connect to Discord API: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * 连接飞书渠道
   */
  private async connectFeishuChannel(channel: any): Promise<void> {
    // 解密凭证 - 需要先将 Buffer 转换为 UTF-8 字符串
    const encryptedStr = Buffer.from(channel.credentialsEncrypted).toString('utf8');
    const credentialsJson = this.cryptClient.decrypt(encryptedStr);
    const credentials = JSON.parse(credentialsJson);

    const config = (channel.config as Record<string, unknown>) || {};

    // 创建连接，使用共享的消息处理器
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
      this.feishuMessageHandler.createHandler(channel),
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
      credentialFields: Array<{
        key: string;
        label: string;
        required: boolean;
      }>;
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
   * 注意：credentials_encrypted 字段不会返回给前端，但会返回掩码版本用于显示已配置状态
   */
  private mapToItem(channel: any): BotChannelItem {
    // 确保 config 字段正确处理：Prisma 返回的 Json 类型可能是 null 或对象
    const configValue = channel.config as Record<string, unknown> | null;

    // 解密凭证并生成掩码版本
    let credentialsMasked: Record<string, string> | null = null;
    if (channel.credentialsEncrypted) {
      try {
        const encryptedStr = Buffer.from(channel.credentialsEncrypted).toString(
          'utf8',
        );
        const credentialsJson = this.cryptClient.decrypt(encryptedStr);
        const credentials = JSON.parse(credentialsJson) as Record<
          string,
          string
        >;

        // 生成掩码版本
        credentialsMasked = {};
        for (const [key, value] of Object.entries(credentials)) {
          if (value && typeof value === 'string') {
            credentialsMasked[key] = this.maskCredentialValue(value);
          }
        }
      } catch (error) {
        this.logger.warn('Failed to decrypt credentials for masking', {
          channelId: channel.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    this.logger.debug('Mapping channel to item', {
      channelId: channel.id,
      rawConfig: channel.config,
      rawConfigType: typeof channel.config,
      mappedConfig: configValue,
      hasCredentialsMasked: !!credentialsMasked,
    });

    return {
      id: channel.id,
      botId: channel.botId,
      channelType: channel.channelType,
      name: channel.name,
      config: configValue,
      credentialsMasked,
      isEnabled: channel.isEnabled,
      connectionStatus: channel.connectionStatus as ChannelConnectionStatus,
      lastConnectedAt: channel.lastConnectedAt?.toISOString() ?? null,
      lastError: channel.lastError,
      createdAt: channel.createdAt.toISOString(),
      updatedAt: channel.updatedAt.toISOString(),
    };
  }

  /**
   * 将凭证值转换为掩码格式
   * 例如: "cli_abc123xyz" -> "cli_***xyz"
   *       "secret123" -> "sec***123"
   */
  private maskCredentialValue(value: string): string {
    if (!value || value.length <= 6) {
      return '***';
    }

    const visibleChars = Math.min(3, Math.floor(value.length / 4));
    const prefix = value.substring(0, visibleChars);
    const suffix = value.substring(value.length - visibleChars);

    return `${prefix}***${suffix}`;
  }

  /**
   * 检查并更新 Bot 状态
   * 当 Bot 同时配置了渠道和 AI Provider 时，自动将状态从 draft 更新为 created
   */
  private async checkAndUpdateBotStatus(botId: string): Promise<void> {
    try {
      // 获取当前 bot 状态
      const bot = await this.botDb.getById(botId);
      if (!bot) {
        this.logger.warn('Bot not found when checking status', { botId });
        return;
      }

      // 只有 draft 状态的 bot 需要检查
      if (bot.status !== 'draft') {
        this.logger.debug(
          'Bot is not in draft status, skipping status update',
          {
            botId,
            currentStatus: bot.status,
          },
        );
        return;
      }

      // 检查是否有渠道配置
      const { total: channelCount } = await this.botChannelDb.list({ botId });
      const hasChannel = channelCount > 0;

      // 检查是否有 AI Provider 配置
      const { total: providerCount } = await this.botProviderKeyDb.list({
        botId,
      });
      const hasProvider = providerCount > 0;

      this.logger.debug('Checking bot configuration status', {
        botId,
        hasChannel,
        hasProvider,
        channelCount,
        providerCount,
      });

      // 如果同时配置了渠道和 AI Provider，更新状态为 created
      if (hasChannel && hasProvider) {
        await this.botDb.update({ id: botId }, { status: 'created' });
        this.logger.info('Bot status updated from draft to created', {
          botId,
          reason: 'Both channel and AI provider are configured',
        });
      }
    } catch (error) {
      // 状态更新失败不应影响主流程
      this.logger.error('Failed to check and update bot status', {
        botId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
