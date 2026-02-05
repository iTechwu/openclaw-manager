import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ServerResponse } from 'http';
import { BotService, BotUsageLogService } from '@app/db';
import { EncryptionService } from '../../bot-api/services/encryption.service';
import { KeyringService } from './keyring.service';
import { KeyringProxyService } from './keyring-proxy.service';
import { UpstreamService } from './upstream.service';
import { QuotaService } from './quota.service';
import {
  getVendorConfigWithCustomUrl,
  isVendorSupported,
} from '../config/vendor.config';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { PROVIDER_CONFIGS } from '@repo/contracts';

/**
 * 代理请求参数
 */
export interface ProxyRequestParams {
  vendor: string;
  path: string;
  method: string;
  headers: Record<string, string>;
  body: Buffer | null;
  botToken: string;
}

/**
 * 代理响应结果
 */
export interface ProxyResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

/**
 * ProxyService - 代理业务服务
 *
 * 负责代理请求的业务逻辑：
 * - Bot 认证（支持 Direct Mode 和 Zero-Trust Mode）
 * - 密钥选择
 * - 请求转发
 * - 使用日志记录
 */
@Injectable()
export class ProxyService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly configService: ConfigService,
    private readonly botService: BotService,
    private readonly botUsageLogService: BotUsageLogService,
    private readonly encryptionService: EncryptionService,
    private readonly keyringService: KeyringService,
    private readonly keyringProxyService: KeyringProxyService,
    private readonly upstreamService: UpstreamService,
    private readonly quotaService: QuotaService,
  ) {}

  /**
   * 处理代理请求（流式响应）
   * 支持两种模式：
   * - Zero-Trust Mode: 使用 ProxyToken 模型验证，API Key 由 Proxy 注入
   * - Direct Mode: 使用 Bot.proxyTokenHash 验证，动态选择 API Key
   */
  async handleProxyRequest(
    params: ProxyRequestParams,
    rawResponse: ServerResponse,
  ): Promise<ProxyResult> {
    const { vendor, path, method, headers, body, botToken } = params;

    // 检查是否启用 Zero-Trust Mode
    const isZeroTrust = this.keyringProxyService.isZeroTrustEnabled();

    let botId: string;
    let keyId: string;
    let apiKey: string;
    let baseUrl: string | null | undefined;

    if (isZeroTrust) {
      // Zero-Trust Mode: 使用 ProxyToken 验证
      const validation = await this.keyringProxyService.validateToken(botToken);
      if (!validation.valid) {
        return { success: false, error: 'Invalid or expired proxy token' };
      }

      // 验证 vendor 匹配
      if (validation.vendor !== vendor) {
        return {
          success: false,
          error: `Token not authorized for vendor: ${vendor}`,
        };
      }

      botId = validation.botId!;
      keyId = validation.keyId!;
      apiKey = validation.apiKey!;
      baseUrl = validation.baseUrl;
    } else {
      // Direct Mode: 使用 Bot.proxyTokenHash 验证
      const tokenHash = this.encryptionService.hashToken(botToken);
      const bot = await this.botService.get({ proxyTokenHash: tokenHash });

      if (!bot) {
        return { success: false, error: 'Invalid bot token' };
      }

      botId = bot.id;

      // 选择 API 密钥
      const keySelection = await this.keyringService.selectKeyForBot(
        vendor,
        bot.tags,
      );

      if (!keySelection) {
        return {
          success: false,
          error: `No API keys available for vendor: ${vendor}`,
        };
      }

      keyId = keySelection.keyId;
      apiKey = keySelection.secret;
      baseUrl = keySelection.baseUrl;
    }

    // 获取 vendor 配置
    const providerConfig =
      PROVIDER_CONFIGS[vendor as keyof typeof PROVIDER_CONFIGS];
    const apiType = providerConfig?.apiType;
    const vendorConfig = getVendorConfigWithCustomUrl(vendor, baseUrl, apiType);

    if (!vendorConfig) {
      if (!baseUrl) {
        return { success: false, error: `Unknown vendor: ${vendor}` };
      }
    }

    // 转发请求到上游
    try {
      const statusCode = await this.upstreamService.forwardToUpstream(
        {
          vendorConfig: vendorConfig!,
          path,
          method,
          headers,
          body,
          apiKey,
          customUrl: baseUrl || undefined,
        },
        rawResponse,
      );

      // 记录使用日志
      await this.logUsage(botId, vendor, keyId, statusCode);

      // 检查配额并发送通知（异步，不阻塞响应）
      this.quotaService.checkAndNotify(botId).catch((err) => {
        this.logger.error('Failed to check quota:', err);
      });

      return { success: true, statusCode };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Upstream error for bot ${botId}:`, error);

      // 记录失败日志
      await this.logUsage(botId, vendor, keyId, null);

      return { success: false, error: `Upstream error: ${errorMessage}` };
    }
  }

  /**
   * 记录使用日志
   */
  private async logUsage(
    botId: string,
    vendor: string,
    providerKeyId: string,
    statusCode: number | null,
  ): Promise<void> {
    try {
      await this.botUsageLogService.create({
        bot: { connect: { id: botId } },
        vendor,
        providerKey: { connect: { id: providerKeyId } },
        statusCode,
      });
    } catch (error) {
      this.logger.error('Failed to log usage:', error);
    }
  }

  /**
   * 生成新的代理 token 并更新 Bot
   */
  async generateProxyToken(botId: string): Promise<string> {
    const token = this.encryptionService.generateToken();
    const tokenHash = this.encryptionService.hashToken(token);

    await this.botService.update({ id: botId }, { proxyTokenHash: tokenHash });

    return token;
  }

  /**
   * 撤销 Bot 的代理 token
   */
  async revokeProxyToken(botId: string): Promise<void> {
    await this.botService.update({ id: botId }, { proxyTokenHash: null });
  }
}
