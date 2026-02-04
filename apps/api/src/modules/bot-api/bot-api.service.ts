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
import { KeyringProxyClient } from '@app/clients/internal/keyring-proxy';
import { EncryptionService } from './services/encryption.service';
import { DockerService } from './services/docker.service';
import { WorkspaceService } from './services/workspace.service';
import type { Bot, ProviderKey } from '@prisma/client';
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
    private readonly keyringProxyClient: KeyringProxyClient,
  ) {
    // Get proxy URL for bot containers (different from admin URL)
    this.proxyUrl = this.configService.get<string>('PROXY_BOT_URL');
  }

  // ============================================================================
  // Bot Operations
  // ============================================================================

  async listBots(userId: string): Promise<Bot[]> {
    const { list } = await this.botService.list({ createdById: userId });

    // Enrich with container status
    const enrichedBots = await Promise.all(
      list.map(async (bot) => {
        if (bot.containerId) {
          const containerStatus = await this.dockerService.getContainerStatus(
            bot.containerId,
          );
          return { ...bot, containerStatus };
        }
        return bot;
      }),
    );

    return enrichedBots;
  }

  async getBotByHostname(hostname: string, userId: string): Promise<Bot> {
    const bot = await this.botService.getByHostname(hostname);
    if (!bot || bot.createdById !== userId) {
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
    // Check if hostname already exists
    const existing = await this.botService.getByHostname(input.hostname);
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
      name: input.name,
      aiProvider: primaryProvider.providerId,
      model: primaryProvider.model,
      channelType: input.channels[0].channelType,
      persona: input.persona,
      features: input.features,
    });

    // Determine API type from provider config
    const providerConfig = PROVIDER_CONFIGS[primaryProvider.providerId as keyof typeof PROVIDER_CONFIGS];
    const apiType = providerConfig?.apiType || 'openai';

    // Get provider key if keyId is provided
    let apiKey: string | undefined;
    let apiBaseUrl: string | undefined;
    let proxyToken: string | undefined;
    let proxyTokenHash: string | undefined;

    // Check if zero-trust mode is available (keyring-proxy configured and healthy)
    const useZeroTrust = this.keyringProxyClient.isConfigured() && this.proxyUrl;

    if (primaryProvider.keyId) {
      try {
        const providerKey = await this.providerKeyService.get({
          id: primaryProvider.keyId,
        });
        if (providerKey && providerKey.createdById === userId) {
          if (useZeroTrust) {
            // Zero-trust mode: Register bot with proxy, don't pass API key to container
            // The proxy will inject the API key at request time
            this.logger.log(
              `Using zero-trust mode for bot ${input.hostname}`,
            );

            // Note: In zero-trust mode, the API key is managed by the proxy
            // We need to ensure the key is registered with the proxy
            // For now, we'll use the custom baseUrl if provided, otherwise use proxy
            apiBaseUrl = providerKey.baseUrl || undefined;
          } else {
            // Direct mode: Decrypt and pass API key to container
            apiKey = this.encryptionService.decrypt(
              Buffer.from(providerKey.secretEncrypted),
            );
            apiBaseUrl = providerKey.baseUrl || undefined;

            // Write API key to secrets directory for the bot
            await this.workspaceService.writeApiKey(
              input.hostname,
              providerKey.vendor,
              apiKey,
            );
          }

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

    // Register bot with keyring-proxy if in zero-trust mode
    if (useZeroTrust) {
      try {
        const registration = await this.keyringProxyClient.registerBot(
          input.hostname, // Use hostname as botId for now
          input.hostname,
          input.tags,
        );
        proxyToken = registration.token;
        // Hash the token for storage (we don't store the raw token)
        proxyTokenHash = this.encryptionService.hashToken(proxyToken);
        this.logger.log(`Bot ${input.hostname} registered with keyring-proxy`);
      } catch (error) {
        this.logger.warn(
          `Failed to register bot with keyring-proxy, falling back to direct mode:`,
          error,
        );
        // Fall back to direct mode if proxy registration fails
        if (primaryProvider.keyId && !apiKey) {
          try {
            const providerKey = await this.providerKeyService.get({
              id: primaryProvider.keyId,
            });
            if (providerKey && providerKey.createdById === userId) {
              apiKey = this.encryptionService.decrypt(
                Buffer.from(providerKey.secretEncrypted),
              );
              await this.workspaceService.writeApiKey(
                input.hostname,
                providerKey.vendor,
                apiKey,
              );
            }
          } catch (keyError) {
            this.logger.warn(`Failed to get provider key for fallback:`, keyError);
          }
        }
      }
    }

    // Create container
    let containerId: string | null = null;
    try {
      containerId = await this.dockerService.createContainer({
        hostname: input.hostname,
        name: input.name,
        port,
        gatewayToken,
        aiProvider: primaryProvider.providerId,
        model: primaryProvider.model,
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
      model: primaryProvider.model,
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

    // Revoke bot from keyring-proxy if configured
    if (this.keyringProxyClient.isConfigured() && bot.proxyTokenHash) {
      try {
        await this.keyringProxyClient.revokeBot(bot.id);
        this.logger.log(`Bot ${hostname} revoked from keyring-proxy`);
      } catch (error) {
        this.logger.warn(`Failed to revoke bot from keyring-proxy:`, error);
      }
    }

    // Delete workspace
    try {
      await this.workspaceService.deleteWorkspace(hostname);
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

        // Check if zero-trust mode is available
        const useZeroTrust = this.keyringProxyClient.isConfigured() && this.proxyUrl;

        if (botProviderKey) {
          try {
            const providerKey = await this.providerKeyService.get({
              id: botProviderKey.providerKeyId,
            });
            if (providerKey && providerKey.createdById === userId) {
              // Get API type from provider config
              const providerConfig = PROVIDER_CONFIGS[providerKey.vendor as keyof typeof PROVIDER_CONFIGS];
              apiType = providerConfig?.apiType || 'openai';
              apiBaseUrl = providerKey.baseUrl || undefined;

              if (useZeroTrust) {
                // Zero-trust mode: Register bot with proxy
                try {
                  const registration = await this.keyringProxyClient.registerBot(
                    bot.id,
                    hostname,
                    bot.tags,
                  );
                  proxyToken = registration.token;
                  // Update proxyTokenHash in database
                  const proxyTokenHash = this.encryptionService.hashToken(proxyToken);
                  await this.botService.update({ id: bot.id }, { proxyTokenHash });
                  this.logger.log(`Bot ${hostname} registered with keyring-proxy for start`);
                } catch (proxyError) {
                  this.logger.warn(
                    `Failed to register bot with keyring-proxy, falling back to direct mode:`,
                    proxyError,
                  );
                  // Fall back to direct mode
                  apiKey = this.encryptionService.decrypt(
                    Buffer.from(providerKey.secretEncrypted),
                  );
                  await this.workspaceService.writeApiKey(
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
        const workspacePath = this.workspaceService.getWorkspacePath(hostname);
        const containerId = await this.dockerService.createContainer({
          hostname: bot.hostname,
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
    const knownHostnames = bots.map((b) => b.hostname);

    const orphanedContainers =
      await this.dockerService.findOrphanedContainers(knownHostnames);
    const orphanedWorkspaces =
      await this.workspaceService.findOrphanedWorkspaces(knownHostnames);
    const orphanedSecrets =
      await this.workspaceService.findOrphanedSecrets(knownHostnames);

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
    const knownHostnames = bots.map((b) => b.hostname);

    const containerReport =
      await this.dockerService.cleanupOrphans(knownHostnames);

    // Cleanup orphaned workspaces
    const orphanedWorkspaces =
      await this.workspaceService.findOrphanedWorkspaces(knownHostnames);
    let workspacesRemoved = 0;
    for (const hostname of orphanedWorkspaces) {
      try {
        await this.workspaceService.deleteWorkspace(hostname);
        workspacesRemoved++;
      } catch (error) {
        this.logger.warn(
          `Failed to remove orphaned workspace ${hostname}:`,
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
      secretEncrypted,
      label: input.label || null,
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

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private toProviderKeyDto(key: ProviderKey): ProviderKeyDto {
    return {
      id: key.id,
      vendor: key.vendor as ProviderKeyDto['vendor'],
      label: key.label,
      tag: key.tag,
      baseUrl: key.baseUrl,
      createdAt: key.createdAt,
    };
  }
}
