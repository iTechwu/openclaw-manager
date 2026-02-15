/**
 * Feishu Message Handler Service
 *
 * 职责：
 * - 统一处理飞书消息
 * - 消息去重（防止重复回复）
 * - 支持多模态消息（文本、富文本、图片、文件）
 * - 转发消息到 OpenClaw 并回复飞书
 * - 图片和文件消息通过视觉模型直接处理
 *
 * 注意：此服务是单例，确保消息去重在所有连接之间共享
 */
import { Injectable, Inject } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { FileBucketVendor } from '@prisma/client';
import { BotChannelService, BotService } from '@app/db';
import { FeishuClientService } from '@app/clients/internal/feishu';
import {
  OpenClawClient,
  OpenClawContentPart,
} from '@app/clients/internal/openclaw';
import { FileStorageService } from '@app/shared-services/file-storage';
import { parseFeishuMessage } from '@app/clients/internal/feishu/feishu-message-parser';
import type { ParsedFeishuMessage } from '@app/clients/internal/feishu/feishu.types';
import enviromentUtil from '@/utils/enviroment.util';
import { randomUUID } from 'crypto';

/** 支持处理的消息类型 */
const SUPPORTED_MESSAGE_TYPES = ['text', 'post', 'image', 'file'];

/**
 * 单个文件提取文本的最大长度（字符数）
 * 超过此长度将截断，防止大文档导致 AI 模型超时
 * 可通过环境变量 MAX_FILE_TEXT_LENGTH 覆盖
 */
const MAX_FILE_TEXT_LENGTH = parseInt(
  process.env.MAX_FILE_TEXT_LENGTH || '15000',
  10,
);

/**
 * 默认视觉模型（当 Bot 未配置视觉模型时使用）
 * 可通过环境变量 DEFAULT_VISION_MODEL 覆盖
 */
const DEFAULT_VISION_MODEL =
  process.env.DEFAULT_VISION_MODEL || 'doubao-seed-1-6-vision-250815';

/**
 * 支持视觉模型处理的文件类型
 * 这些文件会上传到 TOS，然后通过视觉模型处理
 */
const VISION_SUPPORTED_TYPES = [
  // 图片类型
  'png',
  'jpg',
  'jpeg',
  'gif',
  'bmp',
  'tiff',
  'webp',
  // 文档类型
  'pdf',
  'docx',
  'doc',
  'xlsx',
  'xls',
  'pptx',
  'ppt',
];

/**
 * 文本文件类型（直接解码，无需视觉模型）
 */
const TEXT_FILE_TYPES = [
  'txt',
  'md',
  'json',
  'csv',
  'xml',
  'html',
  'css',
  'js',
  'ts',
  'py',
  'java',
  'go',
  'rs',
  'c',
  'cpp',
  'h',
];

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
    private readonly fileStorageService: FileStorageService,
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
   * 支持文本、富文本和图片消息
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

    // 使用统一的消息解析器解析消息
    const parsedMessage = parseFeishuMessage(messageType, rawContent || '');

    this.logger.info('========== 收到飞书消息（统一处理） ==========', {
      channelId: channel.id,
      botId: channel.botId,
      messageId,
      chatId,
      messageType,
      messageText: parsedMessage.text,
      hasImages: parsedMessage.hasImages,
      imageCount: parsedMessage.images.length,
      hasFiles: parsedMessage.hasFiles,
      fileCount: parsedMessage.files.length,
    });

    // 检查是否为支持的消息类型
    if (!SUPPORTED_MESSAGE_TYPES.includes(messageType)) {
      this.logger.debug('不支持的消息类型，跳过', { messageType });
      return;
    }

    // 检查是否有有效内容
    if (
      !parsedMessage.text.trim() &&
      !parsedMessage.hasImages &&
      !parsedMessage.hasFiles
    ) {
      this.logger.debug('消息内容为空，跳过', {
        messageType,
        parsedMessage,
      });
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

      // 构建消息内容（支持多模态）
      const message = await this.buildMessage(
        parsedMessage,
        channel.id,
        messageId,
        bot,
      );

      // 根据消息类型选择不同的发送路径
      let aiResponse: string;

      if (typeof message !== 'string' && message.length > 0) {
        // 多模态消息（含图片/文件）：通过 Proxy 直接发送，绕过 OpenClaw Gateway
        const imageCount = message.filter((p) => p.type === 'image').length;
        const fileCount = message.filter((p) => p.type === 'file').length;
        const textCount = message.filter((p) => p.type === 'text' && p.text?.trim()).length;

        // 验证是否有有效的多模态内容（图片或文件）
        const hasValidMultimodalContent = imageCount > 0 || fileCount > 0;

        if (!hasValidMultimodalContent && textCount === 0) {
          // 没有有效内容，跳过发送
          this.logger.warn('多模态消息无有效内容，跳过发送', {
            botId: bot.id,
            imageCount,
            fileCount,
            textCount,
            contentParts: message.length,
          });
          return;
        }

        // 如果没有图片和文件，只有文本，回退到文本模式
        if (!hasValidMultimodalContent) {
          const textMessage = message
            .filter((p) => p.type === 'text' && p.text?.trim())
            .map((p) => p.text!)
            .join('\n');

          this.logger.info('多模态消息仅含文本，回退到文本模式', {
            botId: bot.id,
            textLength: textMessage.length,
          });

          aiResponse = await this.openClawClient.chat(
            bot.port!,
            bot.gatewayToken!,
            textMessage,
          );
        } else {
          this.logger.info('检测到多模态消息，通过 Proxy 直接发送视觉请求', {
            botId: bot.id,
            containerId: bot.containerId,
            imageCount,
            fileCount,
            textCount,
          });

          aiResponse = await this.sendVisionRequest(bot, message);
        }
      } else {
        // 纯文本消息：通过 OpenClaw Gateway 发送
        const textMessage = typeof message === 'string' ? message : '';

        // 验证文本消息不为空
        if (!textMessage.trim()) {
          this.logger.warn('文本消息为空，跳过发送', {
            botId: bot.id,
          });
          return;
        }

        this.logger.info('转发文本消息到 OpenClaw', {
          botId: bot.id,
          botName: bot.name,
          port: bot.port,
          textLength: textMessage.length,
        });

        aiResponse = await this.openClawClient.chat(
          bot.port,
          bot.gatewayToken,
          textMessage,
        );
      }

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

  /**
   * 构建发送给 OpenClaw 的消息
   * 如果消息包含图片或文件，构建多模态消息格式
   * 否则返回纯文本
   */
  private async buildMessage(
    parsedMessage: ParsedFeishuMessage,
    channelId: string,
    messageId: string,
    bot: { id: string; containerId?: string | null },
  ): Promise<string | OpenClawContentPart[]> {
    // 如果有图片，构建多模态消息
    if (parsedMessage.hasImages) {
      return this.buildImageMessage(parsedMessage, channelId, messageId);
    }

    // 如果有文件，处理文件内容
    if (parsedMessage.hasFiles) {
      return this.buildFileMessage(parsedMessage, channelId, messageId, bot);
    }

    // 纯文本消息
    return parsedMessage.text;
  }

  /**
   * 构建包含图片的多模态消息
   */
  private async buildImageMessage(
    parsedMessage: ParsedFeishuMessage,
    channelId: string,
    messageId: string,
  ): Promise<string | OpenClawContentPart[]> {
    // 构建多模态消息
    const contentParts: OpenClawContentPart[] = [];

    // 添加文本部分
    if (parsedMessage.text.trim()) {
      contentParts.push({
        type: 'text',
        text: parsedMessage.text,
      });
    }

    // 下载并添加图片
    const apiClient = this.feishuClientService.getApiClient(channelId);
    if (!apiClient) {
      this.logger.warn('找不到飞书 API 客户端，无法下载图片，仅发送文本', {
        channelId,
      });
      return parsedMessage.text;
    }

    for (const imageInfo of parsedMessage.images) {
      try {
        this.logger.info('下载飞书图片', {
          messageId,
          fileKey: imageInfo.imageKey,
          channelId,
        });

        // 使用获取消息资源文件 API 下载用户发送的图片
        const imageData = await apiClient.getImageDataFromMessage(
          messageId,
          imageInfo.imageKey,
        );

        // 添加图片部分（使用 Base64 data URL）
        contentParts.push({
          type: 'image',
          image_url: {
            url: `data:${imageData.mimeType};base64,${imageData.base64}`,
            detail: 'auto',
          },
        });

        this.logger.info('飞书图片下载成功', {
          fileKey: imageInfo.imageKey,
          mimeType: imageData.mimeType,
          size: imageData.size,
        });
      } catch (error) {
        this.logger.error('下载飞书图片失败', {
          messageId,
          fileKey: imageInfo.imageKey,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        // 继续处理其他图片，不中断整个流程
      }
    }

    // 如果所有图片都下载失败，回退到纯文本
    if (contentParts.filter((p) => p.type === 'image').length === 0) {
      this.logger.warn('所有图片下载失败，回退到纯文本模式', {
        channelId,
        textLength: parsedMessage.text.length,
      });
      return parsedMessage.text;
    }

    return contentParts;
  }

  /**
   * 构建包含文件内容的消息
   * - 文本文件：直接解码内容
   * - 图片/文档文件：上传到 TOS，通过视觉模型处理
   */
  private async buildFileMessage(
    parsedMessage: ParsedFeishuMessage,
    channelId: string,
    messageId: string,
    bot: { id: string; containerId?: string | null },
  ): Promise<string | OpenClawContentPart[]> {
    const apiClient = this.feishuClientService.getApiClient(channelId);
    if (!apiClient) {
      this.logger.warn('找不到飞书 API 客户端，无法下载文件，仅发送文本', {
        channelId,
      });
      return parsedMessage.text;
    }

    // 检查是否支持视觉模型
    const hasVisionSupport = !!bot.containerId;

    const contentParts: OpenClawContentPart[] = [];

    // 添加原始文本
    if (parsedMessage.text.trim()) {
      contentParts.push({
        type: 'text',
        text: parsedMessage.text,
      });
    }

    // 处理每个文件
    for (const fileInfo of parsedMessage.files) {
      try {
        this.logger.info('下载飞书文件', {
          messageId,
          fileKey: fileInfo.fileKey,
          fileName: fileInfo.fileName,
          channelId,
        });

        // 下载文件
        const fileData = await apiClient.getFileDataFromMessage(
          messageId,
          fileInfo.fileKey,
          fileInfo.fileName,
        );

        // 根据文件类型处理
        const fileExtension = fileInfo.fileName.toLowerCase().split('.').pop();

        if (TEXT_FILE_TYPES.includes(fileExtension || '')) {
          // 文本文件：直接解码
          const textContent = Buffer.from(
            fileData.base64,
            'base64',
          ).toString('utf-8');

          // 截断过长的文本，防止 AI 模型超时
          const truncatedText =
            textContent.length > MAX_FILE_TEXT_LENGTH
              ? textContent.substring(0, MAX_FILE_TEXT_LENGTH) +
                `\n\n[...文件内容过长，已截断。原始长度: ${textContent.length} 字符]`
              : textContent;

          contentParts.push({
            type: 'text',
            text: `\n[文件: ${fileInfo.fileName}]\n${truncatedText}`,
          });

          this.logger.info('文本文件处理完成', {
            fileName: fileInfo.fileName,
            originalLength: textContent.length,
            wasTruncated: textContent.length > MAX_FILE_TEXT_LENGTH,
          });
        } else if (
          VISION_SUPPORTED_TYPES.includes(fileExtension || '') &&
          hasVisionSupport
        ) {
          // 支持视觉模型的文件类型：上传到 TOS，通过视觉模型处理
          const fileUrl = await this.uploadFileToTos(
            fileData.base64,
            fileInfo.fileName,
          );

          if (fileUrl) {
            // 根据文件类型构建不同的内容
            if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'webp'].includes(fileExtension || '')) {
              // 图片文件：使用 image_url 格式
              contentParts.push({
                type: 'text',
                text: `\n[图片文件: ${fileInfo.fileName}]\n请分析这张图片的内容：`,
              });
              contentParts.push({
                type: 'image',
                image_url: {
                  url: `data:${fileData.mimeType};base64,${fileData.base64}`,
                  detail: 'auto',
                },
              });
            } else {
              // 文档文件（PDF 等）：使用 file_url 格式
              contentParts.push({
                type: 'text',
                text: `\n[文档文件: ${fileInfo.fileName}]\n请分析这个文档的内容并总结要点：`,
              });
              contentParts.push({
                type: 'file',
                file_url: {
                  url: fileUrl,
                  name: fileInfo.fileName,
                },
              });
            }

            this.logger.info('文件已上传，将通过视觉模型处理', {
              fileName: fileInfo.fileName,
              fileExtension,
              fileUrl: fileUrl.substring(0, 100),
            });
          } else {
            contentParts.push({
              type: 'text',
              text: `\n[文件: ${fileInfo.fileName} - 上传失败，无法处理]`,
            });
          }
        } else {
          // 不支持的文件类型或没有视觉模型支持
          contentParts.push({
            type: 'text',
            text: `\n[文件: ${fileInfo.fileName}${
              !hasVisionSupport ? ' - Bot 不支持文件处理' : ' - 此文件类型暂不支持'
            }]`,
          });
        }

        this.logger.info('飞书文件下载成功', {
          fileKey: fileInfo.fileKey,
          fileName: fileInfo.fileName,
          mimeType: fileData.mimeType,
          size: fileData.size,
        });
      } catch (error) {
        this.logger.error('下载飞书文件失败', {
          messageId,
          fileKey: fileInfo.fileKey,
          fileName: fileInfo.fileName,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        contentParts.push({
          type: 'text',
          text: `\n[文件: ${fileInfo.fileName} - 下载失败]`,
        });
      }
    }

    // 如果只有文本内容，返回纯文本格式
    if (contentParts.every((p) => p.type === 'text')) {
      return contentParts.map((p) => p.text).join('\n');
    }

    return contentParts;
  }

  /**
   * 上传文件到 TOS 并返回预签名 URL
   */
  private async uploadFileToTos(
    base64: string,
    fileName: string,
  ): Promise<string | null> {
    try {
      const vendor: FileBucketVendor = 'tos';
      const bucket = await this.fileStorageService.getDefaultBucket(false);

      // 生成唯一的文件键
      const uniqueId = randomUUID();
      const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileKey = `feishu-files/${uniqueId}/${sanitizedFileName}`;

      this.logger.info('上传文件到 TOS', {
        fileName,
        fileKey,
        bucket,
      });

      // 上传 Base64 数据到 TOS
      await this.fileStorageService.fileDataUploader(
        vendor,
        bucket,
        fileKey,
        base64,
      );

      // 生成预签名 URL（有效期 5 分钟）
      const presignedUrl = await this.fileStorageService.getPrivateDownloadUrl(
        vendor,
        bucket,
        fileKey,
        { expire: 300 },
      );

      this.logger.info('TOS 预签名 URL 生成成功', {
        fileName,
        fileKey,
        urlLength: presignedUrl.length,
      });

      // 注意：不立即清理文件，因为视觉模型可能需要时间处理
      // 可以通过 TOS 生命周期规则自动清理 feishu-files/ 目录下的旧文件

      return presignedUrl;
    } catch (error) {
      this.logger.error('上传文件到 TOS 失败', {
        fileName,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * 发送视觉请求（含图片/文件的多模态消息）
   * 通过 Keyring Proxy 直接发送，绕过 OpenClaw Gateway
   * 如果 Proxy 调用失败，回退到 OpenClaw 纯文本模式
   */
  private async sendVisionRequest(
    bot: {
      id: string;
      containerId?: string | null;
      port?: number | null;
      gatewayToken?: string | null;
    },
    content: OpenClawContentPart[],
  ): Promise<string> {
    // 检查 containerId 是否可用
    if (!bot.containerId) {
      this.logger.warn(
        'Bot 缺少 containerId，无法通过 Proxy 发送视觉请求，回退到纯文本',
        {
          botId: bot.id,
        },
      );
      return this.fallbackToTextChat(bot, content);
    }

    // 获取 Proxy 基础 URL
    const proxyBaseUrl = enviromentUtil.generateEnvironmentUrls().internalApi;
    if (!proxyBaseUrl) {
      this.logger.warn('无法获取 Proxy URL，回退到纯文本', { botId: bot.id });
      return this.fallbackToTextChat(bot, content);
    }

    try {
      const response = await this.openClawClient.chatViaProxy({
        containerId: bot.containerId,
        proxyBaseUrl,
        visionModel: DEFAULT_VISION_MODEL,
        content,
      });

      this.logger.info('视觉请求成功', {
        botId: bot.id,
        responseLength: response.length,
      });

      return response;
    } catch (error) {
      this.logger.error('视觉请求失败，回退到纯文本模式', {
        botId: bot.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return this.fallbackToTextChat(bot, content);
    }
  }

  /**
   * 回退到纯文本模式：提取文本部分通过 OpenClaw Gateway 发送
   */
  private async fallbackToTextChat(
    bot: { id: string; port?: number | null; gatewayToken?: string | null },
    content: OpenClawContentPart[],
  ): Promise<string> {
    const textParts = content
      .filter((p) => p.type === 'text' && p.text)
      .map((p) => p.text!)
      .join('\n');

    const fallbackText =
      textParts || '[用户发送了图片或文件，但系统暂时无法处理]';

    if (!bot.port || !bot.gatewayToken) {
      return '抱歉，系统暂时无法处理您的请求。';
    }

    return this.openClawClient.chat(bot.port, bot.gatewayToken, fallbackText);
  }
}
