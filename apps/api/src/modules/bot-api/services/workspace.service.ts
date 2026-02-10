import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

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
}
