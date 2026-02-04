import { Module } from '@nestjs/common';
import { SystemTaskQueueService } from './system-task-queue.service';
import { PrismaModule } from '@app/prisma';
import { RedisModule } from '@app/redis';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, RedisModule, ConfigModule],
  providers: [SystemTaskQueueService],
  exports: [SystemTaskQueueService],
})
export class SystemTaskQueueModule {}
