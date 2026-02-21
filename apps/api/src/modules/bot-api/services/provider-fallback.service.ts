import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { CircuitBreakerService } from '../../proxy/services/circuit-breaker.service';
import { KeyringProxyService } from '../../proxy/services/keyring-proxy.service';
import {
  BotService,
  BotModelService,
  ProviderKeyService,
  ModelAvailabilityService,
} from '@app/db';
import { WorkspaceService } from './workspace.service';
import { OpenclawConfigService } from './openclaw-config.service';
import { OpenclawGatewayService } from './openclaw-gateway.service';
import {
  isOpenclawNativeSupported,
  getOpenclawNativeProvider,
} from '@repo/contracts';
import type { Bot, ProviderKey } from '@prisma/client';
import enviromentUtil from 'libs/infra/utils/enviroment.util';

/**
 * Provider 健康状态
 */
interface ProviderHealthStatus {
  providerKeyId: string;
  vendor: string;
  isHealthy: boolean;
  circuitState: 'closed' | 'open' | 'half-open' | null;
  lastChecked: Date;
}

/**
 * Bot 的 Provider 状态
 */
interface BotProviderStatus {
  botId: string;
  hostname: string;
  userId: string;
  primaryProvider: {
    vendor: string;
    providerKeyId: string;
    modelId: string;
  };
  currentMode: 'native' | 'proxy';
  healthStatus: ProviderHealthStatus;
}

/**
 * ProviderFallbackService - Provider 健康监控与自动 Fallback 服务
 *
 * 功能：
 * 1. 定期检查原生 Provider 的健康状态（通过 Circuit Breaker）
 * 2. 当原生 Provider 不可用时，自动切换到 Proxy 模式
 * 3. 当 Provider 恢复时，可选自动切换回原生模式
 * 4. 记录切换事件并通知用户
 */
@Injectable()
export class ProviderFallbackService implements OnModuleInit {
  /** 记录 Bot 的当前 Provider 模式 */
  private botProviderModes = new Map<string, 'native' | 'proxy'>();

  /** 记录切换事件 */
  private switchEvents = new Map<
    string,
    {
      from: 'native' | 'proxy';
      to: 'native' | 'proxy';
      reason: string;
      timestamp: Date;
    }
  >();

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly keyringProxyService: KeyringProxyService,
    private readonly botService: BotService,
    private readonly botModelService: BotModelService,
    private readonly providerKeyService: ProviderKeyService,
    private readonly modelAvailabilityService: ModelAvailabilityService,
    private readonly workspaceService: WorkspaceService,
    private readonly openclawConfigService: OpenclawConfigService,
    private readonly openclawGatewayService: OpenclawGatewayService,
  ) {}

  onModuleInit() {
    this.logger.info('[ProviderFallback] Service initialized');
  }

  /**
   * 定期检查 Provider 健康状态（每分钟）
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async checkProviderHealth() {
    try {
      // 获取所有运行中的 Bot
      const { list: runningBots } = await this.botService.list(
        { status: 'running' },
        { limit: 1000 },
      );

      for (const bot of runningBots) {
        await this.checkBotProviderHealth(bot);
      }
    } catch (error) {
      this.logger.error('[ProviderFallback] Health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 检查单个 Bot 的 Provider 健康状态
   */
  private async checkBotProviderHealth(bot: Bot): Promise<void> {
    // 获取 Bot 的主模型信息
    const primaryModel = await this.getBotPrimaryModel(bot.id);
    if (!primaryModel) {
      return; // 没有配置模型，跳过
    }

    const vendor = primaryModel.vendor;
    const providerKeyId = primaryModel.providerKeyId;

    // 检查是否支持原生模式
    const supportsNative = isOpenclawNativeSupported(vendor);
    if (!supportsNative) {
      // 不支持原生模式，始终使用 Proxy，无需检查
      return;
    }

    // 获取断路器状态
    const circuitState = this.circuitBreakerService.getStatus(providerKeyId);
    const isHealthy = circuitState === null || circuitState === 'closed';

    // 获取当前模式
    const currentMode = this.botProviderModes.get(bot.id) || 'native';

    // 记录健康状态
    const healthStatus: ProviderHealthStatus = {
      providerKeyId,
      vendor,
      isHealthy,
      circuitState,
      lastChecked: new Date(),
    };

    // 如果原生 Provider 不健康且当前使用原生模式，切换到 Proxy
    if (!isHealthy && currentMode === 'native') {
      await this.switchToProxyMode(bot, primaryModel, healthStatus);
    }

    // 如果原生 Provider 恢复健康且当前使用 Proxy 模式，可选切换回原生
    // 注意：这里我们不自动切换回原生模式，避免频繁切换
    // 用户可以手动触发恢复
  }

  /**
   * 切换 Bot 到 Proxy 模式
   *
   * 注意：此操作需要重新生成 Proxy Token 并可能需要重启容器
   * 或者使用 OpenClaw Gateway 的热更新功能推送新配置
   */
  private async switchToProxyMode(
    bot: Bot,
    primaryModel: { modelId: string; vendor: string; providerKeyId: string },
    healthStatus: ProviderHealthStatus,
  ): Promise<void> {
    this.logger.warn(
      `[ProviderFallback] Switching bot ${bot.hostname} to proxy mode due to unhealthy provider`,
      {
        botId: bot.id,
        vendor: primaryModel.vendor,
        providerKeyId: primaryModel.providerKeyId,
        circuitState: healthStatus.circuitState,
      },
    );

    try {
      // 获取 Proxy URL
      const proxyUrl = enviromentUtil.generateEnvironmentUrls().internalApi || '';

      // 为 Bot 注册新的 Proxy Token（用于 Zero-Trust 模式）
      // 注意：这会生成一个新的 token，需要通过热更新推送到容器
      let proxyToken = '';
      const isZeroTrust = this.keyringProxyService.isZeroTrustEnabled();

      if (isZeroTrust && primaryModel.providerKeyId) {
        // 在 Zero-Trust 模式下，重新注册以获取新 token
        // 对于 Hybrid-Native 模式，使用 OpenClaw 原生 provider ID
        const nativeConfig = getOpenclawNativeProvider(primaryModel.vendor);
        const effectiveVendor = nativeConfig
          ? nativeConfig.openclawProviderId
          : primaryModel.vendor;

        try {
          const registration = await this.keyringProxyService.registerBot(
            bot.id,
            effectiveVendor, // 使用原生 provider ID 以便代理路由
            primaryModel.providerKeyId,
            [],
          );
          proxyToken = registration.token;
          this.logger.info(
            `[ProviderFallback] Generated new proxy token for bot ${bot.hostname} (vendor: ${effectiveVendor})`,
          );
        } catch (regError) {
          this.logger.error(
            `[ProviderFallback] Failed to register proxy token for bot ${bot.hostname}`,
            { error: regError instanceof Error ? regError.message : String(regError) },
          );
          // 继续使用空 token，配置更新会记录警告
        }
      }

      // 获取 Provider Key 信息
      let providerKeyInfo = null;
      if (primaryModel.providerKeyId) {
        const providerKey = await this.providerKeyService.get({
          id: primaryModel.providerKeyId,
        });
        if (providerKey) {
          providerKeyInfo = {
            vendor: providerKey.vendor,
            apiKey: '', // 安全考虑，不在这里传递 API Key
            baseUrl: providerKey.baseUrl,
          };
        }
      }

      // 更新配置文件
      // 在 Zero-Trust 模式下使用 useZeroTrust=true 启用 Hybrid-Native 模式
      // 如果原生 Provider 不可用，会自动 fallback 到 Proxy 模式
      await this.workspaceService.updateOpenclawConfigWithProvider({
        botId: bot.id,
        userId: bot.createdById,
        hostname: bot.hostname,
        gatewayToken: bot.gatewayToken || '',
        proxyUrl,
        proxyToken,
        primaryModel: {
          modelId: primaryModel.modelId,
          vendor: primaryModel.vendor,
          providerKeyId: primaryModel.providerKeyId,
        },
        providerKey: providerKeyInfo,
        useZeroTrust: isZeroTrust, // 使用 Hybrid-Native 模式
      });

      // 尝试通过 Gateway RPC 推送热更新（如果容器正在运行）
      if (bot.port && bot.gatewayToken) {
        try {
          const reloadResult = await this.openclawGatewayService.reloadConfig(
            bot.createdById,
            bot.hostname,
            bot.port,
            bot.gatewayToken,
          );
          if (reloadResult.success) {
            this.logger.info(
              `[ProviderFallback] Hot-reloaded config for bot ${bot.hostname}`,
            );
          } else {
            this.logger.warn(
              `[ProviderFallback] Failed to hot-reload config for bot ${bot.hostname}: ${reloadResult.error}`,
            );
            // 需要重启容器才能生效
          }
        } catch (reloadError) {
          this.logger.warn(
            `[ProviderFallback] Gateway RPC failed for bot ${bot.hostname}, container restart may be needed`,
            { error: reloadError instanceof Error ? reloadError.message : String(reloadError) },
          );
        }
      }

      // 更新记录
      const previousMode = this.botProviderModes.get(bot.id) || 'native';
      this.botProviderModes.set(bot.id, 'proxy');

      // 记录切换事件
      this.switchEvents.set(bot.id, {
        from: previousMode,
        to: 'proxy',
        reason: `Provider unhealthy: circuit ${healthStatus.circuitState}`,
        timestamp: new Date(),
      });

      this.logger.info(
        `[ProviderFallback] Bot ${bot.hostname} switched to proxy mode successfully`,
      );
    } catch (error) {
      this.logger.error(
        `[ProviderFallback] Failed to switch bot ${bot.hostname} to proxy mode`,
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  /**
   * 手动恢复 Bot 到原生模式
   */
  async restoreToNativeMode(botId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    const bot = await this.botService.getById(botId);
    if (!bot) {
      return { success: false, message: 'Bot not found' };
    }

    const primaryModel = await this.getBotPrimaryModel(botId);
    if (!primaryModel) {
      return { success: false, message: 'No primary model configured' };
    }

    const vendor = primaryModel.vendor;
    if (!isOpenclawNativeSupported(vendor)) {
      return {
        success: false,
        message: `Vendor ${vendor} does not support native mode`,
      };
    }

    // 检查断路器状态
    const circuitState = this.circuitBreakerService.getStatus(
      primaryModel.providerKeyId,
    );
    if (circuitState === 'open') {
      return {
        success: false,
        message: 'Provider circuit is still open, please wait for recovery',
      };
    }

    try {
      // 获取配置信息
      const proxyUrl = enviromentUtil.generateEnvironmentUrls().internalApi || '';

      // 获取 Provider Key 信息
      let providerKeyInfo = null;
      if (primaryModel.providerKeyId) {
        const providerKey = await this.providerKeyService.get({
          id: primaryModel.providerKeyId,
        });
        if (providerKey) {
          providerKeyInfo = {
            vendor: providerKey.vendor,
            apiKey: '', // 安全考虑
            baseUrl: providerKey.baseUrl,
          };
        }
      }

      // 更新配置回原生模式
      await this.workspaceService.updateOpenclawConfigWithProvider({
        botId: bot.id,
        userId: bot.createdById,
        hostname: bot.hostname,
        gatewayToken: bot.gatewayToken || '',
        proxyUrl,
        proxyToken: '',
        primaryModel: {
          modelId: primaryModel.modelId,
          vendor: primaryModel.vendor,
          providerKeyId: primaryModel.providerKeyId,
        },
        providerKey: providerKeyInfo,
        useZeroTrust: false, // 恢复到直接连接原生 Provider
      });

      // 尝试通过 Gateway RPC 推送热更新（如果容器正在运行）
      if (bot.port && bot.gatewayToken) {
        try {
          const reloadResult = await this.openclawGatewayService.reloadConfig(
            bot.createdById,
            bot.hostname,
            bot.port,
            bot.gatewayToken,
          );
          if (reloadResult.success) {
            this.logger.info(
              `[ProviderFallback] Hot-reloaded config for bot ${bot.hostname} on native restore`,
            );
          }
        } catch {
          // 热更新失败不影响切换结果
        }
      }

      // 更新记录
      const previousMode = this.botProviderModes.get(botId) || 'proxy';
      this.botProviderModes.set(botId, 'native');

      // 记录切换事件
      this.switchEvents.set(botId, {
        from: previousMode,
        to: 'native',
        reason: 'Manual restore',
        timestamp: new Date(),
      });

      this.logger.info(
        `[ProviderFallback] Bot ${bot.hostname} restored to native mode`,
      );

      return { success: true, message: 'Restored to native mode' };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[ProviderFallback] Failed to restore bot ${bot.hostname} to native mode`,
        { error: errorMessage },
      );
      return { success: false, message: errorMessage };
    }
  }

  /**
   * 获取 Bot 的当前 Provider 模式
   */
  getBotProviderMode(botId: string): 'native' | 'proxy' {
    return this.botProviderModes.get(botId) || 'native';
  }

  /**
   * 获取 Bot 的最近切换事件
   */
  getLastSwitchEvent(botId: string):
    | {
        from: 'native' | 'proxy';
        to: 'native' | 'proxy';
        reason: string;
        timestamp: Date;
      }
    | undefined {
    return this.switchEvents.get(botId);
  }

  /**
   * 获取所有使用 Proxy 模式的 Bot
   */
  getBotsInProxyMode(): string[] {
    const botIds: string[] = [];
    for (const [botId, mode] of this.botProviderModes) {
      if (mode === 'proxy') {
        botIds.push(botId);
      }
    }
    return botIds;
  }

  /**
   * 获取 Bot 的主模型信息（包含 vendor 和 providerKeyId）
   */
  private async getBotPrimaryModel(
    botId: string,
  ): Promise<{
    modelId: string;
    vendor: string;
    providerKeyId: string;
  } | null> {
    try {
      const { list: botModels } = await this.botModelService.list({ botId });

      // 查找主模型（isPrimary = true 或第一个模型）
      const primaryModel =
        botModels.find((m) => m.isPrimary) || botModels[0];

      if (!primaryModel) {
        return null;
      }

      // 通过 ModelAvailability 获取 vendor 和 providerKeyId
      const { list: availabilityList } =
        await this.modelAvailabilityService.list({
          model: primaryModel.modelId,
          isAvailable: true,
        });

      // 选择优先级最高的可用模型
      const bestAvailability = availabilityList.sort(
        (a, b) => b.vendorPriority - a.vendorPriority,
      )[0];

      if (!bestAvailability) {
        return null;
      }

      // 获取 Provider Key 以确定 vendor
      const providerKey = await this.providerKeyService.get({
        id: bestAvailability.providerKeyId,
      });

      if (!providerKey) {
        return null;
      }

      return {
        modelId: primaryModel.modelId,
        vendor: providerKey.vendor,
        providerKeyId: bestAvailability.providerKeyId,
      };
    } catch {
      return null;
    }
  }

  /**
   * 手动重置 Bot 的 Provider 断路器
   */
  async resetProviderCircuit(botId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    const primaryModel = await this.getBotPrimaryModel(botId);
    if (!primaryModel) {
      return { success: false, message: 'No provider key configured' };
    }

    this.circuitBreakerService.reset(primaryModel.providerKeyId);
    this.logger.info(
      `[ProviderFallback] Circuit breaker reset for bot ${botId}`,
    );

    return { success: true, message: 'Circuit breaker reset' };
  }
}
