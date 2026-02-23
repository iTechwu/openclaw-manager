import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  SkillModule,
  BotSkillModule,
  BotModule,
  UserInfoModule,
} from '@app/db';
import { AuthModule } from '@app/auth';
import { JwtModule } from '@app/jwt';
import { RedisModule } from '@app/redis';
import { OpenClawModule } from '@app/clients/internal/openclaw';
import { BotApiModule } from '../bot-api/bot-api.module';
import { SkillApiController } from './skill-api.controller';
import { SkillApiService } from './skill-api.service';

@Module({
  imports: [
    ConfigModule,
    RedisModule,
    SkillModule,
    BotSkillModule,
    BotModule,
    UserInfoModule,
    AuthModule,
    JwtModule,
    OpenClawModule,
    forwardRef(() => BotApiModule),
  ],
  controllers: [SkillApiController],
  providers: [SkillApiService],
  exports: [SkillApiService],
})
export class SkillApiModule {}
