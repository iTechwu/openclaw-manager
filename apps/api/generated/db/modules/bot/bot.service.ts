import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma';
import { TransactionalServiceBase } from '@app/shared-db';
import { HandlePrismaError, DbOperationType } from '@/utils/prisma-error.util';
import { AppConfig } from '@/config/validation';
import type { Prisma, Bot } from '@prisma/client';

@Injectable()
export class BotService extends TransactionalServiceBase {
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
    where: Prisma.BotWhereInput,
    additional?: { select?: Prisma.BotSelect },
  ): Promise<Bot | null> {
    return this.getReadClient().bot.findFirst({
      where: { ...where, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getById(
    id: string,
    additional?: { select?: Prisma.BotSelect },
  ): Promise<Bot | null> {
    return this.getReadClient().bot.findUnique({
      where: { id: id, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getByHostname(value: string, additional?: { select?: Prisma.BotSelect }): Promise<Bot | null> {
    return this.getReadClient().bot.findUnique({
      where: { hostname: value, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getByProxyTokenHash(value: string, additional?: { select?: Prisma.BotSelect }): Promise<Bot | null> {
    return this.getReadClient().bot.findUnique({
      where: { proxyTokenHash: value, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async list(
    where: Prisma.BotWhereInput,
    pagination?: {
      orderBy?: Prisma.BotOrderByWithRelationInput;
      limit?: number;
      page?: number;
    },
    additional?: { select?: Prisma.BotSelect },
  ): Promise<{ list: Bot[]; total: number; page: number; limit: number }> {
    const {
      orderBy = { createdAt: 'desc' },
      limit = this.appConfig.MaxPageSize,
      page = 1,
    } = pagination || {};
    const skip = (page - 1) * limit;

    const [list, total] = await Promise.all([
      this.getReadClient().bot.findMany({
        where: { ...where, isDeleted: false },
        orderBy,
        take: limit,
        skip,
        ...additional,
      }),
      this.getReadClient().bot.count({
        where: { ...where, isDeleted: false },
      }),
    ]);

    return { list, total, page, limit };
  }

  @HandlePrismaError(DbOperationType.CREATE)
  async create(
    data: Prisma.BotCreateInput,
    additional?: { select?: Prisma.BotSelect },
  ): Promise<Bot> {
    return this.getWriteClient().bot.create({ data, ...additional });
  }

  @HandlePrismaError(DbOperationType.UPDATE)
  async update(
    where: Prisma.BotWhereUniqueInput,
    data: Prisma.BotUpdateInput,
    additional?: { select?: Prisma.BotSelect },
  ): Promise<Bot> {
    return this.getWriteClient().bot.update({
      where,
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async delete(where: Prisma.BotWhereUniqueInput): Promise<Bot> {
    return this.getWriteClient().bot.delete({ where });
  }
}
