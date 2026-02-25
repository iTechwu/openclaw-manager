import { RedisService } from '@app/redis';
import objectUtil from '@/utils/object.util';
import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import {
  interval,
  Observable,
  Subject,
  map,
  merge,
  catchError,
  of,
  switchMap,
} from 'rxjs';
import type { MeetingSSEEvent } from '@repo/contracts/schemas/sse.schema';

@Injectable()
export class SseClient {
  private clients: Set<{ id: string; stream: Subject<any> }> = new Set();
  private sseChannelKey = 'sseChannel';

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  async publish(
    clientId: string,
    data: any,
    needDeleteClient: boolean = false,
  ) {
    // 检查 Redis 连接状态，避免在连接关闭时调用
    if (!this.redis.redis || this.redis.redis.status !== 'ready') {
      // Redis 连接不可用，静默失败（在服务重启时这是正常的）
      return;
    }

    try {
      const sseChannelData =
        (await this.redis.getData(this.sseChannelKey, `new-${clientId}`)) || {};
      await this.redis.saveData(this.sseChannelKey, `new-${clientId}`, {
        data,
        needDeleteClient,
      });
      await this.redis.saveData(
        this.sseChannelKey,
        `old-${clientId}`,
        sseChannelData,
      );
      // if (!objectUtil.isEqual(sseChannelData, { data, needDeleteClient })) {

      // }
    } catch (error) {
      // 如果 Redis 连接失败，静默失败，不影响业务逻辑
      // 在服务重启时，Redis 连接可能正在关闭，这是正常现象
    }
  }

  async subscribe(clientId: string) {
    // 检查 Redis 连接状态，避免在连接关闭时调用
    if (!this.redis.redis || this.redis.redis.status !== 'ready') {
      // Redis 连接不可用，返回 ping 消息保持连接活跃
      return {
        t: 'p',
        data: { timestamp: new Date().toISOString() },
        needDeleteClient: false,
      };
    }

    try {
      // this.subscriber.subscribe(this.sseChannel)
      // this.subscriber.on('message', (ch, message) => {
      //     if (ch === this.sseChannel) {
      //         callback(JSON.parse(message))
      //     }
      // })
      const newMessage = await this.redis.getData(
        this.sseChannelKey,
        `new-${clientId}`,
      );
      const oldMessage = await this.redis.getData(
        this.sseChannelKey,
        `old-${clientId}`,
      );
      // console.log('techwu subscribe', oldMessage, newMessage)
      if (objectUtil.isEqual(newMessage, oldMessage)) {
        // console.log('techwu ping')
        return {
          t: 'p',
          data: { timestamp: new Date().toISOString() },
          needDeleteClient: false,
        };
      } else {
        // console.log('techwu message')
        await this.redis.saveData(
          this.sseChannelKey,
          `old-${clientId}`,
          newMessage,
        );
        return {
          t: 'm',
          data: newMessage?.data,
          needDeleteClient: newMessage?.needDeleteClient,
        };
      }
    } catch (error) {
      // 如果 Redis 连接失败，返回 ping 消息，保持连接活跃
      // 在服务重启时，Redis 连接可能正在关闭，这是正常现象
      return {
        t: 'p',
        data: { timestamp: new Date().toISOString() },
        needDeleteClient: false,
      };
    }
  }

  // 注册新的客户端
  registerClient(id: string): Subject<any> {
    const stream = new Subject<any>();
    this.clients.add({ id, stream });
    return stream;
  }

  // 注销客户端
  unregisterClient(id: string): void {
    this.clients.forEach((client) => {
      if (client.id === id) {
        client.stream.complete(); // 结束客户端的流
        this.clients.delete(client);
      }
    });
  }

  // 检查客户端是否已注册
  private isClientRegistered(clientId: string): boolean {
    return Array.from(this.clients).some((client) => client.id === clientId);
  }

  // 广播消息给所有客户端
  broadcast(data: any): void {
    this.clients.forEach((client) => client.stream.next(data));
  }

  // 定向发送消息给特定客户端
  sendToClient(clientId: string, data: any, unregister: boolean = false): void {
    this.logger.debug('SSE sendToClient', { clientId, dataType: typeof data });
    this.clients.forEach((client) => {
      if (client.id === clientId) {
        client.stream.next(data);
      }
    });
    if (unregister) {
      this.unregisterClient(clientId);
    }
  }

  initSse(
    clientId: string,
    callback: () => void | Promise<void>,
    needIntervalCallback: boolean = false,
  ): Observable<any> {
    const clientStream = this.registerClient(clientId);
    return new Observable((observer) => {
      // 初始回调（只执行一次）
      try {
        const result = callback();
        if (result instanceof Promise) {
          result.catch((err) => {
            // 静默处理初始回调错误，避免影响 SSE 连接建立
            console.error(
              `[SseClient] Initial callback error for ${clientId}:`,
              err,
            );
          });
        }
      } catch (err) {
        // 静默处理同步回调错误
        console.error(
          `[SseClient] Initial callback sync error for ${clientId}:`,
          err,
        );
      }

      // 心跳流：每 2 秒执行一次
      const heartbeat$ = interval(2000).pipe(
        switchMap(async () => {
          // 检查客户端是否仍然注册
          if (!this.isClientRegistered(clientId)) {
            // 客户端已注销，返回空数据，Observable 会自动完成
            return null;
          }

          // 如果需要定期回调，执行回调函数
          if (needIntervalCallback) {
            try {
              const result = callback();
              if (result instanceof Promise) {
                await result;
              }
            } catch (err) {
              // 回调错误不影响心跳流，记录日志并继续
              console.error(`[SseClient] Callback error for ${clientId}:`, err);
              // 如果错误是数据库连接池相关，可能是连接已关闭，不继续执行
              if (err instanceof Error && err.message.includes('pool')) {
                // 数据库连接池已关闭，停止心跳
                return null;
              }
            }
          }

          // 订阅 Redis 消息
          try {
            const data = await this.subscribe(clientId);
            return data;
          } catch (err) {
            // 订阅错误不影响心跳流，返回 ping 消息
            console.error(`[SseClient] Subscribe error for ${clientId}:`, err);
            return {
              t: 'p',
              data: { timestamp: new Date().toISOString() },
              needDeleteClient: false,
            };
          }
        }),
        // 捕获所有错误，避免 Observable 链中断
        catchError((err) => {
          console.error(`[SseClient] Heartbeat error for ${clientId}:`, err);
          // 返回 ping 消息，保持连接活跃
          return of({
            t: 'p',
            data: { timestamp: new Date().toISOString() },
            needDeleteClient: false,
          });
        }),
        // 过滤掉 null 值（客户端已注销时）
        map((data) => {
          if (data === null) {
            // 返回一个特殊标记，表示应该停止
            return {
              t: 'stop',
              data: null,
              needDeleteClient: true,
            };
          }
          return data;
        }),
      );

      // 合并心跳和业务数据流
      const subscription = merge(
        clientStream.pipe(
          map((data) => ({ t: 'm', data, needDeleteClient: false })),
        ),
        heartbeat$,
      ).subscribe({
        next: async (eventData) => {
          // 如果收到停止信号，完成 Observable
          if (eventData?.t === 'stop') {
            observer.complete();
            this.unregisterClient(clientId);
            return;
          }

          const message: {
            t: string;
            data: any;
            needDeleteClient: boolean;
          } = await eventData;
          const { t, data, needDeleteClient } = message;
          const ret = observer.next({ t, data });
          if (needDeleteClient) {
            observer.complete();
            this.unregisterClient(clientId);
          }
          return ret;
        },
        error: (err) => {
          console.error(`[SseClient] Observable error for ${clientId}:`, err);
          observer.error(err);
        },
        complete: () => {
          observer.complete();
          this.unregisterClient(clientId);
        },
      });
      // 清理函数
      return () => {
        subscription.unsubscribe();
        this.unregisterClient(clientId);
      };
    });
  }

  /**
   * 推送会议相关 SSE 事件（统一入口）
   *
   * @description P1 优化：统一的会议相关 SSE 事件推送方法
   * 用于转写、摘要生成、知识提取等会议相关任务的实时状态推送
   *
   * @param meetingId - 会议 ID
   * @param type - 事件类型
   * @param status - 任务状态
   * @param data - 事件数据（可选）
   * @param error - 错误信息（可选，仅在 status='error' 时存在）
   * @param taskId - 任务 ID（可选，用于关联 Python Task）
   * @param progress - 进度（0-100，可选）
   * @param currentStep - 当前步骤描述（可选）
   * @param needDeleteClient - 是否在推送后删除客户端连接（默认 false）
   *
   * @example
   * ```typescript
   * // 推送转写完成事件
   * await sseClient.publishMeetingEvent(
   *   'meeting-uuid',
   *   'transcription',
   *   'success',
   *   { transcript: '...', utterances: [...] },
   * );
   *
   * // 推送摘要生成进度事件
   * await sseClient.publishMeetingEvent(
   *   'meeting-uuid',
   *   'summary',
   *   'processing',
   *   undefined,
   *   undefined,
   *   'task-uuid',
   *   50,
   *   '正在生成摘要...',
   * );
   * ```
   */
  async publishMeetingEvent(
    meetingId: string,
    type: 'transcription' | 'summary',
    status: 'processing' | 'success' | 'error',
    data?: any,
    error?: string,
    taskId?: string,
    progress?: number,
    currentStep?: string,
    needDeleteClient: boolean = false,
  ): Promise<void> {
    const clientId = `meeting-${type}-${meetingId}${taskId ? `-${taskId}` : ''}`;

    const event: MeetingSSEEvent = {
      type,
      meetingId,
      status,
      data,
      error,
      timestamp: Date.now(),
      taskId,
      progress,
      currentStep,
    };

    await this.publish(clientId, event, needDeleteClient);
  }
}
