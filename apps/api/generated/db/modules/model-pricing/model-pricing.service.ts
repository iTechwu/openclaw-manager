import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma';
import { TransactionalServiceBase } from '@app/shared-db';
import { HandlePrismaError, DbOperationType } from '@/utils/prisma-error.util';
import { AppConfig } from '@/config/validation';
import type { Prisma, ModelPricing } from '@prisma/client';

@Injectable()
export class ModelPricingService extends TransactionalServiceBase {
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
    where: Prisma.ModelPricingWhereInput,
    additional?: { select?: Prisma.ModelPricingSelect },
  ): Promise<ModelPricing | null> {
    return this.getReadClient().modelPricing.findFirst({
      where: { ...where, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getById(
    id: string,
    additional?: { select?: Prisma.ModelPricingSelect },
  ): Promise<ModelPricing | null> {
    return this.getReadClient().modelPricing.findUnique({
      where: { id: id, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getByModel(value: string, additional?: { select?: Prisma.ModelPricingSelect }): Promise<ModelPricing | null> {
    return this.getReadClient().modelPricing.findUnique({
      where: { model: value, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async list(
    where: Prisma.ModelPricingWhereInput,
    pagination?: {
      orderBy?: Prisma.ModelPricingOrderByWithRelationInput;
      limit?: number;
      page?: number;
    },
    additional?: { select?: Prisma.ModelPricingSelect },
  ): Promise<{ list: ModelPricing[]; total: number; page: number; limit: number }> {
    const {
      orderBy = { createdAt: 'desc' },
      limit = this.appConfig.MaxPageSize,
      page = 1,
    } = pagination || {};
    const skip = (page - 1) * limit;

    const [list, total] = await Promise.all([
      this.getReadClient().modelPricing.findMany({
        where: { ...where, isDeleted: false },
        orderBy,
        take: limit,
        skip,
        ...additional,
      }),
      this.getReadClient().modelPricing.count({
        where: { ...where, isDeleted: false },
      }),
    ]);

    return { list, total, page, limit };
  }

  @HandlePrismaError(DbOperationType.CREATE)
  async create(
    data: Prisma.ModelPricingCreateInput,
    additional?: { select?: Prisma.ModelPricingSelect },
  ): Promise<ModelPricing> {
    return this.getWriteClient().modelPricing.create({ data, ...additional });
  }

  @HandlePrismaError(DbOperationType.UPDATE)
  async update(
    where: Prisma.ModelPricingWhereUniqueInput,
    data: Prisma.ModelPricingUpdateInput,
    additional?: { select?: Prisma.ModelPricingSelect },
  ): Promise<ModelPricing> {
    return this.getWriteClient().modelPricing.update({
      where,
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async delete(where: Prisma.ModelPricingWhereUniqueInput): Promise<ModelPricing> {
    return this.getWriteClient().modelPricing.delete({ where });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async listAll(): Promise<ModelPricing[]> {
    return this.getReadClient().modelPricing.findMany({
      where: { isDeleted: false, isEnabled: true },
      orderBy: { model: 'asc' },
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async listByVendor(vendor: string): Promise<ModelPricing[]> {
    return this.getReadClient().modelPricing.findMany({
      where: { vendor, isDeleted: false, isEnabled: true },
      orderBy: { model: 'asc' },
    });
  }

  @HandlePrismaError(DbOperationType.UPDATE)
  async upsert(
    model: string,
    data: Omit<Prisma.ModelPricingCreateInput, 'model'>,
  ): Promise<ModelPricing> {
    return this.getWriteClient().modelPricing.upsert({
      where: { model },
      create: { model, ...data },
      update: { ...data, priceUpdatedAt: new Date() },
    });
  }

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
