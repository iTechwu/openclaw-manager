import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma';
import { TransactionalServiceBase } from '@app/shared-db';
import { HandlePrismaError, DbOperationType } from '@/utils/prisma-error.util';
import { AppConfig } from '@/config/validation';
import type { Prisma, Skill } from '@prisma/client';

@Injectable()
export class SkillService extends TransactionalServiceBase {
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
    where: Prisma.SkillWhereInput,
    additional?: { select?: Prisma.SkillSelect },
  ): Promise<Skill | null> {
    return this.getReadClient().skill.findFirst({
      where: { ...where, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getById(
    id: string,
    additional?: { select?: Prisma.SkillSelect },
  ): Promise<Skill | null> {
    return this.getReadClient().skill.findUnique({
      where: { id: id, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async list(
    where: Prisma.SkillWhereInput,
    pagination?: {
      orderBy?: Prisma.SkillOrderByWithRelationInput;
      limit?: number;
      page?: number;
    },
    additional?: { select?: Prisma.SkillSelect },
  ): Promise<{ list: Skill[]; total: number; page: number; limit: number }> {
    const {
      orderBy = { createdAt: 'desc' },
      limit = this.appConfig.MaxPageSize,
      page = 1,
    } = pagination || {};
    const skip = (page - 1) * limit;

    const [list, total] = await Promise.all([
      this.getReadClient().skill.findMany({
        where: { ...where, isDeleted: false },
        orderBy,
        take: limit,
        skip,
        ...additional,
      }),
      this.getReadClient().skill.count({
        where: { ...where, isDeleted: false },
      }),
    ]);

    return { list, total, page, limit };
  }

  @HandlePrismaError(DbOperationType.CREATE)
  async create(
    data: Prisma.SkillCreateInput,
    additional?: { select?: Prisma.SkillSelect },
  ): Promise<Skill> {
    return this.getWriteClient().skill.create({ data, ...additional });
  }

  @HandlePrismaError(DbOperationType.UPDATE)
  async update(
    where: Prisma.SkillWhereUniqueInput,
    data: Prisma.SkillUpdateInput,
    additional?: { select?: Prisma.SkillSelect },
  ): Promise<Skill> {
    return this.getWriteClient().skill.update({
      where,
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async delete(where: Prisma.SkillWhereUniqueInput): Promise<Skill> {
    return this.getWriteClient().skill.delete({ where });
  }

  /**
   * Upsert skill by source and slug (for external sync)
   */
  @HandlePrismaError(DbOperationType.UPDATE)
  async upsertBySourceSlug(
    source: string,
    slug: string,
    data: Omit<Prisma.SkillCreateInput, 'slug'>,
    additional?: { select?: Prisma.SkillSelect },
  ): Promise<Skill> {
    return this.getWriteClient().skill.upsert({
      where: {
        b_skill_source_slug_key: { source, slug },
      },
      create: { ...data, slug },
      update: data,
      ...additional,
    });
  }

  /**
   * Get skills by source
   */
  @HandlePrismaError(DbOperationType.QUERY)
  async getBySource(
    source: string,
    pagination?: {
      orderBy?: Prisma.SkillOrderByWithRelationInput;
      limit?: number;
      page?: number;
    },
  ): Promise<{ list: Skill[]; total: number; page: number; limit: number }> {
    return this.list({ source }, pagination);
  }

  /**
   * Count skills by source
   */
  @HandlePrismaError(DbOperationType.QUERY)
  async countBySource(source: string): Promise<number> {
    return this.getReadClient().skill.count({
      where: { source, isDeleted: false },
    });
  }

  /**
   * Find and remove duplicate skills by source and slug
   * Keeps the oldest record (by createdAt) and soft-deletes the rest
   * @returns Number of duplicates removed
   */
  @HandlePrismaError(DbOperationType.UPDATE)
  async removeDuplicates(source: string): Promise<number> {
    // Find all duplicates
    const duplicates = await this.getReadClient().$queryRaw<
      Array<{ source: string; slug: string; count: bigint }>
    >`
      SELECT source, slug, COUNT(*) as count
      FROM b_skill
      WHERE is_deleted = false AND source = ${source}
      GROUP BY source, slug
      HAVING COUNT(*) > 1
    `;

    if (duplicates.length === 0) {
      return 0;
    }

    let removedCount = 0;

    for (const dup of duplicates) {
      // Get all records with this source+slug, ordered by createdAt
      const records = await this.getReadClient().skill.findMany({
        where: {
          source: dup.source,
          slug: dup.slug,
          isDeleted: false,
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });

      // Keep the first (oldest), soft-delete the rest
      const idsToDelete = records.slice(1).map((r) => r.id);

      if (idsToDelete.length > 0) {
        await this.getWriteClient().skill.updateMany({
          where: { id: { in: idsToDelete } },
          data: { isDeleted: true, deletedAt: new Date() },
        });
        removedCount += idsToDelete.length;
      }
    }

    return removedCount;
  }
}
