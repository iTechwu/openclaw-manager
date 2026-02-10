import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { AdminAuth } from '@app/auth';
import { RoutingEngineService } from './services/routing-engine.service';
import { FallbackEngineService } from './services/fallback-engine.service';
import { CostTrackerService } from './services/cost-tracker.service';
import { ConfigurationService } from './services/configuration.service';
import { ComplexityClassifierService } from '@app/clients/internal/complexity-classifier';
import { ComplexityRoutingConfigService } from '@app/db';
import { success, error, deleted } from '@/common/ts-rest/response.helper';
import { CommonErrorCode } from '@repo/contracts/errors';
import { routingAdminContract as c } from '@repo/contracts';

// Helper to generate consistent UUIDs from string IDs
const generateUUID = (id: string): string => {
  const hash = id.split('').reduce((acc, char) => {
    return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
  }, 0);
  return `00000000-0000-4000-8000-${Math.abs(hash).toString(16).padStart(12, '0')}`;
};

const now = new Date().toISOString();

/**
 * RoutingAdminController - 混合架构路由配置管理 API
 * 使用 ts-rest + Zod-first 模式
 */
@Controller()
@AdminAuth()
export class RoutingAdminController {
  constructor(
    private readonly routingEngine: RoutingEngineService,
    private readonly fallbackEngine: FallbackEngineService,
    private readonly costTracker: CostTrackerService,
    private readonly configService: ConfigurationService,
    private readonly complexityClassifier: ComplexityClassifierService,
    private readonly complexityRoutingConfigDb: ComplexityRoutingConfigService,
  ) {}

  // ============================================================================
  // 配置状态
  // ============================================================================

  @TsRestHandler(c.getConfigStatus)
  async getConfigStatus() {
    return tsRestHandler(c.getConfigStatus, async () => {
      return success(this.configService.getLoadStatus()) as any;
    });
  }

  @TsRestHandler(c.refreshConfig)
  async refreshConfig() {
    return tsRestHandler(c.refreshConfig, async () => {
      await this.configService.refreshConfigurations();
      return success({
        message: 'Configuration refreshed',
        status: this.configService.getLoadStatus(),
      }) as any;
    });
  }

  // ============================================================================
  // 能力标签管理
  // ============================================================================

  @TsRestHandler(c.getCapabilityTags)
  async getCapabilityTags() {
    return tsRestHandler(c.getCapabilityTags, async () => {
      const tags = this.routingEngine.getAllCapabilityTags();
      return success({
        list: tags.map((tag) => ({
          id: generateUUID(tag.tagId),
          ...tag,
          description: null,
          isActive: true,
          isBuiltin: true,
          createdAt: now,
          updatedAt: now,
        })),
      }) as any;
    });
  }

  @TsRestHandler(c.getCapabilityTag)
  async getCapabilityTag() {
    return tsRestHandler(c.getCapabilityTag, async ({ params }) => {
      const tag = this.routingEngine.getCapabilityTag(params.tagId);
      if (!tag) {
        return error(CommonErrorCode.NotFound) as any;
      }
      return success(tag) as any;
    });
  }

  // ============================================================================
  // Fallback 链管理
  // ============================================================================

  @TsRestHandler(c.getFallbackChains)
  async getFallbackChains() {
    return tsRestHandler(c.getFallbackChains, async () => {
      const chains = this.fallbackEngine.getAllFallbackChains();
      return success({
        list: chains.map((chain) => ({
          id: generateUUID(chain.chainId),
          ...chain,
          description: null,
          isActive: true,
          isBuiltin: true,
          createdAt: now,
          updatedAt: now,
        })),
      }) as any;
    });
  }

  @TsRestHandler(c.getFallbackChain)
  async getFallbackChain() {
    return tsRestHandler(c.getFallbackChain, async ({ params }) => {
      const chain = this.fallbackEngine.getFallbackChain(params.chainId);
      if (!chain) {
        return error(CommonErrorCode.NotFound) as any;
      }
      return success(chain) as any;
    });
  }

  // ============================================================================
  // 成本策略管理
  // ============================================================================

  @TsRestHandler(c.getCostStrategies)
  async getCostStrategies() {
    return tsRestHandler(c.getCostStrategies, async () => {
      const strategies = this.costTracker.getAllCostStrategies();
      return success({
        list: strategies.map((strategy) => ({
          id: generateUUID(strategy.strategyId),
          ...strategy,
          description: null,
          isActive: true,
          isBuiltin: true,
          createdAt: now,
          updatedAt: now,
        })),
      }) as any;
    });
  }

  @TsRestHandler(c.getCostStrategy)
  async getCostStrategy() {
    return tsRestHandler(c.getCostStrategy, async ({ params }) => {
      const strategy = this.costTracker.getCostStrategy(params.strategyId);
      if (!strategy) {
        return error(CommonErrorCode.NotFound) as any;
      }
      return success(strategy) as any;
    });
  }

  // ============================================================================
  // 复杂度路由配置管理
  // ============================================================================

  @TsRestHandler(c.getComplexityRoutingConfigs)
  async getComplexityRoutingConfigs() {
    return tsRestHandler(c.getComplexityRoutingConfigs, async () => {
      const { list: configs } = await this.complexityRoutingConfigDb.list(
        {},
        { orderBy: { createdAt: 'desc' }, limit: 100 },
      );
      return success({
        list: configs.map((config) => ({
          id: config.id,
          configId: config.configId,
          name: config.name,
          description: config.description,
          isEnabled: config.isEnabled,
          models: config.models,
          classifierModel: config.classifierModel,
          classifierVendor: config.classifierVendor,
          classifierBaseUrl: null,
          toolMinComplexity: config.toolMinComplexity,
          isBuiltin: config.isBuiltin,
          createdAt: config.createdAt.toISOString(),
          updatedAt: config.updatedAt.toISOString(),
        })),
      }) as any;
    });
  }

  @TsRestHandler(c.getComplexityRoutingConfig)
  async getComplexityRoutingConfig() {
    return tsRestHandler(c.getComplexityRoutingConfig, async ({ params }) => {
      const config = await this.complexityRoutingConfigDb.getByConfigId(
        params.configId,
      );
      if (!config) {
        return error(CommonErrorCode.NotFound) as any;
      }
      return success({
        id: config.id,
        configId: config.configId,
        name: config.name,
        description: config.description,
        isEnabled: config.isEnabled,
        models: config.models,
        classifierModel: config.classifierModel,
        classifierVendor: config.classifierVendor,
        classifierBaseUrl: null,
        toolMinComplexity: config.toolMinComplexity,
        isBuiltin: config.isBuiltin,
        createdAt: config.createdAt.toISOString(),
        updatedAt: config.updatedAt.toISOString(),
      }) as any;
    });
  }

  @TsRestHandler(c.createComplexityRoutingConfig)
  async createComplexityRoutingConfig() {
    return tsRestHandler(c.createComplexityRoutingConfig, async ({ body }) => {
      const config = await this.complexityRoutingConfigDb.create({
        configId: body.configId,
        name: body.name,
        description: body.description,
        isEnabled: body.isEnabled ?? true,
        models: body.models,
        classifierModel: body.classifierModel || 'deepseek-v3-250324',
        classifierVendor: body.classifierVendor || 'deepseek',
        toolMinComplexity: body.toolMinComplexity,
      }) as any;

      await this.configService.refreshConfigurations();

      return success({
        id: config.id,
        configId: config.configId,
        name: config.name,
        description: config.description,
        isEnabled: config.isEnabled,
        models: config.models,
        classifierModel: config.classifierModel,
        classifierVendor: config.classifierVendor,
        classifierBaseUrl: null,
        toolMinComplexity: config.toolMinComplexity,
        isBuiltin: config.isBuiltin,
        createdAt: config.createdAt.toISOString(),
        updatedAt: config.updatedAt.toISOString(),
      }) as any;
    });
  }

  @TsRestHandler(c.updateComplexityRoutingConfig)
  async updateComplexityRoutingConfig() {
    return tsRestHandler(
      c.updateComplexityRoutingConfig,
      async ({ params, body }) => {
        const existing = await this.complexityRoutingConfigDb.getById(
          params.id,
        );
        if (!existing) {
          return error(CommonErrorCode.NotFound) as any;
        }

        const config = await this.complexityRoutingConfigDb.update(
          { id: params.id },
          {
            name: body.name,
            description: body.description,
            isEnabled: body.isEnabled,
            models: body.models,
            classifierModel: body.classifierModel,
            classifierVendor: body.classifierVendor,
            toolMinComplexity: body.toolMinComplexity,
          },
        );

        await this.configService.refreshConfigurations();

        return success({
          id: config.id,
          configId: config.configId,
          name: config.name,
          description: config.description,
          isEnabled: config.isEnabled,
          models: config.models,
          classifierModel: config.classifierModel,
          classifierVendor: config.classifierVendor,
          classifierBaseUrl: null,
          toolMinComplexity: config.toolMinComplexity,
          isBuiltin: config.isBuiltin,
          createdAt: config.createdAt.toISOString(),
          updatedAt: config.updatedAt.toISOString(),
        }) as any;
      },
    );
  }

  @TsRestHandler(c.deleteComplexityRoutingConfig)
  async deleteComplexityRoutingConfig() {
    return tsRestHandler(
      c.deleteComplexityRoutingConfig,
      async ({ params }) => {
        const existing = await this.complexityRoutingConfigDb.getById(
          params.id,
        );
        if (!existing) {
          return error(CommonErrorCode.NotFound) as any;
        }

        await this.complexityRoutingConfigDb.update(
          { id: params.id },
          { isDeleted: true },
        );
        await this.configService.refreshConfigurations();

        return deleted() as any;
      },
    );
  }

  @TsRestHandler(c.classifyComplexity)
  async classifyComplexity() {
    return tsRestHandler(c.classifyComplexity, async ({ body }) => {
      const result = await this.complexityClassifier.classify({
        message: body.message,
        context: body.context,
        hasTools: body.hasTools,
      }) as any;
      return success(result) as any;
    });
  }

  // ============================================================================
  // 模型定价管理
  // ============================================================================

  @TsRestHandler(c.getModelPricingList)
  async getModelPricingList() {
    return tsRestHandler(c.getModelPricingList, async () => {
      const pricingList = this.costTracker.getAllModelPricing();
      return success({
        list: pricingList.map((pricing) => ({
          id: generateUUID(pricing.model),
          ...pricing,
          displayName: null,
          description: null,
          contextLength: 128,
          supportsExtendedThinking: pricing.thinkingPrice !== undefined,
          supportsCacheControl: pricing.cacheReadPrice !== undefined,
          supportsVision: false,
          supportsFunctionCalling: true,
          supportsStreaming: true,
          recommendedScenarios: null,
          isEnabled: true,
          isDeprecated: false,
          deprecationDate: null,
          priceUpdatedAt: now,
          notes: null,
          metadata: null,
          createdAt: now,
          updatedAt: now,
        })),
      }) as any;
    });
  }

  @TsRestHandler(c.getModelPricing)
  async getModelPricing() {
    return tsRestHandler(c.getModelPricing, async ({ params }) => {
      const pricing = this.costTracker.getModelPricing(params.model);
      if (!pricing) {
        return error(CommonErrorCode.NotFound) as any;
      }
      return success(pricing) as any;
    });
  }

  // ============================================================================
  // 成本计算
  // ============================================================================

  @TsRestHandler(c.calculateCost)
  async calculateCost() {
    return tsRestHandler(c.calculateCost, async ({ body }) => {
      const cost = this.costTracker.calculateCost(body.model, {
        inputTokens: body.inputTokens,
        outputTokens: body.outputTokens,
        thinkingTokens: body.thinkingTokens,
        cacheReadTokens: body.cacheReadTokens,
        cacheWriteTokens: body.cacheWriteTokens,
      }) as any;
      return success(cost) as any;
    });
  }

  // ============================================================================
  // Bot 使用量查询
  // ============================================================================

  @TsRestHandler(c.getBotUsage)
  async getBotUsage() {
    return tsRestHandler(c.getBotUsage, async ({ params }) => {
      const usage = this.costTracker.getBotUsage(params.botId);
      if (!usage) {
        return success({
          dailyCost: 0,
          monthlyCost: 0,
        }) as any;
      }
      return success(usage) as any;
    });
  }

  @TsRestHandler(c.checkBotBudget)
  async checkBotBudget() {
    return tsRestHandler(c.checkBotBudget, async ({ params, query }) => {
      const status = this.costTracker.checkBudgetStatus(
        params.botId,
        query.dailyLimit,
        query.monthlyLimit,
        query.alertThreshold ?? 0.8,
      );
      return success(status) as any;
    });
  }

  // ============================================================================
  // 模型选择
  // ============================================================================

  @TsRestHandler(c.selectOptimalModel)
  async selectOptimalModel() {
    return tsRestHandler(c.selectOptimalModel, async ({ body }) => {
      const model = this.costTracker.selectOptimalModel(
        body.strategyId,
        body.availableModels,
        body.scenario,
      );
      return success({
        selectedModel: model,
        strategy: body.strategyId,
        scenario: body.scenario,
      }) as any;
    });
  }
}
