import { Req, Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { SimpleAuth } from '@app/auth';
import { messageContract, API_VERSION } from '@repo/contracts';
import { success } from '@/common/ts-rest';
import { MessageApiService } from './message-api.service';
import type { FastifyRequest } from 'fastify';

/**
 * Message API Controller
 * 消息 API 控制器
 */
@Controller({ version: API_VERSION.V1 })
export class MessageApiController {
  constructor(private readonly messageApiService: MessageApiService) {}

  /**
   * GET /api/message/messages
   * Get user messages
   */
  @SimpleAuth()
  @TsRestHandler(messageContract.list)
  async list(@Req() req: FastifyRequest): Promise<any> {
    return tsRestHandler(messageContract.list, async ({ query }) => {
      const userId = (req as any).userId as string;
      const result = await this.messageApiService.list(userId, query);
      return success(result);
    });
  }

  /**
   * PATCH /api/message/messages/read
   * Mark messages as read
   */
  @SimpleAuth()
  @TsRestHandler(messageContract.setRead)
  async setRead(@Req() req: FastifyRequest): Promise<any> {
    return tsRestHandler(messageContract.setRead, async ({ body }) => {
      const userId = (req as any).userId as string;
      await this.messageApiService.setRead(userId, body);
      return success(null);
    });
  }

  /**
   * PATCH /api/message/messages/read/all
   * Mark all messages as read
   */
  @SimpleAuth()
  @TsRestHandler(messageContract.markAllAsRead)
  async markAllAsRead(@Req() req: FastifyRequest): Promise<any> {
    return tsRestHandler(messageContract.markAllAsRead, async () => {
      const userId = (req as any).userId as string;
      const count = await this.messageApiService.markAllAsRead(userId);
      return success({ count });
    });
  }

  /**
   * GET /api/message/messages/unread/count
   * Get unread message count
   */
  @SimpleAuth()
  @TsRestHandler(messageContract.getUnreadCount)
  async getUnreadCount(@Req() req: FastifyRequest): Promise<any> {
    return tsRestHandler(messageContract.getUnreadCount, async () => {
      const userId = (req as any).userId as string;
      const result = await this.messageApiService.getUnreadCount(userId);
      return success(result);
    });
  }
}
