'use client';

/**
 * Permission Components
 * 权限相关的 React 组件
 */

import type { ReactNode } from 'react';
import { usePermissions, useIsAdmin, useCanPerform } from './hooks';
import type { PermissionModule, PermissionAction } from './types';

/**
 * AdminOnly 组件属性
 */
interface AdminOnlyProps {
  /** 子组件 */
  children: ReactNode;
  /** 非管理员时显示的内容（可选） */
  fallback?: ReactNode;
}

/**
 * 仅管理员可见的组件包装器
 *
 * @example
 * ```tsx
 * <AdminOnly>
 *   <Button>删除</Button>
 * </AdminOnly>
 *
 * <AdminOnly fallback={<span>无权限</span>}>
 *   <Button>管理</Button>
 * </AdminOnly>
 * ```
 */
export function AdminOnly({ children, fallback = null }: AdminOnlyProps) {
  const isAdmin = useIsAdmin();
  return isAdmin ? <>{children}</> : <>{fallback}</>;
}

/**
 * PermissionGate 组件属性
 */
interface PermissionGateProps {
  /** 子组件 */
  children: ReactNode;
  /** 模块名称 */
  module: PermissionModule;
  /** 操作类型 */
  action: PermissionAction;
  /** 无权限时显示的内容（可选） */
  fallback?: ReactNode;
}

/**
 * 权限门控组件
 * 根据权限决定是否渲染子组件
 *
 * @example
 * ```tsx
 * <PermissionGate module="providerKey" action="create">
 *   <Button>添加 API 密钥</Button>
 * </PermissionGate>
 *
 * <PermissionGate
 *   module="skill"
 *   action="delete"
 *   fallback={<span className="text-muted">无删除权限</span>}
 * >
 *   <Button variant="destructive">删除技能</Button>
 * </PermissionGate>
 * ```
 */
export function PermissionGate({
  children,
  module,
  action,
  fallback = null,
}: PermissionGateProps) {
  const canPerform = useCanPerform(action, module);
  return canPerform ? <>{children}</> : <>{fallback}</>;
}

/**
 * CanCreate 组件属性
 */
interface CanActionProps {
  /** 子组件 */
  children: ReactNode;
  /** 模块名称 */
  module: PermissionModule;
  /** 无权限时显示的内容（可选） */
  fallback?: ReactNode;
}

/**
 * 可创建权限组件
 *
 * @example
 * ```tsx
 * <CanCreate module="providerKey">
 *   <Button>添加</Button>
 * </CanCreate>
 * ```
 */
export function CanCreate({ children, module, fallback = null }: CanActionProps) {
  return (
    <PermissionGate module={module} action="create" fallback={fallback}>
      {children}
    </PermissionGate>
  );
}

/**
 * 可更新权限组件
 *
 * @example
 * ```tsx
 * <CanUpdate module="skill">
 *   <Button>编辑</Button>
 * </CanUpdate>
 * ```
 */
export function CanUpdate({ children, module, fallback = null }: CanActionProps) {
  return (
    <PermissionGate module={module} action="update" fallback={fallback}>
      {children}
    </PermissionGate>
  );
}

/**
 * 可删除权限组件
 *
 * @example
 * ```tsx
 * <CanDelete module="plugin">
 *   <Button variant="destructive">删除</Button>
 * </CanDelete>
 * ```
 */
export function CanDelete({ children, module, fallback = null }: CanActionProps) {
  return (
    <PermissionGate module={module} action="delete" fallback={fallback}>
      {children}
    </PermissionGate>
  );
}

/**
 * 可管理权限组件
 *
 * @example
 * ```tsx
 * <CanManage module="routing">
 *   <Button>配置</Button>
 * </CanManage>
 * ```
 */
export function CanManage({ children, module, fallback = null }: CanActionProps) {
  return (
    <PermissionGate module={module} action="manage" fallback={fallback}>
      {children}
    </PermissionGate>
  );
}

/**
 * 无权限提示组件属性
 */
interface NoPermissionProps {
  /** 标题 */
  title?: string;
  /** 描述 */
  description?: string;
  /** 自定义类名 */
  className?: string;
}

/**
 * 无权限提示组件
 *
 * @example
 * ```tsx
 * <NoPermission
 *   title="无访问权限"
 *   description="此功能仅限管理员使用"
 * />
 * ```
 */
export function NoPermission({
  title = '无访问权限',
  description = '您没有权限访问此功能，请联系管理员。',
  className = '',
}: NoPermissionProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center ${className}`}
    >
      <div className="bg-destructive/10 mb-4 rounded-full p-3">
        <svg
          className="text-destructive h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <h3 className="mb-2 text-lg font-semibold">{title}</h3>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}

/**
 * 管理员专属页面包装器
 * 非管理员显示无权限提示
 *
 * @example
 * ```tsx
 * <AdminOnlyPage>
 *   <RoutingConfigPage />
 * </AdminOnlyPage>
 * ```
 */
export function AdminOnlyPage({ children }: { children: ReactNode }) {
  const isAdmin = useIsAdmin();

  if (!isAdmin) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <NoPermission
          title="无访问权限"
          description="此页面仅限管理员访问。如需访问权限，请联系系统管理员。"
        />
      </div>
    );
  }

  return <>{children}</>;
}
