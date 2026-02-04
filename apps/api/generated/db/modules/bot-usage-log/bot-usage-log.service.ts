import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma';
import { TransactionalServiceBase } from '@app/shared-db';
import { HandlePrismaError, DbOperationType } from '@/utils/prisma-error.util';
import { AppConfig } from '@/config/validation';
import type { Prisma, BotUsageLog } from '@prisma/client';

@Injectable()
export class BotUsageLogService extends TransactionalServiceBase {
  private appConfig: AppConfig;

  constructor(
    prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    super(prisma);
    this.appConfig = config.getOrThrow<AppConfig>('app');
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async get(
    where: Prisma.BotUsageLogWhereInput,
    additional?: { select?: Prisma.BotUsageLogSelect },
  ): Promise<BotUsageLog | null> {
    return this.getReadClient().botUsageLog.findFirst({
      where: where,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getById(
    id: string,
    additional?: { select?: Prisma.BotUsageLogSelect },
  ): Promise<BotUsageLog | null> {
    return this.getReadClient().botUsageLog.findUnique({
      where: { id: id },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async list(
    where: Prisma.BotUsageLogWhereInput,
    pagination?: {
      orderBy?: Prisma.BotUsageLogOrderByWithRelationInput;
      limit?: number;
      page?: number;
    },
    additional?: { select?: Prisma.BotUsageLogSelect },
  ): Promise<{ list: BotUsageLog[]; total: number; page: number; limit: number }> {
    const {
      orderBy = { createdAt: 'desc' },
      limit = this.appConfig.MaxPageSize,
      page = 1,
    } = pagination || {};
    const skip = (page - 1) * limit;

    const [list, total] = await Promise.all([
      this.getReadClient().botUsageLog.findMany({
        where: where,
        orderBy,
        take: limit,
        skip,
        ...additional,
      }),
      this.getReadClient().botUsageLog.count({
        where: where,
      }),
    ]);

    return { list, total, page, limit };
  }

  @HandlePrismaError(DbOperationType.CREATE)
  async create(
    data: Prisma.BotUsageLogCreateInput,
    additional?: { select?: Prisma.BotUsageLogSelect },
  ): Promise<BotUsageLog> {
    return this.getWriteClient().botUsageLog.create({ data, ...additional });
  }

  @HandlePrismaError(DbOperationType.UPDATE)
  async update(
    where: Prisma.BotUsageLogWhereUniqueInput,
    data: Prisma.BotUsageLogUpdateInput,
    additional?: { select?: Prisma.BotUsageLogSelect },
  ): Promise<BotUsageLog> {
    return this.getWriteClient().botUsageLog.update({
      where,
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async delete(where: Prisma.BotUsageLogWhereUniqueInput): Promise<BotUsageLog> {
    return this.getWriteClient().botUsageLog.delete({ where });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async listByBotId(
    botId: string,
    options?: { startDate?: Date; endDate?: Date },
  ): Promise<BotUsageLog[]> {
    const where: Prisma.BotUsageLogWhereInput = { botId };
    if (options?.startDate) {
      where.createdAt = { gte: options.startDate };
    }
    if (options?.endDate) {
      where.createdAt = {
        ...((where.createdAt as object) || {}),
        lte: options.endDate,
      };
    }
    return this.getReadClient().botUsageLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }
}
