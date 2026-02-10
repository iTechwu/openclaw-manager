import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BotService,
  ProviderKeyService,
  BotProviderKeyService,
  OperateLogService,
  PersonaTemplateService,
  BotChannelService,
} from '@app/db';
import { ProviderVerifyClient } from '@app/clients/internal/provider-verify';
import { KeyringProxyService } from '../proxy/services/keyring-proxy.service';
import { EncryptionService } from './services/encryption.service';
import { DockerService } from './services/docker.service';
import { WorkspaceService } from './services/workspace.service';
import { BotConfigResolverService } from './services/bot-config-resolver.service';
import type { Bot, ProviderKey, BotStatus, Prisma } from '@prisma/client';
import type {
  CreateBotInput,
  SimpleCreateBotInput,
  AddProviderKeyInput,
  ProviderKey as ProviderKeyDto,
  ContainerStats,
  OrphanReport,
  CleanupReport,
  VerifyProviderKeyInput,
  VerifyProviderKeyResponse,
  BotProviderDetail,
  BotDiagnoseResponse,
} from '@repo/contracts';
import { PROVIDER_CONFIGS } from '@repo/contracts';
import enviromentUtil from 'libs/infra/utils/enviroment.util';

@Injectable()
export class BotApiService {
  private readonly logger = new Logger(BotApiService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly botService: BotService,
    private readonly providerKeyService: ProviderKeyService,
    private readonly botProviderKeyService: BotProviderKeyService,
    private readonly botChannelService: BotChannelService,
    private readonly encryptionService: EncryptionService,
    private readonly dockerService: DockerService,
    private readonly workspaceService: WorkspaceService,
    private readonly operateLogService: OperateLogService,
    private readonly personaTemplateService: PersonaTemplateService,
    private readonly providerVerifyClient: ProviderVerifyClient,
    private readonly keyringProxyService: KeyringProxyService,
    private readonly botConfigResolver: BotConfigResolverService,
  ) {
    this.logger.log(`BotApiService initialized`);
  }

  /**
   * 获取当前的 Proxy URL
   * 每次调用时从环境变量读取，确保使用最新配置
   */
  private getProxyUrl(): string | undefined {
    const proxyUrl = enviromentUtil.generateEnvironmentUrls().internalApi;
    this.logger.debug(`Current proxyUrl: ${proxyUrl}`);
    return proxyUrl;
  }

  // ============================================================================
  // Bot Operations
  // ============================================================================

  /**
   * Build tokenized URLs for accessing the bot's OpenClaw gateway
   * These URLs include the gateway token for WebSocket authentication
   */
  private buildTokenizedUrls(bot: Bot): {
    dashboardUrl: string | null;
    chatUrl: string | null;
  } {
    if (!bot.port || !bot.gatewayToken) {
      return { dashboardUrl: null, chatUrl: null };
    }
    // Build URLs with token for WebSocket authentication
    // The token is passed as a query parameter and stored in localStorage by the Control UI
    const baseUrl = `http://localhost:${bot.port}`;
    return {
      dashboardUrl: `${baseUrl}/?token=${bot.gatewayToken}`,
      chatUrl: `${baseUrl}/chat?session=main&token=${bot.gatewayToken}`,
    };
  }

  async listBots(userId: string): Promise<Bot[]> {
    const { list } = await this.botService.list({ createdById: userId });

    // Enrich with container status and sync database status if needed
    const enrichedBots = await Promise.all(
      list.map(async (bot) => {
        // Build tokenized URLs for accessing the bot's OpenClaw gateway
        const tokenizedUrls = this.buildTokenizedUrls(bot);

        if (bot.containerId) {
          const containerStatus = await this.dockerService.getContainerStatus(
            bot.containerId,
          );

          // Sync database status with actual Docker container state
          if (containerStatus) {
            const actualStatus: BotStatus = containerStatus.running
              ? 'running'
              : 'stopped';
            if (bot.status !== actualStatus && bot.status !== 'error') {
              // Update database status to match Docker state
              await this.botService.update(
                { id: bot.id },
                { status: actualStatus },
              );
              this.logger.log(
                `Synced bot ${bot.hostname} status: ${bot.status} -> ${actualStatus}`,
              );
              return {
                ...bot,
                status: actualStatus,
                containerStatus,
                ...tokenizedUrls,
              };
            }
          }

          return { ...bot, containerStatus, ...tokenizedUrls };
        }
        return { ...bot, ...tokenizedUrls };
      }),
    );

    return enrichedBots;
  }

  async getBotByHostname(hostname: string, userId: string): Promise<Bot> {
    // Query with userId filter for proper multi-tenant isolation
    const bot = await this.botService.get({
      hostname,
      createdById: userId,
    });
    if (!bot) {
      throw new NotFoundException(`Bot with hostname "${hostname}" not found`);
    }

    // Build tokenized URLs for accessing the bot's OpenClaw gateway
    const tokenizedUrls = this.buildTokenizedUrls(bot);

    // Enrich with container status
    if (bot.containerId) {
      const containerStatus = await this.dockerService.getContainerStatus(
        bot.containerId,
      );
      return { ...bot, containerStatus, ...tokenizedUrls } as Bot;
    }

    return { ...bot, ...tokenizedUrls } as Bot;
  }

  async createBot(input: CreateBotInput, userId: string): Promise<Bot> {
    // Check if hostname already exists for this user (per-user uniqueness)
    const existing = await this.botService.get({
      hostname: input.hostname,
      createdById: userId,
    });
    if (existing) {
      throw new ConflictException(
        `Bot with hostname "${input.hostname}" already exists`,
      );
    }

    // Generate gateway token
    const gatewayToken = this.encryptionService.generateToken();

    // Get primary provider info
    const primaryProvider = input.providers[0];

    // Allocate port
    const { list: existingBots } = await this.botService.list({
      createdById: userId,
    });
    const usedPorts = existingBots
      .map((b) => b.port)
      .filter((p): p is number => p !== null);
    const port = await this.dockerService.allocatePort(usedPorts);

    // Handle PersonaTemplate: create new one if not provided (scratch template)
    let personaTemplateId = input.personaTemplateId;
    if (!personaTemplateId) {
      // Create a new PersonaTemplate for this bot (scratch template)
      const newTemplate = await this.personaTemplateService.create({
        name: input.name,
        emoji: input.persona.emoji || null,
        tagline: `Custom persona for ${input.name}`,
        soulMarkdown: input.persona.soulMarkdown,
        soulPreview: input.persona.soulMarkdown.slice(0, 200),
        isSystem: false,
        avatarFile: input.persona.avatarFileId
          ? { connect: { id: input.persona.avatarFileId } }
          : undefined,
        createdBy: { connect: { id: userId } },
      });
      personaTemplateId = newTemplate.id;
      this.logger.log(
        `Created new PersonaTemplate: ${personaTemplateId} for bot ${input.hostname}`,
      );
    }

    // Create workspace
    const workspacePath = await this.workspaceService.createWorkspace({
      hostname: input.hostname,
      userId,
      name: input.name,
      aiProvider: primaryProvider.providerId,
      model: primaryProvider.primaryModel || primaryProvider.models[0],
      channelType: input.channels[0].channelType,
      persona: input.persona,
      features: input.features,
    });

    // Get isolation key for multi-tenant resource naming
    const isolationKey = this.workspaceService.getIsolationKeyForBot(
      userId,
      input.hostname,
    );

    // Determine API type from provider config
    const providerConfig =
      PROVIDER_CONFIGS[
        primaryProvider.providerId as keyof typeof PROVIDER_CONFIGS
      ];
    const apiType = providerConfig?.apiType || 'openai';

    // Get provider key if keyId is provided
    let apiKey: string | undefined;
    let apiBaseUrl: string | undefined;
    let proxyToken: string | undefined;
    let proxyTokenHash: string | undefined;

    // Check if zero-trust mode is enabled
    const useZeroTrust = this.keyringProxyService.isZeroTrustEnabled();

    if (primaryProvider.keyId) {
      try {
        const providerKey = await this.providerKeyService.get({
          id: primaryProvider.keyId,
        });
        if (providerKey && providerKey.createdById === userId) {
          apiBaseUrl = providerKey.baseUrl || undefined;

          if (!useZeroTrust) {
            // Direct mode: Decrypt and pass API key to container
            apiKey = this.encryptionService.decrypt(
              Buffer.from(providerKey.secretEncrypted),
            );

            // Write API key to secrets directory for the bot
            await this.workspaceService.writeApiKey(
              userId,
              input.hostname,
              providerKey.vendor,
              apiKey,
            );
          }
          // In zero-trust mode, API key is managed by the proxy

          this.logger.log(
            `Provider key ${primaryProvider.keyId} configured for bot ${input.hostname}`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Failed to get provider key ${primaryProvider.keyId}:`,
          error,
        );
      }
    }

    // Note: Bot registration with proxy will happen after bot is created in database
    // This is because we need the bot ID for the ProxyToken model
    // Container creation is deferred until after proxy registration

    // Create bot in database FIRST (without container)
    // 注意：aiProvider、model、channelType 字段已从数据库移除，实际值从 BotProviderKey 和 BotChannel 派生
    const bot = await this.botService.create({
      name: input.name,
      hostname: input.hostname,
      containerId: null, // Will be updated after container creation
      port: typeof port === 'number' ? port : Number(port),
      gatewayToken,
      proxyTokenHash: null, // Will be updated after proxy registration
      tags: input.tags || [],
      status: 'created',
      emoji: input.persona.emoji || null,
      soulMarkdown: input.persona.soulMarkdown || null,
      personaTemplate: { connect: { id: personaTemplateId } },
      avatarFile: input.persona.avatarFileId
        ? { connect: { id: input.persona.avatarFileId } }
        : undefined,
      createdBy: { connect: { id: userId } },
    });

    this.logger.log(`Bot created in database: ${input.hostname} (id: ${bot.id})`);

    // Create BotProviderKey relationships for all providers
    for (const provider of input.providers) {
      if (provider.keyId) {
        try {
          const isPrimary =
            provider.providerId ===
            (input.primaryProvider || input.providers[0].providerId);
          await this.botProviderKeyService.create({
            bot: { connect: { id: bot.id } },
            providerKey: { connect: { id: provider.keyId } },
            isPrimary,
            allowedModels: provider.models,
            primaryModel: provider.primaryModel || provider.models[0] || null,
          });
          this.logger.log(
            `BotProviderKey created for bot ${bot.id} with key ${provider.keyId}, models: ${provider.models.join(', ')}`,
          );
        } catch (error) {
          this.logger.warn(
            `Failed to create BotProviderKey for bot ${bot.id}:`,
            error,
          );
        }
      }
    }

    // Register bot with proxy if in zero-trust mode
    if (useZeroTrust && primaryProvider.keyId) {
      try {
        // Determine the vendor for proxy registration
        // For custom providers, use apiType (e.g., "openai") to match the proxy URL
        // This ensures the vendor in ProxyToken matches the vendor in the proxy URL
        const proxyVendor =
          primaryProvider.providerId === 'custom' && apiType
            ? apiType
            : primaryProvider.providerId;

        const registration = await this.keyringProxyService.registerBot(
          bot.id,
          proxyVendor,
          primaryProvider.keyId,
          input.tags,
        );
        proxyToken = registration.token;
        proxyTokenHash = this.encryptionService.hashToken(proxyToken);

        // Update bot with proxyTokenHash
        await this.botService.update({ id: bot.id }, { proxyTokenHash });

        this.logger.log(`Bot ${input.hostname} registered with proxy (token obtained)`);
      } catch (error) {
        this.logger.warn(
          `Failed to register bot with proxy, falling back to direct mode:`,
          error,
        );
        // Fall back to direct mode if proxy registration fails
        if (!apiKey) {
          try {
            const providerKey = await this.providerKeyService.get({
              id: primaryProvider.keyId,
            });
            if (providerKey && providerKey.createdById === userId) {
              apiKey = this.encryptionService.decrypt(
                Buffer.from(providerKey.secretEncrypted),
              );
              await this.workspaceService.writeApiKey(
                userId,
                input.hostname,
                providerKey.vendor,
                apiKey,
              );
            }
          } catch (keyError) {
            this.logger.warn(
              `Failed to get provider key for fallback:`,
              keyError,
            );
          }
        }
      }
    }

    // Create container AFTER proxy registration (so it has the proxy token)
    let containerId: string | null = null;
    try {
      containerId = await this.dockerService.createContainer({
        hostname: input.hostname,
        isolationKey,
        name: input.name,
        port,
        gatewayToken,
        aiProvider: primaryProvider.providerId,
        model: primaryProvider.primaryModel || primaryProvider.models[0],
        channelType: input.channels[0].channelType,
        workspacePath,
        apiKey,
        apiBaseUrl,
        proxyUrl: proxyToken ? this.getProxyUrl() : undefined,
        proxyToken,
        apiType,
      });

      // Update bot with container ID
      await this.botService.update({ id: bot.id }, { containerId });
      this.logger.log(`Container created for bot ${input.hostname}: ${containerId}`);
    } catch (error) {
      this.logger.warn(
        `Failed to create container for ${input.hostname}:`,
        error,
      );
      // Continue without container - can be created later
    }

    // Log operation
    await this.operateLogService.create({
      user: { connect: { id: userId } },
      operateType: 'CREATE',
      target: 'BOT',
      targetId: bot.id,
      targetName: bot.name,
      detail: {
        hostname: bot.hostname,
        // aiProvider 和 model 从 BotProviderKey 派生，不再记录在日志中
      },
    });

    return bot;
  }

  /**
   * 简化创建 Bot
   * 只创建 Bot 记录，不创建 workspace 和 container
   * Bot 状态为 draft，需要用户配置 Provider 和 Channel 后才能启动
   */
  async createBotSimple(
    input: SimpleCreateBotInput,
    userId: string,
  ): Promise<Bot> {
    // Check if hostname already exists for this user
    const existing = await this.botService.get({
      hostname: input.hostname,
      createdById: userId,
    });
    if (existing) {
      throw new ConflictException(
        `Bot with hostname "${input.hostname}" already exists`,
      );
    }

    // Generate gateway token for future use
    const gatewayToken = this.encryptionService.generateToken();

    // Handle PersonaTemplate: create new one if not provided
    let personaTemplateId = input.personaTemplateId;
    if (!personaTemplateId) {
      const newTemplate = await this.personaTemplateService.create({
        name: input.persona.name,
        emoji: input.persona.emoji || null,
        tagline: `Custom persona for ${input.persona.name}`,
        soulMarkdown: input.persona.soulMarkdown,
        soulPreview: input.persona.soulMarkdown.slice(0, 200),
        isSystem: false,
        avatarFile: input.persona.avatarFileId
          ? { connect: { id: input.persona.avatarFileId } }
          : undefined,
        createdBy: { connect: { id: userId } },
      });
      personaTemplateId = newTemplate.id;
      this.logger.log(
        `Created new PersonaTemplate: ${personaTemplateId} for bot ${input.hostname}`,
      );
    }

    // Create bot in database with draft status
    // No workspace, no container, no port allocation
    // 注意：aiProvider、model、channelType 字段已从数据库移除，实际值从 BotProviderKey 和 BotChannel 派生
    const bot = await this.botService.create({
      name: input.name,
      hostname: input.hostname,
      containerId: null,
      port: null,
      gatewayToken,
      proxyTokenHash: null,
      tags: input.tags || [],
      status: 'draft',
      emoji: input.persona.emoji || null,
      soulMarkdown: input.persona.soulMarkdown || null,
      personaTemplate: { connect: { id: personaTemplateId } },
      avatarFile: input.persona.avatarFileId
        ? { connect: { id: input.persona.avatarFileId } }
        : undefined,
      createdBy: { connect: { id: userId } },
    });

    this.logger.log(`Bot created (draft): ${input.hostname}`);

    // Log operation
    await this.operateLogService.create({
      user: { connect: { id: userId } },
      operateType: 'CREATE',
      target: 'BOT',
      targetId: bot.id,
      targetName: bot.name,
      detail: {
        hostname: bot.hostname,
        status: 'draft',
      },
    });

    return bot;
  }

  async deleteBot(hostname: string, userId: string): Promise<void> {
    const bot = await this.getBotByHostname(hostname, userId);

    // Stop and remove container if exists
    if (bot.containerId) {
      try {
        await this.dockerService.stopContainer(bot.containerId);
        await this.dockerService.removeContainer(bot.containerId);
      } catch (error) {
        this.logger.warn(`Failed to remove container for ${hostname}:`, error);
      }
    }

    // Revoke bot from proxy if in zero-trust mode
    if (this.keyringProxyService.isZeroTrustEnabled()) {
      try {
        await this.keyringProxyService.deleteByBotId(bot.id);
        this.logger.log(`Bot ${hostname} revoked from proxy`);
      } catch (error) {
        this.logger.warn(`Failed to revoke bot from proxy:`, error);
      }
    }

    // Delete workspace
    try {
      await this.workspaceService.deleteWorkspace(userId, hostname);
    } catch (error) {
      this.logger.warn(`Failed to delete workspace for ${hostname}:`, error);
    }

    // Soft delete associated BotChannels
    try {
      const { list: channels } = await this.botChannelService.list({
        botId: bot.id,
      });
      for (const channel of channels) {
        await this.botChannelService.update(
          { id: channel.id },
          {
            isDeleted: true,
            deletedAt: new Date(),
            isEnabled: false,
            connectionStatus: 'DISCONNECTED',
            lastError: 'Bot 已删除',
          },
        );
        this.logger.log(`BotChannel soft deleted: ${channel.id}`);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to soft delete BotChannels for ${hostname}:`,
        error,
      );
    }

    // Soft delete in database
    await this.botService.update(
      { id: bot.id },
      { isDeleted: true, deletedAt: new Date(), status: 'stopped' },
    );

    // Log operation
    await this.operateLogService.create({
      user: { connect: { id: userId } },
      operateType: 'DELETE',
      target: 'BOT',
      targetId: bot.id,
      targetName: bot.name,
      detail: { hostname },
    });

    this.logger.log(`Bot deleted: ${hostname}`);
  }

  /**
   * 更新 Bot 配置
   * 更新会存储到 pendingConfig，需要重启后生效
   */
  async updateBot(
    hostname: string,
    userId: string,
    input: {
      name?: string;
      tags?: string[];
      soulMarkdown?: string;
      emoji?: string;
      avatarFileId?: string;
    },
  ): Promise<Bot> {
    const bot = await this.getBotByHostname(hostname, userId);

    // 构建待生效配置
    const pendingConfig: Record<string, unknown> = {};
    if (input.name !== undefined) pendingConfig.name = input.name;
    if (input.tags !== undefined) pendingConfig.tags = input.tags;
    if (input.soulMarkdown !== undefined)
      pendingConfig.soulMarkdown = input.soulMarkdown;
    if (input.emoji !== undefined) pendingConfig.emoji = input.emoji;
    if (input.avatarFileId !== undefined)
      pendingConfig.avatarFileId = input.avatarFileId;

    // 合并现有的 pendingConfig
    const existingPending =
      (bot.pendingConfig as Record<string, unknown>) || {};
    const mergedPending = { ...existingPending, ...pendingConfig };

    // 更新 pendingConfig
    const updatedBot = await this.botService.update(
      { id: bot.id },
      { pendingConfig: mergedPending as Prisma.InputJsonValue },
    );

    // Log operation
    await this.operateLogService.create({
      user: { connect: { id: userId } },
      operateType: 'UPDATE',
      target: 'BOT',
      targetId: bot.id,
      targetName: bot.name,
      detail: { hostname, pendingConfig: mergedPending } as Prisma.InputJsonValue,
    });

    this.logger.log(
      `Bot ${hostname} config updated (pending): ${JSON.stringify(pendingConfig)}`,
    );

    // Build tokenized URLs
    const tokenizedUrls = this.buildTokenizedUrls(updatedBot);
    return { ...updatedBot, ...tokenizedUrls } as Bot;
  }

  /**
   * 应用待生效配置
   * 将 pendingConfig 应用到实际配置，并清空 pendingConfig
   */
  async applyPendingConfig(
    hostname: string,
    userId: string,
  ): Promise<{ success: boolean; appliedFields: string[] }> {
    const bot = await this.getBotByHostname(hostname, userId);

    const pendingConfig = bot.pendingConfig as Record<string, unknown> | null;
    if (!pendingConfig || Object.keys(pendingConfig).length === 0) {
      return { success: true, appliedFields: [] };
    }

    // 构建更新数据
    const updateData: Record<string, unknown> = {};
    const appliedFields: string[] = [];

    if (pendingConfig.name !== undefined) {
      updateData.name = pendingConfig.name;
      appliedFields.push('name');
    }
    if (pendingConfig.tags !== undefined) {
      updateData.tags = pendingConfig.tags;
      appliedFields.push('tags');
    }
    if (pendingConfig.soulMarkdown !== undefined) {
      updateData.soulMarkdown = pendingConfig.soulMarkdown;
      appliedFields.push('soulMarkdown');
    }
    if (pendingConfig.emoji !== undefined) {
      updateData.emoji = pendingConfig.emoji;
      appliedFields.push('emoji');
    }
    if (pendingConfig.avatarFileId !== undefined) {
      updateData.avatarFileId = pendingConfig.avatarFileId;
      appliedFields.push('avatarFileId');
    }

    // 应用配置并清空 pendingConfig
    await this.botService.update(
      { id: bot.id },
      { ...updateData, pendingConfig: null },
    );

    // Log operation
    await this.operateLogService.create({
      user: { connect: { id: userId } },
      operateType: 'UPDATE',
      target: 'BOT',
      targetId: bot.id,
      targetName: bot.name,
      detail: { hostname, appliedFields, appliedConfig: pendingConfig } as Prisma.InputJsonValue,
    });

    this.logger.log(
      `Bot ${hostname} pending config applied: ${appliedFields.join(', ')}`,
    );

    return { success: true, appliedFields };
  }

  /**
   * 清除待生效配置
   * 放弃所有未生效的修改
   */
  async clearPendingConfig(hostname: string, userId: string): Promise<void> {
    const bot = await this.getBotByHostname(hostname, userId);

    await this.botService.update({ id: bot.id }, { pendingConfig: null });

    // Log operation
    await this.operateLogService.create({
      user: { connect: { id: userId } },
      operateType: 'UPDATE',
      target: 'BOT',
      targetId: bot.id,
      targetName: bot.name,
      detail: { hostname, action: 'clearPendingConfig' },
    });

    this.logger.log(`Bot ${hostname} pending config cleared`);
  }

  async startBot(
    hostname: string,
    userId: string,
  ): Promise<{ success: boolean; status: string }> {
    let bot = await this.getBotByHostname(hostname, userId);

    // 在启动前应用待生效配置
    const pendingConfig = bot.pendingConfig as Record<string, unknown> | null;
    if (pendingConfig && Object.keys(pendingConfig).length > 0) {
      this.logger.log(`Applying pending config before starting bot ${hostname}`);
      await this.applyPendingConfig(hostname, userId);
      // 重新获取更新后的 bot
      bot = await this.getBotByHostname(hostname, userId);
    }

    // Update status to starting
    await this.botService.update({ id: bot.id }, { status: 'starting' });

    try {
      // Allocate port if not set (for bots created via createBotSimple)
      let botPort = bot.port;
      if (!botPort) {
        const { list: existingBots } = await this.botService.list({
          createdById: userId,
        });
        const usedPorts = existingBots
          .map((b) => b.port)
          .filter((p): p is number => p !== null);
        botPort = await this.dockerService.allocatePort(usedPorts);
        await this.botService.update({ id: bot.id }, { port: botPort });
        this.logger.log(`Allocated port ${botPort} for bot ${hostname}`);
      }

      // Check if container exists and is in a healthy state
      // IMPORTANT: We always recreate the container to ensure new configurations take effect
      // The OpenClaw data (memory, sessions) is persisted in a separate volume and won't be lost
      let needsRecreate = true; // Always recreate to apply new config
      if (bot.containerId) {
        const containerStatus = await this.dockerService.getContainerStatus(
          bot.containerId,
        );
        if (containerStatus) {
          // Container exists, remove it to recreate with new config
          this.logger.log(
            `Container ${bot.containerId} exists, will recreate to apply latest config`,
          );
          try {
            if (containerStatus.running) {
              await this.dockerService.stopContainer(bot.containerId);
            }
            await this.dockerService.removeContainer(bot.containerId);
          } catch (removeError) {
            this.logger.warn(
              `Failed to remove container ${bot.containerId}:`,
              removeError,
            );
          }
        } else {
          // Container doesn't exist anymore
          this.logger.log(
            `Container ${bot.containerId} not found, will create new one`,
          );
        }
      }

      // Ensure OpenClaw data directory exists before creating container
      await this.workspaceService.ensureOpenclawDir(userId, hostname);

      if (!needsRecreate && bot.containerId) {
        // This branch is currently unreachable since needsRecreate is always true
        // Kept for potential future optimization where we might skip recreation
        await this.dockerService.startContainer(bot.containerId);
      } else {
        // Get provider key for this bot
        let apiKey: string | undefined;
        let apiBaseUrl: string | undefined;
        let proxyToken: string | undefined;
        let apiType: string | undefined;

        const botProviderKey = await this.botProviderKeyService.get({
          botId: bot.id,
          isPrimary: true,
        });

        // Check if zero-trust mode is enabled
        const useZeroTrust = this.keyringProxyService.isZeroTrustEnabled();
        this.logger.log(`Starting bot ${hostname} with zero-trust mode: ${useZeroTrust}`);

        if (botProviderKey) {
          try {
            const providerKey = await this.providerKeyService.get({
              id: botProviderKey.providerKeyId,
            });
            if (providerKey && providerKey.createdById === userId) {
              // Get API type from provider config
              const providerConfig =
                PROVIDER_CONFIGS[
                  providerKey.vendor as keyof typeof PROVIDER_CONFIGS
                ];
              apiType = providerConfig?.apiType || 'openai';
              apiBaseUrl = providerKey.baseUrl || undefined;

              if (useZeroTrust) {
                // Zero-trust mode: Register bot with proxy
                try {
                  // Determine the vendor for proxy registration
                  // For custom providers, use apiType (e.g., "openai") to match the proxy URL
                  const proxyVendor =
                    providerKey.vendor === 'custom' && apiType
                      ? apiType
                      : providerKey.vendor;

                  const registration =
                    await this.keyringProxyService.registerBot(
                      bot.id,
                      proxyVendor,
                      botProviderKey.providerKeyId,
                      bot.tags,
                    );
                  proxyToken = registration.token;
                  // Update proxyTokenHash in database
                  const proxyTokenHash =
                    this.encryptionService.hashToken(proxyToken);
                  await this.botService.update(
                    { id: bot.id },
                    { proxyTokenHash },
                  );
                  this.logger.log(
                    `Bot ${hostname} registered with proxy for start`,
                  );
                } catch (proxyError) {
                  this.logger.warn(
                    `Failed to register bot with proxy, falling back to direct mode:`,
                    proxyError,
                  );
                  // Fall back to direct mode
                  apiKey = this.encryptionService.decrypt(
                    Buffer.from(providerKey.secretEncrypted),
                  );
                  await this.workspaceService.writeApiKey(
                    userId,
                    hostname,
                    providerKey.vendor,
                    apiKey,
                  );
                }
              } else {
                // Direct mode: Decrypt and pass API key
                apiKey = this.encryptionService.decrypt(
                  Buffer.from(providerKey.secretEncrypted),
                );
                // Write API key to secrets directory
                await this.workspaceService.writeApiKey(
                  userId,
                  hostname,
                  providerKey.vendor,
                  apiKey,
                );
              }
            }
          } catch (error) {
            this.logger.warn(
              `Failed to get provider key for bot ${hostname}:`,
              error,
            );
          }
        }

        // Create container if it doesn't exist
        const workspacePath = this.workspaceService.getWorkspacePath(
          userId,
          hostname,
        );
        const isolationKey = this.workspaceService.getIsolationKeyForBot(
          userId,
          hostname,
        );

        // 从 BotProviderKey 和 BotChannel 派生运行时配置
        const runtimeConfig = await this.botConfigResolver.getBotRuntimeConfig(
          bot.id,
        );

        // 详细日志：检查 zero-trust 模式参数
        const currentProxyUrl = this.getProxyUrl();
        this.logger.log(`Creating container for bot ${hostname}`, {
          hasProxyToken: !!proxyToken,
          hasProxyUrl: !!currentProxyUrl,
          proxyUrl: currentProxyUrl,
          hasApiKey: !!apiKey,
          apiKeyLength: apiKey?.length,
          useZeroTrust,
        });

        const containerId = await this.dockerService.createContainer({
          hostname: bot.hostname,
          isolationKey,
          name: bot.name,
          port: botPort,
          gatewayToken: bot.gatewayToken || '',
          aiProvider: runtimeConfig?.aiProvider || '',
          model: runtimeConfig?.model || '',
          channelType: runtimeConfig?.channelType || '',
          workspacePath,
          apiKey,
          apiBaseUrl,
          proxyUrl: proxyToken ? currentProxyUrl : undefined,
          proxyToken,
          apiType,
        });
        await this.dockerService.startContainer(containerId);
        await this.botService.update({ id: bot.id }, { containerId });
      }

      await this.botService.update({ id: bot.id }, { status: 'running' });

      // Log operation
      await this.operateLogService.create({
        user: { connect: { id: userId } },
        operateType: 'START',
        target: 'BOT',
        targetId: bot.id,
        targetName: bot.name,
        detail: { hostname },
      });

      this.logger.log(`Bot started: ${hostname}`);
      return { success: true, status: 'running' };
    } catch (error) {
      this.logger.error(`Failed to start bot ${hostname}:`, error);
      await this.botService.update({ id: bot.id }, { status: 'error' });
      return { success: false, status: 'error' };
    }
  }

  async stopBot(
    hostname: string,
    userId: string,
  ): Promise<{ success: boolean; status: string }> {
    const bot = await this.getBotByHostname(hostname, userId);

    try {
      if (bot.containerId) {
        await this.dockerService.stopContainer(bot.containerId);
      }

      await this.botService.update({ id: bot.id }, { status: 'stopped' });

      // Log operation
      await this.operateLogService.create({
        user: { connect: { id: userId } },
        operateType: 'STOP',
        target: 'BOT',
        targetId: bot.id,
        targetName: bot.name,
        detail: { hostname },
      });

      this.logger.log(`Bot stopped: ${hostname}`);
      return { success: true, status: 'stopped' };
    } catch (error) {
      this.logger.error(`Failed to stop bot ${hostname}:`, error);
      return { success: false, status: 'error' };
    }
  }

  // ============================================================================
  // Diagnostics Operations
  // ============================================================================

  async getContainerStats(userId: string): Promise<ContainerStats[]> {
    // Get user's bots to filter stats
    const { list: bots } = await this.botService.list({ createdById: userId });
    const userHostnames = bots.map((b) => b.hostname);

    const allStats = await this.dockerService.getAllContainerStats();

    // Filter to only user's bots
    return allStats.filter((s) => userHostnames.includes(s.hostname));
  }

  async getOrphanReport(userId: string): Promise<OrphanReport> {
    const { list: bots } = await this.botService.list({ createdById: userId });
    // Use isolation keys for multi-tenant resource identification
    const knownIsolationKeys = bots.map((b) =>
      this.workspaceService.getIsolationKeyForBot(userId, b.hostname),
    );

    const orphanedContainers =
      await this.dockerService.findOrphanedContainers(knownIsolationKeys);
    const orphanedWorkspaces =
      await this.workspaceService.findOrphanedWorkspaces(knownIsolationKeys);
    const orphanedSecrets =
      await this.workspaceService.findOrphanedSecrets(knownIsolationKeys);

    return {
      orphanedContainers,
      orphanedWorkspaces,
      orphanedSecrets,
      total:
        orphanedContainers.length +
        orphanedWorkspaces.length +
        orphanedSecrets.length,
    };
  }

  async cleanupOrphans(userId: string): Promise<CleanupReport> {
    const { list: bots } = await this.botService.list({ createdById: userId });
    // Use isolation keys for multi-tenant resource identification
    const knownIsolationKeys = bots.map((b) =>
      this.workspaceService.getIsolationKeyForBot(userId, b.hostname),
    );

    const containerReport =
      await this.dockerService.cleanupOrphans(knownIsolationKeys);

    // Cleanup orphaned workspaces (using isolation keys)
    const orphanedWorkspaces =
      await this.workspaceService.findOrphanedWorkspaces(knownIsolationKeys);
    let workspacesRemoved = 0;
    for (const isolationKey of orphanedWorkspaces) {
      try {
        await this.workspaceService.deleteWorkspaceByKey(isolationKey);
        workspacesRemoved++;
      } catch (error) {
        this.logger.warn(
          `Failed to remove orphaned workspace ${isolationKey}:`,
          error,
        );
      }
    }

    return {
      success: true,
      containersRemoved: containerReport.containersRemoved,
      workspacesRemoved,
      secretsRemoved: 0, // Secrets are removed with workspaces
    };
  }

  // ============================================================================
  // Provider Key Operations
  // ============================================================================

  /**
   * 列出所有可用的 Provider Keys
   * 管理员创建的 API Keys 对所有用户可见和可用
   * 注意：只有管理员可以创建和删除 API Keys
   */
  async listProviderKeys(_userId: string): Promise<ProviderKeyDto[]> {
    // 列出所有 API Keys（不按用户过滤）
    // 所有用户都可以使用管理员创建的 API Keys
    const { list } = await this.providerKeyService.list({});
    return list.map((key) => this.toProviderKeyDto(key));
  }

  async addProviderKey(
    input: AddProviderKeyInput,
    userId: string,
  ): Promise<{ id: string }> {
    // Encrypt the secret (Prisma Bytes expects Uint8Array)
    const secretEncrypted = new Uint8Array(
      this.encryptionService.encrypt(input.secret),
    );

    const key = await this.providerKeyService.create({
      vendor: input.vendor,
      apiType: input.apiType || null,
      secretEncrypted,
      label: input.label,
      tag: input.tag || null,
      baseUrl: input.baseUrl || null,
      createdBy: { connect: { id: userId } },
    });

    this.logger.log(`Provider key added: ${key.id} (${input.vendor})`);

    // Log operation
    await this.operateLogService.create({
      user: { connect: { id: userId } },
      operateType: 'CREATE',
      target: 'PROVIDER_KEY',
      targetId: key.id,
      targetName: input.label || input.vendor,
      detail: { vendor: input.vendor, tag: input.tag },
    });

    return { id: key.id };
  }

  /**
   * 删除 Provider Key
   * 注意：只有管理员可以删除 API Keys（通过 @AdminAuth() 装饰器控制）
   */
  async deleteProviderKey(
    id: string,
    userId: string,
  ): Promise<{ ok: boolean }> {
    const key = await this.providerKeyService.get({ id });
    if (!key) {
      throw new NotFoundException(`Provider key with id "${id}" not found`);
    }
    await this.providerKeyService.update(
      { id },
      { isDeleted: true, deletedAt: new Date() },
    );

    // Log operation
    await this.operateLogService.create({
      user: { connect: { id: userId } },
      operateType: 'DELETE',
      target: 'PROVIDER_KEY',
      targetId: id,
      targetName: key.label || key.vendor,
      detail: { vendor: key.vendor },
    });

    this.logger.log(`Provider key deleted: ${id}`);
    return { ok: true };
  }

  /**
   * 获取 Provider Key 健康状态
   * 显示所有可用的 API Keys 数量
   */
  async getProviderKeyHealth(_userId: string): Promise<{
    status: string;
    keyCount: number;
    botCount: number;
  }> {
    const [keyResult, botResult] = await Promise.all([
      this.providerKeyService.list({}, { limit: 1 }),
      this.botService.list({}, { limit: 1 }),
    ]);
    const keyCount = keyResult.total;
    const botCount = botResult.total;

    return {
      status: 'healthy',
      keyCount,
      botCount,
    };
  }

  /**
   * Verify a provider key and get available models
   */
  async verifyProviderKey(
    input: VerifyProviderKeyInput,
  ): Promise<VerifyProviderKeyResponse> {
    return this.providerVerifyClient.verify(input);
  }

  /**
   * Get models for an existing provider key by ID
   */
  async getProviderKeyModels(
    keyId: string,
    userId: string,
  ): Promise<VerifyProviderKeyResponse> {
    const key = await this.providerKeyService.get({ id: keyId });
    if (!key || key.createdById !== userId) {
      throw new NotFoundException(`Provider key with id "${keyId}" not found`);
    }

    // Decrypt the secret
    const secret = this.encryptionService.decrypt(
      Buffer.from(key.secretEncrypted),
    );

    // Use the verify client to get models
    // Pass the stored apiType to override the default from PROVIDER_CONFIGS
    return this.providerVerifyClient.verify({
      vendor: key.vendor as VerifyProviderKeyInput['vendor'],
      secret,
      baseUrl: key.baseUrl || undefined,
      apiType: key.apiType as VerifyProviderKeyInput['apiType'],
    });
  }

  // ============================================================================
  // Bot Provider Management
  // ============================================================================

  /**
   * Get all providers for a bot
   */
  async getBotProviders(
    hostname: string,
    userId: string,
  ): Promise<BotProviderDetail[]> {
    const bot = await this.getBotByHostname(hostname, userId);

    const { list: botProviderKeys } = await this.botProviderKeyService.list({
      botId: bot.id,
    });

    const providers = await Promise.all(
      botProviderKeys.map(async (bpk) => {
        const providerKey = await this.providerKeyService.getById(
          bpk.providerKeyId,
        );
        if (!providerKey) {
          return null;
        }

        // Mask the API key
        const secret = this.encryptionService.decrypt(
          Buffer.from(providerKey.secretEncrypted),
        );
        const apiKeyMasked =
          secret.length > 8
            ? `${secret.slice(0, 4)}...${secret.slice(-4)}`
            : '****';

        return {
          id: bpk.id,
          providerKeyId: bpk.providerKeyId,
          vendor: providerKey.vendor as BotProviderDetail['vendor'],
          apiType: (providerKey.apiType as BotProviderDetail['apiType']) || null,
          label: providerKey.label,
          apiKeyMasked,
          baseUrl: providerKey.baseUrl,
          isPrimary: bpk.isPrimary,
          allowedModels: bpk.allowedModels,
          primaryModel: bpk.primaryModel,
          createdAt: bpk.createdAt,
        };
      }),
    );

    return providers.filter((p) => p !== null);
  }

  /**
   * Add a provider to a bot
   */
  async addBotProvider(
    hostname: string,
    userId: string,
    input: {
      keyId: string;
      models: string[];
      primaryModel?: string;
      isPrimary?: boolean;
    },
  ): Promise<BotProviderDetail> {
    const bot = await this.getBotByHostname(hostname, userId);

    // Verify the provider key belongs to the user
    const providerKey = await this.providerKeyService.get({
      id: input.keyId,
      createdById: userId,
    });
    if (!providerKey) {
      throw new NotFoundException(
        `Provider key with id "${input.keyId}" not found`,
      );
    }

    // Check if this provider key is already added to the bot
    const existing = await this.botProviderKeyService.get({
      botId: bot.id,
      providerKeyId: input.keyId,
    });
    if (existing) {
      throw new ConflictException(
        'This provider key is already added to the bot',
      );
    }

    // If this is set as primary, unset other primary providers
    if (input.isPrimary) {
      const { list: existingProviders } = await this.botProviderKeyService.list(
        { botId: bot.id, isPrimary: true },
      );
      for (const ep of existingProviders) {
        await this.botProviderKeyService.update(
          { id: ep.id },
          { isPrimary: false },
        );
      }
    }

    // Create the bot provider key
    const bpk = await this.botProviderKeyService.create({
      bot: { connect: { id: bot.id } },
      providerKey: { connect: { id: input.keyId } },
      allowedModels: input.models,
      primaryModel: input.primaryModel || input.models[0] || null,
      isPrimary: input.isPrimary || false,
    });

    // Mask the API key
    const secret = this.encryptionService.decrypt(
      Buffer.from(providerKey.secretEncrypted),
    );
    const apiKeyMasked =
      secret.length > 8
        ? `${secret.slice(0, 4)}...${secret.slice(-4)}`
        : '****';

    const result: BotProviderDetail = {
      id: bpk.id,
      providerKeyId: bpk.providerKeyId,
      vendor: providerKey.vendor as BotProviderDetail['vendor'],
      apiType: (providerKey.apiType as BotProviderDetail['apiType']) || null,
      label: providerKey.label,
      apiKeyMasked,
      baseUrl: providerKey.baseUrl,
      isPrimary: bpk.isPrimary,
      allowedModels: bpk.allowedModels,
      primaryModel: bpk.primaryModel,
      createdAt: bpk.createdAt,
    };

    // 注意：不再更新 Bot 的 aiProvider 和 model 字段
    // 这些值现在从 BotProviderKey 动态派生
    if (input.isPrimary) {
      this.logger.log(
        `Primary provider set for bot ${bot.hostname}: ${providerKey.vendor}, model: ${input.primaryModel || input.models[0]}`,
      );
    }

    // 检查并更新 Bot 状态（从 draft 到 created）
    await this.checkAndUpdateBotStatus(bot.id);

    return result;
  }

  /**
   * Remove a provider from a bot
   */
  async removeBotProvider(
    hostname: string,
    userId: string,
    keyId: string,
  ): Promise<{ ok: boolean }> {
    const bot = await this.getBotByHostname(hostname, userId);

    const bpk = await this.botProviderKeyService.get({
      botId: bot.id,
      providerKeyId: keyId,
    });
    if (!bpk) {
      throw new NotFoundException('Provider not found for this bot');
    }

    await this.botProviderKeyService.delete({ id: bpk.id });

    return { ok: true };
  }

  /**
   * Set the primary model for a bot provider
   */
  async setBotPrimaryModel(
    hostname: string,
    userId: string,
    keyId: string,
    modelId: string,
  ): Promise<{ ok: boolean }> {
    const bot = await this.getBotByHostname(hostname, userId);

    const bpk = await this.botProviderKeyService.get({
      botId: bot.id,
      providerKeyId: keyId,
    });
    if (!bpk) {
      throw new NotFoundException('Provider not found for this bot');
    }

    // Verify the model is in the allowed models list
    if (!bpk.allowedModels.includes(modelId)) {
      throw new NotFoundException('Model not found in allowed models');
    }

    await this.botProviderKeyService.update(
      { id: bpk.id },
      { primaryModel: modelId },
    );

    return { ok: true };
  }

  // ============================================================================
  // Bot Diagnostics
  // ============================================================================

  /**
   * Run diagnostics on a bot
   */
  async diagnoseBot(
    hostname: string,
    userId: string,
    checks?: string[],
  ): Promise<BotDiagnoseResponse> {
    const bot = await this.getBotByHostname(hostname, userId);
    const results: BotDiagnoseResponse['checks'] = [];
    const recommendations: string[] = [];

    const checksToRun = checks || [
      'provider_key',
      'model_access',
      'channel_tokens',
      'container',
      'network',
    ];

    // Provider Key Check
    if (checksToRun.includes('provider_key')) {
      const startTime = Date.now();
      const { list: botProviderKeys } = await this.botProviderKeyService.list({
        botId: bot.id,
      });

      if (botProviderKeys.length === 0) {
        results.push({
          name: 'provider_key',
          status: 'fail',
          message: 'No provider keys configured',
        });
        recommendations.push('Add at least one AI provider key');
      } else {
        // Verify the primary provider key
        const primaryKey = botProviderKeys.find((k) => k.isPrimary);
        if (primaryKey) {
          const providerKey = await this.providerKeyService.getById(
            primaryKey.providerKeyId,
          );
          if (providerKey) {
            try {
              const secret = this.encryptionService.decrypt(
                Buffer.from(providerKey.secretEncrypted),
              );
              const verifyResult = await this.providerVerifyClient.verify({
                vendor: providerKey.vendor as VerifyProviderKeyInput['vendor'],
                secret,
                baseUrl: providerKey.baseUrl || undefined,
              });
              const latency = Date.now() - startTime;

              if (verifyResult.valid) {
                results.push({
                  name: 'provider_key',
                  status: 'pass',
                  message: 'API Key valid',
                  latency,
                });
              } else {
                results.push({
                  name: 'provider_key',
                  status: 'fail',
                  message: verifyResult.error || 'API Key invalid',
                  latency,
                });
                recommendations.push('Update your API key');
              }
            } catch (error) {
              results.push({
                name: 'provider_key',
                status: 'fail',
                message: 'Failed to verify API key',
              });
              recommendations.push('Check your API key configuration');
            }
          }
        } else {
          results.push({
            name: 'provider_key',
            status: 'warning',
            message: 'No primary provider key set',
          });
          recommendations.push('Set a primary provider key');
        }
      }
    }

    // Model Access Check
    if (checksToRun.includes('model_access')) {
      const { list: botProviderKeys } = await this.botProviderKeyService.list({
        botId: bot.id,
        isPrimary: true,
      });

      if (botProviderKeys.length > 0 && botProviderKeys[0]?.primaryModel) {
        results.push({
          name: 'model_access',
          status: 'pass',
          message: `Primary model: ${botProviderKeys[0].primaryModel}`,
        });
      } else {
        results.push({
          name: 'model_access',
          status: 'warning',
          message: 'No primary model configured',
        });
        recommendations.push('Configure a primary model');
      }
    }

    // Channel Tokens Check
    if (checksToRun.includes('channel_tokens')) {
      const { list: channels } = await this.botChannelService.list({
        botId: bot.id,
      });

      if (channels.length === 0) {
        results.push({
          name: 'channel_tokens',
          status: 'warning',
          message: 'No channels configured',
        });
        recommendations.push('Add at least one channel configuration');
      } else {
        const enabledChannels = channels.filter((c) => c.isEnabled);
        const connectedChannels = channels.filter(
          (c) => c.connectionStatus === 'CONNECTED',
        );
        const errorChannels = channels.filter((c) => c.lastError);

        if (enabledChannels.length === 0) {
          results.push({
            name: 'channel_tokens',
            status: 'warning',
            message: `${channels.length} channel(s) configured but none enabled`,
          });
          recommendations.push('Enable at least one channel');
        } else if (errorChannels.length > 0) {
          results.push({
            name: 'channel_tokens',
            status: 'fail',
            message: `${errorChannels.length} channel(s) have errors`,
          });
          recommendations.push('Check channel configurations for errors');
        } else if (connectedChannels.length === 0 && enabledChannels.length > 0) {
          results.push({
            name: 'channel_tokens',
            status: 'warning',
            message: `${enabledChannels.length} channel(s) enabled but not connected`,
          });
          recommendations.push('Start the bot to connect channels');
        } else {
          results.push({
            name: 'channel_tokens',
            status: 'pass',
            message: `${connectedChannels.length}/${enabledChannels.length} channel(s) connected`,
          });
        }
      }
    }

    // Container Check
    if (checksToRun.includes('container')) {
      if (bot.containerId) {
        const containerStatus = await this.dockerService.getContainerStatus(
          bot.containerId,
        );
        if (containerStatus) {
          if (containerStatus.running) {
            results.push({
              name: 'container',
              status: 'pass',
              message: 'Container running',
            });
          } else {
            results.push({
              name: 'container',
              status: 'fail',
              message: `Container stopped (exit code: ${containerStatus.exitCode})`,
            });
            recommendations.push('Restart the bot container');
          }
        } else {
          results.push({
            name: 'container',
            status: 'fail',
            message: 'Container not found',
          });
          recommendations.push('Start the bot to create a new container');
        }
      } else {
        results.push({
          name: 'container',
          status: 'warning',
          message: 'No container created yet',
        });
        recommendations.push('Start the bot to create a container');
      }
    }

    // Network Check - verify internal connectivity
    if (checksToRun.includes('network')) {
      const startTime = Date.now();

      // Check if container exists and is running first
      if (!bot.containerId) {
        results.push({
          name: 'network',
          status: 'warning',
          message: 'No container to check network connectivity',
        });
        recommendations.push('Start the bot to check network connectivity');
      } else {
        try {
          // Check container network configuration
          const containerStatus = await this.dockerService.getContainerStatus(
            bot.containerId,
          );
          const latency = Date.now() - startTime;

          if (!containerStatus) {
            results.push({
              name: 'network',
              status: 'fail',
              message: 'Container not found for network check',
              latency,
            });
            recommendations.push('Recreate the bot container');
          } else if (!containerStatus.running) {
            results.push({
              name: 'network',
              status: 'warning',
              message: 'Container not running, cannot verify network',
              latency,
            });
            recommendations.push('Start the bot to verify network connectivity');
          } else {
            // Container is running, check if it has network access
            // Verify container is on the expected network
            const networkInfo =
              await this.dockerService.getContainerNetworkInfo(bot.containerId);

            if (networkInfo && networkInfo.networks.length > 0) {
              results.push({
                name: 'network',
                status: 'pass',
                message: `Container connected to ${networkInfo.networks.length} network(s)`,
                latency,
              });
            } else {
              results.push({
                name: 'network',
                status: 'fail',
                message: 'Container has no network connections',
                latency,
              });
              recommendations.push('Check Docker network configuration');
            }
          }
        } catch (error) {
          const latency = Date.now() - startTime;
          results.push({
            name: 'network',
            status: 'fail',
            message:
              error instanceof Error
                ? `Network check error: ${error.message}`
                : 'Failed to check network connectivity',
            latency,
          });
          recommendations.push('Check Docker daemon and network configuration');
        }
      }
    }

    // Determine overall status
    const hasError = results.some((r) => r.status === 'fail');
    const hasWarning = results.some((r) => r.status === 'warning');
    const overall = hasError ? 'error' : hasWarning ? 'warning' : 'healthy';

    return {
      overall,
      checks: results,
      recommendations,
    };
  }

  // ============================================================================
  // Bot Logs
  // ============================================================================

  /**
   * 获取 Bot 容器日志
   * @param hostname Bot hostname
   * @param userId 用户 ID
   * @param options 日志选项
   * @returns 解析后的日志条目数组
   */
  async getBotLogs(
    hostname: string,
    userId: string,
    options: { tail?: number; since?: number } = {},
  ): Promise<{
    logs: Array<{
      id: string;
      timestamp: string;
      level: 'info' | 'warn' | 'error' | 'debug';
      message: string;
    }>;
    containerId: string | null;
  }> {
    const bot = await this.getBotByHostname(hostname, userId);

    if (!bot.containerId) {
      return { logs: [], containerId: null };
    }

    try {
      const rawLogs = await this.dockerService.getContainerLogs(
        bot.containerId,
        {
          tail: options.tail || 100,
          since: options.since,
        },
      );

      // Parse raw logs into structured format
      const logs = this.parseContainerLogs(rawLogs);

      return { logs, containerId: bot.containerId };
    } catch (error) {
      this.logger.error(
        `Failed to get logs for bot ${hostname}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return { logs: [], containerId: bot.containerId };
    }
  }

  /**
   * 解析容器日志为结构化格式
   */
  private parseContainerLogs(rawLogs: string): Array<{
    id: string;
    timestamp: string;
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
  }> {
    if (!rawLogs || rawLogs === 'Docker not available') {
      return [];
    }

    const lines = rawLogs.split('\n').filter((line) => line.trim());
    const logs: Array<{
      id: string;
      timestamp: string;
      level: 'info' | 'warn' | 'error' | 'debug';
      message: string;
    }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip empty lines and Docker stream header bytes
      const cleanLine = line.replace(/^[\x00-\x1f]+/, '').trim();
      if (!cleanLine) continue;

      // Try to parse timestamp from common log formats
      // Format 1: ISO timestamp at start (2024-01-15T10:30:15.123Z)
      // Format 2: Date time format (2024-01-15 10:30:15)
      let timestamp = new Date().toISOString();
      let message = cleanLine;

      // Try ISO format
      const isoMatch = cleanLine.match(
        /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\s*(.*)/,
      );
      if (isoMatch) {
        timestamp = isoMatch[1];
        message = isoMatch[2];
      } else {
        // Try date time format
        const dateMatch = cleanLine.match(
          /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s*(.*)/,
        );
        if (dateMatch) {
          timestamp = dateMatch[1];
          message = dateMatch[2];
        }
      }

      // Determine log level from message content
      const lowerMessage = message.toLowerCase();
      let level: 'info' | 'warn' | 'error' | 'debug' = 'info';
      if (
        lowerMessage.includes('error') ||
        lowerMessage.includes('err') ||
        lowerMessage.includes('fail')
      ) {
        level = 'error';
      } else if (
        lowerMessage.includes('warn') ||
        lowerMessage.includes('warning')
      ) {
        level = 'warn';
      } else if (lowerMessage.includes('debug')) {
        level = 'debug';
      }

      logs.push({
        id: `log-${i}-${Date.now()}`,
        timestamp,
        level,
        message: message || cleanLine,
      });
    }

    return logs;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private toProviderKeyDto(key: ProviderKey): ProviderKeyDto {
    return {
      id: key.id,
      vendor: key.vendor as ProviderKeyDto['vendor'],
      apiType: (key.apiType as ProviderKeyDto['apiType']) || null,
      label: key.label,
      tag: key.tag,
      baseUrl: key.baseUrl,
      createdAt: key.createdAt,
    };
  }

  /**
   * 检查并更新 Bot 状态
   * 当 Bot 同时配置了渠道和 AI Provider 时，自动将状态从 draft 更新为 created
   */
  private async checkAndUpdateBotStatus(botId: string): Promise<void> {
    try {
      // 获取当前 bot 状态
      const bot = await this.botService.getById(botId);
      if (!bot) {
        this.logger.warn(`Bot not found when checking status: ${botId}`);
        return;
      }

      // 只有 draft 状态的 bot 需要检查
      if (bot.status !== 'draft') {
        this.logger.debug(
          `Bot ${botId} is not in draft status (${bot.status}), skipping status update`,
        );
        return;
      }

      // 检查是否有渠道配置
      const { total: channelCount } = await this.botChannelService.list({
        botId,
      });
      const hasChannel = channelCount > 0;

      // 检查是否有 AI Provider 配置
      const { total: providerCount } = await this.botProviderKeyService.list({
        botId,
      });
      const hasProvider = providerCount > 0;

      this.logger.debug(
        `Bot ${botId} configuration status: hasChannel=${hasChannel}, hasProvider=${hasProvider}`,
      );

      // 如果同时配置了渠道和 AI Provider，更新状态为 created
      if (hasChannel && hasProvider) {
        await this.botService.update({ id: botId }, { status: 'created' });
        this.logger.log(
          `Bot ${botId} status updated from draft to created (both channel and AI provider configured)`,
        );
      }
    } catch (error) {
      // 状态更新失败不应影响主流程
      this.logger.error(
        `Failed to check and update bot status for ${botId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
