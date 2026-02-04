/**
 * 服务端翻译请求配置
 * 用于 Next.js 服务端组件加载翻译
 *
 * 优化说明：
 * - 动态导入所有命名空间，无需手动维护导入列表
 * - 自动同步 config.ts 中定义的命名空间
 * - 添加新翻译文件时无需修改此文件
 */

import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';
import { namespaces } from './config';

export default getRequestConfig(async ({ requestLocale }) => {
  // 获取请求的语言
  let locale = await requestLocale;

  // 验证语言是否在支持的列表中
  if (
    !locale ||
    !routing.locales.includes(locale as (typeof routing.locales)[number])
  ) {
    locale = routing.defaultLocale;
  }

  // 动态导入所有命名空间
  const messageImports = await Promise.all(
    namespaces.map((namespace) =>
      import(`../locales/${locale}/${namespace}.json`).then((module) => ({
        namespace,
        messages: module.default,
      })),
    ),
  );

  // 构建消息对象
  const messages = messageImports.reduce(
    (acc, { namespace, messages }) => {
      acc[namespace] = messages;
      return acc;
    },
    {} as Record<string, unknown>,
  );

  return {
    locale,
    messages,
  };
});
