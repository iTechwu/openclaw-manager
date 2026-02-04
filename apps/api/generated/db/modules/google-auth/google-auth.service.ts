import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma';
import { TransactionalServiceBase } from '@app/shared-db';
import { HandlePrismaError, DbOperationType } from '@/utils/prisma-error.util';
import { AppConfig } from '@/config/validation';
import type { Prisma, GoogleAuth } from '@prisma/client';

@Injectable()
export class GoogleAuthService extends TransactionalServiceBase {
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
    where: Prisma.GoogleAuthWhereInput,
    additional?: { select?: Prisma.GoogleAuthSelect },
  ): Promise<GoogleAuth | null> {
    return this.getReadClient().googleAuth.findFirst({
      where: { ...where, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getById(
    id: string,
    additional?: { select?: Prisma.GoogleAuthSelect },
  ): Promise<GoogleAuth | null> {
    return this.getReadClient().googleAuth.findUnique({
      where: { sub: id, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async list(
    where: Prisma.GoogleAuthWhereInput,
    pagination?: {
      orderBy?: Prisma.GoogleAuthOrderByWithRelationInput;
      limit?: number;
      page?: number;
    },
    additional?: { select?: Prisma.GoogleAuthSelect },
  ): Promise<{ list: GoogleAuth[]; total: number; page: number; limit: number }> {
    const {
      orderBy = { createdAt: 'desc' },
      limit = this.appConfig.MaxPageSize,
      page = 1,
    } = pagination || {};
    const skip = (page - 1) * limit;

    const [list, total] = await Promise.all([
      this.getReadClient().googleAuth.findMany({
        where: { ...where, isDeleted: false },
        orderBy,
        take: limit,
        skip,
        ...additional,
      }),
      this.getReadClient().googleAuth.count({
        where: { ...where, isDeleted: false },
      }),
    ]);

    return { list, total, page, limit };
  }

  @HandlePrismaError(DbOperationType.CREATE)
  async create(
    data: Prisma.GoogleAuthCreateInput,
    additional?: { select?: Prisma.GoogleAuthSelect },
  ): Promise<GoogleAuth> {
    return this.getWriteClient().googleAuth.create({ data, ...additional });
  }

  @HandlePrismaError(DbOperationType.UPDATE)
  async update(
    where: Prisma.GoogleAuthWhereUniqueInput,
    data: Prisma.GoogleAuthUpdateInput,
    additional?: { select?: Prisma.GoogleAuthSelect },
  ): Promise<GoogleAuth> {
    return this.getWriteClient().googleAuth.update({
      where,
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async delete(where: Prisma.GoogleAuthWhereUniqueInput): Promise<GoogleAuth> {
    return this.getWriteClient().googleAuth.delete({ where });
  }
}
