import { Module } from '@nestjs/common';
import { BotUsageLogService } from './bot-usage-log.service';
import { PrismaModule } from '@app/prisma';
import { RedisModule } from '@app/redis';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, RedisModule, ConfigModule],
  providers: [BotUsageLogService],
  exports: [BotUsageLogService],
})
export class BotUsageLogModule {}
