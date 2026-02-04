import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma';
import { TransactionalServiceBase } from '@app/shared-db';
import { HandlePrismaError, DbOperationType } from '@/utils/prisma-error.util';
import { AppConfig } from '@/config/validation';
import type { Prisma, EmailAuth } from '@prisma/client';

@Injectable()
export class EmailAuthService extends TransactionalServiceBase {
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
    where: Prisma.EmailAuthWhereInput,
    additional?: { select?: Prisma.EmailAuthSelect },
  ): Promise<EmailAuth | null> {
    return this.getReadClient().emailAuth.findFirst({
      where: { ...where, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getById(
    id: string,
    additional?: { select?: Prisma.EmailAuthSelect },
  ): Promise<EmailAuth | null> {
    return this.getReadClient().emailAuth.findUnique({
      where: { email: id, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async list(
    where: Prisma.EmailAuthWhereInput,
    pagination?: {
      orderBy?: Prisma.EmailAuthOrderByWithRelationInput;
      limit?: number;
      page?: number;
    },
    additional?: { select?: Prisma.EmailAuthSelect },
  ): Promise<{ list: EmailAuth[]; total: number; page: number; limit: number }> {
    const {
      orderBy = { createdAt: 'desc' },
      limit = this.appConfig.MaxPageSize,
      page = 1,
    } = pagination || {};
    const skip = (page - 1) * limit;

    const [list, total] = await Promise.all([
      this.getReadClient().emailAuth.findMany({
        where: { ...where, isDeleted: false },
        orderBy,
        take: limit,
        skip,
        ...additional,
      }),
      this.getReadClient().emailAuth.count({
        where: { ...where, isDeleted: false },
      }),
    ]);

    return { list, total, page, limit };
  }

  @HandlePrismaError(DbOperationType.CREATE)
  async create(
    data: Prisma.EmailAuthCreateInput,
    additional?: { select?: Prisma.EmailAuthSelect },
  ): Promise<EmailAuth> {
    return this.getWriteClient().emailAuth.create({ data, ...additional });
  }

  @HandlePrismaError(DbOperationType.UPDATE)
  async update(
    where: Prisma.EmailAuthWhereUniqueInput,
    data: Prisma.EmailAuthUpdateInput,
    additional?: { select?: Prisma.EmailAuthSelect },
  ): Promise<EmailAuth> {
    return this.getWriteClient().emailAuth.update({
      where,
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async delete(where: Prisma.EmailAuthWhereUniqueInput): Promise<EmailAuth> {
    return this.getWriteClient().emailAuth.delete({ where });
  }
}
