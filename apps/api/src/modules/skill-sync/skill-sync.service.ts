/**
 * OpenClaw Skill Sync Service
 *
 * 职责：
 * - 从 OpenClaw GitHub 仓库同步技能到数据库
 * - 支持增量同步和全量同步
 * - 提供同步状态查询
 * - 定时自动同步（每天凌晨 3 点）
 * - 调用 LLM 翻译技能名称和描述为中文
 * - 管理技能类型（SkillType）
 */
import { Injectable, Inject } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { Cron } from '@nestjs/schedule';
import { SkillService, SkillTypeService } from '@app/db';
import {
  OpenClawSkillSyncClient,
  ParsedSkill,
  SyncResult,
  SkillTranslationService,
} from '@app/clients/internal/openclaw';
import type { SkillType, Prisma } from '@prisma/client';
import type {
  PaginatedResponse,
  SkillSyncListQuery,
  SkillItem,
  SkillSyncListResponse,
} from '@repo/contracts';

const OPENCLAW_SOURCE = 'openclaw';

@Injectable()
export class SkillSyncService {
  // 缓存 SkillType slug -> id 映射
  private skillTypeCache: Map<string, string> = new Map();

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly skillService: SkillService,
    private readonly skillTypeService: SkillTypeService,
    private readonly syncClient: OpenClawSkillSyncClient,
    private readonly translationService: SkillTranslationService,
  ) {}

  /**
   * 执行全量同步（包含翻译）
   * 从 GitHub 获取所有技能并同步到数据库
   * @param enableTranslation 是否启用翻译（默认 true）
   */
  async syncAll(enableTranslation = true): Promise<SyncResult> {
    this.logger.info('SkillSyncService: 开始全量同步 OpenClaw 技能', {
      enableTranslation,
    });

    const startTime = Date.now();
    const result: SyncResult = {
      total: 0,
      added: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      syncedAt: new Date(),
    };

    try {
      // 0. 清理数据库中的重复项
      const removedDuplicates =
        await this.skillService.removeDuplicates(OPENCLAW_SOURCE);
      if (removedDuplicates > 0) {
        this.logger.info('SkillSyncService: 已清理重复技能', {
          removed: removedDuplicates,
        });
      }

      // 1. 同步所有 SkillType
      await this.syncSkillTypes();

      // 2. 获取 README 内容
      const readme = await this.syncClient.fetchReadme();

      // 3. 解析技能列表
      const skills = this.syncClient.parseReadme(readme);
      result.total = skills.length;

      this.logger.info('SkillSyncService: 解析到技能数量', {
        total: skills.length,
      });

      // 4. 批量同步技能（带翻译）
      const batchSize = enableTranslation ? 10 : 50; // 翻译时使用较小批次
      for (let i = 0; i < skills.length; i += batchSize) {
        const batch = skills.slice(i, i + batchSize);

        // 4.1 批量翻译（如果启用）
        let translations: Array<{ nameZh: string; descriptionZh: string }> = [];
        if (enableTranslation) {
          try {
            translations = await this.translationService.translateSkillsBatch(
              batch.map((s) => ({
                name: s.name,
                description: s.description,
              })),
            );
          } catch (error) {
            this.logger.warn('SkillSyncService: 批量翻译失败，使用原文', {
              error: error instanceof Error ? error.message : 'Unknown error',
            });
            translations = batch.map((s) => ({
              nameZh: s.name,
              descriptionZh: s.description,
            }));
          }
        }

        // 4.2 同步到数据库
        const batchResults = await Promise.allSettled(
          batch.map((skill, idx) =>
            this.upsertSkill(
              skill,
              enableTranslation ? translations[idx] : undefined,
            ),
          ),
        );

        for (const batchResult of batchResults) {
          if (batchResult.status === 'fulfilled') {
            if (batchResult.value === 'added') {
              result.added++;
            } else if (batchResult.value === 'updated') {
              result.updated++;
            } else {
              result.skipped++;
            }
          } else {
            result.errors++;
            this.logger.warn('SkillSyncService: 同步技能失败', {
              error: batchResult.reason,
            });
          }
        }

        // 进度日志
        this.logger.info('SkillSyncService: 同步进度', {
          processed: Math.min(i + batchSize, skills.length),
          total: skills.length,
          added: result.added,
          updated: result.updated,
          errors: result.errors,
        });
      }

      const duration = Date.now() - startTime;
      this.logger.info('SkillSyncService: 全量同步完成', {
        ...result,
        durationMs: duration,
      });

      return result;
    } catch (error) {
      this.logger.error('SkillSyncService: 全量同步失败', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * 同步所有 SkillType 到数据库
   */
  async syncSkillTypes(): Promise<void> {
    this.logger.info('SkillSyncService: 开始同步 SkillType');

    const categories = this.syncClient.getCategories();
    this.skillTypeCache.clear();

    for (let i = 0; i < categories.length; i++) {
      const cat = categories[i];
      try {
        const skillType = await this.skillTypeService.upsertBySlug(cat.slug, {
          name: cat.name,
          nameZh: cat.nameZh,
          icon: cat.icon,
          sortOrder: i + 1,
        });
        this.skillTypeCache.set(cat.slug, skillType.id);
      } catch (error) {
        this.logger.warn('SkillSyncService: 同步 SkillType 失败', {
          slug: cat.slug,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    this.logger.info('SkillSyncService: SkillType 同步完成', {
      total: categories.length,
      cached: this.skillTypeCache.size,
    });
  }

  /**
   * 获取 SkillType ID（从缓存或数据库）
   */
  private async getSkillTypeId(slug: string): Promise<string | null> {
    // 先从缓存获取
    if (this.skillTypeCache.has(slug)) {
      return this.skillTypeCache.get(slug)!;
    }

    // 从数据库获取
    const skillType = await this.skillTypeService.getBySlug(slug);
    if (skillType) {
      this.skillTypeCache.set(slug, skillType.id);
      return skillType.id;
    }

    return null;
  }

  /**
   * 同步单个技能到数据库
   */
  private async upsertSkill(
    skill: ParsedSkill,
    translation?: { nameZh: string; descriptionZh: string },
  ): Promise<'added' | 'updated' | 'skipped'> {
    try {
      // 检查是否已存在
      const existing = await this.skillService.get({
        source: OPENCLAW_SOURCE,
        slug: skill.slug,
      });

      // 获取 SkillType ID
      const skillTypeId = await this.getSkillTypeId(skill.category);

      const data = {
        name: skill.name,
        nameZh: translation?.nameZh || null,
        description: skill.description,
        descriptionZh: translation?.descriptionZh || null,
        // 保留已有版本，不覆盖为默认值（版本在安装/更新时从 _meta.json 获取）
        version: existing?.version || '1.0.0',
        skillType: skillTypeId ? { connect: { id: skillTypeId } } : undefined,
        definition: {
          name: skill.name,
          nameZh: translation?.nameZh,
          description: skill.description,
          descriptionZh: translation?.descriptionZh,
          sourceUrl: skill.sourceUrl,
        },
        isSystem: true,
        isEnabled: true,
        source: OPENCLAW_SOURCE,
        sourceUrl: skill.sourceUrl,
        author: skill.author,
        lastSyncedAt: new Date(),
      };

      await this.skillService.upsertBySourceSlug(
        OPENCLAW_SOURCE,
        skill.slug,
        data,
      );

      return existing ? 'updated' : 'added';
    } catch (error) {
      this.logger.warn('SkillSyncService: upsert 技能失败', {
        slug: skill.slug,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * 仅翻译未翻译的技能
   * 用于补充翻译已同步但未翻译的技能
   */
  async translateUntranslated(): Promise<{
    total: number;
    translated: number;
    errors: number;
  }> {
    this.logger.info('SkillSyncService: 开始翻译未翻译的技能');

    const result = { total: 0, translated: 0, errors: 0 };

    try {
      // 获取所有未翻译的技能
      const { list: untranslatedSkills } = await this.skillService.list(
        {
          source: OPENCLAW_SOURCE,
          descriptionZh: null,
        },
        { limit: 1000 },
      );

      result.total = untranslatedSkills.length;

      if (untranslatedSkills.length === 0) {
        this.logger.info('SkillSyncService: 没有需要翻译的技能');
        return result;
      }

      // 批量翻译
      const batchSize = 10;
      for (let i = 0; i < untranslatedSkills.length; i += batchSize) {
        const batch = untranslatedSkills.slice(i, i + batchSize);

        try {
          const translations =
            await this.translationService.translateSkillsBatch(
              batch.map((s) => ({
                name: s.name,
                description: s.description || '',
              })),
            );

          // 更新数据库
          for (let j = 0; j < batch.length; j++) {
            try {
              await this.skillService.update(
                { id: batch[j].id },
                {
                  nameZh: translations[j].nameZh,
                  descriptionZh: translations[j].descriptionZh,
                },
              );
              result.translated++;
            } catch {
              result.errors++;
            }
          }
        } catch (error) {
          result.errors += batch.length;
          this.logger.warn('SkillSyncService: 批量翻译失败', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }

        this.logger.info('SkillSyncService: 翻译进度', {
          processed: Math.min(i + batchSize, untranslatedSkills.length),
          total: untranslatedSkills.length,
          translated: result.translated,
          errors: result.errors,
        });
      }

      return result;
    } catch (error) {
      this.logger.error('SkillSyncService: 翻译未翻译技能失败', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * 获取同步状态
   */
  async getSyncStatus(): Promise<{
    totalSkills: number;
    systemSkills: number;
    customSkills: number;
    translatedSkills: number;
    lastSyncedAt: Date | null;
    skillTypes: Array<SkillType & { _count: { skills: number } }>;
  }> {
    // 获取系统技能数量（isSystem: true）
    const { total: systemSkills } = await this.skillService.list(
      {
        source: OPENCLAW_SOURCE,
        isSystem: true,
      },
      { limit: 1 },
    );

    // 获取自定义技能数量（isSystem: false）
    const { total: customSkills } = await this.skillService.list(
      {
        source: OPENCLAW_SOURCE,
        isSystem: false,
      },
      { limit: 1 },
    );

    // 总数 = 系统技能 + 自定义技能
    const totalSkills = systemSkills + customSkills;

    // 获取已翻译的技能数量
    const { total: translatedSkills } = await this.skillService.list(
      {
        source: OPENCLAW_SOURCE,
        descriptionZh: { not: null },
      },
      { limit: 1 },
    );

    // 获取最后同步时间
    const latestSkill = await this.skillService.get(
      { source: OPENCLAW_SOURCE },
      { select: { lastSyncedAt: true } },
    );

    // 获取所有 SkillType 及其技能数量
    const skillTypes = await this.skillTypeService.listWithSkillCount();

    return {
      totalSkills,
      systemSkills,
      customSkills,
      translatedSkills,
      lastSyncedAt: latestSkill?.lastSyncedAt || null,
      skillTypes,
    };
  }

  /**
   * 获取所有技能类型
   */
  async getSkillTypes(): Promise<
    Array<SkillType & { _count: { skills: number } }>
  > {
    return this.skillTypeService.listWithSkillCount();
  }

  /**
   * 获取技能列表（分页）
   */
  async listSkills(
    query: SkillSyncListQuery,
  ): Promise<PaginatedResponse<SkillItem>> {
    const { page = 1, limit = 20, skillTypeId, isSystem, search } = query;

    const where: Prisma.SkillWhereInput = {
      source: OPENCLAW_SOURCE,
      isEnabled: true,
    };

    // 按技能类型筛选
    if (skillTypeId) {
      where.skillTypeId = skillTypeId;
    }

    // 按系统/自定义筛选
    if (isSystem !== undefined) {
      where.isSystem = isSystem === 'true';
    }

    // 搜索
    if (search) {
      where.AND = [
        {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { nameZh: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { descriptionZh: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const result = await this.skillService.list(
      where,
      { page: Number(page), limit: Number(limit) },
      {
        select: {
          id: true,
          name: true,
          nameZh: true,
          slug: true,
          description: true,
          descriptionZh: true,
          version: true,
          skillTypeId: true,
          skillType: true,
          definition: true,
          examples: true,
          isSystem: true,
          isEnabled: true,
          createdById: true,
          source: true,
          sourceUrl: true,
          author: true,
          lastSyncedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    );

    return {
      list: result.list.map((skill) => this.mapSkillToItem(skill)),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  /**
   * 映射技能到 SkillItem
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapSkillToItem(skill: any): SkillItem {
    return {
      id: skill.id,
      name: skill.name,
      nameZh: skill.nameZh,
      slug: skill.slug,
      description: skill.description,
      descriptionZh: skill.descriptionZh,
      version: skill.version,
      skillTypeId: skill.skillTypeId,
      skillType: skill.skillType || null,
      definition: skill.definition as Record<string, unknown>,
      examples: skill.examples as Array<{
        input: string;
        output: string;
        description?: string;
      }> | null,
      isSystem: skill.isSystem,
      isEnabled: skill.isEnabled,
      createdById: skill.createdById,
      source: skill.source,
      sourceUrl: skill.sourceUrl,
      author: skill.author,
      lastSyncedAt: skill.lastSyncedAt,
      createdAt: skill.createdAt,
      updatedAt: skill.updatedAt,
    };
  }

  /**
   * 定时同步任务
   * 每天凌晨 3 点自动同步 OpenClaw 技能
   */
  @Cron('0 3 * * *', {
    name: 'openclaw-skill-sync',
    timeZone: 'Asia/Shanghai',
  })
  async scheduledSync(): Promise<void> {
    this.logger.info('SkillSyncService: 开始定时同步任务');
    try {
      const result = await this.syncAll(true);
      this.logger.info('SkillSyncService: 定时同步任务完成', {
        total: result.total,
        added: result.added,
        updated: result.updated,
        errors: result.errors,
      });

      // 同步完成后，预同步文件目录（异步执行，不阻塞主流程）
      this.syncFilesForAllSkills().catch((error) => {
        this.logger.error('SkillSyncService: 预同步文件目录失败', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });
    } catch (error) {
      this.logger.error('SkillSyncService: 定时同步任务失败', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // ============================================================================
  // 文件目录预同步（用于加速安装）
  // ============================================================================

  /**
   * 批量预同步所有技能的文件目录
   * 从 GitHub 拉取完整目录并存储到数据库
   */
  async syncFilesForAllSkills(): Promise<{
    total: number;
    synced: number;
    skipped: number;
    errors: number;
  }> {
    this.logger.info('SkillSyncService: 开始预同步所有技能文件目录');

    const result = { total: 0, synced: 0, skipped: 0, errors: 0 };

    try {
      // 获取所有需要同步文件的技能（有 sourceUrl 但没有 files 或文件过期）
      const { list: skills } = await this.skillService.list(
        {
          source: OPENCLAW_SOURCE,
          sourceUrl: { not: null },
        },
        { limit: 1000 },
      );

      result.total = skills.length;

      // 批量同步，每次 5 个并发
      const concurrency = 5;
      for (let i = 0; i < skills.length; i += concurrency) {
        const batch = skills.slice(i, i + concurrency);

        const batchResults = await Promise.allSettled(
          batch.map((skill) => this.syncSkillFiles(skill.id, skill.sourceUrl!)),
        );

        for (const batchResult of batchResults) {
          if (batchResult.status === 'fulfilled') {
            if (batchResult.value === 'synced') {
              result.synced++;
            } else {
              result.skipped++;
            }
          } else {
            result.errors++;
          }
        }

        // 进度日志
        this.logger.info('SkillSyncService: 文件同步进度', {
          processed: Math.min(i + concurrency, skills.length),
          total: skills.length,
          synced: result.synced,
          skipped: result.skipped,
          errors: result.errors,
        });

        // 避免触发 GitHub API 限流
        if (i + concurrency < skills.length) {
          await this.delay(1000);
        }
      }

      this.logger.info('SkillSyncService: 文件目录预同步完成', result);
      return result;
    } catch (error) {
      this.logger.error('SkillSyncService: 批量文件同步失败', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * 同步单个技能的文件目录
   * @param skillId 技能 ID
   * @param sourceUrl GitHub 源 URL
   * @param force 是否强制同步（忽略缓存）
   */
  async syncSkillFiles(
    skillId: string,
    sourceUrl: string,
    force = false,
  ): Promise<'synced' | 'skipped'> {
    try {
      // 检查是否需要同步（文件过期时间：24 小时）
      const skill = await this.skillService.get({ id: skillId });
      if (!skill) {
        this.logger.warn('SkillSyncService: 技能不存在', { skillId });
        return 'skipped';
      }

      // 如果文件存在且未过期，跳过
      if (!force && skill.files && skill.filesSyncedAt) {
        const filesAge = Date.now() - skill.filesSyncedAt.getTime();
        const maxAge = 24 * 60 * 60 * 1000; // 24 小时
        if (filesAge < maxAge) {
          return 'skipped';
        }
      }

      // 从 GitHub 拉取完整目录
      const files = await this.syncClient.fetchSkillDirectory(sourceUrl);

      if (files.length === 0) {
        this.logger.warn('SkillSyncService: 技能目录为空', {
          skillId,
          sourceUrl,
        });
        return 'skipped';
      }

      // 检查是否有 init.sh 和 references
      const hasInitScript = files.some(
        (f) => f.relativePath === 'scripts/init.sh',
      );
      const hasReferences = files.some((f) =>
        f.relativePath.startsWith('references/'),
      );

      // 更新数据库
      await this.skillService.update({ id: skillId }, {
        files: files as unknown as Prisma.JsonArray,
        filesSyncedAt: new Date(),
        fileCount: files.length,
        hasInitScript,
        hasReferences,
      } as Prisma.SkillUpdateInput);

      this.logger.debug('SkillSyncService: 技能文件同步完成', {
        skillId,
        fileCount: files.length,
        hasInitScript,
        hasReferences,
      });

      return 'synced';
    } catch (error) {
      this.logger.warn('SkillSyncService: 同步技能文件失败', {
        skillId,
        sourceUrl,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
