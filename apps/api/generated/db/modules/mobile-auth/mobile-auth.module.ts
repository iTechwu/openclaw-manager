import { Module } from '@nestjs/common';
import { MobileAuthService } from './mobile-auth.service';
import { PrismaModule } from '@app/prisma';
import { RedisModule } from '@app/redis';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, RedisModule, ConfigModule],
  providers: [MobileAuthService],
  exports: [MobileAuthService],
})
export class MobileAuthModule {}
