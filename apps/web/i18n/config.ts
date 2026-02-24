/**
 * i18n 配置文件
 * 定义支持的语言、默认语言和命名空间
 */

// 支持的语言列表
export const locales = ['zh-CN', 'en'] as const;

// 默认语言
export const defaultLocale = 'zh-CN' as const;

// 语言类型
export type Locale = (typeof locales)[number];

// 语言显示名称
export const localeNames: Record<Locale, string> = {
  'zh-CN': '简体中文',
  en: 'English',
};

// 语言图标（可选，用于 UI 显示）
export const localeFlags: Record<Locale, string> = {
  'zh-CN': '🇨🇳',
  en: '🇺🇸',
};

// 命名空间列表（与 locales/ 目录下的 JSON 文件对应）
// 只保留当前仍在使用的命名空间
export const namespaces = [
  'auth',
  'bots',
  'botSkills',
  'common',
  'creative',
  'errors',
  'forms',
  'messages',
  'navigation',
  'plugins',
  'secrets',
  'settings',
  'skills',
  'templates',
  'usage',
  'validation',
] as const;

export type Namespace = (typeof namespaces)[number];

// 检查是否是有效的 locale
export function isValidLocale(locale: string): locale is Locale {
  return locales.includes(locale as Locale);
}
