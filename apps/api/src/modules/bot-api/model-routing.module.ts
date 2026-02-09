import { Module } from '@nestjs/common';
import {
  BotModule,
  BotModelRoutingModule,
  ProviderKeyModule,
  BotProviderKeyModule,
  BotUsageLogModule,
} from '@app/db';
import { PrismaModule } from '@app/prisma';
import { ModelRouterService } from './services/model-router.service';
import { RoutingSuggestionService } from './services/routing-suggestion.service';
import { ModelRoutingService } from './model-routing.service';

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
    BotProviderKeyModule,
    BotUsageLogModule,
  ],
  providers: [
    RoutingSuggestionService,
    ModelRouterService,
    ModelRoutingService,
  ],
  exports: [ModelRouterService, ModelRoutingService],
})
export class ModelRoutingModule {}
