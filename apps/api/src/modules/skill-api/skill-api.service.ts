import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { SkillService, BotSkillService, BotService } from '@app/db';
import type { Prisma } from '@prisma/client';
import type {
  SkillListQuery,
  SkillItem,
  BotSkillItem,
  CreateSkillRequest,
  UpdateSkillRequest,
  InstallSkillRequest,
  UpdateBotSkillRequest,
} from '@repo/contracts';

@Injectable()
export class SkillApiService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly skillService: SkillService,
    private readonly botSkillService: BotSkillService,
    private readonly botService: BotService,
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
    const { page = 1, limit = 20, skillType, isSystem, search } = query;

    const where: Prisma.SkillWhereInput = {
      isEnabled: true,
      OR: [{ isSystem: true }, { createdById: userId }],
    };

    if (skillType) {
      where.skillType = skillType;
    }

    if (isSystem !== undefined) {
      delete where.OR;
      where.isSystem = isSystem;
      if (!isSystem) {
        where.createdById = userId;
      }
    }

    if (search) {
      where.AND = [
        {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const result = await this.skillService.list(where, { page, limit });

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
    const skill = await this.skillService.getById(skillId);
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
      skillType: data.skillType,
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
        ...(data.skillType && { skillType: data.skillType }),
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
          skill: true,
        },
      },
    );

    return botSkills.list.map((bs) => this.mapBotSkillToItem(bs));
  }

  /**
   * 安装技能到 Bot
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

    const fullBotSkill = await this.botSkillService.getById(botSkill.id, {
      select: {
        id: true,
        botId: true,
        skillId: true,
        config: true,
        isEnabled: true,
        createdAt: true,
        updatedAt: true,
        skill: true,
      },
    });

    return this.mapBotSkillToItem(fullBotSkill!);
  }

  /**
   * 更新 Bot 技能配置
   */
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
        skill: true,
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
    return { success: true };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapSkillToItem(skill: any): SkillItem {
    return {
      id: skill.id,
      name: skill.name,
      slug: skill.slug,
      description: skill.description,
      version: skill.version,
      skillType: skill.skillType,
      definition: skill.definition as Record<string, unknown>,
      examples: skill.examples as Array<{
        input: string;
        output: string;
        description?: string;
      }> | null,
      isSystem: skill.isSystem,
      isEnabled: skill.isEnabled,
      createdById: skill.createdById,
      createdAt: skill.createdAt,
      updatedAt: skill.updatedAt,
    };
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
