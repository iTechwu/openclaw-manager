import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma';
import { TransactionalServiceBase } from '@app/shared-db';
import { HandlePrismaError, DbOperationType } from '@/utils/prisma-error.util';
import { AppConfig } from '@/config/validation';
import type { Prisma, FallbackChainModel } from '@prisma/client';

@Injectable()
export class FallbackChainModelService extends TransactionalServiceBase {
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
    where: Prisma.FallbackChainModelWhereInput,
    additional?: {
      select?: Prisma.FallbackChainModelSelect;
      include?: Prisma.FallbackChainModelInclude;
    },
  ): Promise<FallbackChainModel | null> {
    return this.getReadClient().fallbackChainModel.findFirst({
      where,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getById(
    id: string,
    additional?: {
      select?: Prisma.FallbackChainModelSelect;
      include?: Prisma.FallbackChainModelInclude;
    },
  ): Promise<FallbackChainModel | null> {
    return this.getReadClient().fallbackChainModel.findUnique({
      where: { id },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async list(
    where: Prisma.FallbackChainModelWhereInput,
    pagination?: {
      orderBy?: Prisma.FallbackChainModelOrderByWithRelationInput;
      limit?: number;
      page?: number;
    },
    additional?: {
      select?: Prisma.FallbackChainModelSelect;
      include?: Prisma.FallbackChainModelInclude;
    },
  ): Promise<{
    list: FallbackChainModel[];
    total: number;
    page: number;
    limit: number;
  }> {
    const {
      orderBy = { priority: 'asc' },
      limit = this.appConfig.MaxPageSize,
      page = 1,
    } = pagination || {};
    const skip = (page - 1) * limit;

    const [list, total] = await Promise.all([
      this.getReadClient().fallbackChainModel.findMany({
        where,
        orderBy,
        take: limit,
        skip,
        ...additional,
      }),
      this.getReadClient().fallbackChainModel.count({ where }),
    ]);

    return { list, total, page, limit };
  }

  /**
   * 获取指定 FallbackChain 的所有模型，按优先级排序，包含 ModelCatalog 信息
   */
  @HandlePrismaError(DbOperationType.QUERY)
  async listByChainId(fallbackChainId: string) {
    return this.getReadClient().fallbackChainModel.findMany({
      where: { fallbackChainId },
      include: {
        modelCatalog: true,
      },
      orderBy: { priority: 'asc' },
    });
  }

  /**
   * 批量替换指定 FallbackChain 的模型列表（先删后增）
   */
  @HandlePrismaError(DbOperationType.CREATE)
  async replaceChainModels(
    fallbackChainId: string,
    models: Omit<Prisma.FallbackChainModelCreateManyInput, 'fallbackChainId'>[],
  ) {
    // 先删除旧的
    await this.getWriteClient().fallbackChainModel.deleteMany({
      where: { fallbackChainId },
    });
    // 再批量创建新的
    if (models.length > 0) {
      await this.getWriteClient().fallbackChainModel.createMany({
        data: models.map((m) => ({ ...m, fallbackChainId })),
      });
    }
    // 返回新创建的列表
    return this.listByChainId(fallbackChainId);
  }

  @HandlePrismaError(DbOperationType.CREATE)
  async create(
    data: Prisma.FallbackChainModelCreateInput,
    additional?: { select?: Prisma.FallbackChainModelSelect },
  ): Promise<FallbackChainModel> {
    return this.getWriteClient().fallbackChainModel.create({
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.UPDATE)
  async update(
    where: Prisma.FallbackChainModelWhereUniqueInput,
    data: Prisma.FallbackChainModelUpdateInput,
    additional?: { select?: Prisma.FallbackChainModelSelect },
  ): Promise<FallbackChainModel> {
    return this.getWriteClient().fallbackChainModel.update({
      where,
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async delete(
    where: Prisma.FallbackChainModelWhereUniqueInput,
  ): Promise<FallbackChainModel> {
    return this.getWriteClient().fallbackChainModel.delete({ where });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async deleteByChainId(fallbackChainId: string) {
    return this.getWriteClient().fallbackChainModel.deleteMany({
      where: { fallbackChainId },
    });
  }
}
