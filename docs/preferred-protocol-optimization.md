# 模型首选协议 (preferredApiType) 优化方案

## 文档信息

- **创建日期**: 2026-02-24
- **状态**: ✅ 已完成
- **实施版本**: v1.3
- **相关文档**: [双层模型体系与协议适配方案.md](./双层模型体系与协议适配方案.md)

---

## 1. 问题描述

### 1.1 现象

用户在管理后台为 GLM-5 模型设置了 `preferredApiType='anthropic'`（首选协议为 Anthropic 兼容），但实际执行时依然使用 OpenAI 兼容协议。

### 1.2 根本原因

`routing-engine.service.ts` 中的 `inferProtocolFromVendor` 方法只根据 `vendor` 硬编码判断协议，**完全忽略了数据库中 `ModelAvailability.preferredApiType` 的用户配置**。

```typescript
// 问题代码：只看 vendor，忽略 preferredApiType
private inferProtocolFromVendor(vendor: string): 'openai-compatible' | 'anthropic-native' {
  return vendor === 'anthropic' ? 'anthropic-native' : 'openai-compatible';
}
```

---

## 2. 解决方案

### 2.1 架构设计

采用**分层修复**策略，从底层到上层逐步传递 `preferredApiType`：

```
┌─────────────────────────────────────────────────────────────────┐
│                        请求处理流程                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Layer 1: ModelResolverService                                  │
│    ↓ 增加 preferredApiType 到 ResolvedModel                     │
│    ↓ 实现 effectiveApiType 计算逻辑                             │
│                                                                 │
│  Layer 2: ProxyService / FallbackEngine / ModelRouter           │
│    ↓ 使用 respectPreferredApiType: true                         │
│                                                                 │
│  Layer 3: RoutingEngineService                                  │
│    ↓ 修改 inferProtocolFromVendor 接受 preferredApiType         │
│    ↓ 扩展 BotRoutingContext.primaryModel                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 核心逻辑

```typescript
// 计算 effectiveApiType 的核心逻辑
let effectiveApiType: string = pk.apiType;

if (options?.respectPreferredApiType && preferredApiType) {
  // 验证 preferredApiType 在 supportedApiTypes 中
  if (supportedApiTypes.includes(preferredApiType)) {
    effectiveApiType = preferredApiType;
  } else {
    // 验证失败，回退到默认 apiType
    this.logger.warn(`preferredApiType='${preferredApiType}' not supported`);
  }
}

// 获取协议对应的 BaseUrl（优先使用协议级别配置）
const protocolBaseUrl = apiTypeBaseUrls?.[effectiveApiType];
const finalBaseUrl = protocolBaseUrl || pk.baseUrl || '';
```

---

## 3. 修改文件清单

### 3.1 阶段一：ModelResolver 修改

| 文件 | 修改内容 |
|------|----------|
| [model-resolver.service.ts](../apps/api/src/modules/proxy/services/model-resolver.service.ts) | 1. `ResolvedModel` 接口增加 `preferredApiType`/`supportedApiTypes`/`apiTypeBaseUrls` 字段<br>2. `ResolveOptions` 接口增加 `respectPreferredApiType` 选项<br>3. `filterAndSort` 方法实现 `effectiveApiType` 计算逻辑 |

### 3.2 阶段二：Proxy 服务修改

| 文件 | 修改内容 |
|------|----------|
| [proxy.service.ts](../apps/api/src/modules/proxy/services/proxy.service.ts) | `handleAutoRoutedRequest` 传入 `respectPreferredApiType: true`，增强日志输出 |
| [fallback-engine.service.ts](../apps/api/src/modules/proxy/services/fallback-engine.service.ts) | 1. `resolveModelVendor`/`resolveAllModelVendors` 添加 `respectPreferredApiType: true`<br>2. `inferProtocol` 方法支持 `preferredApiType` 参数<br>3. `buildDynamicFallbackChain`/`registerBotFallbackChain` 参数扩展 |
| [model-router.service.ts](../apps/api/src/modules/bot-api/services/model-router.service.ts) | `resolve` 调用添加 `respectPreferredApiType: true` |

### 3.3 阶段三：RoutingEngine 修改

| 文件 | 修改内容 |
|------|----------|
| [routing-engine.service.ts](../apps/api/src/modules/proxy/services/routing-engine.service.ts) | 1. `BotRoutingContext.primaryModel` 增加 `preferredApiType`/`supportedApiTypes` 字段<br>2. `inferProtocolFromVendor` 方法支持 `preferredApiType` 参数<br>3. `selectRoute` 和 `selectRouteWithComplexity` 传递新参数 |

### 3.4 阶段四：FallbackEngine 优化（补充修复）

| 文件 | 修改内容 |
|------|----------|
| [fallback-engine.service.ts](../apps/api/src/modules/proxy/services/fallback-engine.service.ts) | 1. `inferProtocol` 方法支持 `preferredApiType` 参数<br>2. `buildDynamicFallbackChain` 方法参数增加 `preferredApiType`/`supportedApiTypes` 字段<br>3. `registerBotFallbackChain` 方法参数同步更新 |

---

## 4. 接口变更

### 4.1 ResolvedModel 接口

```typescript
export interface ResolvedModel {
  availabilityId: string;
  providerKeyId: string;
  model: string;
  vendor: string;
  apiType: string;
  baseUrl: string;
  vendorPriority: number;
  healthScore: number;
  // 新增字段
  preferredApiType: ModelApiType | null;
  supportedApiTypes: ModelApiType[];
  apiTypeBaseUrls: ApiTypeBaseUrlConfig | null;
}
```

### 4.2 ResolveOptions 接口

```typescript
export interface ResolveOptions {
  preferredVendor?: string;
  requiredProtocol?: string;
  excludeProviderKeyIds?: string[];
  minHealthScore?: number;
  // 新增字段
  respectPreferredApiType?: boolean;
}
```

### 4.3 BotRoutingContext 接口

```typescript
export interface BotRoutingContext {
  botId: string;
  installedSkills: string[];
  primaryModel?: {
    model: string;
    vendor: string;
    providerKeyId: string;
    // 新增字段
    preferredApiType?: 'openai' | 'anthropic' | 'gemini' | null;
    supportedApiTypes?: ('openai' | 'anthropic' | 'gemini')[];
  };
  routingConfig?: { ... };
}
```

---

## 5. 覆盖场景

| 场景 | 服务 | 覆盖状态 |
|------|------|----------|
| Auto-routing | `ProxyService.handleAutoRoutedRequest` | ✅ |
| Fallback 引擎 | `FallbackEngineService` | ✅ |
| 模型路由器 | `ModelRouterService` | ✅ |
| 能力标签路由 | `RoutingEngineService.selectRoute` | ✅ |
| 复杂度路由 | `RoutingEngineService.selectRouteWithComplexity` | ✅ |

---

## 6. 验证指南

### 6.1 数据库验证

确保 `ModelAvailability` 表中 `preferredApiType` 已正确设置：

```sql
-- 检查 GLM-5 的协议配置
SELECT model, vendor, "preferredApiType", "supportedApiTypes"
FROM "ModelAvailability"
WHERE model = 'glm-5' AND "isAvailable" = true;

-- 预期结果
-- model  | vendor | preferredApiType | supportedApiTypes
-- glm-5  | zhipu  | anthropic        | {openai, anthropic}
```

### 6.2 日志验证

重启 API 服务后，查看日志输出：

```
# ModelResolver 日志
[ModelResolver] Using preferredApiType='anthropic' for model glm-5 (vendor: zhipu)

# Proxy 日志
[Proxy] Auto-routing: found 1 candidate(s) for glm-5:
  zhipu(apiType=anthropic,preferred=anthropic,priority=100,health=100)

# RoutingEngine 日志
[RoutingEngine] Using preferredApiType='anthropic' for vendor zhipu
```

### 6.3 请求测试

```bash
# 发送测试请求
curl -X POST http://localhost:3100/api/v1/openai-compatible/chat/completions \
  -H "Authorization: Bearer YOUR_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "glm-5", "messages": [{"role": "user", "content": "Hello"}]}'
```

### 6.4 协议验证

检查请求是否发送到正确的端点：

- **OpenAI 协议**: `${baseUrl}/v1/chat/completions`
- **Anthropic 协议**: `${baseUrl}/v1/anthropic` 或 `${baseUrl}/v1/messages`

---

## 7. 测试用例

| 用例 ID | 描述 | 预期结果 | 状态 |
|---------|------|----------|------|
| TC-001 | GLM-5 设置 `preferredApiType='anthropic'` | 使用 anthropic 协议 | ✅ |
| TC-002 | GLM-4-Plus 设置 `preferredApiType='anthropic'` | 使用 anthropic 协议 | ✅ |
| TC-003 | GLM-5 未设置 `preferredApiType` | 使用 openai 协议（默认） | ✅ |
| TC-004 | GLM-5 设置 `preferredApiType='anthropic'`，但 `supportedApiTypes` 只含 'openai' | 使用 openai 协议（验证失败回退），输出警告日志 | ✅ |
| TC-005 | Claude 设置 `preferredApiType='openai'` | 使用 openai 协议 | ✅ |
| TC-006 | 配置 `apiTypeBaseUrls['anthropic']` | 请求发送到配置的 BaseUrl | ✅ |

---

## 8. 实施进度

| 阶段 | 步骤 | 状态 | 完成日期 |
|------|------|------|----------|
| **阶段一** | **ModelResolver 修改** | ✅ 完成 | 2026-02-24 |
| | 1.1 修改 `ResolvedModel` 接口 | ✅ | 2026-02-24 |
| | 1.2 修改 `ResolveOptions` 接口 | ✅ | 2026-02-24 |
| | 1.3 修改 `filterAndSort` 方法 | ✅ | 2026-02-24 |
| **阶段二** | **Proxy 服务修改** | ✅ 完成 | 2026-02-24 |
| | 2.1 修改 `handleAutoRoutedRequest` | ✅ | 2026-02-24 |
| | 2.2 修改 `fallback-engine.service.ts` (resolve 方法) | ✅ | 2026-02-24 |
| | 2.3 修改 `model-router.service.ts` | ✅ | 2026-02-24 |
| **阶段三** | **RoutingEngine 修改** | ✅ 完成 | 2026-02-24 |
| | 3.1 扩展 `BotRoutingContext` | ✅ | 2026-02-24 |
| | 3.2 修改 `inferProtocolFromVendor` | ✅ | 2026-02-24 |
| | 3.3 修改 `selectRoute` / `selectRouteWithComplexity` | ✅ | 2026-02-24 |
| **阶段四** | **FallbackEngine 补充修复** | ✅ 完成 | 2026-02-25 |
| | 4.1 修改 `inferProtocol` 方法 | ✅ | 2026-02-25 |
| | 4.2 修改 `buildDynamicFallbackChain` 参数 | ✅ | 2026-02-25 |
| | 4.3 修改 `registerBotFallbackChain` 参数 | ✅ | 2026-02-25 |

---

## 9. 进一步优化建议

### 9.1 当前实现状态

| 组件 | 状态 | 说明 |
|------|------|------|
| ModelResolverService | ✅ 完整支持 | `effectiveApiType` 计算逻辑完整 |
| ProxyService | ✅ 完整支持 | 传入 `respectPreferredApiType: true` |
| FallbackEngineService | ✅ 完整支持 | `inferProtocol` 支持 `preferredApiType` |
| ModelRouterService | ✅ 完整支持 | 传入 `respectPreferredApiType: true` |
| RoutingEngineService | ✅ 完整支持 | `inferProtocolFromVendor` 支持 `preferredApiType` |
| ProtocolRouterService | ✅ 无需修改 | 直接处理指定协议的请求 |
| 数据库 Schema | ✅ 完整支持 | `preferredApiType`/`supportedApiTypes`/`apiTypeBaseUrls` 字段已存在 |
| **前端 UI** | ✅ 完整支持 | 模型路由配置页面显示协议选择器 |

### 9.2 可选的后续优化

| 优化项 | 优先级 | 说明 |
|--------|--------|------|
| ~~前端 UI 支持~~ | ~~P1~~ | ✅ 已完成 |
| 单元测试 | P2 | 为 `effectiveApiType` 计算逻辑添加测试 |
| 协议切换监控 | P3 | 添加 metrics 记录协议选择情况 |
| BotRoutingContext 构建器 | P3 | 如需使用 `selectRouteWithComplexity`，需在调用方传递 `preferredApiType` |

### 9.3 前端集成实现

#### 9.3.1 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| [model-routing.schema.ts](../packages/contracts/src/schemas/model-routing.schema.ts) | `RoutingTargetSchema` 增加 `preferredApiType` 字段 |
| [protocol-selector.tsx](../apps/web/app/[locale]/(main)/bots/[hostname]/components/protocol-selector.tsx) | 新增协议选择器组件 |
| [enhanced-model-selector.tsx](../apps/web/app/[locale]/(main)/bots/[hostname]/components/enhanced-model-selector.tsx) | 增加协议选择器集成，新增 `ExtendedRoutingTarget` 类型 |
| [model-routing-config.tsx](../apps/web/app/[locale]/(main)/bots/[hostname]/components/model-routing-config.tsx) | `TargetSelector` 启用 `showProtocolSelector` |
| [en/bots.json](../apps/web/locales/en/bots.json) | 添加协议选择器英文翻译 |
| [zh-CN/bots.json](../apps/web/locales/zh-CN/bots.json) | 添加协议选择器中文翻译 |

#### 9.3.2 UI 交互设计

1. **协议选择器显示条件**：
   - 当模型支持多种协议（`supportedApiTypes.length > 1`）时，在模型选择器下方显示协议选择器

2. **默认协议选择**：
   - 如果模型推荐使用 Anthropic 协议（`recommendAnthropic=true`），默认选中 `anthropic`
   - 否则默认选中第一个支持的协议

3. **推荐提示**：
   - 当推荐使用 Anthropic 协议时，显示推荐标签和推荐原因

#### 9.3.3 翻译 Key

```json
{
  "protocol": {
    "label": "API Protocol / API 协议",
    "select": "Select protocol / 选择协议",
    "recommended": "Recommended / 推荐",
    "recommendationHint": "Recommendation: {reason} / 推荐原因：{reason}",
    "types": {
      "openai": "OpenAI Compatible / OpenAI 兼容",
      "anthropic": "Anthropic",
      "gemini": "Google Gemini",
      "openaiDesc": "Standard OpenAI API protocol / 标准 OpenAI API 协议",
      "anthropicDesc": "Anthropic Messages API with Extended Thinking support",
      "geminiDesc": "Google Gemini native API protocol"
    }
  }
}
```

---

## 10. 风险与回滚

### 10.1 潜在风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 破坏现有功能 | 低 | 高 | 完整的回归测试 |
| 协议兼容性问题 | 中 | 中 | 验证 `preferredApiType` 在 `supportedApiTypes` 中 |

### 9.2 回滚策略

如果出现问题，可以通过以下方式快速回滚：

1. **快速回滚**: 移除 `respectPreferredApiType: true` 参数
2. **完整回滚**: 恢复 `inferProtocolFromVendor` 到原始实现

```typescript
// 回滚代码示例
private inferProtocolFromVendor(vendor: string): 'openai-compatible' | 'anthropic-native' {
  return vendor === 'anthropic' ? 'anthropic-native' : 'openai-compatible';
}
```

---

## 11. 参考资料

- [双层模型体系与协议适配方案.md](./双层模型体系与协议适配方案.md)
- [模型协议级别BaseUrl配置方案.md](./模型协议级别BaseUrl配置方案.md)
- 智谱 AI Anthropic 兼容 API: https://open.bigmodel.cn/dev/api#anthropic

---

## 12. 变更历史

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2026-02-24 | 1.0 | 初始版本，完成阶段一、阶段二 |
| 2026-02-24 | 1.3 | 完成阶段三，全面覆盖所有路由场景 |
| 2026-02-25 | 1.4 | 补充修复：FallbackEngineService.inferProtocol 支持 preferredApiType |
| 2026-02-25 | 1.5 | 添加进一步优化建议，确认数据库 schema 已完善 |
| 2026-02-25 | 1.6 | 前端 UI 支持：协议选择器组件、i18n 翻译、RoutingTargetSchema 扩展 |
