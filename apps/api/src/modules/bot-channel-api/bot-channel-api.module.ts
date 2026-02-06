/**
 * Bot Channel API Module
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '@app/auth';
import { JwtModule } from '@app/jwt/jwt.module';
import { RedisModule } from '@app/redis';
import { BotChannelApiController } from './bot-channel-api.controller';
import { BotChannelApiService } from './bot-channel-api.service';
import {
  BotChannelModule,
  BotModule,
  UserInfoModule,
  ChannelDefinitionModule,
  BotProviderKeyModule,
} from '@app/db';
import { CryptModule } from '@app/clients/internal/crypt';
import { FeishuClientModule } from '@app/clients/internal/feishu';

@Module({
  imports: [
    ConfigModule,
    BotChannelModule,
    BotModule,
    BotProviderKeyModule,
    UserInfoModule,
    ChannelDefinitionModule,
    AuthModule,
    JwtModule,
    RedisModule,
    CryptModule,
    FeishuClientModule,
  ],
  controllers: [BotChannelApiController],
  providers: [BotChannelApiService],
  exports: [BotChannelApiService],
})
export class BotChannelApiModule {}
