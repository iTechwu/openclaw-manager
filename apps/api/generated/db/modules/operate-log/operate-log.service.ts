import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma';
import { TransactionalServiceBase } from '@app/shared-db';
import { HandlePrismaError, DbOperationType } from '@/utils/prisma-error.util';
import { AppConfig } from '@/config/validation';
import type { Prisma, OperateLog } from '@prisma/client';

@Injectable()
export class OperateLogService extends TransactionalServiceBase {
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
    where: Prisma.OperateLogWhereInput,
    additional?: { select?: Prisma.OperateLogSelect },
  ): Promise<OperateLog | null> {
    return this.getReadClient().operateLog.findFirst({
      where: where,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getById(
    id: string,
    additional?: { select?: Prisma.OperateLogSelect },
  ): Promise<OperateLog | null> {
    return this.getReadClient().operateLog.findUnique({
      where: { id: id },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async list(
    where: Prisma.OperateLogWhereInput,
    pagination?: {
      orderBy?: Prisma.OperateLogOrderByWithRelationInput;
      limit?: number;
      page?: number;
    },
    additional?: { select?: Prisma.OperateLogSelect },
  ): Promise<{ list: OperateLog[]; total: number; page: number; limit: number }> {
    const {
      orderBy = { createdAt: 'desc' },
      limit = this.appConfig.MaxPageSize,
      page = 1,
    } = pagination || {};
    const skip = (page - 1) * limit;

    const [list, total] = await Promise.all([
      this.getReadClient().operateLog.findMany({
        where: where,
        orderBy,
        take: limit,
        skip,
        ...additional,
      }),
      this.getReadClient().operateLog.count({
        where: where,
      }),
    ]);

    return { list, total, page, limit };
  }

  @HandlePrismaError(DbOperationType.CREATE)
  async create(
    data: Prisma.OperateLogCreateInput,
    additional?: { select?: Prisma.OperateLogSelect },
  ): Promise<OperateLog> {
    return this.getWriteClient().operateLog.create({ data, ...additional });
  }

  @HandlePrismaError(DbOperationType.UPDATE)
  async update(
    where: Prisma.OperateLogWhereUniqueInput,
    data: Prisma.OperateLogUpdateInput,
    additional?: { select?: Prisma.OperateLogSelect },
  ): Promise<OperateLog> {
    return this.getWriteClient().operateLog.update({
      where,
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async delete(where: Prisma.OperateLogWhereUniqueInput): Promise<OperateLog> {
    return this.getWriteClient().operateLog.delete({ where });
  }
}
