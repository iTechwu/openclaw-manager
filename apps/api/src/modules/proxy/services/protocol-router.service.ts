import { Inject, Injectable } from '@nestjs/common';
import type { ServerResponse } from 'http';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { BotService, BotUsageLogService, ProviderKeyService } from '@app/db';
import { EncryptionService } from '../../bot-api/services/encryption.service';
import { KeyringProxyService } from './keyring-proxy.service';
import { UpstreamService } from './upstream.service';
import { QuotaService } from './quota.service';
import type { TokenUsage } from './token-extractor.service';
import { getVendorConfigWithCustomUrl } from '../config/vendor.config';
import {
  getAnthropicModelId,
  getModelLayer,
  shouldRecommendAnthropic,
  type ModelApiType,
} from '@repo/contracts';

/**
 * 协议路由请求参数
 */
export interface ProtocolRouteRequest {
  /** 协议类型 */
  protocol: 'openai-compatible' | 'anthropic';
  /** 请求路径 */
  path: string;
  /** HTTP 方法 */
  method: string;
  /** 请求头 */
  headers: Record<string, string>;
  /** 请求体 */
  body: Buffer | null;
  /** Bot Token */
  botToken: string;
  /** 原始 vendor（从 URL 解析） */
  vendor: string;
}

/**
 * 协议路由结果
 */
export interface ProtocolRouteResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

/**
 * Anthropic 响应 Token 使用量
 */
export interface AnthropicTokenUsage {
  inputTokens: number;
  outputTokens: number;
  thinkingTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  model?: string;
}

/**
 * ProtocolRouterService - 协议路由服务
 *
 * 负责根据协议类型路由请求到正确的上游服务：
 * - 第一层（生产层）：使用 OpenAI-compatible 协议
 * - 第二层（研究层）：使用 Anthropic 协议
 *
 * 支持的协议：
 * - openai-compatible: OpenAI Chat Completions API
 * - anthropic: Anthropic Messages API
 */
@Injectable()
export class ProtocolRouterService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly botService: BotService,
    private readonly botUsageLogService: BotUsageLogService,
    private readonly encryptionService: EncryptionService,
    private readonly keyringProxyService: KeyringProxyService,
    private readonly upstreamService: UpstreamService,
    private readonly quotaService: QuotaService,
    private readonly providerKeyService: ProviderKeyService,
  ) {}

  /**
   * 处理 Anthropic 协议请求
   *
   * 用于第二层（研究 Agent）模型的请求
   * 支持 Extended Thinking 和 Cache Control
   */
  async handleAnthropicRequest(
    params: ProtocolRouteRequest,
    rawResponse: ServerResponse,
  ): Promise<ProtocolRouteResult> {
    const { path, method, headers, body, botToken, vendor } = params;

    this.logger.info(
      `[ProtocolRouter] Anthropic request: ${method} ${vendor}${path}`,
    );

    // 1. 验证 Bot Token（Zero-Trust 模式）
    const isZeroTrust = this.keyringProxyService.isZeroTrustEnabled();
    let botId: string;

    if (isZeroTrust) {
      const validation =
        await this.keyringProxyService.validateToken(botToken);
      if (!validation.valid) {
        return { success: false, error: 'Invalid or expired proxy token' };
      }
      botId = validation.botId!;
    } else {
      const tokenHash = this.encryptionService.hashToken(botToken);
      const bot = await this.botService.get({ proxyTokenHash: tokenHash });
      if (!bot) {
        return { success: false, error: 'Invalid bot token' };
      }
      botId = bot.id;
    }

    // 2. 从请求体提取模型名称
    const modelInfo = this.extractModelFromBody(body);
    if (!modelInfo) {
      return { success: false, error: 'No model specified in request body' };
    }

    const { model, providerVendor } = modelInfo;

    this.logger.info(
      `[ProtocolRouter] Anthropic request: model=${model}, providerVendor=${providerVendor}, botId=${botId}`,
    );

    // 3. 获取模型的 Anthropic 协议标识符
    const anthropicModelId = getAnthropicModelId(providerVendor, model) ?? model;

    // 4. 获取 Provider Key
    const providerKey = await this.getProviderKeyForModel(
      botId,
      providerVendor,
      model,
    );
    if (!providerKey) {
      return {
        success: false,
        error: `No API key available for model: ${model} (vendor: ${providerVendor})`,
      };
    }

    const apiKey = this.encryptionService.decrypt(
      Buffer.isBuffer(providerKey.secretEncrypted)
        ? providerKey.secretEncrypted
        : Buffer.from(providerKey.secretEncrypted),
    );

    // 5. 构建 Anthropic 请求
    const anthropicBody = this.buildAnthropicRequestBody(body, anthropicModelId);
    const baseUrl = providerKey.baseUrl || this.getAnthropicBaseUrl(providerVendor);

    // 6. 获取 vendor 配置
    const vendorConfig = getVendorConfigWithCustomUrl(
      'anthropic',
      baseUrl,
      'anthropic',
    );

    if (!vendorConfig && !baseUrl) {
      return {
        success: false,
        error: `Unknown vendor for Anthropic protocol: ${providerVendor}`,
      };
    }

    const startTime = Date.now();

    // 7. 转发请求到上游
    try {
      const { statusCode, tokenUsage, responseTimeMs } =
        await this.upstreamService.forwardToUpstream(
          {
            vendorConfig: vendorConfig!,
            path: '/v1/messages', // Anthropic Messages API 端点
            method,
            headers: this.buildAnthropicHeaders(headers),
            body: anthropicBody,
            apiKey,
            customUrl: baseUrl || undefined,
            metadata: (providerKey.metadata as Record<string, unknown>) ?? null,
            vendor: 'anthropic',
          },
          rawResponse,
          'anthropic',
        );

      // 8. 记录使用日志
      await this.logAnthropicUsage(
        botId,
        providerKey.id,
        statusCode,
        path,
        tokenUsage,
        undefined,
        responseTimeMs,
      );

      // 9. 检查配额
      this.quotaService.checkAndNotify(botId).catch((err) => {
        this.logger.error('Failed to check quota:', err);
      });

      return { success: true, statusCode };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `[ProtocolRouter] Anthropic upstream error for bot ${botId}:`,
        error,
      );

      const durationMs = Date.now() - startTime;

      await this.logAnthropicUsage(
        botId,
        providerKey.id,
        null,
        path,
        null,
        errorMessage,
        durationMs,
      );

      return { success: false, error: `Upstream error: ${errorMessage}` };
    }
  }

  /**
   * 从请求体提取模型信息
   */
  private extractModelFromBody(
    body: Buffer | null,
  ): { model: string; providerVendor: string } | null {
    if (!body || body.length === 0) return null;

    try {
      const bodyJson = JSON.parse(body.toString('utf-8'));
      if (!bodyJson.model || typeof bodyJson.model !== 'string') {
        return null;
      }

      const modelRef = bodyJson.model;

      // 解析模型引用格式：provider/model 或 model
      const slashIndex = modelRef.indexOf('/');
      if (slashIndex >= 0) {
        return {
          providerVendor: modelRef.substring(0, slashIndex),
          model: modelRef.substring(slashIndex + 1),
        };
      }

      // 如果没有前缀，尝试从模型名称推断 provider
      const inferredVendor = this.inferVendorFromModel(modelRef);
      return { model: modelRef, providerVendor: inferredVendor };
    } catch {
      return null;
    }
  }

  /**
   * 从模型名称推断 Provider
   */
  private inferVendorFromModel(model: string): string {
    // Anthropic 模型
    if (model.startsWith('claude-')) return 'anthropic';
    // OpenAI 模型
    if (model.startsWith('gpt-') || model.startsWith('o1-') || model.startsWith('o3-')) return 'openai';
    // Google 模型
    if (model.startsWith('gemini-')) return 'google';
    // DeepSeek 模型
    if (model.startsWith('deepseek-')) return 'deepseek';
    // GLM 模型
    if (model.startsWith('glm-')) return 'zhipu';
    // Kimi 模型
    if (model.startsWith('kimi-') || model.startsWith('moonshot-')) return 'moonshot';
    // 默认
    return 'openai';
  }

  /**
   * 获取模型对应的 Provider Key
   */
  private async getProviderKeyForModel(
    botId: string,
    vendor: string,
    model: string,
  ): Promise<{
    id: string;
    secretEncrypted: Buffer;
    baseUrl: string | null;
    metadata: Record<string, unknown> | null;
  } | null> {
    // 查找该 vendor 的 Provider Keys
    const keys = await this.providerKeyService.findMany({
      where: { vendor },
    });

    if (keys.length === 0) {
      return null;
    }

    // 优先选择最近使用的 key（简化实现）
    // TODO: 实现更复杂的负载均衡策略
    const selectedKey = keys[0];

    return {
      id: selectedKey.id,
      secretEncrypted: Buffer.isBuffer(selectedKey.secretEncrypted)
        ? selectedKey.secretEncrypted
        : Buffer.from(selectedKey.secretEncrypted),
      baseUrl: selectedKey.baseUrl,
      metadata: (selectedKey.metadata as Record<string, unknown>) ?? null,
    };
  }

  /**
   * 获取 Anthropic API 的 Base URL
   */
  private getAnthropicBaseUrl(vendor: string): string | null {
    // 各 Provider 的 Anthropic 协议端点
    const anthropicEndpoints: Record<string, string> = {
      anthropic: 'https://api.anthropic.com',
      zhipu: 'https://open.bigmodel.cn/api/paas/v4',
      moonshot: 'https://api.moonshot.ai',
      silicon: 'https://api.siliconflow.cn',
    };

    return anthropicEndpoints[vendor] ?? null;
  }

  /**
   * 构建 Anthropic 请求体
   */
  private buildAnthropicRequestBody(
    originalBody: Buffer | null,
    anthropicModelId: string,
  ): Buffer | null {
    if (!originalBody || originalBody.length === 0) {
      return originalBody;
    }

    try {
      const bodyJson = JSON.parse(originalBody.toString('utf-8'));

      // 替换模型名称
      bodyJson.model = anthropicModelId;

      // 移除 OpenAI 特有的字段
      delete bodyJson.stream_options;

      // 确保必要的 Anthropic 字段
      if (!bodyJson.max_tokens && !bodyJson.max_tokens_to_sample) {
        bodyJson.max_tokens = 8192;
      }

      return Buffer.from(JSON.stringify(bodyJson), 'utf-8');
    } catch {
      return originalBody;
    }
  }

  /**
   * 构建 Anthropic 请求头
   */
  private buildAnthropicHeaders(
    originalHeaders: Record<string, string>,
  ): Record<string, string> {
    const anthropicHeaders: Record<string, string> = {};

    // 保留必要的头
    const keepHeaders = ['content-type', 'accept'];
    for (const key of keepHeaders) {
      if (originalHeaders[key]) {
        anthropicHeaders[key] = originalHeaders[key];
      }
    }

    // 添加 Anthropic 特有的头
    anthropicHeaders['anthropic-version'] = '2023-06-01';
    anthropicHeaders['content-type'] = 'application/json';

    return anthropicHeaders;
  }

  /**
   * 记录 Anthropic 使用日志
   */
  private async logAnthropicUsage(
    botId: string,
    providerKeyId: string,
    statusCode: number | null,
    endpoint?: string,
    tokenUsage?: TokenUsage | null,
    errorMessage?: string,
    durationMs?: number,
  ): Promise<void> {
    try {
      await this.botUsageLogService.create({
        bot: { connect: { id: botId } },
        vendor: 'anthropic',
        providerKey: { connect: { id: providerKeyId } },
        statusCode,
        endpoint: endpoint || null,
        model: tokenUsage?.model || null,
        requestTokens: tokenUsage?.requestTokens ?? null,
        responseTokens: tokenUsage?.responseTokens ?? null,
        errorMessage: errorMessage || null,
        durationMs: durationMs ?? null,
        protocolType: 'anthropic-native',
      });
    } catch (error) {
      this.logger.error('Failed to log Anthropic usage:', error);
    }
  }
}
