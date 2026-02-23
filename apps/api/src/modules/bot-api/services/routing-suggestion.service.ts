/**
 * RoutingSuggestionService
 *
 * AI-powered service that analyzes bot's allowed models and generates
 * intelligent routing rule suggestions based on capability tags from the database.
 *
 * Uses CapabilityTag.requiredModels (ordered by recommendation priority)
 * and ModelCapabilityTag associations to pick the best model for each capability.
 */
import { Injectable, Inject } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import type { RoutingTarget } from '@repo/contracts';

/**
 * Provider info needed for routing suggestion
 */
interface ProviderInfo {
  providerKeyId: string;
  vendor: string;
  allowedModels: string[];
}

/**
 * Capability tag info from the database
 */
export interface CapabilityTagInfo {
  tagId: string;
  name: string;
  description?: string | null;
  category: string;
  priority: number;
  requiredModels?: string[] | null;
}

/**
 * Model-to-capability-tag association from the database
 */
export interface ModelTagAssociation {
  modelId: string; // ModelAvailability.model
  tagIds: string[];
}

/**
 * Primary model info from BotModel (isPrimary=true)
 */
export interface PrimaryModelInfo {
  modelId: string;
  providerKeyId: string;
  vendor: string;
}

/**
 * Model capability analysis result
 */
interface ModelCapability {
  modelId: string;
  providerKeyId: string;
  vendor: string;
  strengths: string[];
  bestFor: string[];
  score: Record<string, number>; // tagId -> score (0-100)
}

/**
 * Suggested routing rule
 */
export interface SuggestedRoutingRule {
  name: string;
  description: string;
  pattern: string;
  matchType: 'keyword' | 'regex' | 'intent';
  target: RoutingTarget;
  confidence: number; // 0-100
  reasoning: string;
}

/**
 * Routing suggestion result
 */
export interface RoutingSuggestionResult {
  functionRouteRules: SuggestedRoutingRule[];
  defaultTarget: RoutingTarget;
  failoverSuggestion?: {
    primary: RoutingTarget;
    fallbackChain: RoutingTarget[];
  };
  analysis: {
    modelCapabilities: ModelCapability[];
    summary: string;
  };
}

/**
 * Keyword patterns for capability tags that can be used for function routing.
 * Maps tagId -> keyword patterns for matching user messages.
 */
const TAG_KEYWORD_PATTERNS: Record<string, string[]> = {
  'deep-reasoning': [
    '深度分析',
    '复杂推理',
    '逻辑推导',
    '深入思考',
    '仔细分析',
    '详细推理',
    '逐步分析',
    '深度思考',
    'deep analysis',
    'complex reasoning',
    'think step by step',
    'detailed reasoning',
    'thorough analysis',
  ],
  'fast-reasoning': [
    '快速回答',
    '简单问题',
    '简短回复',
    '快速',
    '简单',
    'quick answer',
    'brief',
    'short reply',
    'simple question',
  ],
  'web-search': [
    '搜索',
    '查找',
    '最新',
    '实时',
    '新闻',
    '今天',
    '最近',
    '当前',
    '现在',
    '热点',
    '时事',
    'search',
    'latest',
    'news',
    'current',
    'today',
    'recent',
    'look up',
    'find out',
    'what happened',
  ],
  'code-execution': [
    '运行代码',
    '执行代码',
    '计算结果',
    '跑一下',
    '运行一下',
    'run code',
    'execute code',
    'compute',
    'run this',
  ],
  coding: [
    '代码',
    '编程',
    '调试',
    'debug',
    'code',
    '程序',
    '函数',
    'bug',
    '报错',
    '编译',
    'programming',
    'script',
    'algorithm',
    '重构',
    'refactor',
    '开发',
    '实现',
    'implement',
    'develop',
    'API',
    '接口',
    '类',
    'class',
    '模块',
    'module',
  ],
  'image-generation': [
    '画一张',
    '生成图片',
    '图像生成',
    '绘制',
    '设计图',
    '插画',
    '画图',
    '作图',
    '生成一张',
    '画一个',
    'draw',
    'generate image',
    'picture',
    'illustration',
    'create image',
    'make an image',
    'design',
  ],
  'video-generation': [
    '生成视频',
    '制作视频',
    '视频创作',
    '做一个视频',
    '视频生成',
    'generate video',
    'create video',
    'make video',
    'produce video',
  ],
  'audio-tts': [
    '语音合成',
    '朗读',
    '文字转语音',
    '播报',
    '读出来',
    '念一下',
    'text to speech',
    'tts',
    'read aloud',
    'voice',
    'speak',
  ],
  creative: [
    '写一篇',
    '创作',
    '故事',
    '诗歌',
    '文案',
    '小说',
    '剧本',
    '写作',
    '文章',
    '散文',
    '营销文案',
    '广告语',
    '标题',
    'write a',
    'story',
    'poem',
    'creative',
    'novel',
    'script',
    'compose',
    'draft',
    'copywriting',
  ],
  'math-optimized': [
    '计算',
    '数学',
    '公式',
    '方程',
    '求解',
    '算一下',
    '证明',
    '微积分',
    '概率',
    '统计',
    '线性代数',
    '几何',
    'calculate',
    'math',
    'formula',
    'equation',
    'solve',
    'proof',
    'calculus',
    'probability',
    'statistics',
  ],
  'chinese-optimized': [
    '中文写作',
    '汉语',
    '成语',
    '古诗',
    '文言文',
    '中文润色',
    '中文翻译',
    '中文摘要',
  ],
  vision: [
    '看图',
    '图片分析',
    '识别图片',
    '这张图',
    '图中',
    '看一下这个',
    '图片里',
    '截图',
    '照片',
    'analyze image',
    'look at',
    'this image',
    'in the picture',
    'screenshot',
    'photo',
    'what do you see',
  ],
  multimodal: [
    '多模态',
    '图文',
    '看这个文件',
    '分析这个PDF',
    'multimodal',
    'image and text',
    'analyze this file',
  ],
  'long-context': [
    '长文档',
    '全文分析',
    '整篇',
    '完整阅读',
    '长文',
    '大量文本',
    '全部内容',
    '整个文件',
    'long document',
    'full text',
    'entire document',
    'large text',
    'whole file',
    'complete document',
  ],
  'agent-capable': [
    '帮我完成',
    '自动执行',
    '多步骤',
    '任务编排',
    '自动化',
    '帮我做',
    '一步步完成',
    'automate',
    'multi-step',
    'orchestrate',
    'agent',
    'step by step do',
  ],
  'function-calling': [
    '调用工具',
    '使用工具',
    '函数调用',
    '调用API',
    '调用接口',
    'call function',
    'use tool',
    'tool use',
    'call API',
  ],
  'fast-response': [
    '快速回复',
    '立即回答',
    '马上',
    '赶紧',
    '急',
    'quick',
    'fast',
    'immediately',
    'asap',
    'hurry',
  ],
  'cost-optimized': [
    '省钱',
    '便宜',
    '低成本',
    '经济',
    '节省',
    'cheap',
    'save cost',
    'budget',
    'economical',
  ],
};

/**
 * Composite routing scenarios — common use cases that don't map to a single
 * capability tag but are frequent routing needs. Each scenario specifies
 * which capability tags to prefer when selecting a model.
 */
interface CompositeScenario {
  name: string;
  description: string;
  patterns: string[];
  /** Prefer models that have these tags (checked in order) */
  preferTags: string[];
  /** Fallback: pick model with highest tag coverage */
  fallbackToGeneral: boolean;
}

const COMPOSITE_SCENARIOS: CompositeScenario[] = [
  {
    name: '翻译',
    description: '多语言翻译任务，优先使用多语言能力强的模型',
    patterns: [
      '翻译',
      'translate',
      '英译中',
      '中译英',
      '转换成',
      'translation',
      'in english',
      'in chinese',
      'in japanese',
      '翻成',
      '译成',
      '用英文',
      '用中文',
    ],
    preferTags: ['chinese-optimized', 'general-purpose', 'fast-reasoning'],
    fallbackToGeneral: true,
  },
  {
    name: '总结摘要',
    description: '文本总结和摘要任务',
    patterns: [
      '总结',
      '摘要',
      '概括',
      '归纳',
      '要点',
      '提炼',
      '精简',
      'summarize',
      'summary',
      'brief',
      'key points',
      'tldr',
      'condense',
      'recap',
    ],
    preferTags: ['long-context', 'general-purpose', 'fast-reasoning'],
    fallbackToGeneral: true,
  },
  {
    name: '数据分析',
    description: '数据分析和统计任务',
    patterns: [
      '分析数据',
      '数据分析',
      '统计',
      '报表',
      '图表',
      '趋势',
      '数据处理',
      '数据挖掘',
      'analyze data',
      'data analysis',
      'statistics',
      'report',
      'chart',
      'trend',
      'data processing',
    ],
    preferTags: [
      'deep-reasoning',
      'coding',
      'math-optimized',
      'general-purpose',
    ],
    fallbackToGeneral: true,
  },
  {
    name: '知识问答',
    description: '通用知识问答和解释任务',
    patterns: [
      '什么是',
      '为什么',
      '如何',
      '怎么',
      '是什么',
      '解释',
      '请问',
      '告诉我',
      '介绍一下',
      '科普',
      'what is',
      'why',
      'how to',
      'explain',
      'define',
      'tell me about',
      'describe',
    ],
    preferTags: ['general-purpose', 'deep-reasoning'],
    fallbackToGeneral: true,
  },
  {
    name: '文档理解',
    description: '文档阅读理解和信息提取',
    patterns: [
      '阅读理解',
      '文档分析',
      '提取信息',
      '文件内容',
      '读一下',
      '这篇文章',
      '这个文档',
      'read this',
      'extract',
      'document analysis',
      'comprehension',
      'this article',
      'this document',
    ],
    preferTags: ['long-context', 'vision', 'general-purpose'],
    fallbackToGeneral: true,
  },
];

/** Tags that are truly non-routable (not user-facing scenarios) */
const NON_ROUTABLE_TAGS = new Set([
  'premium',
  'general-purpose',
  'embedding',
  '3d-generation',
]);

/**
 * Only generate a routing rule for a non-primary model when its confidence
 * exceeds this threshold. Below this, the request stays on the primary model.
 */
const PRIMARY_OVERRIDE_CONFIDENCE_THRESHOLD = 80;

@Injectable()
export class RoutingSuggestionService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  /**
   * Generate routing suggestions based on bot's allowed models and capability tags.
   *
   * @param providers - Bot's available models grouped by provider
   * @param capabilityTags - All active capability tags from DB
   * @param modelTagAssociations - Which models have which capability tags
   * @param primaryModel - Bot's primary model (isPrimary=true), used as default + fallback anchor
   */
  async generateSuggestions(
    providers: ProviderInfo[],
    capabilityTags: CapabilityTagInfo[],
    modelTagAssociations: ModelTagAssociation[],
    primaryModel?: PrimaryModelInfo,
  ): Promise<RoutingSuggestionResult> {
    // Build a flat list of all available models with their provider info
    const availableModels = this.buildAvailableModelList(providers);

    this.logger.info('Generating routing suggestions', {
      providerCount: providers.length,
      totalModels: availableModels.length,
      capabilityTagCount: capabilityTags.length,
      primaryModel: primaryModel?.modelId ?? 'none',
    });

    // Build model -> tagIds lookup from associations
    const modelTagMap = new Map<string, Set<string>>();
    for (const assoc of modelTagAssociations) {
      modelTagMap.set(assoc.modelId, new Set(assoc.tagIds));
    }

    // Analyze model capabilities based on tag associations
    const modelCapabilities = this.analyzeModelCapabilities(
      availableModels,
      capabilityTags,
      modelTagMap,
    );

    // Generate function route rules — only for non-primary models with high confidence
    const functionRouteRules = this.generateFunctionRouteRules(
      availableModels,
      capabilityTags,
      modelTagMap,
      primaryModel,
    );

    // Default target: primary model (fallback to general-purpose tag)
    const defaultTarget = this.selectDefaultTarget(
      availableModels,
      capabilityTags,
      modelTagMap,
      primaryModel,
    );

    // Failover suggestion: primary model as chain head
    const failoverSuggestion = this.generateFailoverSuggestion(
      availableModels,
      capabilityTags,
      modelTagMap,
      primaryModel,
    );

    const summary = this.generateSummary(modelCapabilities, functionRouteRules);

    return {
      functionRouteRules,
      defaultTarget,
      failoverSuggestion,
      analysis: { modelCapabilities, summary },
    };
  }

  private buildAvailableModelList(
    providers: ProviderInfo[],
  ): Array<{ modelId: string; providerKeyId: string; vendor: string }> {
    const models: Array<{
      modelId: string;
      providerKeyId: string;
      vendor: string;
    }> = [];
    for (const provider of providers) {
      for (const modelId of provider.allowedModels) {
        models.push({
          modelId,
          providerKeyId: provider.providerKeyId,
          vendor: provider.vendor,
        });
      }
    }
    return models;
  }

  /**
   * For a given capability tag, find the best model from available models.
   *
   * Priority order:
   * 1. Models in tag.requiredModels (earlier index = higher priority)
   * 2. Models with the tag assigned via ModelCapabilityTag
   * 3. null if no match
   */
  private findBestModelForTag(
    availableModels: Array<{
      modelId: string;
      providerKeyId: string;
      vendor: string;
    }>,
    tag: CapabilityTagInfo,
    modelTagMap: Map<string, Set<string>>,
  ): {
    modelId: string;
    providerKeyId: string;
    vendor: string;
    confidence: number;
  } | null {
    const requiredModels = tag.requiredModels ?? [];
    const availableSet = new Map(availableModels.map((m) => [m.modelId, m]));

    // Strategy 1: Check requiredModels list (ordered by priority)
    for (let i = 0; i < requiredModels.length; i++) {
      const reqModel = requiredModels[i];
      // Exact match
      const exact = availableSet.get(reqModel);
      if (exact) {
        // Score: 95 for first, decreasing by 3 per position, min 60
        const confidence = Math.max(95 - i * 3, 60);
        return { ...exact, confidence };
      }
      // Partial match (e.g. "deepseek-v3" matches "deepseek-v3-2-251201")
      for (const [modelId, model] of availableSet) {
        if (
          modelId.toLowerCase().includes(reqModel.toLowerCase()) ||
          reqModel.toLowerCase().includes(modelId.toLowerCase())
        ) {
          const confidence = Math.max(90 - i * 3, 55);
          return { ...model, confidence };
        }
      }
    }

    // Strategy 2: Check ModelCapabilityTag associations
    for (const model of availableModels) {
      const tags = modelTagMap.get(model.modelId);
      if (tags?.has(tag.tagId)) {
        return { ...model, confidence: 70 };
      }
    }

    return null;
  }

  private generateFunctionRouteRules(
    availableModels: Array<{
      modelId: string;
      providerKeyId: string;
      vendor: string;
    }>,
    capabilityTags: CapabilityTagInfo[],
    modelTagMap: Map<string, Set<string>>,
    primaryModel?: PrimaryModelInfo,
  ): SuggestedRoutingRule[] {
    const rules: SuggestedRoutingRule[] = [];

    // Part 1: Tag-based rules (one per routable capability tag)
    const sortedTags = [...capabilityTags]
      .filter((t) => !NON_ROUTABLE_TAGS.has(t.tagId))
      .sort((a, b) => b.priority - a.priority);

    for (const tag of sortedTags) {
      const patterns = TAG_KEYWORD_PATTERNS[tag.tagId];
      if (!patterns || patterns.length === 0) continue;

      const bestModel = this.findBestModelForTag(
        availableModels,
        tag,
        modelTagMap,
      );
      if (!bestModel) continue;

      // Skip if best model IS the primary model (default route handles it)
      if (primaryModel && bestModel.modelId === primaryModel.modelId) {
        continue;
      }

      // Skip if confidence is below threshold — keep on primary model
      if (
        primaryModel &&
        bestModel.confidence < PRIMARY_OVERRIDE_CONFIDENCE_THRESHOLD
      ) {
        continue;
      }

      rules.push({
        name: tag.name,
        description: tag.description
          ? `${tag.description} → ${bestModel.modelId}`
          : `Route ${tag.name} requests to ${bestModel.modelId}`,
        pattern: patterns.join('|'),
        matchType: 'keyword',
        target: {
          providerKeyId: bestModel.providerKeyId,
          model: bestModel.modelId,
        },
        confidence: bestModel.confidence,
        reasoning: `${bestModel.modelId} is ${
          bestModel.confidence >= 90
            ? 'a top recommended model'
            : bestModel.confidence >= 70
              ? 'a capable model'
              : 'a suitable model'
        } for "${tag.name}" (confidence: ${bestModel.confidence}%)`,
      });
    }

    // Part 2: Composite scenario rules (common use cases)
    for (const scenario of COMPOSITE_SCENARIOS) {
      const bestModel = this.findBestModelForScenario(
        availableModels,
        capabilityTags,
        modelTagMap,
        scenario,
      );
      if (!bestModel) continue;

      // Skip if best model IS the primary model
      if (primaryModel && bestModel.modelId === primaryModel.modelId) {
        continue;
      }

      // Skip if confidence is below threshold
      if (
        primaryModel &&
        bestModel.confidence < PRIMARY_OVERRIDE_CONFIDENCE_THRESHOLD
      ) {
        continue;
      }

      rules.push({
        name: scenario.name,
        description: `${scenario.description} → ${bestModel.modelId}`,
        pattern: scenario.patterns.join('|'),
        matchType: 'keyword',
        target: {
          providerKeyId: bestModel.providerKeyId,
          model: bestModel.modelId,
        },
        confidence: bestModel.confidence,
        reasoning: `${bestModel.modelId} selected for "${scenario.name}" based on capability coverage (confidence: ${bestModel.confidence}%)`,
      });
    }

    // Sort by confidence (highest first)
    rules.sort((a, b) => b.confidence - a.confidence);
    return rules;
  }

  /**
   * Find the best model for a composite scenario by checking preferred tags in order.
   */
  private findBestModelForScenario(
    availableModels: Array<{
      modelId: string;
      providerKeyId: string;
      vendor: string;
    }>,
    capabilityTags: CapabilityTagInfo[],
    modelTagMap: Map<string, Set<string>>,
    scenario: CompositeScenario,
  ): {
    modelId: string;
    providerKeyId: string;
    vendor: string;
    confidence: number;
  } | null {
    // Try each preferred tag in order
    for (let i = 0; i < scenario.preferTags.length; i++) {
      const tagId = scenario.preferTags[i];
      const tag = capabilityTags.find((t) => t.tagId === tagId);
      if (!tag) continue;

      const best = this.findBestModelForTag(availableModels, tag, modelTagMap);
      if (best) {
        // Slightly reduce confidence for non-primary tag matches
        const adjustedConfidence = Math.max(best.confidence - i * 5, 55);
        return { ...best, confidence: adjustedConfidence };
      }
    }

    // Fallback: pick model with most tag coverage
    if (scenario.fallbackToGeneral && availableModels.length > 0) {
      let bestModel = availableModels[0];
      let maxTags = 0;
      for (const model of availableModels) {
        const tagCount = modelTagMap.get(model.modelId)?.size ?? 0;
        if (tagCount > maxTags) {
          maxTags = tagCount;
          bestModel = model;
        }
      }
      return { ...bestModel, confidence: 60 };
    }

    return null;
  }

  private selectDefaultTarget(
    availableModels: Array<{
      modelId: string;
      providerKeyId: string;
      vendor: string;
    }>,
    capabilityTags: CapabilityTagInfo[],
    modelTagMap: Map<string, Set<string>>,
    primaryModel?: PrimaryModelInfo,
  ): RoutingTarget {
    // 1. Primary model takes priority as default target
    if (primaryModel) {
      const primaryAvailable = availableModels.find(
        (m) => m.modelId === primaryModel.modelId,
      );
      if (primaryAvailable) {
        return {
          providerKeyId: primaryModel.providerKeyId,
          model: primaryModel.modelId,
        };
      }
    }

    // 2. Fallback: find the "general-purpose" tag
    const gpTag = capabilityTags.find((t) => t.tagId === 'general-purpose');
    if (gpTag) {
      const best = this.findBestModelForTag(
        availableModels,
        gpTag,
        modelTagMap,
      );
      if (best) {
        return { providerKeyId: best.providerKeyId, model: best.modelId };
      }
    }

    // 3. Fallback: pick the model that has the most capability tags
    let bestModel = availableModels[0];
    let maxTags = 0;
    for (const model of availableModels) {
      const tagCount = modelTagMap.get(model.modelId)?.size ?? 0;
      if (tagCount > maxTags) {
        maxTags = tagCount;
        bestModel = model;
      }
    }

    return {
      providerKeyId: bestModel?.providerKeyId || '',
      model: bestModel?.modelId || '',
    };
  }

  private generateFailoverSuggestion(
    availableModels: Array<{
      modelId: string;
      providerKeyId: string;
      vendor: string;
    }>,
    capabilityTags: CapabilityTagInfo[],
    modelTagMap: Map<string, Set<string>>,
    primaryModel?: PrimaryModelInfo,
  ): { primary: RoutingTarget; fallbackChain: RoutingTarget[] } | undefined {
    if (availableModels.length < 2) return undefined;

    // Determine primary target
    let primary: (typeof availableModels)[0];

    if (primaryModel) {
      // Use the designated primary model
      primary =
        availableModels.find((m) => m.modelId === primaryModel.modelId) ||
        availableModels[0];
    } else {
      // Legacy fallback: score by tag count + premium preference
      const scored = availableModels.map((m) => ({
        ...m,
        tagCount: modelTagMap.get(m.modelId)?.size ?? 0,
      }));
      scored.sort((a, b) => b.tagCount - a.tagCount);

      const premiumTag = capabilityTags.find((t) => t.tagId === 'premium');
      const premiumModels = new Set(premiumTag?.requiredModels ?? []);
      const premiumAvailable = scored.filter(
        (m) =>
          premiumModels.has(m.modelId) ||
          [...premiumModels].some((pm) =>
            m.modelId.toLowerCase().includes(pm.toLowerCase()),
          ),
      );

      primary = premiumAvailable[0] || scored[0];
    }

    // Build fallback chain with vendor diversity (exclude primary)
    const remaining = availableModels.filter(
      (m) => m.modelId !== primary.modelId,
    );
    const fallbacks: typeof remaining = [];
    const usedVendors = new Set([primary.vendor]);

    // First pass: pick models from different vendors
    for (const m of remaining) {
      if (fallbacks.length >= 3) break;
      if (!usedVendors.has(m.vendor)) {
        fallbacks.push(m);
        usedVendors.add(m.vendor);
      }
    }

    // Second pass: fill remaining slots if needed
    for (const m of remaining) {
      if (fallbacks.length >= 3) break;
      if (!fallbacks.includes(m)) {
        fallbacks.push(m);
      }
    }

    return {
      primary: { providerKeyId: primary.providerKeyId, model: primary.modelId },
      fallbackChain: fallbacks.map((f) => ({
        providerKeyId: f.providerKeyId,
        model: f.modelId,
      })),
    };
  }

  private analyzeModelCapabilities(
    availableModels: Array<{
      modelId: string;
      providerKeyId: string;
      vendor: string;
    }>,
    capabilityTags: CapabilityTagInfo[],
    modelTagMap: Map<string, Set<string>>,
  ): ModelCapability[] {
    return availableModels.map((model) => {
      const assignedTagIds =
        modelTagMap.get(model.modelId) ?? new Set<string>();
      const score: Record<string, number> = {};
      const strengths: string[] = [];
      const bestFor: string[] = [];

      for (const tag of capabilityTags) {
        const requiredModels = tag.requiredModels ?? [];
        const idx = requiredModels.findIndex(
          (rm) =>
            rm.toLowerCase() === model.modelId.toLowerCase() ||
            model.modelId.toLowerCase().includes(rm.toLowerCase()) ||
            rm.toLowerCase().includes(model.modelId.toLowerCase()),
        );

        if (idx >= 0) {
          score[tag.tagId] = Math.max(95 - idx * 3, 60);
          strengths.push(tag.name);
          if (idx < 3) bestFor.push(tag.name);
        } else if (assignedTagIds.has(tag.tagId)) {
          score[tag.tagId] = 70;
          strengths.push(tag.name);
        } else {
          score[tag.tagId] = 0;
        }
      }

      return {
        modelId: model.modelId,
        providerKeyId: model.providerKeyId,
        vendor: model.vendor,
        strengths,
        bestFor,
        score,
      };
    });
  }

  private generateSummary(
    capabilities: ModelCapability[],
    rules: SuggestedRoutingRule[],
  ): string {
    const modelCount = capabilities.length;
    const ruleCount = rules.length;
    const avgConfidence =
      rules.length > 0
        ? Math.round(
            rules.reduce((sum, r) => sum + r.confidence, 0) / rules.length,
          )
        : 0;

    const topModels = capabilities
      .map((cap) => {
        const scores = Object.values(cap.score).filter((s) => s > 0);
        const avgScore =
          scores.length > 0
            ? scores.reduce((sum, s) => sum + s, 0) / scores.length
            : 0;
        return { model: cap.modelId, avgScore, tagCount: scores.length };
      })
      .sort((a, b) => b.tagCount - a.tagCount || b.avgScore - a.avgScore)
      .slice(0, 3)
      .map(
        (m) =>
          `${m.model} (覆盖${m.tagCount}项能力, 平均${Math.round(m.avgScore)}分)`,
      )
      .join(', ');

    return `分析了 ${modelCount} 个模型，基于能力标签生成了 ${ruleCount} 条路由规则，平均置信度 ${avgConfidence}%。推荐模型: ${topModels}`;
  }
}
