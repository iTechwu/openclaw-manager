'use client';

import { initQueryClient } from '@ts-rest/react-query';
import { initClient, type ApiFetcherArgs, type AppRouter } from '@ts-rest/core';
import { toast } from 'sonner';
import {
  analyticsContract,
  downloadContract,
  messageContract,
  settingContract,
  signContract,
  smsContract,
  uploaderContract,
  userContract,
  botContract,
  botUsageContract,
  providerKeyContract,
  systemContract,
  personaTemplateContract,
  channelContract,
  botChannelContract,
  pluginContract,
  botPluginContract,
  skillContract,
  botSkillContract,
  modelRoutingContract,
  routingAdminContract,
  notificationContract,
  skillSyncContract,
  modelContract,
  botModelContract,
  feishuPairingContract,
} from '@repo/contracts';
import { getHeaders } from '@repo/utils/headers';
import { API_VERSION_HEADER, APP_BUILD_HEADER } from '@repo/constants';
import { API_CONFIG } from '../../config';
import { getToken, ensureValidToken, clearToken } from '../../api';
import { APP_VERSION } from '@/lib/version';
import {
  handleVersionMismatch,
  isVersionMismatchStatus,
  getMinBuildFromHeaders,
  VersionMismatchError,
} from '@/lib/version-mismatch';
import { checkDeprecationWarning } from '@/lib/deprecation-warning';

/**
 * ts-rest API Client for type-safe API calls
 * Uses ts-rest contracts for type-safe API endpoints
 *
 * Headers included in every request:
 * - Authorization: Bearer token (if authenticated)
 * - Content-Type: application/json
 * - x-api-version: API version (e.g., "1")
 * - x-app-build: Frontend build version (e.g., "2025.03.18-abcdef-g42")
 * - platform: web
 * - os: detected OS (windows/macos/linux/ios/android)
 * - deviceid: unique device identifier
 */

const API_BASE_URL = API_CONFIG.baseUrl || '';

// ============================================================================
// 错误消息去重机制（模块级别缓存）
// 在短时间内（2秒）相同的错误消息只显示一次
// ============================================================================
const errorMessageCache = new Map<string, number>();
const ERROR_DEDUP_INTERVAL = 2000; // 2秒
const MAX_CACHE_SIZE = 50; // 最大缓存数量

/**
 * 清理过期的错误缓存
 */
const cleanupErrorCache = () => {
  const now = Date.now();
  for (const [key, timestamp] of errorMessageCache.entries()) {
    if (now - timestamp >= ERROR_DEDUP_INTERVAL) {
      errorMessageCache.delete(key);
    }
  }
  // 如果清理后仍超过限制，删除最旧的项
  if (errorMessageCache.size > MAX_CACHE_SIZE) {
    const oldestKey = errorMessageCache.keys().next().value;
    if (oldestKey) errorMessageCache.delete(oldestKey);
  }
};

/**
 * 检查错误消息是否应该被去重（跳过显示）
 */
const shouldDeduplicateError = (errorKey: string): boolean => {
  const now = Date.now();
  const lastShown = errorMessageCache.get(errorKey);

  // 如果在去重时间窗口内已经显示过相同的错误，则跳过
  if (lastShown && now - lastShown < ERROR_DEDUP_INTERVAL) {
    return true;
  }

  // 记录当前错误消息的显示时间
  errorMessageCache.set(errorKey, now);

  // 清理过期缓存
  if (errorMessageCache.size > MAX_CACHE_SIZE) {
    cleanupErrorCache();
  }

  return false;
};

/**
 * Base fetch function with standard headers (no auth check)
 * Used for public endpoints like login, register
 */
const baseFetch = async (args: ApiFetcherArgs, requireAuth: boolean = true) => {
  // Only ensure valid token for authenticated requests
  if (requireAuth) {
    try {
      await ensureValidToken();
    } catch {
      // Ignore ensureValidToken errors for non-critical paths
      // The request will proceed without token
    }
  }

  const token = getToken();

  // Get standard headers (platform, os, deviceid)
  // This ensures consistency with v1 API client
  const standardHeaders = getHeaders(
    {},
    undefined, // mptrail - can be passed if needed
  );

  // Build final headers: our headers first, then ts-rest headers override
  // This prevents duplicate Content-Type (ts-rest already sets it)
  const headers: Record<string, string> = {
    ...standardHeaders,
    // Version control headers
    [API_VERSION_HEADER]: APP_VERSION.apiVersion,
    [APP_BUILD_HEADER]: APP_VERSION.appBuild,
  };

  // Merge ts-rest headers, but handle Content-Type specially to avoid duplicates
  const tsRestHeaders = args.headers as Record<string, string> | undefined;
  if (tsRestHeaders) {
    for (const [key, value] of Object.entries(tsRestHeaders)) {
      // Skip if value contains comma (indicates duplicate header)
      if (typeof value === 'string' && !value.includes(', ')) {
        headers[key] = value;
      } else if (key.toLowerCase() === 'content-type') {
        // For Content-Type, just use application/json
        headers[key] = 'application/json';
      }
    }
  }

  // Ensure Content-Type is set for POST/PUT/PATCH requests with body
  if (args.body && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }

  // Add Authorization header if token is available
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Handle body serialization - avoid double stringify
  let requestBody: string | undefined;
  if (args.body !== undefined && args.body !== null) {
    // If body is already a string, use it directly; otherwise stringify it
    requestBody =
      typeof args.body === 'string' ? args.body : JSON.stringify(args.body);
  }

  const response = await fetch(args.path, {
    method: args.method,
    headers,
    body: requestBody,
    credentials: 'include',
  });

  const contentType = response.headers.get('content-type');
  let body;

  // Handle empty responses (204 No Content, etc.)
  if (
    response.status === 204 ||
    response.headers.get('content-length') === '0'
  ) {
    body = null;
  } else if (contentType?.includes('application/json')) {
    const text = await response.text();
    body = text ? JSON.parse(text) : null;
  } else {
    body = await response.text();
  }

  // Handle version mismatch (426 Upgrade Required)
  if (isVersionMismatchStatus(response.status)) {
    const minBuild = getMinBuildFromHeaders(response.headers);
    handleVersionMismatch(minBuild);
    throw new VersionMismatchError(minBuild);
  }

  // Check for API deprecation warnings
  checkDeprecationWarning(response.headers, args.path);

  // Global error handling with deduplication
  const handleError = (errorMsg: string, statusCode: number) => {
    if (typeof window === 'undefined') return;

    const pathname = window.location.pathname;

    // 如果已经在登录页面，不需要全局错误处理，由登录组件自己处理
    if (pathname === '/login' || pathname.endsWith('/login')) {
      return;
    }

    // 创建错误消息的唯一标识（包含消息内容和状态码）
    const errorKey = `${statusCode}:${errorMsg}`;

    // 使用模块级别的去重机制
    if (shouldDeduplicateError(errorKey)) {
      return;
    }

    // Handle 401 Unauthorized - clear storage and redirect to login
    if (statusCode === 401) {
      clearToken();
      toast.error(errorMsg || '登录已过期，请重新登录');
      window.location.href = '/login';
    } else {
      // Show error toast for other error codes
      toast.error(errorMsg);
    }
  };

  // Check HTTP status code first
  if (!response.ok) {
    const errorMsg =
      typeof body === 'object' && body?.msg ? body.msg : '请求失败';
    handleError(errorMsg, response.status);
  } else if (
    typeof body === 'object' &&
    body?.code !== undefined &&
    body.code !== 200
  ) {
    // HTTP 200 but business code is not 0 - show error
    const errorMsg = body?.msg || '请求失败';
    handleError(errorMsg, body.code);
  }

  return {
    status: response.status,
    body,
    headers: response.headers,
  };
};

/**
 * Authenticated fetch - requires valid token
 * Used for most API endpoints
 */
const customFetch = async (args: ApiFetcherArgs) => baseFetch(args, true);

/**
 * Public fetch - does not require token
 * Used for login, register, and other public endpoints
 */
const publicFetch = async (args: ApiFetcherArgs) => baseFetch(args, false);

// ============================================================================
// Client Options
// ============================================================================

/**
 * Common client options with response validation (authenticated)
 */
const clientOptions = {
  baseUrl: API_BASE_URL,
  baseHeaders: {},
  api: customFetch,
  jsonQuery: true,
  throwOnUnknownStatus: false,
};

/**
 * Public client options (no auth required)
 */
const publicClientOptions = {
  baseUrl: API_BASE_URL,
  baseHeaders: {},
  api: publicFetch,
  jsonQuery: true,
  throwOnUnknownStatus: false,
};

// ============================================================================
// Factory Functions (NEW - 推荐使用)
// ============================================================================

/**
 * 创建 API 客户端的工厂函数
 * 同时返回 Direct Client 和 React Query Client
 *
 * @example
 * const bot = createApiClient(botContract);
 * // 使用: bot.client (imperative), bot.query (React Query hooks)
 */
function createApiClient<T extends AppRouter>(contract: T, isPublic = false) {
  const options = isPublic ? publicClientOptions : clientOptions;
  return {
    client: initClient(contract, options),
    query: initQueryClient(contract, options),
  };
}

// ============================================================================
// Public API Clients (不需要认证)
// ============================================================================

export const sign = createApiClient(signContract, true);
export const sms = createApiClient(smsContract, true);

// ============================================================================
// Authenticated API Clients
// ============================================================================

export const analytics = createApiClient(analyticsContract);
export const download = createApiClient(downloadContract);
export const message = createApiClient(messageContract);
export const setting = createApiClient(settingContract);
export const user = createApiClient(userContract);
export const uploader = createApiClient(uploaderContract);
export const bot = createApiClient(botContract);
export const botUsage = createApiClient(botUsageContract);
export const providerKey = createApiClient(providerKeyContract);
export const system = createApiClient(systemContract);
export const personaTemplate = createApiClient(personaTemplateContract);
export const channel = createApiClient(channelContract);
export const botChannel = createApiClient(botChannelContract);
export const plugin = createApiClient(pluginContract);
export const botPlugin = createApiClient(botPluginContract);
export const skill = createApiClient(skillContract);
export const botSkill = createApiClient(botSkillContract);
export const modelRouting = createApiClient(modelRoutingContract);
export const routingAdmin = createApiClient(routingAdminContract);
export const notification = createApiClient(notificationContract);
export const skillSync = createApiClient(skillSyncContract);
export const model = createApiClient(modelContract);
export const botModel = createApiClient(botModelContract);
export const feishuPairing = createApiClient(feishuPairingContract);

// ============================================================================
// Legacy Exports (向后兼容 - 将在后续版本移除)
// ============================================================================

/** @deprecated Use `bot.client` instead */
export const botClient = bot.client;
/** @deprecated Use `bot.query` instead */
export const botApi = bot.query;

/** @deprecated Use `message.client` instead */
export const messageClient = message.client;
/** @deprecated Use `message.query` instead */
export const messageApi = message.query;

/** @deprecated Use `analytics.client` instead */
export const analyticsClient = analytics.client;
/** @deprecated Use `analytics.query` instead */
export const analyticsApi = analytics.query;

/** @deprecated Use `setting.client` instead */
export const settingClient = setting.client;
/** @deprecated Use `setting.query` instead */
export const settingApi = setting.query;

/** @deprecated Use `download.client` instead */
export const downloadClient = download.client;
/** @deprecated Use `download.query` instead */
export const downloadApi = download.query;

/** @deprecated Use `user.client` instead */
export const userClient = user.client;

/** @deprecated Use `sign.client` instead */
export const signClient = sign.client;

/** @deprecated Use `sms.client` instead */
export const smsClient = sms.client;

/** @deprecated Use `uploader.client` instead */
export const uploaderClient = uploader.client;

/** @deprecated Use `botUsage.client` instead */
export const botUsageClient = botUsage.client;
/** @deprecated Use `botUsage.query` instead */
export const botUsageApi = botUsage.query;

/** @deprecated Use `providerKey.client` instead */
export const providerKeyClient = providerKey.client;
/** @deprecated Use `providerKey.query` instead */
export const providerKeyApi = providerKey.query;

/** @deprecated Use `system.client` instead */
export const systemClient = system.client;
/** @deprecated Use `system.query` instead */
export const systemApi = system.query;

/** @deprecated Use `personaTemplate.client` instead */
export const personaTemplateClient = personaTemplate.client;
/** @deprecated Use `personaTemplate.query` instead */
export const personaTemplateApi = personaTemplate.query;

/** @deprecated Use `channel.client` instead */
export const channelClient = channel.client;
/** @deprecated Use `channel.query` instead */
export const channelApi = channel.query;

/** @deprecated Use `botChannel.client` instead */
export const botChannelClient = botChannel.client;
/** @deprecated Use `botChannel.query` instead */
export const botChannelApi = botChannel.query;

/** @deprecated Use `plugin.client` instead */
export const pluginClient = plugin.client;
/** @deprecated Use `plugin.query` instead */
export const pluginApi = plugin.query;

/** @deprecated Use `botPlugin.client` instead */
export const botPluginClient = botPlugin.client;
/** @deprecated Use `botPlugin.query` instead */
export const botPluginApi = botPlugin.query;

/** @deprecated Use `skill.client` instead */
export const skillClient = skill.client;
/** @deprecated Use `skill.query` instead */
export const skillApi = skill.query;

/** @deprecated Use `botSkill.client` instead */
export const botSkillClient = botSkill.client;
/** @deprecated Use `botSkill.query` instead */
export const botSkillApi = botSkill.query;

/** @deprecated Use `modelRouting.client` instead */
export const modelRoutingClient = modelRouting.client;
/** @deprecated Use `modelRouting.query` instead */
export const modelRoutingApi = modelRouting.query;

/** @deprecated Use `routingAdmin.client` instead */
export const routingAdminClient = routingAdmin.client;
/** @deprecated Use `routingAdmin.query` instead */
export const routingAdminApi = routingAdmin.query;

/** @deprecated Use `notification.client` instead */
export const notificationClient = notification.client;
/** @deprecated Use `notification.query` instead */
export const notificationApi = notification.query;

/** @deprecated Use `skillSync.client` instead */
export const skillSyncClient = skillSync.client;
/** @deprecated Use `skillSync.query` instead */
export const skillSyncApi = skillSync.query;

/** @deprecated Use `model.client` instead */
export const modelClient = model.client;
/** @deprecated Use `model.query` instead */
export const modelApi = model.query;

/** @deprecated Use `botModel.client` instead */
export const botModelClient = botModel.client;
/** @deprecated Use `botModel.query` instead */
export const botModelApi = botModel.query;

/** @deprecated Use `feishuPairing.client` instead */
export const feishuPairingClient = feishuPairing.client;
/** @deprecated Use `feishuPairing.query` instead */
export const feishuPairingApi = feishuPairing.query;

// ============================================================================
// Generic ts-rest Client (for custom contracts)
// ============================================================================

/**
 * Generic ts-rest client wrapper
 * Used by custom hooks that are not part of the main contract
 * Includes all React Query clients for easy access
 *
 * Note: For imperative calls (non-hook usage), use the direct clients:
 * - analyticsClient (for Analytics)
 * - messageClient (for Message)
 * - etc.
 */
export const tsRestClient = {
  request: customFetch,
  // React Query clients (for hooks) - 使用新的 query 属性
  analytics: analytics.query,
  message: message.query,
  setting: setting.query,
  download: download.query,
  bot: bot.query,
  botUsage: botUsage.query,
  providerKey: providerKey.query,
  system: system.query,
  personaTemplate: personaTemplate.query,
  channel: channel.query,
  botChannel: botChannel.query,
  plugin: plugin.query,
  botPlugin: botPlugin.query,
  skill: skill.query,
  botSkill: botSkill.query,
  modelRouting: modelRouting.query,
  routingAdmin: routingAdmin.query,
  notification: notification.query,
  skillSync: skillSync.query,
  model: model.query,
  botModel: botModel.query,
  feishuPairing: feishuPairing.query,
  // Direct clients (for imperative calls) - 使用新的 client 属性
  analyticsClient: analytics.client,
  botClient: bot.client,
  botUsageClient: botUsage.client,
  providerKeyClient: providerKey.client,
  systemClient: system.client,
  personaTemplateClient: personaTemplate.client,
  channelClient: channel.client,
  botChannelClient: botChannel.client,
  pluginClient: plugin.client,
  botPluginClient: botPlugin.client,
  skillClient: skill.client,
  botSkillClient: botSkill.client,
  modelRoutingClient: modelRouting.client,
  routingAdminClient: routingAdmin.client,
  notificationClient: notification.client,
  skillSyncClient: skillSync.client,
  modelClient: model.client,
  botModelClient: botModel.client,
  feishuPairingClient: feishuPairing.client,
};
