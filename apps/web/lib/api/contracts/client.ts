'use client';

import { initQueryClient } from '@ts-rest/react-query';
import { initClient, type ApiFetcherArgs } from '@ts-rest/core';
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
  providerKeyContract,
  systemContract,
  personaTemplateContract,
  channelContract,
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
// Direct API Clients (for imperative calls)
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

/**
 * Download API - Direct client
 */
export const downloadClient = initClient(downloadContract, clientOptions);

/**
 * Notification API - Direct client
 */
/**
 * Sign API - Direct client (PUBLIC - no auth required)
 */
export const signClient = initClient(signContract, publicClientOptions);

/**
 * User API - Direct client
 */
export const userClient = initClient(userContract, clientOptions);

/**
 * SMS API - Direct client (PUBLIC - no auth required)
 */
export const smsClient = initClient(smsContract, publicClientOptions);

/**
 * Uploader API - Direct client
 */
export const uploaderClient = initClient(uploaderContract, clientOptions);

/**
 * Analytics API - Direct client (for imperative calls)
 */
export const analyticsClient = initClient(analyticsContract, clientOptions);

// ============================================================================
// React Query Clients (for hooks)
// ============================================================================

/**
 * Download API - React Query hooks
 */
export const downloadApi = initQueryClient(downloadContract, clientOptions);

/**
 * Message API - React Query hooks
 */
export const messageApi = initQueryClient(messageContract, clientOptions);

/**
 * Setting API - React Query hooks
 */
export const settingApi = initQueryClient(settingContract, clientOptions);

/**
 * Analytics API - React Query hooks
 */
export const analyticsApi = initQueryClient(analyticsContract, clientOptions);

/**
 * Bot API - Direct client
 */
export const botClient = initClient(botContract, clientOptions);

/**
 * Bot API - React Query hooks
 */
export const botApi = initQueryClient(botContract, clientOptions);

/**
 * Provider Key API - Direct client
 */
export const providerKeyClient = initClient(providerKeyContract, clientOptions);

/**
 * Provider Key API - React Query hooks
 */
export const providerKeyApi = initQueryClient(
  providerKeyContract,
  clientOptions,
);

/**
 * System API - Direct client
 */
export const systemClient = initClient(systemContract, clientOptions);

/**
 * System API - React Query hooks
 */
export const systemApi = initQueryClient(systemContract, clientOptions);

/**
 * Persona Template API - Direct client
 */
export const personaTemplateClient = initClient(
  personaTemplateContract,
  clientOptions,
);

/**
 * Persona Template API - React Query hooks
 */
export const personaTemplateApi = initQueryClient(
  personaTemplateContract,
  clientOptions,
);

/**
 * Channel API - Direct client
 */
export const channelClient = initClient(channelContract, clientOptions);

/**
 * Channel API - React Query hooks
 */
export const channelApi = initQueryClient(channelContract, clientOptions);

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
  // React Query clients (for hooks)
  analytics: analyticsApi,
  message: messageApi,
  setting: settingApi,
  download: downloadApi,
  bot: botApi,
  providerKey: providerKeyApi,
  system: systemApi,
  personaTemplate: personaTemplateApi,
  channel: channelApi,
  // Direct clients (for imperative calls)
  analyticsClient,
  botClient,
  providerKeyClient,
  systemClient,
  personaTemplateClient,
  channelClient,
};
