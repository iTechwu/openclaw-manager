import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import type { ContainerSkillItem } from '@repo/contracts';

export interface FeishuChannelConfig {
  appId: string;
  appSecret: string;
  domain?: 'feishu' | 'lark';
  dmPolicy?: 'pairing' | 'allowlist' | 'open' | 'disabled';
  allowFrom?: string[];
  requireMention?: boolean;
  replyInThread?: boolean;
  showTyping?: boolean;
  enabled?: boolean;
}

export interface BotChannelConfig {
  channelType: string;
  accountId?: string;
  credentials: Record<string, string>;
  config?: Record<string, unknown>;
  isEnabled: boolean;
}

export interface BotWorkspaceConfig {
  hostname: string;
  userId: string;
  name: string;
  aiProvider: string;
  model: string;
  channelType: string;
  persona: {
    name: string;
    soulMarkdown: string;
    emoji?: string;
    avatarUrl?: string;
  };
  features: {
    commands: boolean;
    tts: boolean;
    ttsVoice?: string;
    sandbox: boolean;
    sandboxTimeout?: number;
    sessionScope: 'user' | 'channel' | 'global';
  };
  // 新增：通道配置列表（用于生成 openclaw.json）
  channels?: BotChannelConfig[];
  // OpenClaw 网关 token（用于生成 openclaw.json）
  gatewayToken?: string;
}

@Injectable()
export class WorkspaceService {
  private readonly dataDir: string;
  private readonly secretsDir: string;
  private readonly openclawDir: string;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly configService: ConfigService,
  ) {
    const dataDir = process.env.BOT_DATA_DIR || '/data/bots';
    const secretsDir = process.env.BOT_SECRETS_DIR || '/data/secrets';
    const openclawDir = process.env.BOT_OPENCLAW_DIR || '/data/openclaw';

    // 确保始终使用绝对路径，避免 Docker 将其当作 volume 名称解析
    this.dataDir = path.isAbsolute(dataDir)
      ? dataDir
      : path.join(process.cwd(), dataDir);
    this.secretsDir = path.isAbsolute(secretsDir)
      ? secretsDir
      : path.join(process.cwd(), secretsDir);
    this.openclawDir = path.isAbsolute(openclawDir)
      ? openclawDir
      : path.join(process.cwd(), openclawDir);
  }

  /**
   * 生成用户隔离的唯一标识符
   * 使用 userId 前8位 + hostname 确保不同用户的 bot 不会冲突
   */
  private getIsolationKey(userId: string, hostname: string): string {
    return `${userId.slice(0, 8)}-${hostname}`;
  }

  /**
   * 构建飞书通道配置（用于 openclaw.json）
   * 将 BotChannel 数据转换为 OpenClaw feishu 扩展所需的格式
   *
   * OpenClaw 期望的格式：
   * {
   *   channels: {
   *     feishu: {
   *       enabled: true,
   *       accounts: {
   *         default: { appId, appSecret, domain, dmPolicy, ... }
   *       }
   *     }
   *   }
   * }
   */
  private buildFeishuChannelConfig(
    channels: BotChannelConfig[],
  ): Record<string, FeishuChannelConfig> {
    const feishuChannels = channels.filter((c) => c.channelType === 'feishu');
    if (feishuChannels.length === 0) {
      return {};
    }

    const config: Record<string, FeishuChannelConfig> = {};

    for (const channel of feishuChannels) {
      const accountId = channel.accountId || 'default';
      const credentials = channel.credentials;
      const channelConfig = channel.config || {};

      config[accountId] = {
        appId: credentials.appId || '',
        appSecret: credentials.appSecret || '',
        domain: (channelConfig.domain as 'feishu' | 'lark') || 'feishu',
        dmPolicy:
          (channelConfig.dmPolicy as FeishuChannelConfig['dmPolicy']) ||
          'pairing',
        allowFrom: (channelConfig.allowFrom as string[]) || [],
        requireMention: (channelConfig.requireMention as boolean) ?? true,
        replyInThread: (channelConfig.replyInThread as boolean) ?? false,
        showTyping: (channelConfig.showTyping as boolean) ?? true,
        enabled: channel.isEnabled,
      };
    }

    return config;
  }

  /**
   * 构建完整的飞书配置（包含 accounts 层级）
   * 符合 OpenClaw 的 FeishuConfig 类型定义
   */
  private buildFeishuFullConfig(
    channels: BotChannelConfig[],
  ): Record<string, unknown> {
    const accounts = this.buildFeishuChannelConfig(channels);
    if (Object.keys(accounts).length === 0) {
      return {};
    }

    return {
      enabled: true,
      accounts,
    };
  }

  /**
   * 构建 openclaw.json 配置
   * 包含 AI 模型配置和通道配置
   */
  private buildOpenclawConfig(
    config: BotWorkspaceConfig,
  ): Record<string, unknown> {
    const openclawConfig: Record<string, unknown> = {
      // AI 模型配置
      model: {
        provider: config.aiProvider,
        model: config.model,
      },
    };

    // 网关配置（如果提供了 token）
    if (config.gatewayToken) {
      openclawConfig.gateway = {
        port: 18789,
        auth: {
          mode: 'token',
          token: config.gatewayToken,
        },
      };
    }

    // 通道配置
    if (config.channels && config.channels.length > 0) {
      const channelsConfig: Record<string, unknown> = {};

      // 飞书通道配置 - 使用符合 OpenClaw 格式的 accounts 结构
      const feishuConfig = this.buildFeishuFullConfig(config.channels);
      if (Object.keys(feishuConfig).length > 0) {
        channelsConfig.feishu = feishuConfig;
      }
      openclawConfig.channels = channelsConfig;
    }

    return openclawConfig;
  }

  /**
   * Create workspace directory for a bot
   * If workspace already exists (e.g., from a previously deleted bot), it will be cleaned first
   */
  async createWorkspace(config: BotWorkspaceConfig): Promise<string> {
    const isolationKey = this.getIsolationKey(config.userId, config.hostname);
    const workspacePath = path.join(this.dataDir, isolationKey);
    const botSecretsPath = path.join(this.secretsDir, isolationKey);
    const openclawPath = path.join(this.openclawDir, isolationKey);

    try {
      // Clean up any existing workspace/secrets from previously deleted bot
      // This ensures a fresh start when reusing a hostname
      const workspaceExists = await this.workspaceExistsByKey(isolationKey);
      if (workspaceExists) {
        this.logger.info(`Cleaning up existing workspace for: ${isolationKey}`);
        await fs.rm(workspacePath, { recursive: true, force: true });
        await fs.rm(botSecretsPath, { recursive: true, force: true });
        // Note: We don't clean up openclawPath here as it may contain valuable data
        // OpenClaw data is only cleaned up when the bot is explicitly deleted
      }

      // Create workspace directory
      await fs.mkdir(workspacePath, { recursive: true });

      // Create config file
      const configPath = path.join(workspacePath, 'config.json');
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));

      // Create persona file (soul.md)
      const soulPath = path.join(workspacePath, 'soul.md');
      await fs.writeFile(soulPath, config.persona.soulMarkdown);

      // Create features config
      const featuresPath = path.join(workspacePath, 'features.json');
      await fs.writeFile(
        featuresPath,
        JSON.stringify(config.features, null, 2),
      );

      // Create secrets directory for this bot
      await fs.mkdir(botSecretsPath, { recursive: true });

      // Create OpenClaw data directory for this bot (for persistent memory/sessions)
      await fs.mkdir(openclawPath, { recursive: true });

      // Create openclaw.json configuration (if channels or gatewayToken provided)
      if (config.channels?.length || config.gatewayToken) {
        const openclawConfig = this.buildOpenclawConfig(config);
        const openclawConfigPath = path.join(openclawPath, 'openclaw.json');
        await fs.writeFile(
          openclawConfigPath,
          JSON.stringify(openclawConfig, null, 2),
        );
        this.logger.info(
          `OpenClaw config created for bot: ${isolationKey}`,
          openclawConfig,
        );
      }

      this.logger.info(`Workspace created for bot: ${isolationKey}`);
      return workspacePath;
    } catch (error) {
      this.logger.error(
        `Failed to create workspace for ${isolationKey}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Update workspace configuration
   */
  async updateWorkspace(
    userId: string,
    hostname: string,
    config: Partial<BotWorkspaceConfig>,
  ): Promise<void> {
    const isolationKey = this.getIsolationKey(userId, hostname);
    const workspacePath = path.join(this.dataDir, isolationKey);
    const configPath = path.join(workspacePath, 'config.json');

    try {
      // Read existing config
      const existingConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));

      // Merge with new config
      const updatedConfig = { ...existingConfig, ...config };

      // Write updated config
      await fs.writeFile(configPath, JSON.stringify(updatedConfig, null, 2));

      // Update soul.md if persona changed
      if (config.persona?.soulMarkdown) {
        const soulPath = path.join(workspacePath, 'soul.md');
        await fs.writeFile(soulPath, config.persona.soulMarkdown);
      }

      // Update features if changed
      if (config.features) {
        const featuresPath = path.join(workspacePath, 'features.json');
        await fs.writeFile(
          featuresPath,
          JSON.stringify(config.features, null, 2),
        );
      }

      this.logger.info(`Workspace updated for bot: ${isolationKey}`);
    } catch (error) {
      this.logger.error(
        `Failed to update workspace for ${isolationKey}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Delete workspace directory
   * This also deletes OpenClaw data (memory, sessions, etc.)
   */
  async deleteWorkspace(userId: string, hostname: string): Promise<void> {
    const isolationKey = this.getIsolationKey(userId, hostname);
    const workspacePath = path.join(this.dataDir, isolationKey);
    const botSecretsPath = path.join(this.secretsDir, isolationKey);
    const openclawPath = path.join(this.openclawDir, isolationKey);

    try {
      // Remove workspace directory
      await fs.rm(workspacePath, { recursive: true, force: true });

      // Remove secrets directory
      await fs.rm(botSecretsPath, { recursive: true, force: true });

      // Remove OpenClaw data directory (memory, sessions, etc.)
      await fs.rm(openclawPath, { recursive: true, force: true });

      this.logger.info(
        `Workspace deleted for bot: ${isolationKey} (including OpenClaw data)`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to delete workspace for ${isolationKey}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Check if workspace exists by isolation key (internal)
   */
  private async workspaceExistsByKey(isolationKey: string): Promise<boolean> {
    const workspacePath = path.join(this.dataDir, isolationKey);
    try {
      await fs.access(workspacePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 更新 OpenClaw 配置中的飞书通道
   * 当通道被创建/更新/删除时调用
   *
   * OpenClaw 期望的格式：
   * {
   *   channels: {
   *     feishu: {
   *       enabled: true,
   *       accounts: {
   *         default: { appId, appSecret, domain, dmPolicy, ... }
   *       }
   *     }
   *   }
   * }
   */
  async updateFeishuChannelConfig(
    userId: string,
    hostname: string,
    channel: BotChannelConfig,
  ): Promise<void> {
    const isolationKey = this.getIsolationKey(userId, hostname);
    const openclawPath = path.join(this.openclawDir, isolationKey);
    const configPath = path.join(openclawPath, 'openclaw.json');

    try {
      // 确保目录存在
      await fs.mkdir(openclawPath, { recursive: true });

      // 读取现有配置
      let existingConfig: Record<string, unknown> = {};
      try {
        const configContent = await fs.readFile(configPath, 'utf-8');
        existingConfig = JSON.parse(configContent);
      } catch {
        // 配置文件不存在，使用空对象
      }

      // 确保 channels.feishu.accounts 结构存在
      const channels =
        (existingConfig.channels as Record<string, unknown>) || {};
      const feishuConfig =
        (channels.feishu as Record<string, unknown>) || {};
      const feishuAccounts =
        (feishuConfig.accounts as Record<string, FeishuChannelConfig>) || {};

      // 构建单个账户的飞书配置
      const accountConfig = this.buildFeishuChannelConfig([channel]);
      const accountId = channel.accountId || 'default';

      // 更新指定账户的配置
      feishuAccounts[accountId] = accountConfig[accountId];

      // 更新配置 - 使用正确的 accounts 结构
      existingConfig.channels = {
        ...channels,
        feishu: {
          ...feishuConfig,
          enabled: true,
          accounts: feishuAccounts,
        },
      };

      // 写入配置
      await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2));

      this.logger.info(`Updated feishu channel config for: ${isolationKey}`, {
        accountId,
        channelType: channel.channelType,
      });
    } catch (error) {
      this.logger.error(
        `Failed to update feishu channel config for ${isolationKey}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * 从 OpenClaw 配置中删除飞书通道
   * 使用正确的 accounts 结构
   */
  async removeFeishuChannelConfig(
    userId: string,
    hostname: string,
    accountId?: string,
  ): Promise<void> {
    const isolationKey = this.getIsolationKey(userId, hostname);
    const openclawPath = path.join(this.openclawDir, isolationKey);
    const configPath = path.join(openclawPath, 'openclaw.json');

    try {
      // 读取现有配置
      const configContent = await fs.readFile(configPath, 'utf-8');
      const existingConfig = JSON.parse(configContent) as Record<
        string,
        unknown
      >;

      const channels = existingConfig.channels as
        | Record<string, unknown>
        | undefined;
      if (!channels?.feishu) {
        return; // 没有飞书配置，无需删除
      }

      const feishuConfig = channels.feishu as Record<string, unknown>;
      const feishuAccounts = feishuConfig.accounts as
        | Record<string, unknown>
        | undefined;
      if (!feishuAccounts) {
        return; // 没有 accounts 配置，无需删除
      }

      const targetAccountId = accountId || 'default';

      if (feishuAccounts[targetAccountId]) {
        delete feishuAccounts[targetAccountId];

        // 如果没有其他账户，删除整个 feishu 配置
        if (Object.keys(feishuAccounts).length === 0) {
          delete channels.feishu;
        }

        // 写入更新后的配置
        await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2));

        this.logger.info(`Removed feishu channel config for: ${isolationKey}`, {
          accountId: targetAccountId,
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to remove feishu channel config for ${isolationKey}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * 同步所有飞书通道配置到 openclaw.json
   * 用于数据迁移或批量更新
   * 使用正确的 accounts 结构
   */
  async syncFeishuChannelsConfig(
    userId: string,
    hostname: string,
    channels: BotChannelConfig[],
  ): Promise<void> {
    const isolationKey = this.getIsolationKey(userId, hostname);
    const openclawPath = path.join(this.openclawDir, isolationKey);
    const configPath = path.join(openclawPath, 'openclaw.json');

    try {
      // 确保目录存在
      await fs.mkdir(openclawPath, { recursive: true });

      // 读取现有配置
      let existingConfig: Record<string, unknown> = {};
      try {
        const configContent = await fs.readFile(configPath, 'utf-8');
        existingConfig = JSON.parse(configContent);
      } catch {
        // 配置文件不存在，使用空对象
      }

      // 构建飞书配置 - 使用符合 OpenClaw 格式的 accounts 结构
      const feishuFullConfig = this.buildFeishuFullConfig(channels);

      // 更新配置
      const channelsConfig =
        (existingConfig.channels as Record<string, unknown>) || {};
      existingConfig.channels = {
        ...channelsConfig,
        feishu: feishuFullConfig,
      };

      // 写入配置
      await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2));

      const accounts = feishuFullConfig.accounts as Record<string, unknown>;
      this.logger.info(`Synced feishu channels config for: ${isolationKey}`, {
        accountCount: accounts ? Object.keys(accounts).length : 0,
      });
    } catch (error) {
      this.logger.error(
        `Failed to sync feishu channels config for ${isolationKey}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Check if workspace exists
   */
  async workspaceExists(userId: string, hostname: string): Promise<boolean> {
    const isolationKey = this.getIsolationKey(userId, hostname);
    return this.workspaceExistsByKey(isolationKey);
  }

  /**
   * Get workspace path
   */
  getWorkspacePath(userId: string, hostname: string): string {
    const isolationKey = this.getIsolationKey(userId, hostname);
    return path.join(this.dataDir, isolationKey);
  }

  /**
   * Get isolation key for a user's bot (for Docker service)
   */
  getIsolationKeyForBot(userId: string, hostname: string): string {
    return this.getIsolationKey(userId, hostname);
  }

  /**
   * Get OpenClaw data path for a bot
   * This directory stores persistent data like memory, sessions, agents config
   */
  getOpenclawPath(userId: string, hostname: string): string {
    const isolationKey = this.getIsolationKey(userId, hostname);
    return path.join(this.openclawDir, isolationKey);
  }

  /**
   * Get skills directory path for a bot: ${openclawDir}/{isolationKey}/skills/
   * This path is mounted into the container at /home/node/.openclaw/skills/
   */
  getSkillsPath(userId: string, hostname: string): string {
    const openclawPath = this.getOpenclawPath(userId, hostname);
    return path.join(openclawPath, 'skills');
  }

  /**
   * Ensure OpenClaw data directory exists for a bot
   * Called before container creation to ensure the mount point exists
   */
  async ensureOpenclawDir(userId: string, hostname: string): Promise<string> {
    const openclawPath = this.getOpenclawPath(userId, hostname);
    await fs.mkdir(openclawPath, { recursive: true });
    return openclawPath;
  }

  /**
   * Write API key to secrets directory
   */
  async writeApiKey(
    userId: string,
    hostname: string,
    vendor: string,
    apiKey: string,
  ): Promise<void> {
    const isolationKey = this.getIsolationKey(userId, hostname);
    const botSecretsPath = path.join(this.secretsDir, isolationKey);
    const keyPath = path.join(botSecretsPath, `${vendor}.key`);

    try {
      await fs.mkdir(botSecretsPath, { recursive: true });
      await fs.writeFile(keyPath, apiKey, { mode: 0o600 });
      this.logger.info(`API key written for ${isolationKey}/${vendor}`);
    } catch (error) {
      this.logger.error(
        `Failed to write API key for ${isolationKey}/${vendor}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Remove API key from secrets directory
   */
  async removeApiKey(
    userId: string,
    hostname: string,
    vendor: string,
  ): Promise<void> {
    const isolationKey = this.getIsolationKey(userId, hostname);
    const keyPath = path.join(this.secretsDir, isolationKey, `${vendor}.key`);

    try {
      await fs.unlink(keyPath);
      this.logger.info(`API key removed for ${isolationKey}/${vendor}`);
    } catch {
      // Ignore if file doesn't exist
    }
  }

  /**
   * List all workspaces
   */
  async listWorkspaces(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.dataDir, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return [];
    }
  }

  /**
   * Find orphaned workspaces (workspaces without corresponding database entries)
   * @param knownIsolationKeys - isolation keys (userId_short-hostname) of known bots
   */
  async findOrphanedWorkspaces(
    knownIsolationKeys: string[],
  ): Promise<string[]> {
    const workspaces = await this.listWorkspaces();
    return workspaces.filter((w) => !knownIsolationKeys.includes(w));
  }

  /**
   * Find orphaned secrets directories
   * @param knownIsolationKeys - isolation keys (userId_short-hostname) of known bots
   */
  async findOrphanedSecrets(knownIsolationKeys: string[]): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.secretsDir, {
        withFileTypes: true,
      });
      const secretDirs = entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
      return secretDirs.filter((s) => !knownIsolationKeys.includes(s));
    } catch {
      return [];
    }
  }

  /**
   * List all workspace isolation keys
   * Used by ReconciliationService for orphan detection
   */
  async listWorkspaceIsolationKeys(): Promise<string[]> {
    return this.listWorkspaces();
  }

  /**
   * List all secret directory isolation keys
   * Used by ReconciliationService for orphan detection
   */
  async listSecretIsolationKeys(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.secretsDir, {
        withFileTypes: true,
      });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return [];
    }
  }

  /**
   * Delete secrets directory for a bot
   * Used by ReconciliationService for cleanup
   */
  async deleteSecrets(userId: string, hostname: string): Promise<void> {
    const isolationKey = this.getIsolationKey(userId, hostname);
    const botSecretsPath = path.join(this.secretsDir, isolationKey);
    try {
      await fs.rm(botSecretsPath, { recursive: true, force: true });
      this.logger.info(`Secrets deleted for bot: ${isolationKey}`);
    } catch (error) {
      this.logger.error(`Failed to delete secrets for ${isolationKey}:`, error);
      throw error;
    }
  }

  /**
   * Delete secrets directory by isolation key (for orphan cleanup)
   */
  async deleteSecretsByKey(isolationKey: string): Promise<void> {
    const botSecretsPath = path.join(this.secretsDir, isolationKey);
    try {
      await fs.rm(botSecretsPath, { recursive: true, force: true });
      this.logger.info(`Secrets deleted for: ${isolationKey}`);
    } catch (error) {
      this.logger.error(`Failed to delete secrets for ${isolationKey}:`, error);
      throw error;
    }
  }

  /**
   * Delete workspace directory by isolation key (for orphan cleanup)
   * Also deletes OpenClaw data
   */
  async deleteWorkspaceByKey(isolationKey: string): Promise<void> {
    const workspacePath = path.join(this.dataDir, isolationKey);
    const botSecretsPath = path.join(this.secretsDir, isolationKey);
    const openclawPath = path.join(this.openclawDir, isolationKey);
    try {
      await fs.rm(workspacePath, { recursive: true, force: true });
      await fs.rm(botSecretsPath, { recursive: true, force: true });
      await fs.rm(openclawPath, { recursive: true, force: true });
      this.logger.info(
        `Workspace deleted for: ${isolationKey} (including OpenClaw data)`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to delete workspace for ${isolationKey}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Write a secret file for a bot
   * Used for channel tokens and other secrets
   */
  async writeSecret(
    userId: string,
    hostname: string,
    name: string,
    value: string,
  ): Promise<void> {
    const isolationKey = this.getIsolationKey(userId, hostname);
    const botSecretsPath = path.join(this.secretsDir, isolationKey);
    const secretPath = path.join(botSecretsPath, name);

    try {
      await fs.mkdir(botSecretsPath, { recursive: true });
      await fs.writeFile(secretPath, value, { mode: 0o600 });
      this.logger.info(`Secret written for ${isolationKey}/${name}`);
    } catch (error) {
      this.logger.error(
        `Failed to write secret for ${isolationKey}/${name}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Read a secret file for a bot
   */
  async readSecret(
    userId: string,
    hostname: string,
    name: string,
  ): Promise<string | null> {
    const isolationKey = this.getIsolationKey(userId, hostname);
    const secretPath = path.join(this.secretsDir, isolationKey, name);
    try {
      return await fs.readFile(secretPath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * List all OpenClaw data directories
   */
  async listOpenclawDirs(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.openclawDir, {
        withFileTypes: true,
      });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return [];
    }
  }

  /**
   * Find orphaned OpenClaw data directories
   * @param knownIsolationKeys - isolation keys (userId_short-hostname) of known bots
   */
  async findOrphanedOpenclaw(knownIsolationKeys: string[]): Promise<string[]> {
    const openclawDirs = await this.listOpenclawDirs();
    return openclawDirs.filter((d) => !knownIsolationKeys.includes(d));
  }

  /**
   * Delete OpenClaw data directory by isolation key (for orphan cleanup)
   */
  async deleteOpenclawByKey(isolationKey: string): Promise<void> {
    const openclawPath = path.join(this.openclawDir, isolationKey);
    try {
      await fs.rm(openclawPath, { recursive: true, force: true });
      this.logger.info(`OpenClaw data deleted for: ${isolationKey}`);
    } catch (error) {
      this.logger.error(
        `Failed to delete OpenClaw data for ${isolationKey}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * 持久化容器内置技能到文件系统
   * 同时将每个技能的 SKILL.md 内容存为独立文件
   * 会清理不再存在的旧 MD 文件，避免 Docker rebuild 后残留过期数据
   */
  async writeContainerSkills(
    userId: string,
    hostname: string,
    skills: ContainerSkillItem[],
  ): Promise<void> {
    const skillsDir = this.getSkillsPath(userId, hostname);
    await fs.mkdir(skillsDir, { recursive: true });

    // 清理不再存在的旧 MD 文件（并行删除）
    const currentNames = new Set(skills.map((s) => `${s.name}.md`));
    try {
      const entries = await fs.readdir(skillsDir);
      const staleFiles = entries.filter(
        (e) => e.endsWith('.md') && !currentNames.has(e),
      );
      await Promise.all(
        staleFiles.map((f) =>
          fs.unlink(path.join(skillsDir, f)).catch(() => {}),
        ),
      );
    } catch {
      // 目录不存在或读取失败，忽略
    }

    // 持久化技能元数据（container-skills.json 中不含 content，避免文件过大）
    const metaSkills = skills.map(({ content: _, ...rest }) => rest);
    const filePath = path.join(skillsDir, 'container-skills.json');
    await fs.writeFile(
      filePath,
      JSON.stringify(
        { skills: metaSkills, fetchedAt: new Date().toISOString() },
        null,
        2,
      ),
    );

    // 并行持久化每个技能的 SKILL.md 内容为独立文件
    const mdWrites = skills
      .filter((s) => s.content)
      .map((s) =>
        fs.writeFile(path.join(skillsDir, `${s.name}.md`), s.content!),
      );
    await Promise.all(mdWrites);

    this.logger.info(
      `Container skills persisted for: ${this.getIsolationKey(userId, hostname)}`,
    );
  }

  /**
   * 从文件系统读取缓存的容器内置技能
   * @param includeContent 是否从独立 MD 文件恢复 content 字段（默认 false，列表接口不需要）
   */
  async readContainerSkills(
    userId: string,
    hostname: string,
    includeContent = false,
  ): Promise<{ skills: ContainerSkillItem[]; fetchedAt: string } | null> {
    const skillsDir = this.getSkillsPath(userId, hostname);
    const filePath = path.join(skillsDir, 'container-skills.json');
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(raw) as {
        skills: ContainerSkillItem[];
        fetchedAt: string;
      };

      // 仅在需要时从独立 MD 文件恢复 content（并行读取）
      if (includeContent) {
        await Promise.all(
          data.skills.map(async (skill) => {
            const mdPath = path.join(skillsDir, `${skill.name}.md`);
            try {
              skill.content = await fs.readFile(mdPath, 'utf-8');
            } catch {
              // MD 文件不存在，content 保持 undefined
            }
          }),
        );
      }

      return data;
    } catch {
      return null;
    }
  }

  /**
   * 将已安装技能的 SKILL.md 写入 OpenClaw skills 目录
   * 路径: ${openclawDir}/{isolationKey}/skills/{skillName}/SKILL.md
   * 容器内映射为: /home/node/.openclaw/skills/{skillName}/SKILL.md
   */
  async writeInstalledSkillMd(
    userId: string,
    hostname: string,
    skillName: string,
    content: string,
  ): Promise<void> {
    const skillsDir = this.getSkillsPath(userId, hostname);
    const skillDir = path.join(skillsDir, skillName);
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), content, 'utf-8');
  }

  /**
   * 将技能的完整目录文件写入 OpenClaw skills 目录
   * 路径: ${openclawDir}/{isolationKey}/skills/{skillName}/{relativePath}
   */
  async writeSkillFiles(
    userId: string,
    hostname: string,
    skillName: string,
    files: Array<{ relativePath: string; content: string; size: number }>,
  ): Promise<void> {
    const skillsDir = this.getSkillsPath(userId, hostname);
    const skillDir = path.join(skillsDir, skillName);

    // 清理旧目录，确保干净安装
    await fs.rm(skillDir, { recursive: true, force: true });
    await fs.mkdir(skillDir, { recursive: true });

    try {
      for (const file of files) {
        // 路径遍历防护
        const normalized = path.normalize(file.relativePath);
        if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
          this.logger.warn('Skipping unsafe file path', {
            relativePath: file.relativePath,
            skillName,
          });
          continue;
        }

        const filePath = path.join(skillDir, normalized);

        // 二次验证：确保最终路径在 skillDir 内
        if (!filePath.startsWith(skillDir)) {
          this.logger.warn('Path traversal detected, skipping', {
            relativePath: file.relativePath,
            skillDir,
          });
          continue;
        }

        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, file.content, 'utf-8');
      }
    } catch (error) {
      // 回滚：清理半写入的目录
      await fs.rm(skillDir, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  }

  /**
   * 删除已安装技能的 SKILL.md 目录
   */
  async removeInstalledSkillMd(
    userId: string,
    hostname: string,
    skillName: string,
  ): Promise<void> {
    const skillsDir = this.getSkillsPath(userId, hostname);
    const skillDir = path.join(skillsDir, skillName);
    await fs.rm(skillDir, { recursive: true, force: true });
  }

  /**
   * 检查某个技能的 SKILL.md 是否已存在
   */
  async hasInstalledSkillMd(
    userId: string,
    hostname: string,
    skillName: string,
  ): Promise<boolean> {
    const skillsDir = this.getSkillsPath(userId, hostname);
    const mdPath = path.join(skillsDir, skillName, 'SKILL.md');
    try {
      await fs.access(mdPath);
      return true;
    } catch {
      return false;
    }
  }
}
