import { Module } from '@nestjs/common';
import { BotModelService } from './bot-model.service';
import { PrismaModule } from '@app/prisma';
import { RedisModule } from '@app/redis';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, RedisModule, ConfigModule],
  providers: [BotModelService],
  exports: [BotModelService],
})
export class BotModelModule {}
