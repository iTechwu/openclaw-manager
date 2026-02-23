import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import {
  BotModule,
  ProviderKeyModule,
  UserInfoModule,
  OperateLogModule,
  PersonaTemplateModule,
  BotUsageLogModule,
  BotChannelModule,
  ModelCatalogModule,
  BotModelRoutingModule,
  BotModelModule,
  ModelAvailabilityModule,
  CapabilityTagModule,
  ModelCapabilityTagModule,
  FallbackChainModule,
  FeishuPairingRecordModule,
} from '@app/db';
import { PrismaModule } from '@app/prisma';
import { AuthModule } from '@app/auth';
import { JwtModule } from '@app/jwt/jwt.module';
import { RedisModule } from '@app/redis';
import { ProviderVerifyModule } from '@app/clients/internal/provider-verify';
import { CryptModule } from '@app/clients/internal/crypt';
import { ProxyModule } from '../proxy/proxy.module';
import { BotApiController } from './bot-api.controller';
import { BotApiService } from './bot-api.service';
import { EncryptionService } from './services/encryption.service';
import { DockerService } from './services/docker.service';
import { DockerImageService } from './services/docker-image.service';
import { WorkspaceService } from './services/workspace.service';
import { ReconciliationService } from './services/reconciliation.service';
import { DockerEventService } from './services/docker-event.service';
import { BotSseService } from './services/bot-sse.service';
import { BotUsageAnalyticsService } from './services/bot-usage-analytics.service';
import { HealthCheckService } from './services/health-check.service';
import { BotStartupMonitorService } from './services/bot-startup-monitor.service';
import { BotConfigResolverService } from './services/bot-config-resolver.service';
import { ModelRoutingModule } from './model-routing.module';
import { ModelRoutingController } from './model-routing.controller';
import { AvailableModelService } from './services/available-model.service';
import { ModelVerificationService } from './services/model-verification.service';
import { CapabilityTagMatchingService } from './services/capability-tag-matching.service';
import { ModelSyncService } from './services/model-sync.service';
import { RoutingConfigService } from './services/routing-config.service';
import { OpenclawConfigService } from './services/openclaw-config.service';
import { ProviderFallbackService } from './services/provider-fallback.service';
import { OpenclawGatewayService } from './services/openclaw-gateway.service';
import { FeishuPairingService } from './services/feishu-pairing.service';
import { FeishuPairingController } from './feishu-pairing.controller';
import { FeishuClientModule } from '@app/clients/internal/feishu';
import { PluginApiModule } from '../plugin-api/plugin-api.module';
import { SkillApiModule } from '../skill-api/skill-api.module';

@Module({
  imports: [
    ConfigModule,
    HttpModule.register({ timeout: 5000 }),
    ScheduleModule.forRoot(),
    BotModule,
    ProviderKeyModule,
    BotChannelModule,
    UserInfoModule,
    OperateLogModule,
    AuthModule,
    JwtModule,
    RedisModule,
    PersonaTemplateModule,
    ProviderVerifyModule,
    CryptModule,
    ProxyModule,
    BotUsageLogModule,
    ModelCatalogModule,
    BotModelRoutingModule,
    BotModelModule,
    ModelAvailabilityModule,
    CapabilityTagModule,
    ModelCapabilityTagModule,
    FallbackChainModule,
    ModelRoutingModule,
    PrismaModule,
    PluginApiModule,
    forwardRef(() => SkillApiModule),
    FeishuPairingRecordModule,
    FeishuClientModule,
  ],
  controllers: [BotApiController, ModelRoutingController, FeishuPairingController],
  providers: [
    BotApiService,
    EncryptionService,
    DockerService,
    DockerImageService,
    WorkspaceService,
    ReconciliationService,
    DockerEventService,
    BotSseService,
    BotStartupMonitorService,
    BotUsageAnalyticsService,
    HealthCheckService,
    BotConfigResolverService,
    AvailableModelService,
    ModelVerificationService,
    CapabilityTagMatchingService,
    ModelSyncService,
    RoutingConfigService,
    OpenclawConfigService,
    ProviderFallbackService,
    OpenclawGatewayService,
    FeishuPairingService,
  ],
  exports: [
    BotApiService,
    DockerService,
    DockerImageService,
    WorkspaceService,
    ReconciliationService,
    DockerEventService,
    BotSseService,
    BotStartupMonitorService,
    BotUsageAnalyticsService,
    HealthCheckService,
    BotConfigResolverService,
    AvailableModelService,
    ModelVerificationService,
    CapabilityTagMatchingService,
    ModelSyncService,
    RoutingConfigService,
    OpenclawConfigService,
    ProviderFallbackService,
    OpenclawGatewayService,
    FeishuPairingService,
    ModelRoutingModule,
  ],
})
export class BotApiModule {}
