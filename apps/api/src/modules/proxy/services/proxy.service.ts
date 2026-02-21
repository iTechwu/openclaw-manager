import { Inject, Injectable, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ServerResponse } from 'http';
import { BotService, BotUsageLogService, ProviderKeyService } from '@app/db';
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
import { BotComplexityRoutingService } from './bot-complexity-routing.service';
import { ModelResolverService } from './model-resolver.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import {
  HealthScoreUpdateEvent,
  HEALTH_SCORE_EVENTS,
} from '../events/health-score.event';

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
    private readonly botService: BotService,
    private readonly botUsageLogService: BotUsageLogService,
    private readonly encryptionService: EncryptionService,
    private readonly keyringService: KeyringService,
    private readonly keyringProxyService: KeyringProxyService,
    private readonly upstreamService: UpstreamService,
    private readonly quotaService: QuotaService,
    private readonly modelResolverService: ModelResolverService,
    private readonly providerKeyService: ProviderKeyService,
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly eventEmitter: EventEmitter2,
    @Optional()
    private readonly botComplexityRouting?: BotComplexityRoutingService,
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

    // Auto-routing mode: 当使用 compatible 模式时，根据 model 自动路由到可用的 provider
    // 不需要前端指定具体的 vendor，proxy 自动发现并 fallback
    if (isCustom) {
      return this.handleAutoRoutedRequest(params, rawResponse, urlApiType);
    }

    // 检查是否启用 Zero-Trust Mode
    const isZeroTrust = this.keyringProxyService.isZeroTrustEnabled();

    let botId: string;
    let keyId: string;
    let apiKey: string;
    let baseUrl: string | null | undefined;
    let effectiveApiType: string;
    let metadata: Record<string, unknown> | null | undefined;

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
      metadata = validation.metadata;
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
      metadata = keySelection.metadata;
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
    let normalizedBody = this.normalizeRequestBody(
      body,
      effectiveApiType,
      isCustom,
    );

    // Apply complexity-based routing if enabled
    // This will analyze the request and potentially switch to a different model
    const complexityRoute = await this.applyComplexityRouting(
      botId,
      normalizedBody,
      keyId,
      apiKey,
      baseUrl,
      effectiveApiType,
    );

    if (complexityRoute) {
      // Update routing parameters based on complexity routing result
      keyId = complexityRoute.keyId;
      apiKey = complexityRoute.apiKey;
      baseUrl = complexityRoute.baseUrl;
      effectiveApiType = complexityRoute.effectiveApiType;
      normalizedBody = complexityRoute.body;

      this.logger.info(
        `[Proxy] Complexity routing applied: ${complexityRoute.reason}`,
      );
    }

    // Log the actual model being used after normalization
    if (normalizedBody && normalizedBody.length > 0) {
      try {
        const normalizedJson = JSON.parse(normalizedBody.toString('utf-8'));
        if (normalizedJson.model) {
          this.logger.info(
            `[Proxy] Actual model used: ${normalizedJson.model} (vendor: ${effectiveApiType}, baseUrl: ${baseUrl || 'default'})`,
          );
        }
      } catch {
        // Ignore parse errors
      }
    }

    // 记录请求开始时间（用于错误情况下的耗时记录）
    const startTime = Date.now();

    // 转发请求到上游
    try {
      const { statusCode, tokenUsage, responseTimeMs } =
        await this.upstreamService.forwardToUpstream(
          {
            vendorConfig: vendorConfig!,
            path,
            method,
            headers,
            body: normalizedBody,
            apiKey,
            customUrl: baseUrl || undefined,
            metadata,
            vendor,
          },
          rawResponse,
          effectiveApiType,
        );

      // 记录使用日志（包含 token 使用量和耗时）
      await this.logUsage(
        botId,
        effectiveApiType,
        keyId,
        statusCode,
        path,
        tokenUsage,
        undefined,
        responseTimeMs,
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

      // 计算请求耗时（即使失败也记录）
      const durationMs = Date.now() - startTime;

      // 记录失败日志
      await this.logUsage(
        botId,
        effectiveApiType,
        keyId,
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
   * Auto-routing: 根据 model 自动发现可用 provider 并逐个 fallback
   *
   * 当 URL vendor 为 xxx-compatible 时触发：
   * 1. 验证 token（仅做身份认证，不做 vendor 匹配）
   * 2. 从 request body 提取 model 名称
   * 3. 通过 ModelResolverService 查找所有可用 provider（按 priority/health 排序）
   * 4. 逐个尝试转发，连接失败时 fallback 到下一个 provider
   * 5. 更新 health score 反馈
   */
  private async handleAutoRoutedRequest(
    params: ProxyRequestParams,
    rawResponse: ServerResponse,
    urlApiType: string,
  ): Promise<ProxyResult> {
    const {
      path,
      method,
      headers,
      body: originalBody,
      botToken,
      vendor,
    } = params;
    let body = originalBody;

    // 1. 验证 token（仅做身份认证）
    const isZeroTrust = this.keyringProxyService.isZeroTrustEnabled();
    let botId: string;

    if (isZeroTrust) {
      const validation = await this.keyringProxyService.validateToken(botToken);
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

    // 2. 提取 model 名称
    let model = this.extractModelFromBody(body);
    if (!model) {
      return { success: false, error: 'No model specified in request body' };
    }

    this.logger.info(
      `[Proxy] Auto-routing: model=${model}, apiType=${urlApiType}, botId=${botId}`,
    );

    // 2.5 应用关键词路由：根据消息内容匹配路由规则，可能切换到不同模型
    try {
      const bodyJson = body ? JSON.parse(body.toString('utf-8')) : null;
      const userMessage = bodyJson?.messages
        ? this.extractUserMessage(bodyJson.messages)
        : null;
      if (userMessage) {
        const routeResult = await this.keyringProxyService.routeModel({
          botId,
          message: userMessage,
        });

        if (routeResult && routeResult.model !== model) {
          this.logger.info(
            `[Proxy] Keyword routing matched: "${routeResult.matchedRule || routeResult.reason}" → model=${routeResult.model} (was ${model})`,
          );
          model = routeResult.model;
          body = this.replaceModelInBody(body, model);
        }
      }
    } catch (routeError) {
      this.logger.warn('[Proxy] Keyword routing failed, using original model', {
        error:
          routeError instanceof Error ? routeError.message : String(routeError),
      });
    }

    // 3. 解析所有可用 provider（按 vendorPriority DESC, healthScore DESC 排序）
    // 如果请求路径是 /responses（OpenAI Responses API），只选择支持该协议的 provider
    // 国内厂商（zhipu, dashscope, doubao 等）apiType='openai'，仅支持 /chat/completions
    // OpenAI 原生 apiType='openai-response'，支持 /responses
    const isResponsesApi =
      path === '/responses' || path.startsWith('/responses/');
    const resolveOptions = isResponsesApi
      ? { requiredProtocol: 'openai-response' }
      : undefined;

    if (isResponsesApi) {
      this.logger.info(
        `[Proxy] Auto-routing: /responses path detected, filtering to openai-response protocol only`,
      );
    }

    const candidates = await this.modelResolverService.resolveAll(
      model,
      resolveOptions,
    );
    if (candidates.length === 0) {
      const protocolHint = isResponsesApi
        ? ` (only providers with apiType=openai-response support /responses endpoint)`
        : '';
      return {
        success: false,
        error: `No available providers for model: ${model}${protocolHint}`,
      };
    }

    this.logger.info(
      `[Proxy] Auto-routing: found ${candidates.length} candidate(s) for ${model}: ${candidates.map((c) => `${c.vendor}(priority=${c.vendorPriority},health=${c.healthScore})`).join(', ')}`,
    );

    // 4. 逐个尝试 provider，连接失败时 fallback
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      const isLastAttempt = i === candidates.length - 1;
      let startTime = Date.now();

      // 检查断路器状态
      if (!this.circuitBreakerService.isAvailable(candidate.providerKeyId)) {
        this.logger.debug(
          `[Proxy] Auto-routing: provider ${candidate.vendor} circuit is OPEN, skipping`,
        );
        continue;
      }

      try {
        // 获取 provider key 并解密 API key
        const providerKey = await this.providerKeyService.getById(
          candidate.providerKeyId,
        );
        if (!providerKey) {
          this.logger.warn(
            `[Proxy] Auto-routing: provider key ${candidate.providerKeyId} not found, skipping`,
          );
          continue;
        }

        const apiKey = this.encryptionService.decrypt(
          Buffer.isBuffer(providerKey.secretEncrypted)
            ? providerKey.secretEncrypted
            : Buffer.from(providerKey.secretEncrypted),
        );

        const effectiveApiType = candidate.apiType || urlApiType;
        const baseUrl = candidate.baseUrl || null;

        // 获取 vendor 配置
        const vendorConfig = getVendorConfigWithCustomUrl(
          effectiveApiType,
          baseUrl,
          effectiveApiType as any,
        );
        if (!vendorConfig && !baseUrl) {
          this.logger.warn(
            `[Proxy] Auto-routing: no vendor config for ${effectiveApiType}, skipping`,
          );
          continue;
        }

        // Normalize request body（strip prefix, remove non-standard fields）
        const normalizedBody = this.normalizeRequestBody(
          body,
          effectiveApiType,
          true,
        );

        // Extract normalized model name for logging
        let normalizedModel = model;
        try {
          if (normalizedBody) {
            const parsed = JSON.parse(normalizedBody.toString('utf-8'));
            if (parsed.model) normalizedModel = parsed.model;
          }
        } catch {
          // ignore
        }

        this.logger.info(
          `[Proxy] Auto-routing: trying provider ${candidate.vendor} (model=${normalizedModel}, key=${candidate.providerKeyId.substring(0, 8)}..., baseUrl=${baseUrl || 'default'}, apiKey=${apiKey.substring(0, 8)}..., path=${path})`,
        );

        startTime = Date.now();

        // 转发到上游
        const { statusCode, tokenUsage, responseTimeMs, success } =
          await this.upstreamService.forwardToUpstream(
            {
              vendorConfig: vendorConfig!,
              path,
              method,
              headers,
              body: normalizedBody,
              apiKey,
              customUrl: baseUrl || undefined,
              metadata:
                (providerKey.metadata as Record<string, unknown>) ?? null,
              vendor,
            },
            rawResponse,
            effectiveApiType,
          );

        // 异步更新 health score（通过事件，避免阻塞请求）
        this.eventEmitter.emit(
          HEALTH_SCORE_EVENTS.UPDATE,
          new HealthScoreUpdateEvent(candidate.providerKeyId, model, success),
        );

        // 更新断路器状态（成功）
        this.circuitBreakerService.recordSuccess(candidate.providerKeyId);

        // 记录使用日志
        await this.logUsage(
          botId,
          effectiveApiType,
          candidate.providerKeyId,
          statusCode,
          path,
          tokenUsage,
          undefined,
          responseTimeMs,
        );

        // 检查配额
        this.quotaService.checkAndNotify(botId).catch((err) => {
          this.logger.error('Failed to check quota:', err);
        });

        return { success: true, statusCode };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        const durationMs = Date.now() - startTime;

        // 异步更新 health score（通过事件，避免阻塞请求）
        this.eventEmitter.emit(
          HEALTH_SCORE_EVENTS.UPDATE,
          new HealthScoreUpdateEvent(candidate.providerKeyId, model, false),
        );

        // 更新断路器状态（失败）
        this.circuitBreakerService.recordFailure(
          candidate.providerKeyId,
          errorMessage,
        );

        this.logger.warn(
          `[Proxy] Auto-routing: provider ${candidate.vendor} failed: ${errorMessage}`,
        );

        // 如果 response headers 已发送，无法重试
        if (rawResponse.headersSent) {
          await this.logUsage(
            botId,
            candidate.apiType,
            candidate.providerKeyId,
            null,
            path,
            null,
            errorMessage,
            durationMs,
          );
          return { success: false, error: `Upstream error: ${errorMessage}` };
        }

        // 记录失败日志
        await this.logUsage(
          botId,
          candidate.apiType,
          candidate.providerKeyId,
          null,
          path,
          null,
          errorMessage,
          durationMs,
        );

        // 最后一个 provider 也失败了
        if (isLastAttempt) {
          return {
            success: false,
            error: `All ${candidates.length} providers failed for model: ${model}. Last error: ${errorMessage}`,
          };
        }

        // 继续尝试下一个 provider
        this.logger.info(
          `[Proxy] Auto-routing: falling back to next provider (${i + 1}/${candidates.length})`,
        );
      }
    }

    return {
      success: false,
      error: `No available providers for model: ${model}`,
    };
  }

  /**
   * 从 request body 中提取 model 名称（去除 provider prefix）
   */
  private extractModelFromBody(body: Buffer | null): string | null {
    if (!body || body.length === 0) return null;
    try {
      const bodyJson = JSON.parse(body.toString('utf-8'));
      if (bodyJson.model && typeof bodyJson.model === 'string') {
        const model = bodyJson.model;
        // Strip provider prefix (e.g., "openai-compatible/gpt-4o" → "gpt-4o")
        const slashIndex = model.indexOf('/');
        return slashIndex >= 0 ? model.substring(slashIndex + 1) : model;
      }
      return null;
    } catch {
      return null;
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
    durationMs?: number,
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
        durationMs: durationMs ?? null,
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
   * Normalize model name in request body and inject stream_options for usage tracking
   *
   * OpenClaw and other clients may send model names with provider prefixes like:
   * - openai-compatible/gpt-4o
   * - openai/gpt-4o
   *
   * This method:
   * 1. Strips the provider prefix to get the raw model name
   * 2. Injects stream_options: { include_usage: true } for streaming requests
   *    to ensure token usage data is returned in the response
   *
   * @param body - The request body buffer
   * @param vendor - The target vendor for alias normalization
   * @returns The normalized request body buffer
   */
  private normalizeRequestBody(
    body: Buffer | null,
    vendor: string,
    isCustom = false,
  ): Buffer | null {
    if (!body || body.length === 0) {
      return body;
    }

    try {
      const bodyStr = body.toString('utf-8');
      const bodyJson = JSON.parse(bodyStr);
      let modified = false;

      // Check if there's a model field and normalize it
      if (bodyJson.model && typeof bodyJson.model === 'string') {
        const originalModel = bodyJson.model;
        const normalizedModel = normalizeModelForProxy(originalModel, vendor);

        if (normalizedModel !== originalModel) {
          this.logger.debug(
            `Normalized model name: ${originalModel} -> ${normalizedModel}`,
          );
          bodyJson.model = normalizedModel;
          modified = true;
        }
      }

      // Determine if this is a native OpenAI request (not a custom/compatible provider)
      const isNativeOpenAI = vendor === 'openai' && !isCustom;

      // Inject stream_options for streaming requests to get usage data
      // Only for native OpenAI — custom providers (e.g. Doubao) may reject unknown fields
      if (bodyJson.stream === true && isNativeOpenAI) {
        if (!bodyJson.stream_options) {
          bodyJson.stream_options = { include_usage: true };
          modified = true;
          this.logger.debug('Injected stream_options for usage tracking');
        } else if (!bodyJson.stream_options.include_usage) {
          bodyJson.stream_options.include_usage = true;
          modified = true;
          this.logger.debug('Enabled include_usage in stream_options');
        }
      }

      // Strip non-standard fields that custom upstream APIs reject
      if (!isNativeOpenAI) {
        const nonStandardFields = ['prompt_cache_key', 'stream_options'];
        for (const field of nonStandardFields) {
          if (field in bodyJson) {
            delete bodyJson[field];
            modified = true;
            this.logger.debug(
              `Stripped non-standard field: ${field} (vendor: ${vendor}, isCustom: ${isCustom})`,
            );
          }
        }
      }

      if (modified) {
        return Buffer.from(JSON.stringify(bodyJson), 'utf-8');
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

  /**
   * 应用复杂度路由
   *
   * 分析请求内容，根据复杂度选择最佳模型
   * 如果复杂度路由成功，返回新的路由参数
   * 如果失败或未启用，返回 null（使用原始路由）
   */
  private async applyComplexityRouting(
    botId: string,
    body: Buffer | null,
    originalKeyId: string,
    originalApiKey: string,
    originalBaseUrl: string | null | undefined,
    originalApiType: string,
  ): Promise<{
    keyId: string;
    apiKey: string;
    baseUrl: string | null | undefined;
    effectiveApiType: string;
    body: Buffer | null;
    reason: string;
  } | null> {
    // 检查是否有复杂度路由服务
    if (!this.botComplexityRouting) {
      return null;
    }

    // 解析请求体
    if (!body || body.length === 0) {
      return null;
    }

    let bodyJson: {
      model?: string;
      messages?: Array<{ role: string; content: unknown }>;
      tools?: unknown[];
    };

    try {
      bodyJson = JSON.parse(body.toString('utf-8'));
    } catch {
      return null;
    }

    // 只对 chat completions 请求应用复杂度路由
    if (!bodyJson.messages || !Array.isArray(bodyJson.messages)) {
      return null;
    }

    // 提取用户消息
    const userMessage = this.extractUserMessage(bodyJson.messages);
    if (!userMessage) {
      return null;
    }

    // 检查是否有工具调用
    const hasTools = Array.isArray(bodyJson.tools) && bodyJson.tools.length > 0;

    // 调用复杂度路由
    try {
      const routeResult = await this.botComplexityRouting.routeByComplexity(
        botId,
        userMessage,
        hasTools,
      );

      if (!routeResult) {
        return null;
      }

      // 获取新的 API key
      const newKeySelection = await this.keyringService.selectKeyForBot(
        routeResult.vendor,
        [], // 使用空 tags，让 keyring 选择默认 key
      );

      if (!newKeySelection) {
        this.logger.warn(
          `[Proxy] Complexity routing: No API key for vendor ${routeResult.vendor}`,
        );
        return null;
      }

      // 修改请求体中的 model
      bodyJson.model = routeResult.model;
      const newBody = Buffer.from(JSON.stringify(bodyJson), 'utf-8');

      return {
        keyId: newKeySelection.keyId,
        apiKey: newKeySelection.secret,
        baseUrl: routeResult.baseUrl || newKeySelection.baseUrl,
        effectiveApiType: routeResult.apiType || routeResult.vendor,
        body: newBody,
        reason: routeResult.reason,
      };
    } catch (error) {
      this.logger.error('[Proxy] Complexity routing failed', { error });
      return null;
    }
  }

  /**
   * 从消息数组中提取最后一条用户消息
   */
  /**
   * 替换 request body 中的 model 名称
   */
  private replaceModelInBody(
    body: Buffer | null,
    newModel: string,
  ): Buffer | null {
    if (!body || body.length === 0) return body;
    try {
      const bodyJson = JSON.parse(body.toString('utf-8'));
      bodyJson.model = newModel;
      return Buffer.from(JSON.stringify(bodyJson), 'utf-8');
    } catch {
      return body;
    }
  }

  private extractUserMessage(
    messages: Array<{ role: string; content: unknown }>,
  ): string | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'user') {
        if (typeof msg.content === 'string') {
          return msg.content;
        }
        if (Array.isArray(msg.content)) {
          // 处理多模态消息
          const textParts = msg.content
            .filter(
              (part): part is { type: string; text: string } =>
                typeof part === 'object' &&
                part !== null &&
                'type' in part &&
                part.type === 'text' &&
                'text' in part,
            )
            .map((part) => part.text);
          if (textParts.length > 0) {
            return textParts.join(' ');
          }
        }
      }
    }
    return null;
  }
}
