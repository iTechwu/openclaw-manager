/**
 * Bot Channel API Module
 *
 * 职责：
 * - Bot 渠道配置管理
 * - 凭证验证和加密
 * - openclaw.json 配置更新
 *
 * 迁移说明：
 * - WebSocket 连接管理已迁移到 OpenClaw 原生 feishu 扩展
 * - FeishuMessageHandlerService 已删除
 * - FeishuClientModule 仅用于凭证验证
 */
import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '@app/auth';
import { JwtModule } from '@app/jwt/jwt.module';
import { RedisModule } from '@app/redis';
import { BotChannelApiController } from './bot-channel-api.controller';
import { BotChannelApiService } from './bot-channel-api.service';
import { BotChannelStartupService } from './bot-channel-startup.service';
import {
  BotChannelModule,
  BotModule,
  UserInfoModule,
  ChannelDefinitionModule,
  BotModelModule,
} from '@app/db';
import { CryptModule } from '@app/clients/internal/crypt';
import { BotApiModule } from '../bot-api/bot-api.module';

@Module({
  imports: [
    ConfigModule,
    BotChannelModule,
    BotModule,
    BotModelModule,
    UserInfoModule,
    ChannelDefinitionModule,
    AuthModule,
    JwtModule,
    RedisModule,
    CryptModule,
    forwardRef(() => BotApiModule),
  ],
  controllers: [BotChannelApiController],
  providers: [BotChannelApiService, BotChannelStartupService],
  exports: [BotChannelApiService],
})
export class BotChannelApiModule {}
