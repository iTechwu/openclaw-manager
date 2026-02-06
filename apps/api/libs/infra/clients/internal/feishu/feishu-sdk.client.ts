/**
 * 飞书官方 SDK 客户端封装
 *
 * 职责：
 * - 使用飞书官方 SDK 建立 WebSocket 长连接
 * - 接收飞书事件推送
 * - 自动重连和心跳保活（由官方 SDK 处理）
 *
 * 注意：飞书长连接模式必须使用官方 SDK，自定义 WebSocket 连接无法被飞书后台识别
 */
import { Logger } from 'winston';
import * as lark from '@larksuiteoapi/node-sdk';
import type {
  FeishuCredentials,
  FeishuChannelConfig,
  FeishuMessageHandler,
  FeishuCardActionHandler,
  FeishuCardActionEvent,
  FeishuConnectionCallbacks,
} from './feishu.types';

export interface FeishuSdkClientOptions {
  autoReconnect?: boolean; // 是否自动重连，默认 true
  connectionCallbacks?: FeishuConnectionCallbacks; // 连接状态回调
}

// 内部使用的完整选项类型
interface ResolvedFeishuSdkClientOptions {
  autoReconnect: boolean;
  connectionCallbacks: FeishuConnectionCallbacks;
}

/**
 * 飞书官方 SDK 消息事件类型
 * 与官方 SDK 的 im.message.receive_v1 事件数据结构对应
 */
export interface FeishuSdkMessageEvent {
  event_id?: string;
  token?: string;
  create_time?: string;
  event_type?: string;
  tenant_key?: string;
  ts?: string;
  uuid?: string;
  type?: string;
  app_id?: string;
  sender: {
    sender_id?: {
      union_id?: string;
      user_id?: string;
      open_id?: string;
    };
    sender_type: string;
    tenant_key?: string;
  };
  message: {
    message_id: string;
    root_id?: string;
    parent_id?: string;
    create_time: string;
    update_time?: string;
    chat_id: string;
    thread_id?: string;
    chat_type: string;
    message_type: string;
    content: string;
    mentions?: Array<{
      key: string;
      id: {
        union_id?: string;
        user_id?: string;
        open_id?: string;
      };
      name: string;
      tenant_key?: string;
    }>;
  };
}

/**
 * 飞书官方 SDK 客户端
 * 使用官方 SDK 的 WSClient 建立长连接
 */
export class FeishuSdkClient {
  private wsClient: lark.WSClient | null = null;
  private eventDispatcher: lark.EventDispatcher | null = null;
  private messageHandler: FeishuMessageHandler | null = null;
  private cardActionHandler: FeishuCardActionHandler | null = null;
  private isStarted = false;

  private readonly options: ResolvedFeishuSdkClientOptions;

  constructor(
    private readonly credentials: FeishuCredentials,
    private readonly config: FeishuChannelConfig,
    private readonly logger: Logger,
    options?: FeishuSdkClientOptions,
  ) {
    this.options = {
      autoReconnect: options?.autoReconnect ?? true,
      connectionCallbacks: options?.connectionCallbacks ?? {},
    };
  }

  /**
   * 设置消息处理器
   */
  onMessage(handler: FeishuMessageHandler): void {
    this.messageHandler = handler;
  }

  /**
   * 设置卡片交互处理器
   */
  onCardAction(handler: FeishuCardActionHandler): void {
    this.cardActionHandler = handler;
  }

  /**
   * 启动长连接
   * 使用官方 SDK 的 WSClient 建立连接
   */
  async start(): Promise<void> {
    if (this.isStarted) {
      this.logger.warn('Feishu SDK client already started');
      return;
    }

    // 确定域名
    const domain =
      this.config.domain === 'lark' ? lark.Domain.Lark : lark.Domain.Feishu;

    // 创建事件分发器
    this.eventDispatcher = new lark.EventDispatcher({
      // 长连接模式不需要 verificationToken 和 encryptKey
      logger: {
        error: (...msg: unknown[]) => {
          this.logger.error('Feishu SDK', { msg });
        },
        warn: (...msg: unknown[]) => {
          this.logger.warn('Feishu SDK', { msg });
        },
        info: (...msg: unknown[]) => {
          this.logger.info('Feishu SDK', { msg });
        },
        debug: (...msg: unknown[]) => {
          this.logger.debug('Feishu SDK', { msg });
        },
        trace: (...msg: unknown[]) => {
          this.logger.debug('Feishu SDK trace', { msg });
        },
      },
    });

    // 注册消息接收事件处理器
    this.eventDispatcher.register({
      'im.message.receive_v1': async (data: FeishuSdkMessageEvent) => {
        this.logger.info('Received Feishu message via SDK', {
          messageId: data.message?.message_id,
          chatId: data.message?.chat_id,
          chatType: data.message?.chat_type,
        });

        if (this.messageHandler) {
          try {
            // 转换为内部格式
            await this.messageHandler({
              schema: '2.0',
              header: {
                event_id: data.event_id || '',
                event_type: data.event_type || 'im.message.receive_v1',
                create_time: data.create_time || '',
                token: data.token || '',
                app_id: data.app_id || '',
                tenant_key: data.tenant_key || '',
              },
              event: {
                sender: {
                  sender_id: {
                    union_id: data.sender?.sender_id?.union_id || '',
                    user_id: data.sender?.sender_id?.user_id || '',
                    open_id: data.sender?.sender_id?.open_id || '',
                  },
                  sender_type: data.sender?.sender_type || '',
                  tenant_key: data.sender?.tenant_key || '',
                },
                message: {
                  message_id: data.message?.message_id || '',
                  root_id: data.message?.root_id,
                  parent_id: data.message?.parent_id,
                  create_time: data.message?.create_time || '',
                  update_time: data.message?.update_time,
                  chat_id: data.message?.chat_id || '',
                  chat_type: data.message?.chat_type as 'p2p' | 'group',
                  message_type: data.message?.message_type || '',
                  content: data.message?.content || '',
                  mentions: data.message?.mentions?.map((m) => ({
                    key: m.key,
                    id: {
                      union_id: m.id?.union_id || '',
                      user_id: m.id?.user_id || '',
                      open_id: m.id?.open_id || '',
                    },
                    name: m.name,
                    tenant_key: m.tenant_key || '',
                  })),
                },
              },
            });
          } catch (error) {
            this.logger.error('Failed to handle Feishu message', { error });
          }
        }
      },
      // 注册卡片交互事件处理器
      'card.action.trigger': async (data: FeishuCardActionEvent) => {
        this.logger.info('Received Feishu card action via SDK', {
          openId: data.open_id,
          messageId: data.open_message_id,
          chatId: data.open_chat_id,
        });

        if (this.cardActionHandler) {
          try {
            const response = await this.cardActionHandler(data);
            return response;
          } catch (error) {
            this.logger.error('Failed to handle Feishu card action', { error });
          }
        }
      },
    });

    // 创建 WebSocket 客户端
    this.wsClient = new lark.WSClient({
      appId: this.credentials.appId,
      appSecret: this.credentials.appSecret,
      domain,
      autoReconnect: this.options.autoReconnect,
      logger: {
        error: (...msg: unknown[]) => {
          this.logger.error('Feishu WS', { msg });
        },
        warn: (...msg: unknown[]) => {
          this.logger.warn('Feishu WS', { msg });
        },
        info: (...msg: unknown[]) => {
          this.logger.info('Feishu WS', { msg });
        },
        debug: (...msg: unknown[]) => {
          this.logger.debug('Feishu WS', { msg });
        },
        trace: (...msg: unknown[]) => {
          this.logger.debug('Feishu WS trace', { msg });
        },
      },
    });

    // 启动长连接
    this.logger.info('Starting Feishu SDK WebSocket connection', {
      appId: this.credentials.appId,
      domain: this.config.domain,
    });

    await this.wsClient.start({
      eventDispatcher: this.eventDispatcher,
    });

    this.isStarted = true;
    this.logger.info('Feishu SDK WebSocket connection started successfully');

    // 调用连接成功回调
    this.options.connectionCallbacks.onConnect?.();
  }

  /**
   * 停止长连接
   */
  stop(): void {
    if (this.wsClient) {
      this.wsClient.close();
      this.wsClient = null;
    }
    this.eventDispatcher = null;
    this.isStarted = false;
    this.logger.info('Feishu SDK WebSocket connection stopped');

    // 调用断开连接回调
    this.options.connectionCallbacks.onDisconnect?.('manual stop');
  }

  /**
   * 获取连接状态
   */
  isConnected(): boolean {
    return this.isStarted;
  }

  /**
   * 获取重连信息
   */
  getReconnectInfo(): {
    lastConnectTime: number;
    nextConnectTime: number;
  } | null {
    if (this.wsClient) {
      return this.wsClient.getReconnectInfo();
    }
    return null;
  }
}
