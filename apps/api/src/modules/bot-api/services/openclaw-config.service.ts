import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  isOpenclawNativeSupported,
  getOpenclawNativeProvider,
  buildModelRef,
  getFallbackChain,
  type OpenclawNativeProviderConfig,
} from '@repo/contracts';

/**
 * Provider Key 信息（用于配置生成）
 */
export interface ProviderKeyInfo {
  vendor: string;
  apiKey: string;
  baseUrl?: string | null;
  apiType?: string;
}

/**
 * Bot 模型信息
 */
export interface BotModelInfo {
  modelId: string;
  vendor: string;
  providerKeyId: string;
}

/**
 * OpenClaw 配置生成选项
 */
export interface OpenclawConfigOptions {
  /** Bot ID */
  botId: string;
  /** 用户 ID */
  userId: string;
  /** Bot hostname */
  hostname: string;
  /** 网关 Token */
  gatewayToken: string;
  /** 代理 URL（用于 Proxy 模式） */
  proxyUrl: string;
  /** 代理 Token */
  proxyToken: string;
  /** 主模型信息 */
  primaryModel: BotModelInfo;
  /** Provider Key 信息 */
  providerKey: ProviderKeyInfo | null;
  /** 是否强制使用 Proxy 模式（完全通过 Proxy，使用 openai-compatible 格式） */
  forceProxyMode?: boolean;
  /**
   * 是否使用 Zero-Trust 模式（API Key 由 Proxy 管理，但使用原生 Provider 配置）
   * - true: 使用原生 Provider 配置（如 anthropic, zai, volcengine），但 baseUrl 指向 Proxy
   * - false: 如果支持原生且有 API Key，则直接连接 Provider API
   * 默认: false
   *
   * 这个选项优先级高于 forceProxyMode，启用时会使用 Hybrid Native 模式
   */
  useZeroTrust?: boolean;
  /**
   * 是否优先考虑统计（所有请求通过 Proxy 以便记录使用日志）
   * - true: 所有请求通过 Proxy，便于统计 token 使用情况
   * - false: 优先使用 Native 模式（性能更好），但无法统计
   * 默认: false
   */
  preferStats?: boolean;
}

/**
 * 生成的配置模式
 * - native: 直接连接 Provider API（API Key 在容器中）
 * - proxy: 使用 openai provider 通过 Proxy（仅支持 OpenAI 兼容协议）
 * - hybrid-native: 使用自定义 Provider 配置，通过 Proxy 转发但保持原生 API 协议
 */
export type ProviderMode = 'native' | 'proxy' | 'hybrid-native';

/**
 * OpenClaw 配置生成结果
 */
export interface OpenclawConfigResult {
  /** 配置内容 */
  config: Record<string, unknown>;
  /** 使用的模式 */
  mode: ProviderMode;
  /** 模型引用 */
  modelRef: string;
  /** Fallback chain */
  fallbacks: string[];
  /** OpenClaw Provider ID（如果是原生模式） */
  openclawProviderId?: string;
}

/**
 * OpenClaw 配置服务
 *
 * 负责生成 OpenClaw 的配置文件，支持两种模式：
 * 1. Native 模式：使用 OpenClaw 原生支持的 Provider
 * 2. Proxy 模式：通过 clawbot-manager proxy 转发请求
 */
@Injectable()
export class OpenclawConfigService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  /**
   * 生成 OpenClaw 配置
   *
   * 模式选择优先级：
   * 1. useZeroTrust=true + 支持 Native → Hybrid-Native 模式（原生 API 协议，通过 Proxy 转发）
   * 2. forceProxyMode=true → Proxy 模式（完全通过 Proxy，使用 openai-compatible 格式）
   * 3. preferStats=true → Proxy 模式（所有请求通过 Proxy 以便统计）
   * 4. 支持 Native 且有 API Key → Native 模式（直接连接 Provider API）
   * 5. 否则 → Proxy 模式
   */
  buildOpenclawConfig(options: OpenclawConfigOptions): OpenclawConfigResult {
    const {
      primaryModel,
      providerKey,
      forceProxyMode,
      useZeroTrust,
      preferStats,
      proxyUrl,
      proxyToken,
      gatewayToken,
    } = options;

    const nativeConfig = getOpenclawNativeProvider(primaryModel.vendor);
    const supportsNative = nativeConfig !== null;

    // 模式选择逻辑
    if (useZeroTrust && supportsNative && proxyToken) {
      // Hybrid-Native 模式：使用原生 API 协议，通过 Proxy 转发
      // 优点：保持原生协议（如 anthropic-messages），同时 API Key 由 Proxy 管理
      this.logger.info(
        `[OpenClaw Config] Using hybrid-native mode for model ${primaryModel.modelId} (vendor: ${primaryModel.vendor})`,
      );
      return this.buildHybridNativeConfig(
        primaryModel,
        nativeConfig,
        proxyUrl,
        proxyToken,
        gatewayToken,
      );
    } else if (forceProxyMode || preferStats || !supportsNative) {
      // Proxy 模式：完全通过 Proxy，使用 openai-compatible 格式
      const reason = forceProxyMode
        ? 'forceProxyMode'
        : preferStats
          ? 'preferStats'
          : 'unsupported vendor';
      this.logger.info(
        `[OpenClaw Config] Using proxy mode for model ${primaryModel.modelId}, reason: ${reason}`,
      );
      return this.buildProxyConfig(
        primaryModel,
        proxyUrl,
        proxyToken,
        gatewayToken,
      );
    } else if (providerKey) {
      // Native 模式：直接连接 Provider API
      this.logger.info(
        `[OpenClaw Config] Using native mode for model ${primaryModel.modelId}`,
      );
      return this.buildNativeConfig(
        primaryModel,
        providerKey,
        gatewayToken,
        options,
      );
    } else {
      // Fallback to Proxy
      this.logger.info(
        `[OpenClaw Config] Fallback to proxy mode for model ${primaryModel.modelId}, reason: no API key`,
      );
      return this.buildProxyConfig(
        primaryModel,
        proxyUrl,
        proxyToken,
        gatewayToken,
      );
    }
  }

  /**
   * 构建 Hybrid-Native Provider 配置
   *
   * 使用原生 API 协议（如 anthropic-messages），但通过 Proxy 转发请求。
   * 这样可以在 Zero-Trust 模式下保持原生协议的优势，同时由 Proxy 管理 API Key。
   *
   * Fallback 策略：
   * - Primary: 使用原生 API 协议通过 Proxy（如 anthropic-messages）
   * - Fallback: 如果原生协议失败，使用 OpenAI 兼容格式通过 Proxy
   *
   * 配置模式：
   * - 定义两个 provider：
   *   1. proxy-{native} - 使用原生 API 协议
   *   2. proxy-openai-compatible - 使用 OpenAI 兼容格式
   * - Model fallback chain 从原生 provider 切换到兼容 provider
   */
  private buildHybridNativeConfig(
    model: BotModelInfo,
    nativeConfig: OpenclawNativeProviderConfig,
    proxyUrl: string,
    proxyToken: string,
    gatewayToken: string,
  ): OpenclawConfigResult {
    // 构建 proxy provider ID（如 proxy-anthropic, proxy-zai）
    const nativeProviderId = `proxy-${nativeConfig.openclawProviderId}`;

    // 构建 OpenAI 兼容的 fallback provider
    const compatibleProviderId = 'proxy-openai-compatible';

    // 构建模型引用（使用原生 provider）
    const modelRef = `${nativeProviderId}/${model.modelId}`;

    // 构建 Fallback chain（使用兼容 provider）
    // 原生 fallback chain 中的模型需要转换为兼容 provider 的引用
    const originalFallbacks = getFallbackChain(model.modelId);
    const fallbacks = originalFallbacks.map((f) => {
      // 将原生 provider 引用转换为兼容 provider 引用
      // 例如: anthropic/claude-sonnet-4-5 → proxy-openai-compatible/claude-sonnet-4-5
      const parts = f.split('/');
      if (parts.length === 2) {
        return `${compatibleProviderId}/${parts[1]}`;
      }
      return f;
    });

    // 构建 Proxy endpoint URL
    // 原生协议端点: ${proxyUrl}/v1/${nativeProviderId}
    // 兼容协议端点: ${proxyUrl}/v1/openai-compatible
    const proxyEndpoint = proxyUrl ? proxyUrl.replace(/\/$/, '') : '';
    const nativeProxyEndpoint = `${proxyEndpoint}/v1/${nativeConfig.openclawProviderId}`;
    const compatibleProxyEndpoint = `${proxyEndpoint}/v1/openai-compatible`;

    this.logger.info(
      `[OpenClaw Config] Building hybrid-native config: primary=${nativeProviderId}, fallback=${compatibleProviderId}, api=${nativeConfig.apiType}`,
    );

    const config: Record<string, unknown> = {
      // 元数据
      meta: {
        lastTouchedVersion: '2026.2.3',
        lastTouchedAt: new Date().toISOString(),
      },

      // 模型配置 - 双 provider 模式
      models: {
        mode: 'merge',
        providers: {
          // 原生协议 Provider（Primary）
          [nativeProviderId]: {
            baseUrl: nativeProxyEndpoint,
            apiKey: proxyToken,
            api: nativeConfig.apiType,
            models: [
              {
                id: model.modelId,
                name: model.modelId,
                reasoning: nativeConfig.requiresTransformation,
                input: ['text', 'image'],
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                contextWindow: 200000,
                maxTokens: 8192,
              },
            ],
          },
          // OpenAI 兼容 Provider（Fallback）
          [compatibleProviderId]: {
            baseUrl: compatibleProxyEndpoint,
            apiKey: proxyToken,
            api: 'openai-completions',
            models: [
              {
                id: model.modelId,
                name: `${model.modelId} (compatible)`,
                reasoning: false,
                input: ['text', 'image'],
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                contextWindow: 200000,
                maxTokens: 8192,
              },
              // 添加 fallback 模型
              ...originalFallbacks.map((f) => {
                const parts = f.split('/');
                const modelId = parts.length === 2 ? parts[1] : f;
                return {
                  id: modelId,
                  name: `${modelId} (compatible)`,
                  reasoning: false,
                  input: ['text', 'image'],
                  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                  contextWindow: 200000,
                  maxTokens: 8192,
                };
              }),
            ],
          },
        },
      },

      // Agent 配置
      agents: {
        defaults: {
          workspace: '/app/workspace',
          maxConcurrent: 4,
          subagents: {
            maxConcurrent: 8,
          },
          model: {
            primary: modelRef,
            fallbacks: fallbacks,
          },
          models: {
            [modelRef]: {},
          },
        },
      },

      // 消息配置
      messages: {
        ackReactionScope: 'group-mentions',
      },

      // 命令配置
      commands: {
        native: 'auto',
        nativeSkills: 'auto',
      },

      // 网关配置
      gateway: {
        port: 19000,
        mode: 'local',
        bind: 'lan',
        controlUi: {
          enabled: true,
          allowInsecureAuth: true,
        },
        auth: {
          mode: 'token',
          token: gatewayToken,
        },
      },
    };

    return {
      config,
      mode: 'hybrid-native',
      modelRef,
      fallbacks,
      openclawProviderId: nativeProviderId,
    };
  }

  /**
   * 构建 Native Provider 配置
   */
  private buildNativeConfig(
    model: BotModelInfo,
    providerKey: ProviderKeyInfo,
    gatewayToken: string,
    options: OpenclawConfigOptions,
  ): OpenclawConfigResult {
    const nativeConfig = getOpenclawNativeProvider(providerKey.vendor);
    if (!nativeConfig) {
      // Fallback to proxy mode
      return this.buildProxyConfig(
        model,
        options.proxyUrl,
        options.proxyToken,
        gatewayToken,
      );
    }

    const modelRef = buildModelRef(providerKey.vendor, model.modelId);
    const fallbacks = getFallbackChain(model.modelId);

    this.logger.info(
      `[OpenClaw Config] Using native provider: ${nativeConfig.openclawProviderId} for model ${model.modelId}`,
    );

    const config: Record<string, unknown> = {
      // 元数据
      meta: {
        lastTouchedVersion: '2026.2.3',
        lastTouchedAt: new Date().toISOString(),
      },

      // 环境变量 - API Key
      env: this.buildEnvConfig(nativeConfig, providerKey),

      // 模型配置
      models: {
        providers: this.buildProvidersConfig(nativeConfig, providerKey),
      },

      // Agent 配置
      agents: {
        defaults: {
          workspace: '/app/workspace',
          maxConcurrent: 4,
          subagents: {
            maxConcurrent: 8,
          },
          model: {
            primary: modelRef,
            fallbacks: fallbacks,
          },
          models: {
            [modelRef]: {},
          },
        },
      },

      // 消息配置
      messages: {
        ackReactionScope: 'group-mentions',
      },

      // 命令配置
      commands: {
        native: 'auto',
        nativeSkills: 'auto',
      },

      // 网关配置
      gateway: {
        port: 19000,
        mode: 'local',
        bind: 'lan',
        controlUi: {
          enabled: true,
          allowInsecureAuth: true,
        },
        auth: {
          mode: 'token',
          token: gatewayToken,
        },
      },
    };

    return {
      config,
      mode: 'native',
      modelRef,
      fallbacks,
      openclawProviderId: nativeConfig.openclawProviderId,
    };
  }

  /**
   * 构建 Proxy 模式配置
   */
  private buildProxyConfig(
    model: BotModelInfo,
    proxyUrl: string,
    proxyToken: string,
    gatewayToken: string,
  ): OpenclawConfigResult {
    // Proxy 模式下使用 openai provider 通过 proxy
    const modelRef = `openai/${model.modelId}`;
    const fallbacks = getFallbackChain(model.modelId);

    this.logger.info(
      `[OpenClaw Config] Using proxy mode for model ${model.modelId}`,
    );

    // 构建完整的 Proxy endpoint URL
    // 格式: ${proxyUrl}/v1/openai-compatible
    // OpenClaw 会将请求发送到这个 URL
    const proxyEndpoint = proxyUrl
      ? `${proxyUrl.replace(/\/$/, '')}/v1/openai-compatible`
      : '';

    const config: Record<string, unknown> = {
      // 元数据
      meta: {
        lastTouchedVersion: '2026.2.3',
        lastTouchedAt: new Date().toISOString(),
      },

      // 模型配置 - 通过 proxy
      models: {
        providers: {
          openai: {
            baseUrl: proxyEndpoint,
            apiKey: proxyToken,
            api: 'openai-completions',
            models: [],
          },
        },
      },

      // Agent 配置
      agents: {
        defaults: {
          workspace: '/app/workspace',
          maxConcurrent: 4,
          subagents: {
            maxConcurrent: 8,
          },
          model: {
            primary: modelRef,
            // Proxy 模式下也支持 Fallback（通过 Proxy 的 auto-routing）
            fallbacks: fallbacks,
          },
          models: {
            [modelRef]: {},
          },
        },
      },

      // 消息配置
      messages: {
        ackReactionScope: 'group-mentions',
      },

      // 命令配置
      commands: {
        native: 'auto',
        nativeSkills: 'auto',
      },

      // 网关配置
      gateway: {
        port: 19000,
        mode: 'local',
        bind: 'lan',
        controlUi: {
          enabled: true,
          allowInsecureAuth: true,
        },
        auth: {
          mode: 'token',
          token: gatewayToken,
        },
      },
    };

    return {
      config,
      mode: 'proxy',
      modelRef,
      fallbacks,
    };
  }

  /**
   * 构建环境变量配置
   */
  private buildEnvConfig(
    nativeConfig: OpenclawNativeProviderConfig,
    providerKey: ProviderKeyInfo,
  ): Record<string, string> {
    const env: Record<string, string> = {};

    // 添加 API Key 环境变量
    if (nativeConfig.envVar && providerKey.apiKey) {
      env[nativeConfig.envVar] = providerKey.apiKey;
    }

    return env;
  }

  /**
   * 构建 Providers 配置
   */
  private buildProvidersConfig(
    nativeConfig: OpenclawNativeProviderConfig,
    providerKey: ProviderKeyInfo,
  ): Record<string, unknown> {
    const providers: Record<string, unknown> = {};

    providers[nativeConfig.openclawProviderId] = {
      api: nativeConfig.apiType,
    };

    // 如果有自定义 baseUrl
    if (providerKey.baseUrl) {
      providers[nativeConfig.openclawProviderId] = {
        ...providers[nativeConfig.openclawProviderId] as object,
        baseUrl: providerKey.baseUrl,
      };
    }

    return providers;
  }

  /**
   * 获取 Provider 模式
   */
  getProviderMode(
    vendor: string,
    hasApiKey: boolean,
    forceProxyMode: boolean = false,
  ): ProviderMode {
    if (forceProxyMode) {
      return 'proxy';
    }

    if (!hasApiKey) {
      return 'proxy';
    }

    return isOpenclawNativeSupported(vendor) ? 'native' : 'proxy';
  }

  /**
   * 写入配置到文件
   */
  async writeConfigFile(
    openclawDir: string,
    config: Record<string, unknown>,
  ): Promise<string> {
    const configPath = path.join(openclawDir, 'openclaw.json');

    // 确保目录存在
    await fs.mkdir(openclawDir, { recursive: true });

    // 写入配置（格式化 JSON）
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

    this.logger.info(`[OpenClaw Config] Configuration written to ${configPath}`);

    return configPath;
  }

  /**
   * 读取现有配置
   */
  async readConfigFile(openclawDir: string): Promise<Record<string, unknown> | null> {
    const configPath = path.join(openclawDir, 'openclaw.json');

    try {
      const content = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * 更新配置（部分更新）
   */
  async updateConfig(
    openclawDir: string,
    updates: Record<string, unknown>,
  ): Promise<void> {
    const existingConfig = await this.readConfigFile(openclawDir);
    const newConfig = { ...existingConfig, ...updates };
    await this.writeConfigFile(openclawDir, newConfig);
  }
}
