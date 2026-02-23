import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import * as path from 'path';
import * as semver from 'semver';
import { SKILL_LIMITS } from '@repo/constants';
import { SkillService, BotSkillService, BotService } from '@app/db';
import {
  OpenClawSkillSyncClient,
  OpenClawClient,
} from '@app/clients/internal/openclaw';
import { DockerService } from '../bot-api/services/docker.service';
import { WorkspaceService } from '../bot-api/services/workspace.service';
import type { Prisma } from '@prisma/client';
import type {
  SkillListQuery,
  SkillItem,
  BotSkillItem,
  CreateSkillRequest,
  UpdateSkillRequest,
  InstallSkillRequest,
  UpdateBotSkillRequest,
  BatchInstallResult,
  ContainerSkillsResponse,
  UpdateBotSkillVersionResponse,
  CheckSkillUpdatesResponse,
} from '@repo/contracts';

const OPENCLAW_SOURCE = 'openclaw';

@Injectable()
export class SkillApiService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly skillService: SkillService,
    private readonly botSkillService: BotSkillService,
    private readonly botService: BotService,
    private readonly openClawSyncClient: OpenClawSkillSyncClient,
    private readonly openClawClient: OpenClawClient,
    private readonly dockerService: DockerService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  /**
   * 获取技能列表
   */
  async listSkills(
    userId: string,
    query: SkillListQuery,
  ): Promise<{
    list: SkillItem[];
    total: number;
    page: number;
    limit: number;
  }> {
    const {
      page = 1,
      limit = 20,
      sort,
      asc,
      skillTypeId,
      isSystem,
      search,
      source,
    } = query;

    const where: Prisma.SkillWhereInput = {
      isEnabled: true,
      OR: [{ isSystem: true }, { createdById: userId }],
    };

    if (skillTypeId) {
      where.skillTypeId = skillTypeId;
    }

    if (isSystem !== undefined) {
      delete where.OR;
      where.isSystem = isSystem;
      if (!isSystem) {
        where.createdById = userId;
      }
    }

    // 支持按来源筛选
    if (source) {
      where.source = source;
    }

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

    // 构建排序
    const orderBy: Record<string, string> = {};
    if (sort && ['name', 'createdAt'].includes(sort)) {
      orderBy[sort] = asc || 'desc';
    } else {
      orderBy.createdAt = 'desc';
    }

    const result = await this.skillService.list(
      where,
      { page, limit, orderBy },
      {
        select: {
          id: true,
          name: true,
          nameZh: true,
          slug: true,
          description: true,
          descriptionZh: true,
          version: true,
          latestVersion: true,
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
   * 获取技能详情
   */
  async getSkillById(userId: string, skillId: string): Promise<SkillItem> {
    const skill = await this.skillService.getById(skillId, {
      select: {
        id: true,
        name: true,
        nameZh: true,
        slug: true,
        description: true,
        descriptionZh: true,
        version: true,
        latestVersion: true,
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
    });
    if (!skill) {
      throw new NotFoundException('技能不存在');
    }

    if (!skill.isSystem && skill.createdById !== userId) {
      throw new ForbiddenException('无权访问此技能');
    }

    return this.mapSkillToItem(skill);
  }

  /**
   * 创建技能
   */
  async createSkill(
    userId: string,
    data: CreateSkillRequest,
  ): Promise<SkillItem> {
    const skill = await this.skillService.create({
      name: data.name,
      slug: data.slug,
      description: data.description,
      version: data.version || '1.0.0',
      skillType: data.skillTypeId
        ? { connect: { id: data.skillTypeId } }
        : undefined,
      definition: data.definition as Prisma.InputJsonValue,
      examples: data.examples as Prisma.InputJsonValue,
      isSystem: false,
      createdById: userId,
    });

    this.logger.info('Skill created', {
      skillId: skill.id,
      slug: skill.slug,
      userId,
    });
    return this.mapSkillToItem(skill);
  }

  /**
   * 更新技能
   */
  async updateSkill(
    userId: string,
    skillId: string,
    data: UpdateSkillRequest,
  ): Promise<SkillItem> {
    const existing = await this.skillService.getById(skillId);
    if (!existing) {
      throw new NotFoundException('技能不存在');
    }

    if (existing.isSystem) {
      throw new ForbiddenException('系统技能不可修改');
    }

    if (existing.createdById !== userId) {
      throw new ForbiddenException('无权修改此技能');
    }

    const skill = await this.skillService.update(
      { id: skillId },
      {
        ...(data.name && { name: data.name }),
        ...(data.slug && { slug: data.slug }),
        ...(data.description !== undefined && {
          description: data.description,
        }),
        ...(data.version && { version: data.version }),
        ...(data.skillTypeId && {
          skillType: { connect: { id: data.skillTypeId } },
        }),
        ...(data.definition !== undefined && {
          definition: data.definition as Prisma.InputJsonValue,
        }),
        ...(data.examples !== undefined && {
          examples: data.examples as Prisma.InputJsonValue,
        }),
      },
    );

    this.logger.info('Skill updated', { skillId: skill.id, userId });
    return this.mapSkillToItem(skill);
  }

  /**
   * 删除技能
   */
  async deleteSkill(
    userId: string,
    skillId: string,
  ): Promise<{ success: boolean }> {
    const existing = await this.skillService.getById(skillId);
    if (!existing) {
      throw new NotFoundException('技能不存在');
    }

    if (existing.isSystem) {
      throw new ForbiddenException('系统技能不可删除');
    }

    if (existing.createdById !== userId) {
      throw new ForbiddenException('无权删除此技能');
    }

    await this.skillService.update({ id: skillId }, { isDeleted: true });
    this.logger.info('Skill deleted', { skillId, userId });
    return { success: true };
  }

  /**
   * 获取 Bot 已安装的技能列表
   */
  async getBotSkills(
    userId: string,
    hostname: string,
  ): Promise<BotSkillItem[]> {
    const bot = await this.botService.get({ hostname, createdById: userId });
    if (!bot) {
      throw new NotFoundException('Bot 不存在');
    }

    const botSkills = await this.botSkillService.list(
      { botId: bot.id },
      { limit: 100 },
      {
        select: {
          id: true,
          botId: true,
          skillId: true,
          config: true,
          installedVersion: true,
          fileCount: true,
          scriptExecuted: true,
          hasReferences: true,
          isEnabled: true,
          createdAt: true,
          updatedAt: true,
          skill: {
            include: {
              skillType: true,
            },
          },
        },
      },
    );

    const items = botSkills.list.map((bs: any) => this.mapBotSkillToItem(bs));

    // 非阻塞：补写缺失的 SKILL.md（已安装但尚未写入文件系统的技能）
    this.syncInstalledSkillsMd(userId, hostname, botSkills.list).catch(
      (error) => {
        this.logger.warn('syncInstalledSkillsMd failed', {
          hostname,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      },
    );

    return items;
  }

  /**
   * 安装技能到 Bot
   * 如果是 OpenClaw 技能且 definition 为空，会自动从 GitHub 同步 SKILL.md 内容
   */
  async installSkill(
    userId: string,
    hostname: string,
    data: InstallSkillRequest,
  ): Promise<BotSkillItem> {
    const bot = await this.botService.get({ hostname, createdById: userId });
    if (!bot) {
      throw new NotFoundException('Bot 不存在');
    }

    const skill = await this.skillService.getById(data.skillId);
    if (!skill) {
      throw new NotFoundException('技能不存在');
    }

    // 检查技能访问权限
    if (!skill.isSystem && skill.createdById !== userId) {
      throw new ForbiddenException('无权安装此技能');
    }

    // 检查是否已安装（防止重复安装触发唯一约束错误）
    const existing = await this.botSkillService.get({
      botId: bot.id,
      skillId: data.skillId,
    });
    if (existing) {
      throw new ConflictException('该技能已安装');
    }

    // 如果是 OpenClaw 技能且 definition 内容为空，从 GitHub 同步 SKILL.md
    if (skill.source === OPENCLAW_SOURCE && skill.sourceUrl) {
      const definition = skill.definition as Record<string, unknown> | null;
      const hasContent = definition && definition.content;

      if (!hasContent) {
        this.logger.info('SkillApiService: 同步 SKILL.md 内容', {
          skillId: skill.id,
          sourceUrl: skill.sourceUrl,
        });

        try {
          const skillDefinition =
            await this.openClawSyncClient.fetchSkillDefinition(skill.sourceUrl);

          // 更新 skill 的 definition 字段
          await this.skillService.update(
            { id: skill.id },
            {
              definition: {
                name: skillDefinition.name,
                nameZh: (definition?.nameZh as string) || null,
                description: skillDefinition.description,
                descriptionZh: (definition?.descriptionZh as string) || null,
                version: skillDefinition.version,
                homepage: skillDefinition.homepage,
                repository: skillDefinition.repository,
                userInvocable: skillDefinition.userInvocable,
                tags: skillDefinition.tags,
                metadata: skillDefinition.metadata,
                content: skillDefinition.content,
                frontmatter: skillDefinition.frontmatter,
                sourceUrl: skill.sourceUrl,
              } as Prisma.InputJsonValue,
              // 同时更新 version 字段
              version: skillDefinition.version || skill.version,
            },
          );

          this.logger.info('SkillApiService: SKILL.md 同步成功', {
            skillId: skill.id,
            version: skillDefinition.version,
          });
        } catch (error) {
          // 同步失败不阻止安装，只记录警告
          this.logger.warn('SkillApiService: SKILL.md 同步失败，继续安装', {
            skillId: skill.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    // 重新获取 skill 以拿到可能更新后的 version 和 definition
    const updatedSkill = await this.skillService.getById(data.skillId);
    const botSkill = await this.botSkillService.create({
      bot: { connect: { id: bot.id } },
      skill: { connect: { id: data.skillId } },
      config: (data.config as Prisma.InputJsonValue) || {},
      isEnabled: true,
      installedVersion: updatedSkill?.version || skill.version,
    });

    this.logger.info('Skill installed', {
      botId: bot.id,
      skillId: data.skillId,
      hostname,
    });

    // 将技能文件写入 OpenClaw skills 目录，使容器能发现该技能
    if (updatedSkill) {
      const definition = updatedSkill.definition as Record<
        string,
        unknown
      > | null;
      const mdContent = (definition?.content as string) || null;
      const skillDirName = updatedSkill.slug || updatedSkill.name;

      try {
        if (updatedSkill.source === OPENCLAW_SOURCE && updatedSkill.sourceUrl) {
          const { scriptExists, fileCount, hasReferences, source } =
            await this.writeSkillToFilesystem(
              userId,
              hostname,
              skillDirName,
              {
                id: updatedSkill.id,
                sourceUrl: updatedSkill.sourceUrl,
                files: (
                  updatedSkill as unknown as { files: Prisma.JsonValue | null }
                ).files,
                filesSyncedAt: (
                  updatedSkill as unknown as { filesSyncedAt: Date | null }
                ).filesSyncedAt,
                name: updatedSkill.name,
                description: updatedSkill.description,
              },
              mdContent,
            );

          const scriptExecuted =
            scriptExists && bot.containerId
              ? !!(await this.executeSkillScript(bot.containerId, skillDirName))
              : false;

          await this.botSkillService.update(
            { id: botSkill.id },
            { fileCount, scriptExecuted, hasReferences },
          );

          this.logger.info('Skill files installed', {
            skillId: data.skillId,
            source,
            fileCount,
            scriptExists,
          });
        } else {
          const content =
            mdContent ||
            this.generateSkillMd(updatedSkill.name, updatedSkill.description);
          await this.workspaceService.writeInstalledSkillMd(
            userId,
            hostname,
            skillDirName,
            content,
          );
          await this.botSkillService.update(
            { id: botSkill.id },
            { fileCount: 1 },
          );
        }
      } catch (error) {
        this.logger.warn('Failed to write skill files', {
          skillId: data.skillId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const fullBotSkill = await this.botSkillService.getById(botSkill.id, {
      select: {
        id: true,
        botId: true,
        skillId: true,
        config: true,
        installedVersion: true,
        fileCount: true,
        scriptExecuted: true,
        hasReferences: true,
        isEnabled: true,
        createdAt: true,
        updatedAt: true,
        skill: {
          include: {
            skillType: true,
          },
        },
      },
    });

    return this.mapBotSkillToItem(fullBotSkill!);
  }

  /**
   * 批量安装技能到 Bot
   */
  async batchInstallSkills(
    userId: string,
    hostname: string,
    skillIds: string[],
  ): Promise<BatchInstallResult> {
    const bot = await this.botService.get({ hostname, createdById: userId });
    if (!bot) {
      throw new NotFoundException('Bot 不存在');
    }

    let installed = 0;
    let skipped = 0;
    let failed = 0;

    for (const skillId of skillIds) {
      try {
        const skill = await this.skillService.getById(skillId);
        if (!skill) {
          failed++;
          continue;
        }

        if (!skill.isSystem && skill.createdById !== userId) {
          failed++;
          continue;
        }

        const existing = await this.botSkillService.get({
          botId: bot.id,
          skillId,
        });
        if (existing) {
          skipped++;
          continue;
        }

        const newBotSkill = await this.botSkillService.create({
          bot: { connect: { id: bot.id } },
          skill: { connect: { id: skillId } },
          config: {},
          isEnabled: true,
          installedVersion: skill.version,
        });

        // 非阻塞写入文件系统
        const skillDirName = skill.slug || skill.name;
        const definition = skill.definition as Record<string, unknown> | null;
        const mdContent = (definition?.content as string) || null;

        if (skill.source === OPENCLAW_SOURCE && skill.sourceUrl) {
          this.writeSkillToFilesystem(
            userId,
            hostname,
            skillDirName,
            {
              id: skill.id,
              sourceUrl: skill.sourceUrl,
              files: (skill as unknown as { files: Prisma.JsonValue | null })
                .files,
              filesSyncedAt: (
                skill as unknown as { filesSyncedAt: Date | null }
              ).filesSyncedAt,
              name: skill.name,
              description: skill.description,
            },
            mdContent,
          )
            .then(({ fileCount, hasReferences }) =>
              this.botSkillService.update(
                { id: newBotSkill.id },
                { fileCount, hasReferences },
              ),
            )
            .catch((err) => {
              this.logger.warn('Batch install: failed to write skill files', {
                skillId,
                error: err instanceof Error ? err.message : 'Unknown error',
              });
            });
        } else {
          const content =
            mdContent || this.generateSkillMd(skill.name, skill.description);
          this.workspaceService
            .writeInstalledSkillMd(userId, hostname, skillDirName, content)
            .catch((err) => {
              this.logger.warn('Batch install: failed to write SKILL.md', {
                skillId,
                error: err instanceof Error ? err.message : 'Unknown error',
              });
            });
        }

        installed++;
      } catch {
        failed++;
      }
    }

    this.logger.info('Batch skill install completed', {
      hostname,
      installed,
      skipped,
      failed,
    });

    return { installed, skipped, failed };
  }

  // ============================================================================
  // 离线安装 / 私有 Skills
  // ============================================================================

  /**
   * 直接从文件安装 Skill（离线安装 / 私有 skills）
   * 不依赖 GitHub，用户直接上传 skill 文件
   * @param userId 用户 ID
   * @param hostname Bot hostname
   * @param data Skill 文件数据
   */
  async installSkillFromFiles(
    userId: string,
    hostname: string,
    data: {
      name: string;
      slug: string;
      description?: string;
      version?: string;
      files: Array<{ relativePath: string; content: string }>;
    },
  ): Promise<BotSkillItem> {
    const bot = await this.botService.get({ hostname, createdById: userId });
    if (!bot) {
      throw new NotFoundException('Bot 不存在');
    }

    // 验证文件
    const files = this.validateAndNormalizeFiles(data.files);
    if (files.length === 0) {
      throw new BadRequestException('没有有效的 skill 文件');
    }

    // 生成 slug（如果没有提供）
    const skillSlug = data.slug || this.generateSlug(data.name);

    // 检查是否已存在同名 skill（用户私有）
    let skill = await this.skillService.get({
      slug: skillSlug,
      createdById: userId,
    });

    // 检查是否有 SKILL.md
    const skillMd = files.find((f) => f.relativePath === 'SKILL.md');
    const hasInitScript = files.some(
      (f) => f.relativePath === 'scripts/init.sh',
    );
    const hasReferences = files.some((f) =>
      f.relativePath.startsWith('references/'),
    );

    // 创建或更新 Skill 记录
    if (!skill) {
      skill = await this.skillService.create({
        name: data.name,
        slug: skillSlug,
        description: data.description || null,
        version: data.version || '1.0.0',
        definition: {
          name: data.name,
          description: data.description,
          content: skillMd?.content || null,
        } as Prisma.InputJsonValue,
        isSystem: false,
        isEnabled: true,
        source: 'custom',
        createdById: userId,
        // 存储文件到数据库（用于后续安装）
        files: files as unknown as Prisma.InputJsonValue,
        filesSyncedAt: new Date(),
        fileCount: files.length,
        hasInitScript,
        hasReferences,
      });
    } else {
      // 更新现有 skill
      skill = await this.skillService.update(
        { id: skill.id },
        {
          name: data.name,
          description: data.description || null,
          version: data.version || skill.version,
          definition: {
            name: data.name,
            description: data.description,
            content: skillMd?.content || null,
          } as Prisma.InputJsonValue,
          files: files as unknown as Prisma.InputJsonValue,
          filesSyncedAt: new Date(),
          fileCount: files.length,
          hasInitScript,
          hasReferences,
        },
      );
    }

    // 检查是否已安装
    const existing = await this.botSkillService.get({
      botId: bot.id,
      skillId: skill.id,
    });
    if (existing) {
      throw new ConflictException('该技能已安装');
    }

    // 创建 BotSkill 记录
    const botSkill = await this.botSkillService.create({
      bot: { connect: { id: bot.id } },
      skill: { connect: { id: skill.id } },
      config: {},
      isEnabled: true,
      installedVersion: skill.version,
      fileCount: files.length,
      hasReferences,
    });

    this.logger.info('Skill installed from files', {
      botId: bot.id,
      skillId: skill.id,
      hostname,
      fileCount: files.length,
      hasInitScript,
    });

    // 写入文件系统
    const skillDirName = skillSlug;
    try {
      await this.workspaceService.writeSkillFiles(
        userId,
        hostname,
        skillDirName,
        files.map((f) => ({ ...f, size: f.content.length })),
      );

      // 执行初始化脚本（如果有）
      if (hasInitScript && bot.containerId) {
        await this.executeSkillScript(bot.containerId, skillDirName);
        await this.botSkillService.update(
          { id: botSkill.id },
          { scriptExecuted: true },
        );
      }

      // 触发热加载
      if (bot.containerId) {
        await this.openClawClient.reloadSkills(bot.containerId);
      }
    } catch (error) {
      this.logger.warn('Failed to write skill files', {
        skillId: skill.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    const fullBotSkill = await this.botSkillService.getById(botSkill.id, {
      select: {
        id: true,
        botId: true,
        skillId: true,
        config: true,
        installedVersion: true,
        fileCount: true,
        scriptExecuted: true,
        hasReferences: true,
        isEnabled: true,
        createdAt: true,
        updatedAt: true,
        skill: {
          include: {
            skillType: true,
          },
        },
      },
    });

    return this.mapBotSkillToItem(fullBotSkill!);
  }

  /**
   * 验证并规范化文件列表
   * - 路径遍历检查
   * - 文件大小限制
   * - 必要的文件检查
   */
  private validateAndNormalizeFiles(
    files: Array<{ relativePath: string; content: string }>,
  ): Array<{ relativePath: string; content: string }> {
    const validFiles: Array<{ relativePath: string; content: string }> = [];
    let totalSize = 0;

    for (const file of files) {
      // 路径遍历检查
      const normalized = path.normalize(file.relativePath);
      if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
        this.logger.warn('Skipping unsafe file path', {
          relativePath: file.relativePath,
        });
        continue;
      }

      // 排除敏感文件
      const lowerPath = normalized.toLowerCase();
      if (
        lowerPath.includes('.env') ||
        lowerPath.includes('credentials') ||
        lowerPath.includes('private_key') ||
        lowerPath.includes('_meta.json')
      ) {
        continue;
      }

      // 文件大小检查
      const fileSize = Buffer.byteLength(file.content, 'utf8');
      if (fileSize > 1024 * 1024) {
        // 1MB 单文件限制
        this.logger.warn('File too large, skipping', {
          relativePath: file.relativePath,
          size: fileSize,
        });
        continue;
      }

      totalSize += fileSize;
      if (totalSize > SKILL_LIMITS.MAX_DIR_SIZE) {
        this.logger.warn('Total size exceeds limit, stopping', {
          totalSize,
          limit: SKILL_LIMITS.MAX_DIR_SIZE,
        });
        break;
      }

      validFiles.push({
        relativePath: normalized,
        content: file.content,
      });
    }

    // 文件数量限制
    if (validFiles.length > SKILL_LIMITS.MAX_FILE_COUNT) {
      return validFiles.slice(0, SKILL_LIMITS.MAX_FILE_COUNT);
    }

    return validFiles;
  }

  /**
   * 生成 slug（从名称）
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);
  }

  async updateBotSkillConfig(
    userId: string,
    hostname: string,
    skillId: string,
    data: UpdateBotSkillRequest,
  ): Promise<BotSkillItem> {
    const bot = await this.botService.get({ hostname, createdById: userId });
    if (!bot) {
      throw new NotFoundException('Bot 不存在');
    }

    const botSkill = await this.botSkillService.get({
      botId: bot.id,
      skillId,
    });
    if (!botSkill) {
      throw new NotFoundException('技能未安装');
    }

    const updated = await this.botSkillService.update(
      { id: botSkill.id },
      {
        ...(data.config !== undefined && {
          config: data.config as Prisma.InputJsonValue,
        }),
        ...(data.isEnabled !== undefined && { isEnabled: data.isEnabled }),
      },
    );

    this.logger.info('Bot skill config updated', {
      botId: bot.id,
      skillId,
      hostname,
    });

    const fullBotSkill = await this.botSkillService.getById(updated.id, {
      select: {
        id: true,
        botId: true,
        skillId: true,
        config: true,
        installedVersion: true,
        fileCount: true,
        scriptExecuted: true,
        hasReferences: true,
        isEnabled: true,
        createdAt: true,
        updatedAt: true,
        skill: {
          include: {
            skillType: true,
          },
        },
      },
    });

    return this.mapBotSkillToItem(fullBotSkill!);
  }

  /**
   * 卸载 Bot 技能
   */
  async uninstallSkill(
    userId: string,
    hostname: string,
    skillId: string,
  ): Promise<{ success: boolean }> {
    const bot = await this.botService.get({ hostname, createdById: userId });
    if (!bot) {
      throw new NotFoundException('Bot 不存在');
    }

    const botSkill = await this.botSkillService.get({
      botId: bot.id,
      skillId,
    });
    if (!botSkill) {
      throw new NotFoundException('技能未安装');
    }

    await this.botSkillService.delete({ id: botSkill.id });
    this.logger.info('Skill uninstalled', {
      botId: bot.id,
      skillId,
      hostname,
    });

    // 清理 OpenClaw skills 目录中的 SKILL.md
    const skill = await this.skillService.getById(skillId);
    if (skill) {
      const skillDirName = skill.slug || skill.name;
      this.workspaceService
        .removeInstalledSkillMd(userId, hostname, skillDirName)
        .catch((error) => {
          this.logger.warn('Failed to remove SKILL.md from openclaw dir', {
            skillId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });
    }

    return { success: true };
  }

  /**
   * 更新已安装技能到最新版本
   * 1. 从 GitHub 重新拉取 SKILL.md
   * 2. 获取 _meta.json 最新版本
   * 3. 更新 Skill 表的 definition.content、version、latestVersion
   * 4. 更新 BotSkill 的 installedVersion
   * 5. 重写文件系统中的 SKILL.md
   */
  async updateSkillVersion(
    userId: string,
    hostname: string,
    skillId: string,
  ): Promise<UpdateBotSkillVersionResponse> {
    const bot = await this.botService.get({ hostname, createdById: userId });
    if (!bot) {
      throw new NotFoundException('Bot 不存在');
    }

    const botSkill = await this.botSkillService.get({
      botId: bot.id,
      skillId,
    });
    if (!botSkill) {
      throw new NotFoundException('技能未安装');
    }

    const skill = await this.skillService.getById(skillId);
    if (!skill) {
      throw new NotFoundException('技能不存在');
    }

    if (skill.source !== OPENCLAW_SOURCE || !skill.sourceUrl) {
      throw new NotFoundException('仅支持 OpenClaw 技能更新');
    }

    const previousVersion = (botSkill as any).installedVersion || skill.version;

    // 1. 从 GitHub 重新拉取 SKILL.md
    const skillDefinition = await this.openClawSyncClient.fetchSkillDefinition(
      skill.sourceUrl,
    );

    // 2. 获取 _meta.json 最新版本
    const meta = await this.openClawSyncClient.fetchSkillMeta(skill.sourceUrl);
    const newVersion =
      meta?.latest?.version || skillDefinition.version || skill.version;

    // 3. 更新 Skill 表
    const existingDef = (skill.definition as Record<string, unknown>) || {};
    await this.skillService.update(
      { id: skillId },
      {
        definition: {
          ...existingDef,
          name: skillDefinition.name,
          description: skillDefinition.description,
          version: skillDefinition.version,
          homepage: skillDefinition.homepage,
          repository: skillDefinition.repository,
          userInvocable: skillDefinition.userInvocable,
          tags: skillDefinition.tags,
          metadata: skillDefinition.metadata,
          content: skillDefinition.content,
          frontmatter: skillDefinition.frontmatter,
          sourceUrl: skill.sourceUrl,
        } as Prisma.InputJsonValue,
        version: newVersion,
        latestVersion: newVersion,
      },
    );

    // 4. 更新 BotSkill 的 installedVersion
    await this.botSkillService.update(
      { id: botSkill.id },
      { installedVersion: newVersion },
    );

    // 5. 重写文件系统中的技能文件（整目录）
    const skillDirName = skill.slug || skill.name;
    try {
      const { scriptExists, fileCount, hasReferences, source } =
        await this.writeSkillToFilesystem(
          userId,
          hostname,
          skillDirName,
          {
            id: skill.id,
            sourceUrl: skill.sourceUrl,
            files: (skill as unknown as { files: Prisma.JsonValue | null })
              .files,
            filesSyncedAt: (skill as unknown as { filesSyncedAt: Date | null })
              .filesSyncedAt,
            name: skill.name,
            description: skill.description,
          },
          skillDefinition.content,
        );

      const scriptExecuted =
        scriptExists && bot.containerId
          ? !!(await this.executeSkillScript(bot.containerId, skillDirName))
          : false;

      await this.botSkillService.update(
        { id: botSkill.id },
        { fileCount, scriptExecuted, hasReferences },
      );

      this.logger.info('Skill files updated', {
        skillId,
        source,
        fileCount,
      });
    } catch (error) {
      this.logger.warn('Failed to write updated skill files', {
        skillId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    this.logger.info('Skill version updated', {
      skillId,
      hostname,
      previousVersion,
      newVersion,
    });

    // 返回更新后的 BotSkill
    const fullBotSkill = await this.botSkillService.getById(botSkill.id, {
      select: {
        id: true,
        botId: true,
        skillId: true,
        config: true,
        installedVersion: true,
        fileCount: true,
        scriptExecuted: true,
        hasReferences: true,
        isEnabled: true,
        createdAt: true,
        updatedAt: true,
        skill: {
          include: {
            skillType: true,
          },
        },
      },
    });

    return {
      botSkill: this.mapBotSkillToItem(fullBotSkill!),
      previousVersion,
      newVersion,
    };
  }

  /**
   * 批量检查已安装技能的更新
   * 对所有 OpenClaw 来源的已安装技能，并发获取 _meta.json 检查版本
   */
  async checkSkillUpdates(
    userId: string,
    hostname: string,
  ): Promise<CheckSkillUpdatesResponse> {
    const bot = await this.botService.get({ hostname, createdById: userId });
    if (!bot) {
      throw new NotFoundException('Bot 不存在');
    }

    const botSkills = await this.botSkillService.list(
      { botId: bot.id },
      { limit: 100 },
      {
        select: {
          id: true,
          skillId: true,
          installedVersion: true,
          skill: {
            select: {
              id: true,
              name: true,
              slug: true,
              version: true,
              latestVersion: true,
              source: true,
              sourceUrl: true,
            },
          },
        },
      },
    );

    // 筛选 OpenClaw 技能
    const openclawSkills = botSkills.list.filter(
      (bs: any) => bs.skill?.source === OPENCLAW_SOURCE && bs.skill?.sourceUrl,
    );

    const CONCURRENCY = 5;
    const updates: CheckSkillUpdatesResponse['updates'] = [];

    for (let i = 0; i < openclawSkills.length; i += CONCURRENCY) {
      const batch = openclawSkills.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async (bs: any) => {
          const skill = bs.skill;
          const meta = await this.openClawSyncClient.fetchSkillMeta(
            skill.sourceUrl,
          );
          const latestVersion = meta?.latest?.version || skill.version;
          const currentVersion = bs.installedVersion || skill.version;

          // 更新 Skill 表的 latestVersion
          if (latestVersion !== skill.latestVersion) {
            await this.skillService.update({ id: skill.id }, { latestVersion });
          }

          let updateAvailable = false;
          if (currentVersion && latestVersion) {
            try {
              updateAvailable = semver.lt(currentVersion, latestVersion);
            } catch {
              // invalid semver
            }
          }

          return {
            skillId: skill.id,
            skillName: skill.name,
            currentVersion,
            latestVersion,
            updateAvailable,
          };
        }),
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          updates.push(result.value);
        }
      }
    }

    const updatesAvailable = updates.filter((u) => u.updateAvailable).length;

    this.logger.info('Skill updates checked', {
      hostname,
      checkedCount: updates.length,
      updatesAvailable,
    });

    return {
      updates,
      checkedCount: updates.length,
      updatesAvailable,
    };
  }

  /**
   * 获取容器内置技能列表
   * 策略：Docker 运行中 → exec 获取 → 持久化；否则读缓存
   */
  async getContainerSkills(
    userId: string,
    hostname: string,
  ): Promise<ContainerSkillsResponse> {
    const bot = await this.botService.get({ hostname, createdById: userId });
    if (!bot) {
      throw new NotFoundException('Bot 不存在');
    }

    // 尝试从运行中的容器获取
    if (bot.containerId) {
      const containerStatus = await this.dockerService.getContainerStatus(
        bot.containerId,
      );
      if (containerStatus?.running) {
        const skills = await this.openClawClient.listContainerSkills(
          bot.containerId,
        );
        if (skills) {
          // 非阻塞持久化到文件系统（仅缓存用途，不阻塞 API 响应）
          this.workspaceService
            .writeContainerSkills(userId, hostname, skills)
            .catch((error) => {
              this.logger.warn('容器技能持久化失败', {
                hostname,
                error: error instanceof Error ? error.message : 'Unknown error',
              });
            });
          // 列表接口不返回 content（MD 内容可能很大），减少传输体积
          return {
            skills: skills.map(({ content: _, ...rest }) => rest),
            source: 'docker',
            fetchedAt: new Date().toISOString(),
          };
        }
      }
    }

    // Fallback: 读取缓存（不加载 content，列表接口不需要）
    const cached = await this.workspaceService.readContainerSkills(
      userId,
      hostname,
    );
    if (cached) {
      return {
        skills: cached.skills,
        source: 'cache',
        fetchedAt: cached.fetchedAt,
      };
    }

    return {
      skills: [],
      source: 'none',
      fetchedAt: null,
    };
  }

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
      latestVersion: skill.latestVersion || null,
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
      // 外部来源字段
      source: skill.source,
      sourceUrl: skill.sourceUrl,
      author: skill.author,
      lastSyncedAt: skill.lastSyncedAt,
      createdAt: skill.createdAt,
      updatedAt: skill.updatedAt,
    };
  }

  /**
   * 将技能文件写入文件系统
   * 优先级：1. 数据库缓存 -> 2. GitHub 实时拉取 -> 3. 仅 SKILL.md
   */
  private async writeSkillToFilesystem(
    userId: string,
    hostname: string,
    skillDirName: string,
    skill: {
      id: string;
      sourceUrl: string | null;
      files: Prisma.JsonValue | null;
      filesSyncedAt: Date | null;
      name: string;
      description: string | null;
    },
    mdContent: string | null,
  ): Promise<{
    scriptExists: boolean;
    fileCount: number;
    hasReferences: boolean;
    source: 'cache' | 'github' | 'fallback';
  }> {
    // 1. 尝试使用数据库缓存的文件
    if (skill.files && Array.isArray(skill.files) && skill.files.length > 0) {
      try {
        const files = skill.files as Array<{
          relativePath: string;
          content: string;
          size: number;
        }>;

        const scriptExists = files.some(
          (f) => f.relativePath === 'scripts/init.sh',
        );
        const hasReferences = files.some((f) =>
          f.relativePath.startsWith('references/'),
        );

        await this.workspaceService.writeSkillFiles(
          userId,
          hostname,
          skillDirName,
          files,
        );

        this.logger.info('Skill installed from cache', {
          skillDirName,
          fileCount: files.length,
          scriptExists,
          hasReferences,
          filesSyncedAt: skill.filesSyncedAt,
        });

        return {
          scriptExists,
          fileCount: files.length,
          hasReferences,
          source: 'cache',
        };
      } catch (error) {
        this.logger.warn('Failed to install from cache, trying GitHub', {
          skillDirName,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // 2. 尝试从 GitHub 实时拉取
    if (skill.sourceUrl) {
      try {
        const files = await this.openClawSyncClient.fetchSkillDirectory(
          skill.sourceUrl,
        );

        const scriptExists = files.some(
          (f) => f.relativePath === 'scripts/init.sh',
        );
        const hasReferences = files.some((f) =>
          f.relativePath.startsWith('references/'),
        );

        await this.workspaceService.writeSkillFiles(
          userId,
          hostname,
          skillDirName,
          files,
        );

        this.logger.info('Skill installed from GitHub', {
          skillDirName,
          fileCount: files.length,
          scriptExists,
          hasReferences,
        });

        return {
          scriptExists,
          fileCount: files.length,
          hasReferences,
          source: 'github',
        };
      } catch (error) {
        this.logger.warn('GitHub fetch failed, falling back to SKILL.md only', {
          skillDirName,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // 3. Fallback: 仅写入 SKILL.md
    const content =
      mdContent || this.generateSkillMd(skill.name, skill.description);
    await this.workspaceService.writeInstalledSkillMd(
      userId,
      hostname,
      skillDirName,
      content,
    );

    this.logger.info('Skill installed with SKILL.md only (fallback)', {
      skillDirName,
    });

    return {
      scriptExists: false,
      fileCount: 1,
      hasReferences: false,
      source: 'fallback',
    };
  }

  /**
   * 执行技能的初始化脚本
   */
  private async executeSkillScript(
    containerId: string,
    skillDirName: string,
  ): Promise<string | null> {
    for (const scriptName of SKILL_LIMITS.ALLOWED_SCRIPT_NAMES) {
      try {
        const result = await this.openClawClient.execSkillScript(
          containerId,
          skillDirName,
          scriptName,
        );
        if (result) {
          this.logger.info('Skill script executed', {
            skillDirName,
            scriptName,
            success: result.success,
            outputPreview: result.stdout.substring(0, 200),
          });
          return result.stdout;
        }
      } catch (error) {
        this.logger.warn('Skill script execution failed', {
          skillDirName,
          scriptName,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
    return null;
  }

  /**
   * 从技能元数据生成基础 SKILL.md 内容
   */
  private generateSkillMd(name: string, description: string | null): string {
    const lines = [`# ${name}`];
    if (description) {
      lines.push('', description);
    }
    return lines.join('\n');
  }

  /**
   * 补写缺失的 SKILL.md（已安装但尚未写入文件系统的技能）
   * 如果 definition.content 为空且是 OpenClaw 技能，会尝试从 GitHub 拉取
   * 非阻塞调用，不影响列表接口响应速度
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async syncInstalledSkillsMd(
    userId: string,
    hostname: string,
    botSkills: any[],
  ): Promise<void> {
    for (const bs of botSkills) {
      const skill = bs.skill;
      if (!skill) continue;

      const skillDirName = skill.slug || skill.name;
      const exists = await this.workspaceService.hasInstalledSkillMd(
        userId,
        hostname,
        skillDirName,
      );
      if (exists) continue;

      const definition = skill.definition as Record<string, unknown> | null;
      let mdContent = (definition?.content as string) || null;

      // 如果 content 为空且是 OpenClaw 技能，尝试从 GitHub 拉取
      if (!mdContent && skill.source === OPENCLAW_SOURCE && skill.sourceUrl) {
        try {
          const skillDefinition =
            await this.openClawSyncClient.fetchSkillDefinition(skill.sourceUrl);
          mdContent = skillDefinition.content || null;

          // 更新 DB 中的 definition，后续不再重复拉取
          if (mdContent) {
            await this.skillService.update(
              { id: skill.id },
              {
                definition: {
                  ...((definition || {}) as Record<string, unknown>),
                  name: skillDefinition.name,
                  description: skillDefinition.description,
                  version: skillDefinition.version,
                  homepage: skillDefinition.homepage,
                  repository: skillDefinition.repository,
                  userInvocable: skillDefinition.userInvocable,
                  tags: skillDefinition.tags,
                  metadata: skillDefinition.metadata,
                  content: skillDefinition.content,
                  frontmatter: skillDefinition.frontmatter,
                  sourceUrl: skill.sourceUrl,
                } as Prisma.InputJsonValue,
                version: skillDefinition.version || skill.version,
              },
            );
            this.logger.info('Fetched SKILL.md from GitHub during sync', {
              skillId: skill.id,
              skillDirName,
            });
          }
        } catch (error) {
          this.logger.warn('Failed to fetch SKILL.md from GitHub during sync', {
            skillId: skill.id,
            sourceUrl: skill.sourceUrl,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      const content =
        mdContent || this.generateSkillMd(skill.name, skill.description);

      try {
        // OpenClaw 技能使用整目录安装
        if (skill.source === OPENCLAW_SOURCE && skill.sourceUrl) {
          await this.writeSkillToFilesystem(
            userId,
            hostname,
            skillDirName,
            {
              id: skill.id,
              sourceUrl: skill.sourceUrl,
              files: (skill as unknown as { files: Prisma.JsonValue | null })
                .files,
              filesSyncedAt: (
                skill as unknown as { filesSyncedAt: Date | null }
              ).filesSyncedAt,
              name: skill.name,
              description: skill.description,
            },
            mdContent,
          );
        } else {
          await this.workspaceService.writeInstalledSkillMd(
            userId,
            hostname,
            skillDirName,
            content,
          );
        }
        this.logger.info('Synced missing skill files', {
          skillId: skill.id,
          skillDirName,
          hasGitHubContent: !!mdContent,
        });
      } catch (error) {
        this.logger.warn('Failed to sync SKILL.md', {
          skillId: skill.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  // ============================================================================
  // 容器恢复机制
  // ============================================================================

  /**
   * 恢复 Bot 的所有已安装 Skills
   * 在容器启动后调用，确保所有已安装的 skills 都存在于文件系统中
   * @param botId Bot ID
   * @param containerId 容器 ID
   * @param userId 用户 ID
   * @param hostname Bot hostname
   */
  async reconcileBotSkills(
    botId: string,
    containerId: string,
    userId: string,
    hostname: string,
  ): Promise<{
    total: number;
    restored: number;
    skipped: number;
    errors: number;
  }> {
    this.logger.info('SkillApiService: 开始恢复 Bot Skills', {
      botId,
      containerId,
    });

    const result = { total: 0, restored: 0, skipped: 0, errors: 0 };

    try {
      // 获取所有已安装且启用的 skills
      const botSkills = await this.botSkillService.list(
        { botId, isEnabled: true },
        { limit: 1000 },
        {
          select: {
            id: true,
            skillId: true,
            skill: {
              select: {
                id: true,
                name: true,
                slug: true,
                description: true,
                source: true,
                sourceUrl: true,
                definition: true,
                version: true,
              },
            },
          },
        },
      );

      result.total = botSkills.list.length;

      if (result.total === 0) {
        this.logger.info('SkillApiService: 没有需要恢复的 Skills', { botId });
        return result;
      }

      // 检查并恢复每个 skill
      for (const botSkill of botSkills.list) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const skill = (botSkill as any).skill as {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          source: string | null;
          sourceUrl: string | null;
          definition: Prisma.JsonValue | null;
          version: string;
        } | null;
        if (!skill) continue;

        const skillDirName = skill.slug || skill.name;

        try {
          // 检查容器内是否存在
          const exists = await this.openClawClient.checkSkillExists(
            containerId,
            skillDirName,
          );

          if (!exists) {
            // 重新写入文件系统
            const definition = skill.definition as Record<
              string,
              unknown
            > | null;
            const mdContent = (definition?.content as string) || null;

            await this.writeSkillToFilesystem(
              userId,
              hostname,
              skillDirName,
              {
                id: skill.id,
                sourceUrl: skill.sourceUrl,
                files: (skill as unknown as { files: Prisma.JsonValue | null })
                  .files,
                filesSyncedAt: (
                  skill as unknown as { filesSyncedAt: Date | null }
                ).filesSyncedAt,
                name: skill.name,
                description: skill.description,
              },
              mdContent,
            );

            result.restored++;
            this.logger.info('SkillApiService: Skill 已恢复', {
              botId,
              skillId: skill.id,
              skillDirName,
            });
          } else {
            result.skipped++;
          }
        } catch (error) {
          result.errors++;
          this.logger.warn('SkillApiService: 恢复 Skill 失败', {
            botId,
            skillId: skill.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // 触发热加载
      await this.openClawClient.reloadSkills(containerId);

      this.logger.info('SkillApiService: Bot Skills 恢复完成', {
        botId,
        ...result,
      });

      return result;
    } catch (error) {
      this.logger.error('SkillApiService: Bot Skills 恢复失败', {
        botId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapBotSkillToItem(botSkill: any): BotSkillItem {
    const skillItem = this.mapSkillToItem(botSkill.skill);
    const installed = botSkill.installedVersion || null;
    const latest = skillItem.latestVersion || skillItem.version || null;

    let updateAvailable = false;
    if (installed && latest) {
      try {
        updateAvailable = semver.lt(installed, latest);
      } catch {
        // invalid semver, skip
      }
    }

    return {
      id: botSkill.id,
      botId: botSkill.botId,
      skillId: botSkill.skillId,
      config: botSkill.config as Record<string, unknown> | null,
      isEnabled: botSkill.isEnabled,
      installedVersion: installed,
      updateAvailable,
      fileCount: botSkill.fileCount ?? null,
      scriptExecuted: botSkill.scriptExecuted ?? false,
      hasReferences: botSkill.hasReferences ?? false,
      createdAt: botSkill.createdAt,
      updatedAt: botSkill.updatedAt,
      skill: skillItem,
    };
  }
}
