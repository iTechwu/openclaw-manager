import { Controller, Req, VERSION_NEUTRAL } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { personaTemplateContract as ptc } from '@repo/contracts/api';
import { success, created } from '@/common/ts-rest/response.helper';
import { PersonaTemplateApiService } from './persona-template-api.service';
import { AuthenticatedRequest, Auth } from '@app/auth';

/**
 * Persona Template API 控制器
 *
 * 提供人格模板管理相关的 API 端点，包括：
 * - 模板列表（系统 + 用户）
 * - 模板 CRUD 操作
 * - 模板复制
 */
@Controller({
  version: VERSION_NEUTRAL,
})
@Auth()
export class PersonaTemplateApiController {
  constructor(
    private readonly personaTemplateApiService: PersonaTemplateApiService,
  ) {}

  @TsRestHandler(ptc.list)
  async listTemplates(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(ptc.list, async ({ query }) => {
      const userId = req.userId;
      const result = await this.personaTemplateApiService.listTemplates(
        userId,
        query.locale,
      );
      return success(result);
    });
  }

  @TsRestHandler(ptc.getById)
  async getTemplateById(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(ptc.getById, async ({ params }) => {
      const userId = req.userId;
      const template = await this.personaTemplateApiService.getTemplateById(
        params.id,
        userId,
      );
      return success(template);
    });
  }

  @TsRestHandler(ptc.create)
  async createTemplate(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(ptc.create, async ({ body }) => {
      const userId = req.userId;
      const template = await this.personaTemplateApiService.createTemplate(
        body,
        userId,
      );
      return created(template);
    });
  }

  @TsRestHandler(ptc.update)
  async updateTemplate(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(ptc.update, async ({ params, body }) => {
      const userId = req.userId;
      const template = await this.personaTemplateApiService.updateTemplate(
        params.id,
        body,
        userId,
      );
      return success(template);
    });
  }

  @TsRestHandler(ptc.delete)
  async deleteTemplate(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(ptc.delete, async ({ params }) => {
      const userId = req.userId;
      await this.personaTemplateApiService.deleteTemplate(params.id, userId);
      return success({ success: true });
    });
  }

  @TsRestHandler(ptc.duplicate)
  async duplicateTemplate(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(ptc.duplicate, async ({ body }) => {
      const userId = req.userId;
      const template = await this.personaTemplateApiService.duplicateTemplate(
        body,
        userId,
      );
      return created(template);
    });
  }
}
