'use client';

/**
 * useLocalizedFields Hook
 *
 * 用于在组件中获取本地化字段
 */

import { useLocale } from 'next-intl';
import { useMemo, useCallback } from 'react';
import type { Locale } from '@/i18n';
import {
  getLocalizedName,
  getLocalizedDescription,
  getLocalizedField,
  getLocalizedItem,
  type LocalizedFields,
} from '@/lib/utils/localized-fields';

/**
 * 获取本地化字段的 Hook
 *
 * @example
 * ```tsx
 * const { getName, getDescription, getField, localizeItem } = useLocalizedFields();
 *
 * // 获取单个字段
 * const name = getName(skill);
 * const description = getDescription(skill);
 *
 * // 获取任意字段
 * const title = getField(item, 'title');
 *
 * // 批量本地化
 * const localizedSkill = localizeItem(skill);
 * ```
 */
export function useLocalizedFields() {
  const locale = useLocale() as Locale;

  const getName = useCallback(
    <T extends LocalizedFields>(item: T): string => {
      return getLocalizedName(item, locale);
    },
    [locale],
  );

  const getDescription = useCallback(
    <T extends LocalizedFields>(item: T): string => {
      return getLocalizedDescription(item, locale);
    },
    [locale],
  );

  const getField = useCallback(
    <T extends Record<string, unknown>>(item: T, field: string): string => {
      return getLocalizedField(item, field, locale);
    },
    [locale],
  );

  const localizeItem = useCallback(
    <T extends LocalizedFields>(item: T) => {
      return getLocalizedItem(item, locale);
    },
    [locale],
  );

  /**
   * 批量本地化数组
   */
  const localizeItems = useCallback(
    <T extends LocalizedFields>(items: T[]) => {
      return items.map((item) => getLocalizedItem(item, locale));
    },
    [locale],
  );

  /**
   * 判断当前是否为中文环境
   */
  const isZhLocale = useMemo(() => {
    return locale === 'zh-CN' || locale.startsWith('zh');
  }, [locale]);

  return {
    locale,
    isZhLocale,
    getName,
    getDescription,
    getField,
    localizeItem,
    localizeItems,
  };
}
