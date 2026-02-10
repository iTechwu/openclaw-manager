/**
 * Complexity Classifier Service
 *
 * 使用 LLM 判断消息复杂度，支持 5 级分类：
 * - super_easy: 简单问候、确认、是/否
 * - easy: 简单问答、提醒、状态检查
 * - medium: 写代码、邮件、研究、修 bug
 * - hard: 重构、调试崩溃、多文件修改
 * - super_hard: 系统设计、架构设计、分布式、证明
 *
 * 参考: https://github.com/alexrudloff/llmrouter
 */
import { Injectable, Inject } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { firstValueFrom } from 'rxjs';
import type { AxiosError } from 'axios';
import { getKeysConfig } from '@/config/configuration';
import type { OpenAIConfig } from '@/config/validation';
import {
  type ComplexityLevel,
  type ClassifyRequest,
  type ClassifyResult,
  type ClassifierConfig,
  COMPLEXITY_LEVELS,
} from './complexity-classifier.types';

/**
 * 分类 Prompt 模板
 * 基于 llmrouter 的 ROUTES.md
 */
const CLASSIFICATION_PROMPT = `Classify complexity. ONE word: super_easy, easy, medium, hard, super_hard

If message has "Context:", classify based on BOTH context and message combined.
Short follow-ups ("Yes", "Try now?") inherit complexity from context.

super_easy: standalone greetings only (hi, hey, thanks, bye) with NO context
easy: simple questions, reminders, status checks
medium: write code, function, email, research, fix bug
hard: refactor, debug crash, multi-file change
super_hard: design system, design architecture, distributed, prove, autonomous

RULE: "design" = super_hard, "refactor" = hard
RULE: short message + complex context = use context complexity

Examples:
"Hey" -> super_easy
"What is 2+2?" -> easy
"Write a sort function" -> medium
"Send email to Bob" -> medium
"Refactor the auth module" -> hard
"Design a distributed system" -> super_hard

Context examples:
"Context: Design a system\\n---\\nMessage: Try now?" -> super_hard
"Context: Write a function\\n---\\nMessage: Yes" -> medium
"Context: Hey how are you\\n---\\nMessage: Good thanks" -> super_easy

Message: {MESSAGE}

Complexity:`;

/**
 * 默认分类器配置
 */
const DEFAULT_CLASSIFIER_CONFIG: ClassifierConfig = {
  model: 'deepseek-v3-250324',
  vendor: 'deepseek',
  timeout: 30000,
};

@Injectable()
export class ComplexityClassifierService {
  /** 分类器配置 */
  private classifierConfig: ClassifierConfig = DEFAULT_CLASSIFIER_CONFIG;
  /** 最大消息长度（超过则截断） */
  private readonly maxMessageLength = 500;
  /** 最大上下文长度 */
  private readonly maxContextLength = 200;

  private openaiConfig: OpenAIConfig | undefined;

  constructor(
    private readonly httpService: HttpService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {
    const keysConfig = getKeysConfig();
    this.openaiConfig = keysConfig?.openai;
  }

  /**
   * 设置分类器配置
   */
  setClassifierConfig(config: Partial<ClassifierConfig>): void {
    this.classifierConfig = {
      ...this.classifierConfig,
      ...config,
    };
    this.logger.info('[ComplexityClassifier] Classifier config updated', {
      model: this.classifierConfig.model,
      vendor: this.classifierConfig.vendor,
    });
  }

  /**
   * 获取分类器配置
   */
  getClassifierConfig(): ClassifierConfig {
    return { ...this.classifierConfig };
  }

  /**
   * 分类消息复杂度
   */
  async classify(request: ClassifyRequest): Promise<ClassifyResult> {
    const startTime = Date.now();

    try {
      // 1. 构建分类 prompt
      const prompt = this.buildPrompt(request);

      // 2. 调用 LLM 进行分类
      const rawResponse = await this.callClassifier(prompt);

      // 3. 提取复杂度等级
      let level = this.extractComplexity(rawResponse);

      // 4. 处理工具调用的复杂度提升
      if (request.hasTools && level === 'super_easy') {
        level = 'easy';
        this.logger.debug(
          '[ComplexityClassifier] Tools present: bumped super_easy -> easy',
        );
      }

      const latencyMs = Date.now() - startTime;

      this.logger.info('[ComplexityClassifier] Classification complete', {
        message: request.message.substring(0, 100),
        level,
        latencyMs,
        hasContext: !!request.context,
        hasTools: request.hasTools,
      });

      return {
        level,
        latencyMs,
        rawResponse,
        inheritedFromContext:
          this.isShortMessage(request.message) && !!request.context,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      this.logger.warn(
        '[ComplexityClassifier] Classification failed, defaulting to medium',
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          latencyMs,
        },
      );

      // 失败时默认返回 medium
      return {
        level: 'medium',
        latencyMs,
      };
    }
  }

  /**
   * 构建分类 prompt
   */
  private buildPrompt(request: ClassifyRequest): string {
    const { message, context } = request;

    // 截断消息
    const truncatedMessage =
      message.length > this.maxMessageLength
        ? message.substring(0, this.maxMessageLength) + '...'
        : message;

    // 如果有上下文，构建带上下文的消息
    let classifyInput: string;
    if (context) {
      const truncatedContext =
        context.length > this.maxContextLength
          ? context.substring(0, this.maxContextLength) + '...'
          : context;
      classifyInput = `Context: ${truncatedContext}\n---\nMessage: ${truncatedMessage}`;
    } else {
      classifyInput = truncatedMessage;
    }

    return CLASSIFICATION_PROMPT.replace('{MESSAGE}', classifyInput);
  }

  /**
   * 调用分类器 LLM
   */
  private async callClassifier(prompt: string): Promise<string> {
    // 优先使用分类器配置中的 baseUrl 和 apiKey，否则使用默认的 openai 配置
    const baseUrl = this.classifierConfig.baseUrl || this.openaiConfig?.baseUrl;
    const apiKey = this.classifierConfig.apiKey || this.openaiConfig?.apiKey;
    const timeout = this.classifierConfig.timeout || 30000;

    if (!baseUrl || !apiKey) {
      throw new Error('OpenAI config not available for complexity classifier');
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${baseUrl}/chat/completions`,
          {
            model: this.classifierConfig.model,
            messages: [
              {
                role: 'user',
                content: prompt,
              },
            ],
            max_tokens: 50,
            temperature: 0,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            timeout,
          },
        ),
      );

      const content = response.data?.choices?.[0]?.message?.content || '';
      return content;
    } catch (error) {
      const axiosError = error as AxiosError;
      this.logger.error('[ComplexityClassifier] API call failed', {
        status: axiosError.response?.status,
        message: axiosError.message,
      });
      throw error;
    }
  }

  /**
   * 从 LLM 响应中提取复杂度等级
   */
  private extractComplexity(response: string): ComplexityLevel {
    const text = response.trim().toLowerCase();

    // 移除 thinking 标签（如果有）
    const cleanedText = text
      .replace(/<think>.*?<\/think>/gs, '')
      .replace(/<\/?think>/g, '')
      .trim();

    // 精确匹配
    if (COMPLEXITY_LEVELS.includes(cleanedText as ComplexityLevel)) {
      return cleanedText as ComplexityLevel;
    }

    // 单词边界匹配（先检查 super_ 变体以避免部分匹配）
    const orderedLevels: ComplexityLevel[] = [
      'super_hard',
      'super_easy',
      'hard',
      'medium',
      'easy',
    ];

    for (const level of orderedLevels) {
      const regex = new RegExp(`\\b${level}\\b`);
      if (regex.test(cleanedText)) {
        return level;
      }
    }

    // 默认返回 medium
    return 'medium';
  }

  /**
   * 判断是否为短消息（可能需要继承上下文复杂度）
   */
  private isShortMessage(message: string): boolean {
    const words = message.trim().split(/\s+/);
    return words.length <= 5;
  }

  /**
   * 比较两个复杂度等级
   * @returns 负数表示 a < b，0 表示相等，正数表示 a > b
   */
  compareComplexity(a: ComplexityLevel, b: ComplexityLevel): number {
    return COMPLEXITY_LEVELS.indexOf(a) - COMPLEXITY_LEVELS.indexOf(b);
  }

  /**
   * 获取更高的复杂度等级
   */
  getHigherComplexity(a: ComplexityLevel, b: ComplexityLevel): ComplexityLevel {
    return this.compareComplexity(a, b) >= 0 ? a : b;
  }

  /**
   * 确保复杂度不低于指定的最低等级
   */
  ensureMinComplexity(
    level: ComplexityLevel,
    minLevel: ComplexityLevel,
  ): ComplexityLevel {
    return this.getHigherComplexity(level, minLevel);
  }
}
