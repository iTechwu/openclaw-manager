import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import {
  BotModule,
  ProviderKeyModule,
  BotProviderKeyModule,
  UserInfoModule,
  OperateLogModule,
  PersonaTemplateModule,
  BotUsageLogModule,
  BotChannelModule,
  ModelPricingModule,
  BotModelRoutingModule,
} from '@app/db';
import { PrismaModule } from '@app/prisma';
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
import { DockerEventService } from './services/docker-event.service';
import { BotSseService } from './services/bot-sse.service';
import { BotUsageAnalyticsService } from './services/bot-usage-analytics.service';
import { HealthCheckService } from './services/health-check.service';
import { BotConfigResolverService } from './services/bot-config-resolver.service';
import { ModelRoutingModule } from './model-routing.module';
import { ModelRoutingController } from './model-routing.controller';

@Module({
  imports: [
    ConfigModule,
    HttpModule.register({ timeout: 5000 }),
    ScheduleModule.forRoot(),
    BotModule,
    ProviderKeyModule,
    BotProviderKeyModule,
    BotChannelModule,
    UserInfoModule,
    OperateLogModule,
    AuthModule,
    JwtModule,
    RedisModule,
    PersonaTemplateModule,
    ProviderVerifyModule,
    ProxyModule,
    BotUsageLogModule,
    ModelPricingModule,
    BotModelRoutingModule,
    ModelRoutingModule,
    PrismaModule,
  ],
  controllers: [BotApiController, ModelRoutingController],
  providers: [
    BotApiService,
    EncryptionService,
    DockerService,
    WorkspaceService,
    ReconciliationService,
    DockerEventService,
    BotSseService,
    BotUsageAnalyticsService,
    HealthCheckService,
    BotConfigResolverService,
  ],
  exports: [
    BotApiService,
    DockerService,
    WorkspaceService,
    ReconciliationService,
    DockerEventService,
    BotSseService,
    BotUsageAnalyticsService,
    HealthCheckService,
    BotConfigResolverService,
    ModelRoutingModule,
  ],
})
export class BotApiModule {}
