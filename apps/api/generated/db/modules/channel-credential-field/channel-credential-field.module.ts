import { Module } from '@nestjs/common';
import { ChannelCredentialFieldService } from './channel-credential-field.service';
import { PrismaModule } from '@app/prisma';
import { RedisModule } from '@app/redis';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, RedisModule, ConfigModule],
  providers: [ChannelCredentialFieldService],
  exports: [ChannelCredentialFieldService],
})
export class ChannelCredentialFieldModule {}
