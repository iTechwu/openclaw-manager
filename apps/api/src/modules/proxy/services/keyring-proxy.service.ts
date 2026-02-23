import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ProxyTokenService, ProviderKeyService, BotService } from '@app/db';
import { EncryptionService } from '../../bot-api/services/encryption.service';
import {
  ModelRouterService,
  ModelRouteResult,
} from '../../bot-api/services/model-router.service';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { PROVIDER_CONFIGS } from '@repo/contracts';

/**
 * Token 验证结果
 */
export interface TokenValidation {
  valid: boolean;
  apiType?: string;
  botId?: string;
  vendor?: string;
  keyId?: string;
  apiKey?: string;
  baseUrl?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * 带路由的 Token 验证结果
 */
export interface TokenValidationWithRouting extends TokenValidation {
  /** 路由结果 */
  routeResult?: ModelRouteResult;
  /** 是否使用了路由 */
  routed?: boolean;
}

/**
 * 路由请求参数
 */
export interface ProxyRouteRequest {
  /** Bot ID */
  botId: string;
  /** 用户消息（用于功能路由匹配） */
  message?: string;
  /** 路由提示 */
  routingHint?: string;
}

/**
 * KeyringProxyService - Zero-Trust 模式密钥代理服务
 *
 * 核心职责：
 * - Bot 注册和 Proxy Token 生成
 * - Token 验证和 API Key 注入
 * - Token 撤销和生命周期管理
 *
 * 安全原则：Bot 容器永远不持有真实的 API Key
 */
@Injectable()
export class KeyringProxyService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly proxyTokenService: ProxyTokenService,
    private readonly providerKeyService: ProviderKeyService,
    private readonly botService: BotService,
    private readonly encryptionService: EncryptionService,
    private readonly modelRouterService: ModelRouterService,
  ) {}

  /** 解密 ProviderKey 的 secretEncrypted 字段 */
  private decryptApiKey(secretEncrypted: Buffer | Uint8Array): string {
    const raw = Buffer.isBuffer(secretEncrypted)
      ? secretEncrypted
      : Buffer.from(secretEncrypted);
    return this.encryptionService.decrypt(raw);
  }

  /**
   * 注册 Bot 并生成 Proxy Token
   */
  async registerBot(
    botId: string,
    vendor: string,
    keyId: string,
    tags?: string[],
  ): Promise<{ token: string; expiresAt?: Date }> {
    // 验证 Bot 是否存在
    const bot = await this.botService.getById(botId);
    if (!bot) {
      this.logger.error(`Bot not found when registering with proxy: ${botId}`);
      throw new NotFoundException(`Bot with id "${botId}" not found`);
    }

    // 验证 ProviderKey 是否存在
    const providerKey = await this.providerKeyService.getById(keyId);
    if (!providerKey) {
      this.logger.error(
        `ProviderKey not found when registering bot with proxy: ${keyId}`,
      );
      throw new NotFoundException(`ProviderKey with id "${keyId}" not found`);
    }

    // Check if bot already has a token - delete it since botId is unique
    const existing = await this.proxyTokenService.getByBotId(botId);
    if (existing) {
      // Delete existing token (botId has @unique constraint, can't have multiple)
      await this.proxyTokenService.delete({ id: existing.id });
      this.logger.info(`Deleted existing proxy token for bot: ${botId}`);
    }

    // Calculate expiration (default: 24 hours)
    const ttl = Number(process.env.PROXY_TOKEN_TTL) || 86400;
    const expiresAt = new Date(Date.now() + ttl * 1000);

    // Generate secure random token
    const token = this.encryptionService.generateToken();
    const tokenHash = this.encryptionService.hashToken(token);

    // Create new token
    await this.proxyTokenService.create({
      bot: { connect: { id: botId } },
      tokenHash,
      vendor,
      providerKey: { connect: { id: keyId } },
      tags: tags || [],
      expiresAt,
    });

    this.logger.info(`Bot registered with proxy: ${botId}`);
    return { token, expiresAt };
  }

  /**
   * 撤销 Bot 访问权限
   */
  async revokeBot(botId: string): Promise<void> {
    const token = await this.proxyTokenService.getByBotId(botId);
    if (token && !token.revokedAt) {
      await this.proxyTokenService.update(
        { id: token.id },
        { revokedAt: new Date() },
      );
      this.logger.info(`Bot revoked from proxy: ${botId}`);
    }
  }

  /**
   * 验证 Token 并返回 API Key
   */
  async validateToken(token: string): Promise<TokenValidation> {
    const tokenHash = this.encryptionService.hashToken(token);
    const proxyToken = await this.proxyTokenService.getByTokenHash(tokenHash);

    if (!proxyToken) {
      return { valid: false };
    }

    // Check if revoked
    if (proxyToken.revokedAt) {
      return { valid: false };
    }

    // Check if expired
    if (proxyToken.expiresAt && proxyToken.expiresAt < new Date()) {
      return { valid: false };
    }

    // Get provider key and decrypt API key
    const providerKey = await this.providerKeyService.getById(proxyToken.keyId);
    if (!providerKey) {
      return { valid: false };
    }

    // Decrypt API key
    const apiKey = this.decryptApiKey(providerKey.secretEncrypted);

    // Update usage stats (async, don't block)
    this.updateUsage(tokenHash).catch((err) => {
      this.logger.error('Failed to update token usage:', err);
    });

    return {
      valid: true,
      apiType: providerKey.apiType || 'openai',
      botId: proxyToken.botId,
      vendor: proxyToken.vendor,
      keyId: proxyToken.keyId,
      apiKey,
      baseUrl: providerKey.baseUrl,
      metadata: (providerKey.metadata as Record<string, unknown>) ?? null,
    };
  }

  /**
   * 更新使用统计
   */
  private async updateUsage(tokenHash: string): Promise<void> {
    const token = await this.proxyTokenService.getByTokenHash(tokenHash);
    if (token) {
      await this.proxyTokenService.update(
        { id: token.id },
        {
          lastUsedAt: new Date(),
          requestCount: { increment: 1 },
        },
      );
    }
  }

  /**
   * 获取认证头 - 支持多种 API 类型
   */
  getAuthHeader(vendor: string, apiKey: string): Record<string, string> {
    const providerConfig =
      PROVIDER_CONFIGS[vendor as keyof typeof PROVIDER_CONFIGS];
    const apiType = providerConfig?.apiType || 'openai';

    switch (apiType) {
      case 'anthropic':
        return {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        };
      case 'gemini':
        return { 'x-goog-api-key': apiKey };
      case 'azure-openai':
        return { 'api-key': apiKey };
      case 'ollama':
        return {}; // Ollama 本地服务无需认证
      case 'openai':
      case 'openai-response':
      case 'new-api':
      case 'gateway':
      default:
        // OpenAI 兼容 API（大部分平台使用此格式）
        return { Authorization: `Bearer ${apiKey}` };
    }
  }

  /**
   * 检查 Zero-Trust 模式是否启用
   * 注意：ZERO_TRUST_MODE 是从 .env 环境变量读取，不是从 config.yaml 读取
   */
  isZeroTrustEnabled(): boolean {
    // 直接从 process.env 读取，因为 ConfigModule 只加载了 YAML 配置
    const value = process.env.ZERO_TRUST_MODE;
    const enabled = value === 'true' || value === '1';
    this.logger.info('Zero-Trust mode check', {
      ZERO_TRUST_MODE: value,
      enabled,
      allEnvKeys: Object.keys(process.env).filter(
        (k) => k.includes('ZERO') || k.includes('TRUST') || k.includes('PROXY'),
      ),
    });
    return enabled;
  }

  /**
   * 删除 Bot 的 Proxy Token（Bot 删除时调用）
   */
  async deleteByBotId(botId: string): Promise<void> {
    const token = await this.proxyTokenService.getByBotId(botId);
    if (token) {
      await this.proxyTokenService.delete({ id: token.id });
      this.logger.info(`Proxy token deleted for bot: ${botId}`);
    }
  }

  // ============================================================================
  // Model Routing Methods - 模型路由方法
  // ============================================================================

  /**
   * 验证 Token 并根据路由配置选择模型
   * 这是带路由功能的增强版 validateToken
   */
  async validateTokenWithRouting(
    token: string,
    routeRequest?: ProxyRouteRequest,
  ): Promise<TokenValidationWithRouting> {
    // 1. 先进行基础 Token 验证
    const baseValidation = await this.validateToken(token);
    if (!baseValidation.valid || !baseValidation.botId) {
      return { ...baseValidation, routed: false };
    }

    // 2. 如果没有路由请求参数，返回基础验证结果
    if (!routeRequest?.message && !routeRequest?.routingHint) {
      return { ...baseValidation, routed: false };
    }

    // 3. 执行模型路由
    try {
      const routeResult = await this.modelRouterService.routeRequest({
        botId: baseValidation.botId,
        message: routeRequest.message || '',
        routingHint: routeRequest.routingHint,
      });

      // 4. 如果路由结果与当前 Provider 不同，需要获取新的 API Key
      if (routeResult.providerKeyId !== baseValidation.keyId) {
        const newProviderKey = await this.providerKeyService.getById(
          routeResult.providerKeyId,
        );

        if (!newProviderKey) {
          this.logger.warn('Routed provider key not found', {
            providerKeyId: routeResult.providerKeyId,
          });
          return { ...baseValidation, routed: false };
        }

        // 解密新的 API Key
        const apiKey = this.decryptApiKey(newProviderKey.secretEncrypted);

        return {
          valid: true,
          apiType: routeResult.apiType || 'openai',
          botId: baseValidation.botId,
          vendor: routeResult.vendor,
          keyId: routeResult.providerKeyId,
          apiKey,
          baseUrl: routeResult.baseUrl,
          routeResult,
          routed: true,
        };
      }

      // 5. 路由结果与当前 Provider 相同，只更新模型信息
      return {
        ...baseValidation,
        routeResult,
        routed: true,
      };
    } catch (error) {
      this.logger.warn('Model routing failed, using default', {
        botId: baseValidation.botId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { ...baseValidation, routed: false };
    }
  }

  /**
   * 根据路由配置选择模型（不验证 Token）
   * 用于已经验证过 Token 的场景
   */
  async routeModel(request: ProxyRouteRequest): Promise<ModelRouteResult> {
    return this.modelRouterService.routeRequest({
      botId: request.botId,
      message: request.message || '',
      routingHint: request.routingHint,
    });
  }

  /**
   * 执行带故障转移的操作
   */
  async executeWithFailover<T>(
    botId: string,
    routingId: string,
    operation: (route: ModelRouteResult) => Promise<T>,
  ): Promise<T> {
    return this.modelRouterService.executeWithFailover(
      botId,
      routingId,
      operation,
    );
  }

  /**
   * 测试路由配置
   */
  async testRoute(request: ProxyRouteRequest): Promise<ModelRouteResult> {
    return this.modelRouterService.testRoute({
      botId: request.botId,
      message: request.message || '',
      routingHint: request.routingHint,
    });
  }
}
