import { Module } from '@nestjs/common';
import { RiskDetectionRecordService } from './risk-detection-record.service';
import { PrismaModule } from '@app/prisma';
import { RedisModule } from '@app/redis';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, RedisModule, ConfigModule],
  providers: [RiskDetectionRecordService],
  exports: [RiskDetectionRecordService],
})
export class RiskDetectionRecordModule {}
