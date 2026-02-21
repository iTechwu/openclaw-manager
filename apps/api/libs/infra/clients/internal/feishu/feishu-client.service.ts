/**
 * 飞书客户端服务
 *
 * 职责：
 * - 创建飞书 API 客户端（用于凭证验证和管理操作）
 * - 不再管理 WebSocket 长连接（已迁移到 OpenClaw 原生 feishu 扩展）
 *
 * 迁移说明：
 * - 原 WebSocket 连接逻辑已迁移到 OpenClaw feishu 扩展
 * - 此服务现在只负责创建 API 客户端用于凭证验证
 */
import { Injectable, Inject } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { FeishuApiClient } from './feishu-api.client';
import type { FeishuCredentials, FeishuChannelConfig } from './feishu.types';

@Injectable()
export class FeishuClientService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly httpService: HttpService,
  ) {}

  /**
   * 创建飞书 API 客户端
   * 用于凭证验证和管理操作
   *
   * @param credentials 飞书凭证
   * @param config 渠道配置
   * @returns FeishuApiClient 实例
   */
  createApiClient(
    credentials: FeishuCredentials,
    config: FeishuChannelConfig = {},
  ): FeishuApiClient {
    return new FeishuApiClient(
      credentials,
      config,
      this.httpService,
      this.logger,
    );
  }

  /**
   * 验证飞书凭证是否有效
   * 通过获取 Tenant Access Token 来验证
   *
   * @param credentials 飞书凭证
   * @param config 渠道配置
   * @returns 验证结果
   */
  async validateCredentials(
    credentials: FeishuCredentials,
    config: FeishuChannelConfig = {},
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      const apiClient = this.createApiClient(credentials, config);
      await apiClient.getTenantAccessToken();
      return { valid: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn('Feishu credentials validation failed', {
        error: errorMessage,
      });
      return { valid: false, error: errorMessage };
    }
  }
}
