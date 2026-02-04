import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  BotModule,
  ProviderKeyModule,
  BotProviderKeyModule,
  UserInfoModule,
  OperateLogModule,
  PersonaTemplateModule,
} from '@app/db';
import { AuthModule } from '@app/auth';
import { JwtModule } from '@app/jwt/jwt.module';
import { RedisModule } from '@app/redis';
import { ProviderVerifyModule } from '@app/clients/internal/provider-verify';
import { ProxyModule } from '../proxy/proxy.module';
import { BotApiController } from './bot-api.controller';
import { BotApiService } from './bot-api.service';
import { EncryptionService } from './services/encryption.service';
import { DockerService } from './services/docker.service';
import { WorkspaceService } from './services/workspace.service';
import { ReconciliationService } from './services/reconciliation.service';

@Module({
  imports: [
    ConfigModule,
    BotModule,
    ProviderKeyModule,
    BotProviderKeyModule,
    UserInfoModule,
    OperateLogModule,
    AuthModule,
    JwtModule,
    RedisModule,
    PersonaTemplateModule,
    ProviderVerifyModule,
    ProxyModule,
  ],
  controllers: [BotApiController],
  providers: [
    BotApiService,
    EncryptionService,
    DockerService,
    WorkspaceService,
    ReconciliationService,
  ],
  exports: [
    BotApiService,
    DockerService,
    WorkspaceService,
    ReconciliationService,
  ],
})
export class BotApiModule {}
