import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma';
import { TransactionalServiceBase } from '@app/shared-db';
import { HandlePrismaError, DbOperationType } from '@/utils/prisma-error.util';
import { AppConfig } from '@/config/validation';
import type { Prisma, ProviderKey } from '@prisma/client';

@Injectable()
export class ProviderKeyService extends TransactionalServiceBase {
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
    where: Prisma.ProviderKeyWhereInput,
    additional?: { select?: Prisma.ProviderKeySelect },
  ): Promise<ProviderKey | null> {
    return this.getReadClient().providerKey.findFirst({
      where: { ...where, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getById(
    id: string,
    additional?: { select?: Prisma.ProviderKeySelect },
  ): Promise<ProviderKey | null> {
    return this.getReadClient().providerKey.findUnique({
      where: { id: id, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async list(
    where: Prisma.ProviderKeyWhereInput,
    pagination?: {
      orderBy?: Prisma.ProviderKeyOrderByWithRelationInput;
      limit?: number;
      page?: number;
    },
    additional?: { select?: Prisma.ProviderKeySelect },
  ): Promise<{ list: ProviderKey[]; total: number; page: number; limit: number }> {
    const {
      orderBy = { createdAt: 'desc' },
      limit = this.appConfig.MaxPageSize,
      page = 1,
    } = pagination || {};
    const skip = (page - 1) * limit;

    const [list, total] = await Promise.all([
      this.getReadClient().providerKey.findMany({
        where: { ...where, isDeleted: false },
        orderBy,
        take: limit,
        skip,
        ...additional,
      }),
      this.getReadClient().providerKey.count({
        where: { ...where, isDeleted: false },
      }),
    ]);

    return { list, total, page, limit };
  }

  @HandlePrismaError(DbOperationType.CREATE)
  async create(
    data: Prisma.ProviderKeyCreateInput,
    additional?: { select?: Prisma.ProviderKeySelect },
  ): Promise<ProviderKey> {
    return this.getWriteClient().providerKey.create({ data, ...additional });
  }

  @HandlePrismaError(DbOperationType.UPDATE)
  async update(
    where: Prisma.ProviderKeyWhereUniqueInput,
    data: Prisma.ProviderKeyUpdateInput,
    additional?: { select?: Prisma.ProviderKeySelect },
  ): Promise<ProviderKey> {
    return this.getWriteClient().providerKey.update({
      where,
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async delete(where: Prisma.ProviderKeyWhereUniqueInput): Promise<ProviderKey> {
    return this.getWriteClient().providerKey.delete({ where });
  }
}
