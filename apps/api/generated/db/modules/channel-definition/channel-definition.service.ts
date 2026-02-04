import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma';
import { TransactionalServiceBase } from '@app/shared-db';
import { HandlePrismaError, DbOperationType } from '@/utils/prisma-error.util';
import { AppConfig } from '@/config/validation';
import type { Prisma, ChannelDefinition } from '@prisma/client';

@Injectable()
export class ChannelDefinitionService extends TransactionalServiceBase {
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
    where: Prisma.ChannelDefinitionWhereInput,
    additional?: { select?: Prisma.ChannelDefinitionSelect },
  ): Promise<ChannelDefinition | null> {
    return this.getReadClient().channelDefinition.findFirst({
      where: { ...where, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getById(
    id: string,
    additional?: { select?: Prisma.ChannelDefinitionSelect },
  ): Promise<ChannelDefinition | null> {
    return this.getReadClient().channelDefinition.findUnique({
      where: { id: id, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async list(
    where: Prisma.ChannelDefinitionWhereInput,
    pagination?: {
      orderBy?: Prisma.ChannelDefinitionOrderByWithRelationInput;
      limit?: number;
      page?: number;
    },
    additional?: { select?: Prisma.ChannelDefinitionSelect },
  ): Promise<{ list: ChannelDefinition[]; total: number; page: number; limit: number }> {
    const {
      orderBy = { createdAt: 'desc' },
      limit = this.appConfig.MaxPageSize,
      page = 1,
    } = pagination || {};
    const skip = (page - 1) * limit;

    const [list, total] = await Promise.all([
      this.getReadClient().channelDefinition.findMany({
        where: { ...where, isDeleted: false },
        orderBy,
        take: limit,
        skip,
        ...additional,
      }),
      this.getReadClient().channelDefinition.count({
        where: { ...where, isDeleted: false },
      }),
    ]);

    return { list, total, page, limit };
  }

  @HandlePrismaError(DbOperationType.CREATE)
  async create(
    data: Prisma.ChannelDefinitionCreateInput,
    additional?: { select?: Prisma.ChannelDefinitionSelect },
  ): Promise<ChannelDefinition> {
    return this.getWriteClient().channelDefinition.create({ data, ...additional });
  }

  @HandlePrismaError(DbOperationType.UPDATE)
  async update(
    where: Prisma.ChannelDefinitionWhereUniqueInput,
    data: Prisma.ChannelDefinitionUpdateInput,
    additional?: { select?: Prisma.ChannelDefinitionSelect },
  ): Promise<ChannelDefinition> {
    return this.getWriteClient().channelDefinition.update({
      where,
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async delete(where: Prisma.ChannelDefinitionWhereUniqueInput): Promise<ChannelDefinition> {
    return this.getWriteClient().channelDefinition.delete({ where });
  }
}
