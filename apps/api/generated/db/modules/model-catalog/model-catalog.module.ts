import { Module } from '@nestjs/common';
import { ModelCatalogService } from './model-catalog.service';
import { PrismaModule } from '@app/prisma';
import { RedisModule } from '@app/redis';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, RedisModule, ConfigModule],
  providers: [ModelCatalogService],
  exports: [ModelCatalogService],
})
export class ModelCatalogModule {}
