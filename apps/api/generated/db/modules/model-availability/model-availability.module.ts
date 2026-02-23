import { Module } from '@nestjs/common';
import { ModelAvailabilityService } from './model-availability.service';
import { PrismaModule } from '@app/prisma';
import { RedisModule } from '@app/redis';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, RedisModule, ConfigModule],
  providers: [ModelAvailabilityService],
  exports: [ModelAvailabilityService],
})
export class ModelAvailabilityModule {}
