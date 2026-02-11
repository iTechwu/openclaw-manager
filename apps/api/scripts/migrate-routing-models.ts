#!/usr/bin/env ts-node
/**
 * 路由模型数据迁移脚本
 *
 * 将 FallbackChain.models (JSON) 和 ComplexityRoutingConfig.models (JSON)
 * 迁移到关联表 FallbackChainModel 和 ComplexityRoutingModelMapping
 *
 * 使用方法:
 *   npx ts-node scripts/migrate-routing-models.ts
 *
 *   # 或添加到 package.json scripts
 *   pnpm migrate:routing-models
 *
 * 环境变量:
 *   DATABASE_URL - 数据库连接字符串（必需）
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL environment variable is not set');
  process.exit(1);
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

interface JsonFallbackModel {
  vendor: string;
  model: string;
  protocol?: string;
  features?: Record<string, boolean>;
}

interface JsonComplexityModels {
  [level: string]: { vendor: string; model: string };
}

interface MigrationStats {
  fallbackChains: { processed: number; modelsCreated: number; skipped: number; notFound: string[] };
  complexityRouting: { processed: number; mappingsCreated: number; skipped: number; notFound: string[] };
  errors: string[];
}

/**
 * 根据 vendor + model 查找最佳 ModelAvailability 记录
 * 优先选择 isAvailable=true 的记录
 */
async function findModelAvailability(
  vendor: string,
  model: string,
): Promise<{ id: string; isAvailable: boolean } | null> {
  const results = await prisma.modelAvailability.findMany({
    where: {
      model,
      providerKey: { vendor, isDeleted: false },
    },
    select: { id: true, isAvailable: true },
    orderBy: { isAvailable: 'desc' }, // prefer available ones
  });
  return results[0] ?? null;
}

/**
 * 迁移 FallbackChain.models JSON → FallbackChainModel 关联表
 */
async function migrateFallbackChains(stats: MigrationStats): Promise<void> {
  console.log('\n📦 Migrating FallbackChain models...');

  const chains = await prisma.fallbackChain.findMany({
    where: { isDeleted: false },
    include: { chainModels: true },
  });

  for (const chain of chains) {
    // Skip if already has relation data
    if (chain.chainModels.length > 0) {
      console.log(`  ⏭️  Skip "${chain.name}" (${chain.chainId}) - already has ${chain.chainModels.length} chainModels`);
      stats.fallbackChains.skipped++;
      continue;
    }

    const jsonModels = chain.models as unknown as JsonFallbackModel[] | null;
    if (!jsonModels || jsonModels.length === 0) {
      console.log(`  ⏭️  Skip "${chain.name}" (${chain.chainId}) - no JSON models`);
      stats.fallbackChains.skipped++;
      continue;
    }

    console.log(`  🔄 Processing "${chain.name}" (${chain.chainId}) - ${jsonModels.length} models`);
    stats.fallbackChains.processed++;

    for (let i = 0; i < jsonModels.length; i++) {
      const jm = jsonModels[i]!;
      const ma = await findModelAvailability(jm.vendor, jm.model);

      if (!ma) {
        const key = `${jm.vendor}:${jm.model}`;
        console.log(`    ⚠️  ModelAvailability not found: ${key}`);
        stats.fallbackChains.notFound.push(`${chain.chainId} → ${key}`);
        continue;
      }

      try {
        await prisma.fallbackChainModel.create({
          data: {
            fallbackChainId: chain.id,
            modelAvailabilityId: ma.id,
            priority: i,
            protocolOverride: jm.protocol ?? null,
            featuresOverride: jm.features ? jm.features : undefined,
          },
        });
        stats.fallbackChains.modelsCreated++;
      } catch (error) {
        // Unique constraint violation = already exists
        if ((error as { code?: string }).code === 'P2002') {
          console.log(`    ⏭️  Already exists: ${jm.vendor}:${jm.model} in chain ${chain.chainId}`);
        } else {
          throw error;
        }
      }
    }
  }
}

const COMPLEXITY_LEVELS = ['super_easy', 'easy', 'medium', 'hard', 'super_hard'] as const;

/**
 * 迁移 ComplexityRoutingConfig.models JSON → ComplexityRoutingModelMapping 关联表
 */
async function migrateComplexityRouting(stats: MigrationStats): Promise<void> {
  console.log('\n📦 Migrating ComplexityRoutingConfig models...');

  const configs = await prisma.complexityRoutingConfig.findMany({
    where: { isDeleted: false },
    include: { modelMappings: true },
  });

  for (const config of configs) {
    if (config.modelMappings.length > 0) {
      console.log(`  ⏭️  Skip "${config.name}" (${config.configId}) - already has ${config.modelMappings.length} mappings`);
      stats.complexityRouting.skipped++;
      continue;
    }

    const jsonModels = config.models as JsonComplexityModels | null;
    if (!jsonModels || Object.keys(jsonModels).length === 0) {
      console.log(`  ⏭️  Skip "${config.name}" (${config.configId}) - no JSON models`);
      stats.complexityRouting.skipped++;
      continue;
    }

    console.log(`  🔄 Processing "${config.name}" (${config.configId})`);
    stats.complexityRouting.processed++;

    for (const level of COMPLEXITY_LEVELS) {
      const entry = jsonModels[level];
      if (!entry?.vendor || !entry?.model) continue;

      const ma = await findModelAvailability(entry.vendor, entry.model);

      if (!ma) {
        const key = `${entry.vendor}:${entry.model}`;
        console.log(`    ⚠️  ModelAvailability not found: ${key} (level: ${level})`);
        stats.complexityRouting.notFound.push(`${config.configId}/${level} → ${key}`);
        continue;
      }

      try {
        await prisma.complexityRoutingModelMapping.create({
          data: {
            complexityConfigId: config.id,
            complexityLevel: level,
            modelAvailabilityId: ma.id,
            priority: 0,
          },
        });
        stats.complexityRouting.mappingsCreated++;
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') {
          console.log(`    ⏭️  Already exists: ${entry.vendor}:${entry.model} for ${level}`);
        } else {
          throw error;
        }
      }
    }
  }
}

function printSummary(stats: MigrationStats): void {
  console.log('\n' + '='.repeat(60));
  console.log('📊 Migration Summary');
  console.log('='.repeat(60));

  console.log('\n🔗 FallbackChain:');
  console.log(`   Processed: ${stats.fallbackChains.processed}`);
  console.log(`   Models created: ${stats.fallbackChains.modelsCreated}`);
  console.log(`   Skipped: ${stats.fallbackChains.skipped}`);
  if (stats.fallbackChains.notFound.length > 0) {
    console.log(`   ⚠️  Not found (${stats.fallbackChains.notFound.length}):`);
    for (const nf of stats.fallbackChains.notFound) {
      console.log(`      - ${nf}`);
    }
  }

  console.log('\n🧠 ComplexityRouting:');
  console.log(`   Processed: ${stats.complexityRouting.processed}`);
  console.log(`   Mappings created: ${stats.complexityRouting.mappingsCreated}`);
  console.log(`   Skipped: ${stats.complexityRouting.skipped}`);
  if (stats.complexityRouting.notFound.length > 0) {
    console.log(`   ⚠️  Not found (${stats.complexityRouting.notFound.length}):`);
    for (const nf of stats.complexityRouting.notFound) {
      console.log(`      - ${nf}`);
    }
  }

  if (stats.errors.length > 0) {
    console.log(`\n❌ Errors (${stats.errors.length}):`);
    for (const err of stats.errors) {
      console.log(`   - ${err}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`✅ Migration completed at ${new Date().toISOString()}`);
  console.log('='.repeat(60));
}

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('🚀 Routing Models Migration Script');
  console.log(`📅 Started at: ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  const stats: MigrationStats = {
    fallbackChains: { processed: 0, modelsCreated: 0, skipped: 0, notFound: [] },
    complexityRouting: { processed: 0, mappingsCreated: 0, skipped: 0, notFound: [] },
    errors: [],
  };

  try {
    await migrateFallbackChains(stats);
    await migrateComplexityRouting(stats);
    printSummary(stats);

    if (stats.errors.length > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
