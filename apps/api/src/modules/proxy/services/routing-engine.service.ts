import { Inject, Injectable, Optional } from '@nestjs/common';
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
 */
const DEFAULT_COMPLEXITY_ROUTING: ComplexityRoutingConfig = {
  enabled: true,
  models: {
    super_easy: { vendor: 'deepseek', model: 'deepseek-v3' },
    easy: { vendor: 'deepseek', model: 'deepseek-v3' },
    medium: { vendor: 'openai', model: 'gpt-4o' },
    hard: { vendor: 'anthropic', model: 'claude-opus-4-20250514' },
    super_hard: { vendor: 'anthropic', model: 'claude-opus-4-20250514' },
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
export class RoutingEngineService {
  // 预定义能力标签（后续从数据库加载）
  private capabilityTags: Map<string, CapabilityTag> = new Map();
  // 复杂度路由配置
  private complexityRoutingConfig: ComplexityRoutingConfig =
    DEFAULT_COMPLEXITY_ROUTING;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    @Optional()
    private readonly complexityClassifier?: ComplexityClassifierService,
  ) {
    this.initializeDefaultTags();
  }

  /**
   * 初始化默认能力标签
   */
  private initializeDefaultTags(): void {
    const defaultTags: CapabilityTag[] = [
      {
        tagId: 'deep-reasoning',
        name: '深度推理',
        category: 'reasoning',
        priority: 100,
        requiredProtocol: 'anthropic-native',
        requiredModels: ['claude-opus-4-20250514', 'claude-sonnet-4-20250514'],
        requiresExtendedThinking: true,
      },
      {
        tagId: 'fast-reasoning',
        name: '快速推理',
        category: 'reasoning',
        priority: 50,
        requiredProtocol: 'openai-compatible',
        requiredModels: [
          'gpt-4o',
          'claude-sonnet-4-20250514',
          'deepseek-chat',
          'o3-mini',
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
          'deepseek-chat',
          'gpt-4o-mini',
          'gemini-2.0-flash',
          'doubao-pro-32k',
        ],
        requiresCacheControl: true,
      },
      {
        tagId: 'long-context',
        name: '长上下文',
        category: 'context',
        priority: 60,
        requiredProtocol: 'openai-compatible',
        requiredModels: [
          'gemini-1.5-pro',
          'gemini-2.0-flash',
          'doubao-pro-128k',
        ],
      },
      {
        tagId: 'vision',
        name: '视觉理解',
        category: 'vision',
        priority: 75,
        requiredModels: [
          'gpt-4o',
          'claude-sonnet-4-20250514',
          'gemini-2.0-flash',
        ],
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

    // 如果没有特殊需求，使用请求的模型
    if (requirements.length === 0) {
      if (requestedModel) {
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
    // 1. 获取复杂度路由配置
    const complexityConfig =
      context.routingConfig?.complexityRouting || this.complexityRoutingConfig;

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

    // 6. 根据复杂度选择模型
    const modelConfig = complexityConfig.models[finalLevel];

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
   * 从 vendor 推断协议
   */
  private inferProtocolFromVendor(
    vendor: string,
  ): 'openai-compatible' | 'anthropic-native' {
    // 只有 Anthropic 使用原生协议，其他都使用 OpenAI 兼容协议
    return vendor === 'anthropic' ? 'anthropic-native' : 'openai-compatible';
  }
}
