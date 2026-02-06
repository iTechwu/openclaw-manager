import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { PersonaTemplateService, FileSourceService } from '@app/db';
import { FileCdnClient } from '@app/clients/internal/file-cdn';
import type { PersonaTemplate, FileSource } from '@prisma/client';
import type {
  CreatePersonaTemplateInput,
  UpdatePersonaTemplateInput,
  DuplicatePersonaTemplateInput,
  PersonaTemplate as PersonaTemplateDto,
  PersonaTemplateListResponse,
} from '@repo/contracts';

type PersonaTemplateWithAvatarFile = PersonaTemplate & {
  avatarFile?: FileSource | null;
};

@Injectable()
export class PersonaTemplateApiService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly personaTemplateDb: PersonaTemplateService,
    private readonly fileSourceDb: FileSourceService,
    private readonly fileCdnClient: FileCdnClient,
  ) {}

  /**
   * 列出所有模板（系统模板 + 用户自己的模板）
   * @param userId 用户 ID
   * @param locale 可选的语言环境过滤（仅对系统模板生效）
   */
  async listTemplates(
    userId: string,
    locale?: string,
  ): Promise<PersonaTemplateListResponse> {
    // Build the where clause
    // For system templates, filter by locale if provided
    // For user templates, always show all (user templates don't have locale restriction)
    const whereClause = locale
      ? {
          OR: [{ isSystem: true, locale }, { createdById: userId }],
        }
      : {
          OR: [{ isSystem: true }, { createdById: userId }],
        };

    const { list } = await this.personaTemplateDb.list(
      whereClause,
      {
        orderBy: [{ isSystem: 'desc' }, { createdAt: 'desc' }],
        limit: 1000,
      },
      {
        include: { avatarFile: true },
      },
    );
    // console.log('tech: list', list);
    const systemCount = list.filter((t) => t.isSystem).length;
    const userCount = list.filter((t) => !t.isSystem).length;

    // Get avatar URLs for templates with avatarFile included
    const templatesWithUrls = await Promise.all(
      list.map((template: PersonaTemplateWithAvatarFile) =>
        this.toDto(template),
      ),
    );

    return {
      templates: templatesWithUrls,
      systemCount,
      userCount,
    };
  }

  /**
   * 获取单个模板
   */
  async getTemplateById(
    id: string,
    userId: string,
  ): Promise<PersonaTemplateDto> {
    const template = await this.personaTemplateDb.getById(id);
    if (!template) {
      throw new NotFoundException(`Template with id "${id}" not found`);
    }
    // 用户可以查看系统模板或自己的模板
    if (!template.isSystem && template.createdById !== userId) {
      throw new NotFoundException(`Template with id "${id}" not found`);
    }
    return this.toDto(template);
  }

  /**
   * 创建用户模板
   */
  async createTemplate(
    input: CreatePersonaTemplateInput,
    userId: string,
  ): Promise<PersonaTemplateDto> {
    const template = await this.personaTemplateDb.create({
      name: input.name,
      emoji: input.emoji || null,
      avatarFile: input.avatarFileId
        ? { connect: { id: input.avatarFileId } }
        : undefined,
      tagline: input.tagline,
      soulMarkdown: input.soulMarkdown,
      soulPreview: input.soulPreview || null,
      isSystem: false,
      createdBy: { connect: { id: userId } },
    });

    this.logger.info(`User template created: ${template.id} by user ${userId}`);
    return this.toDto(template);
  }

  /**
   * 更新用户模板
   */
  async updateTemplate(
    id: string,
    input: UpdatePersonaTemplateInput,
    userId: string,
  ): Promise<PersonaTemplateDto> {
    const template = await this.personaTemplateDb.getById(id);
    if (!template) {
      throw new NotFoundException(`Template with id "${id}" not found`);
    }
    if (template.isSystem) {
      throw new ForbiddenException('Cannot modify system templates');
    }
    if (template.createdById !== userId) {
      throw new ForbiddenException(
        'Cannot modify templates owned by other users',
      );
    }

    const updated = await this.personaTemplateDb.update(
      { id },
      {
        ...(input.name && { name: input.name }),
        ...(input.emoji !== undefined && { emoji: input.emoji || null }),
        ...(input.avatarFileId !== undefined && {
          avatarFile: input.avatarFileId
            ? { connect: { id: input.avatarFileId } }
            : { disconnect: true },
        }),
        ...(input.tagline && { tagline: input.tagline }),
        ...(input.soulMarkdown && { soulMarkdown: input.soulMarkdown }),
        ...(input.soulPreview !== undefined && {
          soulPreview: input.soulPreview || null,
        }),
      },
    );

    this.logger.info(`User template updated: ${id}`);
    return this.toDto(updated);
  }

  /**
   * 删除用户模板
   */
  async deleteTemplate(id: string, userId: string): Promise<void> {
    const template = await this.personaTemplateDb.getById(id);
    if (!template) {
      throw new NotFoundException(`Template with id "${id}" not found`);
    }
    if (template.isSystem) {
      throw new ForbiddenException('Cannot delete system templates');
    }
    if (template.createdById !== userId) {
      throw new ForbiddenException(
        'Cannot delete templates owned by other users',
      );
    }

    await this.personaTemplateDb.delete({ id });
    this.logger.info(`User template deleted: ${id}`);
  }

  /**
   * 复制模板（系统或用户）
   */
  async duplicateTemplate(
    input: DuplicatePersonaTemplateInput,
    userId: string,
  ): Promise<PersonaTemplateDto> {
    const source = await this.personaTemplateDb.getById(input.sourceTemplateId);
    if (!source) {
      throw new NotFoundException(
        `Source template with id "${input.sourceTemplateId}" not found`,
      );
    }
    // 用户可以复制系统模板或自己的模板
    if (!source.isSystem && source.createdById !== userId) {
      throw new NotFoundException(
        `Source template with id "${input.sourceTemplateId}" not found`,
      );
    }

    const newName = input.name || `${source.name} (Copy)`;
    const template = await this.personaTemplateDb.create({
      name: newName,
      emoji: source.emoji,
      avatarFile: source.avatarFileId
        ? { connect: { id: source.avatarFileId } }
        : undefined,
      tagline: source.tagline,
      soulMarkdown: source.soulMarkdown,
      soulPreview: source.soulPreview,
      isSystem: false,
      createdBy: { connect: { id: userId } },
    });

    this.logger.info(
      `Template duplicated: ${source.id} -> ${template.id} by user ${userId}`,
    );
    return this.toDto(template);
  }

  /**
   * 获取头像 CDN 链接（从已加载的 FileSource 数据）
   */
  private async getAvatarUrlFromFileSource(
    fileSource: FileSource | null | undefined,
  ): Promise<string | null> {
    if (!fileSource || !fileSource.isUploaded) {
      return null;
    }

    try {
      const url = await this.fileCdnClient.getImageVolcengineCdn(
        fileSource.vendor,
        fileSource.bucket,
        fileSource.key,
        '360:360:360:360',
      );
      return url;
    } catch (error) {
      this.logger.warn(`Failed to get avatar URL for fileId ${fileSource.id}`, {
        error,
      });
      return null;
    }
  }

  /**
   * 获取头像下载链接（通过 fileId 查询数据库）
   * 用于单个模板查询场景
   */
  private async getAvatarUrl(avatarFileId: string): Promise<string | null> {
    try {
      const fileSource = await this.fileSourceDb.getById(avatarFileId);
      return this.getAvatarUrlFromFileSource(fileSource);
    } catch (error) {
      this.logger.warn(`Failed to get avatar URL for fileId ${avatarFileId}`, {
        error,
      });
      return null;
    }
  }

  private async toDto(
    template: PersonaTemplateWithAvatarFile,
  ): Promise<PersonaTemplateDto> {
    let avatarUrl: string | null = null;

    // If emoji is null but avatarFileId exists, get the avatar URL
    if (!template.emoji && template.avatarFileId) {
      // Use included avatarFile if available, otherwise fall back to DB query
      if (template.avatarFile) {
        avatarUrl = await this.getAvatarUrlFromFileSource(template.avatarFile);
      } else {
        avatarUrl = await this.getAvatarUrl(template.avatarFileId);
      }
    }

    return {
      id: template.id,
      name: template.name,
      emoji: template.emoji,
      avatarFileId: template.avatarFileId,
      avatarUrl,
      tagline: template.tagline,
      soulMarkdown: template.soulMarkdown,
      soulPreview: template.soulPreview,
      locale: template.locale,
      isSystem: template.isSystem,
      createdById: template.createdById,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };
  }
}
