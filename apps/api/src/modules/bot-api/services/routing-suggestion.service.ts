/**
 * RoutingSuggestionService
 *
 * AI-powered service that analyzes bot's allowed models and generates
 * intelligent routing rule suggestions based on model capabilities.
 */
import { Injectable, Inject } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import type { BotProviderDetail, RoutingTarget } from '@repo/contracts';

/**
 * Model capability analysis result
 */
interface ModelCapability {
  modelId: string;
  providerKeyId: string;
  vendor: string;
  strengths: string[];
  bestFor: string[];
  score: Record<string, number>; // domain -> score (0-100)
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

// Domain definitions with patterns
const DOMAINS: Record<string, { name: string; patterns: string[] }> = {
  code: {
    name: 'Code & Programming',
    patterns: ['代码', '编程', '调试', 'debug', 'code', '程序', '函数', 'bug', '报错', '编译', 'programming', 'script', 'algorithm'],
  },
  translation: {
    name: 'Translation',
    patterns: ['翻译', 'translate', '英译中', '中译英', '转换成', 'translation', 'in english', 'in chinese'],
  },
  math: {
    name: 'Math & Calculation',
    patterns: ['计算', '数学', '公式', '方程', '求解', '算一下', 'calculate', 'math', 'formula', 'equation', 'solve'],
  },
  creative: {
    name: 'Creative Writing',
    patterns: ['写一篇', '创作', '故事', '诗歌', '文案', '小说', '剧本', 'write a', 'story', 'poem', 'creative'],
  },
  analysis: {
    name: 'Data Analysis',
    patterns: ['分析', '数据', '统计', '报表', '图表', '趋势', 'analyze', 'analysis', 'data', 'statistics', 'report'],
  },
  image: {
    name: 'Image Generation',
    patterns: ['画一张', '生成图片', '图像', '绘制', '设计图', 'draw', 'generate image', 'picture', 'illustration'],
  },
  summary: {
    name: 'Summarization',
    patterns: ['总结', '摘要', '概括', '归纳', '要点', 'summarize', 'summary', 'brief', 'key points', 'tldr'],
  },
  knowledge: {
    name: 'Knowledge Q&A',
    patterns: ['什么是', '为什么', '如何', '怎么', '是什么', '解释', 'what is', 'why', 'how to', 'explain', 'define'],
  },
};

// Model capability knowledge base
const MODEL_CAPABILITIES: Record<string, {
  strengths: string[];
  bestFor: string[];
  scores: Record<string, number>;
}> = {
  // OpenAI models
  'gpt-4o': {
    strengths: ['reasoning', 'coding', 'analysis', 'multilingual', 'vision'],
    bestFor: ['complex tasks', 'code generation', 'data analysis', 'translation'],
    scores: { code: 95, translation: 90, math: 90, creative: 85, analysis: 95, summary: 85, knowledge: 90 },
  },
  'gpt-4o-mini': {
    strengths: ['fast', 'cost-effective', 'general'],
    bestFor: ['simple tasks', 'quick responses', 'summarization'],
    scores: { code: 75, translation: 80, math: 75, creative: 70, analysis: 75, summary: 85, knowledge: 80 },
  },
  'gpt-4-turbo': {
    strengths: ['reasoning', 'coding', 'long-context'],
    bestFor: ['complex reasoning', 'code review', 'document analysis'],
    scores: { code: 90, translation: 85, math: 88, creative: 80, analysis: 90, summary: 85, knowledge: 88 },
  },
  'o1': {
    strengths: ['deep reasoning', 'math', 'science', 'coding'],
    bestFor: ['complex math', 'scientific problems', 'algorithm design'],
    scores: { code: 95, translation: 70, math: 98, creative: 60, analysis: 95, summary: 70, knowledge: 85 },
  },
  'o1-mini': {
    strengths: ['reasoning', 'math', 'coding'],
    bestFor: ['math problems', 'coding tasks'],
    scores: { code: 90, translation: 65, math: 95, creative: 55, analysis: 85, summary: 65, knowledge: 75 },
  },
  // Anthropic models
  'claude-3-5-sonnet': {
    strengths: ['coding', 'analysis', 'reasoning', 'writing'],
    bestFor: ['code generation', 'technical writing', 'analysis'],
    scores: { code: 95, translation: 85, math: 88, creative: 90, analysis: 95, summary: 90, knowledge: 90 },
  },
  'claude-3-5-sonnet-20241022': {
    strengths: ['coding', 'analysis', 'reasoning', 'writing'],
    bestFor: ['code generation', 'technical writing', 'analysis'],
    scores: { code: 95, translation: 85, math: 88, creative: 90, analysis: 95, summary: 90, knowledge: 90 },
  },
  'claude-3-opus': {
    strengths: ['deep reasoning', 'creative writing', 'analysis'],
    bestFor: ['complex tasks', 'creative writing', 'research'],
    scores: { code: 90, translation: 88, math: 90, creative: 95, analysis: 95, summary: 90, knowledge: 95 },
  },
  'claude-3-haiku': {
    strengths: ['fast', 'cost-effective', 'summarization'],
    bestFor: ['quick tasks', 'summarization', 'simple queries'],
    scores: { code: 70, translation: 75, math: 70, creative: 65, analysis: 70, summary: 90, knowledge: 75 },
  },
  // DeepSeek models
  'deepseek-chat': {
    strengths: ['coding', 'math', 'reasoning'],
    bestFor: ['code generation', 'math problems', 'technical tasks'],
    scores: { code: 90, translation: 75, math: 92, creative: 70, analysis: 85, summary: 75, knowledge: 80 },
  },
  'deepseek-coder': {
    strengths: ['coding', 'debugging', 'code review'],
    bestFor: ['code generation', 'debugging', 'code explanation'],
    scores: { code: 95, translation: 60, math: 80, creative: 50, analysis: 75, summary: 65, knowledge: 70 },
  },
  'deepseek-reasoner': {
    strengths: ['reasoning', 'math', 'logic'],
    bestFor: ['complex reasoning', 'math problems', 'logical analysis'],
    scores: { code: 85, translation: 65, math: 95, creative: 55, analysis: 90, summary: 70, knowledge: 80 },
  },
  // Google models
  'gemini-pro': {
    strengths: ['general', 'multilingual', 'reasoning'],
    bestFor: ['general tasks', 'translation', 'analysis'],
    scores: { code: 85, translation: 90, math: 85, creative: 80, analysis: 85, summary: 85, knowledge: 88 },
  },
  'gemini-1.5-pro': {
    strengths: ['long-context', 'multimodal', 'reasoning'],
    bestFor: ['document analysis', 'complex tasks', 'multimodal'],
    scores: { code: 88, translation: 88, math: 88, creative: 82, analysis: 90, summary: 88, knowledge: 90 },
  },
  'gemini-flash': {
    strengths: ['fast', 'cost-effective'],
    bestFor: ['quick tasks', 'simple queries'],
    scores: { code: 70, translation: 75, math: 70, creative: 65, analysis: 70, summary: 80, knowledge: 75 },
  },
  // Mistral models
  'mistral-large': {
    strengths: ['reasoning', 'coding', 'multilingual'],
    bestFor: ['complex tasks', 'code generation', 'translation'],
    scores: { code: 88, translation: 88, math: 85, creative: 80, analysis: 85, summary: 82, knowledge: 85 },
  },
  'codestral': {
    strengths: ['coding', 'code completion'],
    bestFor: ['code generation', 'code completion', 'debugging'],
    scores: { code: 92, translation: 55, math: 75, creative: 45, analysis: 70, summary: 60, knowledge: 65 },
  },
  // Image models
  'dall-e-3': {
    strengths: ['image generation', 'creative'],
    bestFor: ['image generation', 'illustration'],
    scores: { code: 0, translation: 0, math: 0, creative: 50, analysis: 0, summary: 0, knowledge: 0, image: 95 },
  },
};

@Injectable()
export class RoutingSuggestionService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  /**
   * Generate routing suggestions based on bot's allowed models
   */
  async generateSuggestions(
    providers: BotProviderDetail[],
  ): Promise<RoutingSuggestionResult> {
    this.logger.info('Generating routing suggestions', {
      providerCount: providers.length,
      totalModels: providers.reduce((sum, p) => sum + p.allowedModels.length, 0),
    });

    // Analyze model capabilities
    const modelCapabilities = this.analyzeModelCapabilities(providers);

    // Generate function route rules
    const functionRouteRules = this.generateFunctionRouteRules(modelCapabilities);

    // Determine default target (best general-purpose model)
    const defaultTarget = this.selectDefaultTarget(modelCapabilities);

    // Generate failover suggestion
    const failoverSuggestion = this.generateFailoverSuggestion(modelCapabilities);

    // Generate summary
    const summary = this.generateSummary(modelCapabilities, functionRouteRules);

    return {
      functionRouteRules,
      defaultTarget,
      failoverSuggestion,
      analysis: {
        modelCapabilities,
        summary,
      },
    };
  }

  /**
   * Analyze capabilities of all available models
   */
  private analyzeModelCapabilities(providers: BotProviderDetail[]): ModelCapability[] {
    const capabilities: ModelCapability[] = [];

    for (const provider of providers) {
      for (const modelId of provider.allowedModels) {
        const capability = this.getModelCapability(
          modelId,
          provider.providerKeyId,
          provider.vendor,
        );
        capabilities.push(capability);
      }
    }

    return capabilities;
  }

  /**
   * Get capability info for a specific model
   */
  private getModelCapability(
    modelId: string,
    providerKeyId: string,
    vendor: string,
  ): ModelCapability {
    // Try to find exact match first
    let knownCapability = MODEL_CAPABILITIES[modelId];

    // Try partial match if exact match not found
    if (!knownCapability) {
      const normalizedId = modelId.toLowerCase();
      for (const [key, value] of Object.entries(MODEL_CAPABILITIES)) {
        if (normalizedId.includes(key.toLowerCase()) || key.toLowerCase().includes(normalizedId)) {
          knownCapability = value;
          break;
        }
      }
    }

    // Default capability for unknown models
    if (!knownCapability) {
      knownCapability = {
        strengths: ['general'],
        bestFor: ['general tasks'],
        scores: { code: 70, translation: 70, math: 70, creative: 70, analysis: 70, summary: 70, knowledge: 70 },
      };
    }

    return {
      modelId,
      providerKeyId,
      vendor,
      strengths: knownCapability.strengths,
      bestFor: knownCapability.bestFor,
      score: knownCapability.scores,
    };
  }

  /**
   * Generate function route rules based on model capabilities
   */
  private generateFunctionRouteRules(capabilities: ModelCapability[]): SuggestedRoutingRule[] {
    const rules: SuggestedRoutingRule[] = [];

    // For each domain, find the best model
    for (const [domainKey, domain] of Object.entries(DOMAINS)) {
      const bestModel = this.findBestModelForDomain(capabilities, domainKey);
      if (!bestModel) continue;

      const score = bestModel.score[domainKey] || 70;
      const pattern = domain.patterns.join('|');

      rules.push({
        name: domain.name,
        description: `Route ${domain.name.toLowerCase()} requests to ${bestModel.modelId}`,
        pattern,
        matchType: 'keyword',
        target: {
          providerKeyId: bestModel.providerKeyId,
          model: bestModel.modelId,
        },
        confidence: score,
        reasoning: `${bestModel.modelId} scores ${score}/100 for ${domain.name}. Strengths: ${bestModel.strengths.join(', ')}`,
      });
    }

    // Sort by confidence (highest first)
    rules.sort((a, b) => b.confidence - a.confidence);

    return rules;
  }

  /**
   * Find the best model for a specific domain
   */
  private findBestModelForDomain(
    capabilities: ModelCapability[],
    domain: string,
  ): ModelCapability | null {
    let bestModel: ModelCapability | null = null;
    let bestScore = 0;

    for (const cap of capabilities) {
      const score = cap.score[domain] || 0;
      if (score > bestScore) {
        bestScore = score;
        bestModel = cap;
      }
    }

    return bestModel;
  }

  /**
   * Select the best default target (general-purpose model)
   */
  private selectDefaultTarget(capabilities: ModelCapability[]): RoutingTarget {
    // Calculate average score for each model
    const modelScores = capabilities.map((cap) => {
      const scores = Object.values(cap.score);
      const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
      return { cap, avgScore };
    });

    // Sort by average score
    modelScores.sort((a, b) => b.avgScore - a.avgScore);

    const best = modelScores[0];
    if (best) {
      return {
        providerKeyId: best.cap.providerKeyId,
        model: best.cap.modelId,
      };
    }

    // Fallback to first available model
    const firstCap = capabilities[0];
    return {
      providerKeyId: firstCap?.providerKeyId || '',
      model: firstCap?.modelId || '',
    };
  }

  /**
   * Generate failover suggestion
   */
  private generateFailoverSuggestion(
    capabilities: ModelCapability[],
  ): { primary: RoutingTarget; fallbackChain: RoutingTarget[] } | undefined {
    if (capabilities.length < 2) {
      return undefined;
    }

    // Calculate average score for each model
    const modelScores = capabilities.map((cap) => {
      const scores = Object.values(cap.score);
      const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
      return { cap, avgScore };
    });

    // Sort by average score
    modelScores.sort((a, b) => b.avgScore - a.avgScore);

    const primary = modelScores[0];
    const fallbacks = modelScores.slice(1, 4); // Up to 3 fallbacks

    return {
      primary: {
        providerKeyId: primary.cap.providerKeyId,
        model: primary.cap.modelId,
      },
      fallbackChain: fallbacks.map((f) => ({
        providerKeyId: f.cap.providerKeyId,
        model: f.cap.modelId,
      })),
    };
  }

  /**
   * Generate summary of the analysis
   */
  private generateSummary(
    capabilities: ModelCapability[],
    rules: SuggestedRoutingRule[],
  ): string {
    const modelCount = capabilities.length;
    const ruleCount = rules.length;
    const avgConfidence = rules.length > 0
      ? Math.round(rules.reduce((sum, r) => sum + r.confidence, 0) / rules.length)
      : 0;

    const topModels = capabilities
      .map((cap) => {
        const avgScore = Object.values(cap.score).reduce((sum, s) => sum + s, 0) / Object.values(cap.score).length;
        return { model: cap.modelId, avgScore };
      })
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 3)
      .map((m) => `${m.model} (${Math.round(m.avgScore)}分)`)
      .join(', ');

    return `分析了 ${modelCount} 个模型，生成了 ${ruleCount} 条路由规则，平均置信度 ${avgConfidence}%。推荐的通用模型: ${topModels}`;
  }
}

