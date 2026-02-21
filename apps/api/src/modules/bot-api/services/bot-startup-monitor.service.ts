/**
 * Bot Startup Monitor Service
 *
 * 职责：
 * - 监控容器日志以检测 Bot 启动完成
 * - 通过检测特定日志模式来确定 Bot 已完全启动
 * - 更新 Bot 状态并通过 SSE 推送给前端
 *
 * 启动完成的标志日志：
 * - [heartbeat] started
 * - [gateway] listening on ws://
 * - [browser/service] Browser control service ready
 */
import { Injectable, Inject, OnModuleDestroy } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { BotService } from '@app/db';
import { DockerService } from './docker.service';
import { BotSseService } from './bot-sse.service';

/**
 * 启动完成的日志模式
 * 匹配任意一个即表示启动完成
 */
const STARTUP_COMPLETE_PATTERNS = [
  /\[heartbeat\] started/i,
  /\[gateway\] listening on ws:\/\//i,
  /\[browser\/service\] Browser control service ready/i,
];

/**
 * 监控任务配置
 */
interface MonitorTask {
  botId: string;
  hostname: string;
  userId: string;
  containerId: string;
  startTime: number;
  intervalId: NodeJS.Timeout | null;
}

/**
 * 监控配置
 */
interface MonitorConfig {
  /** 日志轮询间隔（毫秒） */
  pollInterval: number;
  /** 超时时间（毫秒） */
  timeout: number;
  /** 最大重试次数 */
  maxRetries: number;
}

const DEFAULT_CONFIG: MonitorConfig = {
  pollInterval: 2000, // 2秒
  timeout: 120000, // 2分钟
  maxRetries: 3,
};

@Injectable()
export class BotStartupMonitorService implements OnModuleDestroy {
  private readonly config: MonitorConfig;
  private readonly activeMonitors: Map<string, MonitorTask> = new Map();

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly botService: BotService,
    private readonly dockerService: DockerService,
    private readonly botSseService: BotSseService,
  ) {
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * 开始监控 Bot 启动状态
   *
   * @param botId Bot ID
   * @param hostname Bot 主机名
   * @param userId 用户 ID
   * @param containerId 容器 ID
   */
  startMonitoring(
    botId: string,
    hostname: string,
    userId: string,
    containerId: string,
  ): void {
    // 如果已有监控任务，先停止
    if (this.activeMonitors.has(botId)) {
      this.stopMonitoring(botId);
    }

    this.logger.info('Starting bot startup monitor', {
      botId,
      hostname,
      containerId,
    });

    const task: MonitorTask = {
      botId,
      hostname,
      userId,
      containerId,
      startTime: Date.now(),
      intervalId: null,
    };

    // 设置轮询检查
    task.intervalId = setInterval(() => {
      this.checkStartupStatus(task);
    }, this.config.pollInterval);

    this.activeMonitors.set(botId, task);

    // 设置超时
    setTimeout(() => {
      if (this.activeMonitors.has(botId)) {
        this.handleTimeout(botId);
      }
    }, this.config.timeout);
  }

  /**
   * 停止监控
   */
  stopMonitoring(botId: string): void {
    const task = this.activeMonitors.get(botId);
    if (task) {
      if (task.intervalId) {
        clearInterval(task.intervalId);
      }
      this.activeMonitors.delete(botId);
      this.logger.debug('Stopped bot startup monitor', { botId });
    }
  }

  /**
   * 检查启动状态
   */
  private async checkStartupStatus(task: MonitorTask): Promise<void> {
    try {
      // 获取容器日志（只获取最近的日志）
      const logs = await this.dockerService.getContainerLogs(task.containerId, {
        tail: 50,
        since: Math.floor(task.startTime / 1000), // 只获取启动后的日志
      });

      // 检查是否包含启动完成的模式
      const isReady = this.checkStartupPatterns(logs);

      if (isReady) {
        this.logger.info('Bot startup detected as complete', {
          botId: task.botId,
          hostname: task.hostname,
        });

        // 更新状态为 running
        await this.botService.update(
          { id: task.botId },
          { status: 'running' },
        );

        // 通过 SSE 推送状态变化
        this.botSseService.sendToUser(task.userId, 'bot_status_changed', {
          botId: task.botId,
          hostname: task.hostname,
          status: 'running',
          message: 'Bot started successfully',
          timestamp: new Date().toISOString(),
        });

        // 停止监控
        this.stopMonitoring(task.botId);
      }
    } catch (error) {
      this.logger.warn('Failed to check bot startup status', {
        botId: task.botId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * 检查日志是否包含启动完成的模式
   */
  private checkStartupPatterns(logs: string): boolean {
    for (const pattern of STARTUP_COMPLETE_PATTERNS) {
      if (pattern.test(logs)) {
        this.logger.debug('Found startup pattern in logs', { pattern: pattern.source });
        return true;
      }
    }
    return false;
  }

  /**
   * 处理超时
   */
  private async handleTimeout(botId: string): Promise<void> {
    const task = this.activeMonitors.get(botId);
    if (!task) return;

    this.logger.warn('Bot startup monitoring timed out', {
      botId,
      hostname: task.hostname,
      elapsedMs: Date.now() - task.startTime,
    });

    // 更新状态为 running（即使没有检测到日志，超时后也认为启动完成）
    // 这样可以避免永久卡在 starting 状态
    try {
      await this.botService.update({ id: botId }, { status: 'running' });

      // 通过 SSE 推送状态变化
      this.botSseService.sendToUser(task.userId, 'bot_status_changed', {
        botId,
        hostname: task.hostname,
        status: 'running',
        message: 'Bot started (timeout - assumed ready)',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Failed to update bot status after timeout', {
        botId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // 停止监控
    this.stopMonitoring(botId);
  }

  /**
   * 检查是否有活跃的监控任务
   */
  hasActiveMonitor(botId: string): boolean {
    return this.activeMonitors.has(botId);
  }

  /**
   * 获取活跃监控任务数量
   */
  getActiveMonitorCount(): number {
    return this.activeMonitors.size;
  }

  /**
   * 模块销毁时清理所有监控任务
   */
  onModuleDestroy(): void {
    for (const [botId, task] of this.activeMonitors) {
      if (task.intervalId) {
        clearInterval(task.intervalId);
      }
      this.logger.debug('Cleaned up monitor on module destroy', { botId });
    }
    this.activeMonitors.clear();
  }
}
