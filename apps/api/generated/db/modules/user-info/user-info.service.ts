import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma';
import { TransactionalServiceBase } from '@app/shared-db';
import { AppConfig } from '@/config/validation';
import { HandlePrismaError, DbOperationType } from '@/utils/prisma-error.util';
import type { Prisma, UserInfo } from '@prisma/client';

@Injectable()
export class UserInfoService extends TransactionalServiceBase {
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
    where: Prisma.UserInfoWhereUniqueInput,
    additional?: {
      select?: Prisma.UserInfoSelect;
      include?: Prisma.UserInfoInclude;
    },
  ): Promise<UserInfo | null> {
    return this.getReadClient().userInfo.findUnique({
      where: { ...where, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getByEmail(email: string): Promise<UserInfo | null> {
    return this.getReadClient().userInfo.findUnique({
      where: { email, isDeleted: false },
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getByMobile(mobile: string): Promise<UserInfo | null> {
    return this.getReadClient().userInfo.findUnique({
      where: { mobile, isDeleted: false },
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async list(
    where: Prisma.UserInfoWhereInput,
    pagination?: {
      orderBy?: Prisma.UserInfoOrderByWithRelationInput;
      limit?: number;
      page?: number;
    },
    additional?: {
      select?: Prisma.UserInfoSelect;
      include?: Prisma.UserInfoInclude;
    },
  ) {
    const {
      orderBy,
      limit = this.appConfig.MaxPageSize,
      page = 1,
    } = pagination || {};
    const skip = (page - 1) * limit;

    const [list, total] = await Promise.all([
      this.getReadClient().userInfo.findMany({
        where: { ...where, isDeleted: false },
        orderBy,
        take: limit,
        skip,
        ...additional,
      }),
      this.getReadClient().userInfo.count({
        where: { ...where, isDeleted: false },
      }),
    ]);

    return { list, total, page, limit };
  }

  @HandlePrismaError(DbOperationType.CREATE)
  async create(
    data: Prisma.UserInfoCreateInput,
    additional?: {
      select?: Prisma.UserInfoSelect;
      include?: Prisma.UserInfoInclude;
    },
  ): Promise<UserInfo> {
    return this.getWriteClient().userInfo.create({
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.UPDATE)
  async update(
    where: Prisma.UserInfoWhereUniqueInput,
    data: Prisma.UserInfoUpdateInput,
    additional?: {
      select?: Prisma.UserInfoSelect;
      include?: Prisma.UserInfoInclude;
    },
  ): Promise<UserInfo> {
    return this.getWriteClient().userInfo.update({
      where,
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.UPDATE)
  async upsert(
    where: Prisma.UserInfoWhereUniqueInput,
    create: Prisma.UserInfoCreateInput,
    update: Prisma.UserInfoUpdateInput,
    additional?: {
      select?: Prisma.UserInfoSelect;
      include?: Prisma.UserInfoInclude;
    },
  ): Promise<UserInfo> {
    return this.getWriteClient().userInfo.upsert({
      where,
      create,
      update,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async delete(where: Prisma.UserInfoWhereUniqueInput): Promise<any> {
    return this.getWriteClient().userInfo.delete({
      where,
    });
  }
}
