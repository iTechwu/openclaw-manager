# 路由配置优化方案

## 文档概述

本文档分析 Clawbot-Manager 路由配置的实现，识别潜在问题，并提供优化方案。

**涉及文件**：
- [routing-engine.service.ts](apps/api/src/modules/proxy/services/routing-engine.service.ts) - 能力标签路由引擎
- [fallback-engine.service.ts](apps/api/src/modules/proxy/services/fallback-engine.service.ts) - 多模型 Fallback 引擎
- [proxy.service.ts](apps/api/src/modules/proxy/services/proxy.service.ts) - 代理业务服务
- [model-resolver.service.ts](apps/api/src/modules/proxy/services/model-resolver.service.ts) - 模型到 Vendor 解析
- [model-routing.service.ts](apps/api/src/modules/bot-api/model-routing.service.ts) - 路由配置 CRUD
- [routing-suggestion.service.ts](apps/api/src/modules/bot-api/services/routing-suggestion.service.ts) - AI 推荐路由

---

## 一、严重问题（需立即修复）

### 1.1 模型能力评分硬编码

**位置**：[routing-engine.service.ts:816-841](apps/api/src/modules/proxy/services/routing-engine.service.ts#L816-L841)

**问题**：`getModelCapabilityScore()` 方法将模型能力评分硬编码，每次新增模型或模型升级都需要修改代码。

```typescript
private getModelCapabilityScore(model: string): number {
  const modelLower = model.toLowerCase();

  // Anthropic
  if (modelLower.includes('claude-opus-4')) return 100;
  if (modelLower.includes('claude-sonnet-4')) return 85;
  // ... 更多硬编码
}
```

**影响**：
- 新模型上线需要发布代码
- 模型评分无法动态调整
- 运维成本高

**修复方案**：将评分数据移至 `ModelCatalog` 表

```typescript
// 方案：从 ModelCatalog 读取 capabilityScore
async getModelCapabilityScore(model: string): Promise<number> {
  const catalog = await this.modelCatalogService.getByModel(model);
  return catalog?.capabilityScore ?? 50; // 默认分数
}
```

**数据库字段**：
```sql
ALTER TABLE "ModelCatalog" ADD COLUMN "capabilityScore" INTEGER DEFAULT 50;
```

---

### 1.2 复杂度路由配置硬编码

**位置**：[routing-engine.service.ts:37-51](apps/api/src/modules/proxy/services/routing-engine.service.ts#L37-L51)

**问题**：`DEFAULT_COMPLEXITY_ROUTING` 硬编码了复杂度到模型的映射关系。

```typescript
const DEFAULT_COMPLEXITY_ROUTING: ComplexityRoutingConfig = {
  enabled: true,
  models: {
    super_easy: { vendor: 'deepseek', model: 'deepseek-v3' },
    easy: { vendor: 'deepseek', model: 'deepseek-v3' },
    medium: { vendor: 'openai', model: 'gpt-4o' },
    // ... 更多硬编码
  },
};
```

**影响**：
- 无法通过配置动态调整复杂度策略
- 新模型需要发布代码
- 无法按 Bot 定制复杂度策略

**修复方案**：从数据库 `ComplexityRoutingConfig` 表读取

```typescript
// 表已存在，确保正确加载
async loadComplexityRoutingConfig(botId?: string): Promise<ComplexityRoutingConfig> {
  if (botId) {
    const botConfig = await this.complexityRoutingConfigService.getByBotId(botId);
    if (botConfig) return botConfig;
  }
  // Fallback to team/default config
  return this.complexityRoutingConfigService.getDefault();
}
```

---

### 1.3 Fallback 链硬编码

**位置**：[fallback-engine.service.ts:93-180](apps/api/src/modules/proxy/services/fallback-engine.service.ts#L93-L180)

**问题**：默认 Fallback 链在代码中硬编码。

```typescript
private initializeDefaultChains(): void {
  const defaultChains: FallbackChain[] = [
    {
      chainId: 'default',
      name: '默认 Fallback 链',
      models: [
        { vendor: 'anthropic', model: 'claude-sonnet-4-20250514', ... },
        { vendor: 'openai', model: 'gpt-4o', ... },
        // ... 更多硬编码
      ],
    },
  ];
}
```

**影响**：
- 新模型需要发布代码
- 无法动态调整 Fallback 顺序
- 测试环境无法使用不同的 Fallback 配置

**修复方案**：数据库已有 `FallbackChain` 表，确保正确初始化

```typescript
// 启动时从数据库加载
@OnModuleInit()
async onModuleInit() {
  await this.loadFallbackChainsFromDb();
}
```

---

## 二、性能问题

### 2.1 ModelResolver N+1 查询

**位置**：[model-resolver.service.ts:162-177](apps/api/src/modules/proxy/services/model-resolver.service.ts#L162-L177)

**问题**：`enrichWithProviderKeys()` 方法逐个查询 ProviderKey。

```typescript
private async enrichWithProviderKeys(availabilities: any[]): Promise<...> {
  const pkIds = [...new Set(availabilities.map((a) => a.providerKeyId))];
  const pkMap = new Map<string, any>();

  for (const pkId of pkIds) {
    const pk = await this.providerKeyService.getById(pkId);  // ← N 次查询
    if (pk) pkMap.set(pkId, pk);
  }
}
```

**修复方案**：使用批量查询

```typescript
private async enrichWithProviderKeys(availabilities: any[]): Promise<...> {
  const pkIds = [...new Set(availabilities.map((a) => a.providerKeyId))];

  // 批量查询
  const { list: providerKeys } = await this.providerKeyService.list(
    { id: { in: pkIds } },
    { limit: pkIds.length }
  );

  const pkMap = new Map(providerKeys.map(pk => [pk.id, pk]));
  return availabilities.map((a) => ({
    availability: a,
    providerKey: pkMap.get(a.providerKeyId) || null,
  }));
}
```

---

### 2.2 缺少路由配置缓存

**问题**：每次请求都需要查询数据库获取路由配置，高频场景下会产生大量 DB 查询。

**影响的服务**：
- `ModelResolverService.resolveAll()` - 每次请求查询 ModelAvailability
- `FallbackEngineService.getFallbackChain()` - 每次请求查询 FallbackChain
- `RoutingEngineService.parseCapabilityRequirements()` - 每次请求查询 CapabilityTag

**修复方案**：引入多级缓存

```typescript
@Injectable()
export class RoutingCacheService {
  private readonly cache = new Map<string, { data: any; expiry: number }>();
  private readonly defaultTTL = 5 * 60 * 1000; // 5 分钟

  async getOrLoad<T>(key: string, loader: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = this.cache.get(key);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    const data = await loader();
    this.cache.set(key, {
      data,
      expiry: Date.now() + (ttl ?? this.defaultTTL),
    });
    return data;
  }

  invalidate(pattern: string): void {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }
}
```

**缓存策略**：

| 数据类型 | TTL | 失效触发 |
|----------|-----|----------|
| CapabilityTags | 10min | 标签更新 |
| FallbackChains | 5min | 链配置更新 |
| ModelAvailability | 1min | Provider 状态变化 |
| HealthScore | 实时 | 无缓存 |

---

### 2.3 健康评分更新阻塞请求

**位置**：[model-resolver.service.ts:100-125](apps/api/src/modules/proxy/services/model-resolver.service.ts#L100-L125)

**问题**：`updateHealthScore()` 在请求线程中同步更新数据库。

```typescript
// 当前在 proxy.service.ts 中调用
this.modelResolverService
  .updateHealthScore(candidate.providerKeyId, model, success)
  .catch((err) => this.logger.error('[Proxy] Failed to update health score:', err));
```

**修复方案**：使用消息队列异步更新

```typescript
// proxy.service.ts
async handleProxyRequest(...) {
  // ... 请求处理

  // 异步发送健康评分更新事件（不等待）
  this.eventEmitter.emit('health-score.update', {
    providerKeyId: candidate.providerKeyId,
    model,
    success,
  });
}

// health-score.listener.ts
@OnEvent('health-score.update')
async handleHealthScoreUpdate(event: HealthScoreUpdateEvent) {
  await this.modelResolverService.updateHealthScore(
    event.providerKeyId,
    event.model,
    event.success,
  );
}
```

---

## 三、架构问题

### 3.1 路由引擎职责重叠

**问题**：`RoutingEngineService` 和 `FallbackEngineService` 存在职责重叠。

| 职责 | RoutingEngine | FallbackEngine | ModelResolver |
|------|---------------|----------------|---------------|
| 能力标签匹配 | ✅ | ❌ | ❌ |
| 复杂度路由 | ✅ | ❌ | ❌ |
| Fallback 链管理 | ❌ | ✅ | ❌ |
| Vendor 选择 | ❌ | ❌ | ✅ |
| 健康评分 | ❌ | ✅ (代理) | ✅ |
| 协议选择 | ✅ | ❌ | ❌ |

**问题点**：
- `FallbackEngineService.resolveModelVendor()` 代理了 `ModelResolverService`
- `RoutingEngineService.selectRoute()` 也做了一部分 Vendor 选择

**优化方案**：明确职责边界

```typescript
// RoutingEngineService - 只负责路由决策（选择哪个模型）
class RoutingEngineService {
  // 输入：请求内容 + Bot 上下文
  // 输出：RouteDecision（模型、协议、特性）

  parseCapabilityRequirements()  // 能力需求解析
  selectRoute()                   // 路由决策
  selectRouteWithComplexity()     // 复杂度路由
}

// ModelResolverService - 只负责模型实例解析（选择哪个 Provider）
class ModelResolverService {
  // 输入：模型名称
  // 输出：ResolvedModel（ProviderKey、健康评分）

  resolve()           // 解析最优实例
  resolveAll()        // 解析所有实例
  updateHealthScore() // 更新健康评分
}

// FallbackEngineService - 只负责 Fallback 状态管理
class FallbackEngineService {
  // 输入：FallbackChain + 错误信息
  // 输出：下一个模型或失败

  shouldTriggerFallback() // 判断是否触发
  getNextFallback()       // 获取下一个
  buildDynamicFallbackChain() // 动态构建
}
```

---

### 3.2 配置加载分散

**问题**：路由相关配置加载分散在多个服务中。

| 配置类型 | 加载位置 | 加载时机 |
|----------|----------|----------|
| CapabilityTags | RoutingEngineService | 构造函数 |
| FallbackChains | FallbackEngineService | 构造函数 |
| ComplexityRouting | RoutingEngineService | 手动设置 |
| ModelAvailability | ModelResolverService | 每次请求 |

**优化方案**：统一配置服务

```typescript
@Injectable()
export class RoutingConfigurationService implements OnModuleInit {
  private refreshInterval: NodeJS.Timeout;

  constructor(
    private readonly capabilityTagService: CapabilityTagService,
    private readonly fallbackChainService: FallbackChainService,
    private readonly complexityRoutingService: ComplexityRoutingConfigService,
  ) {}

  async onModuleInit() {
    await this.refreshAll();
    // 定期刷新（5分钟）
    this.refreshInterval = setInterval(() => this.refreshAll(), 5 * 60 * 1000);
  }

  async refreshAll(): Promise<void> {
    await Promise.all([
      this.refreshCapabilityTags(),
      this.refreshFallbackChains(),
      this.refreshComplexityRouting(),
    ]);
  }

  private async refreshCapabilityTags(): Promise<void> {
    const tags = await this.capabilityTagService.list({ isActive: true });
    this.routingEngine.loadCapabilityTagsFromDb(tags.list);
  }
}
```

---

## 四、可扩展性问题

### 4.1 能力标签关键词硬编码

**位置**：[routing-suggestion.service.ts:98-188](apps/api/src/modules/bot-api/services/routing-suggestion.service.ts#L98-L188)

**问题**：`TAG_KEYWORD_PATTERNS` 在代码中硬编码了能力标签的关键词匹配模式。

```typescript
const TAG_KEYWORD_PATTERNS: Record<string, string[]> = {
  'deep-reasoning': ['深度分析', '复杂推理', ...],
  'web-search': ['搜索', '查找', '最新', ...],
  // ... 更多硬编码
};
```

**修复方案**：将关键词存储到数据库

```sql
-- 新增表
CREATE TABLE "CapabilityTagKeyword" (
  "id" TEXT PRIMARY KEY,
  "tagId" TEXT NOT NULL REFERENCES "CapabilityTag"("tagId"),
  "keyword" TEXT NOT NULL,
  "language" TEXT DEFAULT 'zh',
  "priority" INTEGER DEFAULT 0
);
```

---

### 4.2 复合场景硬编码

**位置**：[routing-suggestion.service.ts:205-264](apps/api/src/modules/bot-api/services/routing-suggestion.service.ts#L205-L264)

**问题**：`COMPOSITE_SCENARIOS` 硬编码了复合路由场景。

```typescript
const COMPOSITE_SCENARIOS: CompositeScenario[] = [
  { name: '翻译', preferTags: ['chinese-optimized', ...], ... },
  { name: '总结摘要', preferTags: ['long-context', ...], ... },
  // ... 更多硬编码
];
```

**修复方案**：数据库配置或 JSON 配置文件

```typescript
// 方案1：数据库存储
// CREATE TABLE "CompositeScenario" (...)

// 方案2：配置文件（适合较少变更的场景）
// config/composite-scenarios.json
[
  {
    "id": "translation",
    "name": "翻译",
    "patterns": ["翻译", "translate", ...],
    "preferTags": ["chinese-optimized", "general-purpose"]
  }
]
```

---

### 4.3 模型协议推断硬编码

**位置**：[routing-engine.service.ts:860-865](apps/api/src/modules/proxy/services/routing-engine.service.ts#L860-L865)

```typescript
private inferProtocolFromVendor(vendor: string): 'openai-compatible' | 'anthropic-native' {
  return vendor === 'anthropic' ? 'anthropic-native' : 'openai-compatible';
}
```

**问题**：协议推断逻辑过于简单，无法支持新协议（如 Gemini Native、Azure Native）。

**修复方案**：从 ProviderKey 或 ModelCatalog 读取协议类型

```typescript
// ProviderKey 表已有 apiType 字段
async resolveModelVendor(model: string): Promise<ResolvedModel | null> {
  const resolved = await this.modelResolverService.resolve(model);
  return resolved ? {
    ...resolved,
    protocol: this.mapApiTypeToProtocol(resolved.apiType),
  } : null;
}

private mapApiTypeToProtocol(apiType: string): Protocol {
  const mapping: Record<string, Protocol> = {
    'anthropic': 'anthropic-native',
    'openai': 'openai-compatible',
    'gemini': 'gemini-native',  // 未来支持
    'azure-openai': 'openai-compatible',
  };
  return mapping[apiType] ?? 'openai-compatible';
}
```

---

## 五、可观测性问题

### 5.1 缺少结构化指标

**问题**：当前只有日志，缺少 Metrics 指标，无法监控路由性能和成功率。

**需要收集的指标**：

| 指标名称 | 类型 | 描述 |
|----------|------|------|
| `routing_decision_duration_ms` | Histogram | 路由决策耗时 |
| `routing_fallback_count` | Counter | Fallback 触发次数 |
| `routing_model_selected` | Counter | 按模型统计选择次数 |
| `routing_vendor_health_score` | Gauge | Vendor 健康评分 |
| `routing_complexity_distribution` | Histogram | 复杂度分布 |

**修复方案**：集成 Prometheus Metrics

```typescript
@Injectable()
export class RoutingMetricsService {
  private readonly decisionDuration = new Histogram({
    name: 'routing_decision_duration_ms',
    help: 'Routing decision duration in milliseconds',
    labelNames: ['bot_id', 'routing_mode'],
    buckets: [1, 5, 10, 25, 50, 100, 250],
  });

  private readonly fallbackCount = new Counter({
    name: 'routing_fallback_count',
    help: 'Number of fallback triggers',
    labelNames: ['bot_id', 'from_model', 'to_model', 'error_type'],
  });

  recordDecisionDuration(botId: string, mode: string, durationMs: number) {
    this.decisionDuration.labels(botId, mode).observe(durationMs);
  }

  recordFallback(botId: string, fromModel: string, toModel: string, errorType: string) {
    this.fallbackCount.labels(botId, fromModel, toModel, errorType).inc();
  }
}
```

---

### 5.2 缺少分布式追踪

**问题**：无法追踪一次请求的完整路由链路。

**修复方案**：添加 OpenTelemetry 追踪

```typescript
@Injectable()
export class ProxyService {
  @Span('proxy.handle_request')
  async handleProxyRequest(params: ProxyRequestParams, rawResponse: ServerResponse) {
    const span = trace.getActiveSpan();

    span?.setAttributes({
      'proxy.vendor': params.vendor,
      'proxy.path': params.path,
      'proxy.method': params.method,
    });

    // ... 路由决策
    span?.addEvent('routing_decision_made', {
      'routing.model': decision.model,
      'routing.vendor': decision.vendor,
      'routing.protocol': decision.protocol,
    });

    // ... 上游请求
  }
}
```

---

## 六、错误处理问题

### 6.1 缺少断路器模式

**问题**：当某个 Provider 持续失败时，仍然会尝试路由到该 Provider，导致请求延迟。

**位置**：[proxy.service.ts:409-572](apps/api/src/modules/proxy/services/proxy.service.ts#L409-L572) `handleAutoRoutedRequest()`

**修复方案**：集成断路器

```typescript
@Injectable()
export class ProviderCircuitBreaker {
  private readonly circuits = new Map<string, CircuitState>();

  private readonly config = {
    failureThreshold: 5,      // 连续失败次数阈值
    successThreshold: 2,      // 半开状态成功次数
    timeout: 30000,           // 断路器打开时间
  };

  isAvailable(providerKeyId: string): boolean {
    const state = this.circets.get(providerKeyId);
    if (!state) return true;

    if (state.status === 'open') {
      if (Date.now() - state.lastFailure > this.config.timeout) {
        state.status = 'half-open';
        return true;
      }
      return false;
    }

    return true;
  }

  recordSuccess(providerKeyId: string): void {
    const state = this.circuits.get(providerKeyId);
    if (!state) return;

    if (state.status === 'half-open') {
      state.successCount++;
      if (state.successCount >= this.config.successThreshold) {
        state.status = 'closed';
        state.failureCount = 0;
      }
    } else {
      state.failureCount = 0;
    }
  }

  recordFailure(providerKeyId: string): void {
    let state = this.circuits.get(providerKeyId);
    if (!state) {
      state = { status: 'closed', failureCount: 0, successCount: 0, lastFailure: 0 };
      this.circuits.set(providerKeyId, state);
    }

    state.failureCount++;
    state.lastFailure = Date.now();

    if (state.failureCount >= this.config.failureThreshold) {
      state.status = 'open';
      this.logger.warn(`Circuit breaker OPEN for ${providerKeyId}`);
    }
  }
}

interface CircuitState {
  status: 'closed' | 'open' | 'half-open';
  failureCount: number;
  successCount: number;
  lastFailure: number;
}
```

---

### 6.2 Auto-routing 重试逻辑可优化

**位置**：[proxy.service.ts:409-572](apps/api/src/modules/proxy/services/proxy.service.ts#L409-L572)

**问题**：当前重试逻辑在流式响应时不够健壮。

```typescript
// 当前逻辑
if (rawResponse.headersSent) {
  return { success: false, error: `Upstream error: ${errorMessage}` };
}
```

**修复方案**：增加重试策略

```typescript
interface RetryStrategy {
  maxAttempts: number;
  backoffMs: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

const DEFAULT_RETRY_STRATEGY: RetryStrategy = {
  maxAttempts: 3,
  backoffMs: 100,
  backoffMultiplier: 2,
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'rate_limit'],
};

async handleAutoRoutedRequest(...): Promise<ProxyResult> {
  const strategy = DEFAULT_RETRY_STRATEGY;

  for (let attempt = 0; attempt < strategy.maxAttempts; attempt++) {
    const delay = strategy.backoffMs * Math.pow(strategy.backoffMultiplier, attempt);
    if (attempt > 0) {
      await sleep(delay);
    }

    try {
      // 尝试转发
      return await this.tryForward(candidate);
    } catch (error) {
      if (!this.isRetryable(error, strategy)) {
        throw error;
      }
    }
  }
}
```

---

## 七、实施优先级

| 优先级 | 问题 | 影响 | 工作量 | 依赖 |
|--------|------|------|--------|------|
| **P0** | 模型能力评分硬编码 | 运维成本高 | 2h | ModelCatalog 表 |
| **P0** | 复杂度路由配置硬编码 | 无法动态调整 | 1h | 表已存在 |
| **P0** | Fallback 链硬编码 | 无法动态调整 | 1h | 表已存在 |
| **P1** | N+1 查询 | 性能问题 | 30min | 无 |
| **P1** | 路由配置缓存 | 性能问题 | 2h | Redis |
| **P1** | 断路器模式 | 稳定性 | 3h | 无 |
| **P2** | 职责重叠重构 | 可维护性 | 4h | 无 |
| **P2** | 配置加载统一 | 可维护性 | 2h | 无 |
| **P2** | 能力标签关键词数据库化 | 可扩展性 | 3h | 新表 |
| **P3** | Prometheus Metrics | 可观测性 | 4h | Prometheus |
| **P3** | OpenTelemetry 追踪 | 可观测性 | 4h | OpenTelemetry |
| **P3** | 健康评分异步更新 | 性能 | 2h | EventEmitter |

---

## 八、快速修复代码示例

### 8.1 修复 N+1 查询

```typescript
// model-resolver.service.ts
private async enrichWithProviderKeys(
  availabilities: any[],
): Promise<Array<{ availability: any; providerKey: any }>> {
  const pkIds = [...new Set(availabilities.map((a) => a.providerKeyId))];

  if (pkIds.length === 0) {
    return availabilities.map((a) => ({ availability: a, providerKey: null }));
  }

  // 批量查询
  const { list: providerKeys } = await this.providerKeyService.list(
    { id: { in: pkIds } },
    { limit: pkIds.length },
  );

  const pkMap = new Map(providerKeys.map((pk) => [pk.id, pk]));

  return availabilities.map((a) => ({
    availability: a,
    providerKey: pkMap.get(a.providerKeyId) || null,
  }));
}
```

### 8.2 添加模型能力评分数据库字段

```sql
-- 迁移脚本
ALTER TABLE "ModelCatalog"
ADD COLUMN IF NOT EXISTS "capabilityScore" INTEGER DEFAULT 50;

-- 更新现有模型评分
UPDATE "ModelCatalog" SET "capabilityScore" = 100 WHERE model LIKE '%claude-opus-4%';
UPDATE "ModelCatalog" SET "capabilityScore" = 95 WHERE model LIKE '%o1%' AND model NOT LIKE '%mini%';
UPDATE "ModelCatalog" SET "capabilityScore" = 85 WHERE model LIKE '%claude-sonnet-4%';
UPDATE "ModelCatalog" SET "capabilityScore" = 82 WHERE model LIKE '%gpt-4o%' AND model NOT LIKE '%mini%';
UPDATE "ModelCatalog" SET "capabilityScore" = 70 WHERE model LIKE '%deepseek-v3%';
UPDATE "ModelCatalog" SET "capabilityScore" = 65 WHERE model LIKE '%deepseek-chat%';
UPDATE "ModelCatalog" SET "capabilityScore" = 55 WHERE model LIKE '%gpt-4o-mini%';
```

### 8.3 简单缓存实现

```typescript
// model-resolver.service.ts
@Injectable()
export class ModelResolverService {
  private readonly cache = new Map<string, { data: ResolvedModel[]; expiry: number }>();
  private readonly cacheTTL = 60 * 1000; // 1 分钟

  async resolveAll(model: string, options?: ResolveOptions): Promise<ResolvedModel[]> {
    const cacheKey = `${model}:${JSON.stringify(options)}`;
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    const { list: availabilities } = await this.modelAvailabilityService.list(
      { model, isAvailable: true },
      { limit: 50 },
    );

    const enriched = await this.enrichWithProviderKeys(availabilities);
    const result = this.filterAndSort(enriched, options);

    this.cache.set(cacheKey, {
      data: result,
      expiry: Date.now() + this.cacheTTL,
    });

    return result;
  }

  invalidateCache(model?: string): void {
    if (model) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(model)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }
}
```

---

## 九、架构优化建议

### 9.1 服务分层

```
┌─────────────────────────────────────────────────────────────┐
│                    API Layer (Controllers)                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Business Layer (Services)                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │ ProxyService    │  │ ModelRoutingSvc │  │ DockerSvc   │ │
│  └────────┬────────┘  └────────┬────────┘  └─────────────┘ │
└───────────┼─────────────────────┼───────────────────────────┘
            │                     │
            ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    Routing Layer (Engines)                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │ RoutingEngine   │  │ FallbackEngine  │  │ Complexity  │ │
│  │ (决策)          │  │ (状态)          │  │ Classifier  │ │
│  └────────┬────────┘  └────────┬────────┘  └─────────────┘ │
└───────────┼─────────────────────┼───────────────────────────┘
            │                     │
            ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    Resolution Layer                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │ ModelResolver   │  │ HealthScorer    │  │ CircuitBrkr │ │
│  │ (实例解析)      │  │ (健康评分)      │  │ (断路器)    │ │
│  └────────┬────────┘  └────────┬────────┘  └─────────────┘ │
└───────────┼─────────────────────┼───────────────────────────┘
            │                     │
            ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    Infrastructure Layer                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ DB Services │  │ Cache (Redis)│  │ Config Svc  │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

### 9.2 目录结构优化

```
apps/api/src/modules/
├── proxy/
│   ├── proxy.module.ts
│   ├── controllers/
│   │   └── proxy.controller.ts
│   ├── services/
│   │   ├── proxy.service.ts           # 代理入口
│   │   ├── upstream.service.ts        # 上游转发
│   │   └── quota.service.ts           # 配额检查
│   ├── routing/                       # 路由子模块
│   │   ├── routing.module.ts
│   │   ├── engines/
│   │   │   ├── routing-engine.service.ts      # 路由决策
│   │   │   ├── fallback-engine.service.ts     # Fallback 管理
│   │   │   └── complexity-classifier.service.ts # 复杂度分类
│   │   ├── resolvers/
│   │   │   ├── model-resolver.service.ts      # 模型解析
│   │   │   └── health-scorer.service.ts      # 健康评分
│   │   └── config/
│   │       ├── routing-config.service.ts      # 配置加载
│   │       └── capability-tag.service.ts      # 能力标签
│   ├── resilience/                    # 弹性子模块
│   │   ├── circuit-breaker.service.ts # 断路器
│   │   └── retry.strategy.ts          # 重试策略
│   └── config/
│       └── vendor.config.ts           # Vendor 配置
│
└── bot-api/
    ├── model-routing.service.ts       # 路由配置 CRUD
    └── services/
        ├── model-router.service.ts    # 路由执行
        └── routing-suggestion.service.ts # AI 推荐
```

---

## 十、总结

本优化方案识别了路由配置实现中的 6 大类问题：

1. **硬编码问题**：能力评分、复杂度映射、Fallback 链等配置硬编码
2. **性能问题**：N+1 查询、缺少缓存、同步健康评分更新
3. **架构问题**：职责重叠、配置加载分散
4. **可扩展性问题**：关键词、复合场景硬编码
5. **可观测性问题**：缺少 Metrics 和 Tracing
6. **错误处理问题**：缺少断路器、重试逻辑不够健壮

建议按优先级逐步实施，首先解决 P0 级别的硬编码问题，然后优化性能和架构，最后增强可观测性。

---

## 十一、已完成优化（2025-02）

### 11.1 主模型锚定策略 ✅

**实施范围**：
- [routing-suggestion.service.ts](apps/api/src/modules/bot-api/services/routing-suggestion.service.ts)
- [model-routing.service.ts](apps/api/src/modules/bot-api/model-routing.service.ts)
- [bot-complexity-routing.service.ts](apps/api/src/modules/proxy/services/bot-complexity-routing.service.ts)
- [fallback-engine.service.ts](apps/api/src/modules/proxy/services/fallback-engine.service.ts)
- [routing-engine.service.ts](apps/api/src/modules/proxy/services/routing-engine.service.ts)

**优化内容**：
1. **PrimaryModelInfo 接口**：新增接口传递主模型信息
2. **默认目标选择**：`selectDefaultTarget()` 优先返回主模型
3. **置信度阈值**：`PRIMARY_OVERRIDE_CONFIDENCE_THRESHOLD = 80`，只有高置信度才路由到非主模型
4. **Fallback 链首**：主模型作为 Fallback 链的首选
5. **复杂度路由**：主模型能力满足要求时优先使用主模型

### 11.2 N+1 查询优化 ✅

**优化位置**：
- [model-routing.service.ts:310-423](apps/api/src/modules/bot-api/model-routing.service.ts#L310-L423) - `suggestRouting()` 从 2N+1 降为 3 次批量查询
- [bot-complexity-routing.service.ts:240-291](apps/api/src/modules/proxy/services/bot-complexity-routing.service.ts#L240-L291) - `getBotAvailableModelsFromBotModel()` 批量查询
- [model-resolver.service.ts:162-186](apps/api/src/modules/proxy/services/model-resolver.service.ts#L162-L186) - `enrichWithProviderKeys()` 使用 `{ id: { in: pkIds } }` 批量查询

### 11.3 UpstreamService 优化 ✅

**优化位置**：[upstream.service.ts](apps/api/src/modules/proxy/services/upstream.service.ts)

**优化内容**：
1. **SSE Buffer 限制**：64KB 滑动窗口，避免长对话内存爆炸
2. **响应时间追踪**：`StreamForwardResult.responseTimeMs` 记录响应时间
3. **成功状态**：`StreamForwardResult.success` 标记请求是否成功

### 11.4 OpenClaw Client 重构 ✅

**优化位置**：[openclaw/](apps/api/libs/infra/clients/internal/openclaw/)

**优化内容**：
1. **DockerExecService**：提取通用 Docker exec 操作，消除 6 处代码重复
2. **P0 Bug 修复**：
   - `injectMcpConfig()` 添加缺失的 `socketPath`
   - `removeMcpConfig()` 添加缺失的 `socketPath`
   - `removeMcpConfig()` 添加 `serverName` 安全校验
3. **代码简化**：`openclaw.client.ts` 从 1131 行减少到 871 行

### 11.5 ModelResolver 缓存机制 ✅ (2025-02)

**优化位置**：[model-resolver.service.ts](apps/api/src/modules/proxy/services/model-resolver.service.ts)

**优化内容**：
1. **ProviderKey 缓存**：缓存 ProviderKey 信息（vendor、apiType、baseUrl），TTL 5 分钟
2. **enrichWithProviderKeysCached()**：新增带缓存的 ProviderKey 查询方法
3. **invalidateCache()**：手动清除缓存接口
4. **定期清理**：每分钟清理过期缓存条目

### 11.6 断路器模式 ✅ (2025-02)

**新增服务**：[circuit-breaker.service.ts](apps/api/src/modules/proxy/services/circuit-breaker.service.ts)

**功能特性**：
1. **三态断路器**：closed → open → half-open → closed
2. **配置参数**：
   - `failureThreshold`: 5 次连续失败后打开
   - `successThreshold`: 2 次成功后关闭
   - `openTimeout`: 30 秒后进入半开状态
3. **状态管理**：
   - `isAvailable()`: 检查 Provider 是否可用
   - `recordSuccess()`: 记录成功请求
   - `recordFailure()`: 记录失败请求
4. **集成到 ProxyService**：在 `handleAutoRoutedRequest()` 中检查断路器状态

### 11.7 模型能力评分数据库化 ✅ (2025-02)

**优化位置**：[routing-engine.service.ts](apps/api/src/modules/proxy/services/routing-engine.service.ts)

**优化内容**：
1. **getModelCapabilityScore() 异步化**：优先从 `ModelCatalog.reasoningScore` 读取
2. **评分缓存**：5 分钟 TTL 缓存，减少数据库查询
3. **Fallback 机制**：数据库不可用时使用硬编码默认值
4. **缓存管理**：
   - `clearCapabilityScoreCache()`: 手动清除缓存
   - 定期清理过期缓存

### 11.8 复杂度路由配置数据库化 ✅ (2025-02)

**优化位置**：[routing-engine.service.ts](apps/api/src/modules/proxy/services/routing-engine.service.ts)

**优化内容**：
1. **loadComplexityRoutingConfig()**：从 `ComplexityRoutingConfig` 表加载配置
2. **模型映射查询**：通过 `ComplexityRoutingModelMappingService.listByConfigId()` 获取模型
3. **配置缓存**：按 configId 缓存，TTL 5 分钟
4. **Fallback 机制**：数据库不可用时使用 `DEFAULT_COMPLEXITY_ROUTING`
5. **selectRouteWithComplexity() 集成**：优先使用 context 配置，其次尝试从数据库加载

### 11.9 Fallback 链数据库化 ✅ (2025-02)

**优化位置**：[fallback-engine.service.ts](apps/api/src/modules/proxy/services/fallback-engine.service.ts)

**优化内容**：
1. **loadFallbackChainFromDb()**：从 `FallbackChain` 表加载配置
2. **模型列表查询**：通过 `FallbackChainModelService.listByChainId()` 获取模型
3. **getFallbackChainAsync()**：新增异步方法，尝试从数据库加载
4. **配置缓存**：按 chainId 缓存，TTL 5 分钟
5. **buildFallbackChain()**：从数据库记录构建 FallbackChain 对象

### 11.10 健康评分异步更新 ✅ (2025-02)

**新增文件**：
- [events/health-score.event.ts](apps/api/src/modules/proxy/events/health-score.event.ts) - 事件定义
- [events/health-score.listener.ts](apps/api/src/modules/proxy/events/health-score.listener.ts) - 事件监听器

**优化内容**：
1. **HealthScoreUpdateEvent**：健康评分更新事件
2. **HealthScoreListener**：异步监听事件并更新数据库
3. **ProxyService 集成**：使用 `EventEmitter2.emit()` 发送事件，避免阻塞请求
4. **解耦请求处理**：健康评分更新不再阻塞请求处理线程

### 11.11 统一配置加载服务增强 ✅ (2025-02)

**优化位置**：[configuration.service.ts](apps/api/src/modules/proxy/services/configuration.service.ts)

**优化内容**：
1. **OnModuleDestroy 生命周期**：模块销毁时自动清理定时器
2. **EventEmitter2 集成**：配置变更时发送事件通知
3. **ConfigurationChangedEvent**：配置变更事件定义
4. **refreshConfigType()**：按类型刷新特定配置
5. **invalidateAndReload()**：清除所有缓存并重新加载
6. **配置变更事件发送**：各配置加载成功后自动发送事件

**配置加载流程**：
```
模块初始化 (onModuleInit)
    │
    ├─ loadAllConfigurations()
    │   ├─ loadModelCatalog()
    │   ├─ loadCapabilityTags()
    │   ├─ loadFallbackChains()
    │   ├─ loadCostStrategies()
    │   └─ loadComplexityRoutingConfigs()
    │
    └─ startPeriodicRefresh() (5分钟间隔)
```

---

## 十二、待实施优化

| 优先级 | 问题 | 状态 | 备注 |
|--------|------|------|------|
| ~~P1~~ | N+1 查询 | ✅ 已完成 | model-resolver, model-routing, bot-complexity-routing |
| ~~P1~~ | SSE Buffer 无限制 | ✅ 已完成 | 64KB 滑动窗口 |
| ~~P0~~ | 模型能力评分硬编码 | ✅ 已完成 | 从 ModelCatalog.reasoningScore 读取 |
| ~~P0~~ | 复杂度路由配置硬编码 | ✅ 已完成 | 从 ComplexityRoutingConfig 表加载 |
| ~~P0~~ | Fallback 链硬编码 | ✅ 已完成 | 从 FallbackChain 表加载 |
| ~~P1~~ | 路由配置缓存 | ✅ 已完成 | ProviderKey 5分钟缓存 |
| ~~P1~~ | 断路器模式 | ✅ 已完成 | CircuitBreakerService |
| ~~P2~~ | 配置加载统一 | ✅ 已完成 | ConfigurationService 增强 |
| P3 | Prometheus Metrics | 🔴 待实施 | 路由指标收集 |
| P3 | OpenTelemetry 追踪 | 🔴 待实施 | 分布式追踪 |
| ~~P3~~ | 健康评分异步更新 | ✅ 已完成 | 使用 EventEmitter2 |
