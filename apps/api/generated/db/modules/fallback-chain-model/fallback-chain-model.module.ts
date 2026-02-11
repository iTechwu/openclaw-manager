import { Module } from '@nestjs/common';
import { FallbackChainModelService } from './fallback-chain-model.service';
import { PrismaModule } from '@app/prisma';
import { RedisModule } from '@app/redis';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, RedisModule, ConfigModule],
  providers: [FallbackChainModelService],
  exports: [FallbackChainModelService],
})
export class FallbackChainModelModule {}
