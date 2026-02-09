/**
 * Feishu Message Handler Service
 *
 * 职责：
 * - 统一处理飞书消息
 * - 消息去重（防止重复回复）
 * - 转发消息到 OpenClaw 并回复飞书
 *
 * 注意：此服务是单例，确保消息去重在所有连接之间共享
 */
import { Injectable, Inject } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { BotChannelService, BotService } from '@app/db';
import { FeishuClientService } from '@app/clients/internal/feishu';
import { OpenClawClient } from '@app/clients/internal/openclaw';

@Injectable()
export class FeishuMessageHandlerService {
  // 消息去重：记录已处理的 messageId，防止重复回复
  // 这是单例服务，所以所有连接共享同一个 Set
  private processedMessageIds = new Set<string>();
  private readonly MESSAGE_ID_TTL = 60000; // 60 秒后清理

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly botChannelDb: BotChannelService,
    private readonly botDb: BotService,
    private readonly feishuClientService: FeishuClientService,
    private readonly openClawClient: OpenClawClient,
  ) {}

  /**
   * 创建消息处理器
   * 返回一个绑定了 channel 的处理函数
   */
  createHandler(channel: any): (event: any) => Promise<void> {
    return async (event: any) => {
      await this.handleFeishuMessage(channel, event);
    };
  }

  /**
   * 处理飞书消息
   * 转发消息到 OpenClaw 并回复飞书
   */
  private async handleFeishuMessage(channel: any, event: any): Promise<void> {
    const messageId = event.event?.message?.message_id;
    const chatId = event.event?.message?.chat_id;
    const messageType = event.event?.message?.message_type;
    const rawContent = event.event?.message?.content;

    // 消息去重：检查是否已处理过该消息
    if (messageId && this.processedMessageIds.has(messageId)) {
      this.logger.debug('跳过重复消息（共享去重）', {
        messageId,
        channelId: channel.id,
      });
      return;
    }

    // 标记消息为已处理
    if (messageId) {
      this.processedMessageIds.add(messageId);
      // 设置定时清理，防止内存泄漏
      setTimeout(() => {
        this.processedMessageIds.delete(messageId);
      }, this.MESSAGE_ID_TTL);
    }

    // 解析消息内容
    let messageText = '';
    try {
      if (rawContent) {
        const content = JSON.parse(rawContent);
        messageText = content.text || '';
      }
    } catch {
      messageText = rawContent || '';
    }

    this.logger.info('========== 收到飞书消息（统一处理） ==========', {
      channelId: channel.id,
      botId: channel.botId,
      messageId,
      chatId,
      messageType,
      messageText,
    });

    // 只处理文本消息
    if (messageType !== 'text' || !messageText.trim()) {
      this.logger.debug('跳过非文本消息或空消息', { messageType, messageText });
      return;
    }

    try {
      // 获取关联的 Bot
      const bot = await this.botDb.getById(channel.botId);
      if (!bot) {
        this.logger.error('找不到关联的 Bot（可能已删除），断开飞书连接', {
          botId: channel.botId,
          channelId: channel.id,
        });
        // 断开飞书连接
        await this.feishuClientService.destroyConnection(channel.id);
        // 更新渠道状态
        await this.botChannelDb.update(
          { id: channel.id },
          {
            connectionStatus: 'DISCONNECTED',
            lastError: 'Bot 已删除，连接已断开',
          },
        );
        return;
      }

      // 检查 Bot 是否运行中
      if (bot.status !== 'running') {
        this.logger.warn('Bot 未运行，跳过消息处理', {
          botId: bot.id,
          status: bot.status,
        });
        return;
      }

      // 检查 Bot 端口和 token
      if (!bot.port || !bot.gatewayToken) {
        this.logger.error('Bot 缺少端口或 token', {
          botId: bot.id,
          port: bot.port,
          hasToken: !!bot.gatewayToken,
        });
        return;
      }

      this.logger.info('转发消息到 OpenClaw', {
        botId: bot.id,
        botName: bot.name,
        port: bot.port,
        messageLength: messageText.length,
      });

      // 发送消息到 OpenClaw
      const aiResponse = await this.openClawClient.chat(
        bot.port,
        bot.gatewayToken,
        messageText,
      );

      this.logger.info('收到 OpenClaw 响应', {
        botId: bot.id,
        responseLength: aiResponse.length,
      });

      // 回复飞书消息
      if (aiResponse) {
        const apiClient = this.feishuClientService.getApiClient(channel.id);
        if (apiClient) {
          await apiClient.replyMessage(messageId, aiResponse);
          this.logger.info('已回复飞书消息', {
            channelId: channel.id,
            messageId,
            responseLength: aiResponse.length,
          });
        } else {
          this.logger.error('找不到飞书 API 客户端', { channelId: channel.id });
        }
      }
    } catch (error) {
      this.logger.error('处理飞书消息失败', {
        channelId: channel.id,
        messageId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
