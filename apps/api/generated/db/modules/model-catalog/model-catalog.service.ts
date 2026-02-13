import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma';
import { TransactionalServiceBase } from '@app/shared-db';
import { HandlePrismaError, DbOperationType } from '@/utils/prisma-error.util';
import { AppConfig } from '@/config/validation';
import type { Prisma, ModelCatalog } from '@prisma/client';

@Injectable()
export class ModelCatalogService extends TransactionalServiceBase {
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
    where: Prisma.ModelCatalogWhereInput,
    additional?: { select?: Prisma.ModelCatalogSelect },
  ): Promise<ModelCatalog | null> {
    return this.getReadClient().modelCatalog.findFirst({
      where: { ...where, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getById(
    id: string,
    additional?: { select?: Prisma.ModelCatalogSelect },
  ): Promise<ModelCatalog | null> {
    return this.getReadClient().modelCatalog.findUnique({
      where: { id: id, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getByModel(
    value: string,
    additional?: { select?: Prisma.ModelCatalogSelect },
  ): Promise<ModelCatalog | null> {
    return this.getReadClient().modelCatalog.findUnique({
      where: { model: value, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async list(
    where: Prisma.ModelCatalogWhereInput,
    pagination?: {
      orderBy?: Prisma.ModelCatalogOrderByWithRelationInput;
      limit?: number;
      page?: number;
    },
    additional?: { select?: Prisma.ModelCatalogSelect },
  ): Promise<{
    list: ModelCatalog[];
    total: number;
    page: number;
    limit: number;
  }> {
    const {
      orderBy = { createdAt: 'desc' },
      limit = this.appConfig.MaxPageSize,
      page = 1,
    } = pagination || {};
    const skip = (page - 1) * limit;

    const [list, total] = await Promise.all([
      this.getReadClient().modelCatalog.findMany({
        where: { ...where, isDeleted: false },
        orderBy,
        take: limit,
        skip,
        ...additional,
      }),
      this.getReadClient().modelCatalog.count({
        where: { ...where, isDeleted: false },
      }),
    ]);

    return { list, total, page, limit };
  }

  @HandlePrismaError(DbOperationType.CREATE)
  async create(
    data: Prisma.ModelCatalogCreateInput,
    additional?: { select?: Prisma.ModelCatalogSelect },
  ): Promise<ModelCatalog> {
    return this.getWriteClient().modelCatalog.create({ data, ...additional });
  }

  @HandlePrismaError(DbOperationType.UPDATE)
  async update(
    where: Prisma.ModelCatalogWhereUniqueInput,
    data: Prisma.ModelCatalogUpdateInput,
    additional?: { select?: Prisma.ModelCatalogSelect },
  ): Promise<ModelCatalog> {
    return this.getWriteClient().modelCatalog.update({
      where,
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async delete(
    where: Prisma.ModelCatalogWhereUniqueInput,
  ): Promise<ModelCatalog> {
    return this.getWriteClient().modelCatalog.delete({ where });
  }

  /**
   * 获取所有启用的模型目录
   */
  @HandlePrismaError(DbOperationType.QUERY)
  async listAll(): Promise<ModelCatalog[]> {
    return this.getReadClient().modelCatalog.findMany({
      where: { isDeleted: false, isEnabled: true },
      orderBy: { model: 'asc' },
    });
  }

  /**
   * 按供应商获取模型目录
   */
  @HandlePrismaError(DbOperationType.QUERY)
  async listByVendor(vendor: string): Promise<ModelCatalog[]> {
    return this.getReadClient().modelCatalog.findMany({
      where: { vendor, isDeleted: false, isEnabled: true },
      orderBy: { model: 'asc' },
    });
  }

  /**
   * 创建或更新模型目录
   */
  @HandlePrismaError(DbOperationType.UPDATE)
  async upsert(
    model: string,
    data: Omit<Prisma.ModelCatalogCreateInput, 'model'>,
  ): Promise<ModelCatalog> {
    return this.getWriteClient().modelCatalog.upsert({
      where: { model },
      create: { model, ...data },
      update: { ...data, priceUpdatedAt: new Date() },
    });
  }

  /**
   * 批量创建或更新模型目录
   */
  @HandlePrismaError(DbOperationType.UPDATE)
  async batchUpsert(
    pricings: Array<{
      model: string;
      vendor: string;
      inputPrice: number;
      outputPrice: number;
      displayName?: string;
      notes?: string;
    }>,
  ): Promise<number> {
    let count = 0;
    for (const pricing of pricings) {
      await this.upsert(pricing.model, {
        vendor: pricing.vendor,
        inputPrice: pricing.inputPrice,
        outputPrice: pricing.outputPrice,
        displayName: pricing.displayName,
        notes: pricing.notes,
      });
      count++;
    }
    return count;
  }
}
