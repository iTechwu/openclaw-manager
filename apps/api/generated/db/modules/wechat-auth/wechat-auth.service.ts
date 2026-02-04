import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma';
import { TransactionalServiceBase } from '@app/shared-db';
import { HandlePrismaError, DbOperationType } from '@/utils/prisma-error.util';
import { AppConfig } from '@/config/validation';
import type { Prisma, WechatAuth } from '@prisma/client';

@Injectable()
export class WechatAuthService extends TransactionalServiceBase {
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
    where: Prisma.WechatAuthWhereInput,
    additional?: { select?: Prisma.WechatAuthSelect },
  ): Promise<WechatAuth | null> {
    return this.getReadClient().wechatAuth.findFirst({
      where: { ...where, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getById(
    id: string,
    additional?: { select?: Prisma.WechatAuthSelect },
  ): Promise<WechatAuth | null> {
    return this.getReadClient().wechatAuth.findUnique({
      where: { openid: id, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async list(
    where: Prisma.WechatAuthWhereInput,
    pagination?: {
      orderBy?: Prisma.WechatAuthOrderByWithRelationInput;
      limit?: number;
      page?: number;
    },
    additional?: { select?: Prisma.WechatAuthSelect },
  ): Promise<{ list: WechatAuth[]; total: number; page: number; limit: number }> {
    const {
      orderBy = { createdAt: 'desc' },
      limit = this.appConfig.MaxPageSize,
      page = 1,
    } = pagination || {};
    const skip = (page - 1) * limit;

    const [list, total] = await Promise.all([
      this.getReadClient().wechatAuth.findMany({
        where: { ...where, isDeleted: false },
        orderBy,
        take: limit,
        skip,
        ...additional,
      }),
      this.getReadClient().wechatAuth.count({
        where: { ...where, isDeleted: false },
      }),
    ]);

    return { list, total, page, limit };
  }

  @HandlePrismaError(DbOperationType.CREATE)
  async create(
    data: Prisma.WechatAuthCreateInput,
    additional?: { select?: Prisma.WechatAuthSelect },
  ): Promise<WechatAuth> {
    return this.getWriteClient().wechatAuth.create({ data, ...additional });
  }

  @HandlePrismaError(DbOperationType.UPDATE)
  async update(
    where: Prisma.WechatAuthWhereUniqueInput,
    data: Prisma.WechatAuthUpdateInput,
    additional?: { select?: Prisma.WechatAuthSelect },
  ): Promise<WechatAuth> {
    return this.getWriteClient().wechatAuth.update({
      where,
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async delete(where: Prisma.WechatAuthWhereUniqueInput): Promise<WechatAuth> {
    return this.getWriteClient().wechatAuth.delete({ where });
  }
}
