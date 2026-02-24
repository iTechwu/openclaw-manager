/**
 * YAML Configuration Validation Schema
 *
 * Validates the YAML configuration file (config.local.yaml) using Zod.
 * Ensures all required application settings are correctly configured.
 */
import { z } from 'zod';
import enviroment from '@/utils/enviroment.util';

// ============================================================================
// Exported Schemas (用于类型推断和外部使用)
// ============================================================================

/**
 * Microservice configuration schema
 */
export const microServiceSchema = z.object({
  name: z.string().min(1),
  ChineseName: z.string().optional(),
  version: z.string().optional(),
  port: z.number().int().positive().max(65535).optional(),
  logger: z.boolean().default(true),
  transport: z.enum(['TCP', 'UDP', 'HTTP']).default('TCP'),
  host: z.string().optional(),
});

/**
 * Zone configuration schema
 */
export const zoneSchema = z.object({
  zone: z.string().min(1),
  locale: z.enum(['zh-CN', 'en']),
  defaultPrivateBucket: z.string().min(1),
  defaultPublicBucket: z.string().min(1),
  transcodeBucket: z.string().min(1),
});

/**
 * App configuration schema
 */
export const appConfigSchema = microServiceSchema.extend({
  domain: z.string().min(1),
  MaxPageSize: z.number().int().positive().default(500),
  defaultPageSize: z.number().int().positive().default(100),
  defaultMiniPageSize: z.number().int().positive().default(30),
  canCreateTrail: z.boolean().default(true),
  defaultVendor: z
    .enum(['tos', 'oss', 'us3', 'qiniu', 'gcs', 's3'])
    .default('tos'),
  defaultBucketPublic: z.boolean().default(false),

  // S3 重试配置 (从 .env 迁移)
  enableRetryMechanism: z.boolean().default(true),
  enableEnhancedLogging: z.boolean().default(true),
  maxRetries: z.number().int().positive().default(3),
  baseRetryDelay: z.number().int().positive().default(1000),

  // 日志输出配置 (从 .env 迁移)
  nestLogOutput: z.enum(['console', 'file', 'both']).default('file'),

  // 音频转写状态更新模式配置
  audioTranscribe: z
    .object({
      /** 状态更新模式：webhook（回调）或 polling（轮询） */
      statusUpdateMode: z.enum(['webhook', 'polling']).default('webhook'),
      /** 轮询间隔（秒），仅在 polling 模式下有效 */
      pollingInterval: z.number().int().positive().default(30),
    })
    .optional()
    .default({
      statusUpdateMode: 'webhook',
      pollingInterval: 30,
    }),

  admin: microServiceSchema.optional(),
  zones: z.array(zoneSchema).min(1),
});

/**
 * Upload configuration schema
 */
export const uploadConfigSchema = z.object({
  chrunkSize: z.number().int().positive().default(8388608), // 8MB
});

/**
 * IP info configuration schema
 * Note: ipinfo 配置存储在 keys/config.json，在 initConfig 时合并到 yaml config
 */
export const ipInfoConfigSchema = z.object({
  url: z.string().url(),
  token: z.string().min(1),
});

/**
 * Video quality enum values
 */
export const videoQualitySchema = z.enum([
  'VIDEO_360P',
  'VIDEO_720P',
  'VIDEO_1080P',
  'VIDEO_4K',
  'VIDEO_ORIGIN',
]);

/**
 * JWT configuration schema
 */
export const jwtConfigSchema = z.object({
  secret: z.string().min(8, 'JWT secret must be at least 8 characters'),
  expireIn: z.number().int().positive(),
});

/**
 * Crypto configuration schema
 */
export const cryptoConfigSchema = z.object({
  key: z.string().min(1),
  iv: z.string().min(1),
});

/**
 * CDN zone configuration schema
 */
export const cdnZoneSchema = z.object({
  url: z.string().url(),
  downloaderUrl: z.string().url(),
  vodUrl: z.string().url(),
  thumbTemplate: z.string().optional(),
});

/**
 * CDN configuration schema
 */
export const cdnConfigSchema = z.object({
  cn: cdnZoneSchema.optional(),
  us: cdnZoneSchema.optional(),
  ap: cdnZoneSchema.optional(),
});

/**
 * Redis cache key configuration schema
 */
export const redisCacheKeySchema = z.object({
  name: z.string().min(1),
  key: z.string().min(1),
  expireIn: z.number().int().optional(),
});

/**
 * Path configuration schema
 */
export const pathConfigSchema = z.object({
  post: z.array(z.string()).optional(),
  get: z.array(z.string()).optional(),
});

/**
 * Permission configuration schema
 */
export const rolePermissionSchema = z.object({
  role: z.string().min(1),
  permission: z.array(z.string()),
});

/**
 * Bucket configuration schema
 */
export const bucketConfigSchema = z.object({
  bucket: z.string().min(1),
  region: z.string().min(1),
  zone: z.string().min(1),
  endpoint: z.string().url(),
  internalEndpoint: z.string(),
  domain: z.string().url(),
  vendor: z.enum(['tos', 'oss', 'us3', 'qiniu', 'gcs', 's3']),
  webhook: z.string().optional(),
  locale: z.string().optional(),
  isPublic: z.boolean().default(false),
  isDefault: z.boolean().default(false),
  tosEndpoint: z.string().optional(),
  tosInternalEndpoint: z.string().optional(),
});

/**
 * Feature flag provider type
 */
export const featureFlagProviderSchema = z.enum(['memory', 'redis', 'unleash']);

/**
 * Redis feature flag configuration schema
 */
export const featureFlagRedisConfigSchema = z.object({
  /** Redis key prefix (default: 'pardx:feature:') */
  keyPrefix: z.string().default('pardx:feature:'),
  /** Default TTL in seconds, 0 = never expire (default: 0) */
  defaultTTL: z.number().int().min(0).default(0),
});

/**
 * Unleash configuration schema
 */
export const unleashConfigSchema = z.object({
  /** Unleash server URL */
  url: z.string().url(),
  /** Application name registered in Unleash */
  appName: z.string().min(1),
  /** Unique instance identifier */
  instanceId: z.string().optional(),
  /** Environment name (dev, staging, production) */
  environment: z.string().optional(),
  /** Refresh interval in milliseconds (default: 15000) */
  refreshInterval: z.number().int().positive().default(15000),
  /** Metrics reporting interval in milliseconds (default: 60000) */
  metricsInterval: z.number().int().positive().default(60000),
  /** Custom headers for authentication */
  customHeaders: z.record(z.string(), z.string()).optional(),
});

/**
 * Feature flags configuration schema
 */
export const featureFlagsConfigSchema = z
  .object({
    /** Feature flag provider: memory (dev), redis (prod), unleash (enterprise) */
    provider: featureFlagProviderSchema.default('memory'),
    /** Redis configuration (used when provider is 'redis') */
    redis: featureFlagRedisConfigSchema.optional(),
    /** Unleash configuration (required if provider is 'unleash') */
    unleash: unleashConfigSchema.optional(),
    /** Default feature flags (key-value pairs) */
    defaultFlags: z.record(z.string(), z.boolean()).optional(),
  })
  .refine(
    (data) => {
      // If provider is 'unleash', unleash config must be provided
      if (data.provider === 'unleash' && !data.unleash) {
        return false;
      }
      return true;
    },
    {
      message: "Unleash configuration is required when provider is 'unleash'",
      path: ['unleash'],
    },
  );

// ============================================================================
// Rate Limit Configuration Schemas
// ============================================================================

// ============================================================================
// Database Metrics Configuration Schemas
// ============================================================================

/**
 * Slow query thresholds configuration schema
 * 慢查询阈值配置
 */
export const slowQueryThresholdsSchema = z.object({
  /** INFO level threshold in ms (default: 100) */
  info: z.number().int().positive().default(100),
  /** WARN level threshold in ms (default: 500) */
  warn: z.number().int().positive().default(500),
  /** ERROR level threshold in ms (default: 1000) */
  error: z.number().int().positive().default(1000),
});

/**
 * Database metrics configuration schema
 * 数据库监控配置
 */
export const dbMetricsConfigSchema = z.object({
  /** Enable/disable database metrics (default: true) */
  enabled: z.boolean().default(true),
  /** Slow query thresholds by log level */
  slowQueryThresholds: slowQueryThresholdsSchema.default({
    info: 100,
    warn: 500,
    error: 1000,
  }),
  /** Log query parameters (default: true) */
  logQueryParams: z.boolean().default(true),
  /** Log query results (default: false, for security) */
  logQueryResult: z.boolean().default(false),
  /** Maximum length for logged parameters (default: 1000) */
  maxParamLogLength: z.number().int().positive().default(1000),
});

// ============================================================================
// Transaction Configuration Schemas
// ============================================================================

/**
 * Transaction retry configuration schema
 * 事务重试配置
 */
export const transactionRetryConfigSchema = z.object({
  /** Enable retry mechanism (default: true) */
  enabled: z.boolean().default(true),
  /** Maximum retry attempts (default: 3) */
  maxRetries: z.number().int().positive().default(3),
  /** Base delay between retries in ms (default: 100) */
  baseDelay: z.number().int().positive().default(100),
  /** Exponential backoff multiplier (default: 2) */
  backoffMultiplier: z.number().positive().default(2),
  /** Maximum delay between retries in ms (default: 5000) */
  maxDelay: z.number().int().positive().default(5000),
});

/**
 * Transaction configuration schema
 * 事务配置
 */
export const transactionConfigSchema = z.object({
  /** Retry configuration */
  retry: transactionRetryConfigSchema.default({
    enabled: true,
    maxRetries: 3,
    baseDelay: 100,
    backoffMultiplier: 2,
    maxDelay: 5000,
  }),
  /** Default max wait time for transaction lock in ms (default: 5000) */
  defaultMaxWait: z.number().int().positive().default(5000),
  /** Default transaction timeout in ms (default: 30000) */
  defaultTimeout: z.number().int().positive().default(30000),
});

// ============================================================================
// Rate Limit Configuration Schemas
// ============================================================================

/**
 * Rate limit dimension type
 */
export const rateLimitDimensionSchema = z.enum([
  'ip',
  'userId',
  'tenantId',
  'apiKey',
  'composite',
]);

/**
 * Rate limit dimension config schema (limit + window)
 */
export const rateLimitDimensionConfigSchema = z.object({
  /** Maximum requests allowed in the window */
  limit: z.number().int().positive(),
  /** Time window in seconds */
  window: z.number().int().positive(),
});

/**
 * Rate limit whitelist configuration schema
 */
export const rateLimitWhitelistSchema = z.object({
  /** Whitelisted IP addresses (supports CIDR notation) */
  ips: z.array(z.string()).default(['127.0.0.1', '::1']),
  /** Whitelisted user IDs */
  userIds: z.array(z.string()).default([]),
  /** Whitelisted API keys */
  apiKeys: z.array(z.string()).default([]),
});

/**
 * Rate limit Redis configuration schema
 */
export const rateLimitRedisConfigSchema = z.object({
  /** Redis key prefix (default: 'pardx:ratelimit:') */
  keyPrefix: z.string().default('pardx:ratelimit:'),
});

/**
 * Rate limit dimensions configuration schema
 */
export const rateLimitDimensionsSchema = z.object({
  /** IP-based rate limiting */
  ip: rateLimitDimensionConfigSchema.default({ limit: 200, window: 60 }),
  /** User-based rate limiting */
  userId: rateLimitDimensionConfigSchema.default({ limit: 500, window: 60 }),
  /** Tenant-based rate limiting */
  tenantId: rateLimitDimensionConfigSchema.default({
    limit: 2000,
    window: 60,
  }),
  /** API key-based rate limiting */
  apiKey: rateLimitDimensionConfigSchema.default({ limit: 1000, window: 60 }),
});

/**
 * Rate limit configuration schema
 */
export const rateLimitConfigSchema = z.object({
  /** Enable/disable rate limiting (static, requires restart) */
  enabled: z.boolean().default(true),
  /** Feature flag name for dynamic control (optional) */
  featureFlag: z.string().optional(),
  /** Default rate limit configuration (fallback) */
  default: rateLimitDimensionConfigSchema.default({ limit: 100, window: 60 }),
  /** Dimension-specific configurations */
  dimensions: rateLimitDimensionsSchema.optional(),
  /** Redis configuration */
  redis: rateLimitRedisConfigSchema.optional(),
  /** Whitelist configuration */
  whitelist: rateLimitWhitelistSchema.optional(),
});

/**
 * Full YAML configuration schema
 */
export const yamlConfigSchema = z.object({
  app: appConfigSchema,
  uploadConfig: uploadConfigSchema.optional(),
  // ipinfo 从 keys/config.json 合并 (通过 configuration.ts)
  ipinfo: ipInfoConfigSchema.optional(),
  outOfAnonymityPath: pathConfigSchema.optional(),
  outOfUserPath: pathConfigSchema.optional(),
  // pinecone.apiKey 已移至环境变量 PINECONE_API_KEY
  pinecone: z.object({ apiKey: z.string() }).optional(),
  // jwt 配置已移至环境变量 JWT_SECRET, JWT_EXPIRE_IN
  jwt: jwtConfigSchema.optional(),
  // crypto 配置已移至环境变量 CRYPTO_KEY, CRYPTO_IV
  crypto: cryptoConfigSchema.optional(),
  cdn: cdnConfigSchema.optional(),
  redis: z.array(redisCacheKeySchema).optional(),
  buckets: z.array(bucketConfigSchema).optional(),
  featureFlags: featureFlagsConfigSchema.optional(),
  rateLimit: rateLimitConfigSchema.optional(),
  // Database monitoring and transaction configuration
  dbMetrics: dbMetricsConfigSchema.optional(),
  transaction: transactionConfigSchema.optional(),
});

// ============================================================================
// Inferred Types (从 Zod schema 推断的类型)
// ============================================================================

/** 完整 YAML 配置类型 */
export type YamlConfig = z.infer<typeof yamlConfigSchema>;

/** 微服务配置类型 */
export type MicroServiceConfig = z.infer<typeof microServiceSchema>;

/** 应用配置类型 (扩展自 MicroServiceConfig) */
export type AppConfig = z.infer<typeof appConfigSchema>;

/** 区域配置类型 */
export type ZoneConfig = z.infer<typeof zoneSchema>;

/** 上传配置类型 */
export type UploadConfig = z.infer<typeof uploadConfigSchema>;

/** IP 信息配置类型 */
export type IpInfoConfig = z.infer<typeof ipInfoConfigSchema>;

/** JWT 配置类型 */
export type JwtConfig = z.infer<typeof jwtConfigSchema>;

/** 加密配置类型 */
export type CryptoConfig = z.infer<typeof cryptoConfigSchema>;

/** CDN 区域配置类型 */
export type CdnZoneConfig = z.infer<typeof cdnZoneSchema>;

/** CDN 配置类型 */
export type CdnConfig = z.infer<typeof cdnConfigSchema>;

/** Redis 缓存键配置类型 */
export type RedisCacheKeyConfig = z.infer<typeof redisCacheKeySchema>;

/** 路径配置类型 */
export type PathConfig = z.infer<typeof pathConfigSchema>;

/** 角色权限配置类型 */
export type RolePermissionConfig = z.infer<typeof rolePermissionSchema>;

/** 存储桶配置类型 */
export type BucketConfig = z.infer<typeof bucketConfigSchema>;

/** 视频质量枚举类型 */
export type VideoQuality = z.infer<typeof videoQualitySchema>;

/** 功能开关 Provider 类型 */
export type FeatureFlagProvider = z.infer<typeof featureFlagProviderSchema>;

/** 功能开关 Redis 配置类型 */
export type FeatureFlagRedisConfig = z.infer<
  typeof featureFlagRedisConfigSchema
>;

/** Unleash 配置类型 */
export type UnleashConfig = z.infer<typeof unleashConfigSchema>;

/** 功能开关配置类型 */
export type FeatureFlagsConfig = z.infer<typeof featureFlagsConfigSchema>;

/** 限流维度类型 */
export type RateLimitDimension = z.infer<typeof rateLimitDimensionSchema>;

/** 限流维度配置类型 */
export type RateLimitDimensionConfig = z.infer<
  typeof rateLimitDimensionConfigSchema
>;

/** 限流白名单配置类型 */
export type RateLimitWhitelistConfig = z.infer<typeof rateLimitWhitelistSchema>;

/** 限流 Redis 配置类型 */
export type RateLimitRedisConfig = z.infer<typeof rateLimitRedisConfigSchema>;

/** 限流维度集合配置类型 */
export type RateLimitDimensionsConfig = z.infer<
  typeof rateLimitDimensionsSchema
>;

/** 限流配置类型 */
export type RateLimitConfig = z.infer<typeof rateLimitConfigSchema>;

/** 慢查询阈值配置类型 */
export type SlowQueryThresholdsConfig = z.infer<
  typeof slowQueryThresholdsSchema
>;

/** 数据库监控配置类型 */
export type DbMetricsConfig = z.infer<typeof dbMetricsConfigSchema>;

/** 事务重试配置类型 */
export type TransactionRetryConfig = z.infer<
  typeof transactionRetryConfigSchema
>;

/** 事务配置类型 */
export type TransactionConfig = z.infer<typeof transactionConfigSchema>;

/**
 * Validation result type
 */
export interface YamlValidationResult {
  success: boolean;
  data?: YamlConfig;
  errors?: z.ZodError;
}

/**
 * Validates YAML configuration against the schema
 *
 * @param config - Parsed YAML configuration object
 * @returns Validated configuration
 * @throws Error if validation fails
 */
export function validateYamlConfig(config: unknown): YamlConfig {
  const result = yamlConfigSchema.safeParse(config);

  if (!result.success) {
    const errorMessages = result.error.issues
      .map((err) => `  - ${err.path.join('.')}: ${err.message}`)
      .join('\n');

    console.error('❌ YAML configuration validation failed:');
    console.error(errorMessages);

    throw new Error(`YAML configuration validation failed:\n${errorMessages}`);
  }

  if (enviroment.isProduction()) {
    console.log('✅ YAML configuration validated successfully');
  }
  return result.data;
}

/**
 * Validates YAML configuration and returns detailed result
 *
 * @param config - Parsed YAML configuration object
 * @returns Validation result with success status and data or errors
 */
export function validateYamlConfigSafe(config: unknown): YamlValidationResult {
  const result = yamlConfigSchema.safeParse(config);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, errors: result.error };
}
