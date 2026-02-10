#!/usr/bin/env ts-node
/**
 * OpenClaw Skills Sync Script
 *
 * 用于从 GitHub 仓库同步 OpenClaw 技能到数据库
 *
 * 使用方式:
 *   # 直接运行
 *   npx ts-node scripts/sync-openclaw-skills.ts
 *
 *   # 通过 npm script
 *   pnpm sync:skills
 *
 *   # 设置定时任务 (crontab)
 *   # 每天凌晨 3 点同步
 *   0 3 * * * cd /path/to/clawbot-manager/apps/api && pnpm sync:skills >> /var/log/skill-sync.log 2>&1
 */
require('dotenv').config();

import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WinstonModule } from 'nest-winston';
import * as loggerUtil from '../libs/infra/utils/logger.util';
import {
  getConfig,
  initConfig,
  initKeysConfig,
} from '../libs/infra/common/config/configuration';
import { SkillSyncService } from '../src/modules/skill-sync/skill-sync.service';
import { OpenClawModule } from '../libs/infra/clients/internal/openclaw';
import { SkillModule, SkillTypeModule } from '../generated/db';
import { PrismaModule } from '../libs/infra/prisma/prisma';
import { RedisModule } from '../libs/infra/redis/src';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [getConfig as any],
    }),
    WinstonModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const output =
          configService.get<loggerUtil.LogOutputMode>('app.nestLogOutput') ||
          'console';
        return loggerUtil.getWinstonConfig(output);
      },
      inject: [ConfigService],
    }),
    PrismaModule,
    RedisModule,
    SkillModule,
    SkillTypeModule,
    OpenClawModule,
  ],
  providers: [SkillSyncService],
})
class SyncModule {}

async function main() {
  console.log('🚀 Starting OpenClaw Skills Sync...');
  console.log(`📅 Time: ${new Date().toISOString()}`);

  try {
    // 与 main.ts 一致：先加载 YAML 与 keys 配置，getKeysConfig() 才能被依赖方（如 OpenAI 翻译）使用
    if (!process.env.PROJECT_ROOT) {
      process.env.PROJECT_ROOT = process.cwd();
    }
    await initConfig();
    initKeysConfig();

    const app = await NestFactory.createApplicationContext(SyncModule, {
      logger: ['error', 'warn', 'log'],
    });

    const syncService = app.get(SkillSyncService);

    console.log('📥 Fetching skills from GitHub...');
    const result = await syncService.syncAll();

    console.log('\n✅ Sync completed successfully!');
    console.log('📊 Results:');
    console.log(`   Total skills: ${result.total}`);
    console.log(`   Added: ${result.added}`);
    console.log(`   Updated: ${result.updated}`);
    console.log(`   Skipped: ${result.skipped}`);
    console.log(`   Errors: ${result.errors}`);
    console.log(`   Synced at: ${result.syncedAt.toISOString()}`);

    await app.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Sync failed:', error);
    process.exit(1);
  }
}

main();
