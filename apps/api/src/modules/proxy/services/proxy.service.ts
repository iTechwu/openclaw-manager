import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ServerResponse } from 'http';
import { BotService, BotUsageLogService } from '@app/db';
import { EncryptionService } from '../../bot-api/services/encryption.service';
import { KeyringService } from './keyring.service';
import { KeyringProxyService } from './keyring-proxy.service';
import { UpstreamService } from './upstream.service';
import { QuotaService } from './quota.service';
import type { TokenUsage } from './token-extractor.service';
import { getVendorConfigWithCustomUrl } from '../config/vendor.config';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { normalizeModelForProxy } from '@/utils/model-normalizer';

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
 *
 * Vendor 映射规则：
 * - URL vendor 格式: ${apiType}${isCustom ? '-compatible' : ''}
 * - 例如: openai-compatible → apiType=openai, isCustom=true
 * - 例如: openai → apiType=openai, isCustom=false
 * - ProxyToken 注册时使用 apiType 作为 vendor
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

    // Log incoming request from openclawClient (concise summary)
    this.logger.info(`[Proxy] Incoming request: ${method} ${vendor}${path}`);
    if (body && body.length > 0) {
      try {
        const bodyJson = JSON.parse(body.toString('utf-8'));
        // Log only key fields to avoid verbose output
        const summary = {
          model: bodyJson.model,
          stream: bodyJson.stream,
          messagesCount: Array.isArray(bodyJson.messages)
            ? bodyJson.messages.length
            : Array.isArray(bodyJson.input)
              ? bodyJson.input.length
              : 0,
          toolsCount: Array.isArray(bodyJson.tools) ? bodyJson.tools.length : 0,
          max_tokens:
            bodyJson.max_tokens ||
            bodyJson.max_output_tokens ||
            bodyJson.max_completion_tokens,
        };
        this.logger.info(`[Proxy] Request summary: ${JSON.stringify(summary)}`);
      } catch {
        this.logger.info(
          `[Proxy] Request body (raw, truncated): ${body.toString('utf-8').substring(0, 500)}`,
        );
      }
    }

    // 解析 URL vendor 获取 apiType 和是否为 custom provider
    // 规则: ${apiType}${isCustom ? '-compatible' : ''}
    // 例如: openai-compatible → apiType=openai, isCustom=true
    const { apiType: urlApiType, isCustom } = this.parseUrlVendor(vendor);

    // 检查是否启用 Zero-Trust Mode
    const isZeroTrust = this.keyringProxyService.isZeroTrustEnabled();

    let botId: string;
    let keyId: string;
    let apiKey: string;
    let baseUrl: string | null | undefined;
    let effectiveApiType: string;

    if (isZeroTrust) {
      // Zero-Trust Mode: 使用 ProxyToken 验证
      const validation = await this.keyringProxyService.validateToken(botToken);
      if (!validation.valid) {
        return { success: false, error: 'Invalid or expired proxy token' };
      }

      this.logger.info(
        `Token validation: vendor=${validation.vendor}, apiType=${validation.apiType}, urlVendor=${vendor}, urlApiType=${urlApiType}`,
      );

      // 验证 vendor 匹配
      // ProxyToken 注册时使用 apiType 作为 vendor（新行为）
      // 但旧的 token 可能使用 "custom" 作为 vendor（旧行为）
      // URL vendor 可能是 apiType 或 apiType-compatible
      // 所以我们需要兼容两种情况：
      // 1. 新 token: validation.vendor === urlApiType (e.g., "openai" === "openai")
      // 2. 旧 token: validation.vendor === "custom" && isCustom && validation.apiType === urlApiType
      const isVendorMatch =
        validation.vendor === urlApiType ||
        (validation.vendor === 'custom' &&
          isCustom &&
          validation.apiType === urlApiType);

      if (!isVendorMatch) {
        this.logger.warn(
          `Vendor mismatch: token vendor=${validation.vendor}, token apiType=${validation.apiType}, url apiType=${urlApiType}`,
        );
        return {
          success: false,
          error: `Token not authorized for vendor: ${vendor}`,
        };
      }

      botId = validation.botId!;
      keyId = validation.keyId!;
      apiKey = validation.apiKey!;
      baseUrl = validation.baseUrl;
      // 使用 token 中的 apiType，如果没有则使用 URL 解析的 apiType
      effectiveApiType = validation.apiType || urlApiType;
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
      effectiveApiType = urlApiType;
    }

    // 获取 vendor 配置
    // 使用 effectiveApiType 来获取正确的认证配置
    // 如果有 baseUrl，使用自定义 URL 配置
    const vendorConfig = getVendorConfigWithCustomUrl(
      effectiveApiType,
      baseUrl,
      effectiveApiType as any,
    );

    if (!vendorConfig) {
      if (!baseUrl) {
        return { success: false, error: `Unknown vendor: ${vendor}` };
      }
    }

    // Normalize model name in request body
    // OpenClaw sends model names with provider prefix (e.g., openai-compatible/gpt-4o)
    // We need to strip the prefix before forwarding to the upstream
    const normalizedBody = this.normalizeRequestBody(body, effectiveApiType);

    // 转发请求到上游
    try {
      const { statusCode, tokenUsage } =
        await this.upstreamService.forwardToUpstream(
          {
            vendorConfig: vendorConfig!,
            path,
            method,
            headers,
            body: normalizedBody,
            apiKey,
            customUrl: baseUrl || undefined,
          },
          rawResponse,
          effectiveApiType,
        );

      // 记录使用日志（包含 token 使用量）
      await this.logUsage(
        botId,
        effectiveApiType,
        keyId,
        statusCode,
        path,
        tokenUsage,
      );

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
      await this.logUsage(
        botId,
        effectiveApiType,
        keyId,
        null,
        path,
        null,
        errorMessage,
      );

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
    endpoint?: string,
    tokenUsage?: TokenUsage | null,
    errorMessage?: string,
  ): Promise<void> {
    try {
      await this.botUsageLogService.create({
        bot: { connect: { id: botId } },
        vendor,
        providerKey: { connect: { id: providerKeyId } },
        statusCode,
        endpoint: endpoint || null,
        model: tokenUsage?.model || null,
        requestTokens: tokenUsage?.requestTokens ?? null,
        responseTokens: tokenUsage?.responseTokens ?? null,
        errorMessage: errorMessage || null,
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

  /**
   * Normalize model name in request body
   *
   * OpenClaw and other clients may send model names with provider prefixes like:
   * - openai-compatible/gpt-4o
   * - openai/gpt-4o
   *
   * This method strips the provider prefix to get the raw model name
   * that can be sent to the upstream AI provider.
   *
   * @param body - The request body buffer
   * @param vendor - The target vendor for alias normalization
   * @returns The normalized request body buffer
   */
  private normalizeRequestBody(
    body: Buffer | null,
    vendor: string,
  ): Buffer | null {
    if (!body || body.length === 0) {
      return body;
    }

    try {
      const bodyStr = body.toString('utf-8');
      const bodyJson = JSON.parse(bodyStr);

      // Check if there's a model field
      if (bodyJson.model && typeof bodyJson.model === 'string') {
        const originalModel = bodyJson.model;
        const normalizedModel = normalizeModelForProxy(originalModel, vendor);

        if (normalizedModel !== originalModel) {
          this.logger.debug(
            `Normalized model name: ${originalModel} -> ${normalizedModel}`,
          );
          bodyJson.model = normalizedModel;
          return Buffer.from(JSON.stringify(bodyJson), 'utf-8');
        }
      }

      return body;
    } catch {
      // If parsing fails, return original body
      return body;
    }
  }

  /**
   * 解析 URL vendor 获取 apiType 和是否为 custom provider
   *
   * URL vendor 格式规则: ${apiType}${isCustom ? '-compatible' : ''}
   * 例如:
   * - openai-compatible → apiType=openai, isCustom=true
   * - anthropic-compatible → apiType=anthropic, isCustom=true
   * - openai → apiType=openai, isCustom=false
   * - anthropic → apiType=anthropic, isCustom=false
   *
   * @param vendor - URL 中的 vendor 参数
   * @returns { apiType: string, isCustom: boolean }
   */
  private parseUrlVendor(vendor: string): {
    apiType: string;
    isCustom: boolean;
  } {
    const compatibleSuffix = '-compatible';
    if (vendor.endsWith(compatibleSuffix)) {
      return {
        apiType: vendor.slice(0, -compatibleSuffix.length),
        isCustom: true,
      };
    }
    return {
      apiType: vendor,
      isCustom: false,
    };
  }
}
