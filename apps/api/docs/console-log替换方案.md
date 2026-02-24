# console.log 替换为 Winston 的自动化方案

## 1. 概述

本文档描述了如何将项目中的 `console.*` 调用替换为统一的 Winston Logger，包括 ESLint 规则配置、独立 Logger 工具创建、以及各场景的替换策略。

---

## 2. 问题分析

### 2.1 使用场景分类

| 类别 | 数量 | 位置 | 处理方式 |
|------|------|------|----------|
| **启动日志** | ~15 | `main.ts`, `app.module.ts` | ✅ 允许（Logger 未初始化） |
| **脚本/种子数据** | ~90 | `scripts/*.ts`, `prisma/seed.ts` | ✅ 允许（独立脚本） |
| **配置加载** | ~20 | `libs/infra/common/config/` | ✅ 允许（早于 Logger） |
| **模块初始化** | ~30 | `redis.module.ts`, `rabbitmq.module.ts` | ⚠️ 使用 `standaloneLogger` |
| **业务代码** | ~20 | `src/modules/`, `libs/` | ❌ 必须替换为注入式 Logger |
| **测试代码** | ~15 | `*.spec.ts` | ✅ 允许 |
| **文档示例** | ~30 | `*.md`, `README.md` | ✅ 允许 |
| **已注释** | ~15 | `// console.log(...)` | ✅ 允许 |
| **生成代码** | ~5 | `generated/prisma-client/` | ✅ 允许（第三方） |

---

## 3. 解决方案

### 3.1 ESLint 规则配置

**文件**: `apps/api/.eslintrc.js`

```javascript
module.exports = {
  // 排除不需要检查的文件
  ignorePatterns: [
    '.eslintrc.js',
    'dist',
    'node_modules',
    'generated',              // 自动生成的代码
    'scripts',                // 独立脚本
    'prisma/seed.ts',         // 种子数据脚本
    '**/*.spec.ts',           // 测试文件
    '**/test-*.ts',           // 测试连接脚本
    'libs/infra/common/config/**', // 配置加载阶段（Logger 未初始化）
    'src/app.module.ts',      // 应用启动阶段
    'src/main.ts',            // 应用入口
  ],
  
  rules: {
    // 禁止使用 console.* (强制使用 Winston Logger)
    'no-console': [
      'error',
      {
        allow: ['warn', 'error'], // 仅允许 console.warn/error 用于启动阶段
      },
    ],
  },
};
```

### 3.2 独立 Logger 工具

**文件**: `apps/api/libs/infra/utils/logger-standalone.util.ts`

用于模块初始化阶段（Logger 依赖注入之前）：

```typescript
/**
 * Standalone Logger Utility
 * 独立日志工具 - 用于模块初始化阶段（Logger 依赖注入之前）
 */

import * as winston from 'winston';
import { getWinstonConfig } from './logger.util';

let loggerInstance: winston.Logger | null = null;

/** Logger 接口类型 */
interface StandaloneLoggerInterface {
  info: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  debug: (message: string, meta?: Record<string, unknown>) => void;
  log: (message: string, meta?: Record<string, unknown>) => void;
}

function getStandaloneLogger(): winston.Logger {
  if (!loggerInstance) {
    const config = getWinstonConfig('console');
    loggerInstance = winston.createLogger({
      ...config,
      defaultMeta: { source: 'standalone' },
    });
  }
  return loggerInstance;
}

/**
 * 独立日志对象
 */
export const standaloneLogger: StandaloneLoggerInterface = {
  info: (message, meta) => getStandaloneLogger().info(message, meta),
  error: (message, meta) => getStandaloneLogger().error(message, meta),
  warn: (message, meta) => getStandaloneLogger().warn(message, meta),
  debug: (message, meta) => getStandaloneLogger().debug(message, meta),
  log: (message, meta) => getStandaloneLogger().info(message, meta),
};

/**
 * 创建带上下文的 Logger
 * @example
 * const logger = createContextLogger('RedisModule');
 * logger.info('Connected');
 */
export function createContextLogger(context: string): StandaloneLoggerInterface {
  const childLogger = getStandaloneLogger().child({ context });
  return {
    info: (message, meta) => childLogger.info(message, meta),
    error: (message, meta) => childLogger.error(message, meta),
    warn: (message, meta) => childLogger.warn(message, meta),
    debug: (message, meta) => childLogger.debug(message, meta),
    log: (message, meta) => childLogger.info(message, meta),
  };
}
```

---

## 4. 替换示例

### 4.1 模块初始化阶段（使用 standaloneLogger）

**替换前** (`redis.module.ts`):
```typescript
@Module({
  providers: [
    {
      provide: REDIS_AUTH,
      useFactory: async () => {
        const client = new Redis(redisUrl);
        
        client.on('connect', () => {
          console.log('Redis client connected');
        });
        
        client.on('error', (error) => {
          console.error('Error connecting to Redis', error);
        });
        
        return client;
      },
    },
  ],
})
export class RedisModule {}
```

**替换后**:
```typescript
import { createContextLogger } from '@/utils/logger-standalone.util';

const logger = createContextLogger('RedisModule');

@Module({
  providers: [
    {
      provide: REDIS_AUTH,
      useFactory: async () => {
        const client = new Redis(redisUrl);
        
        client.on('connect', () => {
          logger.info('Redis client connected');
        });
        
        client.on('error', (error) => {
          logger.error('Error connecting to Redis', { error: error.message });
        });
        
        return client;
      },
    },
  ],
})
export class RedisModule {}
```

### 4.2 Service 层（使用注入式 Logger）

**替换前**:
```typescript
@Injectable()
export class MyService {
  doSomething() {
    console.log('Operation started');
    console.error('Operation failed', error);
  }
}
```

**替换后**:
```typescript
import { Injectable, Inject } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

@Injectable()
export class MyService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  doSomething() {
    this.logger.info('Operation started');
    this.logger.error('Operation failed', { error: error.message });
  }
}
```

---

## 5. 已替换的文件

| 文件 | 替换方式 |
|------|----------|
| `libs/infra/redis/src/redis.module.ts` | `createContextLogger` |
| `libs/infra/rabbitmq/src/rabbitmq.module.ts` | `createContextLogger` |
| `libs/infra/rabbitmq/src/rabbitmq-events.module.ts` | `createContextLogger` |
| `libs/infra/clients/internal/file-storage/file-qiniu.client.ts` | 注入式 Logger |
| `libs/infra/clients/internal/file-storage/file-tos.client.ts` | 注入式 Logger |
| `libs/infra/clients/internal/sse/sse.client.ts` | 注入式 Logger |

---

## 6. 验证结果

```bash
# 运行 ESLint 检查
pnpm lint

# 验证 no-console 错误数量
pnpm lint 2>&1 | grep -E "no-console" | wc -l
# 输出: 0
```

---

## 7. 相关文档

- [日志使用规范](./日志使用规范.md)
- [架构分层与事务管理方案](./架构分层与事务管理方案-new.md)

---

## 8. 后续维护

1. **CI/CD 集成**: ESLint 规则已配置，每次提交会自动检测
2. **新代码规范**: 新代码禁止使用 `console.*`，必须使用 Logger
3. **逐步清理**: 剩余的 `no-unused-vars` 警告可以逐步处理
