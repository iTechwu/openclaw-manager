import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma';
import { TransactionalServiceBase } from '@app/shared-db';
import { HandlePrismaError, DbOperationType } from '@/utils/prisma-error.util';
import { AppConfig } from '@/config/validation';
import type { Prisma, ComplexityRoutingModelMapping } from '@prisma/client';

@Injectable()
export class ComplexityRoutingModelMappingService extends TransactionalServiceBase {
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
    where: Prisma.ComplexityRoutingModelMappingWhereInput,
    additional?: {
      select?: Prisma.ComplexityRoutingModelMappingSelect;
      include?: Prisma.ComplexityRoutingModelMappingInclude;
    },
  ): Promise<ComplexityRoutingModelMapping | null> {
    return this.getReadClient().complexityRoutingModelMapping.findFirst({
      where,
      ...additional,
    });
  }

  /**
   * 获取指定 ComplexityRoutingConfig 的所有模型映射，包含 ModelAvailability 信息
   */
  @HandlePrismaError(DbOperationType.QUERY)
  async listByConfigId(complexityConfigId: string) {
    return this.getReadClient().complexityRoutingModelMapping.findMany({
      where: { complexityConfigId },
      include: {
        modelAvailability: {
          include: {
            providerKey: true,
            modelPricing: true,
          },
        },
      },
      orderBy: [{ complexityLevel: 'asc' }, { priority: 'asc' }],
    });
  }

  /**
   * 批量替换指定 ComplexityRoutingConfig 的模型映射（先删后增）
   */
  @HandlePrismaError(DbOperationType.CREATE)
  async replaceMappings(
    complexityConfigId: string,
    mappings: Omit<
      Prisma.ComplexityRoutingModelMappingCreateManyInput,
      'complexityConfigId'
    >[],
  ) {
    await this.getWriteClient().complexityRoutingModelMapping.deleteMany({
      where: { complexityConfigId },
    });
    if (mappings.length > 0) {
      await this.getWriteClient().complexityRoutingModelMapping.createMany({
        data: mappings.map((m) => ({ ...m, complexityConfigId })),
      });
    }
    return this.listByConfigId(complexityConfigId);
  }

  @HandlePrismaError(DbOperationType.CREATE)
  async create(
    data: Prisma.ComplexityRoutingModelMappingCreateInput,
    additional?: {
      select?: Prisma.ComplexityRoutingModelMappingSelect;
    },
  ): Promise<ComplexityRoutingModelMapping> {
    return this.getWriteClient().complexityRoutingModelMapping.create({
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async delete(
    where: Prisma.ComplexityRoutingModelMappingWhereUniqueInput,
  ): Promise<ComplexityRoutingModelMapping> {
    return this.getWriteClient().complexityRoutingModelMapping.delete({
      where,
    });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async deleteByConfigId(complexityConfigId: string) {
    return this.getWriteClient().complexityRoutingModelMapping.deleteMany({
      where: { complexityConfigId },
    });
  }
}
