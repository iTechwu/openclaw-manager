/**
 * Permission Types
 * 权限类型定义
 */

/**
 * 权限操作类型
 */
export type PermissionAction =
  | 'read'
  | 'create'
  | 'update'
  | 'delete'
  | 'install'
  | 'uninstall'
  | 'manage'
  | '*';

/**
 * 权限模块
 */
export type PermissionModule =
  | 'admin'
  | 'bot'
  | 'settings'
  | 'providerKey'
  | 'skill'
  | 'plugin'
  | 'routing';

/**
 * 权限资源（可以是具体资源名或通配符）
 */
export type PermissionResource = string;

/**
 * 权限规则定义
 */
export interface PermissionRule {
  module: PermissionModule;
  resource: PermissionResource;
  action: PermissionAction;
  /** 是否允许，默认 false */
  allowed: boolean;
  /** 是否需要管理员权限 */
  requireAdmin?: boolean;
}

/**
 * 模块权限配置
 */
export type ModulePermissionConfig = Record<
  PermissionResource,
  Record<PermissionAction, boolean>
>;

/**
 * 完整权限配置
 */
export type PermissionConfig = Record<PermissionModule, ModulePermissionConfig>;

/**
 * 用户权限上下文
 */
export interface PermissionContextValue {
  /** 当前用户是否为管理员 */
  isAdmin: boolean;
  /** 检查是否有指定权限 */
  hasPermission: (
    module: PermissionModule,
    resource: PermissionResource,
    action: PermissionAction,
  ) => boolean;
  /** 检查是否可以执行操作 */
  can: (action: PermissionAction, module: PermissionModule) => boolean;
  /** 检查是否不能执行操作 */
  cannot: (action: PermissionAction, module: PermissionModule) => boolean;
}

/**
 * 权限检查参数
 */
export interface PermissionCheckParams {
  module: PermissionModule;
  resource?: PermissionResource;
  action: PermissionAction;
}
