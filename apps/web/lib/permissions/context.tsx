'use client';

/**
 * Permission Context
 * 权限上下文提供者
 */

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { getUser } from '@/lib/storage';
import { PERMISSION_RULES } from './constants';
import type {
  PermissionContextValue,
  PermissionModule,
  PermissionResource,
  PermissionAction,
} from './types';

/**
 * 默认权限上下文值
 */
const defaultContextValue: PermissionContextValue = {
  isAdmin: false,
  hasPermission: () => false,
  can: () => false,
  cannot: () => true,
};

/**
 * 权限上下文
 */
const PermissionContext = createContext<PermissionContextValue>(defaultContextValue);

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
 * 权限提供者组件
 */
export function PermissionProvider({ children }: { children: ReactNode }) {
  const contextValue = useMemo<PermissionContextValue>(() => {
    const user = getUser();
    const isAdmin = user?.isAdmin ?? false;

    return {
      isAdmin,
      hasPermission: (
        module: PermissionModule,
        resource: PermissionResource,
        action: PermissionAction,
      ) => {
        if (!user) return false;
        return checkPermission(isAdmin, module, resource, action);
      },
      can: (action: PermissionAction, module: PermissionModule) => {
        if (!user) return false;
        return checkPermission(isAdmin, module, '*', action);
      },
      cannot: (action: PermissionAction, module: PermissionModule) => {
        if (!user) return true;
        return !checkPermission(isAdmin, module, '*', action);
      },
    };
  }, []);

  return (
    <PermissionContext.Provider value={contextValue}>
      {children}
    </PermissionContext.Provider>
  );
}

/**
 * 使用权限上下文的 Hook
 */
export function usePermissionContext(): PermissionContextValue {
  return useContext(PermissionContext);
}
