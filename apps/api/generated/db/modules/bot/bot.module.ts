import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { PrismaModule } from '@app/prisma';
import { RedisModule } from '@app/redis';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, RedisModule, ConfigModule],
  providers: [BotService],
  exports: [BotService],
})
export class BotModule {}
