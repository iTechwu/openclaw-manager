import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Docker from 'dockerode';
import { isAbsolute, join } from 'node:path';
import type { ContainerStats, OrphanReport, CleanupReport } from '@repo/contracts';

export interface ContainerInfo {
  id: string;
  state: string;
  running: boolean;
  exitCode: number;
  startedAt: string;
  finishedAt: string;
}

export interface CreateContainerOptions {
  hostname: string;
  name: string;
  port: number;
  gatewayToken: string;
  aiProvider: string;
  model: string;
  channelType: string;
  workspacePath: string;
  /** API key for the provider (will be passed as environment variable) - used in direct mode */
  apiKey?: string;
  /** Custom API base URL for the provider - used in direct mode */
  apiBaseUrl?: string;
  /** Proxy URL for zero-trust mode (e.g., http://keyring-proxy:8080) */
  proxyUrl?: string;
  /** Bot token for proxy authentication - used in zero-trust mode */
  proxyToken?: string;
  /** API type for the provider (openai, anthropic, gemini, etc.) */
  apiType?: string;
}

@Injectable()
export class DockerService implements OnModuleInit {
  private readonly logger = new Logger(DockerService.name);
  private docker: Docker;
  private readonly botImage: string;
  private readonly portStart: number;
  private readonly dataDir: string;
  private readonly secretsDir: string;
  private readonly containerPrefix = 'botmaker-';

  constructor(private readonly configService: ConfigService) {
    this.botImage = this.configService.get<string>('BOT_IMAGE', 'openclaw:latest');
    // 环境变量为字符串，需显式转换为 number，否则 Prisma Int 字段会校验失败
    const portStartRaw = this.configService.get<string | number>('BOT_PORT_START', 9200);
    this.portStart = typeof portStartRaw === 'number' ? portStartRaw : Number(portStartRaw) || 9200;
    const dataDir = this.configService.get<string>('BOT_DATA_DIR', '/data/bots');
    const secretsDir = this.configService.get<string>('BOT_SECRETS_DIR', '/data/secrets');

    // 统一规范为绝对路径，避免 Docker 把相对路径当作 volume 名称（从而报类似 "includes invalid characters"）
    this.dataDir = isAbsolute(dataDir) ? dataDir : join(process.cwd(), dataDir);
    this.secretsDir = isAbsolute(secretsDir) ? secretsDir : join(process.cwd(), secretsDir);
  }

  async onModuleInit() {
    try {
      this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
      await this.docker.ping();
      this.logger.log('Docker connection established');
    } catch (error) {
      this.logger.warn('Docker not available, container operations will be simulated');
      this.docker = null as unknown as Docker;
    }
  }

  /**
   * Check if Docker is available
   */
  isAvailable(): boolean {
    return this.docker !== null;
  }

  /**
   * Create and start a container for a bot
   */
  async createContainer(options: CreateContainerOptions): Promise<string> {
    if (!this.isAvailable()) {
      this.logger.warn('Docker not available, simulating container creation');
      return `simulated-${options.hostname}`;
    }

    const containerName = `${this.containerPrefix}${options.hostname}`;

    // Check if container already exists
    try {
      const existing = this.docker.getContainer(containerName);
      const info = await existing.inspect();
      if (info) {
        this.logger.log(`Container ${containerName} already exists, removing...`);
        await existing.remove({ force: true });
      }
    } catch {
      // Container doesn't exist, which is expected
    }

    // Build environment variables
    const envVars = [
      `BOT_HOSTNAME=${options.hostname}`,
      `BOT_NAME=${options.name}`,
      `BOT_PORT=${options.port}`,
      `GATEWAY_TOKEN=${options.gatewayToken}`,
      `AI_PROVIDER=${options.aiProvider}`,
      `AI_MODEL=${options.model}`,
      `CHANNEL_TYPE=${options.channelType}`,
    ];

    // Add API type if provided
    if (options.apiType) {
      envVars.push(`AI_API_TYPE=${options.apiType}`);
    }

    // Zero-trust mode: Use proxy URL and token instead of direct API key
    if (options.proxyUrl && options.proxyToken) {
      // Pass proxy configuration to container
      envVars.push(`PROXY_URL=${options.proxyUrl}`);
      envVars.push(`PROXY_TOKEN=${options.proxyToken}`);

      // Build proxy endpoint based on API type
      const apiType = options.apiType || 'openai';
      const proxyEndpoint = `${options.proxyUrl}/v1/${apiType}`;

      // Map provider to standard base URL environment variable names
      // All providers will use the proxy endpoint as their base URL
      const baseUrlEnvMap: Record<string, string> = {
        openai: 'OPENAI_BASE_URL',
        anthropic: 'ANTHROPIC_BASE_URL',
        google: 'GOOGLE_BASE_URL',
        'azure-openai': 'AZURE_OPENAI_ENDPOINT',
        groq: 'GROQ_BASE_URL',
        mistral: 'MISTRAL_BASE_URL',
        deepseek: 'DEEPSEEK_BASE_URL',
        venice: 'VENICE_BASE_URL',
        openrouter: 'OPENROUTER_BASE_URL',
        together: 'TOGETHER_BASE_URL',
        fireworks: 'FIREWORKS_BASE_URL',
        perplexity: 'PERPLEXITY_BASE_URL',
        cohere: 'COHERE_BASE_URL',
        ollama: 'OLLAMA_BASE_URL',
      };

      const baseUrlEnvName = baseUrlEnvMap[options.aiProvider] || `${options.aiProvider.toUpperCase().replace(/-/g, '_')}_BASE_URL`;
      envVars.push(`${baseUrlEnvName}=${proxyEndpoint}`);

      this.logger.log(`Container ${options.hostname} configured in zero-trust mode with proxy: ${proxyEndpoint}`);
    } else {
      // Direct mode: Pass API key and base URL directly
      // Add provider-specific environment variables based on vendor
      if (options.apiKey) {
        // Map provider to standard environment variable names
        const providerEnvMap: Record<string, string> = {
          openai: 'OPENAI_API_KEY',
          anthropic: 'ANTHROPIC_API_KEY',
          google: 'GOOGLE_API_KEY',
          'azure-openai': 'AZURE_OPENAI_API_KEY',
          groq: 'GROQ_API_KEY',
          mistral: 'MISTRAL_API_KEY',
          deepseek: 'DEEPSEEK_API_KEY',
          venice: 'VENICE_API_KEY',
          openrouter: 'OPENROUTER_API_KEY',
          together: 'TOGETHER_API_KEY',
          fireworks: 'FIREWORKS_API_KEY',
          perplexity: 'PERPLEXITY_API_KEY',
          cohere: 'COHERE_API_KEY',
          ollama: 'OLLAMA_API_KEY',
        };

        const envKeyName = providerEnvMap[options.aiProvider] || `${options.aiProvider.toUpperCase().replace(/-/g, '_')}_API_KEY`;
        envVars.push(`${envKeyName}=${options.apiKey}`);
      }

      // Add custom base URL if provided
      if (options.apiBaseUrl) {
        const baseUrlEnvMap: Record<string, string> = {
          openai: 'OPENAI_BASE_URL',
          anthropic: 'ANTHROPIC_BASE_URL',
          google: 'GOOGLE_BASE_URL',
          'azure-openai': 'AZURE_OPENAI_ENDPOINT',
          groq: 'GROQ_BASE_URL',
          mistral: 'MISTRAL_BASE_URL',
          deepseek: 'DEEPSEEK_BASE_URL',
          venice: 'VENICE_BASE_URL',
          openrouter: 'OPENROUTER_BASE_URL',
          together: 'TOGETHER_BASE_URL',
          fireworks: 'FIREWORKS_BASE_URL',
          perplexity: 'PERPLEXITY_BASE_URL',
          cohere: 'COHERE_BASE_URL',
          ollama: 'OLLAMA_BASE_URL',
        };

        const baseUrlEnvName = baseUrlEnvMap[options.aiProvider] || `${options.aiProvider.toUpperCase().replace(/-/g, '_')}_BASE_URL`;
        envVars.push(`${baseUrlEnvName}=${options.apiBaseUrl}`);
      }

      this.logger.log(`Container ${options.hostname} configured in direct mode`);
    }

    const container = await this.docker.createContainer({
      name: containerName,
      Image: this.botImage,
      Env: envVars,
      ExposedPorts: {
        [`${options.port}/tcp`]: {},
      },
      HostConfig: {
        PortBindings: {
          [`${options.port}/tcp`]: [{ HostPort: String(options.port) }],
        },
        Binds: [
          `${options.workspacePath}:/app/workspace:rw`,
          `${this.secretsDir}/${options.hostname}:/app/secrets:ro`,
        ],
        RestartPolicy: { Name: 'unless-stopped' },
        NetworkMode: 'bridge',
      },
      Labels: {
        'botmaker.hostname': options.hostname,
        'botmaker.managed': 'true',
      },
    });

    this.logger.log(`Container created: ${container.id}`);
    return container.id;
  }

  /**
   * Start a container
   */
  async startContainer(containerId: string): Promise<void> {
    if (!this.isAvailable()) {
      this.logger.warn('Docker not available, simulating container start');
      return;
    }

    const container = this.docker.getContainer(containerId);
    await container.start();
    this.logger.log(`Container started: ${containerId}`);
  }

  /**
   * Stop a container
   */
  async stopContainer(containerId: string): Promise<void> {
    if (!this.isAvailable()) {
      this.logger.warn('Docker not available, simulating container stop');
      return;
    }

    const container = this.docker.getContainer(containerId);
    await container.stop({ t: 10 }); // 10 second timeout
    this.logger.log(`Container stopped: ${containerId}`);
  }

  /**
   * Remove a container
   */
  async removeContainer(containerId: string): Promise<void> {
    if (!this.isAvailable()) {
      this.logger.warn('Docker not available, simulating container removal');
      return;
    }

    const container = this.docker.getContainer(containerId);
    await container.remove({ force: true });
    this.logger.log(`Container removed: ${containerId}`);
  }

  /**
   * Get container status
   */
  async getContainerStatus(containerId: string): Promise<ContainerInfo | null> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const container = this.docker.getContainer(containerId);
      const info = await container.inspect();
      return {
        id: info.Id,
        state: info.State.Status,
        running: info.State.Running,
        exitCode: info.State.ExitCode,
        startedAt: info.State.StartedAt,
        finishedAt: info.State.FinishedAt,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get container stats for all managed containers
   */
  async getAllContainerStats(): Promise<ContainerStats[]> {
    if (!this.isAvailable()) {
      return [];
    }

    const containers = await this.docker.listContainers({
      all: true,
      filters: { label: ['botmaker.managed=true'] },
    });

    const stats: ContainerStats[] = [];

    for (const containerInfo of containers) {
      try {
        const container = this.docker.getContainer(containerInfo.Id);
        const containerStats = await container.stats({ stream: false });
        const hostname = containerInfo.Labels['botmaker.hostname'] || 'unknown';

        // Calculate CPU percentage
        const cpuDelta =
          containerStats.cpu_stats.cpu_usage.total_usage -
          containerStats.precpu_stats.cpu_usage.total_usage;
        const systemDelta =
          containerStats.cpu_stats.system_cpu_usage -
          containerStats.precpu_stats.system_cpu_usage;
        const cpuPercent =
          systemDelta > 0
            ? (cpuDelta / systemDelta) *
              containerStats.cpu_stats.online_cpus *
              100
            : 0;

        // Calculate memory
        const memoryUsage = containerStats.memory_stats.usage || 0;
        const memoryLimit = containerStats.memory_stats.limit || 1;
        const memoryPercent = (memoryUsage / memoryLimit) * 100;

        // Calculate network
        const networks = containerStats.networks || {};
        let networkRxBytes = 0;
        let networkTxBytes = 0;
        for (const net of Object.values(networks)) {
          networkRxBytes += (net as { rx_bytes: number }).rx_bytes || 0;
          networkTxBytes += (net as { tx_bytes: number }).tx_bytes || 0;
        }

        stats.push({
          hostname,
          name: containerInfo.Names[0]?.replace(/^\//, '') || hostname,
          cpuPercent: Math.round(cpuPercent * 100) / 100,
          memoryUsage,
          memoryLimit,
          memoryPercent: Math.round(memoryPercent * 100) / 100,
          networkRxBytes,
          networkTxBytes,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        this.logger.warn(`Failed to get stats for container ${containerInfo.Id}:`, error);
      }
    }

    return stats;
  }

  /**
   * Find orphaned containers (containers without corresponding database entries)
   */
  async findOrphanedContainers(knownHostnames: string[]): Promise<string[]> {
    if (!this.isAvailable()) {
      return [];
    }

    const containers = await this.docker.listContainers({
      all: true,
      filters: { label: ['botmaker.managed=true'] },
    });

    const orphaned: string[] = [];
    for (const container of containers) {
      const hostname = container.Labels['botmaker.hostname'];
      if (hostname && !knownHostnames.includes(hostname)) {
        orphaned.push(hostname);
      }
    }

    return orphaned;
  }

  /**
   * Get orphan report
   */
  async getOrphanReport(knownHostnames: string[]): Promise<OrphanReport> {
    const orphanedContainers = await this.findOrphanedContainers(knownHostnames);

    // TODO: Implement workspace and secrets orphan detection
    const orphanedWorkspaces: string[] = [];
    const orphanedSecrets: string[] = [];

    return {
      orphanedContainers,
      orphanedWorkspaces,
      orphanedSecrets,
      total: orphanedContainers.length + orphanedWorkspaces.length + orphanedSecrets.length,
    };
  }

  /**
   * Cleanup orphaned resources
   */
  async cleanupOrphans(knownHostnames: string[]): Promise<CleanupReport> {
    const orphanedContainers = await this.findOrphanedContainers(knownHostnames);

    let containersRemoved = 0;
    for (const hostname of orphanedContainers) {
      try {
        const containerName = `${this.containerPrefix}${hostname}`;
        const container = this.docker.getContainer(containerName);
        await container.remove({ force: true });
        containersRemoved++;
        this.logger.log(`Removed orphaned container: ${containerName}`);
      } catch (error) {
        this.logger.warn(`Failed to remove orphaned container for ${hostname}:`, error);
      }
    }

    // TODO: Implement workspace and secrets cleanup
    const workspacesRemoved = 0;
    const secretsRemoved = 0;

    return {
      success: true,
      containersRemoved,
      workspacesRemoved,
      secretsRemoved,
    };
  }

  /**
   * Allocate a port for a new bot
   */
  async allocatePort(usedPorts: number[]): Promise<number> {
    let port = Number(this.portStart) || 9200;
    while (usedPorts.includes(port)) {
      port++;
    }
    return port;
  }

  /**
   * Get container logs
   */
  async getContainerLogs(
    containerId: string,
    options: { tail?: number; since?: number } = {},
  ): Promise<string> {
    if (!this.isAvailable()) {
      return 'Docker not available';
    }

    const container = this.docker.getContainer(containerId);
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail: options.tail || 100,
      since: options.since,
    });

    return logs.toString();
  }
}
