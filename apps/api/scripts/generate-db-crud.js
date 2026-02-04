#!/usr/bin/env node
/**
 * Prisma CRUD Module Generator
 *
 * 在 prisma generate / build 后自动为 schema 中的 model 生成：
 * - get(where) -> findFirst
 * - getById(id) -> findUnique
 * - getByXxx(xxx) -> 对每个 @unique 单字段生成 findUnique
 * - list, create, update, delete
 *
 * 参考：libs/domain/db/src/modules/email-auth/email-auth.service.ts
 *
 * 自动触发时机（勿删）：
 *   - pnpm db:generate → prisma generate && node scripts/generate-db-crud.js
 *   - pnpm build      → prisma format && prisma generate && node scripts/generate-db-crud.js && nest build
 *
 * EXCLUDE_MODELS：不生成、保留手写逻辑的 model。需要手写/特殊逻辑的 model 在此加入，
 *   对应目录（如 user-info、country-code）不会被本脚本覆盖。
 *
 * 使用：node scripts/generate-db-crud.js
 * 输出：libs/domain/db/src/modules/<kebab-model>/*.ts（仅覆盖由本脚本生成的模块）
 */

const fs = require('fs');
const path = require('path');

const SCHEMA_PATH = path.resolve(__dirname, '../prisma/schema.prisma');
const MODULES_DIR = path.resolve(__dirname, '../generated/db/modules');
const DB_INDEX_PATH = path.resolve(__dirname, '../generated/db/index.ts');

// 不生成、保留手写逻辑的 model（可在此增加）
const EXCLUDE_MODELS = new Set([
  'Message',
  'MessageRecipient',
  'UserInfo',
  'CountryCode',
  'PersonaTemplate',
  'BotUsageLog',
]);

function pascalToKebab(str) {
  return str.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
}

function pascalToCamel(str) {
  return str[0].toLowerCase() + str.slice(1);
}

/**
 * 解析 Prisma schema，提取 model 列表及其 id、unique、isDeleted
 */
function parseSchema(content) {
  const models = [];
  const lines = content.split('\n');
  let current = null;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();

    const modelStart = t.match(/^model\s+(\w+)\s*\{/);
    if (modelStart) {
      current = {
        name: modelStart[1],
        idField: null,
        uniqueFields: [],
        compositeUniques: [],
        hasIsDeleted: false,
        hasCreatedAt: false,
      };
      braceDepth = 1;
      continue;
    }

    if (!current) continue;

    if (t.includes('{')) braceDepth += (t.match(/\{/g) || []).length;
    if (t.includes('}')) {
      braceDepth -= (t.match(/\}/g) || []).length;
      if (braceDepth === 0) {
        // 无 @id 时，若存在单字段 @unique，则用其作为 getById 的键
        if (!current.idField && current.uniqueFields.length >= 1) {
          current.idField = current.uniqueFields[0];
        }
        models.push(current);
        current = null;
      }
      continue;
    }

    if (braceDepth !== 1) continue;

    // @@unique([a, b])
    const composite = t.match(/^@@unique\s*\(\s*\[\s*([^\]]+)\s*\]/);
    if (composite) {
      const fields = composite[1].split(',').map((s) => s.trim());
      if (fields.length > 0) current.compositeUniques.push(fields);
      continue;
    }

    if (t.startsWith('@@')) continue;

    // 字段: name Type @id? @unique?
    const fieldMatch = t.match(/^(\w+)\s+/);
    if (!fieldMatch) continue;

    const fieldName = fieldMatch[1];
    if (t.includes('@id')) current.idField = fieldName;
    if (t.includes('@unique') && !t.includes('@id')) {
      if (!current.uniqueFields.includes(fieldName)) current.uniqueFields.push(fieldName);
    }
    if (fieldName === 'isDeleted') current.hasIsDeleted = true;
    if (fieldName === 'createdAt') current.hasCreatedAt = true;
  }

  return models;
}

function jsTypeFromPrisma(fieldType) {
  if (['String', 'DateTime'].includes(fieldType) || fieldType.endsWith('?')) return 'string';
  if (['Int', 'BigInt'].includes(fieldType.replace('?', ''))) return 'number';
  if (fieldType === 'Boolean' || fieldType === 'Boolean?') return 'boolean';
  return 'string';
}

/**
 * 生成 Service 文件内容
 */
function generateService(model) {
  const { name, idField, uniqueFields, hasIsDeleted, hasCreatedAt } = model;
  const clientName = pascalToCamel(name);
  const kebab = pascalToKebab(name);

  const whereInput = `Prisma.${name}WhereInput`;
  const whereUniqueInput = `Prisma.${name}WhereUniqueInput`;
  const orderByType = `Prisma.${name}OrderByWithRelationInput`;
  const selectType = `Prisma.${name}Select`;
  const createInput = `Prisma.${name}CreateInput`;
  const updateInput = `Prisma.${name}UpdateInput`;
  // additional 仅使用 select，避免无关联 model 的 Include 类型为 never 导致报错
  const additionalType = `{ select?: ${selectType} }`;

  const softWhere = hasIsDeleted ? '{ ...where, isDeleted: false }' : 'where';
  const softWhereUnique = hasIsDeleted ? '{ ...where, isDeleted: false }' : 'where';

  let getByMethods = '';
  for (const f of uniqueFields) {
    if (f === idField) continue; // getById 已覆盖，不重复生成 getByXxx
    const fn = 'getBy' + f.charAt(0).toUpperCase() + f.slice(1);
    getByMethods += `
  @HandlePrismaError(DbOperationType.QUERY)
  async ${fn}(value: string, additional?: ${additionalType}): Promise<${name} | null> {
    return this.getReadClient().${clientName}.findUnique({
      where: { ${f}: value${hasIsDeleted ? ', isDeleted: false' : ''} },
      ...additional,
    });
  }
`;
  }

  return `import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma';
import { TransactionalServiceBase } from '@app/shared-db';
import { HandlePrismaError, DbOperationType } from '@/utils/prisma-error.util';
import { AppConfig } from '@/config/validation';
import type { Prisma, ${name} } from '@prisma/client';

@Injectable()
export class ${name}Service extends TransactionalServiceBase {
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
    where: ${whereInput},
    additional?: ${additionalType},
  ): Promise<${name} | null> {
    return this.getReadClient().${clientName}.findFirst({
      where: ${softWhere},
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.QUERY)
  async getById(
    id: string,
    additional?: ${additionalType},
  ): Promise<${name} | null> {
    return this.getReadClient().${clientName}.findUnique({
      where: { ${idField}: id${hasIsDeleted ? ', isDeleted: false' : ''} },
      ...additional,
    });
  }
${getByMethods}
  @HandlePrismaError(DbOperationType.QUERY)
  async list(
    where: ${whereInput},
    pagination?: {
      orderBy?: ${orderByType};
      limit?: number;
      page?: number;
    },
    additional?: ${additionalType},
  ): Promise<{ list: ${name}[]; total: number; page: number; limit: number }> {
    const {
      orderBy = ${hasCreatedAt ? "{ createdAt: 'desc' }" : "{ id: 'desc' }"},
      limit = this.appConfig.MaxPageSize,
      page = 1,
    } = pagination || {};
    const skip = (page - 1) * limit;

    const [list, total] = await Promise.all([
      this.getReadClient().${clientName}.findMany({
        where: ${hasIsDeleted ? '{ ...where, isDeleted: false }' : 'where'},
        orderBy,
        take: limit,
        skip,
        ...additional,
      }),
      this.getReadClient().${clientName}.count({
        where: ${hasIsDeleted ? '{ ...where, isDeleted: false }' : 'where'},
      }),
    ]);

    return { list, total, page, limit };
  }

  @HandlePrismaError(DbOperationType.CREATE)
  async create(
    data: ${createInput},
    additional?: ${additionalType},
  ): Promise<${name}> {
    return this.getWriteClient().${clientName}.create({ data, ...additional });
  }

  @HandlePrismaError(DbOperationType.UPDATE)
  async update(
    where: ${whereUniqueInput},
    data: ${updateInput},
    additional?: ${additionalType},
  ): Promise<${name}> {
    return this.getWriteClient().${clientName}.update({
      where,
      data,
      ...additional,
    });
  }

  @HandlePrismaError(DbOperationType.DELETE)
  async delete(where: ${whereUniqueInput}): Promise<${name}> {
    return this.getWriteClient().${clientName}.delete({ where });
  }
}
`;
}

/**
 * 生成 Module 文件内容
 */
function generateModule(model) {
  const { name } = model;
  return `import { Module } from '@nestjs/common';
import { ${name}Service } from './${pascalToKebab(name)}.service';
import { PrismaModule } from '@app/prisma';
import { RedisModule } from '@app/redis';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, RedisModule, ConfigModule],
  providers: [${name}Service],
  exports: [${name}Service],
})
export class ${name}Module {}
`;
}

/**
 * 生成 index.ts
 */
function generateIndex(model) {
  const kebab = pascalToKebab(model.name);
  return `export * from './${kebab}.service';
export * from './${kebab}.module';
`;
}

function main() {
  if (!fs.existsSync(SCHEMA_PATH)) {
    console.warn('generate-db-crud: schema not found at', SCHEMA_PATH);
    process.exit(0);
    return;
  }

  const schemaContent = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const models = parseSchema(schemaContent);

  const generatedKebabs = [];
  for (const model of models) {
    if (EXCLUDE_MODELS.has(model.name)) continue;
    if (!model.idField) {
      console.warn('generate-db-crud: skip', model.name, '(no @id and no single @unique)');
      continue;
    }

    const kebab = pascalToKebab(model.name);
    const dir = path.join(MODULES_DIR, kebab);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const servicePath = path.join(dir, `${kebab}.service.ts`);
    const modulePath = path.join(dir, `${kebab}.module.ts`);
    const indexPath = path.join(dir, 'index.ts');

    fs.writeFileSync(servicePath, generateService(model), 'utf8');
    fs.writeFileSync(modulePath, generateModule(model), 'utf8');
    fs.writeFileSync(indexPath, generateIndex(model), 'utf8');
    generatedKebabs.push(kebab);
    console.log('generate-db-crud: wrote', kebab);
  }

  if (generatedKebabs.length) {
    console.log('generate-db-crud: done,', generatedKebabs.length, 'modules');
    ensureExportsInIndex(generatedKebabs);
  }
}

function ensureExportsInIndex(generatedKebabs) {
  if (!fs.existsSync(DB_INDEX_PATH)) return;
  const content = fs.readFileSync(DB_INDEX_PATH, 'utf8');
  const existing = new Set((content.match(/from\s+['\"]\.\/modules\/([^'"]+)['\"]/g) || []).map((m) => (m.match(/modules\/([^'"]+)/) || [])[1]));
  const toAdd = generatedKebabs.filter((k) => !existing.has(k));
  if (toAdd.length === 0) return;
  const append = toAdd.map((k) => `export * from './modules/${k}';`).join('\n');
  fs.writeFileSync(DB_INDEX_PATH, content.trimEnd() + '\n' + append + '\n', 'utf8');
  console.log('generate-db-crud: added exports for', toAdd.join(', '));
}

main();
