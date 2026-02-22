/**
 * Feishu Pairing API Controller
 *
 * 管理飞书配对请求：
 * - 列出待批准的配对请求
 * - 批准/拒绝配对请求
 * - 管理配对策略配置
 */
import { Controller, Req, VERSION_NEUTRAL } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { feishuPairingContract } from '@repo/contracts';
import { FeishuPairingService } from './services/feishu-pairing.service';
import { AuthenticatedRequest, Auth } from '@app/auth';
import { success } from '@/common/ts-rest/response.helper';

const c = feishuPairingContract;

@Controller({
  version: VERSION_NEUTRAL,
})
@Auth()
export class FeishuPairingController {
  constructor(private readonly feishuPairingService: FeishuPairingService) {}

  @TsRestHandler(c.list)
  async list(@Req() req: AuthenticatedRequest) {
    return tsRestHandler(c.list, async ({ params, query }) => {
      const result = await this.feishuPairingService.getPairingRequests(
        req.userId,
        params.hostname,
        query.status,
      );
      return success(result);
    });
  }

  @TsRestHandler(c.approve)
  async approve(@Req() req: AuthenticatedRequest) {
    return tsRestHandler(c.approve, async ({ params, body }) => {
      const result = await this.feishuPairingService.approvePairingRequest(
        req.userId,
        params.hostname,
        body.code,
        body.feishuOpenId,
      );
      return success(result);
    });
  }

  @TsRestHandler(c.reject)
  async reject(@Req() req: AuthenticatedRequest) {
    return tsRestHandler(c.reject, async ({ params, body }) => {
      const result = await this.feishuPairingService.rejectPairingRequest(
        req.userId,
        params.hostname,
        body.code,
      );
      return success(result);
    });
  }

  @TsRestHandler(c.getConfig)
  async getConfig(@Req() req: AuthenticatedRequest) {
    return tsRestHandler(c.getConfig, async ({ params }) => {
      const result = await this.feishuPairingService.getPairingConfig(
        req.userId,
        params.hostname,
      );
      return success(result);
    });
  }

  @TsRestHandler(c.updateConfig)
  async updateConfig(@Req() req: AuthenticatedRequest) {
    return tsRestHandler(c.updateConfig, async ({ params, body }) => {
      const result = await this.feishuPairingService.updatePairingConfig(
        req.userId,
        params.hostname,
        body,
      );
      return success(result);
    });
  }

  @TsRestHandler(c.delete)
  async delete(@Req() req: AuthenticatedRequest) {
    return tsRestHandler(c.delete, async ({ params }) => {
      const result = await this.feishuPairingService.deletePairingRecord(
        req.userId,
        params.hostname,
        params.code,
      );
      return success(result);
    });
  }
}
