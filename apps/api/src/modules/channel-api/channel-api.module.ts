import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChannelApiController } from './channel-api.controller';
import { ChannelApiService } from './channel-api.service';
import {
  ChannelDefinitionModule,
  ChannelCredentialFieldModule,
} from '@app/db';
import { AuthModule } from '@app/auth';
import { JwtModule } from '@app/jwt/jwt.module';
import { RedisModule } from '@app/redis';

@Module({
  imports: [
    ConfigModule,
    ChannelDefinitionModule,
    ChannelCredentialFieldModule,
    AuthModule,
    JwtModule,
    RedisModule,
  ],
  controllers: [ChannelApiController],
  providers: [ChannelApiService],
  exports: [ChannelApiService],
})
export class ChannelApiModule {}
