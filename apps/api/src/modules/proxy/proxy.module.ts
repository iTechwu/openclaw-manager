import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  ProviderKeyModule,
  BotModule,
  BotUsageLogModule,
  MessageDbModule,
  ProxyTokenModule,
  BotModelRoutingModule,
  UserInfoModule,
  // Routing configuration DB modules
  ModelCatalogModule,
  CapabilityTagModule,
  FallbackChainModule,
  CostStrategyModule,
  ComplexityRoutingConfigModule,
  // New model management modules
  BotModelModule,
  ModelAvailabilityModule,
  // Fallback chain & complexity routing model mapping modules
  FallbackChainModelModule,
  ComplexityRoutingModelMappingModule,
  // Model capability tag module
  ModelCapabilityTagModule,
} from '@app/db';
import { AuthModule } from '@app/auth';
import { JwtModule } from '@app/jwt/jwt.module';
import { RedisModule } from '@app/redis';
import { ComplexityClassifierModule } from '@app/clients/internal/complexity-classifier';
import { ProxyController } from './proxy.controller';
import { ProxyAdminController } from './proxy-admin.controller';
import { RoutingAdminController } from './routing-admin.controller';
import { ProxyService } from './services/proxy.service';
import { KeyringService } from './services/keyring.service';
import { KeyringProxyService } from './services/keyring-proxy.service';
import { UpstreamService } from './services/upstream.service';
import { QuotaService } from './services/quota.service';
import { TokenExtractorService } from './services/token-extractor.service';
import { EncryptionService } from '../bot-api/services/encryption.service';
import { ModelRouterService } from '../bot-api/services/model-router.service';
// Hybrid architecture services
import { RoutingEngineService } from './services/routing-engine.service';
import { FallbackEngineService } from './services/fallback-engine.service';
import { CostTrackerService } from './services/cost-tracker.service';
import { ConfigurationService } from './services/configuration.service';
import { BotComplexityRoutingService } from './services/bot-complexity-routing.service';
import { ModelResolverService } from './services/model-resolver.service';
import { CircuitBreakerService } from './services/circuit-breaker.service';
import { CapabilityTagMatchingService } from '../bot-api/services/capability-tag-matching.service';
// GLM response transformer for reasoning_content handling
import { GlmResponseTransformerService } from './services/glm-response-transformer.service';
// Protocol router for dual-layer model system
import { ProtocolRouterService } from './services/protocol-router.service';
// Event listeners
import { HealthScoreListener } from './events/health-score.listener';

/**
 * ProxyModule - API 代理模块
 *
 * 提供 AI 提供商 API 代理功能：
 * - 支持多 vendor (OpenAI, Anthropic, Google, Venice, DeepSeek, Groq)
 * - 基于 tag 的密钥路由
 * - Round-robin 负载均衡
 * - SSE 流式响应支持
 * - 使用日志记录
 * - Token 配额检查和通知
 * - Zero-Trust Mode 支持
 * - 模型路由支持（功能路由、负载均衡、故障转移）
 * - 混合架构支持（能力标签路由、多模型 Fallback、成本控制）
 */
@Module({
  imports: [
    ConfigModule,
    AuthModule,
    JwtModule,
    RedisModule,
    UserInfoModule,
    ProviderKeyModule,
    BotModule,
    BotUsageLogModule,
    MessageDbModule,
    ProxyTokenModule,
    BotModelRoutingModule,
    // Routing configuration DB modules
    ModelCatalogModule,
    CapabilityTagModule,
    FallbackChainModule,
    CostStrategyModule,
    ComplexityRoutingConfigModule,
    // New model management modules
    BotModelModule,
    ModelAvailabilityModule,
    // Fallback chain & complexity routing model mapping modules
    FallbackChainModelModule,
    ComplexityRoutingModelMappingModule,
    // Model capability tag module
    ModelCapabilityTagModule,
    // Complexity classifier for complexity-based routing
    ComplexityClassifierModule,
  ],
  controllers: [ProxyController, ProxyAdminController, RoutingAdminController],
  providers: [
    ProxyService,
    KeyringService,
    KeyringProxyService,
    UpstreamService,
    QuotaService,
    TokenExtractorService,
    EncryptionService,
    ModelRouterService,
    // Hybrid architecture services
    RoutingEngineService,
    FallbackEngineService,
    CostTrackerService,
    ConfigurationService,
    // Bot complexity routing service
    BotComplexityRoutingService,
    // Model resolver service (model → vendor instance)
    ModelResolverService,
    // Circuit breaker service (provider failure protection)
    CircuitBreakerService,
    // Capability tag matching service (auto-sync tags)
    CapabilityTagMatchingService,
    // GLM response transformer (reasoning_content -> content)
    GlmResponseTransformerService,
    // Protocol router for dual-layer model system
    ProtocolRouterService,
    // Event listeners
    HealthScoreListener,
  ],
  exports: [
    ProxyService,
    KeyringProxyService,
    QuotaService,
    TokenExtractorService,
    ModelRouterService,
    // Hybrid architecture services
    RoutingEngineService,
    FallbackEngineService,
    CostTrackerService,
    ConfigurationService,
    // Bot complexity routing service
    BotComplexityRoutingService,
    // Model resolver service
    ModelResolverService,
    // Circuit breaker service
    CircuitBreakerService,
    // Protocol router for dual-layer model system
    ProtocolRouterService,
  ],
})
export class ProxyModule {}
