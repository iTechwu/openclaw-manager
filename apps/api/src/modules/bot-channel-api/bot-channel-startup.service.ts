/**
 * Bot Channel Startup Service
 *
 * 职责：
 * - 应用启动时验证所有已启用的飞书渠道配置
 * - 连接状态由 OpenClaw 原生 feishu 扩展管理
 * - 仅验证配置有效性，不主动建立连接
 *
 * 迁移说明：
 * - 原 WebSocket 连接逻辑已迁移到 OpenClaw feishu 扩展
 * - 此服务现在只负责配置验证和状态同步
 */
import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { BotChannelService } from '@app/db';
import { CryptClient } from '@app/clients/internal/crypt';

interface ValidationResult {
  total: number;
  valid: number;
  invalid: number;
  details: Array<{
    channelId: string;
    channelName: string;
    botHostname?: string;
    status: 'valid' | 'invalid';
    error?: string;
  }>;
}

@Injectable()
export class BotChannelStartupService implements OnModuleInit {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly botChannelDb: BotChannelService,
    private readonly cryptClient: CryptClient,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.info('='.repeat(60));
    this.logger.info('BotChannelStartupService: 开始验证飞书渠道配置...');
    this.logger.info('='.repeat(60));

    try {
      const result = await this.validateAllFeishuChannels();
      this.logger.info(
        'BotChannelStartupService: 飞书渠道配置验证完成',
        result,
      );
    } catch (error) {
      this.logger.error('BotChannelStartupService: 飞书渠道配置验证失败', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * 验证所有已启用的飞书渠道配置
   * 注意：不再主动建立连接，连接由 OpenClaw feishu 扩展管理
   */
  private async validateAllFeishuChannels(): Promise<ValidationResult> {
    const result: ValidationResult = {
      total: 0,
      valid: 0,
      invalid: 0,
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
      {
        orderBy: { createdAt: 'asc' },
      },
    );

    result.total = channels.length;

    if (channels.length === 0) {
      this.logger.info('BotChannelStartupService: 没有需要验证的飞书渠道');
      return result;
    }

    this.logger.info('BotChannelStartupService: 发现飞书渠道', {
      count: channels.length,
      channelIds: channels.map((c) => c.id),
    });

    // 逐个验证配置
    for (const channel of channels) {
      const channelResult = await this.validateFeishuChannel(channel);
      result.details.push(channelResult);

      if (channelResult.status === 'valid') {
        result.valid++;
      } else {
        result.invalid++;
      }
    }

    return result;
  }

  /**
   * 验证单个飞书渠道配置
   * 只验证配置有效性，不建立实际连接
   */
  private async validateFeishuChannel(
    channel: any,
  ): Promise<ValidationResult['details'][0]> {
    const channelId = channel.id;
    const channelName = channel.name;
    const botHostname = channel.bot?.hostname;

    try {
      // 检查凭证是否存在
      if (!channel.credentialsEncrypted) {
        await this.updateChannelStatus(channelId, 'DISCONNECTED', '缺少凭证');
        return {
          channelId,
          channelName,
          botHostname,
          status: 'invalid',
          error: 'Missing credentials',
        };
      }

      // 解密凭证
      const encryptedStr = Buffer.from(channel.credentialsEncrypted).toString(
        'utf8',
      );
      const credentialsJson = this.cryptClient.decrypt(encryptedStr);
      const credentials = JSON.parse(credentialsJson);

      // 验证必需字段
      if (!credentials.appId || !credentials.appSecret) {
        await this.updateChannelStatus(
          channelId,
          'DISCONNECTED',
          '凭证不完整：缺少 appId 或 appSecret',
        );
        return {
          channelId,
          channelName,
          botHostname,
          status: 'invalid',
          error: 'Incomplete credentials: missing appId or appSecret',
        };
      }

      // 验证凭证格式（基本检查）
      if (
        !credentials.appId.startsWith('cli_') &&
        !credentials.appId.startsWith('app_')
      ) {
        this.logger.warn(
          'BotChannelStartupService: 飞书 App ID 格式可能不正确',
          { channelId, appId: credentials.appId.substring(0, 10) + '...' },
        );
      }

      // 更新状态为待连接（实际连接由 OpenClaw 管理）
      await this.updateChannelStatus(channelId, 'DISCONNECTED', null);

      this.logger.info('BotChannelStartupService: 飞书渠道配置验证通过 ✓', {
        channelId,
        channelName,
        botHostname,
      });

      return {
        channelId,
        channelName,
        botHostname,
        status: 'valid',
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      await this.updateChannelStatus(
        channelId,
        'ERROR',
        `配置验证失败: ${errorMessage}`,
      );

      this.logger.error('BotChannelStartupService: 飞书渠道配置验证失败 ✗', {
        channelId,
        channelName,
        botHostname,
        error: errorMessage,
      });

      return {
        channelId,
        channelName,
        botHostname,
        status: 'invalid',
        error: errorMessage,
      };
    }
  }

  /**
   * 更新渠道连接状态
   */
  private async updateChannelStatus(
    channelId: string,
    status: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' | 'ERROR',
    error: string | null,
  ): Promise<void> {
    try {
      await this.botChannelDb.update(
        { id: channelId },
        {
          connectionStatus: status,
          lastError: error,
          // 如果是连接成功，更新最后连接时间
          ...(status === 'CONNECTED' && { lastConnectedAt: new Date() }),
        },
      );
    } catch (updateError) {
      this.logger.warn('BotChannelStartupService: 更新渠道状态失败', {
        channelId,
        status,
        error:
          updateError instanceof Error ? updateError.message : 'Unknown error',
      });
    }
  }
}
