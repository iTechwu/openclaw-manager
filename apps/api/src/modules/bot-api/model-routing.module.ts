import { Module } from '@nestjs/common';
import {
  BotModule,
  BotModelRoutingModule,
  ProviderKeyModule,
  BotModelModule,
  BotUsageLogModule,
  ModelAvailabilityModule,
  CapabilityTagModule,
  ModelCapabilityTagModule,
} from '@app/db';
import { PrismaModule } from '@app/prisma';
import { ModelRouterService } from './services/model-router.service';
import { RoutingSuggestionService } from './services/routing-suggestion.service';
import { ModelRoutingService } from './model-routing.service';
import { ModelResolverService } from '../proxy/services/model-resolver.service';

/**
 * ModelRoutingModule
 * 模型路由相关服务模块
 * 独立模块确保 RoutingSuggestionService、ModelRouterService、ModelRoutingService 依赖正确解析
 */
@Module({
  imports: [
    PrismaModule,
    BotModule,
    BotModelRoutingModule,
    ProviderKeyModule,
    BotModelModule,
    ModelAvailabilityModule,
    BotUsageLogModule,
    CapabilityTagModule,
    ModelCapabilityTagModule,
  ],
  providers: [
    RoutingSuggestionService,
    ModelRouterService,
    ModelRoutingService,
    ModelResolverService,
  ],
  exports: [ModelRouterService, ModelRoutingService, ModelResolverService],
})
export class ModelRoutingModule {}
