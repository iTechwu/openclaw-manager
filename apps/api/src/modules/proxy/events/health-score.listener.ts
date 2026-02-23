import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { ModelResolverService } from '../services/model-resolver.service';
import {
  HealthScoreUpdateEvent,
  HEALTH_SCORE_EVENTS,
} from './health-score.event';

/**
 * HealthScoreListener - 健康评分事件监听器
 *
 * 监听健康评分更新事件，异步更新数据库中的健康评分。
 * 这样可以避免在请求处理线程中阻塞。
 */
@Injectable()
export class HealthScoreListener {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly modelResolverService: ModelResolverService,
  ) {}

  @OnEvent(HEALTH_SCORE_EVENTS.UPDATE)
  async handleHealthScoreUpdate(event: HealthScoreUpdateEvent): Promise<void> {
    try {
      await this.modelResolverService.updateHealthScore(
        event.providerKeyId,
        event.model,
        event.success,
      );

      this.logger.debug(
        `[HealthScoreListener] Updated health score for ${event.model}@${event.providerKeyId.substring(0, 8)}...: ${event.success ? 'success' : 'failure'}`,
      );
    } catch (error) {
      this.logger.error(
        `[HealthScoreListener] Failed to update health score for ${event.model}@${event.providerKeyId.substring(0, 8)}...`,
        { error },
      );
    }
  }
}
