import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma';
import { TransactionalServiceBase } from '@app/shared-db';
import { HandlePrismaError, DbOperationType } from '@/utils/prisma-error.util';
import { AppConfig } from '@/config/validation';
import type { Prisma, ProxyToken } from '@prisma/client';

@Injectable()
export class ProxyTokenService extends TransactionalServiceBase {
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
    where: Prisma.ProxyTokenWhereInput,
    additional?: { select?: Prisma.ProxyTokenSelect },
  ): Promise<ProxyToken | null> {
    return this.getReadClient().proxyToken.findFirst({
      where: where,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getById(
    id: string,
    additional?: { select?: Prisma.ProxyTokenSelect },
  ): Promise<ProxyToken | null> {
    return this.getReadClient().proxyToken.findUnique({
      where: { id: id },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getByBotId(value: string, additional?: { select?: Prisma.ProxyTokenSelect }): Promise<ProxyToken | null> {
    return this.getReadClient().proxyToken.findUnique({
      where: { botId: value },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getByTokenHash(value: string, additional?: { select?: Prisma.ProxyTokenSelect }): Promise<ProxyToken | null> {
    return this.getReadClient().proxyToken.findUnique({
      where: { tokenHash: value },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async list(
    where: Prisma.ProxyTokenWhereInput,
    pagination?: {
      orderBy?: Prisma.ProxyTokenOrderByWithRelationInput;
      limit?: number;
      page?: number;
    },
    additional?: { select?: Prisma.ProxyTokenSelect },
  ): Promise<{ list: ProxyToken[]; total: number; page: number; limit: number }> {
    const {
      orderBy = { createdAt: 'desc' },
      limit = this.appConfig.MaxPageSize,
      page = 1,
    } = pagination || {};
    const skip = (page - 1) * limit;

    const [list, total] = await Promise.all([
      this.getReadClient().proxyToken.findMany({
        where: where,
        orderBy,
        take: limit,
        skip,
        ...additional,
      }),
      this.getReadClient().proxyToken.count({
        where: where,
      }),
    ]);

    return { list, total, page, limit };
  }

  @HandlePrismaError(DbOperationType.CREATE)
  async create(
    data: Prisma.ProxyTokenCreateInput,
    additional?: { select?: Prisma.ProxyTokenSelect },
  ): Promise<ProxyToken> {
    return this.getWriteClient().proxyToken.create({ data, ...additional });
  }

  @HandlePrismaError(DbOperationType.UPDATE)
  async update(
    where: Prisma.ProxyTokenWhereUniqueInput,
    data: Prisma.ProxyTokenUpdateInput,
    additional?: { select?: Prisma.ProxyTokenSelect },
  ): Promise<ProxyToken> {
    return this.getWriteClient().proxyToken.update({
      where,
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async delete(where: Prisma.ProxyTokenWhereUniqueInput): Promise<ProxyToken> {
    return this.getWriteClient().proxyToken.delete({ where });
  }
}
