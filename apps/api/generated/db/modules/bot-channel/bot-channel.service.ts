import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma';
import { TransactionalServiceBase } from '@app/shared-db';
import { HandlePrismaError, DbOperationType } from '@/utils/prisma-error.util';
import { AppConfig } from '@/config/validation';
import type { Prisma, BotChannel } from '@prisma/client';

@Injectable()
export class BotChannelService extends TransactionalServiceBase {
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
    where: Prisma.BotChannelWhereInput,
    additional?: { select?: Prisma.BotChannelSelect },
  ): Promise<BotChannel | null> {
    return this.getReadClient().botChannel.findFirst({
      where: { ...where, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getById(
    id: string,
    additional?: { select?: Prisma.BotChannelSelect },
  ): Promise<BotChannel | null> {
    return this.getReadClient().botChannel.findUnique({
      where: { id: id, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async list(
    where: Prisma.BotChannelWhereInput,
    pagination?: {
      orderBy?: Prisma.BotChannelOrderByWithRelationInput;
      limit?: number;
      page?: number;
    },
    additional?: { select?: Prisma.BotChannelSelect },
  ): Promise<{ list: BotChannel[]; total: number; page: number; limit: number }> {
    const {
      orderBy = { createdAt: 'desc' },
      limit = this.appConfig.MaxPageSize,
      page = 1,
    } = pagination || {};
    const skip = (page - 1) * limit;

    const [list, total] = await Promise.all([
      this.getReadClient().botChannel.findMany({
        where: { ...where, isDeleted: false },
        orderBy,
        take: limit,
        skip,
        ...additional,
      }),
      this.getReadClient().botChannel.count({
        where: { ...where, isDeleted: false },
      }),
    ]);

    return { list, total, page, limit };
  }

  @HandlePrismaError(DbOperationType.CREATE)
  async create(
    data: Prisma.BotChannelCreateInput,
    additional?: { select?: Prisma.BotChannelSelect },
  ): Promise<BotChannel> {
    return this.getWriteClient().botChannel.create({ data, ...additional });
  }

  @HandlePrismaError(DbOperationType.UPDATE)
  async update(
    where: Prisma.BotChannelWhereUniqueInput,
    data: Prisma.BotChannelUpdateInput,
    additional?: { select?: Prisma.BotChannelSelect },
  ): Promise<BotChannel> {
    return this.getWriteClient().botChannel.update({
      where,
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async delete(where: Prisma.BotChannelWhereUniqueInput): Promise<BotChannel> {
    return this.getWriteClient().botChannel.delete({ where });
  }
}
