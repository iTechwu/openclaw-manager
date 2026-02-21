import { Inject, Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { firstValueFrom, timeout, catchError, of } from 'rxjs';
import { WorkspaceService } from './workspace.service';

/**
 * OpenClaw Gateway RPC 响应
 */
interface GatewayRpcResponse {
  success: boolean;
  error?: string;
  data?: unknown;
}

/**
 * OpenClaw Gateway 配置更新请求
 */
interface ConfigUpdateRequest {
  path: string;
  value: unknown;
}

/**
 * OpenClawGatewayService - OpenClaw Gateway RPC 服务
 *
 * 通过 HTTP API 与运行中的 OpenClaw Gateway 通信：
 * - 推送配置热更新
 * - 触发模型切换
 * - 获取运行状态
 *
 * OpenClaw Gateway RPC 文档：https://docs.openclaw.ai/gateway/rpc
 */
@Injectable()
export class OpenclawGatewayService {
  /** Gateway RPC 超时时间（毫秒） */
  private readonly RPC_TIMEOUT_MS = 10000;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly httpService: HttpService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  /**
   * 推送配置更新到 OpenClaw Gateway
   *
   * @param botId Bot ID
   * @param hostname Bot hostname
   * @param port Bot 端口
   * @param gatewayToken Gateway 认证 Token
   * @param updates 配置更新列表
   */
  async pushConfigUpdate(
    userId: string,
    hostname: string,
    port: number,
    gatewayToken: string,
    updates: ConfigUpdateRequest[],
  ): Promise<GatewayRpcResponse> {
    const url = `http://localhost:${port}/rpc/config.set`;

    try {
      const response = await firstValueFrom(
        this.httpService
          .post(
            url,
            {
              updates: updates.map((u) => ({
                path: u.path,
                value: u.value,
              })),
            },
            {
              headers: {
                Authorization: `Bearer ${gatewayToken}`,
                'Content-Type': 'application/json',
              },
            },
          )
          .pipe(
            timeout(this.RPC_TIMEOUT_MS),
            catchError((error) => {
              this.logger.error(
                `[OpenClawGateway] Failed to push config update`,
                {
                  hostname,
                  error: error.message || String(error),
                },
              );
              return of({ status: 500, data: { error: error.message } });
            }),
          ),
      );

      const success = response.status === 200;
      const data = response.data;

      if (success) {
        this.logger.info(
          `[OpenClawGateway] Config update pushed successfully`,
          {
            hostname,
            updateCount: updates.length,
          },
        );
      }

      return {
        success,
        error: data?.error,
        data: data,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`[OpenClawGateway] Config update failed`, {
        hostname,
        error: errorMessage,
      });
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 切换主模型
   *
   * @param userId 用户 ID
   * @param hostname Bot hostname
   * @param port Bot 端口
   * @param gatewayToken Gateway Token
   * @param modelRef 新模型引用（如 "anthropic/claude-sonnet-4-5"）
   * @param fallbacks Fallback 模型列表
   */
  async switchModel(
    userId: string,
    hostname: string,
    port: number,
    gatewayToken: string,
    modelRef: string,
    fallbacks?: string[],
  ): Promise<GatewayRpcResponse> {
    const updates: ConfigUpdateRequest[] = [
      {
        path: 'agents.defaults.model.primary',
        value: modelRef,
      },
    ];

    if (fallbacks && fallbacks.length > 0) {
      updates.push({
        path: 'agents.defaults.model.fallbacks',
        value: fallbacks,
      });
    }

    return this.pushConfigUpdate(
      userId,
      hostname,
      port,
      gatewayToken,
      updates,
    );
  }

  /**
   * 更新 Provider 配置
   *
   * @param userId 用户 ID
   * @param hostname Bot hostname
   * @param port Bot 端口
   * @param gatewayToken Gateway Token
   * @param providerId Provider ID（如 "anthropic", "openai"）
   * @param config Provider 配置
   */
  async updateProviderConfig(
    userId: string,
    hostname: string,
    port: number,
    gatewayToken: string,
    providerId: string,
    config: Record<string, unknown>,
  ): Promise<GatewayRpcResponse> {
    const updates: ConfigUpdateRequest[] = [
      {
        path: `models.providers.${providerId}`,
        value: config,
      },
    ];

    return this.pushConfigUpdate(
      userId,
      hostname,
      port,
      gatewayToken,
      updates,
    );
  }

  /**
   * 启用/禁用 Fallback
   *
   * @param userId 用户 ID
   * @param hostname Bot hostname
   * @param port Bot 端口
   * @param gatewayToken Gateway Token
   * @param enabled 是否启用 Fallback
   */
  async setFallbackEnabled(
    userId: string,
    hostname: string,
    port: number,
    gatewayToken: string,
    enabled: boolean,
  ): Promise<GatewayRpcResponse> {
    const updates: ConfigUpdateRequest[] = [
      {
        path: 'agents.defaults.model.enableFallback',
        value: enabled,
      },
    ];

    return this.pushConfigUpdate(
      userId,
      hostname,
      port,
      gatewayToken,
      updates,
    );
  }

  /**
   * 获取当前配置
   */
  async getCurrentConfig(
    userId: string,
    hostname: string,
    port: number,
    gatewayToken: string,
    paths?: string[],
  ): Promise<GatewayRpcResponse> {
    const url = `http://localhost:${port}/rpc/config.get`;

    try {
      const response = await firstValueFrom(
        this.httpService
          .post(
            url,
            {
              paths: paths || ['models', 'agents.defaults.model'],
            },
            {
              headers: {
                Authorization: `Bearer ${gatewayToken}`,
                'Content-Type': 'application/json',
              },
            },
          )
          .pipe(
            timeout(this.RPC_TIMEOUT_MS),
            catchError((error) => {
              return of({ status: 500, data: { error: error.message } });
            }),
          ),
      );

      return {
        success: response.status === 200,
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 重新加载完整配置文件
   * 从 openclaw.json 重新加载配置
   */
  async reloadConfig(
    userId: string,
    hostname: string,
    port: number,
    gatewayToken: string,
  ): Promise<GatewayRpcResponse> {
    const url = `http://localhost:${port}/rpc/config.reload`;

    try {
      const response = await firstValueFrom(
        this.httpService
          .post(
            url,
            {},
            {
              headers: {
                Authorization: `Bearer ${gatewayToken}`,
                'Content-Type': 'application/json',
              },
            },
          )
          .pipe(
            timeout(this.RPC_TIMEOUT_MS),
            catchError((error) => {
              return of({ status: 500, data: { error: error.message } });
            }),
          ),
      );

      const success = response.status === 200;

      if (success) {
        this.logger.info(
          `[OpenClawGateway] Config reloaded successfully`,
          { hostname },
        );
      }

      return {
        success,
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 检查 Gateway 是否在线
   */
  async isGatewayOnline(port: number): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`http://localhost:${port}/health`).pipe(
          timeout(5000),
          catchError(() => of({ status: 500 })),
        ),
      );
      return response.status === 200;
    } catch {
      return false;
    }
  }
}
