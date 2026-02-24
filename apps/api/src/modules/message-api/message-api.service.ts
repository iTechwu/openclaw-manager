import { Injectable } from '@nestjs/common';
import { MessageService } from '@app/db';
import type {
  MessageListQuery,
  MessageListResponse,
  SetMessageReadRequest,
  UnreadCountResponse,
} from '@repo/contracts';

/**
 * Message API Service
 * 消息 API 服务层
 */
@Injectable()
export class MessageApiService {
  constructor(private readonly messageDb: MessageService) {}

  /**
   * Get user messages with pagination
   * 获取用户消息列表
   */
  async list(
    userId: string,
    query: MessageListQuery,
  ): Promise<MessageListResponse> {
    const { limit = 20, page = 1, read } = query;
    const offset = (page - 1) * limit;

    const isRead =
      read === 'true' ? true : read === 'false' ? false : undefined;

    const { list, total } = await this.messageDb.getUserMessages(userId, {
      isRead,
      limit,
      offset,
    });

    return {
      list: list.map((item) => ({
        id: item.id,
        createdAt: item.createdAt,
        isRead: item.isRead,
        readAt: item.readAt,
        message: {
          id: item.message.id,
          type: item.message.type,
          content: item.message.content,
        },
        receiver: {
          id: item.user.id,
          nickname: item.user.nickname,
          headerImg: item.user.avatarFileId,
        },
      })),
      total,
      page,
      limit,
    };
  }

  /**
   * Mark messages as read
   * 标记消息为已读
   */
  async setRead(userId: string, data: SetMessageReadRequest): Promise<void> {
    await this.messageDb.markAsRead(userId, data.messageIds);
  }

  /**
   * Mark all messages as read
   * 标记所有消息为已读
   */
  async markAllAsRead(userId: string): Promise<number> {
    return this.messageDb.markAllAsRead(userId);
  }

  /**
   * Get unread message count
   * 获取未读消息数量
   */
  async getUnreadCount(userId: string): Promise<UnreadCountResponse> {
    const total = await this.messageDb.getUnreadCount(userId);
    return { total };
  }
}
