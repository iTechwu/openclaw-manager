import { Module } from '@nestjs/common';
import { ComplexityRoutingModelMappingService } from './complexity-routing-model-mapping.service';
import { PrismaModule } from '@app/prisma';
import { RedisModule } from '@app/redis';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, RedisModule, ConfigModule],
  providers: [ComplexityRoutingModelMappingService],
  exports: [ComplexityRoutingModelMappingService],
})
export class ComplexityRoutingModelMappingModule {}
