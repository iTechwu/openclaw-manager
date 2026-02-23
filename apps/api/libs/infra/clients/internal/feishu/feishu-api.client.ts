/**
 * 飞书 API 客户端
 *
 * 职责：
 * - 获取和管理 Tenant Access Token
 * - 发送消息到飞书
 * - 不包含业务逻辑
 * - 不访问数据库
 */
import { Logger } from 'winston';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import type {
  FeishuCredentials,
  FeishuChannelConfig,
  TenantAccessTokenResponse,
  FeishuSendMessageRequest,
  FeishuSendMessageResponse,
  FeishuCardContent,
  FeishuUserInfo,
  FeishuChatInfo,
  FeishuImageData,
  FeishuFileData,
} from './feishu.types';

export class FeishuApiClient {
  private tenantAccessToken: string | null = null;
  private tokenExpireAt: number = 0;
  private readonly baseUrl: string;

  constructor(
    private readonly credentials: FeishuCredentials,
    private readonly config: FeishuChannelConfig,
    private readonly httpService: HttpService,
    private readonly logger: Logger,
  ) {
    // 根据配置选择飞书或 Lark 国际版
    this.baseUrl =
      config.domain === 'lark'
        ? 'https://open.larksuite.com/open-apis'
        : 'https://open.feishu.cn/open-apis';
  }

  /**
   * 获取 Tenant Access Token
   * 自动缓存和刷新
   */
  async getTenantAccessToken(): Promise<string> {
    // 检查缓存的 token 是否有效（提前 5 分钟刷新）
    if (this.tenantAccessToken && Date.now() < this.tokenExpireAt - 300000) {
      return this.tenantAccessToken;
    }

    const url = `${this.baseUrl}/auth/v3/tenant_access_token/internal`;

    try {
      const response = await firstValueFrom(
        this.httpService.post<TenantAccessTokenResponse>(url, {
          app_id: this.credentials.appId,
          app_secret: this.credentials.appSecret,
        }),
      );

      if (response.data.code !== 0) {
        throw new Error(
          `Failed to get tenant access token: ${response.data.msg}`,
        );
      }

      this.tenantAccessToken = response.data.tenant_access_token!;
      // expire 是秒数，转换为毫秒时间戳
      this.tokenExpireAt = Date.now() + (response.data.expire || 7200) * 1000;

      this.logger.info('Feishu tenant access token refreshed', {
        expireAt: new Date(this.tokenExpireAt).toISOString(),
      });

      return this.tenantAccessToken;
    } catch (error) {
      this.logger.error('Failed to get Feishu tenant access token', { error });
      throw error;
    }
  }

  /**
   * 发送消息
   * @param receiveIdType 接收者 ID 类型：open_id, user_id, union_id, email, chat_id
   * @param request 消息请求
   */
  async sendMessage(
    receiveIdType: 'open_id' | 'user_id' | 'union_id' | 'email' | 'chat_id',
    request: FeishuSendMessageRequest,
  ): Promise<FeishuSendMessageResponse> {
    const token = await this.getTenantAccessToken();
    const url = `${this.baseUrl}/im/v1/messages?receive_id_type=${receiveIdType}`;

    try {
      const response = await firstValueFrom(
        this.httpService.post<FeishuSendMessageResponse>(url, request, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json; charset=utf-8',
          },
        }),
      );

      if (response.data.code !== 0) {
        this.logger.error('Failed to send Feishu message', {
          code: response.data.code,
          msg: response.data.msg,
        });
        throw new Error(`Failed to send message: ${response.data.msg}`);
      }

      this.logger.info('Feishu message sent', {
        messageId: response.data.data?.message_id,
        chatId: response.data.data?.chat_id,
      });

      return response.data;
    } catch (error) {
      this.logger.error('Failed to send Feishu message', { error });
      throw error;
    }
  }

  /**
   * 发送文本消息
   */
  async sendTextMessage(
    chatId: string,
    text: string,
  ): Promise<FeishuSendMessageResponse> {
    return this.sendMessage('chat_id', {
      receive_id: chatId,
      msg_type: 'text',
      content: JSON.stringify({ text }),
    });
  }

  /**
   * 回复消息
   */
  async replyMessage(
    messageId: string,
    text: string,
  ): Promise<FeishuSendMessageResponse> {
    const token = await this.getTenantAccessToken();
    const url = `${this.baseUrl}/im/v1/messages/${messageId}/reply`;

    try {
      const response = await firstValueFrom(
        this.httpService.post<FeishuSendMessageResponse>(
          url,
          {
            msg_type: 'text',
            content: JSON.stringify({ text }),
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json; charset=utf-8',
            },
          },
        ),
      );

      if (response.data.code !== 0) {
        throw new Error(`Failed to reply message: ${response.data.msg}`);
      }

      return response.data;
    } catch (error) {
      this.logger.error('Failed to reply Feishu message', { error });
      throw error;
    }
  }

  /**
   * 发送卡片消息
   */
  async sendCardMessage(
    chatId: string,
    card: FeishuCardContent,
  ): Promise<FeishuSendMessageResponse> {
    return this.sendMessage('chat_id', {
      receive_id: chatId,
      msg_type: 'interactive',
      content: JSON.stringify(card),
    });
  }

  /**
   * 更新卡片消息
   */
  async updateCardMessage(
    messageId: string,
    card: FeishuCardContent,
  ): Promise<FeishuSendMessageResponse> {
    const token = await this.getTenantAccessToken();
    const url = `${this.baseUrl}/im/v1/messages/${messageId}`;

    try {
      const response = await firstValueFrom(
        this.httpService.patch<FeishuSendMessageResponse>(
          url,
          {
            msg_type: 'interactive',
            content: JSON.stringify(card),
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json; charset=utf-8',
            },
          },
        ),
      );

      if (response.data.code !== 0) {
        throw new Error(`Failed to update card message: ${response.data.msg}`);
      }

      return response.data;
    } catch (error) {
      this.logger.error('Failed to update Feishu card message', { error });
      throw error;
    }
  }

  /**
   * 获取用户信息
   */
  async getUserInfo(
    userId: string,
    userIdType: 'open_id' | 'user_id' | 'union_id' = 'open_id',
  ): Promise<FeishuUserInfo> {
    const token = await this.getTenantAccessToken();
    const url = `${this.baseUrl}/contact/v3/users/${userId}?user_id_type=${userIdType}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get<{
          code: number;
          msg: string;
          data?: { user: FeishuUserInfo };
        }>(url, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }),
      );

      if (response.data.code !== 0 || !response.data.data?.user) {
        throw new Error(`Failed to get user info: ${response.data.msg}`);
      }

      return response.data.data.user;
    } catch (error) {
      this.logger.error('Failed to get Feishu user info', { error });
      throw error;
    }
  }

  /**
   * 获取群信息
   */
  async getChatInfo(chatId: string): Promise<FeishuChatInfo> {
    const token = await this.getTenantAccessToken();
    const url = `${this.baseUrl}/im/v1/chats/${chatId}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get<{
          code: number;
          msg: string;
          data?: FeishuChatInfo;
        }>(url, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }),
      );

      if (response.data.code !== 0 || !response.data.data) {
        throw new Error(`Failed to get chat info: ${response.data.msg}`);
      }

      return response.data.data;
    } catch (error) {
      this.logger.error('Failed to get Feishu chat info', { error });
      throw error;
    }
  }

  /**
   * 获取配置
   */
  getConfig(): FeishuChannelConfig {
    return this.config;
  }

  /**
   * 下载飞书图片并返回 Base64 编码数据
   *
   * 重要：飞书有两种图片下载 API：
   * 1. /im/v1/images/:image_key - 只能下载机器人自己上传的图片
   * 2. /im/v1/messages/:message_id/resources/:file_key - 下载用户发送的消息中的图片
   *
   * 此方法使用第二种 API 来下载用户发送的图片
   *
   * @param messageId 消息 ID（从事件中获取）
   * @param fileKey 文件 key（从消息内容中提取的 image_key）
   * @returns 图片数据（Base64、MIME 类型、大小）
   */
  async getImageDataFromMessage(
    messageId: string,
    fileKey: string,
  ): Promise<FeishuImageData> {
    const token = await this.getTenantAccessToken();
    // 使用获取消息资源文件 API（用于下载用户发送的图片）
    const url = `${this.baseUrl}/im/v1/messages/${messageId}/resources/${fileKey}?type=image`;

    this.logger.info('Downloading Feishu image from message', {
      url,
      messageId,
      fileKey,
      hasToken: !!token,
    });

    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          responseType: 'arraybuffer',
        }),
      );

      // 从响应头获取 MIME 类型
      const contentType =
        response.headers['content-type'] || 'application/octet-stream';

      // 转换为 Base64
      const base64 = Buffer.from(response.data).toString('base64');

      this.logger.info('Feishu image downloaded successfully', {
        messageId,
        fileKey,
        mimeType: contentType,
        size: response.data.byteLength,
      });

      return {
        base64,
        mimeType: contentType,
        size: response.data.byteLength,
      };
    } catch (error) {
      // 尝试解析错误响应体（Feishu 返回 JSON 错误信息）
      let errorDetail =
        error instanceof Error ? error.message : 'Unknown error';
      if (error?.response?.data) {
        try {
          const errorData = error.response.data;
          if (Buffer.isBuffer(errorData)) {
            const errorText = errorData.toString('utf-8');
            const errorJson = JSON.parse(errorText);
            errorDetail = `${errorJson.code}: ${errorJson.msg} (${error.message})`;
          } else if (errorData instanceof ArrayBuffer) {
            const errorText = Buffer.from(new Uint8Array(errorData)).toString(
              'utf-8',
            );
            const errorJson = JSON.parse(errorText);
            errorDetail = `${errorJson.code}: ${errorJson.msg} (${error.message})`;
          } else if (typeof errorData === 'object') {
            errorDetail = `${errorData.code}: ${errorData.msg} (${error.message})`;
          }
        } catch {
          // 解析失败，使用原始错误信息
        }
      }
      this.logger.error('Failed to download Feishu image from message', {
        messageId,
        fileKey,
        error: errorDetail,
        status: error?.response?.status,
      });
      throw error;
    }
  }

  /**
   * 下载飞书文件并返回 Base64 编码数据
   *
   * 使用获取消息资源文件 API 下载用户发送的文件
   *
   * @param messageId 消息 ID（从事件中获取）
   * @param fileKey 文件 key（从消息内容中提取的 file_key）
   * @param fileName 文件名（用于记录日志）
   * @returns 文件数据（Base64、MIME 类型、大小、文件名）
   */
  async getFileDataFromMessage(
    messageId: string,
    fileKey: string,
    fileName: string,
  ): Promise<FeishuFileData> {
    const token = await this.getTenantAccessToken();
    // 使用获取消息资源文件 API（用于下载用户发送的文件）
    const url = `${this.baseUrl}/im/v1/messages/${messageId}/resources/${fileKey}?type=file`;

    this.logger.info('Downloading Feishu file from message', {
      url,
      messageId,
      fileKey,
      fileName,
      hasToken: !!token,
    });

    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          responseType: 'arraybuffer',
        }),
      );

      // 从响应头获取 MIME 类型
      const contentType =
        response.headers['content-type'] || 'application/octet-stream';

      // 转换为 Base64
      const base64 = Buffer.from(response.data).toString('base64');

      this.logger.info('Feishu file downloaded successfully', {
        messageId,
        fileKey,
        fileName,
        mimeType: contentType,
        size: response.data.byteLength,
      });

      return {
        base64,
        mimeType: contentType,
        size: response.data.byteLength,
        fileName,
      };
    } catch (error) {
      // 尝试解析错误响应体（Feishu 返回 JSON 错误信息）
      let errorDetail =
        error instanceof Error ? error.message : 'Unknown error';
      if (error?.response?.data) {
        try {
          const errorData = error.response.data;
          if (Buffer.isBuffer(errorData)) {
            const errorText = errorData.toString('utf-8');
            const errorJson = JSON.parse(errorText);
            errorDetail = `${errorJson.code}: ${errorJson.msg} (${error.message})`;
          } else if (errorData instanceof ArrayBuffer) {
            const errorText = Buffer.from(new Uint8Array(errorData)).toString(
              'utf-8',
            );
            const errorJson = JSON.parse(errorText);
            errorDetail = `${errorJson.code}: ${errorJson.msg} (${error.message})`;
          } else if (typeof errorData === 'object') {
            errorDetail = `${errorData.code}: ${errorData.msg} (${error.message})`;
          }
        } catch {
          // 解析失败，使用原始错误信息
        }
      }
      this.logger.error('Failed to download Feishu file from message', {
        messageId,
        fileKey,
        fileName,
        error: errorDetail,
        status: error?.response?.status,
      });
      throw error;
    }
  }
}
