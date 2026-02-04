import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProxyTokenService, ProviderKeyService } from '@app/db';
import { EncryptionService } from '../../bot-api/services/encryption.service';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { PROVIDER_CONFIGS } from '@repo/contracts';

/**
 * Token 验证结果
 */
export interface TokenValidation {
  valid: boolean;
  botId?: string;
  vendor?: string;
  keyId?: string;
  apiKey?: string;
  baseUrl?: string | null;
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
    private readonly configService: ConfigService,
    private readonly proxyTokenService: ProxyTokenService,
    private readonly providerKeyService: ProviderKeyService,
    private readonly encryptionService: EncryptionService,
  ) {}

  /**
   * 注册 Bot 并生成 Proxy Token
   */
  async registerBot(
    botId: string,
    vendor: string,
    keyId: string,
    tags?: string[],
  ): Promise<{ token: string; expiresAt?: Date }> {
    // Check if bot already has a token
    const existing = await this.proxyTokenService.getByBotId(botId);
    if (existing && !existing.revokedAt) {
      // Revoke existing token
      await this.revokeBot(botId);
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
    const raw = Buffer.isBuffer(providerKey.secretEncrypted)
      ? providerKey.secretEncrypted
      : Buffer.from(providerKey.secretEncrypted);
    const apiKey = this.encryptionService.decrypt(raw);

    // Update usage stats (async, don't block)
    this.updateUsage(tokenHash).catch((err) => {
      this.logger.error('Failed to update token usage:', err);
    });

    return {
      valid: true,
      botId: proxyToken.botId,
      vendor: proxyToken.vendor,
      keyId: proxyToken.keyId,
      apiKey,
      baseUrl: providerKey.baseUrl,
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
   */
  isZeroTrustEnabled(): boolean {
    return this.configService.get<boolean>('ZERO_TRUST_MODE', false);
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
}
