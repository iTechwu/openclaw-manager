/**
 * Skill Translation Service
 *
 * 职责：
 * - 使用 LLM 翻译技能名称和描述
 * - 支持批量翻译以提高效率
 * - 缓存翻译结果避免重复调用
 */
import { Injectable, Inject } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { OpenAIClient } from '@app/clients/internal/openai';

export interface TranslationResult {
  nameZh: string;
  descriptionZh: string;
}

export interface SkillToTranslate {
  name: string;
  description: string;
}

@Injectable()
export class SkillTranslationService {
  private readonly model = 'deepseek-v3';
  private readonly batchSize = 10;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly openaiClient: OpenAIClient,
  ) {}

  /**
   * 翻译单个技能的名称和描述
   */
  async translateSkill(skill: SkillToTranslate): Promise<TranslationResult> {
    try {
      const prompt = this.buildTranslationPrompt([skill]);
      const response = await this.openaiClient.chatCompletion({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `你是一个专业的技术翻译专家，专门翻译软件开发工具和AI技能的名称与描述。
翻译要求：
1. 保持技术术语的准确性
2. 翻译要简洁、专业
3. 对于专有名词（如 GitHub, Docker, API 等）保留英文
4. 返回 JSON 格式`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      });

      const content = response.choices[0]?.message?.content || '[]';
      const results = this.parseTranslationResponse(content);
      this.logger.info('SkillTranslationService: 翻译结果', {
        results: results[0],
      });
      return (
        results[0] || { nameZh: skill.name, descriptionZh: skill.description }
      );
    } catch (error) {
      this.logger.warn('SkillTranslationService: 翻译失败，使用原文', {
        name: skill.name,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return { nameZh: skill.name, descriptionZh: skill.description };
    }
  }

  /**
   * 批量翻译技能
   */
  async translateSkillsBatch(
    skills: SkillToTranslate[],
  ): Promise<TranslationResult[]> {
    const results: TranslationResult[] = [];

    for (let i = 0; i < skills.length; i += this.batchSize) {
      const batch = skills.slice(i, i + this.batchSize);

      try {
        const batchResults = await this.translateBatch(batch);
        results.push(...batchResults);

        this.logger.info('SkillTranslationService: 批量翻译进度', {
          processed: Math.min(i + this.batchSize, skills.length),
          total: skills.length,
        });

        // 添加延迟避免 API 限流
        if (i + this.batchSize < skills.length) {
          await this.delay(500);
        }
      } catch (error) {
        this.logger.warn('SkillTranslationService: 批量翻译失败，使用原文', {
          batchStart: i,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        // 失败时使用原文
        results.push(
          ...batch.map((s) => ({
            nameZh: s.name,
            descriptionZh: s.description,
          })),
        );
      }
    }

    return results;
  }

  /**
   * 翻译一批技能
   */
  private async translateBatch(
    skills: SkillToTranslate[],
  ): Promise<TranslationResult[]> {
    const prompt = this.buildTranslationPrompt(skills);

    const response = await this.openaiClient.chatCompletion({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: `你是一个专业的技术翻译专家，专门翻译软件开发工具和AI技能的名称与描述。
翻译要求：
1. 保持技术术语的准确性
2. 翻译要简洁、专业
3. 对于专有名词（如 GitHub, Docker, API 等）保留英文
4. 严格按照输入顺序返回 JSON 数组`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content || '[]';
    const results = this.parseTranslationResponse(content);

    // 确保返回数量与输入一致
    if (results.length !== skills.length) {
      this.logger.warn('SkillTranslationService: 翻译结果数量不匹配', {
        expected: skills.length,
        actual: results.length,
      });
      // 补充缺失的翻译
      while (results.length < skills.length) {
        const idx = results.length;
        results.push({
          nameZh: skills[idx].name,
          descriptionZh: skills[idx].description,
        });
      }
    }

    return results;
  }

  /**
   * 构建翻译提示词
   */
  private buildTranslationPrompt(skills: SkillToTranslate[]): string {
    const skillsJson = skills.map((s, idx) => ({
      index: idx,
      name: s.name,
      description: s.description,
    }));

    return `请将以下技能的名称和描述翻译成中文。

输入：
${JSON.stringify(skillsJson, null, 2)}

请返回 JSON 数组格式，每个元素包含 nameZh 和 descriptionZh 字段：
[
  { "nameZh": "中文名称", "descriptionZh": "中文描述" },
  ...
]

注意：
- 保持数组顺序与输入一致
- 技术术语保持准确
- 专有名词保留英文`;
  }

  /**
   * 解析翻译响应
   */
  private parseTranslationResponse(content: string): TranslationResult[] {
    try {
      // 尝试提取 JSON 数组
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => ({
            nameZh: item.nameZh || item.name_zh || '',
            descriptionZh: item.descriptionZh || item.description_zh || '',
          }));
        }
      }
      return [];
    } catch (error) {
      this.logger.warn('SkillTranslationService: 解析翻译响应失败', {
        content: content.substring(0, 200),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
