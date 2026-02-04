import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma';
import { TransactionalServiceBase } from '@app/shared-db';
import { HandlePrismaError, DbOperationType } from '@/utils/prisma-error.util';
import { AppConfig } from '@/config/validation';
import type { Prisma, DiscordAuth } from '@prisma/client';

@Injectable()
export class DiscordAuthService extends TransactionalServiceBase {
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
    where: Prisma.DiscordAuthWhereInput,
    additional?: { select?: Prisma.DiscordAuthSelect },
  ): Promise<DiscordAuth | null> {
    return this.getReadClient().discordAuth.findFirst({
      where: { ...where, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getById(
    id: string,
    additional?: { select?: Prisma.DiscordAuthSelect },
  ): Promise<DiscordAuth | null> {
    return this.getReadClient().discordAuth.findUnique({
      where: { discordId: id, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async list(
    where: Prisma.DiscordAuthWhereInput,
    pagination?: {
      orderBy?: Prisma.DiscordAuthOrderByWithRelationInput;
      limit?: number;
      page?: number;
    },
    additional?: { select?: Prisma.DiscordAuthSelect },
  ): Promise<{ list: DiscordAuth[]; total: number; page: number; limit: number }> {
    const {
      orderBy = { createdAt: 'desc' },
      limit = this.appConfig.MaxPageSize,
      page = 1,
    } = pagination || {};
    const skip = (page - 1) * limit;

    const [list, total] = await Promise.all([
      this.getReadClient().discordAuth.findMany({
        where: { ...where, isDeleted: false },
        orderBy,
        take: limit,
        skip,
        ...additional,
      }),
      this.getReadClient().discordAuth.count({
        where: { ...where, isDeleted: false },
      }),
    ]);

    return { list, total, page, limit };
  }

  @HandlePrismaError(DbOperationType.CREATE)
  async create(
    data: Prisma.DiscordAuthCreateInput,
    additional?: { select?: Prisma.DiscordAuthSelect },
  ): Promise<DiscordAuth> {
    return this.getWriteClient().discordAuth.create({ data, ...additional });
  }

  @HandlePrismaError(DbOperationType.UPDATE)
  async update(
    where: Prisma.DiscordAuthWhereUniqueInput,
    data: Prisma.DiscordAuthUpdateInput,
    additional?: { select?: Prisma.DiscordAuthSelect },
  ): Promise<DiscordAuth> {
    return this.getWriteClient().discordAuth.update({
      where,
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async delete(where: Prisma.DiscordAuthWhereUniqueInput): Promise<DiscordAuth> {
    return this.getWriteClient().discordAuth.delete({ where });
  }
}
