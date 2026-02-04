import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma';
import { TransactionalServiceBase } from '@app/shared-db';
import { HandlePrismaError, DbOperationType } from '@/utils/prisma-error.util';
import { AppConfig } from '@/config/validation';
import type { Prisma, MobileAuth } from '@prisma/client';

@Injectable()
export class MobileAuthService extends TransactionalServiceBase {
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
    where: Prisma.MobileAuthWhereInput,
    additional?: { select?: Prisma.MobileAuthSelect },
  ): Promise<MobileAuth | null> {
    return this.getReadClient().mobileAuth.findFirst({
      where: { ...where, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getById(
    id: string,
    additional?: { select?: Prisma.MobileAuthSelect },
  ): Promise<MobileAuth | null> {
    return this.getReadClient().mobileAuth.findUnique({
      where: { mobile: id, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async list(
    where: Prisma.MobileAuthWhereInput,
    pagination?: {
      orderBy?: Prisma.MobileAuthOrderByWithRelationInput;
      limit?: number;
      page?: number;
    },
    additional?: { select?: Prisma.MobileAuthSelect },
  ): Promise<{ list: MobileAuth[]; total: number; page: number; limit: number }> {
    const {
      orderBy = { createdAt: 'desc' },
      limit = this.appConfig.MaxPageSize,
      page = 1,
    } = pagination || {};
    const skip = (page - 1) * limit;

    const [list, total] = await Promise.all([
      this.getReadClient().mobileAuth.findMany({
        where: { ...where, isDeleted: false },
        orderBy,
        take: limit,
        skip,
        ...additional,
      }),
      this.getReadClient().mobileAuth.count({
        where: { ...where, isDeleted: false },
      }),
    ]);

    return { list, total, page, limit };
  }

  @HandlePrismaError(DbOperationType.CREATE)
  async create(
    data: Prisma.MobileAuthCreateInput,
    additional?: { select?: Prisma.MobileAuthSelect },
  ): Promise<MobileAuth> {
    return this.getWriteClient().mobileAuth.create({ data, ...additional });
  }

  @HandlePrismaError(DbOperationType.UPDATE)
  async update(
    where: Prisma.MobileAuthWhereUniqueInput,
    data: Prisma.MobileAuthUpdateInput,
    additional?: { select?: Prisma.MobileAuthSelect },
  ): Promise<MobileAuth> {
    return this.getWriteClient().mobileAuth.update({
      where,
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async delete(where: Prisma.MobileAuthWhereUniqueInput): Promise<MobileAuth> {
    return this.getWriteClient().mobileAuth.delete({ where });
  }
}
