import {
  Controller,
  Get,
  MessageEvent,
  Req,
  Sse,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { SseAuth, AuthenticatedRequest } from '@app/auth';
import { BotSseService } from '../bot-api/services/bot-sse.service';
import type { Observable } from 'rxjs';

/**
 * SSE API 控制器
 *
 * 集中管理所有 Server-Sent Events 端点
 *
 * 重要说明：
 * - 所有 SSE 端点必须使用 @SseAuth() 装饰器
 * - @SseAuth() 会从 query 参数 access_token 获取 JWT token
 * - 这是因为浏览器 EventSource API 不支持自定义 headers
 *
 * 使用示例（前端）：
 * ```typescript
 * const sseUrl = new URL('/api/sse/bot/status-stream');
 * sseUrl.searchParams.set('access_token', token);
 * const eventSource = new EventSource(sseUrl.toString());
 * ```
 */
@Controller({
  path: 'sse',
  version: VERSION_NEUTRAL,
})
@SseAuth() // 类级别使用 SseAuth，所有端点都从 query 获取 token
export class SseApiController {
  constructor(private readonly botSseService: BotSseService) {}

  /**
   * Bot 状态实时推送
   *
   * 客户端连接后会收到：
   * - connected: 连接成功消息
   * - bot-status: Bot 运行状态变更（running, stopped, error, starting, created）
   * - bot-health: Bot 健康状态变更（HEALTHY, UNHEALTHY, UNKNOWN）
   * - heartbeat: 心跳消息（保持连接活跃）
   *
   * @example
   * GET /api/sse/bot/status-stream?access_token=xxx
   */
  @Get('bot/status-stream')
  @Sse()
  botStatusStream(@Req() req: AuthenticatedRequest): Observable<MessageEvent> {
    const userId = req.userId;
    return this.botSseService.getUserStream(userId);
  }

  // 未来可以在这里添加更多 SSE 端点，例如：
  // - 消息实时推送
  // - 通知实时推送
  // - 任务进度实时推送
}
