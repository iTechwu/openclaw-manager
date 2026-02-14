# ClawBotManager

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16.1-black.svg)](https://nextjs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11-red.svg)](https://nestjs.com/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

> AI Bot 全生命周期管理与 API 密钥编排平台 — 解决多 Bot、多提供商场景下的密钥安全、请求代理与运维难题。

[English](./README.md) | [快速开始](#-快速开始) | [架构设计](#%EF%B8%8F-架构设计) | [API 概览](#-api-概览)

---

## 📌 项目定位

ClawBotManager 面向**需要部署和管理多个 AI Bot** 的团队与开发者，提供：

- **Bot 生命周期管理** — 创建、启动、停止、删除，基于 Docker 容器化运行
- **API 密钥安全编排** — AES-256-GCM 加密存储、标签路由、Round-robin 负载均衡
- **统一 AI 请求代理** — 单入口对接 63 个 AI 提供商，按 Bot Token 鉴权
- **多租户隔离** — 按用户划分 Bot 与密钥，支持团队协作

### 解决的问题

| 痛点 | 方案 |
| --- | --- |
| 多 Bot 场景下 API Key 分散、易泄露 | 集中加密存储（AES-256-GCM），统一通过 Bot Token 访问 |
| 多 AI 提供商接入复杂 | 统一 `/v1/:vendor/*` 代理，自动认证与转发 |
| Bot 与密钥的映射、配额、故障切换 | Provider Key 标签路由 + Round-robin + 降级链 |
| 容器与数据库状态不一致 | reconcile 对账、孤立资源检测与清理 |

---

## 🛠️ 技术栈

### 前端

| 技术 | 版本 | 用途 |
| --- | --- | --- |
| Next.js | 16.1 | React 框架，App Router |
| React | 19.2 | UI 库 |
| TypeScript | 5.9 | 类型安全 |
| Tailwind CSS | 4 | 样式 |
| shadcn/ui | Latest | UI 组件 |
| TanStack Query | 5.x | 服务端状态管理 |
| ts-rest | 3.53 | 类型安全 API 客户端 |
| Zustand | 5.x | 客户端状态管理 |
| next-intl | 4.x | 国际化 |
| Recharts | 3.x | 数据可视化 |
| ReactFlow | 11.x | 流程图 |

### 后端

| 技术 | 版本 | 用途 |
| --- | --- | --- |
| NestJS | 11.1 | Node.js 框架 |
| Fastify | 5.2 | HTTP 服务器 |
| Prisma | 7.3 | ORM（38 个模型）|
| PostgreSQL | 14+ | 主数据库（读写分离）|
| Redis (ioredis) | 5.9 | 缓存 |
| BullMQ | 5.x | 任务队列 |
| RabbitMQ | — | 消息队列 |
| Zod | 4.3 | Schema 校验 |
| ts-rest | 3.53 | API 契约（25 个契约）|
| Winston | 3.x | 结构化日志 |
| Passport | 0.7 | 认证（JWT、OAuth2）|
| Dockerode | 4.x | Bot 容器编排 |

### 基础设施

| 技术 | 用途 |
| --- | --- |
| pnpm 10 + Turborepo 2.8 | Monorepo 管理 |
| Docker | Bot 容器化 |
| Prometheus + prom-client | 指标采集 |
| Socket.IO | 实时通信 |

---

## 🏗️ 架构设计

### 设计原则

1. **分层架构** — API 层 → Service 层 → DB 层 / Client 层，严格禁止跨层访问
2. **Zod-first** — 所有 API 请求/响应通过 Zod Schema 校验，编译时类型 + 运行时校验
3. **契约驱动** — ts-rest 定义前后端契约
4. **infra / domain 边界** — infra 不依赖 domain，domain 可依赖 infra
5. **密钥零明文** — API 密钥 AES-256-GCM 加密存储，仅在代理层运行时解密

### 整体架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            ClawBotManager                              │
├─────────────────────────────────────────────────────────────────────────┤
│  Web (Next.js 16)              │  API (NestJS 11 + Fastify)            │
│  - Bot 管理 / 创建向导          │  - Bot API（CRUD、生命周期）            │
│  - Provider Key 管理           │  - Proxy（/v1/:vendor/* 转发）         │
│  - 模型路由配置                 │  - 模型路由引擎                        │
│  - 插件与技能管理               │  - Plugin / Skill / Channel APIs      │
│  - 诊断与运维                   │  - Sign / SMS / Uploader              │
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
            │  63 个 AI 提供商   │                   │  OpenAI, Anthropic│
            │  （见完整列表）     │   ...             │  Google, DeepSeek │
            └───────────────────┘                   └───────────────────┘
```

### 数据流

1. **创建 Bot** — 用户填写配置 → 分配端口 → 创建 Workspace（config.json、soul.md、features.json）→ 启动 Docker 容器 → 写入 DB，生成 Gateway Token
2. **代理请求** — 客户端带 `Authorization: Bearer <gateway_token>` 访问 `/api/v1/openai/...` → 校验 Token → 选择 Provider Key（标签 + Round-robin）→ 解密密钥 → 转发至上游 API → 记录 BotUsageLog
3. **密钥管理** — 用户添加 Provider Key → AES-256-GCM 加密 → 写入 ProviderKey 表，支持 tag、baseUrl 等

### 目录结构

```
clawbotmanager/
├── apps/
│   ├── web/                        # @repo/web — Next.js 16 前端
│   │   ├── app/[locale]/           # 国际化路由
│   │   │   ├── (auth)/login        # 认证
│   │   │   └── (main)/             # 需认证路由
│   │   │       ├── bots/           # Bot 管理 + 详情
│   │   │       ├── diagnostics/    # 容器诊断
│   │   │       ├── models/         # 模型管理
│   │   │       ├── plugins/        # 插件管理
│   │   │       ├── routing/        # 模型路由（能力标签、降级链、
│   │   │       │                   #   成本策略、复杂度路由、模型定价）
│   │   │       ├── secrets/        # API 密钥管理
│   │   │       ├── settings/       # 设置（账户、API 密钥、通知、安全）
│   │   │       ├── skills/         # 技能管理
│   │   │       ├── templates/      # Persona 模板
│   │   │       └── admin/models    # 管理员模型管理
│   │   ├── components/             # 通用组件
│   │   ├── hooks/                  # React Hooks
│   │   └── lib/                    # API 客户端、配置、查询
│   │
│   └── api/                        # @repo/api — NestJS 11 后端
│       ├── src/modules/            # 15 个功能模块
│       │   ├── bot-api/            # Bot CRUD、Provider Key、Docker、Workspace
│       │   ├── bot-channel-api/    # Bot 渠道管理
│       │   ├── channel-api/        # 渠道定义
│       │   ├── message-api/        # 消息系统
│       │   ├── operate-log-api/    # 操作审计日志
│       │   ├── persona-template-api/ # Persona 模板
│       │   ├── plugin-api/         # MCP 插件管理
│       │   ├── proxy/              # AI 请求代理、Keyring、Upstream
│       │   ├── sign-api/           # 登录注册
│       │   ├── skill-api/          # 技能管理
│       │   ├── skill-sync/         # 技能同步（OpenClaw）
│       │   ├── sms-api/            # 短信
│       │   ├── sse-api/            # 服务端推送事件
│       │   ├── uploader/           # 文件上传
│       │   └── user-api/           # 用户管理
│       ├── libs/
│       │   ├── infra/              # 基础设施（可复用，与产品无关）
│       │   │   ├── common/         # 装饰器、拦截器、管道、配置、过滤器
│       │   │   ├── clients/        # 第三方 API 客户端（19 个内部客户端）
│       │   │   ├── prisma/         # 数据库连接、读写分离
│       │   │   ├── redis/          # 缓存
│       │   │   ├── rabbitmq/       # 消息队列
│       │   │   ├── jwt/            # JWT 认证
│       │   │   ├── utils/          # 纯工具函数
│       │   │   ├── i18n/           # 国际化
│       │   │   ├── shared-db/      # TransactionalServiceBase、UnitOfWork
│       │   │   └── shared-services/ # 7 个共享服务（email、file-storage、
│       │   │                        #   ip-geo、sms、streaming-asr、system-health、uploader）
│       │   └── domain/             # 领域（业务相关）
│       │       ├── auth/           # 认证 / 身份
│       │       └── services/       # 业务服务
│       └── prisma/                 # Schema（38 个模型）、迁移、种子数据
│
├── packages/                       # 7 个共享包（前后端共用）
│   ├── contracts/                  # @repo/contracts — ts-rest 契约 + Zod Schema
│   ├── ui/                         # @repo/ui — shadcn/ui 组件
│   ├── utils/                      # @repo/utils — 工具函数
│   ├── validators/                 # @repo/validators — Zod 校验
│   ├── constants/                  # @repo/constants — 共享常量
│   ├── types/                      # @repo/types — 类型定义
│   └── config/                     # @repo/config — ESLint、Prettier、TS 配置
│
├── docs/                           # 文档
└── scripts/                        # 初始化与运维脚本
```

---

## ✨ 核心能力

- **Bot 生命周期** — 创建、启动、停止、删除，Docker 容器 + 工作区（config.json、soul.md、features.json）
- **Provider Key 管理** — AES-256-GCM 加密存储、标签路由、Round-robin、自定义 baseUrl
- **模型路由系统** — 能力标签、降级链、成本策略、复杂度路由、负载均衡、路由统计
- **AI 请求代理** — `/v1/:vendor/*` 统一入口，支持 63 个提供商，Bot Token 鉴权，流式响应（SSE）
- **插件系统（MCP）** — 预置插件（搜索、文件、数据库、开发工具等）、按区域过滤、一键安装到 Bot
- **技能系统** — 自定义工具（tool）、提示词模板（prompt）、工作流（workflow）、技能安装与配置、OpenClaw 同步
- **渠道系统** — 10 个渠道定义、按语言环境推荐、渠道凭证管理
- **零信任模式** — Bot 容器不接触 API 密钥，代理层运行时注入密钥
- **配额管理** — 日/月 Token 限制、阈值警告、超额通知
- **Bot 用量分析** — Token 使用追踪、路由统计、分析仪表板
- **模板系统** — Persona 模板（系统/用户）、Bot 创建向导
- **诊断与运维** — 容器统计、孤立资源检测与清理、启动对账
- **审计日志** — 操作日志记录（CREATE、START、STOP、DELETE）
- **多租户** — 按用户隔离 Bot 与 Key，JWT 认证
- **国际化** — 支持中文、英文切换（next-intl）

---

## 🌐 支持的 AI 提供商（63 个）

| 类别 | 提供商 |
| --- | --- |
| **国际主流** | OpenAI, Anthropic, Google Gemini, Azure OpenAI, AWS Bedrock, Vertex AI, Mistral, Groq, Together, Fireworks, Perplexity, Grok (xAI), NVIDIA NIM, Hyperbolic, Cerebras, Hugging Face, GitHub Models, GitHub Copilot, Cohere, AI21, Replicate |
| **国内平台** | DeepSeek, 智谱, 月之暗面/Kimi, 百川, 阿里百炼/通义, 阶跃星辰, 字节豆包, MiniMax, 零一万物, 腾讯混元, 腾讯云 TI, 百度云千帆, Infini, 魔搭, 天翼云息壤, 小米 MiMo |
| **聚合/代理** | OpenRouter, 硅基流动, AiHubMix, 302.AI, TokenFlux, Poe, Venice, ocoolAI, DMXAPI, BurnCloud, Cephalon, LANYUN, PH8, 七牛, PPIO, AlayaNew, AIOnly, LongCat, SophNet, Vercel AI Gateway |
| **本地部署** | Ollama, LM Studio, GPUStack, OpenVINO Model Server, New API |
| **自定义** | 任何 OpenAI 兼容端点 |

---

## 📱 支持的渠道

| 渠道 | ID | 推荐环境 | 所需凭证 |
| --- | --- | --- | --- |
| **飞书/Lark** | `feishu` | 🇨🇳 中文、🌍 英文 | App ID、App Secret |
| **Telegram** | `telegram` | 🌍 英文 | Bot Token |
| **Slack** | `slack` | 🌍 英文 | Bot Token、App Token、Signing Secret |
| **微信** | `wechat` | 🇨🇳 中文、🌍 英文 | App ID、App Secret、Token、Encoding AES Key |
| **Discord** | `discord` | — | Bot Token、Application ID |
| **WhatsApp** | `whatsapp` | — | Access Token、Phone Number ID、Business Account ID |
| **Twitter/X** | `twitter` | — | API Key、API Secret、Access Token、Access Token Secret |
| **Instagram** | `instagram` | — | Access Token、App Secret |
| **Microsoft Teams** | `teams` | — | App ID、App Password、Tenant ID |
| **LINE** | `line` | — | Channel Access Token、Channel Secret |

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
pnpm db:seed          # 填充默认数据
```

### 6. 启动

```bash
pnpm dev              # 全量
pnpm dev:web          # 仅前端
pnpm dev:api          # 仅后端
```

- 前端：http://localhost:3000
- 后端 API：http://localhost:3100/api

---

## 🔧 环境变量

### 后端 (`apps/api/.env`)

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | PostgreSQL 连接字符串（写）|
| `REDIS_URL` | ✅ | Redis 连接字符串 |
| `RABBITMQ_URL` | ✅ | RabbitMQ 连接字符串 |
| `READ_DATABASE_URL` | — | PostgreSQL 读副本（默认使用 DATABASE_URL）|
| `BOT_MASTER_KEY` | — | API 密钥加密主密钥（自动生成）|
| `BOT_IMAGE` | — | Bot 容器 Docker 镜像（默认：`openclaw:latest`）|
| `BOT_PORT_START` | — | Bot 容器起始端口（默认：`9200`）|
| `BOT_DATA_DIR` | — | Bot 数据目录（默认：`/data/bots`）|
| `BOT_SECRETS_DIR` | — | Bot 密钥目录（默认：`/data/secrets`）|
| `ZERO_TRUST_MODE` | — | 启用零信任模式（默认：`false`）|
| `PROXY_TOKEN_TTL` | — | 代理令牌有效期（秒，默认：`86400`）|

> JWT 配置（`secret`、`expireIn`）在 `config.local.yaml` 中，不是环境变量。

### 前端 (`apps/web/.env.local`)

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `NEXT_PUBLIC_SERVER_BASE_URL` | ✅ | 后端 API 基础 URL |
| `NEXT_PUBLIC_API_BASE_URL` | — | API 基础 URL（默认为服务器 URL + `/api`）|

---

## 🐳 Docker 部署

```bash
./scripts/start-clawbot.sh
```

依赖 `docker-compose.yml`，启动 API 与 Web 服务。健康检查通过后：
- 前端：http://localhost:13000
- API：http://localhost:13100/api

> AI 代理功能（keyring-proxy）已集成到 API 服务中，通过 `/api/v1/:vendor/*` 端点提供。

---

## 📡 API 概览

### Bot（需 JWT）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/bot` | 列出当前用户 Bot |
| POST | `/api/bot` | 创建 Bot |
| GET | `/api/bot/:hostname` | 获取单个 Bot |
| POST | `/api/bot/:hostname/start` | 启动 |
| POST | `/api/bot/:hostname/stop` | 停止 |
| DELETE | `/api/bot/:hostname` | 删除 |
| GET | `/api/bot/stats` | 容器统计 |
| GET | `/api/bot/admin/orphans` | 孤立资源 |
| POST | `/api/bot/admin/cleanup` | 清理孤立资源 |

### Provider Key（需 JWT）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/provider-key` | 列出 API Keys |
| POST | `/api/provider-key` | 添加 Key |
| DELETE | `/api/provider-key/:id` | 删除 Key |
| GET | `/api/provider-key/health` | 健康检查 |

### Plugin 插件（需 JWT）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/plugin` | 列出所有插件 |
| GET | `/api/plugin/:id` | 获取插件详情 |
| GET | `/api/bot/:hostname/plugins` | 获取 Bot 已安装插件 |
| POST | `/api/bot/:hostname/plugins` | 安装插件到 Bot |
| DELETE | `/api/bot/:hostname/plugins/:id` | 从 Bot 卸载插件 |

### Skill 技能（需 JWT）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/skill` | 列出所有技能 |
| GET | `/api/skill/:id` | 获取技能详情 |
| POST | `/api/skill` | 创建自定义技能 |
| PUT | `/api/skill/:id` | 更新技能 |
| DELETE | `/api/skill/:id` | 删除技能 |
| GET | `/api/bot/:hostname/skills` | 获取 Bot 已安装技能 |
| POST | `/api/bot/:hostname/skills` | 安装技能到 Bot |
| PUT | `/api/bot/:hostname/skills/:id` | 更新技能配置 |
| DELETE | `/api/bot/:hostname/skills/:id` | 从 Bot 卸载技能 |

### Model Routing 模型路由（需 JWT）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/bot/:hostname/routing` | 获取 Bot 路由配置 |
| PUT | `/api/bot/:hostname/routing` | 更新路由配置 |
| GET | `/api/routing/capability-tags` | 列出能力标签 |
| GET | `/api/routing/fallback-chains` | 列出降级链 |
| GET | `/api/routing/cost-strategies` | 列出成本策略 |
| GET | `/api/routing/statistics` | 获取路由统计 |

### Channel 渠道（需 JWT）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/channel` | 列出所有渠道定义 |
| GET | `/api/channel/:id` | 获取渠道定义详情 |
| GET | `/api/bot/:hostname/channels` | 获取 Bot 已配置渠道 |
| POST | `/api/bot/:hostname/channels` | 添加渠道到 Bot |
| PUT | `/api/bot/:hostname/channels/:id` | 更新渠道配置 |
| DELETE | `/api/bot/:hostname/channels/:id` | 删除渠道 |
| POST | `/api/bot/:hostname/channels/:id/connection` | 连接/断开渠道 |

### AI 代理（Bearer Bot Token）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| ALL | `/api/v1/:vendor/*` | 转发至对应 AI 提供商 |

---

## 👨‍💻 开发指南

### 常用命令

```bash
pnpm install              # 安装依赖
pnpm dev                  # 开发（所有应用）
pnpm dev:web              # 仅前端
pnpm dev:api              # 仅后端
pnpm build                # 构建全部
pnpm lint                 # Lint
pnpm type-check           # 类型检查
pnpm test                 # 测试
pnpm db:generate          # 生成 Prisma Client
pnpm db:migrate:dev       # 开发迁移
pnpm db:migrate:deploy    # 生产迁移
pnpm db:push              # 推送 schema（无迁移）
pnpm db:seed              # 填充数据库
```

### 添加新功能

1. **定义 API 契约** — 在 `packages/contracts/src/api/` 中
2. **实现后端** — `cd apps/api && npx nest g module <name> src/modules`
3. **前端调用** — 使用 ts-rest React Query hooks

### 代码规范

- TypeScript 严格模式
- Zod 4 用于所有校验（非 Zod 3）
- Winston Logger（禁止 `console.log`）
- 分层架构：API → Service → DB/Client
- infra 和 domain 层保持分离

---

## 🔄 初始化与启动流程

### 一次性初始化脚本

首次部署或新环境搭建时，按以下顺序执行：

```bash
# 1. 安装依赖
pnpm install

# 2. 生成加密主密钥（BOT_MASTER_KEY）
./scripts/init-env-secrets.sh

# 3.（可选）交互式项目初始化向导
node scripts/init-project.js

# 4. 生成 Prisma Client
pnpm db:generate

# 5. 执行数据库迁移
pnpm db:migrate:dev

# 6. 填充种子数据
pnpm db:seed
```

### 种子数据填充顺序（`pnpm db:seed`）

种子数据按以下顺序依次执行，定义在 `apps/api/prisma/seed.ts`：

| 顺序 | 数据 | 数据文件 | 说明 |
| --- | --- | --- | --- |
| 1 | Persona 模板 | `scripts/persona-templates.data.ts` | 系统预置人设模板（中/英） |
| 2 | 国家代码 | `scripts/country-codes.data.ts` | 国家/地区代码（全量替换） |
| 3 | 渠道定义 | `scripts/channel-definitions.data.ts` | 10 个渠道定义 + 凭证字段 |
| 4 | 插件 | `scripts/plugin-definitions.data.ts` | MCP 插件定义（按区域） |
| 5 | 模型目录 | `scripts/model-catalog.data.ts` | AI 模型定价与能力评分 |
| 6 | 能力标签 | `scripts/capability-tags.data.ts` | 路由能力标签（25 个） |
| 7 | 降级链 | `scripts/fallback-chains.data.ts` | 模型降级策略（14 条链） |
| 8 | 成本策略 | `scripts/cost-strategies.data.ts` | 成本优化策略（13 个） |

### NestJS 后端启动流程

`pnpm dev:api` 启动后，按以下阶段执行：

**阶段 1：环境与配置加载**（`main.ts` bootstrap 前）

1. `loadEnv()` — 加载 `.env` 文件（monorepo 根目录 → `apps/api/.env` → `.env.{NODE_ENV}`）
2. `initConfig()` — 加载 YAML 配置文件（`config.local.yaml` 等）
3. `initKeysConfig()` — 加载加密密钥配置

**阶段 2：Fastify 服务器初始化**

4. 创建 Fastify 适配器
5. 注册 Fastify 插件：`helmet`（安全）→ `compress`（压缩）→ `SSE`（流式推送）→ `multipart`（文件上传）→ `rate-limit`（限流）→ `cookie`
6. CORS 跨域配置
7. 全局前缀 `/api`
8. API 版本控制（Header 模式：`x-api-version`）
9. WebSocket 适配器（Socket.IO）
10. Swagger 文档（非生产环境）
11. 全局管道（ValidationPipe）、守卫（VersionGuard）、拦截器（TransformInterceptor、VersionHeaderInterceptor）

**阶段 3：NestJS 模块初始化**（`OnModuleInit` 生命周期钩子）

NestJS 按模块依赖顺序初始化，各服务的 `onModuleInit()` 按以下层次执行：

```
基础设施层（infra）
├── PrismaWriteService      — 连接写数据库（PostgreSQL + PrismaPg）
├── PrismaReadService       — 连接读数据库（或回退到写库）
├── DbMetricsService        — 加载数据库指标配置（慢查询阈值等）
├── RabbitmqService         — 连接 RabbitMQ + 自动重连
├── FeatureFlagService      — 初始化功能开关（memory/Redis/Unleash）
├── RateLimitService        — 加载限流配置
├── AppVersionService       — 加载版本信息（package.json + Git hash）
├── OpenAIClient            — 加载 OpenAI API 配置
├── EmailService            — 初始化邮件客户端（SendCloud）
└── SmsService              — 初始化短信客户端（阿里云/腾讯/火山引擎）

应用层（app）
├── AppModule               — 设置事务指标服务引用
├── DockerService           — 连接 Docker（ping 验证，不可用时降级为模拟模式）
├── ConfigurationService    — 加载路由配置（模型目录、能力标签、降级链、成本策略）
│                             + 启动定时刷新（每 5 分钟）
└── BotUsageAnalyticsService — 加载模型定价缓存（用于成本计算）

启动服务层
├── ReconciliationService   — 对账：同步数据库与 Docker 容器状态
│                             （可通过 ENABLE_STARTUP_RECONCILIATION 禁用）
├── DockerEventService      — 启动 Docker 事件监听（延迟 2 秒）
└── BotChannelStartupService — 自动重连已启用的飞书渠道（最多重试 3 次）
```

**阶段 4：HTTP 监听**

12. 启动 HTTP 服务器（默认端口 3100，监听 `0.0.0.0`）
13. 注册优雅关闭信号处理（SIGTERM、SIGINT、SIGHUP）

### 初始化脚本说明

| 脚本 | 用途 | 执行时机 |
| --- | --- | --- |
| `scripts/init-env-secrets.sh` | 生成 `BOT_MASTER_KEY`（OpenSSL 64 位 hex），写入 `secrets/` 和 `.env` | 首次部署 |
| `scripts/init-project.js` | 交互式项目初始化（项目名、端口、数据库等配置） | 首次部署（可选） |
| `scripts/start-clawbot.sh` | Docker Compose 启动 | 生产部署 |
| `scripts/stop-clawbot.sh` | Docker Compose 停止 | 生产运维 |
| `scripts/generate-prisma-enums.ts` | 生成 Prisma 枚举类型定义 | Schema 变更后 |
| `scripts/generate-i18n-errors.ts` | 生成 i18n 错误消息 | 错误码变更后 |

---

## 🗺️ 路线图

### 近期目标

| 功能 | 状态 |
| --- | --- |
| 渠道连接器（飞书、Telegram、微信等）| 🚧 进行中 |
| Analytics 分析 UI | 📋 后端已实现 |
| 通知系统 UI | 📋 后端已实现 |
| Webhook 处理器 | 📋 契约已定义 |
| 权限系统（RBAC）| 📋 待设计 |
| 限流验证 | 📋 配置已存在 |

### 中期目标

- 更多 IM 渠道（企业微信、钉钉等）
- Prometheus/Grafana 监控告警
- 基于延迟和成本的智能路由
- 团队协作（空间、成员管理）
- API 用量分析与成本分析

### 长期愿景

- 多集群部署与跨区域调度
- 渠道市场
- 模板与 Bot 分享市场

---

## 🔍 常见问题

### 数据库连接失败

```bash
docker ps | grep postgres
psql $DATABASE_URL -c "SELECT 1"
```

### Docker 权限被拒绝

```bash
sudo usermod -aG docker $USER
sudo systemctl restart docker
```

### 端口已被占用

```bash
lsof -i :3000
kill -9 <PID>
```

### Prisma Client 不同步

```bash
pnpm db:generate
pnpm db:migrate:dev
```

### Bot 容器无法启动

1. 检查 Docker 是否运行：`docker info`
2. 验证端口范围可用
3. 检查工作区目录权限
4. 查看容器日志：`docker logs <container_id>`

---

## 🔒 安全

- 所有 API 密钥存储前使用 **AES-256-GCM** 加密
- 密钥仅在代理层运行时解密
- Bot 容器**永不**直接访问 API 密钥（零信任）
- 基于 JWT 的认证，可配置过期时间
- 支持多种登录方式（邮箱、手机、OAuth）
- `BOT_MASTER_KEY` 应安全存储并定期轮换

---

## 🤝 贡献指南

1. **Fork** 仓库
2. **创建** 功能分支：`git checkout -b feature/amazing-feature`
3. **遵循** `CLAUDE.md` 中的编码规范
4. **编写** 新功能的测试
5. **提交** 清晰的 commit 信息
6. **创建** Pull Request

---

## 🙏 致谢

我们由衷感谢 [BotMaker](https://github.com/jgarzik/botmaker) 的零信任 API 密钥架构、keyring-proxy 设计理念以及容器化 Bot 管理思路，为本项目的设计与实现带来了重要启发。

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