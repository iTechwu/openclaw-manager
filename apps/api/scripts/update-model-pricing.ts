#!/usr/bin/env ts-node
/**
 * 模型定价更新脚本
 *
 * 用于定期更新 AI 模型的定价信息到数据库
 *
 * 使用方法:
 *   # 直接运行（使用 ts-node）
 *   npx ts-node scripts/update-model-pricing.ts
 *
 *   # 或者添加到 package.json scripts
 *   pnpm update:model-pricing
 *
 *   # 定时任务（cron）示例 - 每天凌晨 3 点更新
 *   0 3 * * * cd /path/to/apps/api && npx ts-node scripts/update-model-pricing.ts >> /var/log/model-pricing.log 2>&1
 *
 * 环境变量:
 *   DATABASE_URL - 数据库连接字符串（必需）
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { MODEL_PRICING_DATA } from './model-pricing.data';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL environment variable is not set');
  process.exit(1);
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

interface UpdateStats {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

async function updateModelPricing(): Promise<UpdateStats> {
  const stats: UpdateStats = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  console.log('💰 Starting model pricing update...');
  console.log(`📊 Processing ${MODEL_PRICING_DATA.length} models...\n`);

  for (const pricingData of MODEL_PRICING_DATA) {
    try {
      const existing = await prisma.modelPricing.findUnique({
        where: { model: pricingData.model },
      });

      if (existing) {
        // Check if pricing has changed
        const hasChanged =
          Number(existing.inputPrice) !== pricingData.inputPrice ||
          Number(existing.outputPrice) !== pricingData.outputPrice ||
          existing.vendor !== pricingData.vendor ||
          existing.displayName !== pricingData.displayName ||
          existing.notes !== pricingData.notes;

        if (hasChanged) {
          await prisma.modelPricing.update({
            where: { model: pricingData.model },
            data: {
              vendor: pricingData.vendor,
              inputPrice: pricingData.inputPrice,
              outputPrice: pricingData.outputPrice,
              displayName: pricingData.displayName,
              notes: pricingData.notes,
              priceUpdatedAt: new Date(),
              isDeleted: false,
            },
          });
          console.log(`  ✏️  Updated: ${pricingData.model}`);
          stats.updated++;
        } else {
          stats.skipped++;
        }
      } else {
        await prisma.modelPricing.create({
          data: {
            model: pricingData.model,
            vendor: pricingData.vendor,
            inputPrice: pricingData.inputPrice,
            outputPrice: pricingData.outputPrice,
            displayName: pricingData.displayName,
            notes: pricingData.notes,
          },
        });
        console.log(`  ✅ Created: ${pricingData.model}`);
        stats.created++;
      }
    } catch (error) {
      const errorMsg = `Failed to process ${pricingData.model}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`  ❌ ${errorMsg}`);
      stats.errors.push(errorMsg);
    }
  }

  return stats;
}

async function printSummary(stats: UpdateStats): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('📊 Update Summary');
  console.log('='.repeat(60));

  const totalCount = await prisma.modelPricing.count({
    where: { isDeleted: false },
  });

  const vendorCounts = await prisma.modelPricing.groupBy({
    by: ['vendor'],
    where: { isDeleted: false },
    _count: true,
    orderBy: { _count: { vendor: 'desc' } },
  });

  console.log(`\n📈 Results:`);
  console.log(`   Created: ${stats.created}`);
  console.log(`   Updated: ${stats.updated}`);
  console.log(`   Skipped (no changes): ${stats.skipped}`);
  console.log(`   Errors: ${stats.errors.length}`);

  console.log(`\n📦 Total models in database: ${totalCount}`);
  console.log(`\n🏢 Models by vendor:`);
  for (const vc of vendorCounts) {
    console.log(`   ${vc.vendor}: ${vc._count}`);
  }

  if (stats.errors.length > 0) {
    console.log(`\n⚠️  Errors encountered:`);
    for (const error of stats.errors) {
      console.log(`   - ${error}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`✅ Model pricing update completed at ${new Date().toISOString()}`);
  console.log('='.repeat(60));
}

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('🚀 Model Pricing Update Script');
  console.log(`📅 Started at: ${new Date().toISOString()}`);
  console.log('='.repeat(60) + '\n');

  try {
    const stats = await updateModelPricing();
    await printSummary(stats);

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
