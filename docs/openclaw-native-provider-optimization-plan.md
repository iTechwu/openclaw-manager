# OpenClaw 原生 Provider 优化方案

## 背景

当前 clawbot-manager 的 proxy 服务对所有 AI 模型使用 OpenAI 兼容协议转发请求。但 OpenClaw 原生支持多种 provider，每种 provider 有其最佳的 API 格式和认证方式。

**问题示例**：
- GLM-5 通过 OpenAI 兼容接口调用时，`reasoning_content` 字段可能不被正确处理
- 某些 provider 的原生 API 支持更好的流式响应和错误处理

**优化目标**：
- 对于 OpenClaw 原生支持的 provider，使用 OpenClaw 推荐的配置方式
- 原生模式优先级最高，只有不可用时才 fallback 到其他模式

---

## 一、OpenClaw 原生 Provider 映射表

### 1.1 原生支持的 Provider

| Clawbot Vendor | OpenClaw Provider ID | 模型格式示例 | API 类型 | 认证方式 |
|---------------|---------------------|-------------|---------|---------|
| `zhipu` | `zai` | `zai/glm-5` | OpenAI-compatible | `ZAI_API_KEY` |
| `anthropic` | `anthropic` | `anthropic/claude-opus-4-5` | Anthropic | `ANTHROPIC_API_KEY` |
| `openai` | `openai` | `openai/gpt-4o` | OpenAI | `OPENAI_API_KEY` |
| `google` | `google` | `google/gemini-2.5-pro` | Gemini | `GEMINI_API_KEY` |
| `openrouter` | `openrouter` | `openrouter/anthropic/claude-opus-4-5` | OpenAI-compatible | `OPENROUTER_API_KEY` |
| `xai` | `xai` | `xai/grok-2` | OpenAI-compatible | `XAI_API_KEY` |
| `groq` | `groq` | `groq/llama-3.3-70b` | OpenAI-compatible | `GROQ_API_KEY` |
| `cerebras` | `cerebras` | `cerebras/llama-3.3-70b` | OpenAI-compatible | `CEREBRAS_API_KEY` |
| `mistral` | `mistral` | `mistral/mistral-large` | Mistral | `MISTRAL_API_KEY` |
| `moonshot` | `moonshot` | `moonshot/kimi-k2.5` | OpenAI-compatible | `MOONSHOT_API_KEY` |
| `minimax` | `minimax` | `minimax/MiniMax-M2.1` | OpenAI-compatible | `MINIMAX_API_KEY` |
| `deepseek` | `deepseek` | `deepseek/deepseek-chat` | OpenAI-compatible | `DEEPSEEK_API_KEY` |

### 1.2 需要特殊处理的 Provider

| Provider | 特殊处理 |
|----------|---------|
| `zai` (Zhipu) | 需要将 `reasoning_content` 转换为 `content` |
| `google` | 使用 Gemini API 格式，非 OpenAI 兼容 |
| `anthropic` | 使用 Anthropic Messages API 格式 |

### 1.3 Provider ID 规范化

```typescript
// OpenClaw 的规范化规则
const PROVIDER_NORMALIZATION: Record<string, string> = {
  'z.ai': 'zai',
  'z-ai': 'zai',
  'opencode-zen': 'opencode',
  'qwen': 'qwen-portal',
  'kimi-code': 'kimi-coding',
};
```

---

## 二、架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        OpenClaw Container                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    OpenClaw Gateway                       │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │    │
│  │  │ Native API  │  │ Proxy Mode  │  │  Direct     │      │    │
│  │  │ (zai/glm-5) │  │ (via clawbot│  │ (API Key in │      │    │
│  │  │             │  │  proxy)     │  │  openclaw)  │      │    │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘      │    │
│  └─────────┼────────────────┼────────────────┼──────────────┘    │
│            │                │                │                    │
└────────────┼────────────────┼────────────────┼────────────────────┘
             │                │                │
             ▼                ▼                ▼
┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│  Z.AI API      │  │  Clawbot Proxy │  │  Direct API    │
│  (Native)      │  │  (Fallback)    │  │  Call          │
└────────────────┘  └────────────────┘  └────────────────┘
```

### 2.2 Provider 选择优先级

```
1. OpenClaw 原生 Provider (最高优先级)
   └── 使用 OpenClaw 内置的 provider 配置
   └── 例如: zai/glm-5 直接调用 Z.AI API

2. Clawbot Proxy 透传 (中等优先级)
   └── 通过 clawbot proxy 转发到原始 API
   └── 例如: 通过 proxy 调用 zhipu API

3. Fallback 到其他模型 (最低优先级)
   └── 当原生 provider 不可用时
   └── 例如: GLM-5 → Claude Opus 4.6 → DeepSeek V3.2
```

### 2.3 配置生成策略

#### 场景 A: OpenClaw 原生 Provider 可用

```json5
// openclaw.json
{
  models: {
    providers: {
      zai: {
        baseUrl: "https://api.z.ai",
        apiKey: "${ZAI_API_KEY}",  // 从环境变量
        api: "openai-completions",
      }
    }
  },
  agents: {
    defaults: {
      model: {
        primary: "zai/glm-5",
        fallbacks: ["anthropic/claude-opus-4-5", "openai/gpt-4o"]
      }
    }
  }
}
```

#### 场景 B: 使用 Clawbot Proxy

```json5
// openclaw.json
{
  models: {
    providers: {
      openai: {
        baseUrl: "http://192.168.0.9:3200/api/v1/openai-compatible",
        apiKey: "${PROXY_TOKEN}",
        api: "openai-completions",
      }
    }
  },
  agents: {
    defaults: {
      model: {
        primary: "openai/glm-5",  // 通过 proxy
      }
    }
  }
}
```

---

## 三、实施计划

### Phase 1: Provider 映射表 (Week 1)

#### 3.1.1 创建 Provider 映射配置

**文件**: `packages/contracts/src/schemas/openclaw-provider-mapping.schema.ts`

```typescript
export const OPENCLAW_NATIVE_PROVIDERS = {
  // 完全原生支持 - 无需 proxy
  zhipu: {
    openclawProviderId: 'zai',
    modelFormat: 'zai/{model}',
    apiType: 'openai-completions',
    envVar: 'ZAI_API_KEY',
    nativeSupport: true,
    requiresTransformation: true, // reasoning_content 转换
  },
  anthropic: {
    openclawProviderId: 'anthropic',
    modelFormat: 'anthropic/{model}',
    apiType: 'anthropic-messages',
    envVar: 'ANTHROPIC_API_KEY',
    nativeSupport: true,
    requiresTransformation: false,
  },
  openai: {
    openclawProviderId: 'openai',
    modelFormat: 'openai/{model}',
    apiType: 'openai-completions',
    envVar: 'OPENAI_API_KEY',
    nativeSupport: true,
    requiresTransformation: false,
  },
  google: {
    openclawProviderId: 'google',
    modelFormat: 'google/{model}',
    apiType: 'gemini',
    envVar: 'GEMINI_API_KEY',
    nativeSupport: true,
    requiresTransformation: false,
  },
  deepseek: {
    openclawProviderId: 'deepseek',
    modelFormat: 'deepseek/{model}',
    apiType: 'openai-completions',
    envVar: 'DEEPSEEK_API_KEY',
    nativeSupport: true,
    requiresTransformation: false,
  },
  // 需要 proxy 支持
  dashscope: {
    openclawProviderId: null, // 无原生支持
    useProxy: true,
  },
  doubao: {
    openclawProviderId: null,
    useProxy: true,
  },
} as const;
```

#### 3.1.2 扩展 PROVIDER_CONFIGS

在现有 `PROVIDER_CONFIGS` 中添加 OpenClaw 原生支持标记：

```typescript
export const PROVIDER_CONFIGS = {
  zhipu: {
    // ... 现有配置
    openclawNative: true,
    openclawProviderId: 'zai',
  },
  // ...
};
```

### Phase 2: OpenClaw 配置生成优化 (Week 2)

#### 3.2.1 修改 WorkspaceService

**文件**: `apps/api/src/modules/bot-api/services/workspace.service.ts`

```typescript
/**
 * 生成 OpenClaw 配置 - 优先使用原生 Provider
 */
async buildOpenclawConfigV2(
  userId: string,
  hostname: string,
  botId: string,
): Promise<Record<string, unknown>> {
  // 1. 获取 Bot 的主模型配置
  const primaryModel = await this.getPrimaryModel(botId);

  // 2. 获取 Provider Key 信息
  const providerKey = await this.getProviderKeyForModel(primaryModel);

  // 3. 检查是否支持 OpenClaw 原生 Provider
  const nativeProvider = this.getOpenclawNativeProvider(providerKey.vendor);

  if (nativeProvider && providerKey.apiKey) {
    // 使用原生 Provider 模式
    return this.buildNativeProviderConfig(
      nativeProvider,
      primaryModel,
      providerKey
    );
  } else {
    // 使用 Proxy 模式
    return this.buildProxyConfig(userId, hostname);
  }
}

/**
 * 构建原生 Provider 配置
 */
private buildNativeProviderConfig(
  nativeProvider: NativeProviderConfig,
  model: BotModel,
  providerKey: ProviderKey,
): Record<string, unknown> {
  const modelRef = nativeProvider.modelFormat.replace('{model}', model.modelId);

  return {
    env: {
      [nativeProvider.envVar]: providerKey.apiKey,
    },
    models: {
      providers: {
        [nativeProvider.openclawProviderId]: {
          baseUrl: providerKey.baseUrl || undefined,
          api: nativeProvider.apiType,
        }
      }
    },
    agents: {
      defaults: {
        model: {
          primary: modelRef,
          fallbacks: this.buildFallbackChain(model.modelId),
        }
      }
    }
  };
}
```

#### 3.2.2 Fallback Chain 生成

```typescript
/**
 * 生成 Fallback Chain - 优先使用原生 Provider
 */
private buildFallbackChain(primaryModelId: string): string[] {
  const fallbacks: string[] = [];

  // 定义模型 fallback 映射
  const FALLBACK_CHAINS: Record<string, string[]> = {
    'glm-5': ['anthropic/claude-opus-4-5', 'deepseek/deepseek-chat'],
    'claude-opus-4-5': ['zai/glm-5', 'openai/gpt-4o'],
    'gpt-4o': ['anthropic/claude-sonnet-4-5', 'zai/glm-4.7'],
    // ...
  };

  return FALLBACK_CHAINS[primaryModelId] || [];
}
```

### Phase 3: Proxy 服务优化 (Week 2-3)

#### 3.3.1 请求路由优化

**文件**: `apps/api/src/modules/proxy/services/proxy.service.ts`

```typescript
/**
 * 判断是否应使用原生 Provider 模式
 */
private shouldUseNativeProvider(vendor: string, model: string): boolean {
  const nativeConfig = OPENCLAW_NATIVE_PROVIDERS[vendor];
  return nativeConfig?.nativeSupport === true;
}

/**
 * 处理代理请求 - 区分原生和 Proxy 模式
 */
async handleProxyRequest(
  params: ProxyRequestParams,
  rawResponse: ServerResponse,
): Promise<ProxyResult> {
  // 获取模型信息
  const modelInfo = await this.getModelInfo(params);

  // 检查是否应该使用原生模式
  if (this.shouldUseNativeProvider(modelInfo.vendor, modelInfo.model)) {
    // 原生模式由 OpenClaw 直接处理，Proxy 只做透传
    this.logger.info(`Using native provider mode for ${modelInfo.vendor}`);
  }

  // 继续现有逻辑...
}
```

#### 3.3.2 GLM 响应转换保留

保留之前实现的 `GlmResponseTransformerService`，用于：
- 非 OpenClaw 原生模式时的兼容处理
- 某些场景下的 fallback 转换

### Phase 4: 健康检查与 Fallback (Week 3)

#### 3.4.1 Provider 健康状态同步

```typescript
/**
 * 同步 OpenClaw Provider 健康状态到 Clawbot
 */
@Injectable()
export class OpenclawHealthSyncService {
  constructor(
    private readonly openclawClient: OpenclawClient,
    private readonly modelAvailabilityDb: ModelAvailabilityService,
  ) {}

  async syncProviderHealth(botId: string): Promise<void> {
    // 1. 从 OpenClaw 获取 provider 状态
    const status = await this.openclawClient.getProviderStatus(botId);

    // 2. 更新 ModelAvailability 的 healthScore
    for (const [provider, health] of Object.entries(status.providers)) {
      await this.modelAvailabilityDb.updateHealthScore(
        botId,
        provider,
        health.score
      );
    }
  }
}
```

#### 3.4.2 自动 Fallback 触发

```typescript
/**
 * 当原生 Provider 失败时自动切换到 Proxy 模式
 */
async handleProviderFailure(
  botId: string,
  provider: string,
  error: Error,
): Promise<void> {
  // 1. 记录失败
  await this.healthSync.recordFailure(botId, provider);

  // 2. 检查是否需要切换模式
  const healthScore = await this.getHealthScore(botId, provider);

  if (healthScore < 50) {
    // 3. 切换到 Proxy 模式
    await this.switchToProxyMode(botId);

    // 4. 重启 OpenClaw 容器以应用新配置
    await this.restartOpenclawContainer(botId);
  }
}
```

### Phase 5: 配置热更新 (Week 4)

#### 3.5.1 无重启配置更新

利用 OpenClaw 的 Gateway RPC 接口实现热更新：

```typescript
/**
 * 热更新 OpenClaw 配置
 */
async hotUpdateConfig(
  botId: string,
  newConfig: Record<string, unknown>,
): Promise<void> {
  const container = await this.getOpenclawContainer(botId);

  // 使用 OpenClaw 的 config.patch RPC
  await this.openclawClient.callRpc(botId, 'config.patch', {
    patches: newConfig,
    baseHash: await this.getConfigHash(botId),
  });
}
```

---

## 四、数据模型变更

### 4.1 ProviderKey 表扩展

```sql
ALTER TABLE "ProviderKey" ADD COLUMN "openclawProviderId" TEXT;
ALTER TABLE "ProviderKey" ADD COLUMN "nativeSupport" BOOLEAN DEFAULT false;
```

### 4.2 ModelAvailability 表扩展

```sql
ALTER TABLE "ModelAvailability" ADD COLUMN "openclawNative" BOOLEAN DEFAULT false;
ALTER TABLE "ModelAvailability" ADD COLUMN "lastNativeError" TEXT;
```

---

## 五、API 变更

### 5.1 新增 API: 获取 Provider 模式

```typescript
GET /api/bot/:hostname/provider-mode

Response:
{
  "mode": "native" | "proxy",
  "provider": "zai",
  "modelRef": "zai/glm-5",
  "nativeSupport": true,
  "healthScore": 95
}
```

### 5.2 新增 API: 切换 Provider 模式

```typescript
POST /api/bot/:hostname/provider-mode

Request:
{
  "mode": "native" | "proxy",
  "reason": "manual_switch" | "auto_fallback"
}

Response:
{
  "success": true,
  "newMode": "proxy",
  "restartRequired": true
}
```

---

## 六、测试计划

### 6.1 单元测试

1. Provider 映射表正确性测试
2. 配置生成逻辑测试
3. Fallback chain 生成测试

### 6.2 集成测试

1. GLM-5 原生模式请求测试
2. 原生模式 → Proxy 模式自动切换测试
3. 配置热更新测试

### 6.3 E2E 测试

1. 用户创建 GLM-5 Bot，验证使用原生模式
2. 模拟原生 Provider 失败，验证自动 fallback
3. 验证 Fallback chain 按预期工作

---

## 七、风险评估

### 7.1 风险点

| 风险 | 影响 | 缓解措施 |
|-----|------|---------|
| 原生 Provider API 变更 | 可能导致请求失败 | 保留 Proxy 模式作为 fallback |
| 配置热更新失败 | 需要重启容器 | 添加自动重启机制 |
| 健康状态不同步 | Fallback 不及时 | 增加心跳检测频率 |

### 7.2 回滚方案

1. 保留现有 Proxy 模式作为默认
2. 通过环境变量控制功能开关
3. 支持一键切换所有 Bot 到 Proxy 模式

---

## 八、时间线

| 阶段 | 内容 | 时间 |
|-----|------|------|
| Phase 1 | Provider 映射表 | Week 1 |
| Phase 2 | 配置生成优化 | Week 2 |
| Phase 3 | Proxy 服务优化 | Week 2-3 |
| Phase 4 | 健康检查与 Fallback | Week 3 |
| Phase 5 | 配置热更新 | Week 4 |
| 测试 | 全面测试 | Week 4 |
| 上线 | 灰度发布 | Week 5 |

---

## 九、下一步行动

1. **确认 Provider 映射表**: 验证所有需要支持的 provider
2. **设计详细 API**: 确认新增 API 的具体格式
3. **开始 Phase 1 实现**: 创建 Provider 映射配置文件
