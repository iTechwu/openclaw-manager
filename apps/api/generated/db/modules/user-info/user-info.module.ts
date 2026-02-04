import { Module } from '@nestjs/common';
import { UserInfoService } from './user-info.service';
import { PrismaModule } from '@app/prisma';
import { RedisModule } from '@app/redis';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, RedisModule, ConfigModule],
  providers: [UserInfoService],
  exports: [UserInfoService],
})
export class UserInfoModule {}
