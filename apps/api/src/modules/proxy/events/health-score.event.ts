/**
 * 健康评分更新事件
 * 用于异步更新 Provider 的健康评分，避免阻塞请求处理
 */
export class HealthScoreUpdateEvent {
  constructor(
    public readonly providerKeyId: string,
    public readonly model: string,
    public readonly success: boolean,
  ) {}
}

/**
 * 事件名称常量
 */
export const HEALTH_SCORE_EVENTS = {
  UPDATE: 'health-score.update',
} as const;
