import { Inject, Injectable, Optional, OnModuleDestroy } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import {
  ComplexityClassifierService,
  type ComplexityLevel,
  type ClassifyResult,
  COMPLEXITY_LEVELS,
  type ModelConfig,
  type ClassifierConfig,
} from '@app/clients/internal/complexity-classifier';
import {
  ModelCatalogService,
  ComplexityRoutingConfigService,
  ComplexityRoutingModelMappingService,
} from '@app/db';

/**
 * 复杂度路由配置
 */
export interface ComplexityRoutingConfig {
  /** 是否启用复杂度路由 */
  enabled: boolean;
  /** 各复杂度对应的模型配置 */
  models: Record<ComplexityLevel, ModelConfig>;
  /** 工具调用时的最低复杂度 */
  toolMinComplexity?: ComplexityLevel;
  /** 分类器配置 */
  classifier?: {
    /** 分类器使用的模型 */
    model: string;
    /** 分类器使用的 vendor */
    vendor: string;
    /** 自定义 Base URL */
    baseUrl?: string;
  };
}

/**
 * 默认复杂度路由配置
 * GLM-5 优先链路: GLM-5 -> Claude Opus 4.6 -> DeepSeek V3.2
 */
const DEFAULT_COMPLEXITY_ROUTING: ComplexityRoutingConfig = {
  enabled: true,
  models: {
    super_easy: { vendor: 'zhipu', model: 'glm-5' },
    easy: { vendor: 'zhipu', model: 'glm-5' },
    medium: { vendor: 'zhipu', model: 'glm-5' },
    hard: { vendor: 'zhipu', model: 'glm-5' },
    super_hard: { vendor: 'zhipu', model: 'glm-5' },
  },
  toolMinComplexity: 'easy',
  classifier: {
    model: 'deepseek-v3-250324',
    vendor: 'deepseek',
  },
};

/**
 * 能力标签定义
 */
export interface CapabilityTag {
  tagId: string;
  name: string;
  category: string;
  priority: number;
  requiredProtocol?: 'openai-compatible' | 'anthropic-native';
  requiredSkills?: string[];
  requiredModels?: string[];
  requiresExtendedThinking?: boolean;
  requiresCacheControl?: boolean;
  requiresVision?: boolean;
}

/**
 * 路由决策结果
 */
export interface RouteDecision {
  protocol: 'openai-compatible' | 'anthropic-native';
  vendor: string;
  model: string;
  features: {
    extendedThinking?: boolean;
    thinkingBudget?: number;
    cacheControl?: boolean;
  };
  fallbackChainId?: string;
  costStrategyId?: string;
  /** 复杂度分类结果（如果启用了复杂度路由） */
  complexity?: {
    level: ComplexityLevel;
    latencyMs: number;
    inheritedFromContext?: boolean;
  };
}

/**
 * 代理请求体（用于解析能力需求）
 */
export interface ProxyRequestBody {
  model?: string;
  messages?: Array<{
    role: string;
    content: unknown;
    cache_control?: { type: string };
  }>;
  tools?: Array<{
    type?: string;
    name?: string;
    function?: { name: string };
  }>;
  thinking?: {
    type: string;
    budget_tokens?: number;
  };
  stream?: boolean;
}

/**
 * Bot 配置（用于路由决策）
 */
export interface BotRoutingContext {
  botId: string;
  installedSkills: string[];
  /** 主模型信息（用于锚定路由决策） */
  primaryModel?: {
    model: string;
    vendor: string;
    providerKeyId: string;
  };
  routingConfig?: {
    routingEnabled: boolean;
    routingMode: 'auto' | 'manual' | 'cost-optimized' | 'complexity-based';
    fallbackChainId?: string;
    costStrategyId?: string;
    /** 复杂度路由配置 */
    complexityRouting?: ComplexityRoutingConfig;
  };
}

/**
 * RoutingEngineService - 能力标签路由引擎
 *
 * 负责：
 * - 解析请求的能力需求
 * - 检查 Skills 可用性
 * - 选择最优路由（协议、模型）
 * - 返回路由决策
 */
@Injectable()
export class RoutingEngineService implements OnModuleDestroy {
  // 预定义能力标签（后续从数据库加载）
  private capabilityTags: Map<string, CapabilityTag> = new Map();
  // 复杂度路由配置（运行时缓存）
  private complexityRoutingConfig: ComplexityRoutingConfig =
    DEFAULT_COMPLEXITY_ROUTING;
  // 复杂度路由配置缓存（按 configId 缓存）
  private complexityConfigCache = new Map<
    string,
    { config: ComplexityRoutingConfig; expiry: number }
  >();
  private readonly complexityConfigCacheTTL = 5 * 60 * 1000; // 5 分钟

  // 模型能力评分缓存
  private modelCapabilityScoreCache = new Map<
    string,
    { score: number; expiry: number }
  >();
  private readonly scoreCacheTTL = 5 * 60 * 1000; // 5 分钟

  // 定期清理过期缓存的定时器
  private cleanupInterval?: NodeJS.Timeout;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    @Optional()
    private readonly modelCatalogService?: ModelCatalogService,
    @Optional()
    private readonly complexityRoutingConfigService?: ComplexityRoutingConfigService,
    @Optional()
    private readonly complexityRoutingModelMappingService?: ComplexityRoutingModelMappingService,
    @Optional()
    private readonly complexityClassifier?: ComplexityClassifierService,
  ) {
    this.initializeDefaultTags();
    // 每分钟清理过期缓存
    this.cleanupInterval = setInterval(
      () => this.cleanupAllCaches(),
      60 * 1000,
    );
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  /**
   * 清理所有过期缓存
   */
  private cleanupAllCaches(): void {
    this.cleanupScoreCache();
    this.cleanupComplexityConfigCache();
  }

  /**
   * 清理过期的评分缓存
   */
  private cleanupScoreCache(): void {
    const now = Date.now();
    for (const [model, entry] of this.modelCapabilityScoreCache) {
      if (entry.expiry < now) {
        this.modelCapabilityScoreCache.delete(model);
      }
    }
  }

  /**
   * 清理过期的复杂度配置缓存
   */
  private cleanupComplexityConfigCache(): void {
    const now = Date.now();
    for (const [configId, entry] of this.complexityConfigCache) {
      if (entry.expiry < now) {
        this.complexityConfigCache.delete(configId);
      }
    }
  }

  /**
   * 清除模型能力评分缓存
   */
  clearCapabilityScoreCache(model?: string): void {
    if (model) {
      this.modelCapabilityScoreCache.delete(model);
    } else {
      this.modelCapabilityScoreCache.clear();
    }
  }

  /**
   * 清除复杂度路由配置缓存
   */
  clearComplexityConfigCache(configId?: string): void {
    if (configId) {
      this.complexityConfigCache.delete(configId);
    } else {
      this.complexityConfigCache.clear();
    }
  }

  /**
   * 从数据库加载复杂度路由配置
   */
  async loadComplexityRoutingConfig(
    configId?: string,
  ): Promise<ComplexityRoutingConfig> {
    // 如果指定了 configId，检查缓存
    if (configId) {
      const cached = this.complexityConfigCache.get(configId);
      if (cached && cached.expiry > Date.now()) {
        return cached.config;
      }
    }

    // 从数据库加载
    if (
      this.complexityRoutingConfigService &&
      this.complexityRoutingModelMappingService
    ) {
      try {
        // 获取配置（默认使用 'default' 配置）
        const dbConfig = await this.complexityRoutingConfigService.get({
          configId: configId || 'default',
          isEnabled: true,
        });

        if (dbConfig) {
          // 获取模型映射
          const mappings =
            await this.complexityRoutingModelMappingService.listByConfigId(
              dbConfig.id,
            );

          // 构建配置对象
          const config = this.buildComplexityRoutingConfig(dbConfig, mappings);

          // 缓存配置
          this.complexityConfigCache.set(dbConfig.configId, {
            config,
            expiry: Date.now() + this.complexityConfigCacheTTL,
          });

          this.logger.info(
            `[RoutingEngine] Loaded complexity routing config from DB: ${dbConfig.configId}`,
          );

          return config;
        }
      } catch (error) {
        this.logger.warn(
          `[RoutingEngine] Failed to load complexity routing config from DB, using default`,
          { error },
        );
      }
    }

    // 返回默认配置
    return DEFAULT_COMPLEXITY_ROUTING;
  }

  /**
   * 从数据库记录构建复杂度路由配置
   * GLM-5 优先链路: GLM-5 -> Claude Opus 4.6 -> DeepSeek V3.2
   */
  private buildComplexityRoutingConfig(
    dbConfig: any,
    mappings: any[],
  ): ComplexityRoutingConfig {
    const models: Record<ComplexityLevel, ModelConfig> = {
      super_easy: { vendor: 'zhipu', model: 'glm-5' },
      easy: { vendor: 'zhipu', model: 'glm-5' },
      medium: { vendor: 'zhipu', model: 'glm-5' },
      hard: { vendor: 'zhipu', model: 'glm-5' },
      super_hard: { vendor: 'zhipu', model: 'glm-5' },
    };

    // 按 complexityLevel 分组映射
    for (const mapping of mappings) {
      const level = mapping.complexityLevel as ComplexityLevel;
      if (COMPLEXITY_LEVELS.includes(level) && mapping.modelCatalog) {
        models[level] = {
          vendor: mapping.modelCatalog.vendor,
          model: mapping.modelCatalog.model,
        };
      }
    }

    return {
      enabled: dbConfig.isEnabled,
      models,
      toolMinComplexity:
        (dbConfig.toolMinComplexity as ComplexityLevel) || 'easy',
      classifier: {
        model: dbConfig.classifierModel,
        vendor: dbConfig.classifierVendor,
      },
    };
  }

  /**
   * 初始化默认能力标签
   * GLM-5 优先链路: GLM-5 -> Claude Opus 4.6 -> DeepSeek V3.2
   */
  private initializeDefaultTags(): void {
    const defaultTags: CapabilityTag[] = [
      {
        tagId: 'deep-reasoning',
        name: '深度推理',
        category: 'reasoning',
        priority: 100,
        requiredProtocol: 'openai-compatible',
        requiredModels: ['glm-5', 'claude-opus-4-6', 'deepseek-v3-2-251201'],
        requiresExtendedThinking: true,
      },
      {
        tagId: 'fast-reasoning',
        name: '快速推理',
        category: 'reasoning',
        priority: 50,
        requiredProtocol: 'openai-compatible',
        requiredModels: [
          'glm-5',
          'claude-opus-4-6',
          'gpt-4o',
          'deepseek-v3-2-251201',
        ],
      },
      {
        tagId: 'web-search',
        name: '网络搜索',
        category: 'search',
        priority: 80,
        requiredSkills: ['web_search'],
      },
      {
        tagId: 'code-execution',
        name: '代码执行',
        category: 'code',
        priority: 70,
        requiredSkills: ['code_runner'],
      },
      {
        tagId: 'cost-optimized',
        name: '成本优化',
        category: 'cost',
        priority: 90,
        requiredModels: [
          'deepseek-v3-2-251201',
          'gpt-4o-mini',
          'glm-4.5-flash',
        ],
        requiresCacheControl: true,
      },
      {
        tagId: 'long-context',
        name: '长上下文',
        category: 'context',
        priority: 60,
        requiredProtocol: 'openai-compatible',
        requiredModels: ['glm-5', 'gemini-3-pro-preview', 'claude-opus-4-6'],
      },
      {
        tagId: 'vision',
        name: '视觉理解',
        category: 'vision',
        priority: 75,
        requiredModels: ['glm-5', 'gpt-4o', 'claude-opus-4-6'],
        requiresVision: true,
      },
    ];

    for (const tag of defaultTags) {
      this.capabilityTags.set(tag.tagId, tag);
    }
  }

  /**
   * 从数据库加载能力标签配置
   */
  async loadCapabilityTagsFromDb(tags: CapabilityTag[]): Promise<void> {
    this.capabilityTags.clear();
    for (const tag of tags) {
      this.capabilityTags.set(tag.tagId, tag);
    }
    this.logger.info(
      `[RoutingEngine] Loaded ${tags.length} capability tags from database`,
    );
  }

  /**
   * 解析请求的能力需求
   */
  parseCapabilityRequirements(
    requestBody: ProxyRequestBody,
    routingHint?: string,
  ): CapabilityTag[] {
    const tags: CapabilityTag[] = [];

    // 1. 检测路由提示（优先级最高）
    if (routingHint && this.capabilityTags.has(routingHint)) {
      const tag = this.capabilityTags.get(routingHint)!;
      tags.push(tag);
      this.logger.debug(
        `[RoutingEngine] Routing hint detected: ${routingHint}`,
      );
    }

    // 2. 检测 Extended Thinking
    if (requestBody.thinking?.type === 'enabled') {
      const tag = this.capabilityTags.get('deep-reasoning');
      if (tag && !tags.some((t) => t.tagId === 'deep-reasoning')) {
        tags.push(tag);
        this.logger.debug(
          '[RoutingEngine] Extended Thinking detected -> deep-reasoning',
        );
      }
    }

    // 3. 检测 Cache Control
    if (requestBody.messages?.some((m) => m.cache_control)) {
      const tag = this.capabilityTags.get('cost-optimized');
      if (tag && !tags.some((t) => t.tagId === 'cost-optimized')) {
        tags.push(tag);
        this.logger.debug(
          '[RoutingEngine] Cache Control detected -> cost-optimized',
        );
      }
    }

    // 4. 检测搜索需求（tools 中包含 web_search）
    if (
      requestBody.tools?.some(
        (t) =>
          t.type === 'web_search' ||
          t.name === 'web_search' ||
          t.function?.name === 'web_search',
      )
    ) {
      const tag = this.capabilityTags.get('web-search');
      if (tag && !tags.some((t) => t.tagId === 'web-search')) {
        tags.push(tag);
        this.logger.debug('[RoutingEngine] Web search tool detected');
      }
    }

    // 5. 检测代码执行需求
    if (
      requestBody.tools?.some(
        (t) =>
          t.type === 'code_execution' ||
          t.name === 'code_runner' ||
          t.function?.name === 'code_runner',
      )
    ) {
      const tag = this.capabilityTags.get('code-execution');
      if (tag && !tags.some((t) => t.tagId === 'code-execution')) {
        tags.push(tag);
        this.logger.debug('[RoutingEngine] Code execution tool detected');
      }
    }

    // 6. 检测视觉需求（messages 中包含图像）
    if (this.hasVisionContent(requestBody.messages)) {
      const tag = this.capabilityTags.get('vision');
      if (tag && !tags.some((t) => t.tagId === 'vision')) {
        tags.push(tag);
        this.logger.debug('[RoutingEngine] Vision content detected');
      }
    }

    // 按优先级排序
    tags.sort((a, b) => b.priority - a.priority);

    return tags;
  }

  /**
   * 检查消息中是否包含视觉内容
   */
  private hasVisionContent(messages?: ProxyRequestBody['messages']): boolean {
    if (!messages) return false;

    return messages.some((msg) => {
      if (Array.isArray(msg.content)) {
        return msg.content.some(
          (part: unknown) =>
            typeof part === 'object' &&
            part !== null &&
            'type' in part &&
            (part as { type: string }).type === 'image_url',
        );
      }
      return false;
    });
  }

  /**
   * 检查 Skills 是否可以满足需求
   */
  checkSkillsAvailability(
    requirements: CapabilityTag[],
    installedSkills: string[],
  ): { satisfied: boolean; missingSkills: string[] } {
    const missingSkills: string[] = [];

    for (const tag of requirements) {
      if (tag.requiredSkills && tag.requiredSkills.length > 0) {
        for (const skill of tag.requiredSkills) {
          if (!installedSkills.includes(skill)) {
            missingSkills.push(skill);
          }
        }
      }
    }

    return {
      satisfied: missingSkills.length === 0,
      missingSkills,
    };
  }

  /**
   * 选择最优路由
   */
  selectRoute(
    requirements: CapabilityTag[],
    context: BotRoutingContext,
    requestedModel?: string,
  ): RouteDecision {
    // 默认路由决策
    const decision: RouteDecision = {
      protocol: 'openai-compatible',
      vendor: 'openai',
      model: requestedModel || 'gpt-4o',
      features: {},
    };

    // 如果没有特殊需求，优先使用主模型（主模型锚定）
    if (requirements.length === 0) {
      if (context.primaryModel) {
        decision.model = context.primaryModel.model;
        decision.vendor = context.primaryModel.vendor;
        decision.protocol = this.inferProtocolFromVendor(
          context.primaryModel.vendor,
        );
      } else if (requestedModel) {
        decision.model = requestedModel;
        decision.vendor = this.inferVendorFromModel(requestedModel);
      }
      return decision;
    }

    // 获取最高优先级的需求
    const primaryRequirement = requirements[0];

    // 1. 检查是否需要原生协议
    if (primaryRequirement.requiresExtendedThinking) {
      decision.protocol = 'anthropic-native';
      decision.features.extendedThinking = true;
      decision.vendor = 'anthropic';
      // 选择支持 Extended Thinking 的模型
      decision.model =
        primaryRequirement.requiredModels?.[0] || 'claude-sonnet-4-20250514';
      this.logger.info(
        `[RoutingEngine] Route to Anthropic Native for Extended Thinking`,
      );
    } else if (primaryRequirement.requiresCacheControl) {
      // Cache Control 也需要 Anthropic Native
      decision.protocol = 'anthropic-native';
      decision.features.cacheControl = true;
      decision.vendor = 'anthropic';
      decision.model = requestedModel || 'claude-sonnet-4-20250514';
      this.logger.info(
        `[RoutingEngine] Route to Anthropic Native for Cache Control`,
      );
    } else if (primaryRequirement.requiredProtocol) {
      decision.protocol = primaryRequirement.requiredProtocol;
    }

    // 2. 检查 Skills 是否可以满足需求
    const skillsCheck = this.checkSkillsAvailability(
      requirements,
      context.installedSkills,
    );

    if (!skillsCheck.satisfied) {
      this.logger.warn(
        `[RoutingEngine] Missing skills: ${skillsCheck.missingSkills.join(', ')}`,
      );
      // 如果缺少 Skills，可能需要降级或使用原生功能
    }

    // 3. 应用路由配置
    if (context.routingConfig) {
      if (context.routingConfig.fallbackChainId) {
        decision.fallbackChainId = context.routingConfig.fallbackChainId;
      }
      if (context.routingConfig.costStrategyId) {
        decision.costStrategyId = context.routingConfig.costStrategyId;
      }
    }

    this.logger.info(
      `[RoutingEngine] Route decision: ${decision.protocol} -> ${decision.vendor}/${decision.model}`,
    );

    return decision;
  }

  /**
   * 从模型名称推断 vendor
   */
  private inferVendorFromModel(model: string): string {
    const modelLower = model.toLowerCase();

    if (modelLower.includes('claude')) return 'anthropic';
    if (
      modelLower.includes('gpt') ||
      modelLower.includes('o1') ||
      modelLower.includes('o3')
    )
      return 'openai';
    if (modelLower.includes('gemini')) return 'google';
    if (modelLower.includes('deepseek')) return 'deepseek';
    if (modelLower.includes('doubao')) return 'doubao';
    if (modelLower.includes('qwen')) return 'dashscope';
    if (modelLower.includes('glm')) return 'zhipu';
    if (modelLower.includes('llama')) return 'meta';
    if (modelLower.includes('mistral')) return 'mistral';

    return 'openai'; // 默认
  }

  /**
   * 获取所有能力标签
   */
  getAllCapabilityTags(): CapabilityTag[] {
    return Array.from(this.capabilityTags.values());
  }

  /**
   * 获取指定能力标签
   */
  getCapabilityTag(tagId: string): CapabilityTag | undefined {
    return this.capabilityTags.get(tagId);
  }

  // ============================================================================
  // 复杂度路由相关方法
  // ============================================================================

  /**
   * 设置复杂度路由配置
   */
  setComplexityRoutingConfig(config: ComplexityRoutingConfig): void {
    this.complexityRoutingConfig = config;

    // 同步更新分类器配置
    if (config.classifier && this.complexityClassifier) {
      this.complexityClassifier.setClassifierConfig({
        model: config.classifier.model,
        vendor: config.classifier.vendor,
        baseUrl: config.classifier.baseUrl,
      });
    }

    this.logger.info('[RoutingEngine] Complexity routing config updated', {
      enabled: config.enabled,
      toolMinComplexity: config.toolMinComplexity,
      classifierModel: config.classifier?.model,
      classifierVendor: config.classifier?.vendor,
    });
  }

  /**
   * 获取复杂度路由配置
   */
  getComplexityRoutingConfig(): ComplexityRoutingConfig {
    return this.complexityRoutingConfig;
  }

  /**
   * 基于复杂度的路由决策
   *
   * @param requestBody 请求体
   * @param context Bot 路由上下文
   * @param routingHint 路由提示
   * @returns 路由决策（包含复杂度信息）
   */
  async selectRouteWithComplexity(
    requestBody: ProxyRequestBody,
    context: BotRoutingContext,
    routingHint?: string,
  ): Promise<RouteDecision> {
    // 1. 获取复杂度路由配置（优先级：context > 数据库 > 默认）
    let complexityConfig = context.routingConfig?.complexityRouting;

    if (!complexityConfig) {
      // 尝试从数据库加载默认配置
      complexityConfig = await this.loadComplexityRoutingConfig('default');
    }

    // 2. 如果未启用复杂度路由或没有分类器，使用传统路由
    if (!complexityConfig.enabled || !this.complexityClassifier) {
      this.logger.debug(
        '[RoutingEngine] Complexity routing disabled, using capability-based routing',
      );
      const requirements = this.parseCapabilityRequirements(
        requestBody,
        routingHint,
      );
      return this.selectRoute(requirements, context, requestBody.model);
    }

    // 3. 提取用户消息和上下文
    const { message, contextMessage } = this.extractMessageAndContext(
      requestBody.messages,
    );

    if (!message) {
      this.logger.warn(
        '[RoutingEngine] No user message found, using default route',
      );
      const requirements = this.parseCapabilityRequirements(
        requestBody,
        routingHint,
      );
      return this.selectRoute(requirements, context, requestBody.model);
    }

    // 4. 调用复杂度分类器
    const classifyResult = await this.complexityClassifier.classify({
      message,
      context: contextMessage,
      hasTools: !!requestBody.tools && requestBody.tools.length > 0,
    });

    // 5. 应用工具调用的最低复杂度
    let finalLevel = classifyResult.level;
    if (
      requestBody.tools &&
      requestBody.tools.length > 0 &&
      complexityConfig.toolMinComplexity
    ) {
      finalLevel = this.complexityClassifier.ensureMinComplexity(
        classifyResult.level,
        complexityConfig.toolMinComplexity,
      );
      if (finalLevel !== classifyResult.level) {
        this.logger.debug(
          `[RoutingEngine] Tools present: bumped ${classifyResult.level} -> ${finalLevel}`,
        );
      }
    }

    // 6. 根据复杂度选择模型（主模型锚定策略）
    const modelConfig = complexityConfig.models[finalLevel];

    // 主模型能力满足当前复杂度要求 → 使用主模型
    if (context.primaryModel) {
      const primaryScore = await this.getModelCapabilityScore(
        context.primaryModel.model,
      );
      const requiredScore = this.getMinComplexityScore(finalLevel);

      if (primaryScore >= requiredScore) {
        // 主模型能力满足要求，使用主模型
        const decision: RouteDecision = {
          protocol: this.inferProtocolFromVendor(context.primaryModel.vendor),
          vendor: context.primaryModel.vendor,
          model: context.primaryModel.model,
          features: {},
          complexity: {
            level: finalLevel,
            latencyMs: classifyResult.latencyMs,
            inheritedFromContext: classifyResult.inheritedFromContext,
          },
        };

        this.logger.info(
          '[RoutingEngine] Using primary model for complexity routing',
          {
            complexity: finalLevel,
            primaryModel: context.primaryModel.model,
            primaryScore,
            requiredScore,
          },
        );

        // 继续检查特殊能力需求（Extended Thinking, Cache Control 等）
        // 8. 检查是否需要特殊能力（Extended Thinking, Cache Control 等）
        const requirements = this.parseCapabilityRequirements(
          requestBody,
          routingHint,
        );
        if (requirements.length > 0) {
          const primaryRequirement = requirements[0];

          // Extended Thinking 需要 Anthropic Native
          if (primaryRequirement.requiresExtendedThinking) {
            decision.protocol = 'anthropic-native';
            decision.features.extendedThinking = true;
            // 如果主模型不是 Anthropic 模型，需要覆盖 vendor/protocol
            if (decision.vendor !== 'anthropic') {
              decision.vendor = 'anthropic';
              decision.model =
                primaryRequirement.requiredModels?.[0] ||
                'claude-sonnet-4-20250514';
            }
          } else if (primaryRequirement.requiresCacheControl) {
            decision.protocol = 'anthropic-native';
            decision.features.cacheControl = true;
            if (decision.vendor !== 'anthropic') {
              decision.vendor = 'anthropic';
              decision.model = 'claude-sonnet-4-20250514';
            }
          } else if (primaryRequirement.requiredProtocol) {
            decision.protocol = primaryRequirement.requiredProtocol;
          }
        }

        // 9. 应用 fallback 和 cost 配置
        if (context.routingConfig) {
          if (context.routingConfig.fallbackChainId) {
            decision.fallbackChainId = context.routingConfig.fallbackChainId;
          }
          if (context.routingConfig.costStrategyId) {
            decision.costStrategyId = context.routingConfig.costStrategyId;
          }
        }

        return decision;
      }
      // 主模型能力不足 → 继续使用复杂度映射的模型
    }

    // 7. 构建路由决策
    const decision: RouteDecision = {
      protocol: this.inferProtocolFromVendor(modelConfig.vendor),
      vendor: modelConfig.vendor,
      model: modelConfig.model,
      features: {},
      complexity: {
        level: finalLevel,
        latencyMs: classifyResult.latencyMs,
        inheritedFromContext: classifyResult.inheritedFromContext,
      },
    };

    // 8. 检查是否需要特殊能力（Extended Thinking, Cache Control 等）
    const requirements = this.parseCapabilityRequirements(
      requestBody,
      routingHint,
    );
    if (requirements.length > 0) {
      const primaryRequirement = requirements[0];

      // Extended Thinking 需要 Anthropic Native
      if (primaryRequirement.requiresExtendedThinking) {
        decision.protocol = 'anthropic-native';
        decision.features.extendedThinking = true;
        // 如果复杂度选择的不是 Anthropic 模型，需要覆盖
        if (decision.vendor !== 'anthropic') {
          decision.vendor = 'anthropic';
          decision.model =
            primaryRequirement.requiredModels?.[0] ||
            'claude-sonnet-4-20250514';
        }
      }

      // Cache Control 需要 Anthropic Native
      if (primaryRequirement.requiresCacheControl) {
        decision.protocol = 'anthropic-native';
        decision.features.cacheControl = true;
      }
    }

    // 9. 应用 fallback 和 cost 配置
    if (context.routingConfig) {
      if (context.routingConfig.fallbackChainId) {
        decision.fallbackChainId = context.routingConfig.fallbackChainId;
      }
      if (context.routingConfig.costStrategyId) {
        decision.costStrategyId = context.routingConfig.costStrategyId;
      }
    }

    this.logger.info('[RoutingEngine] Complexity-based route decision', {
      complexity: finalLevel,
      latencyMs: classifyResult.latencyMs,
      vendor: decision.vendor,
      model: decision.model,
      protocol: decision.protocol,
    });

    return decision;
  }

  /**
   * 从消息数组中提取最后一条用户消息和上下文
   */
  private extractMessageAndContext(messages?: ProxyRequestBody['messages']): {
    message: string;
    contextMessage?: string;
  } {
    if (!messages || messages.length === 0) {
      return { message: '' };
    }

    let userMessage = '';
    let contextMessage: string | undefined;
    let foundUser = false;

    // 从后往前遍历，找到最后一条用户消息
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const content = this.extractTextFromContent(msg.content);

      if (!foundUser && msg.role === 'user') {
        userMessage = content;
        foundUser = true;
      } else if (foundUser && content) {
        // 获取用户消息之前的消息作为上下文
        contextMessage = content.substring(0, 200);
        break;
      }
    }

    return { message: userMessage, contextMessage };
  }

  /**
   * 从消息内容中提取文本
   */
  private extractTextFromContent(content: unknown): string {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .filter(
          (item): item is { type: string; text: string } =>
            typeof item === 'object' &&
            item !== null &&
            'type' in item &&
            item.type === 'text' &&
            'text' in item,
        )
        .map((item) => item.text)
        .join(' ');
    }

    return '';
  }

  /**
   * 获取模型能力分数
   * 优先从数据库 ModelCatalog.reasoningScore 读取，其次使用缓存，最后使用硬编码默认值
   */
  private async getModelCapabilityScore(model: string): Promise<number> {
    // 检查缓存
    const cached = this.modelCapabilityScoreCache.get(model);
    if (cached && cached.expiry > Date.now()) {
      return cached.score;
    }

    // 尝试从数据库读取
    if (this.modelCatalogService) {
      try {
        const catalog = await this.modelCatalogService.get({ model });
        if (catalog) {
          // 使用推理评分作为能力分数（0-100）
          const score = catalog.reasoningScore ?? 50;
          // 缓存结果
          this.modelCapabilityScoreCache.set(model, {
            score,
            expiry: Date.now() + this.scoreCacheTTL,
          });
          return score;
        }
      } catch (error) {
        this.logger.warn(
          `[RoutingEngine] Failed to get capability score from DB for ${model}, using fallback`,
          { error },
        );
      }
    }

    // Fallback: 使用硬编码默认值
    const fallbackScore = this.getFallbackCapabilityScore(model);
    // 缓存结果（使用较短的 TTL）
    this.modelCapabilityScoreCache.set(model, {
      score: fallbackScore,
      expiry: Date.now() + 60 * 1000, // 1 分钟
    });
    return fallbackScore;
  }

  /**
   * 硬编码的能力评分（用于数据库不可用时的 fallback）
   * GLM-5 优先链路评分
   */
  private getFallbackCapabilityScore(model: string): number {
    const modelLower = model.toLowerCase();

    // Zhipu GLM (最高优先级)
    if (modelLower === 'glm-5' || modelLower.includes('glm-5')) return 95;
    if (modelLower.includes('glm-4.5')) return 88;
    if (modelLower.includes('glm-4')) return 75;
    // Anthropic Claude
    if (modelLower.includes('claude-opus-4')) return 100;
    if (modelLower.includes('claude-sonnet-4')) return 85;
    if (modelLower.includes('claude-3-5-haiku')) return 60;
    // OpenAI
    if (modelLower === 'o1' || modelLower.includes('o1-')) return 95;
    if (modelLower === 'o3-mini' || modelLower.includes('o3-mini')) return 80;
    if (modelLower === 'gpt-4o' || modelLower.includes('gpt-4o')) return 82;
    if (modelLower === 'gpt-4o-mini' || modelLower.includes('gpt-4o-mini'))
      return 55;
    if (modelLower.includes('gpt-4-turbo')) return 78;
    // DeepSeek
    if (
      modelLower === 'deepseek-reasoner' ||
      modelLower.includes('deepseek-reasoner')
    )
      return 88;
    if (modelLower.includes('deepseek-v3-2')) return 72;
    if (modelLower === 'deepseek-v3' || modelLower.includes('deepseek-v3'))
      return 70;
    if (modelLower === 'deepseek-chat' || modelLower.includes('deepseek-chat'))
      return 65;
    // Google
    if (modelLower.includes('gemini-2.0-flash')) return 68;
    if (modelLower.includes('gemini-1.5-pro')) return 75;
    // Others
    if (modelLower.includes('llama-3.3-70b-versatile')) return 62;

    // 默认分数
    return 50;
  }

  /**
   * 获取指定复杂度等级所需的最小能力分数
   */
  private getMinComplexityScore(level: ComplexityLevel): number {
    const scoreMap: Record<ComplexityLevel, number> = {
      super_easy: 0,
      easy: 40,
      medium: 60,
      hard: 80,
      super_hard: 90,
    };
    return scoreMap[level];
  }

  /**
   * 从 vendor 推断协议
   */
  private inferProtocolFromVendor(
    vendor: string,
  ): 'openai-compatible' | 'anthropic-native' {
    // 只有 Anthropic 使用原生协议，其他都使用 OpenAI 兼容协议
    return vendor === 'anthropic' ? 'anthropic-native' : 'openai-compatible';
  }
}
