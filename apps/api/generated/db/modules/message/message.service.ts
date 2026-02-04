import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/prisma';
import { TransactionalServiceBase } from '@app/shared-db';
import { HandlePrismaError, DbOperationType } from '@/utils/prisma-error.util';
import type { Prisma, Message, MessageRecipient } from '@prisma/client';

/**
 * Message DB Service
 * 消息数据库服务层
 *
 * 职责：
 * - 消息的CRUD操作
 * - 消息接收记录管理
 * - 未读消息统计
 * - 批量操作支持
 */
@Injectable()
export class MessageService extends TransactionalServiceBase {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  /**
   * Create a new message with recipients
   * 创建新消息并指定接收者
   */
  @HandlePrismaError(DbOperationType.CREATE)
  async createMessage(
    data: Prisma.MessageCreateInput,
    recipientIds: string[],
  ): Promise<Message> {
    return this.getWriteClient().message.create({
      data: {
        ...data,
        recipients: {
          create: recipientIds.map((userId) => ({
            userId,
            isRead: false,
          })),
        },
      },
      include: {
        recipients: true,
        sender: {
          select: {
            id: true,
            nickname: true,
            avatarFileId: true,
          },
        },
      },
    });
  }

  /**
   * Create a system message for specific users
   * 创建系统消息
   */
  @HandlePrismaError(DbOperationType.CREATE)
  async createSystemMessage(
    title: string | null,
    content: any,
    recipientIds: string[],
    metadata?: any,
  ): Promise<Message> {
    return this.createMessage(
      {
        type: 'SYSTEM',
        title,
        content,
        metadata,
      },
      recipientIds,
    );
  }

  /**
   * Create a milestone notification message
   * 创建里程碑通知消息
   */
  @HandlePrismaError(DbOperationType.CREATE)
  async createMilestoneMessage(
    userId: string,
    milestone: number,
    content: any,
    metadata?: any,
  ): Promise<Message> {
    return this.createMessage(
      {
        type: 'MILESTONE',
        title: `Streak Milestone: ${milestone} days!`,
        content,
        metadata: {
          ...metadata,
          milestone,
        },
      },
      [userId],
    );
  }

  /**
   * Get message by ID
   * 根据ID获取消息
   */
  @HandlePrismaError(DbOperationType.QUERY)
  async getById(id: string): Promise<Message | null> {
    return this.getReadClient().message.findUnique({
      where: { id, isDeleted: false },
      include: {
        recipients: {
          where: { isDeleted: false },
          include: {
            user: {
              select: {
                id: true,
                nickname: true,
                avatarFileId: true,
              },
            },
          },
        },
        sender: {
          select: {
            id: true,
            nickname: true,
            avatarFileId: true,
          },
        },
      },
    });
  }

  /**
   * Get user's messages (received)
   * 获取用户接收到的消息列表
   */
  @HandlePrismaError(DbOperationType.QUERY)
  async getUserMessages(
    userId: string,
    options?: {
      isRead?: boolean;
      type?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const { isRead, type, limit = 20, offset = 0 } = options || {};

    const where: Prisma.MessageRecipientWhereInput = {
      userId,
      isDeleted: false,
      ...(isRead !== undefined && { isRead }),
      message: {
        isDeleted: false,
        ...(type && { type }),
      },
    };

    const [list, total] = await Promise.all([
      this.getReadClient().messageRecipient.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          message: {
            include: {
              sender: {
                select: {
                  id: true,
                  nickname: true,
                  avatarFileId: true,
                },
              },
            },
          },
          user: {
            select: {
              id: true,
              nickname: true,
              avatarFileId: true,
            },
          },
        },
      }),
      this.getReadClient().messageRecipient.count({ where }),
    ]);

    return { list, total };
  }

  /**
   * Get unread message count for user
   * 获取用户未读消息数量
   */
  @HandlePrismaError(DbOperationType.QUERY)
  async getUnreadCount(userId: string): Promise<number> {
    return this.getReadClient().messageRecipient.count({
      where: {
        userId,
        isRead: false,
        isDeleted: false,
        message: {
          isDeleted: false,
        },
      },
    });
  }

  /**
   * Mark messages as read
   * 标记消息为已读
   */
  @HandlePrismaError(DbOperationType.UPDATE)
  async markAsRead(userId: string, messageIds: string[]): Promise<number> {
    const result = await this.getWriteClient().messageRecipient.updateMany({
      where: {
        userId,
        messageId: { in: messageIds },
        isRead: false,
        isDeleted: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return result.count;
  }

  /**
   * Mark all messages as read for user
   * 标记用户所有消息为已读
   */
  @HandlePrismaError(DbOperationType.UPDATE)
  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.getWriteClient().messageRecipient.updateMany({
      where: {
        userId,
        isRead: false,
        isDeleted: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return result.count;
  }

  /**
   * Delete message (soft delete)
   * 删除消息（软删除）
   */
  @HandlePrismaError(DbOperationType.DELETE)
  async deleteMessage(id: string): Promise<Message> {
    return this.getWriteClient().message.update({
      where: { id },
      data: { isDeleted: true },
    });
  }

  /**
   * Delete message recipient (soft delete)
   * 删除消息接收记录（软删除）
   */
  @HandlePrismaError(DbOperationType.DELETE)
  async deleteMessageRecipient(
    userId: string,
    messageId: string,
  ): Promise<MessageRecipient> {
    return this.getWriteClient().messageRecipient.updateMany({
      where: {
        userId,
        messageId,
      },
      data: { isDeleted: true },
    }) as any;
  }

  /**
   * Get message recipient by ID
   * 根据ID获取消息接收记录
   */
  @HandlePrismaError(DbOperationType.QUERY)
  async getRecipientById(id: string): Promise<MessageRecipient | null> {
    return this.getReadClient().messageRecipient.findUnique({
      where: { id, isDeleted: false },
      include: {
        message: {
          include: {
            sender: {
              select: {
                id: true,
                nickname: true,
                avatarFileId: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            nickname: true,
            avatarFileId: true,
          },
        },
      },
    });
  }
}
