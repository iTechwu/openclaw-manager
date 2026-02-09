/**
 * OpenClaw 客户端
 *
 * 职责：
 * - 与 OpenClaw Gateway 通信
 * - 发送消息到 OpenClaw 并获取 AI 响应
 * - 使用 WebSocket 进行实时通信
 */
import { Injectable, Inject } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import WebSocket from 'ws';
import { randomUUID } from 'crypto';

export interface OpenClawMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface OpenClawChatRequest {
  messages: OpenClawMessage[];
  stream?: boolean;
  model?: string;
}

export interface OpenClawChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

@Injectable()
export class OpenClawClient {
  private readonly requestTimeout = 120000; // 2 分钟超时
  private readonly wsTimeout = 120000; // WebSocket 响应超时

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly httpService: HttpService,
  ) {}

  /**
   * 发送消息到 OpenClaw Gateway 并获取 AI 响应
   * 使用 WebSocket 进行通信
   * @param port OpenClaw Gateway 端口
   * @param token Gateway 认证 token
   * @param message 用户消息
   * @param context 可选的上下文消息
   */
  async chat(
    port: number,
    token: string,
    message: string,
    context?: OpenClawMessage[],
  ): Promise<string> {
    this.logger.info('OpenClawClient: 发送消息到 OpenClaw', {
      port,
      messageLength: message.length,
      contextLength: context?.length || 0,
    });

    try {
      const response = await this.sendMessageViaWebSocket(
        port,
        token,
        message,
        context,
      );

      this.logger.info('OpenClawClient: 收到 AI 响应', {
        port,
        responseLength: response.length,
      });

      return response;
    } catch (error) {
      this.logger.error('OpenClawClient: 通信失败', {
        port,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * 通过 WebSocket 发送消息并获取响应
   * 使用 OpenClaw Gateway 协议：
   * 1. 连接后发送 connect 请求进行认证
   * 2. 收到 hello-ok 后发送 chat.send 请求
   * 3. 监听 chat 事件获取响应
   */
  private sendMessageViaWebSocket(
    port: number,
    token: string,
    message: string,
    _context?: OpenClawMessage[],
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      // OpenClaw gateway WebSocket 端点（不需要在 URL 中传递 token）
      const wsUrl = `ws://localhost:${port}`;

      this.logger.info('OpenClawClient: 建立 WebSocket 连接', {
        port,
        url: wsUrl,
      });

      // OpenClaw gateway 需要 Origin 和 User-Agent 头
      const ws = new WebSocket(wsUrl, {
        origin: `http://localhost:${port}`,
        headers: {
          'User-Agent': 'ClawbotManager/1.0',
        },
      });

      let responseText = '';
      let isResolved = false;
      let isConnected = false;
      let requestId = 0;
      let connectRequestId = '';
      let chatRequestId = '';

      const generateId = () => `req-${++requestId}-${randomUUID().slice(0, 8)}`;

      const timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          ws.close();
          reject(new Error('WebSocket 响应超时'));
        }
      }, this.wsTimeout);

      // 发送请求帧
      const sendRequest = (method: string, params: unknown) => {
        const frame = {
          type: 'req',
          id: generateId(),
          method,
          params,
        };
        this.logger.info('OpenClawClient: 发送请求', { method, id: frame.id });
        ws.send(JSON.stringify(frame));
        return frame.id;
      };

      ws.on('open', () => {
        this.logger.info('OpenClawClient: WebSocket 连接已建立', { port });

        // 第一步：发送 connect 请求进行认证
        connectRequestId = sendRequest('connect', {
          minProtocol: 3,
          maxProtocol: 3,
          client: {
            id: 'gateway-client',
            version: '1.0.0',
            platform: 'node',
            mode: 'backend',
          },
          auth: {
            token: token,
          },
        });
      });

      ws.on('message', (data: WebSocket.Data) => {
        try {
          const frame = JSON.parse(data.toString());
          this.logger.info('OpenClawClient: 收到消息', {
            type: frame.type,
            event: frame.event,
            ok: frame.ok,
            id: frame.id,
            payload: frame.payload
              ? JSON.stringify(frame.payload).substring(0, 500)
              : undefined,
          });

          // 处理 hello-ok 响应（connect 成功 - 旧协议）
          if (frame.type === 'hello-ok') {
            isConnected = true;
            this.logger.info('OpenClawClient: 认证成功 (hello-ok)', { port });

            // 第二步：发送聊天消息
            chatRequestId = sendRequest('chat.send', {
              sessionKey: 'main',
              message: message,
              idempotencyKey: randomUUID(),
            });
            return;
          }

          // 处理响应帧
          if (frame.type === 'res') {
            // connect 请求成功响应
            if (frame.id === connectRequestId && frame.ok && !isConnected) {
              isConnected = true;
              this.logger.info('OpenClawClient: 认证成功 (res)', { port });

              // 第二步：发送聊天消息
              chatRequestId = sendRequest('chat.send', {
                sessionKey: 'main',
                message: message,
                idempotencyKey: randomUUID(),
              });
              return;
            }

            // chat.send 请求成功响应
            if (frame.id === chatRequestId && frame.ok) {
              this.logger.info('OpenClawClient: chat.send 请求成功', { port });
              // 等待 chat 事件返回响应
              return;
            }

            // 错误响应
            if (!frame.ok && frame.error) {
              this.logger.error('OpenClawClient: 请求失败', {
                error: frame.error,
              });
              if (!isResolved) {
                isResolved = true;
                clearTimeout(timeoutId);
                ws.close();
                reject(
                  new Error(frame.error.message || 'Request failed'),
                );
              }
            }
            return;
          }

          // 处理事件帧（聊天响应）
          if (frame.type === 'event') {
            const { event, payload } = frame;

            // 处理 agent 事件（流式文本）
            // 格式: { stream: 'assistant', data: { text: '...' } }
            if (event === 'agent' && payload?.stream === 'assistant' && payload?.data?.text) {
              // 流式文本累积 - 但 agent 事件发送的是累积文本，不是增量
              // 所以我们只保存最新的完整文本
              responseText = payload.data.text;
              this.logger.debug('OpenClawClient: 收到 agent 流式文本', {
                textLength: responseText.length,
              });
              return;
            }

            // 处理 agent lifecycle 事件（结束信号）
            // 格式: { stream: 'lifecycle', data: { phase: 'end' } }
            if (event === 'agent' && payload?.stream === 'lifecycle' && payload?.data?.phase === 'end') {
              this.logger.info('OpenClawClient: agent 生命周期结束', {
                responseLength: responseText.length,
              });
              // 不在这里 resolve，等待 chat 事件的 final 状态
              return;
            }

            // 处理 chat 事件（最终结果）
            // 格式: { state: 'final', message: { role: 'assistant', content: [{ type: 'text', text: '...' }] } }
            if (event === 'chat') {
              const chatEvent = payload;
              this.logger.info('OpenClawClient: 处理 chat 事件', {
                state: chatEvent?.state,
                hasMessage: !!chatEvent?.message,
                currentResponseLength: responseText.length,
              });

              // 处理 final 状态 - 提取最终文本
              if (chatEvent?.state === 'final' && chatEvent?.message?.content) {
                const content = chatEvent.message.content;
                let finalText = '';
                for (const item of content) {
                  if (item.type === 'text' && item.text) {
                    finalText += item.text;
                  }
                }
                if (finalText) {
                  responseText = finalText;
                }
                this.logger.info('OpenClawClient: 聊天完成 (final)', {
                  finalResponseLength: responseText.length,
                  responsePreview: responseText.substring(0, 200),
                });
                if (!isResolved) {
                  isResolved = true;
                  clearTimeout(timeoutId);
                  ws.close();
                  resolve(responseText);
                }
                return;
              }

              // 兼容旧格式: payload.type === 'text' / 'result' / 'error'
              if (chatEvent?.type === 'text' && chatEvent?.text) {
                responseText += chatEvent.text;
                this.logger.debug('OpenClawClient: 累积响应文本 (旧格式)', {
                  addedLength: chatEvent.text.length,
                  totalLength: responseText.length,
                });
              } else if (chatEvent?.type === 'result') {
                this.logger.info('OpenClawClient: 聊天完成 (result)', {
                  finalResponseLength: responseText.length,
                  responsePreview: responseText.substring(0, 200),
                });
                if (!isResolved) {
                  isResolved = true;
                  clearTimeout(timeoutId);
                  ws.close();
                  resolve(responseText);
                }
              } else if (chatEvent?.type === 'error') {
                this.logger.error('OpenClawClient: 聊天错误', {
                  errorMessage: chatEvent.message,
                });
                if (!isResolved) {
                  isResolved = true;
                  clearTimeout(timeoutId);
                  ws.close();
                  reject(new Error(chatEvent.message || 'Chat error'));
                }
              }
            }
            return;
          }
        } catch (e) {
          this.logger.warn('OpenClawClient: 解析消息失败', {
            error: e instanceof Error ? e.message : 'Unknown error',
            data: data.toString().slice(0, 200),
          });
        }
      });

      ws.on('error', (error: Error) => {
        this.logger.error('OpenClawClient: WebSocket 错误', {
          port,
          error: error.message,
        });
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeoutId);
          reject(error);
        }
      });

      ws.on('close', (code: number, reason: Buffer) => {
        this.logger.debug('OpenClawClient: WebSocket 连接关闭', {
          port,
          code,
          reason: reason.toString(),
          isConnected,
        });

        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeoutId);

          // 如果有响应文本，返回它
          if (responseText) {
            resolve(responseText);
          } else if (code === 1008) {
            // 1008 = Policy Violation (unauthorized)
            reject(
              new Error(
                `WebSocket 认证失败: ${reason.toString() || 'gateway token missing'}`,
              ),
            );
          } else {
            reject(
              new Error(
                `WebSocket 连接意外关闭: code=${code}, reason=${reason.toString()}`,
              ),
            );
          }
        }
      });
    });
  }

  /**
   * 检查 OpenClaw Gateway 健康状态
   */
  async checkHealth(port: number): Promise<boolean> {
    const url = `http://localhost:${port}/health`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(url).pipe(
          timeout(5000),
          catchError(() => {
            return Promise.resolve({ status: 500 });
          }),
        ),
      );
      return response.status === 200;
    } catch {
      return false;
    }
  }
}
