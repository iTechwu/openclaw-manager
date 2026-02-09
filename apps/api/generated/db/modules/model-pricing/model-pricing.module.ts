import { Module } from '@nestjs/common';
import { ModelPricingService } from './model-pricing.service';
import { PrismaModule } from '@app/prisma';
import { RedisModule } from '@app/redis';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, RedisModule, ConfigModule],
  providers: [ModelPricingService],
  exports: [ModelPricingService],
})
export class ModelPricingModule {}
