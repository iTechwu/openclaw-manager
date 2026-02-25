/**
 * Configuration Validation Module
 *
 * Central export for all configuration validation schemas.
 * Provides Zod-based validation for:
 * - Environment variables (.env)
 * - YAML configuration (config.local.yaml)
 * - Keys configuration (keys/config.json)
 *
 * 设计原则: 一次配置，多次使用
 * - Zod schema 是类型的唯一真相来源
 * - 所有配置类型都从 Zod schema 推断
 * - 不再需要手动维护重复的 interface 定义
 */

// ============================================================================
// Environment Validation
// ============================================================================

export {
  envSchema,
  validateEnv,
  validateEnvSafe,
  getEnvVar,
} from './env.validation';
export type { EnvConfig, EnvValidationResult } from './env.validation';

// 导出便捷的环境变量访问服务
export {
  getEnv,
  getEnvWithDefault,
  hasEnv,
  getNodeEnv,
  isProduction,
  isDevelopment,
  getProjectRoot,
  dockerConfig,
  s3Config,
  featureConfig,
  buildConfig,
  clearEnvCache,
} from '../env-config.service';

// ============================================================================
// YAML Configuration Validation
// ============================================================================

export {
  // Schemas
  yamlConfigSchema,
  microServiceSchema,
  appConfigSchema,
  zoneSchema,
  uploadConfigSchema,
  ipInfoConfigSchema,
  videoQualitySchema,
  jwtConfigSchema,
  cryptoConfigSchema,
  cdnZoneSchema,
  cdnConfigSchema,
  redisCacheKeySchema,
  pathConfigSchema,
  rolePermissionSchema,
  bucketConfigSchema,
  // Feature Flag Schemas
  featureFlagProviderSchema,
  featureFlagRedisConfigSchema,
  unleashConfigSchema,
  featureFlagsConfigSchema,
  // Rate Limit Schemas
  rateLimitDimensionSchema,
  rateLimitDimensionConfigSchema,
  rateLimitWhitelistSchema,
  rateLimitRedisConfigSchema,
  rateLimitDimensionsSchema,
  rateLimitConfigSchema,
  // Database Metrics Schemas
  slowQueryThresholdsSchema,
  dbMetricsConfigSchema,
  // Transaction Schemas
  transactionRetryConfigSchema,
  transactionConfigSchema,
  // Functions
  validateYamlConfig,
  validateYamlConfigSafe,
} from './yaml.validation';

export type {
  // Main type
  YamlConfig,
  YamlValidationResult,
  // Inferred types
  MicroServiceConfig,
  AppConfig,
  ZoneConfig,
  UploadConfig,
  IpInfoConfig,
  JwtConfig,
  CryptoConfig,
  CdnZoneConfig,
  CdnConfig,
  RedisCacheKeyConfig,
  PathConfig,
  RolePermissionConfig,
  BucketConfig,
  VideoQuality,
  // Feature Flag Types
  FeatureFlagProvider,
  FeatureFlagRedisConfig,
  UnleashConfig,
  FeatureFlagsConfig,
  // Rate Limit Types
  RateLimitDimension,
  RateLimitDimensionConfig,
  RateLimitWhitelistConfig,
  RateLimitRedisConfig,
  RateLimitDimensionsConfig,
  RateLimitConfig,
  // Database Metrics Types
  SlowQueryThresholdsConfig,
  DbMetricsConfig,
  // Transaction Types
  TransactionRetryConfig,
  TransactionConfig,
} from './yaml.validation';

// ============================================================================
// Keys Configuration Validation
// ============================================================================

export {
  // Schemas
  keysConfigSchema,
  googleServiceAccountSchema,
  jinaAiSchema,
  oauthProviderSchema,
  emailTemplateSchema,
  sendcloudSchema,
  smsTemplateBaseSchema,
  smsProviderSchema,
  smsConfigSchema,
  storageCredentialsSchema,
  storageConfigSchema,
  openspeechProviderSchema,
  openspeechAliyunProviderSchema,
  openspeechVolcengineProviderSchema,
  openspeechConfigSchema,
  transcodeProviderSchema,
  transcodeConfigSchema,
  ttsProviderSchema,
  ttsConfigSchema,
  riskProviderSchema,
  riskConfigSchema,
  imageProviderSchema,
  imageConfigSchema,
  vectorProviderSchema,
  vectorConfigSchema,
  miniprogramSchema,
  wechatSchema,
  agentxSchema,
  openaiSchema,
  // ipInfoSchema - 使用 yaml.validation 的 ipInfoConfigSchema (合并自 keys/config.json)
  // Functions
  validateKeysConfig,
  validateKeysConfigSafe,
  isProviderConfigured,
  getConfiguredOAuthProviders,
  getConfiguredSmsProviders,
  getConfiguredStorageProviders,
} from './keys.validation';

export type {
  // Main type
  KeysConfig,
  KeysValidationResult,
  // Inferred types
  GoogleServiceAccountConfig,
  JinaAiConfig,
  OAuthProviderConfig,
  EmailTemplateConfig,
  SendCloudConfig,
  SmsTemplateBaseConfig,
  SmsProviderConfig,
  SmsConfig,
  StorageCredentialsConfig,
  StorageConfig,
  OpenSpeechProviderConfig,
  OpenSpeechAliyunProviderConfig,
  OpenSpeechVolcengineProviderConfig,
  OpenSpeechConfig,
  TranscodeProviderConfig,
  TranscodeConfig,
  TtsProviderConfig,
  TtsConfig,
  RiskProviderConfig,
  RiskConfig,
  ImageProviderConfig,
  ImageConfig,
  VectorProviderConfig,
  VectorConfig,
  MiniprogramConfig,
  WechatConfig,
  AgentXConfig,
  OpenAIConfig,
} from './keys.validation';
