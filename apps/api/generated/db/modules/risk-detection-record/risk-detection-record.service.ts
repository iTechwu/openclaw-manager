import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma';
import { TransactionalServiceBase } from '@app/shared-db';
import { HandlePrismaError, DbOperationType } from '@/utils/prisma-error.util';
import { AppConfig } from '@/config/validation';
import type { Prisma, RiskDetectionRecord } from '@prisma/client';

@Injectable()
export class RiskDetectionRecordService extends TransactionalServiceBase {
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
    where: Prisma.RiskDetectionRecordWhereInput,
    additional?: { select?: Prisma.RiskDetectionRecordSelect },
  ): Promise<RiskDetectionRecord | null> {
    return this.getReadClient().riskDetectionRecord.findFirst({
      where: { ...where, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getById(
    id: string,
    additional?: { select?: Prisma.RiskDetectionRecordSelect },
  ): Promise<RiskDetectionRecord | null> {
    return this.getReadClient().riskDetectionRecord.findUnique({
      where: { id: id, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async list(
    where: Prisma.RiskDetectionRecordWhereInput,
    pagination?: {
      orderBy?: Prisma.RiskDetectionRecordOrderByWithRelationInput;
      limit?: number;
      page?: number;
    },
    additional?: { select?: Prisma.RiskDetectionRecordSelect },
  ): Promise<{ list: RiskDetectionRecord[]; total: number; page: number; limit: number }> {
    const {
      orderBy = { createdAt: 'desc' },
      limit = this.appConfig.MaxPageSize,
      page = 1,
    } = pagination || {};
    const skip = (page - 1) * limit;

    const [list, total] = await Promise.all([
      this.getReadClient().riskDetectionRecord.findMany({
        where: { ...where, isDeleted: false },
        orderBy,
        take: limit,
        skip,
        ...additional,
      }),
      this.getReadClient().riskDetectionRecord.count({
        where: { ...where, isDeleted: false },
      }),
    ]);

    return { list, total, page, limit };
  }

  @HandlePrismaError(DbOperationType.CREATE)
  async create(
    data: Prisma.RiskDetectionRecordCreateInput,
    additional?: { select?: Prisma.RiskDetectionRecordSelect },
  ): Promise<RiskDetectionRecord> {
    return this.getWriteClient().riskDetectionRecord.create({ data, ...additional });
  }

  @HandlePrismaError(DbOperationType.UPDATE)
  async update(
    where: Prisma.RiskDetectionRecordWhereUniqueInput,
    data: Prisma.RiskDetectionRecordUpdateInput,
    additional?: { select?: Prisma.RiskDetectionRecordSelect },
  ): Promise<RiskDetectionRecord> {
    return this.getWriteClient().riskDetectionRecord.update({
      where,
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async delete(where: Prisma.RiskDetectionRecordWhereUniqueInput): Promise<RiskDetectionRecord> {
    return this.getWriteClient().riskDetectionRecord.delete({ where });
  }
}
