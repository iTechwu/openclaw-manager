/**
 * Bot Channel API Controller
 */
import { Controller, Req, VERSION_NEUTRAL } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { botChannelContract } from '@repo/contracts';
import { BotChannelApiService } from './bot-channel-api.service';
import { AuthenticatedRequest, Auth } from '@app/auth';
import { success, created } from '@/common/ts-rest/response.helper';

const c = botChannelContract;

@Controller({
  version: VERSION_NEUTRAL,
})
@Auth()
export class BotChannelApiController {
  constructor(private readonly botChannelApiService: BotChannelApiService) {}

  @TsRestHandler(c.list)
  async list(@Req() req: AuthenticatedRequest) {
    return tsRestHandler(c.list, async ({ params }) => {
      const result = await this.botChannelApiService.listChannels(
        req.userId,
        params.hostname,
      );
      return success(result);
    });
  }

  @TsRestHandler(c.getById)
  async getById(@Req() req: AuthenticatedRequest) {
    return tsRestHandler(c.getById, async ({ params }) => {
      const result = await this.botChannelApiService.getChannelById(
        req.userId,
        params.hostname,
        params.channelId,
      );
      return success(result);
    });
  }

  @TsRestHandler(c.create)
  async create(@Req() req: AuthenticatedRequest) {
    return tsRestHandler(c.create, async ({ params, body }) => {
      const result = await this.botChannelApiService.createChannel(
        req.userId,
        params.hostname,
        body,
      );
      return created(result);
    });
  }

  @TsRestHandler(c.update)
  async update(@Req() req: AuthenticatedRequest) {
    return tsRestHandler(c.update, async ({ params, body }) => {
      const result = await this.botChannelApiService.updateChannel(
        req.userId,
        params.hostname,
        params.channelId,
        body,
      );
      return success(result);
    });
  }

  @TsRestHandler(c.delete)
  async delete(@Req() req: AuthenticatedRequest) {
    return tsRestHandler(c.delete, async ({ params }) => {
      await this.botChannelApiService.deleteChannel(
        req.userId,
        params.hostname,
        params.channelId,
      );
      return success({ success: true });
    });
  }

  @TsRestHandler(c.connection)
  async connection(@Req() req: AuthenticatedRequest) {
    return tsRestHandler(c.connection, async ({ params, body }) => {
      let result;
      if (body.action === 'connect') {
        result = await this.botChannelApiService.connectChannel(
          req.userId,
          params.hostname,
          params.channelId,
        );
      } else {
        result = await this.botChannelApiService.disconnectChannel(
          req.userId,
          params.hostname,
          params.channelId,
        );
      }
      return success(result);
    });
  }

  @TsRestHandler(c.test)
  async test(@Req() req: AuthenticatedRequest) {
    return tsRestHandler(c.test, async ({ params, body }) => {
      const result = await this.botChannelApiService.testChannel(
        req.userId,
        params.hostname,
        params.channelId,
        body,
      );
      return success(result);
    });
  }

  @TsRestHandler(c.validateCredentials)
  async validateCredentials(@Req() req: AuthenticatedRequest) {
    return tsRestHandler(c.validateCredentials, async ({ params, body }) => {
      const result = await this.botChannelApiService.validateCredentials(
        req.userId,
        params.hostname,
        body,
      );
      return success(result);
    });
  }
}
