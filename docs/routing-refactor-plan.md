# Routing 页面重构实施方案

## 一、现状分析

### 1.1 核心问题

当前 `/routing` 页面下的五个子模块（模型定价、能力标签、Fallback 链、成本策略、复杂度路由）各自独立运作，**未以 `ModelAvailability`（可用模型表）作为核心数据源**，导致以下问题：

| 模块 | 当前状态 | 问题 |
|------|---------|------|
| **FallbackChain** | `models` 字段为硬编码 JSON，手动填写 vendor/model/protocol | 可能引用不存在或已不可用的模型 |
| **ModelPricing** | 独立表，通过 sync job 异步关联到 ModelAvailability | 可能存在无对应可用模型的定价记录 |
| **CapabilityTag** | 通过 ModelCapabilityTag 关联 ModelAvailability | 页面展示为独立标签列表，未体现与可用模型的关系 |
| **CostStrategy** | 独立配置，无模型引用 | 无法验证策略是否适用于当前可用模型 |
| **ComplexityRouting** | 模型字段为字符串，手动输入 | 可能引用不存在的模型 |

### 1.2 数据关系现状

```
ModelAvailability ──(modelPricingId)──> ModelPricing     [异步 sync，可选]
ModelAvailability ──(ModelCapabilityTag)──> CapabilityTag [异步 sync]
FallbackChain.models ──(JSON 硬编码)──> 无关联            [完全独立]
CostStrategy ──> 无模型引用                               [完全独立]
ComplexityRouting.models ──(字符串)──> 无关联              [完全独立]
```

### 1.3 关键文件清单

**数据库层：**
- `apps/api/prisma/schema.prisma` — ModelAvailability (L514-556), ModelPricing (L1059-1145), FallbackChain (L1288-1332), CapabilityTag (L1232-1284)

**后端服务层：**
- `apps/api/src/modules/proxy/services/fallback-engine.service.ts` — Fallback 链引擎
- `apps/api/src/modules/proxy/services/configuration.service.ts` — 配置加载服务
- `apps/api/src/modules/bot-api/services/available-model.service.ts` — 可用模型聚合
- `apps/api/src/modules/bot-api/services/model-sync.service.ts` — 模型同步服务

**API 契约层：**
- `packages/contracts/src/schemas/routing.schema.ts` — 路由相关 Schema
- `packages/contracts/src/api/routing-admin.contract.ts` — 路由管理 API 契约

**前端页面：**
- `apps/web/app/[locale]/(main)/routing/` — 路由管理页面目录
- `apps/web/app/[locale]/(main)/routing/model-pricing/page.tsx`
- `apps/web/app/[locale]/(main)/routing/capability-tags/page.tsx`
- `apps/web/app/[locale]/(main)/routing/fallback-chains/page.tsx`
- `apps/web/app/[locale]/(main)/routing/cost-strategies/page.tsx`
- `apps/web/app/[locale]/(main)/routing/complexity-routing/page.tsx`

---

## 二、目标架构

### 2.1 核心原则

**以 `ModelAvailability (isAvailable=true)` 为单一数据源（Single Source of Truth）**，所有路由配置模块必须引用实际可用的模型。

### 2.2 目标数据关系

```
                    ┌─────────────────────────────┐
                    │   ModelAvailability          │
                    │   (isAvailable = true)       │
                    │   ── 核心数据源 ──            │
                    └──────────┬──────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                     │
          ▼                    ▼                     ▼
   ModelPricing         CapabilityTag         FallbackChain
   (1:1 强关联)        (M:N 强关联)          (引用可用模型 ID)
                                                     │
                                              ┌──────┴──────┐
                                              ▼              ▼
                                        CostStrategy   ComplexityRouting
                                       (引用可用模型)   (引用可用模型)
```

### 2.3 关键变更

1. **FallbackChain.models** — 从 JSON 硬编码改为引用 `ModelAvailability.id`
2. **ComplexityRouting** — 模型字段从字符串改为引用 `ModelAvailability.id`
3. **ModelPricing** — 与 ModelAvailability 建立强关联，不再允许孤立定价记录
4. **CapabilityTag 页面** — 展示时以可用模型为维度，显示每个模型的标签
5. **前端统一** — 所有模型选择器从可用模型列表中选取，不再手动输入

---

## 三、实施方案

### Phase 1：数据模型重构（Schema 变更）

#### 3.1.1 新增 FallbackChainModel 关联表

替代 FallbackChain 中的 JSON `models` 字段，改为关系表：

```prisma
model FallbackChainModel {
  id                  String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  /// 关联的 FallbackChain ID
  fallbackChainId     String   @map("fallback_chain_id") @db.Uuid
  /// 关联的 ModelAvailability ID（引用实际可用模型）
  modelAvailabilityId String   @map("model_availability_id") @db.Uuid
  /// 在链中的顺序（0 = 首选模型）
  priority            Int      @default(0)
  /// 协议覆盖（可选，默认使用 ProviderKey 的 apiType）
  protocolOverride    String?  @map("protocol_override") @db.VarChar(50)
  /// 特性覆盖配置（JSON）
  featuresOverride    Json?    @map("features_override") @db.JsonB

  createdAt           DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  fallbackChain       FallbackChain     @relation(fields: [fallbackChainId], references: [id], onDelete: Cascade)
  modelAvailability   ModelAvailability  @relation(fields: [modelAvailabilityId], references: [id], onDelete: Cascade)

  @@unique([fallbackChainId, modelAvailabilityId])
  @@index([fallbackChainId])
  @@index([modelAvailabilityId])
  @@index([priority])
  @@map("b_fallback_chain_model")
}
```

#### 3.1.2 修改 FallbackChain 表

```prisma
model FallbackChain {
  // ... 保留现有字段 ...

  /// @deprecated 旧的 JSON models 字段，迁移后移除
  models    Json?  @db.JsonB  // 改为可选，迁移完成后删除

  // 新增关联
  chainModels FallbackChainModel[]

  // ... 其余字段不变 ...
}
```

#### 3.1.3 修改 ComplexityRoutingConfig 表

当前 ComplexityRoutingConfig 的模型映射存储在 JSON 中。需要新增关联表或修改 JSON 结构以引用 ModelAvailability ID：

```prisma
model ComplexityRoutingModelMapping {
  id                    String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  /// 关联的 ComplexityRoutingConfig ID
  complexityConfigId    String   @map("complexity_config_id") @db.Uuid
  /// 复杂度级别
  complexityLevel       String   @map("complexity_level") @db.VarChar(20)
  /// 关联的 ModelAvailability ID
  modelAvailabilityId   String   @map("model_availability_id") @db.Uuid
  /// 在同级别中的优先级
  priority              Int      @default(0)

  createdAt             DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  complexityConfig      ComplexityRoutingConfig @relation(fields: [complexityConfigId], references: [id], onDelete: Cascade)
  modelAvailability     ModelAvailability       @relation(fields: [modelAvailabilityId], references: [id], onDelete: Cascade)

  @@unique([complexityConfigId, complexityLevel, modelAvailabilityId])
  @@index([complexityConfigId])
  @@index([modelAvailabilityId])
  @@map("b_complexity_routing_model_mapping")
}
```

#### 3.1.4 ModelAvailability 新增反向关联

```prisma
model ModelAvailability {
  // ... 现有字段 ...

  // 新增反向关联
  fallbackChainModels          FallbackChainModel[]
  complexityRoutingMappings    ComplexityRoutingModelMapping[]
}
```

---

### Phase 2：后端服务重构

#### 3.2.1 FallbackChain 服务改造

**文件**: `apps/api/src/modules/proxy/services/fallback-engine.service.ts`

变更内容：
- `loadFallbackChainsFromDb()` — 改为 JOIN 查询 `FallbackChainModel` + `ModelAvailability` + `ProviderKey`
- `initializeDefaultChains()` — 默认链改为查询可用模型后自动构建
- 新增 `validateChainModels()` — 验证链中所有模型是否仍然可用
- 新增 `getChainWithAvailability()` — 返回链信息 + 每个模型的实时可用状态

**数据加载逻辑变更：**
```typescript
// 旧：从 JSON 字段读取
const models = chain.models as FallbackModel[];

// 新：从关联表读取，JOIN ModelAvailability
const chainModels = await this.prisma.fallbackChainModel.findMany({
  where: { fallbackChainId: chain.id },
  include: {
    modelAvailability: {
      include: { providerKey: true, modelPricing: true }
    }
  },
  orderBy: { priority: 'asc' }
});
```

#### 3.2.2 Configuration 服务改造

**文件**: `apps/api/src/modules/proxy/services/configuration.service.ts`

变更内容：
- `loadFallbackChains()` — 适配新的关联表结构
- `loadModelPricing()` — 只加载有对应可用模型的定价记录
- 新增 `validateAllConfigurations()` — 校验所有配置引用的模型是否可用

#### 3.2.3 ComplexityRouting 服务改造

变更内容：
- 模型映射从 JSON 字符串改为通过 `ComplexityRoutingModelMapping` 关联表
- CRUD 操作适配新表结构
- 模型选择时从可用模型列表中选取

#### 3.2.4 新增：模型引用完整性服务

```typescript
// apps/api/src/modules/proxy/services/model-reference-integrity.service.ts
@Injectable()
export class ModelReferenceIntegrityService {
  /**
   * 当模型变为不可用时，检查并标记受影响的配置
   */
  async onModelUnavailable(modelAvailabilityId: string): Promise<AffectedConfigs>;

  /**
   * 获取所有引用了不可用模型的配置
   */
  async getStaleReferences(): Promise<StaleReferenceReport>;

  /**
   * 验证 FallbackChain 中所有模型是否可用
   */
  async validateFallbackChain(chainId: string): Promise<ValidationResult>;
}
```

---

### Phase 3：API 契约重构

#### 3.3.1 修改 FallbackChain Schema

**文件**: `packages/contracts/src/schemas/routing.schema.ts`

```typescript
// 旧：FallbackModel 为独立对象
export const FallbackModelSchema = z.object({
  vendor: z.string(),
  model: z.string(),
  protocol: z.enum(['openai-compatible', 'anthropic-native']),
  features: z.object({ ... }).optional(),
});

// 新：引用 ModelAvailability
export const FallbackChainModelSchema = z.object({
  id: z.string().uuid(),
  modelAvailabilityId: z.string().uuid(),
  priority: z.number().int().min(0),
  protocolOverride: z.string().nullable().optional(),
  featuresOverride: z.record(z.unknown()).nullable().optional(),
  // 展示用字段（从 ModelAvailability JOIN 获取）
  model: z.string(),           // ModelAvailability.model
  vendor: z.string(),          // ProviderKey.vendor
  displayName: z.string().nullable().optional(),
  isAvailable: z.boolean(),    // ModelAvailability.isAvailable
});

export const FallbackChainSchema = z.object({
  // ... 保留现有字段 ...
  models: z.array(FallbackChainModelSchema),  // 替换旧的 FallbackModelSchema
});
```

#### 3.3.2 修改 ComplexityRouting Schema

```typescript
export const ComplexityModelMappingSchema = z.object({
  complexityLevel: ComplexityLevelSchema,
  modelAvailabilityId: z.string().uuid(),
  // 展示用字段
  model: z.string(),
  vendor: z.string(),
  displayName: z.string().nullable().optional(),
  isAvailable: z.boolean(),
});

export const ComplexityRoutingConfigSchema = z.object({
  // ... 保留现有字段 ...
  modelMappings: z.array(ComplexityModelMappingSchema),  // 替换旧的 JSON models
});
```

#### 3.3.3 新增 API 端点

```typescript
// 在 routingAdminContract 中新增
availableModelsForRouting: {
  method: 'GET',
  path: '/available-models',
  summary: '获取可用于路由配置的模型列表',
  description: '返回 isAvailable=true 的模型，包含定价和能力标签信息',
  responses: {
    200: createApiResponse(z.array(RoutingAvailableModelSchema)),
  },
},

validateConfig: {
  method: 'POST',
  path: '/validate',
  summary: '验证路由配置的模型引用完整性',
  body: z.object({ configType: z.enum(['fallback', 'complexity', 'all']) }),
  responses: {
    200: createApiResponse(ConfigValidationResultSchema),
  },
},
```

---

### Phase 4：前端页面重构

#### 3.4.1 新增：可用模型选择器组件

```
apps/web/components/routing/
├── model-selector.tsx          # 可用模型选择器（下拉/搜索）
├── model-selector-dialog.tsx   # 模型选择对话框（多选）
├── model-availability-badge.tsx # 模型可用状态徽章
└── model-chain-editor.tsx      # Fallback 链可视化编辑器
```

核心组件 `ModelSelector`：
- 数据源：`GET /proxy/admin/routing/available-models`
- 只展示 `isAvailable=true` 的模型
- 按 vendor 分组
- 显示模型名称、能力标签、定价信息
- 支持搜索和筛选

#### 3.4.2 Fallback 链页面重构

**文件**: `apps/web/app/[locale]/(main)/routing/fallback-chains/page.tsx`

变更内容：
- 模型节点 `ModelNode` 改为显示来自 ModelAvailability 的实时数据
- 新增可用状态指示器（绿色=可用，红色=不可用）
- 编辑模式：使用 `ModelSelector` 从可用模型中选取
- 新增拖拽排序功能调整模型优先级
- 新增"不可用模型警告"提示

#### 3.4.3 复杂度路由页面重构

**文件**: `apps/web/app/[locale]/(main)/routing/complexity-routing/page.tsx`

变更内容：
- `ComplexityLevelConfig` 中的模型输入框改为 `ModelSelector`
- 显示所选模型的可用状态
- 不可用模型标红警告

#### 3.4.4 模型定价页面重构

**文件**: `apps/web/app/[locale]/(main)/routing/model-pricing/page.tsx`

变更内容：
- 以可用模型为主视角展示（而非独立的定价记录列表）
- 每个模型卡片显示：可用状态 + 定价信息 + 能力标签
- 未关联定价的可用模型显示"待配置"状态
- 无对应可用模型的定价记录标记为"孤立记录"

#### 3.4.5 能力标签页面重构

**文件**: `apps/web/app/[locale]/(main)/routing/capability-tags/page.tsx`

变更内容：
- 双视角切换：
  - **按标签分组**（现有）：每个标签下显示拥有该标签的可用模型列表
  - **按模型分组**（新增）：每个可用模型下显示其所有标签
- 标签管理时可直接看到影响的模型范围

#### 3.4.6 路由总览页面重构

**文件**: `apps/web/app/[locale]/(main)/routing/page.tsx`

变更内容：
- 新增"可用模型概览"卡片，显示当前可用模型总数、各 vendor 分布
- 各配置模块状态卡片增加"引用完整性"指标（是否有引用不可用模型的配置）
- 新增"健康检查"功能，一键验证所有配置的模型引用

---

### Phase 5：数据迁移

#### 3.5.1 迁移脚本

```sql
-- Step 1: 从 FallbackChain.models JSON 迁移到 FallbackChainModel 关联表
-- 对每个 FallbackChain 记录：
--   解析 models JSON 数组
--   根据 vendor + model 匹配 ModelAvailability 记录
--   创建 FallbackChainModel 关联记录

-- Step 2: 从 ComplexityRoutingConfig JSON 迁移到 ComplexityRoutingModelMapping
-- 类似逻辑

-- Step 3: 清理孤立的 ModelPricing 记录（无对应 ModelAvailability）
-- 标记为 isDeprecated 而非删除
```

#### 3.5.2 迁移策略

1. **双写期**：新旧字段同时写入，读取优先使用新关联表
2. **验证期**：对比新旧数据一致性
3. **切换期**：前端切换到新 API，旧字段标记为 deprecated
4. **清理期**：移除旧 JSON 字段

---

## 四、实施顺序

```
Phase 1 (Schema)
  │
  ├── 1.1 新增 FallbackChainModel 表
  ├── 1.2 新增 ComplexityRoutingModelMapping 表
  ├── 1.3 修改 ModelAvailability 反向关联
  └── 1.4 生成并执行 Prisma Migration
  │
Phase 2 (后端)
  │
  ├── 2.1 新增 ModelReferenceIntegrityService
  ├── 2.2 改造 FallbackEngine 服务
  ├── 2.3 改造 Configuration 服务
  ├── 2.4 改造 ComplexityRouting 服务
  └── 2.5 新增 available-models-for-routing API
  │
Phase 3 (契约)
  │
  ├── 3.1 修改 routing.schema.ts
  ├── 3.2 修改 routing-admin.contract.ts
  └── 3.3 新增验证相关 Schema
  │
Phase 4 (前端)
  │
  ├── 4.1 新增 ModelSelector 组件
  ├── 4.2 重构 Fallback 链页面
  ├── 4.3 重构复杂度路由页面
  ├── 4.4 重构模型定价页面
  ├── 4.5 重构能力标签页面
  └── 4.6 重构路由总览页面
  │
Phase 5 (迁移)
  │
  ├── 5.1 编写数据迁移脚本
  ├── 5.2 执行双写期迁移
  ├── 5.3 验证数据一致性
  └── 5.4 清理旧字段
```

---

## 五、风险与注意事项

### 5.1 向后兼容

- FallbackChain 的 `models` JSON 字段在迁移期间保留，确保旧逻辑可回退
- API 响应中同时返回新旧格式，前端逐步切换

### 5.2 性能考量

- FallbackChain 加载从单表查询变为 JOIN 查询，需确保索引覆盖
- 可用模型列表需缓存（已有 5 分钟刷新机制）
- 前端模型选择器需支持虚拟滚动（模型数量可能较多）

### 5.3 数据完整性

- 模型变为不可用时，不自动删除关联配置，而是标记警告
- 提供"健康检查" API 定期验证引用完整性
- 前端展示不可用模型时给出明确视觉提示

### 5.4 架构规范遵守

- 所有数据库操作必须在 DB Service 层（遵守 Core Rule 1）
- 所有 API 使用 Zod Schema 验证（遵守 Core Rule 2）
- 新增的 FallbackChainModel / ComplexityRoutingModelMapping 需要对应的 DB Service
