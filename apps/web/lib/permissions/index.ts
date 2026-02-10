/**
 * Permission Module
 * 统一权限管理模块
 *
 * @example
 * ```tsx
 * // 使用 Hooks
 * import { usePermissions, useIsAdmin, useCanPerform } from '@/lib/permissions';
 *
 * const { isAdmin, can, cannot, hasPermission } = usePermissions();
 * const isAdminUser = useIsAdmin();
 * const canCreateKey = useCanPerform('create', 'providerKey');
 *
 * // 使用组件
 * import {
 *   AdminOnly,
 *   PermissionGate,
 *   CanCreate,
 *   CanUpdate,
 *   CanDelete,
 *   NoPermission,
 *   AdminOnlyPage,
 * } from '@/lib/permissions';
 *
 * <AdminOnly>
 *   <Button>仅管理员可见</Button>
 * </AdminOnly>
 *
 * <PermissionGate module="providerKey" action="create">
 *   <Button>添加 API 密钥</Button>
 * </PermissionGate>
 *
 * <CanDelete module="skill">
 *   <Button variant="destructive">删除</Button>
 * </CanDelete>
 * ```
 */

// Types
export type {
  PermissionAction,
  PermissionModule,
  PermissionResource,
  PermissionRule,
  ModulePermissionConfig,
  PermissionConfig,
  PermissionContextValue,
  PermissionCheckParams,
} from './types';

// Constants
export { PERMISSION_RULES, ADMIN_ONLY_MODULES, ADMIN_ONLY_ACTIONS } from './constants';

// Context
export { PermissionProvider, usePermissionContext } from './context';

// Hooks
export { usePermissions, useIsAdmin, useCanPerform } from './hooks';

// Components
export {
  AdminOnly,
  PermissionGate,
  CanCreate,
  CanUpdate,
  CanDelete,
  CanManage,
  NoPermission,
  AdminOnlyPage,
} from './components';
