import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma';
import { TransactionalServiceBase } from '@app/shared-db';
import { HandlePrismaError, DbOperationType } from '@/utils/prisma-error.util';
import { AppConfig } from '@/config/validation';
import type { Prisma, FileSource } from '@prisma/client';

@Injectable()
export class FileSourceService extends TransactionalServiceBase {
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
    where: Prisma.FileSourceWhereInput,
    additional?: { select?: Prisma.FileSourceSelect },
  ): Promise<FileSource | null> {
    return this.getReadClient().fileSource.findFirst({
      where: { ...where, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getById(
    id: string,
    additional?: { select?: Prisma.FileSourceSelect },
  ): Promise<FileSource | null> {
    return this.getReadClient().fileSource.findUnique({
      where: { id: id, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getByKey(value: string, additional?: { select?: Prisma.FileSourceSelect }): Promise<FileSource | null> {
    return this.getReadClient().fileSource.findUnique({
      where: { key: value, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async list(
    where: Prisma.FileSourceWhereInput,
    pagination?: {
      orderBy?: Prisma.FileSourceOrderByWithRelationInput;
      limit?: number;
      page?: number;
    },
    additional?: { select?: Prisma.FileSourceSelect },
  ): Promise<{ list: FileSource[]; total: number; page: number; limit: number }> {
    const {
      orderBy = { createdAt: 'desc' },
      limit = this.appConfig.MaxPageSize,
      page = 1,
    } = pagination || {};
    const skip = (page - 1) * limit;

    const [list, total] = await Promise.all([
      this.getReadClient().fileSource.findMany({
        where: { ...where, isDeleted: false },
        orderBy,
        take: limit,
        skip,
        ...additional,
      }),
      this.getReadClient().fileSource.count({
        where: { ...where, isDeleted: false },
      }),
    ]);

    return { list, total, page, limit };
  }

  @HandlePrismaError(DbOperationType.CREATE)
  async create(
    data: Prisma.FileSourceCreateInput,
    additional?: { select?: Prisma.FileSourceSelect },
  ): Promise<FileSource> {
    return this.getWriteClient().fileSource.create({ data, ...additional });
  }

  @HandlePrismaError(DbOperationType.UPDATE)
  async update(
    where: Prisma.FileSourceWhereUniqueInput,
    data: Prisma.FileSourceUpdateInput,
    additional?: { select?: Prisma.FileSourceSelect },
  ): Promise<FileSource> {
    return this.getWriteClient().fileSource.update({
      where,
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async delete(where: Prisma.FileSourceWhereUniqueInput): Promise<FileSource> {
    return this.getWriteClient().fileSource.delete({ where });
  }
}
