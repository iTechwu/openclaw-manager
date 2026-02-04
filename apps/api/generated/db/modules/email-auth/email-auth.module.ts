import { Module } from '@nestjs/common';
import { EmailAuthService } from './email-auth.service';
import { PrismaModule } from '@app/prisma';
import { RedisModule } from '@app/redis';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, RedisModule, ConfigModule],
  providers: [EmailAuthService],
  exports: [EmailAuthService],
})
export class EmailAuthModule {}
