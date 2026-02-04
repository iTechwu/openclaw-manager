import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma';
import { TransactionalServiceBase } from '@app/shared-db';
import { HandlePrismaError, DbOperationType } from '@/utils/prisma-error.util';
import { AppConfig } from '@/config/validation';
import type { Prisma, ChannelCredentialField } from '@prisma/client';

@Injectable()
export class ChannelCredentialFieldService extends TransactionalServiceBase {
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
    where: Prisma.ChannelCredentialFieldWhereInput,
    additional?: { select?: Prisma.ChannelCredentialFieldSelect },
  ): Promise<ChannelCredentialField | null> {
    return this.getReadClient().channelCredentialField.findFirst({
      where: { ...where, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getById(
    id: string,
    additional?: { select?: Prisma.ChannelCredentialFieldSelect },
  ): Promise<ChannelCredentialField | null> {
    return this.getReadClient().channelCredentialField.findUnique({
      where: { id: id, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async list(
    where: Prisma.ChannelCredentialFieldWhereInput,
    pagination?: {
      orderBy?: Prisma.ChannelCredentialFieldOrderByWithRelationInput;
      limit?: number;
      page?: number;
    },
    additional?: { select?: Prisma.ChannelCredentialFieldSelect },
  ): Promise<{ list: ChannelCredentialField[]; total: number; page: number; limit: number }> {
    const {
      orderBy = { createdAt: 'desc' },
      limit = this.appConfig.MaxPageSize,
      page = 1,
    } = pagination || {};
    const skip = (page - 1) * limit;

    const [list, total] = await Promise.all([
      this.getReadClient().channelCredentialField.findMany({
        where: { ...where, isDeleted: false },
        orderBy,
        take: limit,
        skip,
        ...additional,
      }),
      this.getReadClient().channelCredentialField.count({
        where: { ...where, isDeleted: false },
      }),
    ]);

    return { list, total, page, limit };
  }

  @HandlePrismaError(DbOperationType.CREATE)
  async create(
    data: Prisma.ChannelCredentialFieldCreateInput,
    additional?: { select?: Prisma.ChannelCredentialFieldSelect },
  ): Promise<ChannelCredentialField> {
    return this.getWriteClient().channelCredentialField.create({ data, ...additional });
  }

  @HandlePrismaError(DbOperationType.UPDATE)
  async update(
    where: Prisma.ChannelCredentialFieldWhereUniqueInput,
    data: Prisma.ChannelCredentialFieldUpdateInput,
    additional?: { select?: Prisma.ChannelCredentialFieldSelect },
  ): Promise<ChannelCredentialField> {
    return this.getWriteClient().channelCredentialField.update({
      where,
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async delete(where: Prisma.ChannelCredentialFieldWhereUniqueInput): Promise<ChannelCredentialField> {
    return this.getWriteClient().channelCredentialField.delete({ where });
  }
}
