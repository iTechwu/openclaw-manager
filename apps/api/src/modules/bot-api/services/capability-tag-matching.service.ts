import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import {
  CapabilityTagService,
  ModelCatalogService,
  ModelCapabilityTagService,
} from '@app/db';
import type { CapabilityTag, ModelCatalog } from '@prisma/client';

/**
 * 能力标签匹配结果
 */
export interface TagMatchResult {
  tagId: string;
  capabilityTagId: string;
  matchSource: 'pattern' | 'feature' | 'scenario' | 'manual';
  confidence: number;
}

/**
 * CapabilityTagMatchingService
 *
 * 负责模型与能力标签的动态匹配
 *
 * 匹配策略：
 * 1. 模式匹配 (pattern): 根据 CapabilityTag.requiredModels 中的模式匹配模型名称
 * 2. 特性匹配 (feature): 根据 ModelCatalog 的特性标志匹配
 * 3. 场景匹配 (scenario): 根据 ModelCatalog.recommendedScenarios 匹配
 */
@Injectable()
export class CapabilityTagMatchingService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly capabilityTagService: CapabilityTagService,
    private readonly modelCatalogService: ModelCatalogService,
    private readonly modelCapabilityTagService: ModelCapabilityTagService,
  ) {}

  /**
   * 为模型匹配能力标签
   * @param modelName 模型名称
   * @param vendor 供应商
   * @returns 匹配的能力标签列表
   */
  async matchTagsForModel(
    modelName: string,
    vendor: string,
  ): Promise<TagMatchResult[]> {
    // 获取所有活跃的能力标签
    const { list: allTags } = await this.capabilityTagService.list(
      { isActive: true, isDeleted: false },
      { limit: 100 },
    );

    // 获取模型目录信息（包含特性标志和推荐场景）
    const pricing = await this.modelCatalogService.get({ model: modelName });

    const matches: TagMatchResult[] = [];
    const matchedTagIds = new Set<string>();

    for (const tag of allTags) {
      // 1. 模式匹配 - 最高优先级
      if (
        this.matchesPattern(modelName, tag.requiredModels as string[] | null)
      ) {
        if (!matchedTagIds.has(tag.id)) {
          matches.push({
            tagId: tag.tagId,
            capabilityTagId: tag.id,
            matchSource: 'pattern',
            confidence: 100,
          });
          matchedTagIds.add(tag.id);
        }
        continue;
      }

      // 2. 特性匹配 - 中等优先级
      if (pricing && this.matchesFeatures(pricing, tag)) {
        if (!matchedTagIds.has(tag.id)) {
          matches.push({
            tagId: tag.tagId,
            capabilityTagId: tag.id,
            matchSource: 'feature',
            confidence: 90,
          });
          matchedTagIds.add(tag.id);
        }
        continue;
      }

      // 3. 场景匹配 - 较低优先级
      if (
        pricing &&
        this.matchesScenarios(
          pricing.recommendedScenarios as string[] | null,
          tag.tagId,
        )
      ) {
        if (!matchedTagIds.has(tag.id)) {
          matches.push({
            tagId: tag.tagId,
            capabilityTagId: tag.id,
            matchSource: 'scenario',
            confidence: 80,
          });
          matchedTagIds.add(tag.id);
        }
      }
    }

    this.logger.debug(
      `[CapabilityTagMatching] Matched ${matches.length} tags for model ${modelName}`,
      { modelName, vendor, matches: matches.map((m) => m.tagId) },
    );

    return matches;
  }

  /**
   * 为 ModelCatalog 分配能力标签
   * @param modelCatalogId ModelCatalog ID
   * @param modelName 模型名称
   * @param vendor 供应商
   */
  async assignTagsToModelCatalog(
    modelCatalogId: string,
    modelName: string,
    vendor: string,
  ): Promise<number> {
    // 删除现有的自动分配标签（保留手动添加的）
    await this.deleteAutoAssignedTags(modelCatalogId);

    // 匹配新标签
    const matches = await this.matchTagsForModel(modelName, vendor);

    // 批量创建关联
    for (const match of matches) {
      try {
        await this.modelCapabilityTagService.create({
          modelCatalog: { connect: { id: modelCatalogId } },
          capabilityTag: { connect: { id: match.capabilityTagId } },
          matchSource: match.matchSource,
          confidence: match.confidence,
        });
      } catch (error) {
        // 忽略重复键错误
        if (
          error instanceof Error &&
          error.message.includes('Unique constraint')
        ) {
          continue;
        }
        throw error;
      }
    }

    this.logger.info(
      `[CapabilityTagMatching] Assigned ${matches.length} tags to model catalog ${modelCatalogId}`,
    );

    return matches.length;
  }

  /**
   * 手动为模型添加能力标签
   * @param modelCatalogId ModelCatalog ID
   * @param capabilityTagId CapabilityTag ID
   */
  async addManualTag(
    modelCatalogId: string,
    capabilityTagId: string,
  ): Promise<void> {
    await this.modelCapabilityTagService.create({
      modelCatalog: { connect: { id: modelCatalogId } },
      capabilityTag: { connect: { id: capabilityTagId } },
      matchSource: 'manual',
      confidence: 100,
    });
  }

  /**
   * 移除模型的能力标签
   * @param modelCatalogId ModelCatalog ID
   * @param capabilityTagId CapabilityTag ID
   */
  async removeTag(
    modelCatalogId: string,
    capabilityTagId: string,
  ): Promise<void> {
    const existing = await this.modelCapabilityTagService.get({
      modelCatalogId,
      capabilityTagId,
    });

    if (existing) {
      await this.modelCapabilityTagService.delete({ id: existing.id });
    }
  }

  /**
   * 删除自动分配的标签（保留手动添加的）
   */
  private async deleteAutoAssignedTags(modelCatalogId: string): Promise<void> {
    const { list: existingTags } = await this.modelCapabilityTagService.list(
      {
        modelCatalogId,
        matchSource: { not: 'manual' },
      },
      { limit: 100 },
    );

    for (const tag of existingTags) {
      await this.modelCapabilityTagService.delete({ id: tag.id });
    }
  }

  /**
   * 检查模型名称是否匹配 requiredModels 中的模式
   * 支持通配符: claude-sonnet-4-* 匹配 claude-sonnet-4-20250514
   */
  private matchesPattern(
    modelName: string,
    requiredModels: string[] | null,
  ): boolean {
    if (!requiredModels || requiredModels.length === 0) return false;

    return requiredModels.some((pattern) => {
      // 将通配符转换为正则表达式
      const regexPattern = pattern
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // 转义特殊字符
        .replace(/\\\*/g, '.*'); // 将 \* 转换为 .*
      const regex = new RegExp(`^${regexPattern}$`, 'i');
      return regex.test(modelName);
    });
  }

  /**
   * 检查模型特性是否匹配标签要求
   */
  private matchesFeatures(pricing: ModelCatalog, tag: CapabilityTag): boolean {
    // 检查是否有任何特性要求
    const hasRequirements =
      tag.requiresExtendedThinking ||
      tag.requiresCacheControl ||
      tag.requiresVision;

    if (!hasRequirements) return false;

    // 检查所有要求是否满足
    if (tag.requiresExtendedThinking && !pricing.supportsExtendedThinking)
      return false;
    if (tag.requiresCacheControl && !pricing.supportsCacheControl) return false;
    if (tag.requiresVision && !pricing.supportsVision) return false;

    return true;
  }

  /**
   * 检查推荐场景是否包含标签
   */
  private matchesScenarios(scenarios: string[] | null, tagId: string): boolean {
    if (!scenarios || scenarios.length === 0) return false;
    return scenarios.includes(tagId);
  }
}
