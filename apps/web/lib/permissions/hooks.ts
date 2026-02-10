'use client';

/**
 * Permission Hooks
 * 权限相关的 React Hooks
 */

import { useMemo, useState, useEffect } from 'react';
import { getUser } from '@/lib/storage';
import { PERMISSION_RULES } from './constants';
import type {
  PermissionModule,
  PermissionResource,
  PermissionAction,
} from './types';
import type { UserInfo } from '@repo/contracts';

/**
 * 响应式获取用户信息的 Hook
 * 监听 userInfoUpdated 事件以响应用户信息变化
 */
function useUserInfo(): UserInfo | null {
  // Always initialize with null to avoid hydration mismatch
  // User data will be populated in useEffect after hydration
  const [user, setUser] = useState<UserInfo | null>(null);

  useEffect(() => {
    // Initialize user info after hydration to avoid SSR mismatch
    const storedUser = getUser();
    if (storedUser) {
      setUser(storedUser);
    }

    // 监听用户信息更新事件
    const handleUserUpdate = () => {
      const updatedUser = getUser();
      setUser(updatedUser);
    };

    window.addEventListener('userInfoUpdated', handleUserUpdate);
    // 同时监听 storage 事件以处理跨标签页的变化
    window.addEventListener('storage', handleUserUpdate);

    return () => {
      window.removeEventListener('userInfoUpdated', handleUserUpdate);
      window.removeEventListener('storage', handleUserUpdate);
    };
  }, []);

  return user;
}

/**
 * 检查权限的核心逻辑
 */
function checkPermission(
  isAdmin: boolean,
  module: PermissionModule,
  resource: PermissionResource,
  action: PermissionAction,
): boolean {
  // 管理员拥有所有权限
  if (isAdmin) {
    return true;
  }

  // 检查模块级权限
  const moduleRules = PERMISSION_RULES[module];
  if (!moduleRules) {
    // 未定义的模块默认允许登录用户访问
    return true;
  }

  // 检查资源级权限
  const resourceRules = moduleRules[resource] || moduleRules['*'];
  if (!resourceRules) {
    return true;
  }

  // 检查操作级权限
  const actionPermission = resourceRules[action] ?? resourceRules['*'];
  if (actionPermission === undefined) {
    return true;
  }

  return actionPermission;
}

/**
 * 权限检查 Hook
 *
 * @example
 * ```tsx
 * const { isAdmin, can, cannot, hasPermission } = usePermissions();
 *
 * // 检查是否为管理员
 * if (isAdmin()) { ... }
 *
 * // 检查是否可以创建 API 密钥
 * if (can('create', 'providerKey')) { ... }
 *
 * // 检查是否不能删除技能
 * if (cannot('delete', 'skill')) { ... }
 *
 * // 检查特定资源的权限
 * if (hasPermission('plugin', 'marketplace', 'read')) { ... }
 * ```
 */
export function usePermissions() {
  const user = useUserInfo();
  const adminStatus = user?.isAdmin ?? false;

  return useMemo(() => {
    return {
      /**
       * 检查当前用户是否为管理员
       */
      isAdmin: (): boolean => adminStatus,

      /**
       * 检查是否有指定模块的操作权限
       * @param action 操作类型
       * @param module 模块名称
       */
      can: (action: PermissionAction, module: PermissionModule): boolean => {
        if (!user) return false;
        return checkPermission(adminStatus, module, '*', action);
      },

      /**
       * 检查是否没有指定模块的操作权限
       * @param action 操作类型
       * @param module 模块名称
       */
      cannot: (action: PermissionAction, module: PermissionModule): boolean => {
        if (!user) return true;
        return !checkPermission(adminStatus, module, '*', action);
      },

      /**
       * 检查是否有指定模块、资源、操作的权限
       * @param module 模块名称
       * @param resource 资源名称
       * @param action 操作类型
       */
      hasPermission: (
        module: PermissionModule,
        resource: PermissionResource,
        action: PermissionAction,
      ): boolean => {
        if (!user) return false;
        return checkPermission(adminStatus, module, resource, action);
      },
    };
  }, [user, adminStatus]);
}

/**
 * 检查是否为管理员的简化 Hook
 *
 * @example
 * ```tsx
 * const isAdmin = useIsAdmin();
 * if (isAdmin) { ... }
 * ```
 */
export function useIsAdmin(): boolean {
  const user = useUserInfo();
  return user?.isAdmin ?? false;
}

/**
 * 检查特定权限的 Hook
 *
 * @example
 * ```tsx
 * const canCreateKey = useCanPerform('create', 'providerKey');
 * if (canCreateKey) { ... }
 * ```
 */
export function useCanPerform(
  action: PermissionAction,
  module: PermissionModule,
): boolean {
  const user = useUserInfo();
  if (!user) return false;
  const isAdmin = user.isAdmin ?? false;
  return checkPermission(isAdmin, module, '*', action);
}
