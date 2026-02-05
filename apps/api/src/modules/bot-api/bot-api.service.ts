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
} from '@app/db';
import { ProviderVerifyClient } from '@app/clients/internal/provider-verify';
import { KeyringProxyService } from '../proxy/services/keyring-proxy.service';
import { EncryptionService } from './services/encryption.service';
import { DockerService } from './services/docker.service';
import { WorkspaceService } from './services/workspace.service';
import type { Bot, ProviderKey, BotStatus } from '@prisma/client';
import type {
  CreateBotInput,
  AddProviderKeyInput,
  ProviderKey as ProviderKeyDto,
  ContainerStats,
  OrphanReport,
  CleanupReport,
  VerifyProviderKeyInput,
  VerifyProviderKeyResponse,
} from '@repo/contracts';
import { PROVIDER_CONFIGS } from '@repo/contracts';
import enviromentUtil from 'libs/infra/utils/enviroment.util';

@Injectable()
export class BotApiService {
  private readonly logger = new Logger(BotApiService.name);
  private readonly proxyUrl: string | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly botService: BotService,
    private readonly providerKeyService: ProviderKeyService,
    private readonly botProviderKeyService: BotProviderKeyService,
    private readonly encryptionService: EncryptionService,
    private readonly dockerService: DockerService,
    private readonly workspaceService: WorkspaceService,
    private readonly operateLogService: OperateLogService,
    private readonly personaTemplateService: PersonaTemplateService,
    private readonly providerVerifyClient: ProviderVerifyClient,
    private readonly keyringProxyService: KeyringProxyService,
  ) {
    // Get internal API URL for bot containers to reach the proxy
    this.proxyUrl = enviromentUtil.generateEnvironmentUrls().internalApi;
    // this.configService.get<string>(
    //   'INTERNAL_API_BASE_URL',
    //   'http://clawbot-api:3200',
    // );
  }

  // ============================================================================
  // Bot Operations
  // ============================================================================

  async listBots(userId: string): Promise<Bot[]> {
    const { list } = await this.botService.list({ createdById: userId });

    // Enrich with container status and sync database status if needed
    const enrichedBots = await Promise.all(
      list.map(async (bot) => {
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
              return { ...bot, status: actualStatus, containerStatus };
            }
          }

          return { ...bot, containerStatus };
        }
        return bot;
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

    // Enrich with container status
    if (bot.containerId) {
      const containerStatus = await this.dockerService.getContainerStatus(
        bot.containerId,
      );
      return { ...bot, containerStatus } as Bot;
    }

    return bot;
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

    // Create container
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
        proxyUrl: proxyToken ? this.proxyUrl : undefined,
        proxyToken,
        apiType,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to create container for ${input.hostname}:`,
        error,
      );
      // Continue without container - can be created later
    }

    // Create bot in database（port 必须为 number，Prisma Int 不接受 string）
    const bot = await this.botService.create({
      name: input.name,
      hostname: input.hostname,
      aiProvider: primaryProvider.providerId,
      model: primaryProvider.primaryModel || primaryProvider.models[0],
      channelType: input.channels[0].channelType,
      containerId,
      port: typeof port === 'number' ? port : Number(port),
      gatewayToken,
      proxyTokenHash: proxyTokenHash || null,
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

    this.logger.log(`Bot created: ${input.hostname}`);

    // Create BotProviderKey relationship if keyId is provided
    if (primaryProvider.keyId) {
      try {
        await this.botProviderKeyService.create({
          bot: { connect: { id: bot.id } },
          providerKey: { connect: { id: primaryProvider.keyId } },
          isPrimary: true,
        });
        this.logger.log(
          `BotProviderKey created for bot ${bot.id} with key ${primaryProvider.keyId}`,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to create BotProviderKey for bot ${bot.id}:`,
          error,
        );
      }
    }

    // Register bot with proxy if in zero-trust mode
    if (useZeroTrust && primaryProvider.keyId) {
      try {
        const registration = await this.keyringProxyService.registerBot(
          bot.id,
          primaryProvider.providerId,
          primaryProvider.keyId,
          input.tags,
        );
        proxyToken = registration.token;
        proxyTokenHash = this.encryptionService.hashToken(proxyToken);

        // Update bot with proxyTokenHash
        await this.botService.update({ id: bot.id }, { proxyTokenHash });

        // Update container environment with proxy token if container exists
        if (containerId) {
          // Note: Container needs to be recreated with proxy token
          // For now, we'll need to restart the bot to apply the proxy token
          this.logger.log(
            `Bot ${input.hostname} registered with proxy. Restart required to apply proxy token.`,
          );
        }

        this.logger.log(`Bot ${input.hostname} registered with proxy`);
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

    // Log operation
    await this.operateLogService.create({
      user: { connect: { id: userId } },
      operateType: 'CREATE',
      target: 'BOT',
      targetId: bot.id,
      targetName: bot.name,
      detail: {
        hostname: bot.hostname,
        aiProvider: bot.aiProvider,
        model: bot.model,
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

  async startBot(
    hostname: string,
    userId: string,
  ): Promise<{ success: boolean; status: string }> {
    const bot = await this.getBotByHostname(hostname, userId);

    // Update status to starting
    await this.botService.update({ id: bot.id }, { status: 'starting' });

    try {
      if (bot.containerId) {
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
                  const registration =
                    await this.keyringProxyService.registerBot(
                      bot.id,
                      providerKey.vendor,
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
        const containerId = await this.dockerService.createContainer({
          hostname: bot.hostname,
          isolationKey,
          name: bot.name,
          port: bot.port || 9200,
          gatewayToken: bot.gatewayToken || '',
          aiProvider: bot.aiProvider,
          model: bot.model,
          channelType: bot.channelType,
          workspacePath,
          apiKey,
          apiBaseUrl,
          proxyUrl: proxyToken ? this.proxyUrl : undefined,
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

  async listProviderKeys(userId: string): Promise<ProviderKeyDto[]> {
    const { list } = await this.providerKeyService.list({
      createdById: userId,
    });
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

  async deleteProviderKey(
    id: string,
    userId: string,
  ): Promise<{ ok: boolean }> {
    const key = await this.providerKeyService.get({ id });
    if (!key || key.createdById !== userId) {
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

  async getProviderKeyHealth(userId: string): Promise<{
    status: string;
    keyCount: number;
    botCount: number;
  }> {
    const [keyResult, botResult] = await Promise.all([
      this.providerKeyService.list({ createdById: userId }, { limit: 1 }),
      this.botService.list({ createdById: userId }, { limit: 1 }),
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
    return this.providerVerifyClient.verify({
      vendor: key.vendor as VerifyProviderKeyInput['vendor'],
      secret,
      baseUrl: key.baseUrl || undefined,
    });
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
}
