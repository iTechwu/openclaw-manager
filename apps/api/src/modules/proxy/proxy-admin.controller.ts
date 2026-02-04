import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { KeyringProxyService } from './services/keyring-proxy.service';
import { ProxyTokenService } from '@app/db';

/**
 * ProxyAdminController - Zero-Trust 模式管理 API
 *
 * 内部管理 API，用于：
 * - Bot 注册和 Token 生成
 * - Token 撤销
 * - 健康检查
 *
 * 注意：此 API 应仅在内部网络中访问，不对外暴露
 */
@Controller('proxy/admin')
export class ProxyAdminController {
  constructor(
    private readonly keyringProxyService: KeyringProxyService,
    private readonly proxyTokenService: ProxyTokenService,
  ) {}

  /**
   * 健康检查
   */
  @Get('health')
  async health() {
    return {
      status: 'healthy',
      mode: this.keyringProxyService.isZeroTrustEnabled()
        ? 'zero-trust'
        : 'direct',
    };
  }

  /**
   * 注册 Bot 并生成 Proxy Token
   */
  @Post('bots')
  @HttpCode(HttpStatus.CREATED)
  async registerBot(
    @Body()
    body: {
      botId: string;
      vendor: string;
      keyId: string;
      tags?: string[];
    },
  ) {
    const result = await this.keyringProxyService.registerBot(
      body.botId,
      body.vendor,
      body.keyId,
      body.tags,
    );
    return {
      success: true,
      token: result.token,
      expiresAt: result.expiresAt?.toISOString(),
    };
  }

  /**
   * 撤销 Bot 的 Proxy Token
   */
  @Delete('bots/:botId')
  @HttpCode(HttpStatus.OK)
  async revokeBot(@Param('botId') botId: string) {
    await this.keyringProxyService.revokeBot(botId);
    return { success: true };
  }

  /**
   * 获取 Bot 的 Token 状态
   */
  @Get('bots/:botId/status')
  async getBotStatus(@Param('botId') botId: string) {
    const token = await this.proxyTokenService.getByBotId(botId);
    if (!token) {
      return {
        registered: false,
      };
    }

    return {
      registered: true,
      vendor: token.vendor,
      expiresAt: token.expiresAt?.toISOString(),
      revokedAt: token.revokedAt?.toISOString(),
      lastUsedAt: token.lastUsedAt?.toISOString(),
      requestCount: token.requestCount,
      isActive: !token.revokedAt && (!token.expiresAt || token.expiresAt > new Date()),
    };
  }
}
