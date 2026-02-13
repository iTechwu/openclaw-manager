import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
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

    const items = botSkills.list.map((bs) => this.mapBotSkillToItem(bs));

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

    const botSkill = await this.botSkillService.create({
      bot: { connect: { id: bot.id } },
      skill: { connect: { id: data.skillId } },
      config: (data.config as Prisma.InputJsonValue) || {},
      isEnabled: true,
    });

    this.logger.info('Skill installed', {
      botId: bot.id,
      skillId: data.skillId,
      hostname,
    });

    // 将 SKILL.md 写入 OpenClaw skills 目录，使容器能发现该技能
    const updatedSkill = await this.skillService.getById(data.skillId);
    if (updatedSkill) {
      const definition = updatedSkill.definition as Record<string, unknown> | null;
      const mdContent = (definition?.content as string) || null;
      const skillDirName = updatedSkill.slug || updatedSkill.name;

      // 如果没有 SKILL.md 内容，从元数据生成基础版本
      const content =
        mdContent ||
        this.generateSkillMd(updatedSkill.name, updatedSkill.description);

      this.logger.info('Writing SKILL.md to openclaw dir', {
        skillId: data.skillId,
        skillDirName,
        hasOriginalContent: !!mdContent,
      });

      try {
        await this.workspaceService.writeInstalledSkillMd(
          userId,
          hostname,
          skillDirName,
          content,
        );
      } catch (error) {
        this.logger.warn('Failed to write SKILL.md to openclaw dir', {
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

        await this.botSkillService.create({
          bot: { connect: { id: bot.id } },
          skill: { connect: { id: skillId } },
          config: {},
          isEnabled: true,
        });
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
   * 从技能元数据生成基础 SKILL.md 内容
   */
  private generateSkillMd(
    name: string,
    description: string | null,
  ): string {
    const lines = [`# ${name}`];
    if (description) {
      lines.push('', description);
    }
    return lines.join('\n');
  }

  /**
   * 补写缺失的 SKILL.md（已安装但尚未写入文件系统的技能）
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
      const mdContent = (definition?.content as string) || null;
      const content =
        mdContent || this.generateSkillMd(skill.name, skill.description);

      try {
        await this.workspaceService.writeInstalledSkillMd(
          userId,
          hostname,
          skillDirName,
          content,
        );
        this.logger.info('Synced missing SKILL.md', {
          skillId: skill.id,
          skillDirName,
        });
      } catch (error) {
        this.logger.warn('Failed to sync SKILL.md', {
          skillId: skill.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapBotSkillToItem(botSkill: any): BotSkillItem {
    return {
      id: botSkill.id,
      botId: botSkill.botId,
      skillId: botSkill.skillId,
      config: botSkill.config as Record<string, unknown> | null,
      isEnabled: botSkill.isEnabled,
      createdAt: botSkill.createdAt,
      updatedAt: botSkill.updatedAt,
      skill: this.mapSkillToItem(botSkill.skill),
    };
  }
}
