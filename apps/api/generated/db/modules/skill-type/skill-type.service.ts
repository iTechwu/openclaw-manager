import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma';
import { TransactionalServiceBase } from '@app/shared-db';
import { HandlePrismaError, DbOperationType } from '@/utils/prisma-error.util';
import { AppConfig } from '@/config/validation';
import type { Prisma, SkillType } from '@prisma/client';

@Injectable()
export class SkillTypeService extends TransactionalServiceBase {
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
    where: Prisma.SkillTypeWhereInput,
    additional?: { select?: Prisma.SkillTypeSelect },
  ): Promise<SkillType | null> {
    return this.getReadClient().skillType.findFirst({
      where: { ...where, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getById(
    id: string,
    additional?: { select?: Prisma.SkillTypeSelect },
  ): Promise<SkillType | null> {
    return this.getReadClient().skillType.findUnique({
      where: { id: id, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getBySlug(
    value: string,
    additional?: { select?: Prisma.SkillTypeSelect },
  ): Promise<SkillType | null> {
    return this.getReadClient().skillType.findUnique({
      where: { slug: value, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async list(
    where: Prisma.SkillTypeWhereInput,
    pagination?: {
      orderBy?: Prisma.SkillTypeOrderByWithRelationInput;
      limit?: number;
      page?: number;
    },
    additional?: { select?: Prisma.SkillTypeSelect },
  ): Promise<{
    list: SkillType[];
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
      this.getReadClient().skillType.findMany({
        where: { ...where, isDeleted: false },
        orderBy,
        take: limit,
        skip,
        ...additional,
      }),
      this.getReadClient().skillType.count({
        where: { ...where, isDeleted: false },
      }),
    ]);

    return { list, total, page, limit };
  }

  @HandlePrismaError(DbOperationType.CREATE)
  async create(
    data: Prisma.SkillTypeCreateInput,
    additional?: { select?: Prisma.SkillTypeSelect },
  ): Promise<SkillType> {
    return this.getWriteClient().skillType.create({ data, ...additional });
  }

  @HandlePrismaError(DbOperationType.UPDATE)
  async update(
    where: Prisma.SkillTypeWhereUniqueInput,
    data: Prisma.SkillTypeUpdateInput,
    additional?: { select?: Prisma.SkillTypeSelect },
  ): Promise<SkillType> {
    return this.getWriteClient().skillType.update({
      where,
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async delete(where: Prisma.SkillTypeWhereUniqueInput): Promise<SkillType> {
    return this.getWriteClient().skillType.delete({ where });
  }

  /**
   * Upsert skill type by slug
   */
  @HandlePrismaError(DbOperationType.UPDATE)
  async upsertBySlug(
    slug: string,
    data: Omit<Prisma.SkillTypeCreateInput, 'slug'>,
    additional?: { select?: Prisma.SkillTypeSelect },
  ): Promise<SkillType> {
    return this.getWriteClient().skillType.upsert({
      where: { slug },
      create: { ...data, slug },
      update: data,
      ...additional,
    });
  }

  /**
   * List all skill types with skill count
   */
  @HandlePrismaError(DbOperationType.QUERY)
  async listWithSkillCount(
    orderBy: Prisma.SkillTypeOrderByWithRelationInput = { sortOrder: 'asc' },
  ): Promise<Array<SkillType & { _count: { skills: number } }>> {
    return this.getReadClient().skillType.findMany({
      where: { isDeleted: false },
      orderBy,
      include: {
        _count: {
          select: { skills: { where: { isDeleted: false } } },
        },
      },
    });
  }
}
