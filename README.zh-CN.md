# ClawBotManager

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11-red.svg)](https://nestjs.com/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

> AI Bot 全生命周期管理与 API 密钥编排平台，解决多 Bot、多提供商场景下的密钥安全、请求代理与运维难题。

[English](./README.md) | [演示](#-演示) | [快速开始](#-快速开始) | [文档](#-文档与规范)

## 🎬 演示

<!-- 在此添加截图或 GIF -->
> 截图和演示视频即将推出。Star 本仓库以获取更新通知！

---

## 🆕 最新更新

### v1.0.0 (2026-02)

- **模型路由系统**：智能多模型路由，支持能力标签、降级链、成本策略和负载均衡
- **技能管理系统**：新增 SkillType 模型，支持 upsert 功能和 OpenClaw 同步
- **Bot 用量分析**：增强的 Token 使用追踪、路由统计和分析仪表板
- **Bot 配置解析器**：运行时配置现从 `BotProviderKey` 和 `BotChannel` 表派生，确保数据一致性
- **零信任架构**：Bot 容器永不直接接触 API 密钥 - 所有密钥在代理层注入
- **10 个渠道集成**：支持飞书、Telegram、Slack、微信、Discord、WhatsApp、X、Instagram、Teams 和 LINE
- **22 个 MCP 插件**：预置搜索、文件操作、数据库访问和开发工具等插件
- **技能系统**：自定义工具、提示词模板和工作流，一键安装到 Bot
- **通知系统**：后端配额通知，支持实时告警

---

## 📋 目录

- [演示](#-演示)
- [最新更新](#-最新更新)
- [项目定位](#-项目定位)
- [项目阶段](#-项目阶段)
- [技术栈](#️-技术栈)
- [架构设计](#️-架构设计)
- [核心能力](#-核心能力)
- [支持的渠道](#-支持的渠道)
- [快速开始](#-快速开始)
- [环境变量](#-环境变量)
- [Docker 部署](#-docker-部署)
- [API 概览](#-api-概览)
- [开发指南](#-开发指南)
- [路线图](#️-路线图)
- [常见问题](#-常见问题)
- [贡献指南](#-贡献指南)
- [License](#-license)

---

## 📌 项目定位

### 用途与目标

ClawBotManager 面向**需要部署和管理多个 AI Bot** 的团队与开发者，提供：

- **Bot 生命周期管理**：创建、启动、停止、删除，基于 Docker 容器化运行
- **API 密钥安全编排**：加密存储、标签路由、Round-robin 负载均衡
- **统一 AI 请求代理**：单入口对接多 AI 提供商，按 Bot Token 鉴权
- **多租户隔离**：按用户划分 Bot 与密钥，支持团队协作

### 解决的问题

| 痛点                                                 | 方案                                                 |
| ---------------------------------------------------- | ---------------------------------------------------- |
| 多 Bot 场景下 API Key 分散、易泄露                   | 集中加密存储（AES-256-GCM），统一通过 Bot Token 访问 |
| 多 AI 提供商（OpenAI、Anthropic、Google 等）接入复杂 | 统一 `/v1/:vendor/*` 代理，自动认证与转发            |
| Bot 与密钥的映射、配额、故障切换                     | Provider Key 标签路由 + Round-robin 轮询             |
| 容器与数据库状态不一致                               | reconcile 对账、孤立资源检测与清理                   |

### 目标用户

- 需要运行多个 AI Bot 的产品/研发团队
- 希望统一管理 OpenAI、Anthropic、DeepSeek 等 API 密钥的开发者
- 需要 Bot 与 API 调用审计、使用日志的运营方

---

## 🧩 项目阶段

**当前阶段：MVP / 生产可用**

### 已完成 ✅

- **核心能力**：Bot CRUD、Provider Key 管理、AI 代理、Docker 容器编排
- **模型路由系统**：能力标签、降级链、成本策略、负载均衡、路由统计
- **插件系统**：MCP 插件管理、22 个预置插件（搜索、文件、数据库、开发工具等）、按区域过滤
- **技能系统**：自定义工具（tool）、提示词模板（prompt）、工作流（workflow）、技能安装到 Bot、OpenClaw 同步
- **渠道系统**：10 个渠道定义（飞书、Telegram、Slack、微信、Discord、WhatsApp、X、Instagram、Teams、LINE）、渠道凭证管理、按语言环境推荐
- **基础设施**：用户认证、多登录方式、文件上传、短信、国际化（中/英）
- **诊断运维**：容器统计、孤立资源检测与清理、启动对账
- **安全机制**：零信任代理模式（Bot 容器不接触 API 密钥）、AES-256-GCM 加密
- **配额管理**：日/月 Token 限制、80% 阈值警告、超额系统消息
- **模板系统**：Persona 模板（系统模板 + 用户模板）、Bot 创建向导
- **审计日志**：操作日志记录（CREATE、START、STOP、DELETE）
- **Bot 用量分析**：Token 使用追踪、路由统计、分析仪表板
- **通知系统**：后端配额通知已实现

### 待实施 ⏳

- **渠道连接器**：飞书、Telegram、微信等渠道的实际消息收发连接器
- **Analytics 分析 UI**：后端分析已实现，前端仪表板待完成
- **通知系统 UI**：后端配额通知已实现，前端 UI 待完成
- **Webhook 处理器**：契约已定义，处理器待实现
- **权限系统**：细粒度权限控制待实现
- **限流验证**：配置已存在，实现待验证

### 生产部署注意 ⚠️

- 密钥备份策略
- 高可用部署方案
- 资源限流配置

---

## 🛠️ 技术栈

### 前端
| 技术 | 版本 | 用途 |
| --- | --- | --- |
| Next.js | 16 | React 框架，App Router |
| React | 19 | UI 库 |
| TypeScript | 5.x | 类型安全 |
| Tailwind CSS | 4 | 样式 |
| shadcn/ui | Latest | UI 组件 |
| TanStack Query | 5.x | 服务端状态管理 |
| ts-rest | 3.53.x | 类型安全 API 客户端 |
| next-intl | Latest | 国际化 |

### 后端
| 技术 | 版本 | 用途 |
| --- | --- | --- |
| NestJS | 11 | Node.js 框架 |
| Fastify | 5.x | HTTP 服务器 |
| Prisma | 7.x | ORM |
| PostgreSQL | 14+ | 主数据库 |
| Redis | 7+ | 缓存与队列 |
| BullMQ | Latest | 任务队列 |
| Zod | 4.x | Schema 校验 |
| ts-rest | 3.53.x | API 契约 |

### 基础设施
| 技术 | 用途 |
| --- | --- |
| Docker | Bot 容器化 |
| RabbitMQ | 消息队列 |
| Winston | 日志 |
| Passport | 认证（JWT、OAuth2）|

---

## 🏗️ 架构设计

### 设计原则

1. **分层架构**：API 层 → Service 层 → DB 层 / Client 层，严格禁止跨层访问
2. **Zod-first**：所有 API 请求/响应通过 Zod Schema 校验，类型安全
3. **契约驱动**：ts-rest 定义前后端契约，编译时类型 + 运行时校验
4. **infra / domain 边界**：infra 不依赖 domain，domain 可依赖 infra，便于复用与测试
5. **密钥零明文**：API 密钥 AES-256-GCM 加密存储，仅运行时解密

### 整体架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            ClawBotManager                                │
├─────────────────────────────────────────────────────────────────────────┤
│  Web (Next.js 16)          │  API (NestJS 11 + Fastify)                 │
│  - Bot 管理 / 创建向导      │  - Bot API（CRUD、生命周期）                 │
│  - Provider Key 管理       │  - Proxy（/v1/:vendor/* 代理）              │
│  - 诊断与运维               │  - Sign / SMS / Uploader                    │
└─────────────────────────────────────────────────────────────────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
            ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
            │  PostgreSQL   │   │  Redis        │   │  Docker       │
            │  Prisma ORM   │   │  BullMQ       │   │  Bot 容器      │
            └───────────────┘   └───────────────┘   └───────────────┘
                                        │
                    ┌───────────────────┴───────────────────┐
                    ▼                                       ▼
            ┌───────────────────┐                   ┌───────────────────┐
            │  OpenAI           │                   │  Anthropic        │
            │  DeepSeek / Groq  │   ...             │  Google / Venice  │
            └───────────────────┘                   └───────────────────┘
```

### 数据流（简化）

1. **创建 Bot**：用户填写配置 → 分配端口 → 创建 Workspace（config.json、soul.md、features.json）→ 启动 Docker 容器 → 写入 DB，生成 Gateway Token
2. **代理请求**：客户端带 `Authorization: Bearer <gateway_token>` 访问 `/api/v1/openai/...` → 校验 Token → 选择 Provider Key（标签 + Round-robin）→ 解密密钥 → 转发至上游 API → 记录 BotUsageLog
3. **密钥管理**：用户添加 Provider Key → AES-256-GCM 加密 → 写入 ProviderKey 表，支持 tag、baseUrl 等

### 目录结构

```
clawbotmanager/
├── apps/
│   ├── web/                    # Next.js 16 前端
│   │   ├── app/[locale]/       # 路由
│   │   │   ├── (auth)/         # 认证路由组
│   │   │   └── (main)/         # 主路由组（需认证）
│   │   │       ├── bots/       # Bot 管理
│   │   │       ├── diagnostics/# 容器诊断
│   │   │       ├── plugins/    # 插件管理
│   │   │       ├── routing/    # 模型路由配置
│   │   │       ├── secrets/    # API 密钥管理
│   │   │       ├── settings/   # 设置
│   │   │       ├── skills/     # 技能管理
│   │   │       └── templates/  # Persona 模板
│   │   ├── components/         # 通用组件
│   │   ├── hooks/              # React Hooks
│   │   └── lib/                # API 客户端、配置
│   │
│   └── api/                    # NestJS 11 后端
│       ├── src/modules/        # 功能模块（15 个模块）
│       │   ├── bot-api/        # Bot CRUD、Provider Key、Docker、Workspace
│       │   ├── bot-channel-api/# Bot 渠道管理
│       │   ├── channel-api/    # 渠道定义
│       │   ├── message-api/    # 消息系统
│       │   ├── operate-log-api/# 操作审计日志
│       │   ├── persona-template-api/ # Persona 模板
│       │   ├── plugin-api/     # MCP 插件管理
│       │   ├── proxy/          # AI 请求代理、Keyring、Upstream
│       │   ├── sign-api/       # 登录注册
│       │   ├── skill-api/      # 技能管理
│       │   ├── skill-sync/     # 技能同步
│       │   ├── sms-api/        # 短信
│       │   ├── sse-api/        # 服务端推送事件
│       │   ├── uploader/       # 文件上传
│       │   └── user-api/       # 用户管理
│       ├── libs/
│       │   ├── infra/          # 基础设施（prisma、redis、jwt、clients…）
│       │   │   ├── common/     # 装饰器、拦截器、管道
│       │   │   ├── clients/    # 第三方 API 客户端（18 个客户端）
│       │   │   ├── prisma/     # 数据库连接、读写分离
│       │   │   ├── redis/      # 缓存
│       │   │   ├── rabbitmq/   # 消息队列
│       │   │   ├── jwt/        # JWT 认证
│       │   │   ├── utils/      # 纯工具函数
│       │   │   ├── i18n/       # 国际化
│       │   │   ├── shared-db/  # TransactionalServiceBase、UnitOfWork
│       │   │   └── shared-services/ # 共享服务（7 个服务）
│       │   └── domain/         # 领域（auth、services）
│       └── prisma/             # Schema（33 个模型）、迁移
│
├── packages/                   # 共享包（7 个包）
│   ├── contracts/              # ts-rest 契约 + Zod Schema（25 个契约）
│   ├── ui/                     # shadcn/ui 组件
│   ├── utils/                  # 工具函数
│   ├── validators/             # Zod 校验
│   ├── constants/              # 常量
│   ├── types/                  # 类型定义
│   └── config/                 # ESLint、Prettier、TS 配置
│
├── docs/                       # 文档
└── scripts/                    # 初始化与运维脚本
```

### 支持的 AI 提供商

| 类别 | Vendor | 说明 |
| ---- | ------ | ---- |
| **主流** | `openai` | OpenAI API |
| | `anthropic` | Anthropic Claude |
| | `google` | Google Generative AI |
| | `deepseek` | DeepSeek API |
| | `groq` | Groq API |
| **云服务** | `azure-openai` | Azure OpenAI |
| | `mistral` | Mistral AI |
| | `openrouter` | OpenRouter |
| | `together` | Together AI |
| | `fireworks` | Fireworks AI |
| | `perplexity` | Perplexity AI |
| | `cohere` | Cohere |
| **国内** | `zhipu` | 智谱 AI |
| | `moonshot` | Moonshot AI |
| | `baichuan` | 百川 AI |
| | `dashscope` | 阿里通义 |
| | `stepfun` | 阶跃星辰 |
| | `doubao` | 字节豆包 |
| | `minimax` | MiniMax |
| | `yi` | 零一万物 |
| | `hunyuan` | 腾讯混元 |
| | `siliconflow` | 硅基流动 |
| **其他** | `venice` | Venice AI |
| | `ollama` | Ollama (本地) |
| | `custom` | 自定义端点 |

---

## ✨ 核心能力

- **Bot 生命周期**：创建、启动、停止、删除，Docker 容器 + 工作区（config.json、soul.md、features.json）
- **Provider Key 管理**：加密存储（AES-256-GCM）、标签路由、Round-robin、自定义 baseUrl
- **模型路由系统**：能力标签、降级链、成本策略、负载均衡、路由统计
- **AI 请求代理**：`/v1/:vendor/*` 统一入口，Bot Token 鉴权，流式响应（SSE）
- **插件系统（MCP）**：22 个预置插件（搜索、文件、数据库、开发工具等）、按区域过滤、一键安装到 Bot
- **技能系统**：自定义工具（tool）、提示词模板（prompt）、工作流（workflow）、技能安装与配置、OpenClaw 同步
- **渠道系统**：10 个渠道定义、按语言环境推荐、渠道凭证管理
- **零信任模式**：Bot 容器不接触 API 密钥，代理层注入密钥
- **配额管理**：日/月 Token 限制、阈值警告、超额通知
- **Bot 用量分析**：Token 使用追踪、路由统计、分析仪表板
- **模板系统**：Persona 模板（系统/用户）、5 步创建向导
- **诊断与运维**：容器统计、孤立资源检测与清理、启动对账
- **审计日志**：操作日志记录，支持合规审计
- **多租户**：按用户隔离 Bot 与 Key，JWT 认证
- **国际化**：支持中文、英文切换

---

## 📱 支持的渠道

ClawBotManager 支持 10 个消息渠道，并根据语言环境推荐：

| 渠道 | ID | 推荐环境 | 所需凭证 |
| --- | --- | --- | --- |
| **飞书/Lark** | `feishu` | 🇨🇳 中文、🌍 英文 | App ID、App Secret |
| **Telegram** | `telegram` | 🌍 英文 | Bot Token |
| **Slack** | `slack` | 🌍 英文 | Bot Token、App Token、Signing Secret |
| **微信** | `wechat` | 🇨🇳 中文、🌍 英文 | App ID、App Secret、Token、Encoding AES Key |
| **Discord** | `discord` | - | Bot Token、Application ID |
| **WhatsApp** | `whatsapp` | - | Access Token、Phone Number ID、Business Account ID |
| **Twitter/X** | `twitter` | - | API Key、API Secret、Access Token、Access Token Secret |
| **Instagram** | `instagram` | - | Access Token、App Secret |
| **Microsoft Teams** | `teams` | - | App ID、App Password、Tenant ID |
| **LINE** | `line` | - | Channel Access Token、Channel Secret |

> **说明**：渠道定义存储在数据库中，可自定义。`popularLocales` 字段决定每个语言环境推荐哪些渠道。

---

## 🚀 快速开始

### 1. 环境要求

- Node.js >= 18
- pnpm >= 9
- PostgreSQL、Redis、RabbitMQ
- Docker（用于 Bot 容器）

### 2. 安装依赖

```bash
pnpm install
```

### 3. 初始化密钥（首次必做）

```bash
./scripts/init-env-secrets.sh
```

会生成 `BOT_MASTER_KEY`，写入 `secrets/` 与 `apps/api/.env`。

### 4. 配置环境变量

**后端** `apps/api/.env`：

```env
# 必填
DATABASE_URL=postgresql://user:password@localhost:5432/clawbotmanager?schema=public
REDIS_URL=redis://localhost:6379
RABBITMQ_URL=amqp://localhost:5672

# 可选（有默认值）
READ_DATABASE_URL=postgresql://user:password@localhost:5432/clawbotmanager?schema=public
BOT_MASTER_KEY=<由 init-env-secrets.sh 生成>
```

**前端** `apps/web/.env.local`：

```env
NEXT_PUBLIC_SERVER_BASE_URL=http://localhost:3100
```

### 5. 数据库

```bash
pnpm db:generate
pnpm db:migrate:dev
# 在项目根目录用户将默认数据写入到数据库
pnpm db:seed:api
```

### 6. 启动

```bash
pnpm dev          # 全量
pnpm dev:web      # 仅前端
pnpm dev:api      # 仅后端
```

- 前端：<http://localhost:3000>
- 后端 API：<http://localhost:3100/api>

---

## 🔧 环境变量

### 后端 (`apps/api/.env`)

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | PostgreSQL 连接字符串（写） |
| `REDIS_URL` | ✅ | Redis 连接字符串 |
| `RABBITMQ_URL` | ✅ | RabbitMQ 连接字符串 |
| `READ_DATABASE_URL` | ❌ | PostgreSQL 读副本（默认使用 DATABASE_URL） |
| `BOT_MASTER_KEY` | ❌ | API 密钥加密主密钥（未设置时自动生成） |
| `BOT_IMAGE` | ❌ | Bot 容器 Docker 镜像（默认：`openclaw:latest`） |
| `BOT_PORT_START` | ❌ | Bot 容器起始端口（默认：`9200`） |
| `BOT_DATA_DIR` | ❌ | Bot 数据目录（默认：`/data/bots`） |
| `BOT_SECRETS_DIR` | ❌ | Bot 密钥目录（默认：`/data/secrets`） |
| `ZERO_TRUST_MODE` | ❌ | 启用零信任模式（默认：`false`） |
| `PROXY_TOKEN_TTL` | ❌ | 代理令牌有效期（秒，默认：`86400`） |

> **注意**：JWT 配置（`secret`、`expireIn`）在 `config.local.yaml` 中，不是环境变量。

### 前端 (`apps/web/.env.local`)

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `NEXT_PUBLIC_SERVER_BASE_URL` | ✅ | 后端 API 基础 URL |
| `NEXT_PUBLIC_API_BASE_URL` | ❌ | API 基础 URL（默认为服务器 URL + `/api`） |

---

## 🐳 Docker 部署

```bash
./scripts/start-clawbot.sh
```

依赖 `docker-compose.yml`，启动 API 与 Web 服务。健康检查通过后：
- 前端：<http://localhost:13000>
- API：<http://localhost:13100/api>

> 注：AI 代理功能（keyring-proxy）已集成到 API 服务中，通过 `/api/v1/:vendor/*` 端点提供。

---

## 📡 API 概览

### Bot（需 JWT）

| 方法   | 路径                       | 说明             |
| ------ | -------------------------- | ---------------- |
| GET    | `/api/bot`                 | 列出当前用户 Bot |
| POST   | `/api/bot`                 | 创建 Bot         |
| GET    | `/api/bot/:hostname`       | 获取单个 Bot     |
| POST   | `/api/bot/:hostname/start` | 启动             |
| POST   | `/api/bot/:hostname/stop`  | 停止             |
| DELETE | `/api/bot/:hostname`       | 删除             |
| GET    | `/api/bot/stats`           | 容器统计         |
| GET    | `/api/bot/admin/orphans`   | 孤立资源         |
| POST   | `/api/bot/admin/cleanup`   | 清理孤立资源     |

### Provider Key（需 JWT）

| 方法   | 路径                       | 说明          |
| ------ | -------------------------- | ------------- |
| GET    | `/api/provider-key`        | 列出 API Keys |
| POST   | `/api/provider-key`        | 添加 Key      |
| DELETE | `/api/provider-key/:id`    | 删除 Key      |
| GET    | `/api/provider-key/health` | 健康检查      |

### Plugin 插件（需 JWT）

| 方法   | 路径                              | 说明                 |
| ------ | --------------------------------- | -------------------- |
| GET    | `/api/plugin`                     | 列出所有插件         |
| GET    | `/api/plugin/:id`                 | 获取插件详情         |
| GET    | `/api/bot/:hostname/plugins`      | 获取 Bot 已安装插件  |
| POST   | `/api/bot/:hostname/plugins`      | 安装插件到 Bot       |
| DELETE | `/api/bot/:hostname/plugins/:id`  | 从 Bot 卸载插件      |

### Skill 技能（需 JWT）

| 方法   | 路径                              | 说明                 |
| ------ | --------------------------------- | -------------------- |
| GET    | `/api/skill`                      | 列出所有技能         |
| GET    | `/api/skill/:id`                  | 获取技能详情         |
| POST   | `/api/skill`                      | 创建自定义技能       |
| PUT    | `/api/skill/:id`                  | 更新技能             |
| DELETE | `/api/skill/:id`                  | 删除技能             |
| GET    | `/api/bot/:hostname/skills`       | 获取 Bot 已安装技能  |
| POST   | `/api/bot/:hostname/skills`       | 安装技能到 Bot       |
| PUT    | `/api/bot/:hostname/skills/:id`   | 更新技能配置         |
| DELETE | `/api/bot/:hostname/skills/:id`   | 从 Bot 卸载技能      |

### Model Routing 模型路由（需 JWT）

| 方法   | 路径                              | 说明                 |
| ------ | --------------------------------- | -------------------- |
| GET    | `/api/bot/:hostname/routing`      | 获取 Bot 路由配置    |
| PUT    | `/api/bot/:hostname/routing`      | 更新路由配置         |
| GET    | `/api/routing/capability-tags`    | 列出能力标签         |
| GET    | `/api/routing/fallback-chains`    | 列出降级链           |
| GET    | `/api/routing/cost-strategies`    | 列出成本策略         |
| GET    | `/api/routing/statistics`         | 获取路由统计         |

### Channel 渠道（需 JWT）

| 方法   | 路径                                    | 说明                 |
| ------ | --------------------------------------- | -------------------- |
| GET    | `/api/channel`                          | 列出所有渠道定义     |
| GET    | `/api/channel/:id`                      | 获取渠道定义详情     |
| GET    | `/api/bot/:hostname/channels`           | 获取 Bot 已配置渠道  |
| POST   | `/api/bot/:hostname/channels`           | 添加渠道到 Bot       |
| PUT    | `/api/bot/:hostname/channels/:id`       | 更新渠道配置         |
| DELETE | `/api/bot/:hostname/channels/:id`       | 删除渠道             |
| POST   | `/api/bot/:hostname/channels/:id/connection` | 连接/断开渠道   |

### AI 代理（Bearer Bot Token）

| 方法 | 路径                | 说明                                         |
| ---- | ------------------- | -------------------------------------------- |
| ALL  | `/api/v1/:vendor/*` | 转发至对应 AI 提供商（openai、anthropic 等） |

更多示例见 `https/rest-client.http`。

---

## 👨‍💻 开发指南

### 项目结构

这是一个使用 **Turborepo** 管理的 **pnpm monorepo**：

```bash
# 安装依赖
pnpm install

# 开发（所有应用）
pnpm dev

# 开发（特定应用）
pnpm dev:web          # 仅 Next.js 前端
pnpm dev:api          # 仅 NestJS 后端

# 构建
pnpm build
pnpm build:web        # 仅构建 web
pnpm build:api        # 仅构建 api

# Lint 与类型检查
pnpm lint
pnpm type-check

# 测试
pnpm test
pnpm test:api
```

### 添加新功能

#### 1. 定义 API 契约 (packages/contracts)

```typescript
// packages/contracts/src/api/example.contract.ts
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

export const exampleContract = c.router({
  list: {
    method: 'GET',
    path: '/example',
    responses: {
      200: z.object({ items: z.array(z.string()) }),
    },
  },
});
```

#### 2. 实现后端 (apps/api)

```bash
# 生成 NestJS 模块
cd apps/api
npx nest g module example src/modules
npx nest g controller example src/modules
npx nest g service example src/modules
```

#### 3. 前端调用 (apps/web)

```typescript
// 使用 ts-rest React Query hooks
const { data } = exampleApi.list.useQuery(['example'], {});
```

### 数据库操作

```bash
# Schema 变更后生成 Prisma Client
pnpm db:generate

# 创建迁移
pnpm db:migrate:dev --name <migration_name>

# 应用迁移（生产）
pnpm db:migrate:deploy

# 推送 schema（无迁移）
pnpm db:push

# 填充数据库
pnpm db:seed:api
```

### 代码规范

- **TypeScript**：启用严格模式
- **ESLint**：配置在 `packages/config`
- **Prettier**：自动格式化
- **Zod 4**：所有校验使用（非 Zod 3）
- **Winston Logger**：使用 Winston，禁止 `console.log`

---

## 🗺️ 路线图

### 近期目标

| 功能 | 状态 | 说明 |
| ---- | ---- | ---- |
| 渠道连接器 | 🚧 进行中 | 实现飞书、Telegram、微信等渠道的消息收发连接器 |
| Analytics 分析后端 | 📋 契约已定义 | 实现 `/analytics/track` 端点，支持使用量统计 |
| 通知系统 UI | 📋 后端已实现 | 完成前端通知中心、实时推送 |
| Webhook 处理器 | 📋 契约已定义 | 实现 transcode、audio-transcribe 等回调处理 |
| 权限系统 | 📋 待设计 | 细粒度权限控制（RBAC） |
| 限流实现 | 📋 配置已存在 | 验证并完善 @fastify/rate-limit 集成 |

### 中期目标

- **更多 IM 渠道**：企业微信、钉钉、Slack、Discord 等
- **监控告警**：集成 Prometheus/Grafana，Bot 健康监控
- **高级路由策略**：基于延迟、成本的智能路由
- **团队协作**：团队空间、成员管理、权限分配
- **API 用量分析**：Token 消耗统计、成本分析、趋势图表

### 长期愿景

- **多集群部署**：跨区域 Bot 调度
- **渠道市场**：更多第三方渠道集成
- **Marketplace**：模板市场、Bot 分享

---

## 📝 常用命令

```bash
pnpm dev              # 开发
pnpm build            # 构建
pnpm db:generate      # 生成 Prisma Client
pnpm db:migrate:dev   # 开发迁移
pnpm db:migrate:deploy # 生产迁移
pnpm db:push          # 推送 schema
pnpm lint             # Lint
pnpm type-check       # 类型检查
pnpm test             # 测试
```

---

## 🔍 常见问题

### 数据库连接失败

```bash
# 检查 PostgreSQL 是否运行
docker ps | grep postgres

# 验证连接字符串
psql $DATABASE_URL -c "SELECT 1"
```

### Docker 权限被拒绝

```bash
# 将用户添加到 docker 组
sudo usermod -aG docker $USER

# 重启 Docker 守护进程
sudo systemctl restart docker
```

### 端口已被占用

```bash
# 查找占用端口的进程
lsof -i :3000

# 终止进程
kill -9 <PID>
```

### Prisma Client 不同步

```bash
# 重新生成 Prisma Client
pnpm db:generate

# 如果 schema 变更，创建迁移
pnpm db:migrate:dev
```

### Bot 容器无法启动

1. 检查 Docker 是否运行：`docker info`
2. 验证端口范围可用
3. 检查工作区目录权限
4. 查看容器日志：`docker logs <container_id>`

---

## 🤝 贡献指南

欢迎贡献！请按以下步骤操作：

1. **Fork** 仓库
2. **创建** 功能分支：`git checkout -b feature/amazing-feature`
3. **遵循** `CLAUDE.md` 中的编码规范
4. **编写** 新功能的测试
5. **提交** 清晰的 commit 信息
6. **推送** 到你的 fork
7. **创建** Pull Request

### 开发规范

- 阅读 `CLAUDE.md` 了解架构指南
- 遵循分层架构（API → Service → DB/Client）
- 所有 API 校验使用 Zod schemas
- 使用 Winston 日志，禁止 console.log
- 保持 infra 和 domain 层分离

---

## 🔒 安全注意事项

### API 密钥保护

- 所有 API 密钥存储前使用 **AES-256-GCM** 加密
- 密钥仅在代理层运行时解密
- Bot 容器**永不**直接访问 API 密钥（零信任）
- `BOT_MASTER_KEY` 应安全存储并备份

### 认证

- 基于 JWT 的认证，可配置过期时间
- 支持多种登录方式（邮箱、手机、OAuth）
- 长期会话的 Token 刷新机制

### 最佳实践

1. **永不提交** `.env` 文件或密钥
2. **定期轮换** `BOT_MASTER_KEY`（需重新加密）
3. **使用** 读副本进行数据库扩展
4. **启用** 生产环境限流
5. **监控** 审计日志以发现可疑活动

---

## 🙏 致谢与项目缘起

### 致谢

我们由衷感谢 [BotMaker](https://github.com/jgarzik/botmaker) 这一优秀的开源项目。BotMaker 提出的零信任 API 密钥架构、keyring-proxy 设计理念以及容器化 Bot 管理思路，为本项目的设计与实现带来了重要启发和借鉴。

### 为何仍有 ClawBotManager

在开源 ClawBotManager 之前，我们已在内部团队也实施了类似的多用户、多团队 Bot 管理与 API 密钥编排系统。彼时我们发现了 BotMaker 项目，从中借鉴了许多思路与实现细节。

尽管 BotMaker 已能很好地解决同类问题，我们仍决定将 ClawBotManager 开源，主要出于以下考量：

1. **补充能力**：我在服务 [psylos1.com](https://psylos1.com) AI-Native化的过程中中沉淀了多租户、团队协作、Provider Key 标签路由与 Round-robin、Prisma + PostgreSQL 等企业级能力，希望为社区提供另一种技术选型与实现路径。
2. **回馈社区**：BotMaker 启发了我们的设计，我们希望通过开源自己的实现，将我们在多人多团队管理场景下的实践经验分享出去，给有类似需求的团队更多参考与帮助。
3. **共同推进**：AI Bot 管理与密钥编排仍是一个快速演进的领域，我们期待与 BotMaker 及更多开源项目一起，为社区提供更多选择与更完善的解决方案。

---

## 📂 文档与规范

- **架构与规范**：`CLAUDE.md`、`.cursorrules`
- **API 契约**：`packages/contracts/src/api/`
- **后端规范**：`apps/api/docs/`（如存在）
- **前端规范**：`apps/web/docs/`（如存在）

---

## 📄 License

MIT License

---

<p align="center">
  由 ClawBotManager 团队用 ❤️ 打造
  <br>
  <a href="https://github.com/xica-ai/clawbot-manager/issues">报告 Bug</a>
  ·
  <a href="https://github.com/xica-ai/clawbot-manager/issues">功能建议</a>
</p>
