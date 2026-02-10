import { Controller, Req, VERSION_NEUTRAL } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { skillContract, botSkillContract } from '@repo/contracts';
import { success } from '@/common/ts-rest/response.helper';
import { AuthenticatedRequest, Auth, AdminAuth } from '@app/auth';
import { SkillApiService } from './skill-api.service';

const skillC = skillContract;
const botSkillC = botSkillContract;

@Controller({
  version: VERSION_NEUTRAL,
})
@Auth()
export class SkillApiController {
  constructor(private readonly skillApiService: SkillApiService) {}

  // ============================================================================
  // Skill APIs (技能管理)
  // ============================================================================

  @TsRestHandler(skillC.list)
  async listSkills(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(skillC.list, async ({ query }) => {
      const result = await this.skillApiService.listSkills(req.userId, query);
      return success(result);
    });
  }

  @TsRestHandler(skillC.getById)
  async getSkillById(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(skillC.getById, async ({ params }) => {
      const result = await this.skillApiService.getSkillById(
        req.userId,
        params.skillId,
      );
      return success(result);
    });
  }

  @TsRestHandler(skillC.create)
  @AdminAuth()
  async createSkill(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(skillC.create, async ({ body }) => {
      const result = await this.skillApiService.createSkill(req.userId, body);
      return success(result);
    });
  }

  @TsRestHandler(skillC.update)
  @AdminAuth()
  async updateSkill(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(skillC.update, async ({ params, body }) => {
      const result = await this.skillApiService.updateSkill(
        req.userId,
        params.skillId,
        body,
      );
      return success(result);
    });
  }

  @TsRestHandler(skillC.delete)
  @AdminAuth()
  async deleteSkill(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(skillC.delete, async ({ params }) => {
      const result = await this.skillApiService.deleteSkill(
        req.userId,
        params.skillId,
      );
      return success(result);
    });
  }

  // ============================================================================
  // Bot Skill APIs (Bot 技能管理)
  // ============================================================================

  @TsRestHandler(botSkillC.list)
  async listBotSkills(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(botSkillC.list, async ({ params }) => {
      const result = await this.skillApiService.getBotSkills(
        req.userId,
        params.hostname,
      );
      return success(result);
    });
  }

  @TsRestHandler(botSkillC.install)
  async installSkill(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(botSkillC.install, async ({ params, body }) => {
      const result = await this.skillApiService.installSkill(
        req.userId,
        params.hostname,
        body,
      );
      return success(result);
    });
  }

  @TsRestHandler(botSkillC.updateConfig)
  async updateBotSkillConfig(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(botSkillC.updateConfig, async ({ params, body }) => {
      const result = await this.skillApiService.updateBotSkillConfig(
        req.userId,
        params.hostname,
        params.skillId,
        body,
      );
      return success(result);
    });
  }

  @TsRestHandler(botSkillC.uninstall)
  async uninstallSkill(@Req() req: AuthenticatedRequest): Promise<any> {
    return tsRestHandler(botSkillC.uninstall, async ({ params }) => {
      const result = await this.skillApiService.uninstallSkill(
        req.userId,
        params.hostname,
        params.skillId,
      );
      return success(result);
    });
  }
}
