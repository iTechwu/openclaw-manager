# Bot Usage Analytics 优化文档

## 📋 概述

本文档分析了 `BotUsageAnalytics` 功能的当前实现，并提供了优化建议。该功能用于展示 AI 模型使用情况的统计、趋势和分组数据。

---

## 🏗️ 当前架构

### 代码结构

```
apps/
├── api/
│   └── src/modules/bot-api/
│       ├── bot-api.controller.ts          # API 层 - 处理 HTTP 请求
│       └── services/
│           └── bot-usage-analytics.service.ts  # Service 层 - 业务逻辑
│
├── api/generated/db/modules/bot-usage-log/
│   └── bot-usage-log.service.ts           # DB 层 - 数据库操作
│
└── web/
    ├── app/[locale]/(main)/bots/[hostname]/usage/
    │   └── page.tsx                        # 前端页面
    └── hooks/
        └── useBotUsage.ts                  # 前端 Hooks

packages/contracts/
├── schemas/bot-usage.schema.ts             # Zod Schema 定义
└── api/bot-usage.contract.ts               # API 契约定义
```

### 数据流

```
前端 (React Query + ts-rest)
    ↓
Controller (TsRestHandler + Zod 验证)
    ↓
Service 层 (BotUsageAnalyticsService)
    ↓
DB 层 (BotUsageLogService)
    ↓
Prisma (PostgreSQL 原生 SQL)
```

---

## ✅ 优点分析

### 1. 架构分层清晰

- ✅ 严格遵循 4 层架构：API → Service → DB → Prisma
- ✅ DB 操作全部封装在 `BotUsageLogService` 中
- ✅ Service 层不直接调用 Prisma，而是通过 DB Service

### 2. Zod-first 验证

- ✅ 所有 API 请求/响应都有 Zod Schema
- ✅ 使用 `tsRestHandler` 自动验证
- ✅ 类型安全的前后端通信

### 3. 性能优化

- ✅ 模型定价缓存（5 分钟 TTL）
- ✅ 使用原生 SQL 进行复杂聚合（时间桶、分组统计）
- ✅ `Promise.all` 并行查询

### 4. 错误处理

- ✅ DB 层使用 `@HandlePrismaError` 装饰器
- ✅ 后备定价机制（`FALLBACK_MODEL_PRICING`）

---

## ⚠️ 优化建议

### 1. 【高优先级】缓存策略优化 ✅ 已完成

**问题**：当前每次请求都会检查缓存有效性，可能产生额外的 DB 查询。

**解决方案**：

```typescript
// 优化后：使用定时刷新，避免请求时刷新
import { Cron } from '@nestjs/schedule';

@Cron('*/5 * * * *') // 每 5 分钟刷新
async scheduledRefreshPricingCache(): Promise<void> {
  await this.refreshPricingCache();
}
```

**变更**：
- 移除 `ensureCacheValid()` 方法
- 移除 `lastCacheRefresh` 和 `CACHE_TTL_MS` 属性
- 使用 `@Cron` 装饰器定时刷新缓存

### 2. 【中优先级】SQL 查询优化 ✅ 已完成

**问题**：`aggregateByGroup` 方法使用 `$queryRawUnsafe`，存在 SQL 注入风险。

**解决方案**：
- 对于 `vendor` 和 `model`：使用 Prisma `groupBy`（类型安全、无 SQL 注入风险）
- 对于 `status`：使用 `$queryRaw` 模板字符串（参数化查询，静态 CASE 表达式）

```typescript
// vendor 和 model：使用 Prisma groupBy
if (groupBy === 'vendor' || groupBy === 'model') {
  const result = await this.getReadClient().botUsageLog.groupBy({
    by: [groupBy],
    where,
    _sum: { requestTokens: true, responseTokens: true },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });
  // ...
}

// status：使用参数化查询
const result = await this.getReadClient().$queryRaw`
  SELECT
    CASE WHEN status_code >= 400 OR error_message IS NOT NULL
    THEN 'error' ELSE 'success' END as group_key,
    ...
  WHERE bot_id = ${botId}::uuid
    ${startDate ? Prisma.sql`AND created_at >= ${startDate}` : Prisma.empty}
    ${endDate ? Prisma.sql`AND created_at <= ${endDate}` : Prisma.empty}
  ...
`;
```

**变更**：
- 移除 `$queryRawUnsafe` 调用
- 移除动态 SQL 字符串拼接
- 使用 Prisma `Prisma.sql` 和 `Prisma.empty` 进行条件查询

### 3. 【中优先级】前端性能优化 ✅ 已完成

**问题**：`SimpleTrendChart` 组件在数据量大时渲染效率低。

**解决方案**：

```typescript
// 数据采样：超过 100 个点时自动采样
const sampledData = useMemo(() => {
  if (!data || data.length <= 100) return data;
  const step = Math.ceil(data.length / 100);
  return data.filter((_, index) => index % step === 0);
}, [data]);

// 缓存最大值计算
const maxValue = useMemo(() => {
  if (!sampledData || sampledData.length === 0) return 0;
  return Math.max(...sampledData.map((d) => Math.max(d.requestTokens, d.responseTokens)));
}, [sampledData]);

// 缓存图表柱状条渲染
const chartBars = useMemo(() => {
  if (!sampledData || maxValue === 0) return null;
  return sampledData.map((point, index) => (
    <div key={index} ...>
  ));
}, [sampledData, maxValue, inputLabel, outputLabel]);
```

**变更**：
- 添加数据采样（最多 100 个数据点）
- 使用 `useMemo` 缓存 `sampledData`、`maxValue`、`chartBars`
- 减少 DOM 节点数量，提高渲染性能

### 4. 【低优先级】类型安全增强

**问题**：某些地方使用 `as` 类型断言。

**当前代码**：
```typescript
// bot-usage-analytics.service.ts:180
const botId = where.botId as string;
const startDate = (where.createdAt as { gte?: Date })?.gte;
```

**建议**：定义明确的参数类型：

```typescript
// 定义查询参数接口
interface AggregateQueryParams {
  botId: string;
  startDate?: Date;
  endDate?: Date;
}

// 在方法签名中使用
private async aggregateByGroup(
  params: AggregateQueryParams,
  groupBy: 'vendor' | 'model' | 'status',
): Promise<BreakdownGroup[]> {
  const { botId, startDate, endDate } = params;
  // ...
}
```

### 5. 【建议】添加监控和日志

**建议添加**：

```typescript
// 添加性能监控
async getStats(userId: string, hostname: string, query: UsageStatsQuery) {
  const startTime = Date.now();
  try {
    // ... 业务逻辑
    return result;
  } finally {
    this.logger.info('[BotUsageAnalytics] getStats completed', {
      userId,
      hostname,
      duration: Date.now() - startTime,
    });
  }
}
```

---

## 📊 架构合规性检查

| 检查项 | 状态 | 说明 |
|--------|------|------|
| DB 操作封装在 DB Service | ✅ 通过 | 所有 Prisma 调用在 `BotUsageLogService` |
| Zod Schema 验证 | ✅ 通过 | 所有 API 有完整的 Zod Schema |
| 外部 API 调用 | N/A | 无外部 API 调用 |
| Winston Logger | ✅ 通过 | 使用 `WINSTON_MODULE_PROVIDER` |
| 错误处理 | ✅ 通过 | DB 层有 `@HandlePrismaError` |

---

## 🔄 API 端点清单

| 端点 | 方法 | 用途 |
|------|------|------|
| `/bot/:hostname/usage/stats` | GET | 获取用量统计 |
| `/bot/:hostname/usage/trend` | GET | 获取用量趋势 |
| `/bot/:hostname/usage/breakdown` | GET | 获取分组统计 |
| `/bot/:hostname/usage/logs` | GET | 获取日志列表 |

---

## 📝 待办事项

- [x] ~~添加定时缓存刷新（替代请求时刷新）~~ ✅ **已完成 (2025-02-24)**
- [x] ~~重构 `aggregateByGroup` 移除 `$queryRawUnsafe`~~ ✅ **已完成 (2025-02-24)**
- [x] ~~前端图表添加数据采样和虚拟化~~ ✅ **已完成 (2025-02-24)**
- [x] ~~添加性能监控指标~~ ✅ **已完成 (2025-02-24)**
- [ ] 考虑添加 Redis 缓存层（高频访问场景）

---

## 🔄 变更日志

### 2025-02-24 - 性能监控指标

**变更内容**：
- 为 `getStats`、`getTrend`、`getBreakdown` 三个关键方法添加执行时间监控
- 使用 `try/finally` 模式确保无论成功或失败都记录执行时间
- 记录关键指标：`duration`、`requestCount`、`granularity`、`groupBy` 等

**修改文件**：
- `apps/api/src/modules/bot-api/services/bot-usage-analytics.service.ts`

**优势**：
1. 可追踪每个请求的执行时间，便于性能分析
2. 帮助识别慢查询和性能瓶颈
3. 结构化日志便于后续监控系统集成

---

### 2025-02-24 - 前端图表性能优化

**变更内容**：
- 为 `SimpleTrendChart` 组件添加数据采样（最多 100 个数据点）
- 使用 `useMemo` 缓存 `sampledData`、`maxValue`、`chartBars` 计算结果
- 减少 DOM 节点数量，提高大数据量场景下的渲染性能

**修改文件**：
- `apps/web/app/[locale]/(main)/bots/[hostname]/usage/page.tsx`

**优势**：
1. 数据量大时自动采样，避免渲染过多 DOM 节点
2. useMemo 避免重复计算，提高响应速度
3. 保持图表可读性的同时优化性能

---

### 2025-02-24 - SQL 查询安全优化

**变更内容**：
- 重构 `aggregateByGroup` 方法，移除 `$queryRawUnsafe`
- `vendor` 和 `model` 分组使用 Prisma `groupBy`（类型安全）
- `status` 分组使用参数化的 `$queryRaw` 模板字符串

**修改文件**：
- `apps/api/generated/db/modules/bot-usage-log/bot-usage-log.service.ts`

**优势**：
1. 消除 SQL 注入风险
2. `vendor` 和 `model` 查询使用 Prisma 原生 API，类型更安全
3. 代码更易维护和理解

---

### 2025-02-24 - 缓存策略优化

**变更内容**：
- 将模型定价缓存从"请求时检查+刷新"改为"定时刷新"
- 使用 `@nestjs/schedule` 的 `@Cron` 装饰器每 5 分钟自动刷新缓存
- 移除 `ensureCacheValid()` 方法，减少请求时的额外开销

**修改文件**：
- `apps/api/src/modules/bot-api/services/bot-usage-analytics.service.ts`

**代码变更**：
```typescript
// 新增：定时刷新装饰器
@Cron('*/5 * * * *')
async scheduledRefreshPricingCache(): Promise<void> {
  await this.refreshPricingCache();
}

// 移除：ensureCacheValid() 方法
// 移除：lastCacheRefresh 和 CACHE_TTL_MS 属性
```

**优势**：
1. 消除请求时的潜在延迟（不再需要检查缓存有效性）
2. 缓存刷新在后台进行，不影响用户请求
3. 代码更简洁，减少了状态管理

---

## 📚 参考文档

- [架构分层与事务管理方案](../apps/api/docs/架构分层与事务管理方案-new.md)
- [ts-rest Zod-first REST 协议框架设计方案](../docs/ts-rest_Zod-first_REST_协议框架设计方案.md)
- [代码质量与类型定义规范](../apps/web/docs/代码质量与类型定义规范.md)

---

*生成时间：2025-02-24*
*分析范围：BotUsageAnalytics 模块*
