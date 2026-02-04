import { Module } from '@nestjs/common';
import { OperateLogService } from './operate-log.service';
import { PrismaModule } from '@app/prisma';
import { RedisModule } from '@app/redis';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, RedisModule, ConfigModule],
  providers: [OperateLogService],
  exports: [OperateLogService],
})
export class OperateLogModule {}
