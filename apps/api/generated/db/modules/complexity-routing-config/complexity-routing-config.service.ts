import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma';
import { TransactionalServiceBase } from '@app/shared-db';
import { HandlePrismaError, DbOperationType } from '@/utils/prisma-error.util';
import { AppConfig } from '@/config/validation';
import type { Prisma, ComplexityRoutingConfig } from '@prisma/client';

@Injectable()
export class ComplexityRoutingConfigService extends TransactionalServiceBase {
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
    where: Prisma.ComplexityRoutingConfigWhereInput,
    additional?: { select?: Prisma.ComplexityRoutingConfigSelect },
  ): Promise<ComplexityRoutingConfig | null> {
    return this.getReadClient().complexityRoutingConfig.findFirst({
      where: { ...where, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getById(
    id: string,
    additional?: { select?: Prisma.ComplexityRoutingConfigSelect },
  ): Promise<ComplexityRoutingConfig | null> {
    return this.getReadClient().complexityRoutingConfig.findUnique({
      where: { id: id, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getByConfigId(value: string, additional?: { select?: Prisma.ComplexityRoutingConfigSelect }): Promise<ComplexityRoutingConfig | null> {
    return this.getReadClient().complexityRoutingConfig.findUnique({
      where: { configId: value, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async list(
    where: Prisma.ComplexityRoutingConfigWhereInput,
    pagination?: {
      orderBy?: Prisma.ComplexityRoutingConfigOrderByWithRelationInput;
      limit?: number;
      page?: number;
    },
    additional?: { select?: Prisma.ComplexityRoutingConfigSelect },
  ): Promise<{ list: ComplexityRoutingConfig[]; total: number; page: number; limit: number }> {
    const {
      orderBy = { createdAt: 'desc' },
      limit = this.appConfig.MaxPageSize,
      page = 1,
    } = pagination || {};
    const skip = (page - 1) * limit;

    const [list, total] = await Promise.all([
      this.getReadClient().complexityRoutingConfig.findMany({
        where: { ...where, isDeleted: false },
        orderBy,
        take: limit,
        skip,
        ...additional,
      }),
      this.getReadClient().complexityRoutingConfig.count({
        where: { ...where, isDeleted: false },
      }),
    ]);

    return { list, total, page, limit };
  }

  @HandlePrismaError(DbOperationType.CREATE)
  async create(
    data: Prisma.ComplexityRoutingConfigCreateInput,
    additional?: { select?: Prisma.ComplexityRoutingConfigSelect },
  ): Promise<ComplexityRoutingConfig> {
    return this.getWriteClient().complexityRoutingConfig.create({ data, ...additional });
  }

  @HandlePrismaError(DbOperationType.UPDATE)
  async update(
    where: Prisma.ComplexityRoutingConfigWhereUniqueInput,
    data: Prisma.ComplexityRoutingConfigUpdateInput,
    additional?: { select?: Prisma.ComplexityRoutingConfigSelect },
  ): Promise<ComplexityRoutingConfig> {
    return this.getWriteClient().complexityRoutingConfig.update({
      where,
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async delete(where: Prisma.ComplexityRoutingConfigWhereUniqueInput): Promise<ComplexityRoutingConfig> {
    return this.getWriteClient().complexityRoutingConfig.delete({ where });
  }
}
