/**
 * Standalone Logger Utility
 * 独立日志工具 - 用于模块初始化阶段（Logger 依赖注入之前）
 *
 * 使用场景：
 * 1. Module 初始化时的日志（无法注入 Logger）
 * 2. Provider 工厂函数中的日志
 * 3. 连接事件回调中的日志
 *
 * 注意：对于 Service 层，应该注入 WINSTON_MODULE_PROVIDER 而非使用此工具
 */

import * as winston from 'winston';
import { getWinstonConfig } from './logger.util';

let loggerInstance: winston.Logger | null = null;

/**
 * 获取独立 Logger 实例
 * 单例模式，避免重复创建
 */
function getStandaloneLogger(): winston.Logger {
  if (!loggerInstance) {
    // 使用 console 模式，确保在开发环境可见
    const config = getWinstonConfig('console');
    loggerInstance = winston.createLogger({
      ...config,
      defaultMeta: { source: 'standalone' },
    });
  }
  return loggerInstance;
}

/** Logger 接口类型 */
interface StandaloneLoggerInterface {
  info: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  debug: (message: string, meta?: Record<string, unknown>) => void;
  log: (message: string, meta?: Record<string, unknown>) => void;
}

/**
 * 独立日志对象
 * 提供与 console.* 兼容的接口，便于快速替换
 *
 * @example
 * // 替换前
 * console.log('Redis connected');
 * console.error('Redis error', error);
 *
 * // 替换后
 * import { standaloneLogger } from '@/utils/logger-standalone.util';
 * standaloneLogger.info('Redis connected');
 * standaloneLogger.error('Redis error', { error });
 */
export const standaloneLogger: StandaloneLoggerInterface = {
  info: (message: string, meta?: Record<string, unknown>) => {
    getStandaloneLogger().info(message, meta);
  },

  error: (message: string, meta?: Record<string, unknown>) => {
    getStandaloneLogger().error(message, meta);
  },

  warn: (message: string, meta?: Record<string, unknown>) => {
    getStandaloneLogger().warn(message, meta);
  },

  debug: (message: string, meta?: Record<string, unknown>) => {
    getStandaloneLogger().debug(message, meta);
  },

  /**
   * 兼容 console.log 的方法
   * 用于快速迁移，但建议使用 info/error/warn 等语义化方法
   */
  log: (message: string, meta?: Record<string, unknown>) => {
    getStandaloneLogger().info(message, meta);
  },
};

/**
 * 创建带上下文的 Logger
 * 用于特定模块的日志，自动附加上下文信息
 *
 * @example
 * const logger = createContextLogger('RedisModule');
 * logger.info('Connected'); // 输出: { context: 'RedisModule', message: 'Connected', ... }
 */
export function createContextLogger(
  context: string,
): StandaloneLoggerInterface {
  const childLogger = getStandaloneLogger().child({ context });

  return {
    info: (message: string, meta?: Record<string, unknown>) => {
      childLogger.info(message, meta);
    },
    error: (message: string, meta?: Record<string, unknown>) => {
      childLogger.error(message, meta);
    },
    warn: (message: string, meta?: Record<string, unknown>) => {
      childLogger.warn(message, meta);
    },
    debug: (message: string, meta?: Record<string, unknown>) => {
      childLogger.debug(message, meta);
    },
    log: (message: string, meta?: Record<string, unknown>) => {
      childLogger.info(message, meta);
    },
  };
}
