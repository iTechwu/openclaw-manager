import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma';
import { TransactionalServiceBase } from '@app/shared-db';
import { HandlePrismaError, DbOperationType } from '@/utils/prisma-error.util';
import { AppConfig } from '@/config/validation';
import type { Prisma, PersonaTemplate } from '@prisma/client';

@Injectable()
export class PersonaTemplateService extends TransactionalServiceBase {
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
    where: Prisma.PersonaTemplateWhereInput,
    additional?: { select?: Prisma.PersonaTemplateSelect },
  ): Promise<PersonaTemplate | null> {
    return this.getReadClient().personaTemplate.findFirst({
      where: { ...where, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getById(
    id: string,
    additional?: { select?: Prisma.PersonaTemplateSelect },
  ): Promise<PersonaTemplate | null> {
    return this.getReadClient().personaTemplate.findUnique({
      where: { id: id, isDeleted: false },
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async list(
    where: Prisma.PersonaTemplateWhereInput,
    pagination?: {
      orderBy?:
        | Prisma.PersonaTemplateOrderByWithRelationInput
        | Prisma.PersonaTemplateOrderByWithRelationInput[];
      limit?: number;
      page?: number;
    },
    additional?: {
      select?: Prisma.PersonaTemplateSelect;
      include?: Prisma.PersonaTemplateInclude;
    },
  ): Promise<{
    list: (Partial<PersonaTemplate> & any)[];
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
      this.getReadClient().personaTemplate.findMany({
        where: { ...where, isDeleted: false },
        orderBy,
        take: limit,
        skip,
        ...additional,
      }),
      this.getReadClient().personaTemplate.count({
        where: { ...where, isDeleted: false },
      }),
    ]);

    return { list, total, page, limit };
  }

  @HandlePrismaError(DbOperationType.CREATE)
  async create(
    data: Prisma.PersonaTemplateCreateInput,
    additional?: { select?: Prisma.PersonaTemplateSelect },
  ): Promise<Partial<PersonaTemplate> & any> {
    return this.getWriteClient().personaTemplate.create({
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.UPDATE)
  async update(
    where: Prisma.PersonaTemplateWhereUniqueInput,
    data: Prisma.PersonaTemplateUpdateInput,
    additional?: { select?: Prisma.PersonaTemplateSelect },
  ): Promise<Partial<PersonaTemplate> & any> {
    return this.getWriteClient().personaTemplate.update({
      where,
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async delete(
    where: Prisma.PersonaTemplateWhereUniqueInput,
  ): Promise<Partial<PersonaTemplate> & any> {
    return this.getWriteClient().personaTemplate.delete({ where });
  }
}
