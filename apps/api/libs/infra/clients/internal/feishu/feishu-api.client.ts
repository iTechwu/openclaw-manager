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
}
