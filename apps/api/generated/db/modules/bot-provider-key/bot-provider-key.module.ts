import { Module } from '@nestjs/common';
import { BotProviderKeyService } from './bot-provider-key.service';
import { PrismaModule } from '@app/prisma';
import { RedisModule } from '@app/redis';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, RedisModule, ConfigModule],
  providers: [BotProviderKeyService],
  exports: [BotProviderKeyService],
})
export class BotProviderKeyModule {}
