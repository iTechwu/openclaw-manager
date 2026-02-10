import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma';
import { TransactionalServiceBase } from '@app/shared-db';
import { HandlePrismaError, DbOperationType } from '@/utils/prisma-error.util';
import { AppConfig } from '@/config/validation';
import type { Prisma, BotModel } from '@prisma/client';

@Injectable()
export class BotModelService extends TransactionalServiceBase {
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
    where: Prisma.BotModelWhereInput,
    additional?: { select?: Prisma.BotModelSelect },
  ): Promise<BotModel | null> {
    return this.getReadClient().botModel.findFirst({
      where: where,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getById(
    id: string,
    additional?: { select?: Prisma.BotModelSelect },
  ): Promise<BotModel | null> {
    return this.getReadClient().botModel.findUnique({
      where: { id: id },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async list(
    where: Prisma.BotModelWhereInput,
    pagination?: {
      orderBy?: Prisma.BotModelOrderByWithRelationInput;
      limit?: number;
      page?: number;
    },
    additional?: { select?: Prisma.BotModelSelect },
  ): Promise<{ list: BotModel[]; total: number; page: number; limit: number }> {
    const {
      orderBy = { createdAt: 'desc' },
      limit = this.appConfig.MaxPageSize,
      page = 1,
    } = pagination || {};
    const skip = (page - 1) * limit;

    const [list, total] = await Promise.all([
      this.getReadClient().botModel.findMany({
        where: where,
        orderBy,
        take: limit,
        skip,
        ...additional,
      }),
      this.getReadClient().botModel.count({
        where: where,
      }),
    ]);

    return { list, total, page, limit };
  }

  @HandlePrismaError(DbOperationType.CREATE)
  async create(
    data: Prisma.BotModelCreateInput,
    additional?: { select?: Prisma.BotModelSelect },
  ): Promise<BotModel> {
    return this.getWriteClient().botModel.create({ data, ...additional });
  }

  @HandlePrismaError(DbOperationType.UPDATE)
  async update(
    where: Prisma.BotModelWhereUniqueInput,
    data: Prisma.BotModelUpdateInput,
    additional?: { select?: Prisma.BotModelSelect },
  ): Promise<BotModel> {
    return this.getWriteClient().botModel.update({
      where,
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async delete(where: Prisma.BotModelWhereUniqueInput): Promise<BotModel> {
    return this.getWriteClient().botModel.delete({ where });
  }
}
