import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/**
 * Proxy 配置
 */
export interface ProxyConfig {
  adminUrl: string;
  adminToken: string;
}

/**
 * Bot 注册响应
 */
export interface BotRegistration {
  token: string;
}

/**
 * Proxy 健康状态响应
 */
export interface ProxyHealthResponse {
  status: string;
  keyCount: number;
  botCount: number;
}

/**
 * Proxy Key 信息
 */
export interface ProxyKey {
  id: string;
  vendor: string;
  label: string | null;
  tag: string | null;
  createdAt: number;
}

/**
 * 添加 Key 输入
 */
export interface AddKeyInput {
  vendor: string;
  secret: string;
  label?: string;
  tag?: string;
}

/**
 * KeyringProxyClient - Keyring 代理客户端
 *
 * 与 keyring-proxy 服务通信的客户端。
 * 用于 Bot 注册、API Key 管理等功能。
 *
 * 遵循架构规范：
 * - 所有外部服务调用必须在 Client 层
 * - 使用 @nestjs/axios 的 HttpService
 */
@Injectable()
export class KeyringProxyClient implements OnModuleInit {
  private readonly logger = new Logger(KeyringProxyClient.name);
  private proxyConfig: ProxyConfig | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  async onModuleInit(): Promise<void> {
    const adminUrl = process.env.PROXY_ADMIN_URL; //this.configService.get<string>('PROXY_ADMIN_URL');
    const adminToken = process.env.PROXY_ADMIN_TOKEN; //this.configService.get<string>('PROXY_ADMIN_TOKEN');

    if (adminUrl && adminToken) {
      this.proxyConfig = { adminUrl, adminToken };
      this.logger.log('Keyring proxy configured');

      // 检查代理健康状态
      const healthy = await this.isHealthy();
      if (healthy) {
        this.logger.log('Keyring proxy is healthy');
      } else {
        this.logger.warn('Keyring proxy is not healthy');
      }
    } else {
      this.logger.log('Keyring proxy not configured');
    }
  }

  /**
   * 检查代理是否已配置
   */
  isConfigured(): boolean {
    return this.proxyConfig !== null;
  }

  /**
   * 获取代理配置
   */
  getConfig(): ProxyConfig | null {
    return this.proxyConfig;
  }

  /**
   * 检查代理是否健康
   */
  async isHealthy(): Promise<boolean> {
    if (!this.proxyConfig) {
      return false;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.proxyConfig.adminUrl}/admin/health`, {
          headers: this.getAuthHeaders(),
        }),
      );
      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * 注册 Bot 到代理
   * 返回用于代理认证的 Bot Token
   */
  async registerBot(
    botId: string,
    hostname: string,
    tags?: string[],
  ): Promise<BotRegistration> {
    if (!this.proxyConfig) {
      throw new Error('Proxy not configured');
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post<BotRegistration>(
          `${this.proxyConfig.adminUrl}/admin/bots`,
          { botId, hostname, tags },
          { headers: this.getAuthHeaders() },
        ),
      );
      this.logger.log(`Bot registered with proxy: ${hostname}`);
      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to register bot with proxy: ${hostname}`,
        error,
      );
      throw new Error(
        `Failed to register bot with proxy: ${this.getErrorMessage(error)}`,
      );
    }
  }

  /**
   * 从代理撤销 Bot 访问权限
   */
  async revokeBot(botId: string): Promise<void> {
    if (!this.proxyConfig) {
      throw new Error('Proxy not configured');
    }

    try {
      await firstValueFrom(
        this.httpService.delete(
          `${this.proxyConfig.adminUrl}/admin/bots/${botId}`,
          {
            headers: this.getAuthHeaders(),
          },
        ),
      );
      this.logger.log(`Bot revoked from proxy: ${botId}`);
    } catch (error) {
      // 404 表示 Bot 不存在，忽略
      if (this.isNotFoundError(error)) {
        return;
      }
      this.logger.error(`Failed to revoke bot from proxy: ${botId}`, error);
      throw new Error(
        `Failed to revoke bot from proxy: ${this.getErrorMessage(error)}`,
      );
    }
  }

  /**
   * 获取代理中配置的可用 Vendor 列表
   */
  async getAvailableVendors(): Promise<string[]> {
    if (!this.proxyConfig) {
      return [];
    }

    try {
      const keys = await this.listKeys();
      const vendors = new Set(keys.map((k) => k.vendor));
      return Array.from(vendors);
    } catch {
      return [];
    }
  }

  /**
   * 列出所有 API Keys（不包含密钥）
   */
  async listKeys(): Promise<ProxyKey[]> {
    if (!this.proxyConfig) {
      throw new Error('Proxy not configured');
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get<ProxyKey[]>(
          `${this.proxyConfig.adminUrl}/admin/keys`,
          {
            headers: this.getAuthHeaders(),
          },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to list proxy keys', error);
      throw new Error(
        `Failed to list proxy keys: ${this.getErrorMessage(error)}`,
      );
    }
  }

  /**
   * 添加新的 API Key 到代理
   */
  async addKey(input: AddKeyInput): Promise<{ id: string }> {
    if (!this.proxyConfig) {
      throw new Error('Proxy not configured');
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post<{ id: string }>(
          `${this.proxyConfig.adminUrl}/admin/keys`,
          input,
          { headers: this.getAuthHeaders() },
        ),
      );
      this.logger.log(`Proxy key added: ${response.data.id} (${input.vendor})`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to add proxy key: ${input.vendor}`, error);
      throw new Error(
        `Failed to add proxy key: ${this.getErrorMessage(error)}`,
      );
    }
  }

  /**
   * 从代理删除 API Key
   */
  async deleteKey(keyId: string): Promise<void> {
    if (!this.proxyConfig) {
      throw new Error('Proxy not configured');
    }

    try {
      await firstValueFrom(
        this.httpService.delete(
          `${this.proxyConfig.adminUrl}/admin/keys/${keyId}`,
          {
            headers: this.getAuthHeaders(),
          },
        ),
      );
      this.logger.log(`Proxy key deleted: ${keyId}`);
    } catch (error) {
      // 404 表示 Key 不存在，忽略
      if (this.isNotFoundError(error)) {
        return;
      }
      this.logger.error(`Failed to delete proxy key: ${keyId}`, error);
      throw new Error(
        `Failed to delete proxy key: ${this.getErrorMessage(error)}`,
      );
    }
  }

  /**
   * 获取代理健康状态
   */
  async getHealth(): Promise<ProxyHealthResponse> {
    if (!this.proxyConfig) {
      throw new Error('Proxy not configured');
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get<ProxyHealthResponse>(
          `${this.proxyConfig.adminUrl}/admin/health`,
          { headers: this.getAuthHeaders() },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get proxy health', error);
      throw new Error(
        `Failed to get proxy health: ${this.getErrorMessage(error)}`,
      );
    }
  }

  /**
   * 获取认证头
   */
  private getAuthHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.proxyConfig?.adminToken}`,
    };
  }

  /**
   * 检查是否为 404 错误
   */
  private isNotFoundError(error: unknown): boolean {
    const axiosError = error as { response?: { status?: number } };
    return axiosError.response?.status === 404;
  }

  /**
   * 获取错误消息
   */
  private getErrorMessage(error: unknown): string {
    const axiosError = error as {
      response?: { data?: { error?: string } };
      message?: string;
    };
    return (
      axiosError.response?.data?.error || axiosError.message || 'Unknown error'
    );
  }
}
