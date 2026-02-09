/**
 * Bot Channel Startup Service
 *
 * 职责：
 * - 应用启动时自动重连所有已启用的飞书渠道
 * - 确保长连接在应用重启后能够自动恢复
 * - 提供连接验证和重试机制
 */
import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { BotChannelService } from '@app/db';
import { CryptClient } from '@app/clients/internal/crypt';
import { FeishuClientService } from '@app/clients/internal/feishu';
import { FeishuMessageHandlerService } from './feishu-message-handler.service';

// 连接配置
const CONNECTION_CONFIG = {
  maxRetries: 3,
  retryDelayMs: 2000,
  connectionDelayMs: 500,
  verifyDelayMs: 1000,
};

interface ReconnectResult {
  total: number;
  success: number;
  failed: number;
  details: Array<{
    channelId: string;
    channelName: string;
    status: 'success' | 'failed';
    error?: string;
  }>;
}

@Injectable()
export class BotChannelStartupService implements OnModuleInit {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly botChannelDb: BotChannelService,
    private readonly cryptClient: CryptClient,
    private readonly feishuClientService: FeishuClientService,
    private readonly feishuMessageHandler: FeishuMessageHandlerService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.info('='.repeat(60));
    this.logger.info('BotChannelStartupService: 开始自动重连飞书渠道...');
    this.logger.info('='.repeat(60));

    try {
      const result = await this.reconnectAllFeishuChannels();
      this.logger.info('BotChannelStartupService: 自动重连完成', result);
    } catch (error) {
      this.logger.error('BotChannelStartupService: 自动重连失败', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * 重连所有已启用的飞书渠道
   */
  private async reconnectAllFeishuChannels(): Promise<ReconnectResult> {
    const result: ReconnectResult = {
      total: 0,
      success: 0,
      failed: 0,
      details: [],
    };

    // 查询所有已启用的飞书渠道（排除已删除的 Bot）
    const { list: channels } = await this.botChannelDb.list(
      {
        channelType: 'feishu',
        isEnabled: true,
        bot: {
          isDeleted: false,
        },
      },
      { orderBy: { createdAt: 'asc' } },
    );

    result.total = channels.length;

    if (channels.length === 0) {
      this.logger.info('BotChannelStartupService: 没有需要重连的飞书渠道');
      return result;
    }

    this.logger.info('BotChannelStartupService: 发现飞书渠道', {
      count: channels.length,
      channelIds: channels.map((c) => c.id),
    });

    // 逐个重连
    for (let i = 0; i < channels.length; i++) {
      const channel = channels[i];

      // 添加连接间隔，避免同时建立多个连接
      if (i > 0) {
        await this.delay(CONNECTION_CONFIG.connectionDelayMs);
      }

      const channelResult = await this.connectWithRetry(channel);
      result.details.push(channelResult);

      if (channelResult.status === 'success') {
        result.success++;
      } else {
        result.failed++;
      }
    }

    return result;
  }

  /**
   * 带重试的连接
   */
  private async connectWithRetry(
    channel: any,
  ): Promise<ReconnectResult['details'][0]> {
    const { maxRetries, retryDelayMs } = CONNECTION_CONFIG;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      this.logger.info(
        `BotChannelStartupService: 尝试连接渠道 (${attempt}/${maxRetries})`,
        {
          channelId: channel.id,
          channelName: channel.name,
        },
      );

      try {
        await this.connectFeishuChannel(channel);

        // 验证连接状态
        const isConnected = await this.verifyConnection(channel.id);

        if (isConnected) {
          // 更新数据库状态
          await this.botChannelDb.update(
            { id: channel.id },
            {
              connectionStatus: 'CONNECTED',
              lastConnectedAt: new Date(),
              lastError: null,
            },
          );

          this.logger.info('BotChannelStartupService: 渠道连接成功 ✓', {
            channelId: channel.id,
            channelName: channel.name,
            attempt,
          });

          return {
            channelId: channel.id,
            channelName: channel.name,
            status: 'success',
          };
        } else {
          throw new Error('连接验证失败：连接状态异常');
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        this.logger.warn(
          `BotChannelStartupService: 连接尝试失败 (${attempt}/${maxRetries})`,
          {
            channelId: channel.id,
            channelName: channel.name,
            error: errorMessage,
          },
        );

        // 如果不是最后一次尝试，等待后重试
        if (attempt < maxRetries) {
          await this.delay(retryDelayMs);
        } else {
          // 最后一次尝试失败，更新数据库状态
          await this.botChannelDb.update(
            { id: channel.id },
            {
              connectionStatus: 'ERROR',
              lastError: `连接失败 (重试 ${maxRetries} 次): ${errorMessage}`,
            },
          );

          this.logger.error('BotChannelStartupService: 渠道连接失败 ✗', {
            channelId: channel.id,
            channelName: channel.name,
            error: errorMessage,
            attempts: maxRetries,
          });

          return {
            channelId: channel.id,
            channelName: channel.name,
            status: 'failed',
            error: errorMessage,
          };
        }
      }
    }

    // 不应该到达这里，但为了类型安全
    return {
      channelId: channel.id,
      channelName: channel.name,
      status: 'failed',
      error: 'Unknown error',
    };
  }

  /**
   * 连接单个飞书渠道
   */
  private async connectFeishuChannel(channel: any): Promise<void> {
    // 解密凭证 - 需要先将 Buffer 转换为 UTF-8 字符串
    const encryptedStr = Buffer.from(channel.credentialsEncrypted).toString(
      'utf8',
    );
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
   * 验证连接状态
   */
  private async verifyConnection(channelId: string): Promise<boolean> {
    // 等待一小段时间让连接稳定
    await this.delay(CONNECTION_CONFIG.verifyDelayMs);

    // 检查连接状态
    const isConnected = this.feishuClientService.isConnected(channelId);

    this.logger.debug('BotChannelStartupService: 验证连接状态', {
      channelId,
      isConnected,
    });

    return isConnected;
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
