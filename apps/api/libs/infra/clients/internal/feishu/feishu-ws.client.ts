/**
 * 飞书 WebSocket 长连接客户端
 *
 * 职责：
 * - 建立和维护 WebSocket 长连接
 * - 接收飞书事件推送
 * - 自动重连
 * - 心跳保活
 */
import { Logger } from 'winston';
import WebSocket from 'ws';
import type {
  FeishuMessageEvent,
  FeishuMessageHandler,
  FeishuWsMessage,
} from './feishu.types';
import { FeishuApiClient } from './feishu-api.client';

export interface FeishuWsClientOptions {
  reconnectInterval?: number; // 重连间隔（毫秒），默认 5000
  maxReconnectAttempts?: number; // 最大重连次数，默认 10
  pingInterval?: number; // 心跳间隔（毫秒），默认 30000
}

export class FeishuWsClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private pingTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private shouldReconnect = true;
  private messageHandler: FeishuMessageHandler | null = null;

  private readonly options: Required<FeishuWsClientOptions>;

  constructor(
    private readonly apiClient: FeishuApiClient,
    private readonly logger: Logger,
    options?: FeishuWsClientOptions,
  ) {
    this.options = {
      reconnectInterval: options?.reconnectInterval ?? 5000,
      maxReconnectAttempts: options?.maxReconnectAttempts ?? 10,
      pingInterval: options?.pingInterval ?? 30000,
    };
  }

  /**
   * 设置消息处理器
   */
  onMessage(handler: FeishuMessageHandler): void {
    this.messageHandler = handler;
  }

  /**
   * 连接到飞书 WebSocket
   */
  async connect(): Promise<void> {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      this.logger.warn('Feishu WebSocket already connected or connecting');
      return;
    }

    this.isConnecting = true;
    this.shouldReconnect = true;

    try {
      const wsUrl = await this.apiClient.getWsEndpoint();
      this.logger.info('Connecting to Feishu WebSocket', { url: wsUrl });

      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        this.logger.info('Feishu WebSocket connected');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.startPing();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data);
      });

      this.ws.on('close', (code, reason) => {
        this.logger.warn('Feishu WebSocket closed', {
          code,
          reason: reason.toString(),
        });
        this.cleanup();
        this.scheduleReconnect();
      });

      this.ws.on('error', (error) => {
        this.logger.error('Feishu WebSocket error', { error });
        this.isConnecting = false;
      });
    } catch (error) {
      this.logger.error('Failed to connect to Feishu WebSocket', { error });
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.shouldReconnect = false;
    this.cleanup();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.logger.info('Feishu WebSocket disconnected');
  }

  /**
   * 获取连接状态
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * 处理收到的消息
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      const message: FeishuWsMessage = JSON.parse(data.toString());

      switch (message.type) {
        case 'event':
          if (message.data) {
            this.handleEvent(message.data);
          }
          break;
        case 'pong':
          // 心跳响应，不需要处理
          break;
        case 'card':
          // 卡片交互事件，暂不处理
          this.logger.debug('Received card event', { data: message.data });
          break;
        default:
          this.logger.debug('Unknown message type', { message });
      }
    } catch (error) {
      this.logger.error('Failed to parse Feishu WebSocket message', {
        error,
        data: data.toString(),
      });
    }
  }

  /**
   * 处理事件
   */
  private async handleEvent(event: FeishuMessageEvent): Promise<void> {
    const eventType = event.header?.event_type;

    this.logger.info('Received Feishu event', {
      eventId: event.header?.event_id,
      eventType,
    });

    // 只处理消息接收事件
    if (eventType === 'im.message.receive_v1' && this.messageHandler) {
      try {
        await this.messageHandler(event);
      } catch (error) {
        this.logger.error('Failed to handle Feishu message event', { error });
      }
    }
  }

  /**
   * 开始心跳
   */
  private startPing(): void {
    this.stopPing();

    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, this.options.pingInterval);
  }

  /**
   * 停止心跳
   */
  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /**
   * 安排重连
   */
  private scheduleReconnect(): void {
    if (!this.shouldReconnect) {
      return;
    }

    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.logger.error('Max reconnect attempts reached, giving up');
      return;
    }

    this.reconnectAttempts++;
    const delay =
      this.options.reconnectInterval * Math.min(this.reconnectAttempts, 5);

    this.logger.info('Scheduling Feishu WebSocket reconnect', {
      attempt: this.reconnectAttempts,
      delay,
    });

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    this.stopPing();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
