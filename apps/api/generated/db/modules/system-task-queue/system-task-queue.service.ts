import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma';
import { TransactionalServiceBase } from '@app/shared-db';
import { HandlePrismaError, DbOperationType } from '@/utils/prisma-error.util';
import { AppConfig } from '@/config/validation';
import type { Prisma, SystemTaskQueue } from '@prisma/client';

@Injectable()
export class SystemTaskQueueService extends TransactionalServiceBase {
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
    where: Prisma.SystemTaskQueueWhereInput,
    additional?: { select?: Prisma.SystemTaskQueueSelect },
  ): Promise<SystemTaskQueue | null> {
    return this.getReadClient().systemTaskQueue.findFirst({
      where: where,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getById(
    id: string,
    additional?: { select?: Prisma.SystemTaskQueueSelect },
  ): Promise<SystemTaskQueue | null> {
    return this.getReadClient().systemTaskQueue.findUnique({
      where: { id: id },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async list(
    where: Prisma.SystemTaskQueueWhereInput,
    pagination?: {
      orderBy?: Prisma.SystemTaskQueueOrderByWithRelationInput;
      limit?: number;
      page?: number;
    },
    additional?: { select?: Prisma.SystemTaskQueueSelect },
  ): Promise<{ list: SystemTaskQueue[]; total: number; page: number; limit: number }> {
    const {
      orderBy = { createdAt: 'desc' },
      limit = this.appConfig.MaxPageSize,
      page = 1,
    } = pagination || {};
    const skip = (page - 1) * limit;

    const [list, total] = await Promise.all([
      this.getReadClient().systemTaskQueue.findMany({
        where: where,
        orderBy,
        take: limit,
        skip,
        ...additional,
      }),
      this.getReadClient().systemTaskQueue.count({
        where: where,
      }),
    ]);

    return { list, total, page, limit };
  }

  @HandlePrismaError(DbOperationType.CREATE)
  async create(
    data: Prisma.SystemTaskQueueCreateInput,
    additional?: { select?: Prisma.SystemTaskQueueSelect },
  ): Promise<SystemTaskQueue> {
    return this.getWriteClient().systemTaskQueue.create({ data, ...additional });
  }

  @HandlePrismaError(DbOperationType.UPDATE)
  async update(
    where: Prisma.SystemTaskQueueWhereUniqueInput,
    data: Prisma.SystemTaskQueueUpdateInput,
    additional?: { select?: Prisma.SystemTaskQueueSelect },
  ): Promise<SystemTaskQueue> {
    return this.getWriteClient().systemTaskQueue.update({
      where,
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async delete(where: Prisma.SystemTaskQueueWhereUniqueInput): Promise<SystemTaskQueue> {
    return this.getWriteClient().systemTaskQueue.delete({ where });
  }
}
