/**
 * 飞书客户端服务
 *
 * 职责：
 * - 管理多个飞书渠道的连接
 * - 使用官方 SDK 建立 WebSocket 长连接
 * - 创建和销毁 API 客户端和 SDK 客户端
 * - 不包含业务逻辑
 *
 * 注意：飞书长连接模式必须使用官方 SDK，自定义 WebSocket 连接无法被飞书后台识别
 */
import { Injectable, Inject, OnModuleDestroy } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { FeishuApiClient } from './feishu-api.client';
import { FeishuSdkClient, FeishuSdkClientOptions } from './feishu-sdk.client';
import type {
  FeishuCredentials,
  FeishuChannelConfig,
  FeishuMessageHandler,
} from './feishu.types';

export interface FeishuConnection {
  channelId: string;
  apiClient: FeishuApiClient;
  sdkClient: FeishuSdkClient;
}

@Injectable()
export class FeishuClientService implements OnModuleDestroy {
  private connections: Map<string, FeishuConnection> = new Map();

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly httpService: HttpService,
  ) {}

  /**
   * 创建飞书连接
   * @param channelId 渠道 ID
   * @param credentials 凭证
   * @param config 配置
   * @param messageHandler 消息处理器
   * @param sdkOptions SDK 选项
   */
  async createConnection(
    channelId: string,
    credentials: FeishuCredentials,
    config: FeishuChannelConfig,
    messageHandler: FeishuMessageHandler,
    sdkOptions?: FeishuSdkClientOptions,
  ): Promise<FeishuConnection> {
    // 如果已存在连接，先断开
    if (this.connections.has(channelId)) {
      await this.destroyConnection(channelId);
    }

    // 创建 API 客户端（用于发送消息等 REST API 调用）
    const apiClient = new FeishuApiClient(
      credentials,
      config,
      this.httpService,
      this.logger,
    );

    // 创建 SDK 客户端（用于建立长连接接收事件）
    const sdkClient = new FeishuSdkClient(
      credentials,
      config,
      this.logger,
      sdkOptions,
    );
    sdkClient.onMessage(messageHandler);

    const connection: FeishuConnection = {
      channelId,
      apiClient,
      sdkClient,
    };

    this.connections.set(channelId, connection);

    this.logger.info('Feishu connection created', { channelId });

    return connection;
  }

  /**
   * 连接到飞书（启动长连接）
   * 使用官方 SDK 建立 WebSocket 长连接
   */
  async connect(channelId: string): Promise<void> {
    const connection = this.connections.get(channelId);
    if (!connection) {
      throw new Error(`Feishu connection not found: ${channelId}`);
    }

    await connection.sdkClient.start();
  }

  /**
   * 断开飞书连接
   */
  disconnect(channelId: string): void {
    const connection = this.connections.get(channelId);
    if (connection) {
      connection.sdkClient.stop();
    }
  }

  /**
   * 销毁连接
   */
  async destroyConnection(channelId: string): Promise<void> {
    const connection = this.connections.get(channelId);
    if (connection) {
      connection.sdkClient.stop();
      this.connections.delete(channelId);
      this.logger.info('Feishu connection destroyed', { channelId });
    }
  }

  /**
   * 获取连接
   */
  getConnection(channelId: string): FeishuConnection | undefined {
    return this.connections.get(channelId);
  }

  /**
   * 获取 API 客户端
   */
  getApiClient(channelId: string): FeishuApiClient | undefined {
    return this.connections.get(channelId)?.apiClient;
  }

  /**
   * 检查连接状态
   */
  isConnected(channelId: string): boolean {
    const connection = this.connections.get(channelId);
    return connection?.sdkClient.isConnected() ?? false;
  }

  /**
   * 获取所有连接的渠道 ID
   */
  getConnectedChannelIds(): string[] {
    return Array.from(this.connections.keys()).filter((id) =>
      this.isConnected(id),
    );
  }

  /**
   * 模块销毁时清理所有连接
   */
  onModuleDestroy(): void {
    for (const [channelId, connection] of this.connections) {
      connection.sdkClient.stop();
      this.logger.info('Feishu connection cleaned up on module destroy', {
        channelId,
      });
    }
    this.connections.clear();
  }
}
