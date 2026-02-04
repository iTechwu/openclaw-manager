import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma';
import { TransactionalServiceBase } from '@app/shared-db';
import { HandlePrismaError, DbOperationType } from '@/utils/prisma-error.util';
import { AppConfig } from '@/config/validation';
import type { Prisma, BotProviderKey } from '@prisma/client';

@Injectable()
export class BotProviderKeyService extends TransactionalServiceBase {
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
    where: Prisma.BotProviderKeyWhereInput,
    additional?: { select?: Prisma.BotProviderKeySelect },
  ): Promise<BotProviderKey | null> {
    return this.getReadClient().botProviderKey.findFirst({
      where: where,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getById(
    id: string,
    additional?: { select?: Prisma.BotProviderKeySelect },
  ): Promise<BotProviderKey | null> {
    return this.getReadClient().botProviderKey.findUnique({
      where: { id: id },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async list(
    where: Prisma.BotProviderKeyWhereInput,
    pagination?: {
      orderBy?: Prisma.BotProviderKeyOrderByWithRelationInput;
      limit?: number;
      page?: number;
    },
    additional?: { select?: Prisma.BotProviderKeySelect },
  ): Promise<{ list: BotProviderKey[]; total: number; page: number; limit: number }> {
    const {
      orderBy = { createdAt: 'desc' },
      limit = this.appConfig.MaxPageSize,
      page = 1,
    } = pagination || {};
    const skip = (page - 1) * limit;

    const [list, total] = await Promise.all([
      this.getReadClient().botProviderKey.findMany({
        where: where,
        orderBy,
        take: limit,
        skip,
        ...additional,
      }),
      this.getReadClient().botProviderKey.count({
        where: where,
      }),
    ]);

    return { list, total, page, limit };
  }

  @HandlePrismaError(DbOperationType.CREATE)
  async create(
    data: Prisma.BotProviderKeyCreateInput,
    additional?: { select?: Prisma.BotProviderKeySelect },
  ): Promise<BotProviderKey> {
    return this.getWriteClient().botProviderKey.create({ data, ...additional });
  }

  @HandlePrismaError(DbOperationType.UPDATE)
  async update(
    where: Prisma.BotProviderKeyWhereUniqueInput,
    data: Prisma.BotProviderKeyUpdateInput,
    additional?: { select?: Prisma.BotProviderKeySelect },
  ): Promise<BotProviderKey> {
    return this.getWriteClient().botProviderKey.update({
      where,
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async delete(where: Prisma.BotProviderKeyWhereUniqueInput): Promise<BotProviderKey> {
    return this.getWriteClient().botProviderKey.delete({ where });
  }
}
