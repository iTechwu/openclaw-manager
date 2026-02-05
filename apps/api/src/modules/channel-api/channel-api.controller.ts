import { Controller, VERSION_NEUTRAL } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { channelContract as cc } from '@repo/contracts/api';
import { success } from '@/common/ts-rest/response.helper';
import { ChannelApiService } from './channel-api.service';
import { Auth } from '@app/auth';
import { ApiError } from '@google-cloud/storage';
import { CommonErrorCode } from '@repo/contracts';

/**
 * Channel API 控制器
 *
 * 提供渠道定义相关的 API 端点，包括：
 * - 渠道列表（包含凭证字段配置）
 * - 单个渠道详情
 */
@Controller({
  version: VERSION_NEUTRAL,
})
@Auth()
export class ChannelApiController {
  constructor(private readonly channelApiService: ChannelApiService) {}

  @TsRestHandler(cc.list)
  async listChannels(): Promise<any> {
    return tsRestHandler(cc.list, async ({ query }) => {
      const result = await this.channelApiService.listChannels(query.locale);
      return success(result);
    });
  }

  @TsRestHandler(cc.getById)
  async getChannelById(): Promise<any> {
    return tsRestHandler(cc.getById, async ({ params }) => {
      const channel = await this.channelApiService.getChannelById(params.id);
      if (!channel) {
        throw new ApiError(CommonErrorCode.NotFound);
      }
      return success(channel);
    });
  }
}
