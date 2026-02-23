import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma';
import { TransactionalServiceBase } from '@app/shared-db';
import { HandlePrismaError, DbOperationType } from '@/utils/prisma-error.util';
import { AppConfig } from '@/config/validation';
import type { Prisma, FeishuPairingRecord } from '@prisma/client';

@Injectable()
export class FeishuPairingRecordService extends TransactionalServiceBase {
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
    where: Prisma.FeishuPairingRecordWhereInput,
    additional?: { select?: Prisma.FeishuPairingRecordSelect },
  ): Promise<FeishuPairingRecord | null> {
    return this.getReadClient().feishuPairingRecord.findFirst({
      where: { ...where, isDeleted: false },
      ...additional,
    });
  }

  /**
   * 获取记录（包含软删除的记录）
   * 用于检查唯一约束冲突
   */
  @HandlePrismaError(DbOperationType.QUERY)
  async getIncludingDeleted(
    where: Prisma.FeishuPairingRecordWhereInput,
    additional?: { select?: Prisma.FeishuPairingRecordSelect },
  ): Promise<FeishuPairingRecord | null> {
    return this.getReadClient().feishuPairingRecord.findFirst({
      where,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getById(
    id: string,
    additional?: { select?: Prisma.FeishuPairingRecordSelect },
  ): Promise<FeishuPairingRecord | null> {
    return this.getReadClient().feishuPairingRecord.findUnique({
      where: { id: id, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async list(
    where: Prisma.FeishuPairingRecordWhereInput,
    pagination?: {
      orderBy?: Prisma.FeishuPairingRecordOrderByWithRelationInput;
      limit?: number;
      page?: number;
    },
    additional?: { select?: Prisma.FeishuPairingRecordSelect },
  ): Promise<{ list: FeishuPairingRecord[]; total: number; page: number; limit: number }> {
    const {
      orderBy = { createdAt: 'desc' },
      limit = this.appConfig.MaxPageSize,
      page = 1,
    } = pagination || {};
    const skip = (page - 1) * limit;

    const [list, total] = await Promise.all([
      this.getReadClient().feishuPairingRecord.findMany({
        where: { ...where, isDeleted: false },
        orderBy,
        take: limit,
        skip,
        ...additional,
      }),
      this.getReadClient().feishuPairingRecord.count({
        where: { ...where, isDeleted: false },
      }),
    ]);

    return { list, total, page, limit };
  }

  @HandlePrismaError(DbOperationType.CREATE)
  async create(
    data: Prisma.FeishuPairingRecordCreateInput,
    additional?: { select?: Prisma.FeishuPairingRecordSelect },
  ): Promise<FeishuPairingRecord> {
    return this.getWriteClient().feishuPairingRecord.create({ data, ...additional });
  }

  @HandlePrismaError(DbOperationType.UPDATE)
  async update(
    where: Prisma.FeishuPairingRecordWhereUniqueInput,
    data: Prisma.FeishuPairingRecordUpdateInput,
    additional?: { select?: Prisma.FeishuPairingRecordSelect },
  ): Promise<FeishuPairingRecord> {
    return this.getWriteClient().feishuPairingRecord.update({
      where,
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async delete(where: Prisma.FeishuPairingRecordWhereUniqueInput): Promise<FeishuPairingRecord> {
    return this.getWriteClient().feishuPairingRecord.delete({ where });
  }
}
