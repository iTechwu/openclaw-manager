import { Injectable, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HttpService } from '@nestjs/axios';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { BotService } from '@app/db';
import { BotSseService } from './bot-sse.service';
import { firstValueFrom, timeout, catchError, of } from 'rxjs';
import type { HealthStatus } from '@prisma/client';

/**
 * 健康检查配置
 */
const HEALTH_CHECK_CONFIG = {
  /** 健康检查超时时间（毫秒） */
  TIMEOUT_MS: 5000,
  /** 启动状态超时时间（毫秒） */
  STARTING_TIMEOUT_MS: 120000, // 2 分钟
  /** 连续失败次数阈值 */
  FAILURE_THRESHOLD: 3,
};

/**
 * Bot 健康检查服务
 * 定期检查运行中的 Bot 健康状态
 */
@Injectable()
export class HealthCheckService {
  /** 记录连续失败次数 */
  private failureCountMap = new Map<string, number>();

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly botService: BotService,
    private readonly httpService: HttpService,
    private readonly sseService: BotSseService,
  ) {}

  /**
   * 定期健康检查（每 30 秒）
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async checkAllBots() {
    try {
      const { list: runningBots } = await this.botService.list(
        { status: 'running' },
        { limit: 1000 },
      );

      this.logger.debug(
        `Health check: checking ${runningBots.length} running bots`,
      );

      for (const bot of runningBots) {
        if (!bot.port) continue;

        const isHealthy = await this.checkBotHealth(bot.port);
        await this.updateHealthStatus(
          bot.id,
          bot.hostname,
          bot.createdById,
          isHealthy,
        );
      }
    } catch (error) {
      this.logger.error('Health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 处理卡住的启动状态（每分钟）
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleStuckStates() {
    try {
      const { list: startingBots } = await this.botService.list(
        { status: 'starting' },
        { limit: 100 },
      );

      const now = Date.now();

      for (const bot of startingBots) {
        const startTime = bot.updatedAt.getTime();
        const elapsed = now - startTime;

        if (elapsed > HEALTH_CHECK_CONFIG.STARTING_TIMEOUT_MS) {
          this.logger.warn('Bot stuck in starting state, marking as error', {
            hostname: bot.hostname,
            elapsedMs: elapsed,
          });

          await this.botService.update(
            { id: bot.id },
            {
              status: 'error',
              healthStatus: 'UNHEALTHY' as HealthStatus,
            },
          );

          // 推送状态变更
          this.sseService.sendToUser(bot.createdById, 'bot-status', {
            hostname: bot.hostname,
            status: 'error',
            previousStatus: 'starting',
            reason: 'startup_timeout',
            timestamp: new Date().toISOString(),
          });
        }
      }
    } catch (error) {
      this.logger.error('Stuck state handler failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 检查单个 Bot 的健康状态
   */
  private async checkBotHealth(port: number): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`http://localhost:${port}/health`).pipe(
          timeout(HEALTH_CHECK_CONFIG.TIMEOUT_MS),
          catchError(() => of({ status: 500, data: null })),
        ),
      );
      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * 更新 Bot 健康状态
   */
  private async updateHealthStatus(
    botId: string,
    hostname: string,
    userId: string,
    isHealthy: boolean,
  ): Promise<void> {
    const currentFailures = this.failureCountMap.get(botId) || 0;

    if (isHealthy) {
      // 健康：重置失败计数
      this.failureCountMap.delete(botId);

      const bot = await this.botService.getById(botId);
      if (bot && bot.healthStatus !== 'HEALTHY') {
        await this.botService.update(
          { id: botId },
          {
            healthStatus: 'HEALTHY' as HealthStatus,
            lastHealthCheck: new Date(),
          },
        );

        this.logger.info('Bot health restored', { hostname });

        // 推送健康恢复事件
        this.sseService.sendToUser(userId, 'bot-health', {
          hostname,
          healthStatus: 'HEALTHY',
          timestamp: new Date().toISOString(),
        });
      } else if (bot) {
        // 只更新检查时间
        await this.botService.update(
          { id: botId },
          { lastHealthCheck: new Date() },
        );
      }
    } else {
      // 不健康：增加失败计数
      const newFailures = currentFailures + 1;
      this.failureCountMap.set(botId, newFailures);

      // 只有连续失败超过阈值才标记为不健康
      if (newFailures >= HEALTH_CHECK_CONFIG.FAILURE_THRESHOLD) {
        const bot = await this.botService.getById(botId);
        if (bot && bot.healthStatus !== 'UNHEALTHY') {
          await this.botService.update(
            { id: botId },
            {
              healthStatus: 'UNHEALTHY' as HealthStatus,
              lastHealthCheck: new Date(),
            },
          );

          this.logger.warn('Bot health check failed', {
            hostname,
            consecutiveFailures: newFailures,
          });

          // 推送健康异常事件
          this.sseService.sendToUser(userId, 'bot-health', {
            hostname,
            healthStatus: 'UNHEALTHY',
            consecutiveFailures: newFailures,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }
  }

  /**
   * 手动触发单个 Bot 的健康检查
   */
  async checkSingleBot(botId: string): Promise<{
    healthy: boolean;
    healthStatus: string;
  }> {
    const bot = await this.botService.getById(botId);
    if (!bot || !bot.port) {
      return { healthy: false, healthStatus: 'UNKNOWN' };
    }

    const isHealthy = await this.checkBotHealth(bot.port);
    await this.updateHealthStatus(
      bot.id,
      bot.hostname,
      bot.createdById,
      isHealthy,
    );

    return {
      healthy: isHealthy,
      healthStatus: isHealthy ? 'HEALTHY' : 'UNHEALTHY',
    };
  }
}
