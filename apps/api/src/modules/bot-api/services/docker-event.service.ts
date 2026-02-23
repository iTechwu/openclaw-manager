import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  forwardRef,
} from '@nestjs/common';
import Docker from 'dockerode';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { BotService } from '@app/db';
import { BotSseService } from './bot-sse.service';
import { BotStartupMonitorService } from './bot-startup-monitor.service';
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
  private buffer = ''; // Buffer for incomplete JSON lines

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly botService: BotService,
    private readonly sseService: BotSseService,
    @Inject(forwardRef(() => BotStartupMonitorService))
    private readonly startupMonitor: BotStartupMonitorService,
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
        // Docker events are newline-delimited JSON (NDJSON)
        // Buffer the data and process complete lines
        this.buffer += chunk.toString();
        const lines = this.buffer.split('\n');

        // Keep the last incomplete line in the buffer
        this.buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          try {
            const event: DockerEvent = JSON.parse(trimmedLine);
            this.handleContainerEvent(event);
          } catch (error) {
            this.logger.error('Failed to parse Docker event', {
              error,
              line: trimmedLine.slice(0, 200),
            });
          }
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

    // Clear the buffer
    this.buffer = '';

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

    this.logger.info('Container event received', {
      hostname,
      action: event.Action,
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

      // 检查是否有活跃的启动监控
      const hasActiveMonitor = this.startupMonitor.hasActiveMonitor(bot.id);

      // 计算新状态，考虑当前 Bot 状态和启动监控状态
      const newStatus = this.mapEventToStatus(
        event.Action,
        bot.status,
        hasActiveMonitor,
      );

      // 如果返回 null，表示不需要更新状态
      if (newStatus === null) {
        this.logger.debug('Skipping status update', {
          hostname: bot.hostname,
          action: event.Action,
          currentStatus: bot.status,
          hasActiveMonitor,
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
   *
   * @param action Docker 事件动作
   * @param currentStatus Bot 当前状态
   * @param hasActiveMonitor 是否有活跃的启动监控（表示正在启动/重启中）
   * @returns 新状态，如果返回 null 表示不需要更新
   */
  private mapEventToStatus(
    action: string,
    currentStatus: BotStatus,
    hasActiveMonitor: boolean,
  ): string | null {
    switch (action) {
      case 'start':
        // 容器启动，但不立即设置为 running
        // 由 BotStartupMonitorService 检测到真正启动完成后再更新
        // 只有当前不是 starting 状态时才更新（避免覆盖正在启动的状态）
        if (currentStatus === 'starting' || hasActiveMonitor) {
          return null; // 保持 starting 状态，让监控服务来更新
        }
        return 'running';

      case 'restart':
        return 'starting';

      case 'stop':
        // 如果当前正在启动中或有活跃监控，不要因为 stop 事件改变状态
        // 这可能是重启过程中的正常行为
        if (currentStatus === 'starting' || hasActiveMonitor) {
          return null;
        }
        return 'stopped';

      case 'die':
      case 'kill':
        // 如果有活跃的启动监控，说明这是重启过程（旧容器被销毁）
        // 不应该标记为 error
        if (hasActiveMonitor) {
          return null;
        }
        // 如果当前正在启动中，说明这是重启过程
        if (currentStatus === 'starting') {
          return null;
        }
        // 只有当 Bot 当前是 running 状态且容器意外退出时，才标记为 error
        // 如果 Bot 已经是 stopped 状态，保持 stopped
        if (currentStatus === 'stopped') {
          return null;
        }
        return 'error';

      case 'oom':
        // OOM 是严重错误，始终标记为 error
        return 'error';

      default:
        return null;
    }
  }
}
