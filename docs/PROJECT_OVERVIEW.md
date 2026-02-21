# ClawBotManager - AI Bot 生命周期管理平台

## 项目概述

**ClawBotManager** 是一个 AI Bot 生命周期管理和 API Key 编排平台，专为管理多个 AI Bot 的团队设计。它提供集中式 Bot 管理、安全的 API Key 存储、统一的 AI 请求代理和多租户隔离。

| 项目信息 | 值 |
|---------|-----|
| 包名 | `clawbotmanager` |
| 版本 | 0.1.0 |
| 阶段 | MVP / 早期生产 |
| 架构 | Monorepo (pnpm workspaces + Turborepo) |

## 核心功能

### 解决的问题

| 痛点 | 解决方案 |
|------|----------|
| API Key 分散在多个 Bot 中 | 集中式加密存储，通过 Bot Token 访问 |
| 多供应商集成复杂 (OpenAI, Anthropic, Google 等) | 统一 `/v1/:vendor/*` 代理，自动认证转发 |
| Key 映射、配额、故障转移 | Provider Key 标签路由 + 轮询负载均衡 |
| 容器-数据库状态不一致 | 协调机制、孤儿资源检测与清理 |

### 主要功能模块

1. **Bot 生命周期管理**: 创建、启动、停止、删除运行在 Docker 容器中的 Bot
2. **API Key 安全存储**: AES-256-GCM 加密存储 AI 供应商 API Key
3. **统一 AI 代理**: 单一入口点 (`/v1/:vendor/*`) 支持多个 AI 供应商，Bot Token 认证
4. **多租户隔离**: 基于用户的 Bot 和 Key 隔离，JWT 认证
5. **Key 路由**: 基于标签的路由 + 轮询负载均衡

## 技术栈

### 前端 (apps/web)
- **框架**: Next.js 16 (App Router) + React 19
- **状态管理**: React Query (@tanstack/react-query) + Zustand
- **样式**: Tailwind CSS 4 + shadcn/ui 组件
- **API 客户端**: ts-rest + React Query hooks
- **验证**: Zod 4
- **国际化**: next-intl

### 后端 (apps/api)
- **框架**: NestJS 11 + Fastify
- **数据库**: PostgreSQL + Prisma ORM 7.3.0
- **缓存**: Redis (ioredis)
- **队列**: RabbitMQ + BullMQ
- **认证**: Passport (JWT, OAuth2 - Google, Discord, WeChat)
- **容器编排**: Dockerode (Docker API 客户端)
- **API 契约**: ts-rest 3.53.x (Zod 4 兼容)
- **日志**: Winston
- **验证**: Zod 4

### 共享包
- **@repo/contracts**: API 契约 (ts-rest + Zod schemas)
- **@repo/ui**: shadcn/ui 组件
- **@repo/utils**: 工具函数
- **@repo/types**: TypeScript 类型
- **@repo/constants**: 共享常量
- **@repo/validators**: Zod 验证 schemas

## 项目结构

```
clawbotmanager/
├── apps/
│   ├── web/                    # Next.js 16 前端
│   │   ├── app/[locale]/       # App Router 页面
│   │   │   ├── (auth)/login/   # 登录页面
│   │   │   └── (main)/         # 主布局 (需要认证)
│   │   │       ├── bots/       # Bot 管理 UI
│   │   │       ├── secrets/    # Secrets 管理
│   │   │       └── diagnostics/ # 容器诊断
│   │   ├── components/         # React 组件
│   │   ├── hooks/              # 自定义 hooks
│   │   └── lib/                # API 客户端、查询
│   │
│   └── api/                    # NestJS 11 后端
│       ├── src/modules/        # 功能模块
│       │   ├── bot-api/        # Bot CRUD, Provider Key, Docker, Workspace
│       │   ├── proxy/          # AI 请求代理, Keyring, Upstream
│       │   ├── sign-api/       # 登录/注册
│       │   ├── sms-api/        # 短信服务
│       │   └── uploader/       # 文件上传
│       ├── libs/
│       │   ├── infra/          # 基础设施 (产品无关，可复用)
│       │   │   ├── common/     # 装饰器、拦截器、管道、配置、过滤器
│       │   │   ├── clients/    # 第三方 API 客户端
│       │   │   ├── prisma/     # 数据库连接，读写分离
│       │   │   ├── redis/      # 缓存
│       │   │   ├── rabbitmq/   # 消息队列
│       │   │   ├── jwt/        # JWT 认证
│       │   │   ├── utils/      # 纯工具函数
│       │   │   ├── shared-db/  # TransactionalServiceBase, UnitOfWork
│       │   │   └── shared-services/ # email, sms, ip-info, file-storage
│       │   └── domain/         # 业务领域 (产品相关)
│       │       ├── auth/       # 认证/身份
│       │       └── db/         # 业务实体 DB 服务
│       └── prisma/             # 数据库 schema 和迁移
│
├── packages/                   # 共享包
│   ├── contracts/              # ts-rest 契约 + Zod schemas
│   ├── ui/                     # shadcn/ui 组件
│   ├── utils/                  # 工具函数
│   ├── validators/             # Zod 验证 schemas
│   ├── constants/              # 共享常量
│   ├── types/                  # TypeScript 类型
│   └── config/                 # ESLint, Prettier, TS 配置
│
├── scripts/                    # 初始化和运维脚本
│   ├── init-env-secrets.sh     # 生成 BOT_MASTER_KEY, admin tokens
│   └── start-clawbot.sh         # Docker 部署
│
└── docker-compose.yml          # Docker 部署配置
```

## API 端点

### Bot 管理 (需要 JWT 认证)

**Bot CRUD:**
| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/bot` | 列出所有 Bot |
| POST | `/api/bot` | 创建 Bot |
| GET | `/api/bot/:hostname` | 获取指定 Bot |
| DELETE | `/api/bot/:hostname` | 删除 Bot |

**Bot 生命周期:**
| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/bot/:hostname/start` | 启动 Bot |
| POST | `/api/bot/:hostname/stop` | 停止 Bot |

**诊断:**
| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/bot/stats` | 容器统计 |
| GET | `/api/bot/admin/orphans` | 孤儿资源报告 |
| POST | `/api/bot/admin/cleanup` | 清理孤儿资源 |

### Provider Key 管理 (需要 JWT 认证)

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/provider-key` | 列出 API Keys |
| POST | `/api/provider-key` | 添加 API Key |
| DELETE | `/api/provider-key/:id` | 删除 API Key |
| GET | `/api/provider-key/health` | 健康检查 |

### AI 代理 (Bearer Bot Token 认证)

| 方法 | 路径 | 描述 |
|------|------|------|
| ALL | `/api/v1/:vendor/*` | 代理到 AI 供应商 |

**支持的供应商:**
- `openai`: OpenAI API (https://api.openai.com/v1)
- `anthropic`: Anthropic Claude (https://api.anthropic.com)
- `google`: Google Generative AI (https://generativelanguage.googleapis.com/v1beta)
- `deepseek`: DeepSeek API (https://api.deepseek.com)
- `groq`: Groq API (https://api.groq.com/openai/v1)
- `venice`: Venice AI (https://api.venice.ai/api/v1)

### 认证 API

**登录:**
| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/sign/in/email` | 邮箱登录 |
| POST | `/api/sign/in/mobile/password` | 手机号密码登录 |
| POST | `/api/sign/in/phone` | 手机号验证码登录 |
| GET | `/api/sign/in/device` | 设备登录 (匿名用户) |

**注册:**
| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/sign/up/email` | 邮箱注册 |
| POST | `/api/sign/up/mobile` | 手机号注册 |

**Token:**
| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/sign/refresh/token` | 刷新 Token |
| POST | `/api/sign/out` | 登出 |

**验证码:**
| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/sign/send/verifyemail` | 发送邮箱验证码 |
| POST | `/api/sign/send/code/mobile` | 发送手机注册验证码 |
| POST | `/api/sign/send/code/mobile/login` | 发送手机登录验证码 |
| POST | `/api/sign/verify/email` | 邮箱验证码校验 |
| POST | `/api/sign/verify/mobile` | 手机号验证码校验 |

### SMS API

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/sms/send/code` | 发送短信验证码 |
| POST | `/api/sms/check/code` | 校验短信验证码 |
| POST | `/api/sms/send/code/login` | 发送登录验证码 |
| POST | `/api/sms/login/verify` | 使用短信验证码登录 |
| POST | `/api/sms/send/code/register` | 发送注册验证码 |
| POST | `/api/sms/register/verify` | 使用短信验证码注册 |

## 数据库模型

### 核心模型

**用户系统:**
- `UserInfo`: 用户资料 (nickname, avatar, locale, admin flag)
- `WechatAuth`, `GoogleAuth`, `DiscordAuth`, `MobileAuth`, `EmailAuth`: 多登录方式支持

**Bot 管理:**
- `Bot`: Bot 实体 (hostname, aiProvider, model, channelType, containerId, port, gatewayToken, proxyTokenHash, tags, status)
- `ProviderKey`: 加密的 API Keys (vendor, secretEncrypted, label, tag, baseUrl)
- `BotProviderKey`: Bot-Key 关联表
- `BotUsageLog`: API 使用日志 (botId, vendor, providerKeyId, statusCode, tokens)

**系统:**
- `FileSource`: 文件存储元数据 (bucket, key, hash, vendor, region)
- `Message`, `MessageRecipient`: 用户消息系统
- `SystemTaskQueue`: SMS/Email 任务历史 (仅审计，不用于队列调度)

**枚举:**
- `BotStatus`: created, starting, running, stopped, error
- `ProviderVendor`: openai, anthropic, google, venice, deepseek, groq

## 环境配置

### 后端环境变量 (apps/api/.env)

```env
# 数据库
DATABASE_URL=postgresql://user:password@localhost:5432/clawbot_manager?schema=public
READ_DATABASE_URL=postgresql://...  # 读副本支持
REDIS_URL=redis://localhost:6379
RABBITMQ_URL=amqp://localhost:5672

# Bot API Secrets (由 init-env-secrets.sh 生成)
BOT_MASTER_KEY=<hex-64>           # AES-256-GCM 加密密钥
PROXY_ADMIN_TOKEN=<hex-64>        # Admin API token

# API URLs
API_BASE_URL=http://localhost:3100/api
INTERNAL_API_BASE_URL=http://127.0.0.1:3100/api

# Docker
BOT_IMAGE_GATEWAY=openclaw:local              # GATEWAY 类型 Bot 镜像
BOT_IMAGE_TOOL_SANDBOX=openclaw-sandbox:bookworm-slim  # TOOL_SANDBOX 类型 Bot 镜像
BOT_IMAGE_BROWSER_SANDBOX=openclaw-sandbox-browser:bookworm-slim  # BROWSER_SANDBOX 类型 Bot 镜像
OPENCLAW_SRC_PATH=../openclaw    # OpenClaw 源码路径（用于构建镜像）
BOT_PORT_START=9200               # Bot 容器起始端口
BOT_DATA_DIR=/data/bots           # Bot 工作空间目录
BOT_SECRETS_DIR=/data/secrets     # Secrets 目录
```

### 前端环境变量 (apps/web/.env.local)

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:13100/api
NEXT_PUBLIC_BRAND_NAME='Pardx.ai'
NEXT_PUBLIC_BRAND_LOGO='/logo.svg'
```

### 密钥初始化

运行 `./scripts/init-env-secrets.sh` 生成:
- `BOT_MASTER_KEY`: API Key 加密主密钥
- `PROXY_ADMIN_TOKEN`: 代理管理 Admin token
- 存储在 `secrets/` 目录 (gitignored)

## 开发命令

```bash
# 安装依赖
pnpm install

# 开发
pnpm dev              # 所有应用
pnpm dev:web          # 仅前端
pnpm dev:api          # 仅后端

# 构建
pnpm build
pnpm build:web
pnpm build:api

# 数据库
pnpm db:generate      # 生成 Prisma client
pnpm db:migrate:dev   # 运行迁移 (开发)
pnpm db:migrate:deploy # 运行迁移 (生产)
pnpm db:push          # 推送 schema 变更

# 代码检查和测试
pnpm lint
pnpm type-check
pnpm test

# 脚本
./scripts/init-env-secrets.sh    # 生成 secrets (首次设置)
./scripts/start-clawbot.sh       # Docker 部署
```

## 数据流示例

### 1. 创建 Bot 流程

```
用户 → 前端 (CreateBotWizard)
  → POST /api/bot (CreateBotInput)
    → BotApiService.createBot()
      → WorkspaceService.createWorkspace() (config.json, soul.md, features.json)
      → DockerService.createContainer() (Docker API)
      → BotService.create() (DB 写入)
      → 生成 gatewayToken & proxyTokenHash
    ← 返回 Bot 实体
  ← 显示 bot 卡片
```

### 2. AI 代理请求流程

```
客户端 → /api/v1/openai/chat/completions
  Headers: Authorization: Bearer <bot_gateway_token>
  → ProxyController.proxyRequest()
    → 验证 bot token (DB 中 hash 查找)
    → KeyringService.selectKeyForBot(vendor, botTags)
      → 按 vendor + tag 查询 ProviderKey (轮询)
      → 解密 API key (EncryptionService)
    → UpstreamService.forwardToUpstream()
      → 替换 Authorization header 为真实 API key
      → 转发到 https://api.openai.com/v1/chat/completions
      → 流式响应返回客户端 (SSE 支持)
    → BotUsageLogService.create() (记录使用)
  ← 返回 AI 响应
```

### 3. Key 选择逻辑 (Keyring)

```
KeyringService.selectKeyForBot(vendor='openai', botTags=['premium', 'backup'])
  1. 尝试 tag='premium' → 查询 ProviderKey(vendor='openai', tag='premium')
     → 如果找到: 轮询选择 → 解密 → 返回
  2. 尝试 tag='backup' → 查询 ProviderKey(vendor='openai', tag='backup')
     → 如果找到: 轮询选择 → 解密 → 返回
  3. 回退: 查询 ProviderKey(vendor='openai', tag=null)
     → 轮询选择 → 解密 → 返回
  4. 无可用 keys → 返回 null (503 错误)
```

## 前端路由

### App Router 结构

```
/[locale]/
  ├── (auth)/
  │   └── login/              # 登录页面
  └── (main)/                 # 主布局 (需要认证)
      ├── bots/               # Bot 管理 (列表, 创建, 启动/停止)
      ├── secrets/            # Secrets 管理
      └── diagnostics/        # 容器诊断 (统计, 孤儿资源, 清理)
```

**主要页面:**
- `/bots`: Bot 列表，包含标签页 (Bots, API Keys)，创建向导，provider key 模态框
- `/secrets`: API Key 管理页面
- `/diagnostics`: 系统概览，容器指标，健康状态，清理面板
- `/login`: 登录页面 (进入时清除 localStorage 中的认证数据)

## 安全特性

1. **API Key 加密**: AES-256-GCM 使用主密钥
2. **Bot Token 认证**: SHA-256 hash 存储在 DB
3. **JWT 认证**: 用户会话
4. **多登录支持**: Google, Discord, WeChat, 手机号, 邮箱
5. **速率限制**: Fastify rate-limit (200 req/min)
6. **Helmet**: 安全 headers
7. **Secrets 管理**: 独立 `secrets/` 目录 (gitignored)

## 架构规范

### 核心架构规则

1. **分层架构**: API Layer → Service Layer → DB Layer / Client Layer
   - API 层不能直接访问数据库或外部 API
   - Service 层通过 DB Service 访问数据库，通过 Client 层访问外部 API

2. **Zod-first 验证**: 所有 API 请求/响应必须使用 Zod Schema
   - 禁止在 Controller/Service 中手动类型断言
   - 依赖 Zod Schema 进行类型安全

3. **外部服务调用**: 必须在 Client 层使用 `@nestjs/axios`
   - 禁止直接使用 `axios`
   - Service 层不能直接调用外部 API

4. **数据库访问**: 只有 DB Service 层可以执行 Prisma 操作
   - Service 层不能使用 `prisma.write`, `prisma.read`, `getWriteClient()`, `getReadClient()`
   - Prisma 类型定义 (如 `Prisma.BotUpdateInput`) 可以在非 DB 层使用

5. **日志**: 使用 Winston logger (通过 `WINSTON_MODULE_PROVIDER` 注入)
   - 禁止: NestJS 内置 `Logger`, `console.log`, `console.error`

### API 契约模式 (ts-rest)

**契约定义 (packages/contracts):**
```typescript
export const botContract = c.router({
  list: {
    method: 'GET',
    path: '',
    responses: { 200: ApiResponseSchema(z.object({ bots: z.array(BotSchema) })) },
  },
});
```

**后端实现 (apps/api):**
```typescript
@TsRestHandler(botContract.list)
async listBots(@Req() req: AuthenticatedRequest) {
  return tsRestHandler(botContract.list, async () => {
    const bots = await this.botApiService.listBots(req.userId);
    return success({ bots });
  });
}
```

**前端使用 (apps/web):**
```typescript
const { data } = tsRestClient.bot.list.useQuery({
  queryKey: ['bots'],
});
// data.body.bots - Bot 数组
```

## Docker 部署

### docker-compose.yml 服务

1. **api**: NestJS 后端服务 (内部: 3200, 外部: 13100)
2. **web**: Next.js 前端服务 (内部: 3000, 外部: 13000)

### Bot 镜像构建

所有 Bot 镜像从 openclaw 项目本地构建：

```bash
# 构建所有镜像
pnpm docker:build:all

# 单独构建
pnpm docker:build:gateway  # GATEWAY 类型
pnpm docker:build:sandbox  # TOOL_SANDBOX 类型
pnpm docker:build:browser  # BROWSER_SANDBOX 类型
```

| BotType | 镜像 | 用途 |
|---------|------|------|
| `GATEWAY` | `openclaw:local` | 主 Gateway bot（默认）|
| `TOOL_SANDBOX` | `openclaw-sandbox:bookworm-slim` | 工具沙箱 |
| `BROWSER_SANDBOX` | `openclaw-sandbox-browser:bookworm-slim` | 浏览器沙箱 + VNC |

### 快速启动
   - 暴露端口 7100
   - 挂载 Docker socket 用于容器管理
   - Volumes: clawbot-data, clawbot-secrets

### 快速启动

```bash
# 1. 初始化 secrets
./scripts/init-env-secrets.sh

# 2. 配置环境变量
cp apps/api/.env.example apps/api/.env
# 编辑 .env 文件

# 3. 启动数据库
docker-compose up -d postgres redis rabbitmq

# 4. 运行迁移
pnpm db:migrate:dev

# 5. 启动开发服务器
pnpm dev
```

## 许可证

MIT License
