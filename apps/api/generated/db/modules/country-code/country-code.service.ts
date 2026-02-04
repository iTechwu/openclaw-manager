import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma';
import { TransactionalServiceBase } from '@app/shared-db';
import { HandlePrismaError, DbOperationType } from '@/utils/prisma-error.util';
import { AppConfig } from '@/config/validation';
import type { Prisma, CountryCode } from '@prisma/client';
import { PardxApp } from '@/config/dto/config.dto';

@Injectable()
export class CountryCodeService extends TransactionalServiceBase {
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
    where: Prisma.CountryCodeWhereUniqueInput,
    additional?: {
      select?: Prisma.CountryCodeSelect;
    },
  ): Promise<CountryCode | null> {
    return this.getReadClient().countryCode.findUnique({
      where,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async list(
    where: Prisma.CountryCodeWhereInput,
    pagination?: {
      orderBy?: Prisma.CountryCodeOrderByWithRelationInput;
      limit?: number;
      page?: number;
    },
    additional?: {
      select?: Prisma.CountryCodeSelect;
    },
  ) {
    const {
      orderBy = { continent: 'asc' },
      limit = this.appConfig.MaxPageSize,
      page = 1,
    } = pagination || {};
    const skip = (page - 1) * limit;

    const [list, total] = await Promise.all([
      this.getReadClient().countryCode.findMany({
        where: { ...where, isDeleted: false },
        orderBy,
        take: limit,
        skip,
        ...additional,
      }),
      this.getReadClient().countryCode.count({
        where: { ...where, isDeleted: false },
      }),
    ]);

    return { list, total, page, limit };
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async findByCode(code: string): Promise<CountryCode | null> {
    return this.getReadClient().countryCode.findFirst({
      where: { code, isDeleted: false },
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async findByContinent(continent: string): Promise<CountryCode[]> {
    return this.getReadClient().countryCode.findMany({
      where: { continent, isDeleted: false },
    });
  }

  @HandlePrismaError(DbOperationType.CREATE)
  async create(
    data: Prisma.CountryCodeCreateInput,
    additional?: {
      select?: Prisma.CountryCodeSelect;
    },
  ): Promise<CountryCode> {
    return this.getWriteClient().countryCode.create({
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.UPDATE)
  async update(
    where: Prisma.CountryCodeWhereUniqueInput,
    data: Prisma.CountryCodeUpdateInput,
    additional?: {
      select?: Prisma.CountryCodeSelect;
    },
  ): Promise<CountryCode> {
    return this.getWriteClient().countryCode.update({
      where,
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async delete(
    where: Prisma.CountryCodeWhereUniqueInput,
  ): Promise<CountryCode> {
    return this.getWriteClient().countryCode.delete({ where });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async loadRelations(): Promise<PardxApp.CountryReation> {
    const countryCodes = await this.getReadClient().countryCode.findMany({
      orderBy: { continent: 'asc' },
    });

    const relations: PardxApp.CountryReation = {
      us: [],
      eu: [],
      ap: [],
      cn: [],
    };

    for (const countryCode of countryCodes) {
      const continent = countryCode.continent as keyof PardxApp.CountryReation;
      if (relations[continent]) {
        relations[continent].push(countryCode.code);
      }
    }
    return relations;
  }
}
