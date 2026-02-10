/**
 * Permission Constants
 * 权限常量和规则配置
 */

import type { PermissionConfig } from './types';

/**
 * 权限规则配置
 * 定义各模块、资源和操作的权限规则
 *
 * 规则说明：
 * - true: 所有登录用户都有权限
 * - false: 仅管理员有权限
 * - 未定义的模块/资源/操作默认允许登录用户访问
 */
export const PERMISSION_RULES: PermissionConfig = {
  // ============================================================================
  // 管理员模块 - 仅管理员可访问
  // ============================================================================
  admin: {
    '*': {
      '*': false,
      read: false,
      create: false,
      update: false,
      delete: false,
      manage: false,
      install: false,
      uninstall: false,
    },
  },

  // ============================================================================
  // Bot 模块 - 所有登录用户可访问自己的 Bot
  // ============================================================================
  bot: {
    '*': {
      '*': true,
      read: true,
      create: true,
      update: true,
      delete: true,
      manage: true,
      install: true,
      uninstall: true,
    },
  },

  // ============================================================================
  // 设置模块 - 所有登录用户可访问
  // ============================================================================
  settings: {
    '*': {
      '*': true,
      read: true,
      create: true,
      update: true,
      delete: true,
      manage: true,
      install: true,
      uninstall: true,
    },
  },

  // ============================================================================
  // API 密钥管理 - 仅管理员可创建/删除，所有用户可查看和使用
  // ============================================================================
  providerKey: {
    '*': {
      '*': false,
      read: true, // 所有用户可查看
      create: false, // 仅管理员
      update: false, // 仅管理员
      delete: false, // 仅管理员
      manage: false, // 仅管理员
      install: true, // 所有用户可使用
      uninstall: true,
    },
  },

  // ============================================================================
  // 技能管理 - 仅管理员可创建/修改/删除，所有用户可查看
  // ============================================================================
  skill: {
    '*': {
      '*': false,
      read: true, // 所有用户可查看
      create: false, // 仅管理员
      update: false, // 仅管理员
      delete: false, // 仅管理员
      manage: false, // 仅管理员
      install: true, // 所有用户可安装到自己的 Bot
      uninstall: true, // 所有用户可卸载自己 Bot 的技能
    },
  },

  // ============================================================================
  // 插件市场 - 仅管理员可创建/修改/删除，所有用户可查看和安装
  // ============================================================================
  plugin: {
    '*': {
      '*': false,
      read: true, // 所有用户可查看
      create: false, // 仅管理员
      update: false, // 仅管理员
      delete: false, // 仅管理员
      manage: false, // 仅管理员
      install: true, // 所有用户可安装到自己的 Bot
      uninstall: true, // 所有用户可卸载自己 Bot 的插件
    },
  },

  // ============================================================================
  // 路由配置 - 所有用户可查看，仅管理员可修改
  // ============================================================================
  routing: {
    '*': {
      '*': false,
      read: true, // 所有用户可查看
      create: false, // 仅管理员
      update: false, // 仅管理员
      delete: false, // 仅管理员
      manage: false, // 仅管理员
      install: false,
      uninstall: false,
    },
  },
};

/**
 * 需要管理员权限的模块列表
 */
export const ADMIN_ONLY_MODULES: string[] = ['admin'];

/**
 * 需要管理员权限的操作（在非 admin 模块中）
 */
export const ADMIN_ONLY_ACTIONS: Record<string, string[]> = {
  providerKey: ['create', 'update', 'delete', 'manage'],
  skill: ['create', 'update', 'delete', 'manage'],
  plugin: ['create', 'update', 'delete', 'manage'],
  routing: ['create', 'update', 'delete', 'manage'],
};
