import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma';
import { TransactionalServiceBase } from '@app/shared-db';
import { HandlePrismaError, DbOperationType } from '@/utils/prisma-error.util';
import { AppConfig } from '@/config/validation';
import type { Prisma, ModelCapabilityTag } from '@prisma/client';

@Injectable()
export class ModelCapabilityTagService extends TransactionalServiceBase {
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
    where: Prisma.ModelCapabilityTagWhereInput,
    additional?: { select?: Prisma.ModelCapabilityTagSelect },
  ): Promise<ModelCapabilityTag | null> {
    return this.getReadClient().modelCapabilityTag.findFirst({
      where: where,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getById(
    id: string,
    additional?: { select?: Prisma.ModelCapabilityTagSelect },
  ): Promise<ModelCapabilityTag | null> {
    return this.getReadClient().modelCapabilityTag.findUnique({
      where: { id: id },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async list(
    where: Prisma.ModelCapabilityTagWhereInput,
    pagination?: {
      orderBy?: Prisma.ModelCapabilityTagOrderByWithRelationInput;
      limit?: number;
      page?: number;
    },
    additional?: { select?: Prisma.ModelCapabilityTagSelect },
  ): Promise<{
    list: ModelCapabilityTag[];
    total: number;
    page: number;
    limit: number;
  }> {
    const {
      orderBy = { createdAt: 'desc' },
      limit = this.appConfig.MaxPageSize,
      page = 1,
    } = pagination || {};
    const skip = (page - 1) * limit;

    const [list, total] = await Promise.all([
      this.getReadClient().modelCapabilityTag.findMany({
        where: where,
        orderBy,
        take: limit,
        skip,
        ...additional,
      }),
      this.getReadClient().modelCapabilityTag.count({
        where: where,
      }),
    ]);

    return { list, total, page, limit };
  }

  @HandlePrismaError(DbOperationType.CREATE)
  async create(
    data: Prisma.ModelCapabilityTagCreateInput,
    additional?: { select?: Prisma.ModelCapabilityTagSelect },
  ): Promise<ModelCapabilityTag> {
    return this.getWriteClient().modelCapabilityTag.create({
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.UPDATE)
  async update(
    where: Prisma.ModelCapabilityTagWhereUniqueInput,
    data: Prisma.ModelCapabilityTagUpdateInput,
    additional?: { select?: Prisma.ModelCapabilityTagSelect },
  ): Promise<ModelCapabilityTag> {
    return this.getWriteClient().modelCapabilityTag.update({
      where,
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async delete(
    where: Prisma.ModelCapabilityTagWhereUniqueInput,
  ): Promise<ModelCapabilityTag> {
    return this.getWriteClient().modelCapabilityTag.delete({ where });
  }
}
