import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Docker from 'dockerode';
import { isAbsolute, join } from 'node:path';
import { readdir, rm, stat } from 'node:fs/promises';
import { PROVIDER_CONFIGS } from '@repo/contracts';
import type {
  ContainerStats,
  OrphanReport,
  CleanupReport,
  ProviderVendor,
} from '@repo/contracts';
import { normalizeModelName } from '@/utils/model-normalizer';

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
  /** Isolation key for multi-tenant support (userId_short-hostname) */
  isolationKey: string;
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
  private readonly openclawDir: string;
  private readonly containerPrefix = 'clawbot-manager-';
  /**
   * Docker volume names for bot data, secrets, and OpenClaw data.
   * When running in a container, we need to use volume names instead of host paths
   * to correctly mount volumes into bot containers.
   */
  private readonly dataVolumeName: string | null;
  private readonly secretsVolumeName: string | null;
  private readonly openclawVolumeName: string | null;

  constructor(private readonly configService: ConfigService) {
    this.botImage = process.env.BOT_IMAGE || 'openclaw:latest';
    // 环境变量为字符串，需显式转换为 number，否则 Prisma Int 字段会校验失败
    const portStartRaw = process.env.BOT_PORT_START || 9200;
    this.portStart =
      typeof portStartRaw === 'number'
        ? portStartRaw
        : Number(portStartRaw) || 9200;
    const dataDir = process.env.BOT_DATA_DIR || '/data/bots';
    const secretsDir = process.env.BOT_SECRETS_DIR || '/data/secrets';
    const openclawDir = process.env.BOT_OPENCLAW_DIR || '/data/openclaw';

    // 统一规范为绝对路径，避免 Docker 把相对路径当作 volume 名称（从而报类似 "includes invalid characters"）
    this.dataDir = isAbsolute(dataDir) ? dataDir : join(process.cwd(), dataDir);
    this.secretsDir = isAbsolute(secretsDir)
      ? secretsDir
      : join(process.cwd(), secretsDir);
    this.openclawDir = isAbsolute(openclawDir)
      ? openclawDir
      : join(process.cwd(), openclawDir);

    // Volume names for containerized deployment
    // When set, bot containers will mount from these named volumes instead of host paths
    this.dataVolumeName = process.env.DATA_VOLUME_NAME || null;
    this.secretsVolumeName = process.env.SECRETS_VOLUME_NAME || null;
    this.openclawVolumeName = process.env.OPENCLAW_VOLUME_NAME || null;
  }

  async onModuleInit() {
    try {
      this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
      await this.docker.ping();
      this.logger.log('Docker connection established');
    } catch (error) {
      this.logger.warn(
        'Docker not available, container operations will be simulated',
      );
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
   * Build volume bindings for bot container.
   * When running in a container with named volumes (DATA_VOLUME_NAME/SECRETS_VOLUME_NAME/OPENCLAW_VOLUME_NAME set),
   * use volume names to allow bot containers to access the same data.
   * Otherwise, use host paths for local development.
   *
   * OpenClaw data directory (/home/node/.openclaw) is mounted to persist:
   * - Memory/sessions (conversation history)
   * - Agent configurations
   * - Identity data
   *
   * @param isolationKey - Isolation key for multi-tenant support (userId_short-hostname)
   * @param workspacePath - Full workspace path (used in host path mode)
   * @returns Array of volume bind strings for Docker
   */
  private buildVolumeBinds(
    isolationKey: string,
    workspacePath: string,
  ): string[] {
    if (
      this.dataVolumeName &&
      this.secretsVolumeName &&
      this.openclawVolumeName
    ) {
      // Containerized mode: use named volumes with subdirectories
      // Format: volume_name/subpath:/container/path:mode
      // Note: Docker doesn't support subpaths in named volumes directly,
      // so we mount the entire volume and the bot uses isolationKey as subdirectory
      this.logger.log(
        `Using named volumes: data=${this.dataVolumeName}, secrets=${this.secretsVolumeName}, openclaw=${this.openclawVolumeName}`,
      );
      return [
        `${this.dataVolumeName}:/data/bots:rw`,
        `${this.secretsVolumeName}:/data/secrets:ro`,
        // Mount OpenClaw data directory for persistent memory/sessions
        // The bot will use /data/openclaw/{isolationKey} as its .openclaw directory
        `${this.openclawVolumeName}:/data/openclaw:rw`,
      ];
    }

    // Local development mode: use host paths
    this.logger.log(
      `Using host paths: data=${workspacePath}, openclaw=${this.openclawDir}/${isolationKey}`,
    );
    return [
      `${workspacePath}:/app/workspace:rw`,
      `${this.secretsDir}/${isolationKey}:/app/secrets:ro`,
      // Mount OpenClaw data directory for persistent memory/sessions
      `${this.openclawDir}/${isolationKey}:/home/node/.openclaw:rw`,
    ];
  }

  /**
   * Create and start a container for a bot
   */
  async createContainer(options: CreateContainerOptions): Promise<string> {
    if (!this.isAvailable()) {
      this.logger.warn('Docker not available, simulating container creation');
      return `simulated-${options.isolationKey}`;
    }

    // Use isolationKey for container name to ensure uniqueness across users
    const containerName = `${this.containerPrefix}${options.isolationKey}`;

    // Check if container already exists
    try {
      const existing = this.docker.getContainer(containerName);
      const info = await existing.inspect();
      if (info) {
        this.logger.log(
          `Container ${containerName} already exists, removing...`,
        );
        await existing.remove({ force: true });
      }
    } catch {
      // Container doesn't exist, which is expected
    }

    // Build environment variables
    // Normalize model name to handle aliases like chatgpt-4o-latest -> gpt-4o
    // For custom providers with apiType, use apiType for normalization
    // This ensures models like chatgpt-4o-latest are normalized to gpt-4o
    const normalizationProvider =
      options.aiProvider === 'custom' && options.apiType
        ? options.apiType
        : options.aiProvider;
    const normalizedModel = normalizeModelName(
      options.model,
      normalizationProvider,
    );
    if (normalizedModel !== options.model) {
      this.logger.log(
        `Normalized model name: ${options.model} -> ${normalizedModel} (using provider: ${normalizationProvider})`,
      );
    }

    const envVars = [
      `BOT_HOSTNAME=${options.hostname}`,
      `BOT_NAME=${options.name}`,
      `BOT_PORT=${options.port}`,
      `OPENCLAW_GATEWAY_TOKEN=${options.gatewayToken}`,
      `AI_PROVIDER=${options.aiProvider}`,
      `AI_MODEL=${normalizedModel}`,
      `CHANNEL_TYPE=${options.channelType}`,
    ];

    // When using named volumes, bot needs to know its workspace subdirectory
    // This must match the condition in buildVolumeBinds
    const useNamedVolumes = this.dataVolumeName && this.secretsVolumeName && this.openclawVolumeName;
    if (useNamedVolumes) {
      envVars.push(`BOT_WORKSPACE_DIR=/data/bots/${options.isolationKey}`);
      envVars.push(`BOT_SECRETS_DIR=/data/secrets/${options.isolationKey}`);
      // OpenClaw data directory for persistent memory/sessions
      envVars.push(`OPENCLAW_HOME=/data/openclaw/${options.isolationKey}`);
    } else {
      envVars.push(`BOT_WORKSPACE_DIR=/app/workspace`);
      envVars.push(`BOT_SECRETS_DIR=/app/secrets`);
      // In local dev mode, .openclaw is mounted directly to /home/node/.openclaw
      // No need to set OPENCLAW_HOME as it uses the default location
    }

    // Add API type if provided
    if (options.apiType) {
      envVars.push(`AI_API_TYPE=${options.apiType}`);
    }

    // Get provider config for environment variable naming
    const providerConfig =
      PROVIDER_CONFIGS[options.aiProvider as ProviderVendor];

    // Helper function to convert localhost URLs to host.docker.internal for container access
    // This is needed because 127.0.0.1/localhost inside a container refers to the container itself,
    // not the host machine. host.docker.internal is a special DNS name that resolves to the host.
    const convertToDockerHost = (url: string): string => {
      return url
        .replace(/127\.0\.0\.1/g, 'host.docker.internal')
        .replace(/localhost/g, 'host.docker.internal');
    };

    // Helper function to get environment variable name for API key
    const getApiKeyEnvName = (provider: string): string => {
      // Standard environment variable names for common providers
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
        zhipu: 'ZHIPU_API_KEY',
        moonshot: 'MOONSHOT_API_KEY',
        baichuan: 'BAICHUAN_API_KEY',
        dashscope: 'DASHSCOPE_API_KEY',
        stepfun: 'STEPFUN_API_KEY',
        doubao: 'DOUBAO_API_KEY',
        minimax: 'MINIMAX_API_KEY',
        yi: 'YI_API_KEY',
        hunyuan: 'HUNYUAN_API_KEY',
        silicon: 'SILICONFLOW_API_KEY',
        custom: 'CUSTOM_API_KEY',
      };
      return (
        providerEnvMap[provider] ||
        `${provider.toUpperCase().replace(/-/g, '_')}_API_KEY`
      );
    };

    // Helper function to get environment variable name for base URL
    const getBaseUrlEnvName = (provider: string): string => {
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
        zhipu: 'ZHIPU_BASE_URL',
        moonshot: 'MOONSHOT_BASE_URL',
        baichuan: 'BAICHUAN_BASE_URL',
        dashscope: 'DASHSCOPE_BASE_URL',
        stepfun: 'STEPFUN_BASE_URL',
        doubao: 'DOUBAO_BASE_URL',
        minimax: 'MINIMAX_BASE_URL',
        yi: 'YI_BASE_URL',
        hunyuan: 'HUNYUAN_BASE_URL',
        silicon: 'SILICONFLOW_BASE_URL',
        custom: 'CUSTOM_BASE_URL',
      };
      return (
        baseUrlEnvMap[provider] ||
        `${provider.toUpperCase().replace(/-/g, '_')}_BASE_URL`
      );
    };

    // Zero-trust mode: Use proxy URL and token instead of direct API key
    if (options.proxyUrl && options.proxyToken) {
      // Pass proxy configuration to container (convert localhost to host.docker.internal)
      const dockerProxyUrl = convertToDockerHost(options.proxyUrl);
      envVars.push(`PROXY_URL=${dockerProxyUrl}`);
      envVars.push(`PROXY_TOKEN=${options.proxyToken}`);

      // Determine the actual vendor for proxy routing
      // Vendor mapping rule: ${apiType}${vendor === 'custom' ? '-compatible' : ''}
      // For custom provider: openai-compatible, anthropic-compatible, etc.
      // For standard provider: openai, anthropic, etc.
      // The proxy routes requests based on vendor name: {proxyUrl}/v1/{vendor}/*
      const proxyVendor =
        options.aiProvider === 'custom' && options.apiType
          ? `${options.apiType}-compatible`
          : options.aiProvider;

      // Build proxy endpoint based on vendor
      const proxyEndpoint = `${dockerProxyUrl}/v1/${proxyVendor}`;

      // Set the base URL to point to the proxy
      // For custom provider with openai API type, use OPENAI_BASE_URL so OpenClaw can find it
      const baseUrlEnvName =
        options.aiProvider === 'custom' && options.apiType
          ? getBaseUrlEnvName(options.apiType)
          : getBaseUrlEnvName(options.aiProvider);
      envVars.push(`${baseUrlEnvName}=${proxyEndpoint}`);

      // Set the API key environment variable directly for OpenClaw
      // OpenClaw reads API keys from standard environment variables at startup
      // Use proxy token as the API key for authentication with the proxy
      const apiKeyEnvName =
        options.aiProvider === 'custom' && options.apiType
          ? getApiKeyEnvName(options.apiType)
          : getApiKeyEnvName(options.aiProvider);
      envVars.push(`${apiKeyEnvName}=${options.proxyToken}`);

      this.logger.log(
        `Container ${options.hostname} configured in zero-trust mode with proxy: ${proxyEndpoint} (vendor: ${proxyVendor})`,
      );
    } else {
      // Direct mode: Pass API key and base URL directly
      if (options.apiKey) {
        // For custom provider with apiType, use the apiType's env var name
        const envKeyName =
          options.aiProvider === 'custom' && options.apiType
            ? getApiKeyEnvName(options.apiType)
            : getApiKeyEnvName(options.aiProvider);
        envVars.push(`${envKeyName}=${options.apiKey}`);
      }

      // Add custom base URL if provided (convert localhost to host.docker.internal)
      if (options.apiBaseUrl) {
        // For custom provider with apiType, use the apiType's base URL env var
        // This ensures OpenClaw can find the correct API endpoint
        const baseUrlEnvName =
          options.aiProvider === 'custom' && options.apiType
            ? getBaseUrlEnvName(options.apiType)
            : getBaseUrlEnvName(options.aiProvider);
        const dockerBaseUrl = convertToDockerHost(options.apiBaseUrl);
        envVars.push(`${baseUrlEnvName}=${dockerBaseUrl}`);
      } else if (providerConfig?.apiHost) {
        // Use default API host from provider config if no custom URL
        const baseUrlEnvName = getBaseUrlEnvName(options.aiProvider);
        envVars.push(`${baseUrlEnvName}=${providerConfig.apiHost}`);
      }

      this.logger.log(
        `Container ${options.hostname} configured in direct mode`,
      );
    }

    // Determine network mode:
    // - In zero-trust mode, connect to common_network to reach keyring-proxy
    // - In direct mode, use bridge network
    const networkMode = options.proxyUrl ? 'common_network' : 'bridge';

    // Build volume bindings
    // When running in a container with named volumes, use volume names instead of host paths
    // This allows bot containers to access the same data volumes as the manager container
    const binds = this.buildVolumeBinds(
      options.isolationKey,
      options.workspacePath,
    );

    const container = await this.docker.createContainer({
      name: containerName,
      Image: this.botImage,
      // Start OpenClaw gateway with proper configuration
      // Use shell to configure OpenClaw before starting the gateway:
      // 1. Set the model if AI_MODEL is provided
      // 2. Add API key to auth-profiles.json if provided via environment variable
      // 3. Start the gateway
      Entrypoint: ['/bin/sh', '-c'],
      Cmd: [
        `
        # IMPORTANT: OpenClaw's OpenAI SDK reads OPENAI_BASE_URL at initialization time
        # We use the standard 'openai' provider (not 'openai-compatible') because:
        # 1. OpenAI SDK automatically reads OPENAI_BASE_URL environment variable
        # 2. The 'openai-compatible' provider has known integration gaps (GitHub Issue #9498)
        # 3. Using standard provider ensures SDK uses our custom base URL

        # Determine the provider for auth configuration and model prefix
        PROVIDER="${options.aiProvider}"
        if [ "$PROVIDER" = "custom" ] && [ -n "$AI_API_TYPE" ]; then
          # For custom provider, use AI_API_TYPE as the provider
          # OpenClaw expects standard provider names like 'openai', 'anthropic', etc.
          AUTH_PROVIDER="$AI_API_TYPE"
          # IMPORTANT: Always use standard provider name (not -compatible)
          # The OpenAI SDK will use OPENAI_BASE_URL environment variable for custom endpoint
          MODEL_PROVIDER="$AI_API_TYPE"
        else
          AUTH_PROVIDER="$PROVIDER"
          MODEL_PROVIDER="$PROVIDER"
        fi

        # Set the model if AI_MODEL is provided
        # OpenClaw expects model format: provider/model-name
        if [ -n "$AI_MODEL" ]; then
          # Check if model already has a provider prefix (contains /)
          if echo "$AI_MODEL" | grep -q "/"; then
            FULL_MODEL="$AI_MODEL"
          else
            # Add provider prefix for OpenClaw
            FULL_MODEL="$AUTH_PROVIDER/$AI_MODEL"
          fi
          echo "Setting model to: $FULL_MODEL"

          # Set the model using openclaw models set
          node /app/openclaw.mjs models set "$FULL_MODEL" 2>/dev/null || echo "Warning: Failed to set model via CLI"
        fi

        # Configure API key based on provider
        # In zero-trust mode, use PROXY_TOKEN as the API key
        # Otherwise, check for provider-specific API key environment variables
        API_KEY=""
        if [ -n "$PROXY_TOKEN" ]; then
          # Zero-trust mode: use proxy token as API key
          API_KEY="$PROXY_TOKEN"
          echo "Using proxy token for authentication"
        else
          # Direct mode: use provider-specific API key
          case "$AUTH_PROVIDER" in
            openai) API_KEY="$OPENAI_API_KEY" ;;
            anthropic) API_KEY="$ANTHROPIC_API_KEY" ;;
            google) API_KEY="$GOOGLE_API_KEY" ;;
            groq) API_KEY="$GROQ_API_KEY" ;;
            mistral) API_KEY="$MISTRAL_API_KEY" ;;
            deepseek) API_KEY="$DEEPSEEK_API_KEY" ;;
            zhipu) API_KEY="$ZHIPU_API_KEY" ;;
            moonshot) API_KEY="$MOONSHOT_API_KEY" ;;
            dashscope) API_KEY="$DASHSCOPE_API_KEY" ;;
            doubao) API_KEY="$DOUBAO_API_KEY" ;;
            silicon) API_KEY="$SILICONFLOW_API_KEY" ;;
            custom) API_KEY="$CUSTOM_API_KEY" ;;
            *) API_KEY="" ;;
          esac
        fi

        # Export API key as environment variable for OpenClaw
        # OpenClaw reads API keys from standard environment variables
        if [ -n "$API_KEY" ]; then
          case "$AUTH_PROVIDER" in
            openai) export OPENAI_API_KEY="$API_KEY" ;;
            anthropic) export ANTHROPIC_API_KEY="$API_KEY" ;;
            google) export GOOGLE_API_KEY="$API_KEY" ;;
            groq) export GROQ_API_KEY="$API_KEY" ;;
            mistral) export MISTRAL_API_KEY="$API_KEY" ;;
            deepseek) export DEEPSEEK_API_KEY="$API_KEY" ;;
            *) export OPENAI_API_KEY="$API_KEY" ;;
          esac
          echo "Configured API key for provider: $AUTH_PROVIDER"
        fi

        # Export base URL for OpenClaw when using custom provider
        # OpenClaw expects provider-specific base URL env vars (e.g., OPENAI_BASE_URL)
        # Map CUSTOM_BASE_URL to the appropriate provider-specific env var
        if [ "$PROVIDER" = "custom" ] && [ -n "$CUSTOM_BASE_URL" ]; then
          case "$AUTH_PROVIDER" in
            openai) export OPENAI_BASE_URL="$CUSTOM_BASE_URL" ;;
            anthropic) export ANTHROPIC_BASE_URL="$CUSTOM_BASE_URL" ;;
            *) export OPENAI_BASE_URL="$CUSTOM_BASE_URL" ;;
          esac
          echo "Mapped CUSTOM_BASE_URL to provider base URL: $CUSTOM_BASE_URL"
        fi

        # Create workspace directory if it doesn't exist
        # This is needed because the volume might be mounted with root ownership
        echo "Creating workspace directory: $BOT_WORKSPACE_DIR"
        if ! mkdir -p "$BOT_WORKSPACE_DIR" 2>/dev/null; then
          echo "ERROR: Cannot create workspace directory $BOT_WORKSPACE_DIR"
          echo "This is likely a permission issue with the mounted volume."
          echo "Please ensure the /data/bots volume has proper permissions for the node user."
          echo "You can fix this by running: docker exec -u root <manager-container> chown -R node:node /data/bots"
          exit 1
        fi
        echo "Workspace directory created successfully"

        # Create openclaw.json configuration with gateway token authentication
        # This is required for WebSocket connections to the Gateway
        CONFIG_DIR="/home/node/.openclaw"
        JSON_CONFIG_FILE="$CONFIG_DIR/openclaw.json"
        mkdir -p "$CONFIG_DIR"

        # Build openclaw.json - simple configuration
        # IMPORTANT: We rely on OPENAI_BASE_URL and OPENAI_API_KEY environment variables
        # for the OpenAI SDK to use our custom endpoint. The SDK reads these at initialization.
        echo "Creating openclaw.json with gateway token authentication..."
        cat > "$JSON_CONFIG_FILE" << JSON_EOF
{
  "gateway": {
    "mode": "local",
    "port": $BOT_PORT,
    "bind": "lan",
    "auth": {
      "mode": "token",
      "token": "$OPENCLAW_GATEWAY_TOKEN"
    },
    "controlUi": {
      "enabled": true,
      "allowInsecureAuth": true
    }
  },
  "agents": {
    "defaults": {
      "workspace": "$BOT_WORKSPACE_DIR"
    }
  }
}
JSON_EOF
        echo "Created openclaw.json:"
        cat "$JSON_CONFIG_FILE"

        # Create auth-profiles.json with the API key and base URL
        # OpenClaw looks for API keys and base URLs in this file for each provider
        AUTH_PROFILES_DIR="$CONFIG_DIR/agents/main/agent"
        mkdir -p "$AUTH_PROFILES_DIR"
        AUTH_PROFILES_FILE="$AUTH_PROFILES_DIR/auth-profiles.json"

        # Build auth-profiles.json with baseUrl for the provider
        # Include both baseUrl and baseURL since different SDKs use different naming conventions
        echo "Creating auth-profiles.json for provider: $AUTH_PROVIDER"
        if [ -n "$OPENAI_BASE_URL" ]; then
          # Include both baseUrl and baseURL for compatibility
          cat > "$AUTH_PROFILES_FILE" << AUTH_EOF
{
  "$AUTH_PROVIDER": {
    "apiKey": "$API_KEY",
    "baseUrl": "$OPENAI_BASE_URL",
    "baseURL": "$OPENAI_BASE_URL"
  }
}
AUTH_EOF
        else
          # No custom base URL
          cat > "$AUTH_PROFILES_FILE" << AUTH_EOF
{
  "$AUTH_PROVIDER": {
    "apiKey": "$API_KEY"
  }
}
AUTH_EOF
        fi
        echo "Created auth-profiles.json:"
        cat "$AUTH_PROFILES_FILE"

        # Clean up any invalid config keys from previous runs
        # OpenClaw validates config strictly and rejects unknown keys
        # Note: Run this AFTER creating our config to avoid overwriting
        echo "Running openclaw doctor --fix to clean up config..."
        node /app/openclaw.mjs doctor --fix 2>/dev/null || true

        # CRITICAL: Configure the base URL AFTER doctor --fix
        # doctor --fix overwrites our configuration, so we must set it again
        # OpenClaw reads models.providers.<provider>.baseUrl for API endpoint
        if [ -n "$OPENAI_BASE_URL" ]; then
          echo "Setting OpenAI base URL: $OPENAI_BASE_URL"
          # Try to set via CLI first (may fail due to schema validation)
          node /app/openclaw.mjs config set models.providers.openai.baseUrl "$OPENAI_BASE_URL" 2>/dev/null || true
          node /app/openclaw.mjs config set models.providers.openai.models '[]' 2>/dev/null || true

          # Directly patch the openclaw.json file using node (primary method)
          # This is more reliable than the CLI config set command
          echo "Configuring models.providers in openclaw.json..."
          node -e "
            const fs = require('fs');
            const configPath = '$JSON_CONFIG_FILE';
            try {
              const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
              config.models = config.models || {};
              config.models.providers = config.models.providers || {};
              config.models.providers.openai = config.models.providers.openai || {};
              config.models.providers.openai.baseUrl = '$OPENAI_BASE_URL';
              config.models.providers.openai.models = [];
              fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
              console.log('Successfully patched openclaw.json with baseUrl');
            } catch (e) {
              console.error('Failed to patch config:', e.message);
            }
          " || true
        fi

        # Set the model again after doctor --fix to ensure it's not overwritten
        if [ -n "$FULL_MODEL" ]; then
          echo "Re-setting model after doctor: $FULL_MODEL"
          node /app/openclaw.mjs models set "$FULL_MODEL" 2>/dev/null || echo "Warning: Failed to set model"
        fi

        # Debug: Show final openclaw.json configuration
        echo "=== Final openclaw.json ==="
        cat "$JSON_CONFIG_FILE" 2>/dev/null || echo "Config file not found"
        echo "==========================="

        # Debug: Output all relevant environment variables
        echo "=== Environment Configuration ==="
        echo "PROVIDER: $PROVIDER"
        echo "AUTH_PROVIDER: $AUTH_PROVIDER"
        echo "MODEL_PROVIDER: $MODEL_PROVIDER"
        echo "AI_API_TYPE: $AI_API_TYPE"
        echo "OPENAI_BASE_URL: $OPENAI_BASE_URL"
        echo "PROXY_URL: $PROXY_URL"
        if [ -n "$PROXY_TOKEN" ]; then echo "PROXY_TOKEN: [SET]"; else echo "PROXY_TOKEN: [NOT SET]"; fi
        if [ -n "$OPENAI_API_KEY" ]; then echo "OPENAI_API_KEY: [SET]"; else echo "OPENAI_API_KEY: [NOT SET]"; fi
        echo "================================="

        # Start the gateway
        # Note: --bind lan is configured in openclaw.json, but we pass it here for clarity
        # The gateway token is configured in openclaw.json for WebSocket authentication
        exec node /app/openclaw.mjs gateway --port ${options.port} --bind lan
        `,
      ],
      Env: envVars,
      ExposedPorts: {
        [`${options.port}/tcp`]: {},
      },
      HostConfig: {
        PortBindings: {
          [`${options.port}/tcp`]: [{ HostPort: String(options.port) }],
        },
        Binds: binds,
        RestartPolicy: { Name: 'unless-stopped' },
        NetworkMode: networkMode,
      },
      Labels: {
        'clawbot-manager.hostname': options.hostname,
        'clawbot-manager.isolation-key': options.isolationKey,
        'clawbot-manager.managed': 'true',
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
   * @returns true if container was stopped, false if it was already stopped
   */
  async stopContainer(containerId: string): Promise<boolean> {
    if (!this.isAvailable()) {
      this.logger.warn('Docker not available, simulating container stop');
      return true;
    }

    const container = this.docker.getContainer(containerId);
    try {
      await container.stop({ t: 10 }); // 10 second timeout
      this.logger.log(`Container stopped: ${containerId}`);
      return true;
    } catch (error: unknown) {
      // Handle 304 "container already stopped" - this is not an error
      if (
        error &&
        typeof error === 'object' &&
        'statusCode' in error &&
        error.statusCode === 304
      ) {
        this.logger.log(`Container already stopped: ${containerId}`);
        return false;
      }
      throw error;
    }
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
   * Get container network information
   */
  async getContainerNetworkInfo(containerId: string): Promise<{
    networks: string[];
    ipAddresses: Record<string, string>;
  } | null> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const container = this.docker.getContainer(containerId);
      const info = await container.inspect();
      const networks = Object.keys(info.NetworkSettings.Networks || {});
      const ipAddresses: Record<string, string> = {};

      for (const [networkName, networkConfig] of Object.entries(
        info.NetworkSettings.Networks || {},
      )) {
        if (networkConfig && typeof networkConfig === 'object') {
          const config = networkConfig as { IPAddress?: string };
          if (config.IPAddress) {
            ipAddresses[networkName] = config.IPAddress;
          }
        }
      }

      return { networks, ipAddresses };
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
      filters: { label: ['clawbot-manager.managed=true'] },
    });

    const stats: ContainerStats[] = [];

    for (const containerInfo of containers) {
      try {
        const container = this.docker.getContainer(containerInfo.Id);
        const containerStats = await container.stats({ stream: false });
        const inspectInfo = await container.inspect();
        const hostname =
          containerInfo.Labels['clawbot-manager.hostname'] || 'unknown';

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

        // Get PID and uptime from inspect info
        const pid = inspectInfo.State.Pid || null;
        const startedAt = inspectInfo.State.StartedAt || null;
        let uptimeSeconds: number | null = null;
        if (startedAt && inspectInfo.State.Running) {
          const startTime = new Date(startedAt).getTime();
          const now = Date.now();
          uptimeSeconds = Math.floor((now - startTime) / 1000);
        }

        stats.push({
          hostname,
          name: containerInfo.Names[0]?.replace(/^\//, '') || hostname,
          containerId: containerInfo.Id.substring(0, 12),
          pid: pid === 0 ? null : pid,
          uptimeSeconds,
          startedAt,
          cpuPercent: Math.round(cpuPercent * 100) / 100,
          memoryUsage,
          memoryLimit,
          memoryPercent: Math.round(memoryPercent * 100) / 100,
          networkRxBytes,
          networkTxBytes,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        this.logger.warn(
          `Failed to get stats for container ${containerInfo.Id}:`,
          error,
        );
      }
    }

    return stats;
  }

  /**
   * List all managed containers with their isolation keys
   * Used by ReconciliationService for orphan detection
   */
  async listManagedContainersWithIsolationKeys(): Promise<
    { id: string; hostname: string; isolationKey: string }[]
  > {
    if (!this.isAvailable()) {
      return [];
    }

    const containers = await this.docker.listContainers({
      all: true,
      filters: { label: ['clawbot-manager.managed=true'] },
    });

    return containers.map((c) => ({
      id: c.Id,
      hostname: c.Labels['clawbot-manager.hostname'] || 'unknown',
      isolationKey:
        c.Labels['clawbot-manager.isolation-key'] ||
        c.Labels['clawbot-manager.hostname'] ||
        'unknown',
    }));
  }

  /**
   * Find orphaned containers (containers without corresponding database entries)
   * @param knownIsolationKeys - isolation keys (userId_short-hostname) of known bots
   */
  async findOrphanedContainers(
    knownIsolationKeys: string[],
  ): Promise<string[]> {
    if (!this.isAvailable()) {
      return [];
    }

    const containers = await this.docker.listContainers({
      all: true,
      filters: { label: ['clawbot-manager.managed=true'] },
    });

    const orphaned: string[] = [];
    for (const container of containers) {
      const isolationKey = container.Labels['clawbot-manager.isolation-key'];
      if (isolationKey && !knownIsolationKeys.includes(isolationKey)) {
        orphaned.push(isolationKey);
      }
    }

    return orphaned;
  }

  /**
   * Find orphaned workspaces (workspace directories without corresponding database entries)
   * @param knownIsolationKeys - isolation keys of known bots
   */
  async findOrphanedWorkspaces(
    knownIsolationKeys: string[],
  ): Promise<string[]> {
    try {
      const entries = await readdir(this.dataDir, { withFileTypes: true });
      const orphaned: string[] = [];

      for (const entry of entries) {
        if (entry.isDirectory() && !knownIsolationKeys.includes(entry.name)) {
          orphaned.push(entry.name);
        }
      }

      return orphaned;
    } catch (error) {
      this.logger.warn(`Failed to scan workspace directory: ${error}`);
      return [];
    }
  }

  /**
   * Find orphaned secrets (secrets directories without corresponding database entries)
   * @param knownIsolationKeys - isolation keys of known bots
   */
  async findOrphanedSecrets(knownIsolationKeys: string[]): Promise<string[]> {
    try {
      const entries = await readdir(this.secretsDir, { withFileTypes: true });
      const orphaned: string[] = [];

      for (const entry of entries) {
        if (entry.isDirectory() && !knownIsolationKeys.includes(entry.name)) {
          orphaned.push(entry.name);
        }
      }

      return orphaned;
    } catch (error) {
      this.logger.warn(`Failed to scan secrets directory: ${error}`);
      return [];
    }
  }

  /**
   * Get orphan report
   * @param knownIsolationKeys - isolation keys of known bots
   */
  async getOrphanReport(knownIsolationKeys: string[]): Promise<OrphanReport> {
    const orphanedContainers =
      await this.findOrphanedContainers(knownIsolationKeys);

    const orphanedWorkspaces =
      await this.findOrphanedWorkspaces(knownIsolationKeys);
    const orphanedSecrets = await this.findOrphanedSecrets(knownIsolationKeys);

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

  /**
   * Cleanup orphaned resources
   * @param knownIsolationKeys - isolation keys of known bots
   */
  async cleanupOrphans(knownIsolationKeys: string[]): Promise<CleanupReport> {
    const orphanedContainers =
      await this.findOrphanedContainers(knownIsolationKeys);

    let containersRemoved = 0;
    for (const isolationKey of orphanedContainers) {
      try {
        const containerName = `${this.containerPrefix}${isolationKey}`;
        const container = this.docker.getContainer(containerName);
        await container.remove({ force: true });
        containersRemoved++;
        this.logger.log(`Removed orphaned container: ${containerName}`);
      } catch (error) {
        this.logger.warn(
          `Failed to remove orphaned container for ${isolationKey}:`,
          error,
        );
      }
    }

    // Cleanup orphaned workspaces
    const orphanedWorkspaces =
      await this.findOrphanedWorkspaces(knownIsolationKeys);
    let workspacesRemoved = 0;
    for (const isolationKey of orphanedWorkspaces) {
      try {
        const workspacePath = join(this.dataDir, isolationKey);
        await rm(workspacePath, { recursive: true, force: true });
        workspacesRemoved++;
        this.logger.log(`Removed orphaned workspace: ${workspacePath}`);
      } catch (error) {
        this.logger.warn(
          `Failed to remove orphaned workspace for ${isolationKey}:`,
          error,
        );
      }
    }

    // Cleanup orphaned secrets
    const orphanedSecrets = await this.findOrphanedSecrets(knownIsolationKeys);
    let secretsRemoved = 0;
    for (const isolationKey of orphanedSecrets) {
      try {
        const secretsPath = join(this.secretsDir, isolationKey);
        await rm(secretsPath, { recursive: true, force: true });
        secretsRemoved++;
        this.logger.log(`Removed orphaned secrets: ${secretsPath}`);
      } catch (error) {
        this.logger.warn(
          `Failed to remove orphaned secrets for ${isolationKey}:`,
          error,
        );
      }
    }

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
