# ClawBotManager 架构与设计

本文档汇总项目架构、模型路由、协议适配及 Bot 类型等核心设计。

---

## 一、系统架构

### 1.1 整体设计

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            ClawBotManager                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  Web (Next.js 16)              │  API (NestJS 11 + Fastify)                  │
│  - Bot 管理 / 创建向导          │  - Bot API（CRUD、生命周期）                 │
│  - Provider Key 管理           │  - Proxy（/v1/:vendor/* 转发）               │
│  - 模型路由配置                 │  - 模型路由引擎、Fallback、复杂度路由        │
│  - 插件与技能管理               │  - Plugin / Skill / Skill-Sync / Channel   │
│  - 消息系统、诊断与运维          │  - Message / Sign / SMS / Uploader          │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
            ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
            │  PostgreSQL   │   │  Redis        │   │  Docker       │
            │  Prisma ORM   │   │  BullMQ       │   │  Bot 容器      │
            └───────────────┘   └───────────────┘   └───────────────┘
```

### 1.2 设计原则

1. **分层架构** — API 层 → Service 层 → DB 层 / Client 层
2. **Zod-first** — 所有 API 通过 Zod Schema 校验
3. **契约驱动** — ts-rest 定义前后端契约
4. **infra / domain 边界** — infra 不依赖 domain
5. **密钥零明文** — API 密钥 AES-256-GCM 加密存储

---

## 二、双层模型体系与协议适配

### 2.1 概述

| 层级 | 协议 | 用途 |
|------|------|------|
| **生产层** | OpenAI-compatible | 普通对话、翻译、总结、工具调用 |
| **研究层** | Anthropic / 原生协议 | 深度规划、复杂推理、Extended Thinking |

### 2.2 模型首选协议 (preferredApiType)

`ModelAvailability` 表支持 `preferredApiType` 字段，用户可在管理后台为模型（如 GLM-5）指定首选协议（如 `anthropic`）。

**数据流**：`ModelResolverService` → `ProxyService` → `RoutingEngineService`，均支持 `respectPreferredApiType` 选项，优先使用用户配置的协议。

### 2.3 协议级别 BaseUrl

`ModelAvailability.apiTypeBaseUrls` 支持为不同协议配置独立 BaseUrl，例如：

```json
{
  "openai": "https://api.openai.com/v1",
  "anthropic": "https://api.anthropic.com"
}
```

---

## 三、Bot 类型 (BotType)

| BotType | 镜像 | 用途 |
|---------|------|------|
| `GATEWAY` | `openclaw:local` | 主 Gateway bot（默认） |
| `TOOL_SANDBOX` | `openclaw-sandbox:bookworm-slim` | 工具沙箱 |
| `BROWSER_SANDBOX` | `openclaw-sandbox-browser:bookworm-slim` | 浏览器沙箱 + VNC |

**环境变量**：`BOT_IMAGE_GATEWAY`、`BOT_IMAGE_TOOL_SANDBOX`、`BOT_IMAGE_BROWSER_SANDBOX`、`OPENCLAW_SRC_PATH`

**创建时选择**：Bot 创建向导中可选择类型；创建后不可更改。

---

## 四、模型路由

### 4.1 核心组件

- **RoutingEngineService** — 路由决策、协议推断、主模型锚定
- **ModelResolverService** — 模型解析、候选 Provider 选择、preferredApiType 支持
- **FallbackEngineService** — 降级链执行
- **ModelRouterService** — 模型→Provider 映射

### 4.2 能力标签与降级链

- **Capability Tags** — 按能力（如 `code`、`vision`）筛选模型
- **Fallback Chains** — 主模型失败时按链降级
- **Cost Strategies** — 成本优化策略
- **Complexity Routing** — 按任务复杂度选择模型

---

## 五、数据流

### 5.1 创建 Bot

```
用户填写配置 → 分配端口 → 创建 Workspace（config.json, soul.md, features.json）
→ 启动 Docker 容器 → 写入 DB → 生成 Gateway Token
```

### 5.2 代理请求

```
客户端带 Bearer <gateway_token> → /api/v1/:vendor/* 
→ 校验 Token → 选择 Provider Key（标签 + Round-robin）
→ 解密密钥 → 转发上游 → 记录 BotUsageLog
```

### 5.3 Skill 安装

```
GitHub (openclaw/skills) → Skill 表 → BotSkill 表 + 文件系统 (SKILL.md)
→ Volume 挂载 → Docker 容器 (/home/node/.openclaw/skills/)
```
