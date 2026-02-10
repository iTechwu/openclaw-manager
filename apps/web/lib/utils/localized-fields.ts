/**
 * 本地化字段工具
 *
 * 用于根据当前语言环境获取对应的字段值
 * 例如：当 locale 为 'zh-CN' 时返回 nameZh，否则返回 name
 */

import type { Locale } from '@/i18n';

/**
 * 带有本地化字段的对象接口
 */
export interface LocalizedFields {
  name?: string | null;
  nameZh?: string | null;
  description?: string | null;
  descriptionZh?: string | null;
}

/**
 * 获取本地化的名称
 * @param item 包含 name 和 nameZh 的对象
 * @param locale 当前语言环境
 * @returns 本地化的名称
 */
export function getLocalizedName<T extends LocalizedFields>(
  item: T,
  locale: Locale,
): string {
  if (locale === 'zh-CN' || locale.startsWith('zh')) {
    return item.nameZh || item.name || '';
  }
  return item.name || '';
}

/**
 * 获取本地化的描述
 * @param item 包含 description 和 descriptionZh 的对象
 * @param locale 当前语言环境
 * @returns 本地化的描述
 */
export function getLocalizedDescription<T extends LocalizedFields>(
  item: T,
  locale: Locale,
): string {
  if (locale === 'zh-CN' || locale.startsWith('zh')) {
    return item.descriptionZh || item.description || '';
  }
  return item.description || '';
}

/**
 * 获取本地化的字段值
 * @param item 包含本地化字段的对象
 * @param field 字段名（不带 Zh 后缀）
 * @param locale 当前语言环境
 * @returns 本地化的字段值
 */
export function getLocalizedField<T extends Record<string, unknown>>(
  item: T,
  field: string,
  locale: Locale,
): string {
  const zhField = `${field}Zh` as keyof T;
  const enField = field as keyof T;

  if (locale === 'zh-CN' || locale.startsWith('zh')) {
    const zhValue = item[zhField];
    if (zhValue && typeof zhValue === 'string') {
      return zhValue;
    }
  }

  const enValue = item[enField];
  return typeof enValue === 'string' ? enValue : '';
}

/**
 * 批量获取本地化字段
 * @param item 包含本地化字段的对象
 * @param locale 当前语言环境
 * @returns 包含本地化 name 和 description 的对象
 */
export function getLocalizedItem<T extends LocalizedFields>(
  item: T,
  locale: Locale,
): { name: string; description: string } & Omit<
  T,
  'name' | 'nameZh' | 'description' | 'descriptionZh'
> {
  return {
    ...item,
    name: getLocalizedName(item, locale),
    description: getLocalizedDescription(item, locale),
  } as { name: string; description: string } & Omit<
    T,
    'name' | 'nameZh' | 'description' | 'descriptionZh'
  >;
}
