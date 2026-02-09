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
import { BotChannelStartupService } from './bot-channel-startup.service';
import { FeishuMessageHandlerService } from './feishu-message-handler.service';
import {
  BotChannelModule,
  BotModule,
  UserInfoModule,
  ChannelDefinitionModule,
  BotProviderKeyModule,
} from '@app/db';
import { CryptModule } from '@app/clients/internal/crypt';
import { FeishuClientModule } from '@app/clients/internal/feishu';
import { OpenClawModule } from '@app/clients/internal/openclaw';

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
    OpenClawModule,
  ],
  controllers: [BotChannelApiController],
  providers: [
    BotChannelApiService,
    BotChannelStartupService,
    FeishuMessageHandlerService,
  ],
  exports: [BotChannelApiService],
})
export class BotChannelApiModule {}
