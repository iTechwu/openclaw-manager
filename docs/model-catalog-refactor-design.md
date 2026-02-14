# 模型目录（ModelCatalog）重构设计方案

> 将模型身份、能力、定价与供应商可用性解耦，建立以 model 为核心的统一数据模型。
>
> **实施状态（2026-02-14）**：核心 Schema 变更、外键迁移、Contract/Service 层适配已全部完成。`ModelResolverService`（运行时 Vendor 解析 + 健康评分）已实现并集成到 `ModelRouterService.getDefaultRoute()` 和 `FallbackEngineService`。

## 1. 问题分析

### 1.1 现状

当前 schema 中，多个路由/能力相关表直接引用 `ModelAvailability`（vendor + model 的组合）：

| 表名                            | 当前外键              | 问题                                               |
| ------------------------------- | --------------------- | -------------------------------------------------- |
| `ModelCapabilityTag`            | `modelAvailabilityId` | 能力标签是模型固有属性，不应绑定到特定 vendor      |
| `FallbackChainModel`            | `modelAvailabilityId` | Fallback 策略应基于模型，运行时再解析到可用 vendor |
| `ComplexityRoutingModelMapping` | `modelAvailabilityId` | 复杂度路由应基于模型能力，不应绑定 vendor          |

### 1.2 核心矛盾

同一个模型（如 `gpt-4o`）可能通过多个 vendor 提供服务（OpenAI 直连、Azure、各类 Gateway）。当前设计导致：

1. **数据冗余**：同一模型的能力标签需要为每个 vendor 实例重复创建
2. **配置脆弱**：Fallback 链绑定到特定 vendor 实例，vendor 下线时整条链失效
3. **语义错误**：模型能力（reasoning score、coding score）是模型固有属性，与 vendor 无关
4. **维护成本高**：新增 vendor 时需要重新配置所有路由规则

### 1.3 已正确的部分

- `ModelPricing`（现已重命名为 `ModelCatalog`）：已使用 `model` 作为唯一键（模型级别），设计正确 ✅
- `ModelAvailability`：作为 vendor + model 的可用性追踪，职责清晰 ✅

## 2. 设计目标

1. **模型身份唯一性**：以 `model`（模型标识符）为核心，建立统一的模型目录
2. **关注点分离**：模型能力/定价（模型级） vs 供应商可用性（vendor 级）
3. **路由解耦**：路由配置引用模型目录，运行时动态解析到可用 vendor
4. **向后兼容**：渐进式迁移，支持双写过渡期

## 3. 架构设计

### 3.1 核心思路：ModelPricing 升级为 ModelCatalog

当前 `ModelPricing` 表已包含模型身份、定价、能力评分、特性支持等完整信息，实质上已经是一个模型目录。方案将其重命名为 `ModelCatalog`，作为所有模型级关系的锚点。

### 3.2 新的数据模型关系

```
┌─────────────────────────────────────────────────────────────┐
│                     ModelCatalog                            │
│  (原 ModelPricing，模型级别，model 唯一)                       │
│                                                             │
│  model: "gpt-4o" (unique)                                   │
│  vendor: "openai" (原始供应商)                                │
│  pricing, capability scores, feature flags...               │
├─────────────────────────────────────────────────────────────┤
│                          │                                  │
│    ┌─────────────────────┼──────────────────────┐           │
│    │                     │                      │           │
│    ▼                     ▼                      ▼           │
│ ModelCapabilityTag  FallbackChainModel  ComplexityRouting   │
│ (模型级能力标签)     (模型级 Fallback)    ModelMapping       │
│                                         (模型级复杂度路由)   │
│                                                             │
│                     │                                       │
│                     ▼                                       │
│              ModelAvailability                               │
│  (vendor 级可用性，providerKeyId + model 唯一)               │
│                                                             │
│  ┌──────────────────────────────────────────┐               │
│  │ providerKey(OpenAI) + gpt-4o → ✅ 可用   │               │
│  │ providerKey(Azure)  + gpt-4o → ✅ 可用   │               │
│  │ providerKey(Gateway)+ gpt-4o → ❌ 不可用  │               │
│  └──────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 运行时模型解析流程

```
请求进入
  │
  ▼
路由决策（基于 ModelCatalog）
  │  - 能力标签匹配
  │  - 复杂度路由
  │  - Fallback 链
  │
  ▼
选定目标模型（如 gpt-4o）
  │
  ▼
可用性解析（ModelAvailability）
  │  - 查询该 model 的所有可用 vendor 实例
  │  - 按优先级/健康度/成本排序
  │  - 选择最优 vendor 实例
  │
  ▼
执行请求（通过选定的 ProviderKey）
```

## 4. Schema 变更详细设计

> **✅ 全部已实现** — 以下 Schema 变更已通过 Prisma Migration 执行完成。

### 4.1 ModelCatalog（重命名自 ModelPricing）

> 表名变更：`b_model_pricing` → `b_model_catalog`

```prisma
/// ModelCatalog - 模型目录（全局模型注册中心）
/// 以 model 为唯一标识，存储模型身份、定价、能力评分、特性支持等信息
/// 所有路由配置（能力标签、Fallback、复杂度路由）均引用此表
model ModelCatalog {
  id          String  @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  /// 模型标识符（全局唯一），如 "gpt-4o", "claude-sonnet-4-20250514"
  model       String  @unique @db.VarChar(100)
  /// 原始供应商标识（openai, anthropic, google, deepseek 等）
  vendor      String  @db.VarChar(50)
  /// 模型显示名称
  displayName String? @map("display_name") @db.VarChar(255)
  /// 模型描述
  description String? @db.Text

  // ============ 定价信息（美元/百万 tokens）============
  inputPrice      Decimal  @map("input_price") @db.Decimal(10, 6)
  outputPrice     Decimal  @map("output_price") @db.Decimal(10, 6)
  cacheReadPrice  Decimal? @map("cache_read_price") @db.Decimal(10, 6)
  cacheWritePrice Decimal? @map("cache_write_price") @db.Decimal(10, 6)
  thinkingPrice   Decimal? @map("thinking_price") @db.Decimal(10, 6)

  // ============ 能力评分（0-100）============
  reasoningScore  Int @default(50) @map("reasoning_score")
  codingScore     Int @default(50) @map("coding_score")
  creativityScore Int @default(50) @map("creativity_score")
  speedScore      Int @default(50) @map("speed_score")
  contextLength   Int @default(128) @map("context_length")

  // ============ 特性支持 ============
  supportsExtendedThinking Boolean @default(false) @map("supports_extended_thinking")
  supportsCacheControl     Boolean @default(false) @map("supports_cache_control")
  supportsVision           Boolean @default(false) @map("supports_vision")
  supportsFunctionCalling  Boolean @default(true) @map("supports_function_calling")
  supportsStreaming        Boolean @default(true) @map("supports_streaming")

  // ============ 推荐场景 ============
  recommendedScenarios Json? @map("recommended_scenarios") @db.JsonB

  // ============ 数据来源追踪 ============
  dataSource String  @default("manual") @map("data_source") @db.VarChar(20)
  sourceUrl  String? @map("source_url") @db.VarChar(500)

  // ============ 状态 ============
  isEnabled       Boolean   @default(true) @map("is_enabled")
  isDeprecated    Boolean   @default(false) @map("is_deprecated")
  deprecationDate DateTime? @map("deprecation_date") @db.Timestamptz(6)
  priceUpdatedAt  DateTime  @default(now()) @map("price_updated_at") @db.Timestamptz(6)
  notes           String?   @db.Text
  metadata        Json?     @db.JsonB

  isDeleted Boolean   @default(false) @map("is_deleted")
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt DateTime? @map("deleted_at") @db.Timestamptz(6)

  // ============ 关联关系 ============
  /// 该模型在各 vendor 的可用性记录
  availabilities  ModelAvailability[]
  /// 模型能力标签（模型级）
  capabilityTags  ModelCapabilityTag[]
  /// Fallback 链引用
  fallbackChainModels       FallbackChainModel[]
  /// 复杂度路由引用
  complexityRoutingMappings ComplexityRoutingModelMapping[]

  @@index([vendor])
  @@index([isEnabled])
  @@index([isDeprecated])
  @@index([isDeleted])
  @@index([supportsExtendedThinking])
  @@index([supportsCacheControl])
  @@map("b_model_catalog")
}
```

### 4.2 ModelAvailability（调整关联）

> 变更：新增 `modelCatalogId` 外键，建立与 ModelCatalog 的正式关联；移除同步追踪字段（迁移到 ModelCatalog 级别）

```prisma
model ModelAvailability {
  id             String    @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  /// 模型标识符
  model          String    @db.VarChar(100)
  /// 关联的 Provider Key
  providerKeyId  String    @map("provider_key_id") @db.Uuid
  /// 关联的 ModelCatalog ID（新增：建立正式外键关联）
  modelCatalogId String?   @map("model_catalog_id") @db.Uuid
  /// 模型类型
  modelType      ModelType @default(llm) @map("model_type")
  /// 模型是否可用
  isAvailable    Boolean   @default(false) @map("is_available")
  /// 最后验证时间
  lastVerifiedAt DateTime  @map("last_verified_at") @db.Timestamptz(6)
  /// 验证失败时的错误信息
  errorMessage   String?   @map("error_message") @db.Text

  // ============ Vendor 级别特有配置 ============
  /// 该 vendor 实例的优先级（用于同模型多 vendor 时的选择）
  vendorPriority Int @default(0) @map("vendor_priority")
  /// 该 vendor 实例的健康评分（基于历史成功率动态计算）
  healthScore    Int @default(100) @map("health_score")

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  providerKey  ProviderKey   @relation(fields: [providerKeyId], references: [id], onDelete: Cascade)
  modelCatalog ModelCatalog? @relation(fields: [modelCatalogId], references: [id], onDelete: SetNull)

  @@unique([providerKeyId, model])
  @@index([model])
  @@index([modelCatalogId])
  @@index([modelType])
  @@index([isAvailable])
  @@map("b_model_availability")
}
```

**关键变更说明：**

- 新增 `modelCatalogId`：建立与 ModelCatalog 的正式外键关联
- 新增 `vendorPriority`：同模型多 vendor 时的选择优先级
- 新增 `healthScore`：基于历史请求成功率动态计算的健康评分
- 移除 `modelPricingId`：由 `modelCatalogId` 替代（ModelCatalog 包含定价信息）
- 移除 `pricingSynced/tagsSynced` 等同步字段：能力标签和定价已迁移到 ModelCatalog 级别

### 4.3 ModelCapabilityTag（变更外键）

> 变更：`modelAvailabilityId` → `modelCatalogId`

```prisma
/// ModelCapabilityTag - 模型与能力标签的关联表
/// 存储模型（非 vendor 实例）与能力标签的多对多关系
model ModelCapabilityTag {
  id              String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  /// 关联的 ModelCatalog ID（模型级别）
  modelCatalogId  String   @map("model_catalog_id") @db.Uuid
  /// 关联的 CapabilityTag ID
  capabilityTagId String   @map("capability_tag_id") @db.Uuid
  /// 匹配来源
  matchSource     String   @default("pattern") @map("match_source") @db.VarChar(20)
  /// 匹配置信度 (0-100)
  confidence      Int      @default(100)
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  modelCatalog  ModelCatalog  @relation(fields: [modelCatalogId], references: [id], onDelete: Cascade)
  capabilityTag CapabilityTag @relation(fields: [capabilityTagId], references: [id], onDelete: Cascade)

  @@unique([modelCatalogId, capabilityTagId])
  @@index([modelCatalogId])
  @@index([capabilityTagId])
  @@index([matchSource])
  @@map("b_model_capability_tag")
}
```

### 4.4 FallbackChainModel（变更外键）

> 变更：`modelAvailabilityId` → `modelCatalogId`

```prisma
/// FallbackChainModel - Fallback 链模型关联表
/// 引用 ModelCatalog（模型级别），运行时动态解析到可用 vendor
model FallbackChainModel {
  id              String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  /// 关联的 FallbackChain ID
  fallbackChainId String   @map("fallback_chain_id") @db.Uuid
  /// 关联的 ModelCatalog ID（模型级别，运行时解析到可用 vendor）
  modelCatalogId  String   @map("model_catalog_id") @db.Uuid
  /// 在链中的顺序（0 = 首选模型）
  priority        Int      @default(0)
  /// 协议覆盖
  protocolOverride String? @map("protocol_override") @db.VarChar(50)
  /// 特性覆盖配置
  featuresOverride Json?   @map("features_override") @db.JsonB

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  fallbackChain FallbackChain @relation(fields: [fallbackChainId], references: [id], onDelete: Cascade)
  modelCatalog  ModelCatalog  @relation(fields: [modelCatalogId], references: [id], onDelete: Cascade)

  @@unique([fallbackChainId, modelCatalogId])
  @@index([fallbackChainId])
  @@index([modelCatalogId])
  @@index([priority])
  @@map("b_fallback_chain_model")
}
```

### 4.5 ComplexityRoutingModelMapping（变更外键）

> 变更：`modelAvailabilityId` → `modelCatalogId`

```prisma
/// ComplexityRoutingModelMapping - 复杂度路由模型映射表
/// 引用 ModelCatalog（模型级别），运行时动态解析到可用 vendor
model ComplexityRoutingModelMapping {
  id                 String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  /// 关联的 ComplexityRoutingConfig ID
  complexityConfigId String   @map("complexity_config_id") @db.Uuid
  /// 复杂度级别
  complexityLevel    String   @map("complexity_level") @db.VarChar(20)
  /// 关联的 ModelCatalog ID（模型级别）
  modelCatalogId     String   @map("model_catalog_id") @db.Uuid
  /// 在同级别中的优先级
  priority           Int      @default(0)

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  complexityConfig ComplexityRoutingConfig @relation(fields: [complexityConfigId], references: [id], onDelete: Cascade)
  modelCatalog     ModelCatalog            @relation(fields: [modelCatalogId], references: [id], onDelete: Cascade)

  @@unique([complexityConfigId, complexityLevel, modelCatalogId])
  @@index([complexityConfigId])
  @@index([modelCatalogId])
  @@index([complexityLevel])
  @@map("b_complexity_routing_model_mapping")
}
```

## 5. 运行时 Vendor 解析策略

> **✅ ModelResolverService 已实现** — 位于 `apps/api/src/modules/proxy/services/model-resolver.service.ts`，已注册到 ProxyModule。`ModelHealthService` 的核心功能（`updateHealthScore`）已集成到 ModelResolverService 中。

### 5.1 ModelResolverService

当路由决策选定一个模型后，需要将其解析为具体的 vendor 实例（ProviderKey）。

```typescript
@Injectable()
export class ModelResolverService {
  /**
   * 将 ModelCatalog 中的模型解析为最优的可用 vendor 实例
   *
   * 解析优先级：
   * 1. isAvailable = true（必须可用）
   * 2. vendorPriority DESC（用户配置的优先级）
   * 3. healthScore DESC（动态健康评分）
   * 4. lastVerifiedAt DESC（最近验证的优先）
   */
  async resolveModel(
    model: string,
    options?: {
      preferredVendor?: string; // 优先选择的 vendor
      requiredProtocol?: string; // 要求的协议类型
      excludeProviderKeys?: string[]; // 排除的 ProviderKey（已失败的）
    },
  ): Promise<ResolvedModel | null> {
    // 1. 查询该 model 的所有可用 vendor 实例
    const availabilities = await this.modelAvailabilityDb.findAvailable({
      model,
      isAvailable: true,
      excludeIds: options?.excludeProviderKeys,
    });

    // 2. 如果指定了协议要求，过滤匹配的 vendor
    if (options?.requiredProtocol) {
      availabilities = availabilities.filter(
        (a) => a.providerKey.apiType === options.requiredProtocol,
      );
    }

    // 3. 按优先级排序选择最优实例
    const sorted = availabilities.sort((a, b) => {
      // 优先选择指定的 vendor
      if (options?.preferredVendor) {
        if (a.providerKey.vendor === options.preferredVendor) return -1;
        if (b.providerKey.vendor === options.preferredVendor) return 1;
      }
      // 按 vendorPriority DESC, healthScore DESC 排序
      if (b.vendorPriority !== a.vendorPriority)
        return b.vendorPriority - a.vendorPriority;
      return b.healthScore - a.healthScore;
    });

    return sorted[0] ?? null;
  }
}
```

### 5.2 Fallback 执行流程（改进后）

```
FallbackChain: [claude-sonnet-4 (pri=0), gpt-4o (pri=1), deepseek-v3 (pri=2)]
                    │
                    ▼
            ┌── 尝试 claude-sonnet-4 ──┐
            │                          │
            │  resolveModel()          │
            │  → Anthropic Key ✅      │
            │  → 请求失败 (429)        │
            │                          │
            │  resolveModel() 排除已失败 │
            │  → Azure Key ✅          │
            │  → 请求失败 (503)        │
            │                          │
            │  无更多可用 vendor        │
            └──────────┬───────────────┘
                       │
                       ▼
            ┌── 尝试 gpt-4o ──────────┐
            │                          │
            │  resolveModel()          │
            │  → OpenAI Key ✅         │
            │  → 请求成功 ✅           │
            └──────────────────────────┘
```

**关键改进**：Fallback 现在有两层容错：

1. **模型级 Fallback**：按 FallbackChainModel 的 priority 切换模型
2. **Vendor 级 Fallback**：同一模型内，按 ModelAvailability 的 vendorPriority/healthScore 切换 vendor

## 6. 变更对比总结

> **✅ 全部已实现** — 以下表级变更和外键关系变更已全部完成。

### 6.1 表级变更

| 表                              | 变更类型                    | 说明                                                                                             |
| ------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------ |
| `ModelPricing`                  | **重命名** → `ModelCatalog` | 表名 `b_model_pricing` → `b_model_catalog`，新增路由关联关系                                     |
| `ModelAvailability`             | **修改**                    | 新增 `modelCatalogId` 外键、`vendorPriority`、`healthScore`；移除 `modelPricingId`、同步追踪字段 |
| `ModelCapabilityTag`            | **修改**                    | `modelAvailabilityId` → `modelCatalogId`                                                         |
| `FallbackChainModel`            | **修改**                    | `modelAvailabilityId` → `modelCatalogId`                                                         |
| `ComplexityRoutingModelMapping` | **修改**                    | `modelAvailabilityId` → `modelCatalogId`                                                         |
| `CapabilityTag`                 | 无变更                      | -                                                                                                |
| `FallbackChain`                 | 无变更                      | -                                                                                                |
| `ComplexityRoutingConfig`       | 无变更                      | -                                                                                                |
| `CostStrategy`                  | 无变更                      | -                                                                                                |
| `BotRoutingConfig`              | 无变更                      | -                                                                                                |

### 6.2 外键关系变更

```
变更前：
  ModelCapabilityTag       → ModelAvailability
  FallbackChainModel       → ModelAvailability
  ComplexityRoutingMapping → ModelAvailability
  ModelAvailability        → ModelPricing (可选)

变更后：
  ModelCapabilityTag       → ModelCatalog
  FallbackChainModel       → ModelCatalog
  ComplexityRoutingMapping → ModelCatalog
  ModelAvailability        → ModelCatalog (新增正式外键)
```

## 7. 数据迁移方案

> **✅ Prisma Migration 已执行** — 表重命名、字段新增、外键约束已通过 Prisma Migration 完成。旧字段（`model_availability_id`、`model_pricing_id`、同步追踪字段）已在 Migration 中移除。

### 7.1 迁移步骤

```sql
-- Step 1: 重命名表
ALTER TABLE b_model_pricing RENAME TO b_model_catalog;

-- Step 2: ModelAvailability 新增字段
ALTER TABLE b_model_availability
  ADD COLUMN model_catalog_id UUID,
  ADD COLUMN vendor_priority INT DEFAULT 0,
  ADD COLUMN health_score INT DEFAULT 100;

-- Step 3: 回填 model_catalog_id（通过 model 字段关联）
UPDATE b_model_availability ma
SET model_catalog_id = mc.id
FROM b_model_catalog mc
WHERE ma.model = mc.model;

-- Step 4: ModelCapabilityTag 新增字段并回填
ALTER TABLE b_model_capability_tag
  ADD COLUMN model_catalog_id UUID;

UPDATE b_model_capability_tag mct
SET model_catalog_id = ma.model_catalog_id
FROM b_model_availability ma
WHERE mct.model_availability_id = ma.id;

-- Step 5: FallbackChainModel 新增字段并回填
ALTER TABLE b_fallback_chain_model
  ADD COLUMN model_catalog_id UUID;

UPDATE b_fallback_chain_model fcm
SET model_catalog_id = ma.model_catalog_id
FROM b_model_availability ma
WHERE fcm.model_availability_id = ma.id;

-- Step 6: ComplexityRoutingModelMapping 新增字段并回填
ALTER TABLE b_complexity_routing_model_mapping
  ADD COLUMN model_catalog_id UUID;

UPDATE b_complexity_routing_model_mapping crm
SET model_catalog_id = ma.model_catalog_id
FROM b_model_availability ma
WHERE crm.model_availability_id = ma.id;

-- Step 7: 去重（同一模型的多个 vendor 实例可能产生重复的能力标签）
-- ModelCapabilityTag: 保留每个 (model_catalog_id, capability_tag_id) 的第一条记录
DELETE FROM b_model_capability_tag
WHERE id NOT IN (
  SELECT DISTINCT ON (model_catalog_id, capability_tag_id) id
  FROM b_model_capability_tag
  WHERE model_catalog_id IS NOT NULL
  ORDER BY model_catalog_id, capability_tag_id, created_at ASC
);

-- Step 8: 添加外键约束和唯一约束
ALTER TABLE b_model_capability_tag
  ADD CONSTRAINT fk_mct_model_catalog
  FOREIGN KEY (model_catalog_id) REFERENCES b_model_catalog(id) ON DELETE CASCADE;

-- Step 9: 移除旧字段（在确认迁移成功后）
-- ALTER TABLE b_model_capability_tag DROP COLUMN model_availability_id;
-- ALTER TABLE b_fallback_chain_model DROP COLUMN model_availability_id;
-- ALTER TABLE b_complexity_routing_model_mapping DROP COLUMN model_availability_id;
-- ALTER TABLE b_model_availability DROP COLUMN model_pricing_id;
-- ALTER TABLE b_model_availability DROP COLUMN pricing_synced, pricing_synced_at, tags_synced, tags_synced_at;
```

### 7.2 迁移策略：双写过渡期

为确保平滑迁移，建议采用双写过渡期：

| 阶段    | 操作                                     | 持续时间 |
| ------- | ---------------------------------------- | -------- |
| Phase 1 | 新增字段，回填数据，代码同时写入新旧字段 | 1 个迭代 |
| Phase 2 | 读取切换到新字段，写入仍双写             | 1 个迭代 |
| Phase 3 | 移除旧字段和旧代码路径                   | 1 个迭代 |

## 8. 受影响的代码模块

> **✅ 核心已完成** — Service 层和 Contract/Schema 层已全部适配 ModelCatalog。ModelResolverService 已实现并集成到 ModelRouterService 和 FallbackEngineService。

### 8.1 需要修改的 Service 层

| 模块               | 文件                                 | 变更内容                                                | 状态                       |
| ------------------ | ------------------------------------ | ------------------------------------------------------- | -------------------------- |
| model-verification | `model-verification.service.ts`      | 验证后关联 ModelCatalog                                 | ✅                         |
| available-model    | `available-model.service.ts`         | 查询逻辑改为 join ModelCatalog                          | ✅                         |
| capability-tag     | `capability-tag-matching.service.ts` | FK → modelCatalogId，标签为模型级                       | ✅                         |
| model-sync         | `model-sync.service.ts`              | 适配 ModelCatalog 迭代                                  | ✅                         |
| cost-tracker       | `cost-tracker.service.ts`            | ModelPricing 接口 → ModelCatalogPricing                 | ✅                         |
| configuration      | `configuration.service.ts`           | 双读逻辑，ModelCatalog 数据源                           | ✅                         |
| proxy              | `keyring-proxy.service.ts`           | Fallback 解析改为 ModelCatalog → ModelAvailability 两步 | ✅ 通过 ModelRouterService 间接集成 |
| proxy              | `upstream.service.ts`                | 模型解析逻辑调整                                        | ✅ 纯 HTTP 转发，无需直接集成       |
| bot-api            | `workspace.service.ts`               | 模型列表查询调整                                        | ✅                         |

### 8.2 需要修改的 Contract/Schema

| 文件                                                   | 变更内容                                                     | 状态 |
| ------------------------------------------------------ | ------------------------------------------------------------ | ---- |
| `packages/contracts/src/schemas/model.schema.ts`       | ModelCapabilityTag → modelCatalogId                          | ✅   |
| `packages/contracts/src/schemas/routing.schema.ts`     | ModelCatalogSchema, FallbackChainModelSchema(modelCatalogId) | ✅   |
| `packages/contracts/src/api/routing-admin.contract.ts` | getModelCatalogList 等端点                                   | ✅   |
| `packages/contracts/src/api/model.contract.ts`         | tags 端点 → modelCatalogId                                   | ✅   |
| `packages/contracts/src/schemas/provider.schema.ts`    | ModelAvailability 响应 schema 调整                           | ✅   |

### 8.3 新增 Service

| Service                | 职责                                | 状态        |
| ---------------------- | ----------------------------------- | ----------- |
| `ModelResolverService` | 模型 → 可用 vendor 实例的运行时解析 + 健康评分更新 | ✅ 已实现 |
| `ModelHealthService`   | 基于请求成功率动态更新 healthScore  | ✅ 已合并到 ModelResolverService.updateHealthScore() |

## 9. 设计决策记录

### Q1: 为什么不创建独立的 ModelCatalog 表，而是重命名 ModelPricing？

ModelPricing 已包含模型身份、定价、能力评分、特性支持等完整信息，实质上已经是一个模型目录。创建独立表会导致数据冗余和不必要的 join。重命名更准确地反映了表的实际职责。

### Q2: ModelAvailability 的 modelCatalogId 为什么是可选的？

部分通过 API Key 验证发现的模型可能尚未录入 ModelCatalog（如新发布的模型）。设为可选允许先记录可用性，后续再补充目录信息。

### Q3: 为什么在 ModelAvailability 上新增 vendorPriority 和 healthScore？

当路由选定一个模型后，需要在多个可用 vendor 中选择最优实例。vendorPriority 支持用户手动配置偏好，healthScore 支持基于运行时数据的动态调整。

### Q4: Fallback 链中的 protocolOverride 和 featuresOverride 是否还需要保留？

保留。虽然 Fallback 现在基于模型而非 vendor，但某些场景下仍需要在 Fallback 时覆盖协议或特性配置（如从 Anthropic 原生协议降级到 OpenAI 兼容协议）。

### Q5: 能力标签去重如何处理？

迁移时，同一模型在多个 vendor 实例上可能有重复的能力标签。迁移脚本会保留最早创建的记录，去除重复项。迁移后，能力标签只需为每个模型维护一份。
