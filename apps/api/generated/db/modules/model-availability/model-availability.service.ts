import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma';
import { TransactionalServiceBase } from '@app/shared-db';
import { HandlePrismaError, DbOperationType } from '@/utils/prisma-error.util';
import { AppConfig } from '@/config/validation';
import type { Prisma, ModelAvailability } from '@prisma/client';

@Injectable()
export class ModelAvailabilityService extends TransactionalServiceBase {
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
    where: Prisma.ModelAvailabilityWhereInput,
    additional?: { select?: Prisma.ModelAvailabilitySelect },
  ): Promise<ModelAvailability | null> {
    return this.getReadClient().modelAvailability.findFirst({
      where: where,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getById(
    id: string,
    additional?: { select?: Prisma.ModelAvailabilitySelect },
  ): Promise<ModelAvailability | null> {
    return this.getReadClient().modelAvailability.findUnique({
      where: { id: id },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async list(
    where: Prisma.ModelAvailabilityWhereInput,
    pagination?: {
      orderBy?: Prisma.ModelAvailabilityOrderByWithRelationInput;
      limit?: number;
      page?: number;
    },
    additional?: { select?: Prisma.ModelAvailabilitySelect },
  ): Promise<{
    list: ModelAvailability[];
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
      this.getReadClient().modelAvailability.findMany({
        where: where,
        orderBy,
        take: limit,
        skip,
        ...additional,
      }),
      this.getReadClient().modelAvailability.count({
        where: where,
      }),
    ]);

    return { list, total, page, limit };
  }

  @HandlePrismaError(DbOperationType.CREATE)
  async create(
    data: Prisma.ModelAvailabilityCreateInput,
    additional?: { select?: Prisma.ModelAvailabilitySelect },
  ): Promise<ModelAvailability> {
    return this.getWriteClient().modelAvailability.create({
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.UPDATE)
  async update(
    where: Prisma.ModelAvailabilityWhereUniqueInput,
    data: Prisma.ModelAvailabilityUpdateInput,
    additional?: { select?: Prisma.ModelAvailabilitySelect },
  ): Promise<ModelAvailability> {
    return this.getWriteClient().modelAvailability.update({
      where,
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async delete(
    where: Prisma.ModelAvailabilityWhereUniqueInput,
  ): Promise<ModelAvailability> {
    return this.getWriteClient().modelAvailability.delete({ where });
  }
}
