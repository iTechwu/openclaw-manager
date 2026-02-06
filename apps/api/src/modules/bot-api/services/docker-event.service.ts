import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import Docker from 'dockerode';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { BotService } from '@app/db';
import { BotSseService } from './bot-sse.service';
import type { BotStatus } from '@prisma/client';

/**
 * Docker 事件结构
 */
interface DockerEvent {
  Type: string;
  Action: string;
  Actor: {
    ID: string;
    Attributes: Record<string, string>;
  };
  time: number;
  timeNano: number;
}

/**
 * Docker 事件监听服务
 * 监听 Docker 容器事件，实时更新 Bot 状态
 */
@Injectable()
export class DockerEventService implements OnModuleInit, OnModuleDestroy {
  private docker: Docker;
  private eventStream: NodeJS.ReadableStream | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly botService: BotService,
    private readonly sseService: BotSseService,
  ) {
    this.docker = new Docker();
  }

  async onModuleInit() {
    // 延迟启动，确保其他服务已初始化
    setTimeout(() => {
      this.startEventListener();
    }, 2000);
  }

  async onModuleDestroy() {
    this.isShuttingDown = true;
    this.stopEventListener();
  }

  /**
   * 启动 Docker 事件监听
   */
  private async startEventListener() {
    if (this.isShuttingDown) return;

    try {
      // 检查 Docker 是否可用
      await this.docker.ping();

      this.eventStream = await this.docker.getEvents({
        filters: {
          type: ['container'],
          event: ['start', 'stop', 'die', 'kill', 'oom', 'restart'],
          label: ['clawbot-manager.managed=true'],
        },
      });

      this.eventStream.on('data', (chunk: Buffer) => {
        try {
          const event: DockerEvent = JSON.parse(chunk.toString());
          this.handleContainerEvent(event);
        } catch (error) {
          this.logger.error('Failed to parse Docker event', { error });
        }
      });

      this.eventStream.on('error', (error: Error) => {
        this.logger.error('Docker event stream error', {
          error: error.message,
        });
        this.scheduleReconnect();
      });

      this.eventStream.on('end', () => {
        this.logger.warn('Docker event stream ended');
        this.scheduleReconnect();
      });

      this.logger.info('Docker event listener started successfully');
    } catch (error) {
      this.logger.error('Failed to start Docker event listener', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.scheduleReconnect();
    }
  }

  /**
   * 停止事件监听
   */
  private stopEventListener() {
    if (this.eventStream) {
      try {
        // Use removeAllListeners and unpipe to stop the stream
        this.eventStream.removeAllListeners();
        if (
          'destroy' in this.eventStream &&
          typeof (this.eventStream as any).destroy === 'function'
        ) {
          (this.eventStream as any).destroy();
        }
      } catch {
        // 忽略销毁错误
      }
      this.eventStream = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * 安排重连
   */
  private scheduleReconnect() {
    if (this.isShuttingDown || this.reconnectTimer) return;

    this.stopEventListener();

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.startEventListener();
    }, 5000);

    this.logger.info('Scheduled Docker event listener reconnect in 5 seconds');
  }

  /**
   * 处理容器事件
   */
  private async handleContainerEvent(event: DockerEvent) {
    const containerId = event.Actor.ID;
    const hostname = event.Actor.Attributes['clawbot-manager.hostname'];

    if (!containerId) {
      return;
    }

    const newStatus = this.mapEventToStatus(event.Action);

    this.logger.info('Container event received', {
      hostname,
      action: event.Action,
      newStatus,
      containerId: containerId.slice(0, 12),
    });

    try {
      // 根据 containerId 查找并更新 Bot 状态
      const bot = await this.botService.get({ containerId });

      if (!bot) {
        this.logger.debug('Bot not found for container', {
          containerId: containerId.slice(0, 12),
        });
        return;
      }

      // 只有状态真正变化时才更新
      if (bot.status !== newStatus) {
        await this.botService.update(
          { id: bot.id },
          { status: newStatus as BotStatus },
        );

        this.logger.info('Bot status updated', {
          hostname: bot.hostname,
          oldStatus: bot.status,
          newStatus,
        });

        // 推送 SSE 事件给该用户
        this.sseService.sendToUser(bot.createdById, 'bot-status', {
          hostname: bot.hostname,
          status: newStatus,
          previousStatus: bot.status,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      this.logger.error('Failed to handle container event', {
        containerId: containerId.slice(0, 12),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 将 Docker 事件映射到 Bot 状态
   */
  private mapEventToStatus(action: string): string {
    switch (action) {
      case 'start':
      case 'restart':
        return 'running';
      case 'stop':
        return 'stopped';
      case 'die':
      case 'kill':
      case 'oom':
        return 'error';
      default:
        return 'stopped';
    }
  }
}
