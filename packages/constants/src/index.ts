/**
 * Shared constants between frontend and backend
 */

// HTTP Status codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
} as const;

// API Response codes
export const API_CODE = {
  SUCCESS: 0,
  ERROR: -1,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
} as const;

// Plugin limits
export const PLUGIN_LIMITS = {
  /** MCP exec 超时（毫秒） */
  MCP_EXEC_TIMEOUT: 30000,
  /** 单个 Bot 最大插件数量 */
  MAX_PLUGINS_PER_BOT: 20,
  /** 允许的 MCP 命令白名单（安全限制） */
  ALLOWED_MCP_COMMANDS: ['npx', 'node'],
  /** MCP Server 启动超时（毫秒） */
  MCP_SERVER_STARTUP_TIMEOUT: 10000,
} as const;

// Pagination defaults
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;

// File upload limits
export const FILE_LIMITS = {
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  MAX_IMAGE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_VIDEO_SIZE: 500 * 1024 * 1024, // 500MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  ALLOWED_VIDEO_TYPES: ['video/mp4', 'video/webm', 'video/quicktime'],
} as const;

// Skill installation limits
export const SKILL_LIMITS = {
  /** 单个技能目录最大总大小 (5MB) */
  MAX_DIR_SIZE: 5 * 1024 * 1024,
  /** 单个技能目录最大文件数 */
  MAX_FILE_COUNT: 50,
  /** 排除的文件名（不写入本地） */
  EXCLUDED_FILES: ['_meta.json'] as readonly string[],
  /** 允许执行的脚本名称白名单 */
  ALLOWED_SCRIPT_NAMES: ['init.sh'] as readonly string[],
  /** 脚本执行超时 (30s) */
  SCRIPT_EXEC_TIMEOUT: 30000,
} as const;

// Auth token keys
export const AUTH_KEYS = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
  TOKEN_TYPE: 'Bearer',
} as const;

// Date formats
export const DATE_FORMAT = {
  DATE: 'YYYY-MM-DD',
  DATETIME: 'YYYY-MM-DD HH:mm:ss',
  TIME: 'HH:mm:ss',
  ISO: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
} as const;

// ============================================================================
// Deprecation Headers (废弃警告响应头)
// ============================================================================

/**
 * 废弃标识 Header (响应)
 * 值为 "true" 表示该 API 已废弃
 */
export const DEPRECATION_HEADER = 'deprecation' as const;

/**
 * 废弃消息 Header (响应)
 * 包含废弃原因和迁移建议
 */
export const DEPRECATION_MESSAGE_HEADER = 'x-deprecation-message' as const;

/**
 * 下线日期 Header (响应)
 * 格式: ISO 8601 日期字符串
 */
export const SUNSET_HEADER = 'sunset' as const;

// ============================================================================
// API Versioning Constants
// ============================================================================

/**
 * API 版本号常量
 * 禁止使用 magic string，所有版本号必须从此处引用
 */
export const API_VERSION = {
  /** Version 1 - 初始版本 */
  V1: '1',
  /** Version 2 - 未来版本 */
  V2: '2',
} as const;

export type ApiVersion = (typeof API_VERSION)[keyof typeof API_VERSION];

/**
 * 当前默认 API 版本
 * 新 contract 默认使用此版本
 */
export const API_VERSION_DEFAULT = API_VERSION.V1;

/**
 * 所有支持的 API 版本列表
 * 用于验证和 CI 校验
 */
export const API_VERSIONS_SUPPORTED = [API_VERSION.V1] as const;

// ============================================================================
// Version Header Constants (端到端版本控制)
// ============================================================================

/**
 * API 版本 Header (请求 + 响应)
 * 前端发送，后端响应
 */
export const API_VERSION_HEADER = 'x-api-version' as const;

/**
 * 前端构建版本 Header (请求)
 * 格式: YYYY.MM.DD-<hash>-g<generation>
 * 示例: 2025.03.18-abcdef-g42
 */
export const APP_BUILD_HEADER = 'x-app-build' as const;

/**
 * 后端构建版本 Header (响应)
 * 格式: YYYY.MM.DD-<hash>-g<generation>
 */
export const SERVER_BUILD_HEADER = 'x-server-build' as const;

/**
 * 最低兼容前端版本 Header (响应，仅不兼容时返回)
 */
export const MIN_APP_BUILD_HEADER = 'x-min-app-build' as const;

// ============================================================================
// Generation Constants (缓存代际号)
// ============================================================================

/**
 * 缓存代际号
 *
 * 升级规则:
 * - API 结构变化 → bump generation
 * - 数据语义变化 → bump generation
 * - 不确定是否兼容 → bump generation
 *
 * 变更记录:
 * - g1: 2025.03.18 初始版本
 */
export const API_GENERATION = 1;

/**
 * 最低兼容的前端代际号
 * 低于此版本的前端必须强制刷新
 */
export const MIN_CLIENT_GENERATION = 1;

// ============================================================================
// Platform Constants (平台标识)
// ============================================================================

/**
 * 平台标识 Header
 */
export const PLATFORM_HEADER = 'x-platform' as const;

/**
 * 操作系统 Header
 */
export const OS_HEADER = 'x-os' as const;

/**
 * 设备 ID Header
 */
export const DEVICE_ID_HEADER = 'x-device-id' as const;

/**
 * 埋点追踪 Header
 */
export const MPTRAIL_HEADER = 'x-mptrail' as const;

/**
 * API Contract Header (APP 专用)
 */
export const API_CONTRACT_HEADER = 'x-api-contract' as const;

/**
 * 支持的平台类型
 */
export const PLATFORMS = {
  WEB: 'web',
  IOS: 'ios',
  ANDROID: 'android',
} as const;

export type Platform = (typeof PLATFORMS)[keyof typeof PLATFORMS];

// ============================================================================
// Contract Constants (合约版本 - APP 专用)
// ============================================================================

/**
 * API 合约版本类型
 * 格式: YYYY-MM (年月)
 */
export type ApiContract = '2024-12' | '2025-01';

/**
 * 合约配置
 * 每个 Contract 是一套稳定的 API 协议
 */
export const CONTRACTS: Record<
  ApiContract,
  {
    /** 最低 APP 构建号 */
    minBuild: { ios: number; android: number };
    /** 是否已废弃 (提示升级) */
    deprecated: boolean;
    /** 下线日期 (到期后拒绝请求) */
    sunset: string | null;
    /** 支持的能力列表 */
    features: readonly string[];
  }
> = {
  '2024-12': {
    minBuild: { ios: 1000000, android: 1000000 },
    deprecated: false,
    sunset: null,
    features: ['user-v1'],
  },
  '2025-01': {
    minBuild: { ios: 1000000, android: 1000000 },
    deprecated: false,
    sunset: null,
    features: ['user-v1'],
  },
} as const;

/**
 * 当前 Contract 版本
 * 新 APP 应使用此版本
 */
export const CURRENT_CONTRACT: ApiContract = '2025-01';

/**
 * 最低支持的 Contract 版本
 * 低于此版本的 Contract 将被拒绝
 */
export const MIN_SUPPORTED_CONTRACT: ApiContract = '2024-12';

// ============================================================================
// Feature Flags (能力声明)
// ============================================================================

/**
 * 能力标识定义
 * 用于替代版本号判断
 */
export const FEATURES = {
  'user-v1': 'User API V1',
  'user-v2': 'User API V2 with displayName',
} as const;

export type Feature = keyof typeof FEATURES;
