import { Module } from '@nestjs/common';
import { ProviderKeyService } from './provider-key.service';
import { PrismaModule } from '@app/prisma';
import { RedisModule } from '@app/redis';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, RedisModule, ConfigModule],
  providers: [ProviderKeyService],
  exports: [ProviderKeyService],
})
export class ProviderKeyModule {}
