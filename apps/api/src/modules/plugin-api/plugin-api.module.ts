import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  PluginModule,
  BotPluginModule,
  BotModule,
  UserInfoModule,
} from '@app/db';
import { AuthModule } from '@app/auth';
import { JwtModule } from '@app/jwt';
import { RedisModule } from '@app/redis';
import { OpenClawModule } from '@app/clients/internal/openclaw';
import { PluginApiController } from './plugin-api.controller';
import { PluginApiService } from './plugin-api.service';

@Module({
  imports: [
    ConfigModule,
    RedisModule,
    PluginModule,
    BotPluginModule,
    BotModule,
    UserInfoModule,
    AuthModule,
    JwtModule,
    OpenClawModule,
  ],
  controllers: [PluginApiController],
  providers: [PluginApiService],
  exports: [PluginApiService],
})
export class PluginApiModule {}
