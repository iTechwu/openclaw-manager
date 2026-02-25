# ClawBotManager

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16.1-black.svg)](https://nextjs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11-red.svg)](https://nestjs.com/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

> AI Bot lifecycle management and API key orchestration platform — solving key security, request proxying, and operations challenges across multi-Bot, multi-provider scenarios.

[中文文档](./README.zh-CN.md) | [Quick Start](#-quick-start) | [Architecture](#%EF%B8%8F-architecture) | [API Overview](#-api-overview) | [Docs](./docs/) — [ARCHITECTURE](./docs/ARCHITECTURE.md) | [DEVELOPMENT](./docs/DEVELOPMENT.md) | [GUIDE](./docs/GUIDE.md)

---

## 📌 Project Overview

ClawBotManager is designed for **teams and developers who need to deploy and manage multiple AI Bots**, providing:

- **Bot Lifecycle Management** — Create, start, stop, delete; containerized with Docker
- **API Key Security Orchestration** — AES-256-GCM encrypted storage, tag-based routing, round-robin load balancing
- **Unified AI Request Proxy** — Single entry point for 63 AI providers, authenticated via Bot Token
- **Multi-tenant Isolation** — User-based Bot and key separation with team collaboration support

### Problems Solved

| Pain Point | Solution |
| --- | --- |
| API Keys scattered and prone to leakage in multi-Bot scenarios | Centralized encrypted storage (AES-256-GCM), unified access via Bot Token |
| Complex integration with multiple AI providers | Unified `/v1/:vendor/*` proxy with automatic authentication and forwarding |
| Bot-to-key mapping, quotas, failover | Provider Key tag routing + round-robin + fallback chains |
| Container and database state inconsistency | Reconciliation, orphan resource detection and cleanup |

---

## 🛠️ Tech Stack

### Frontend

| Technology | Version | Purpose |
| --- | --- | --- |
| Next.js | 16.1 | React framework with App Router |
| React | 19.2 | UI library |
| TypeScript | 5.9 | Type safety |
| Tailwind CSS | 4 | Styling |
| shadcn/ui | Latest | UI components |
| TanStack Query | 5.x | Server state management |
| ts-rest | 3.53 | Type-safe API client |
| Zustand | 5.x | Client state management |
| next-intl | 4.x | Internationalization |
| Recharts | 3.x | Data visualization |
| ReactFlow | 11.x | Flow diagrams |

### Backend

| Technology | Version | Purpose |
| --- | --- | --- |
| NestJS | 11.1 | Node.js framework |
| Fastify | 5.2 | HTTP server |
| Prisma | 7.3 | ORM (38 models) |
| PostgreSQL | 14+ | Primary database (read/write split) |
| Redis (ioredis) | 5.9 | Caching |
| BullMQ | 5.x | Job queue |
| RabbitMQ | — | Message queue |
| Zod | 4.3 | Schema validation |
| ts-rest | 3.53 | API contracts (25 contracts) |
| Winston | 3.x | Structured logging |
| Passport | 0.7 | Authentication (JWT, OAuth2) |
| Dockerode | 4.x | Bot container orchestration |

### Infrastructure

| Technology | Purpose |
| --- | --- |
| pnpm 10 + Turborepo 2.8 | Monorepo management |
| Docker | Bot containerization |
| Prometheus + prom-client | Metrics collection |
| Socket.IO | Real-time communication |

---

## 🏗️ Architecture

### Design Principles

1. **Layered Architecture** — API Layer → Service Layer → DB Layer / Client Layer; strict no cross-layer access
2. **Zod-first** — All API requests/responses validated via Zod Schema; compile-time types + runtime validation
3. **Contract-driven** — ts-rest defines frontend-backend contracts
4. **infra / domain boundary** — infra never depends on domain; domain may depend on infra
5. **Zero plaintext keys** — API keys encrypted with AES-256-GCM, decrypted only at runtime in the proxy layer

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            ClawBotManager                              │
├─────────────────────────────────────────────────────────────────────────┤
│  Web (Next.js 16)              │  API (NestJS 11 + Fastify)            │
│  - Bot Management / Wizard     │  - Bot API (CRUD, lifecycle)          │
│  - Provider Key Management     │  - Proxy (/v1/:vendor/* forwarding)   │
│  - Model Routing Config        │  - Model Routing Engine               │
│  - Plugin & Skill Management   │  - Plugin / Skill / Channel APIs     │
│  - Diagnostics & Ops           │  - Sign / SMS / Uploader             │
└─────────────────────────────────────────────────────────────────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
            ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
            │  PostgreSQL   │   │  Redis        │   │  Docker       │
            │  Prisma ORM   │   │  BullMQ       │   │  Bot Containers│
            └───────────────┘   └───────────────┘   └───────────────┘
                                        │
                    ┌───────────────────┴───────────────────┐
                    ▼                                       ▼
            ┌───────────────────┐                   ┌───────────────────┐
            │  63 AI Providers  │                   │  OpenAI, Anthropic│
            │  (see full list)  │   ...             │  Google, DeepSeek │
            └───────────────────┘                   └───────────────────┘
```

### Data Flow

1. **Create Bot** — User fills config → Assign port → Create Workspace (config.json, soul.md, features.json) → Start Docker container → Write to DB, generate Gateway Token
2. **Proxy Request** — Client sends `Authorization: Bearer <gateway_token>` to `/api/v1/openai/...` → Validate Token → Select Provider Key (tag + round-robin) → Decrypt key → Forward to upstream API → Log to BotUsageLog
3. **Key Management** — User adds Provider Key → AES-256-GCM encrypt → Store in ProviderKey table with tag, baseUrl, etc.

### Directory Structure

```
clawbotmanager/
├── apps/
│   ├── web/                        # @repo/web — Next.js 16 Frontend
│   │   ├── app/[locale]/           # i18n routes
│   │   │   ├── (auth)/login        # Authentication
│   │   │   └── (main)/             # Authenticated routes
│   │   │       ├── bots/           # Bot management + detail
│   │   │       ├── diagnostics/    # Container diagnostics
│   │   │       ├── models/         # Model management
│   │   │       ├── plugins/        # Plugin management
│   │   │       ├── routing/        # Model routing (capability-tags, fallback-chains,
│   │   │       │                   #   cost-strategies, complexity-routing, model-pricing)
│   │   │       ├── secrets/        # API key management
│   │   │       ├── settings/       # Settings (account, api-keys, notifications, security)
│   │   │       ├── skills/         # Skill management
│   │   │       ├── templates/      # Persona templates
│   │   │       ├── messages/       # Message center
│   │   │       └── admin/models    # Admin model management
│   │   ├── components/             # Shared components
│   │   ├── hooks/                  # React hooks
│   │   └── lib/                    # API client, config, queries
│   │
│   └── api/                        # @repo/api — NestJS 11 Backend
│       ├── src/modules/            # 15 feature modules
│       │   ├── bot-api/            # Bot CRUD, Provider Key, Docker, Workspace
│       │   ├── bot-channel-api/    # Bot channel management
│       │   ├── channel-api/        # Channel definitions
│       │   ├── message-api/        # Messaging system
│       │   ├── operate-log-api/    # Operation audit logs
│       │   ├── persona-template-api/ # Persona templates
│       │   ├── plugin-api/         # MCP plugin management
│       │   ├── proxy/              # AI request proxy, Keyring, Upstream
│       │   ├── sign-api/           # Login / register
│       │   ├── skill-api/          # Skill management
│       │   ├── skill-sync/         # Skill synchronization (OpenClaw)
│       │   ├── sms-api/            # SMS
│       │   ├── sse-api/            # Server-sent events
│       │   ├── uploader/           # File upload
│       │   └── user-api/           # User management
│       ├── libs/
│       │   ├── infra/              # Infrastructure (reusable, product-agnostic)
│       │   │   ├── common/         # Decorators, interceptors, pipes, config, filters
│       │   │   ├── clients/        # Third-party API clients (19 internal clients)
│       │   │   ├── prisma/         # DB connection, read/write split
│       │   │   ├── redis/          # Cache
│       │   │   ├── rabbitmq/       # Message queue
│       │   │   ├── jwt/            # JWT authentication
│       │   │   ├── utils/          # Pure utilities
│       │   │   ├── i18n/           # Internationalization
│       │   │   ├── shared-db/      # TransactionalServiceBase, UnitOfWork
│       │   │   └── shared-services/ # 7 shared services (email, file-storage,
│       │   │                        #   ip-geo, sms, streaming-asr, system-health, uploader)
│       │   └── domain/             # Domain (business-specific)
│       │       ├── auth/           # Authentication / identity
│       │       └── services/       # Business services
│       └── prisma/                 # Schema (38 models), migrations, seed
│
├── packages/                       # 7 shared packages (frontend + backend)
│   ├── contracts/                  # @repo/contracts — ts-rest contracts + Zod schemas
│   ├── ui/                         # @repo/ui — shadcn/ui components
│   ├── utils/                      # @repo/utils — Utility functions
│   ├── validators/                 # @repo/validators — Zod validators
│   ├── constants/                  # @repo/constants — Shared constants
│   ├── types/                      # @repo/types — Type definitions
│   └── config/                     # @repo/config — ESLint, Prettier, TS config
│
├── docs/                           # Documentation
│   ├── ARCHITECTURE.md             # Architecture & design (routing, protocol, BotType)
│   ├── DEVELOPMENT.md              # Implementation & development guide
│   └── GUIDE.md                    # User guide (Feishu, OpenClaw config, Skills)
└── scripts/                        # Init and ops scripts
```

---

## ✨ Core Features

- **Bot Lifecycle** — Create, start, stop, delete; Docker containers + workspace (config.json, soul.md, features.json)
- **Provider Key Management** — AES-256-GCM encrypted storage, tag routing, round-robin, custom baseUrl
- **Model Routing System** — Capability tags, fallback chains, cost strategies, complexity routing, load balancing, routing statistics
- **AI Request Proxy** — `/v1/:vendor/*` unified entry for 63 providers, Bot Token auth, streaming response (SSE)
- **Plugin System (MCP)** — Preset plugins (search, file, database, dev tools, etc.), region filtering, one-click install to Bot
- **Skill System** — Custom tools, prompt templates, workflows, skill installation and configuration, OpenClaw sync
- **Channel System** — 10 channel definitions, locale-based recommendations, credential management
- **Zero-trust Mode** — Bot containers never touch API keys; proxy layer injects keys at runtime
- **Quota Management** — Daily/monthly token limits, threshold warnings, over-quota notifications
- **Bot Usage Analytics** — Token usage tracking, routing statistics, analytics dashboard
- **Template System** — Persona templates (system/user), Bot creation wizard
- **Message Center** — User messaging, notifications
- **Diagnostics & Ops** — Container stats, orphan resource detection and cleanup, startup reconciliation
- **Audit Logs** — Operation logging (CREATE, START, STOP, DELETE)
- **Multi-tenant** — User-isolated Bots and Keys, JWT authentication
- **Internationalization** — Chinese and English support (next-intl)

---

## 🌐 Supported AI Providers (63)

| Category | Providers |
| --- | --- |
| **International** | OpenAI, Anthropic, Google Gemini, Azure OpenAI, AWS Bedrock, Vertex AI, Mistral, Groq, Together, Fireworks, Perplexity, Grok (xAI), NVIDIA NIM, Hyperbolic, Cerebras, Hugging Face, GitHub Models, GitHub Copilot, Cohere, AI21, Replicate |
| **Domestic (China)** | DeepSeek, ZhiPu, Moonshot/Kimi, Baichuan, DashScope/Tongyi, StepFun, Doubao, MiniMax, Yi, Hunyuan, Tencent Cloud TI, Baidu Cloud, Infini, ModelScope, XiRang, MiMo |
| **Aggregator** | OpenRouter, SiliconFlow, AiHubMix, 302.AI, TokenFlux, Poe, Venice, ocoolAI, DMXAPI, BurnCloud, Cephalon, LANYUN, PH8, Qiniu, PPIO, AlayaNew, AIOnly, LongCat, SophNet, Vercel AI Gateway |
| **Local/Self-hosted** | Ollama, LM Studio, GPUStack, OpenVINO Model Server, New API |
| **Custom** | Any OpenAI-compatible endpoint |

---

## 📱 Supported Channels

| Channel | ID | Recommended For | Credentials Required |
| --- | --- | --- | --- |
| **Feishu/Lark** | `feishu` | 🇨🇳 Chinese, 🌍 English | App ID, App Secret |
| **Telegram** | `telegram` | 🌍 English | Bot Token |
| **Slack** | `slack` | 🌍 English | Bot Token, App Token, Signing Secret |
| **WeChat** | `wechat` | 🇨🇳 Chinese, 🌍 English | App ID, App Secret, Token, Encoding AES Key |
| **Discord** | `discord` | — | Bot Token, Application ID |
| **WhatsApp** | `whatsapp` | — | Access Token, Phone Number ID, Business Account ID |
| **Twitter/X** | `twitter` | — | API Key, API Secret, Access Token, Access Token Secret |
| **Instagram** | `instagram` | — | Access Token, App Secret |
| **Microsoft Teams** | `teams` | — | App ID, App Password, Tenant ID |
| **LINE** | `line` | — | Channel Access Token, Channel Secret |

---

## 🚀 Quick Start

### 1. Requirements

- Node.js >= 18
- pnpm >= 9
- PostgreSQL, Redis, RabbitMQ
- Docker (for Bot containers)

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Initialize Secrets (Required for First Run)

```bash
./scripts/init-env-secrets.sh
```

Generates `BOT_MASTER_KEY` and writes to `secrets/` and `apps/api/.env`.

### 4. Configure Environment Variables

**Backend** `apps/api/.env`:

```env
# Required
DATABASE_URL=postgresql://user:password@localhost:5432/clawbotmanager?schema=public
REDIS_URL=redis://localhost:6379
RABBITMQ_URL=amqp://localhost:5672

# Optional (with defaults)
READ_DATABASE_URL=postgresql://user:password@localhost:5432/clawbotmanager?schema=public
BOT_MASTER_KEY=<generated by init-env-secrets.sh>
```

**Frontend** `apps/web/.env.local`:

```env
NEXT_PUBLIC_SERVER_BASE_URL=http://localhost:3100
```

### 5. Database

```bash
pnpm db:generate
pnpm db:migrate:dev
pnpm db:seed          # Seed default data
```

### 6. Start

```bash
pnpm dev              # All apps
pnpm dev:web          # Frontend only
pnpm dev:api          # Backend only
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:3100/api

---

## 🔧 Environment Variables

### Backend (`apps/api/.env`)

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | PostgreSQL connection string (write) |
| `REDIS_URL` | ✅ | Redis connection string |
| `RABBITMQ_URL` | ✅ | RabbitMQ connection string |
| `READ_DATABASE_URL` | — | PostgreSQL read replica (defaults to DATABASE_URL) |
| `BOT_MASTER_KEY` | — | Master key for API key encryption (auto-generated) |
| `BOT_IMAGE_GATEWAY` | — | Docker image for GATEWAY bot type (default: `openclaw:local`) |
| `BOT_IMAGE_TOOL_SANDBOX` | — | Docker image for TOOL_SANDBOX bot type (default: `openclaw-sandbox:bookworm-slim`) |
| `BOT_IMAGE_BROWSER_SANDBOX` | — | Docker image for BROWSER_SANDBOX bot type (default: `openclaw-sandbox-browser:bookworm-slim`) |
| `OPENCLAW_SRC_PATH` | — | OpenClaw source path for building images (default: `../openclaw`) |
| `BOT_PORT_START` | — | Starting port for Bot containers (default: `9200`) |
| `BOT_DATA_DIR` | — | Bot data directory (default: `/data/bots`) |
| `BOT_SECRETS_DIR` | — | Bot secrets directory (default: `/data/secrets`) |
| `ZERO_TRUST_MODE` | — | Enable zero-trust mode (default: `false`) |
| `PROXY_TOKEN_TTL` | — | Proxy token TTL in seconds (default: `86400`) |

> JWT configuration (`secret`, `expireIn`) is in `config.local.yaml`, not environment variables.

### Frontend (`apps/web/.env.local`)

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_SERVER_BASE_URL` | ✅ | Backend API base URL |
| `NEXT_PUBLIC_API_BASE_URL` | — | API base URL (defaults to server URL + `/api`) |

---

## 🐳 Docker Deployment

### Development Deployment

```bash
./scripts/start-clawbot.sh
```

Uses `docker-compose.yml` to start API and Web services. After health check passes:
- Frontend: http://localhost:13000
- API: http://localhost:13100/api

> AI proxy functionality (keyring-proxy) is integrated into the API service, available via `/api/v1/:vendor/*` endpoints.

### Production Deployment

For production deployment with security enhancements and resource limits, see [单机多Bot架构部署方案.md](./docs/单机多Bot架构部署方案.md).

Key features of production deployment:
- **Docker Socket Proxy** — Restricts Docker API access for security
- **Container Resource Limits** — CPU and memory limits per Bot container
- **External Services** — PostgreSQL and Redis as external services
- **Network Isolation** — Separate internal and external networks

```bash
# Quick production commands
pnpm prod:up      # Start services
pnpm prod:ps      # Check status
pnpm prod:logs    # View logs
pnpm prod:down    # Stop services
```

---

## 📡 API Overview

### Bot (JWT Required)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/bot` | List current user's Bots |
| POST | `/api/bot` | Create Bot |
| GET | `/api/bot/:hostname` | Get single Bot |
| POST | `/api/bot/:hostname/start` | Start |
| POST | `/api/bot/:hostname/stop` | Stop |
| DELETE | `/api/bot/:hostname` | Delete |
| GET | `/api/bot/stats` | Container stats |
| GET | `/api/bot/admin/orphans` | Orphan resources |
| POST | `/api/bot/admin/cleanup` | Cleanup orphans |

### Provider Key (JWT Required)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/provider-key` | List API Keys |
| POST | `/api/provider-key` | Add Key |
| DELETE | `/api/provider-key/:id` | Delete Key |
| GET | `/api/provider-key/health` | Health check |

### Plugin (JWT Required)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/plugin` | List all plugins |
| GET | `/api/plugin/:id` | Get plugin details |
| GET | `/api/bot/:hostname/plugins` | Get Bot's installed plugins |
| POST | `/api/bot/:hostname/plugins` | Install plugin to Bot |
| DELETE | `/api/bot/:hostname/plugins/:id` | Uninstall plugin from Bot |

### Skill (JWT Required)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/skill` | List all skills |
| GET | `/api/skill/:id` | Get skill details |
| POST | `/api/skill` | Create custom skill |
| PUT | `/api/skill/:id` | Update skill |
| DELETE | `/api/skill/:id` | Delete skill |
| GET | `/api/bot/:hostname/skills` | Get Bot's installed skills |
| POST | `/api/bot/:hostname/skills` | Install skill to Bot |
| PUT | `/api/bot/:hostname/skills/:id` | Update skill config |
| DELETE | `/api/bot/:hostname/skills/:id` | Uninstall skill from Bot |

### Model Routing (JWT Required)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/bot/:hostname/routing` | Get Bot's routing config |
| PUT | `/api/bot/:hostname/routing` | Update routing config |
| GET | `/api/routing/capability-tags` | List capability tags |
| GET | `/api/routing/fallback-chains` | List fallback chains |
| GET | `/api/routing/cost-strategies` | List cost strategies |
| GET | `/api/routing/statistics` | Get routing statistics |

### Channel (JWT Required)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/channel` | List all channel definitions |
| GET | `/api/channel/:id` | Get channel definition details |
| GET | `/api/bot/:hostname/channels` | Get Bot's configured channels |
| POST | `/api/bot/:hostname/channels` | Add channel to Bot |
| PUT | `/api/bot/:hostname/channels/:id` | Update channel config |
| DELETE | `/api/bot/:hostname/channels/:id` | Delete channel |
| POST | `/api/bot/:hostname/channels/:id/connection` | Connect/disconnect channel |

### Message (JWT Required)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/message/messages` | List user messages |
| PATCH | `/api/message/messages/read` | Set messages as read |
| PATCH | `/api/message/messages/read/all` | Mark all as read |
| GET | `/api/message/messages/unread/count` | Get unread count |

### AI Proxy (Bearer Bot Token)

| Method | Path | Description |
| --- | --- | --- |
| ALL | `/api/v1/:vendor/*` | Forward to corresponding AI provider |

---

## 👨‍💻 Development Guide

### Commands

```bash
pnpm install              # Install dependencies
pnpm dev                  # Development (all apps)
pnpm dev:web              # Frontend only
pnpm dev:api              # Backend only
pnpm build                # Build all
pnpm lint                 # Lint
pnpm type-check           # Type check
pnpm test                 # Test
pnpm db:generate          # Generate Prisma Client
pnpm db:migrate:dev       # Development migration
pnpm db:migrate:deploy    # Production migration
pnpm db:push              # Push schema without migration
pnpm db:seed              # Seed database
```

### Adding New Features

1. **Define API Contract** in `packages/contracts/src/api/`
2. **Implement Backend** — `cd apps/api && npx nest g module <name> src/modules`
3. **Consume in Frontend** — Use ts-rest React Query hooks

### Code Standards

- TypeScript strict mode
- Zod 4 for all validation (not Zod 3)
- Winston Logger (never `console.log`)
- Layered architecture: API → Service → DB/Client
- infra and domain layers kept separate

---

## 🔄 Initialization & Startup Flow

### One-time Setup Scripts

For first-time deployment or new environment setup, execute in order:

```bash
# 1. Install dependencies
pnpm install

# 2. Generate encryption master key (BOT_MASTER_KEY)
./scripts/init-env-secrets.sh

# 3. (Optional) Interactive project initialization wizard
node scripts/init-project.js

# 4. Generate Prisma Client
pnpm db:generate

# 5. Run database migrations
pnpm db:migrate:dev

# 6. Seed database
pnpm db:seed
```

### Seed Data Order (`pnpm db:seed`)

Seed data is executed sequentially as defined in `apps/api/prisma/seed.ts`:

| Order | Data | Data File | Description |
| --- | --- | --- | --- |
| 1 | Persona Templates | `scripts/persona-templates.data.ts` | System preset persona templates (en/zh) |
| 2 | Country Codes | `scripts/country-codes.data.ts` | Country/region codes (full replace) |
| 3 | Channel Definitions | `scripts/channel-definitions.data.ts` | 10 channel definitions + credential fields |
| 4 | Plugins | `scripts/plugin-definitions.data.ts` | MCP plugin definitions (by region) |
| 5 | Model Catalog | `scripts/model-catalog.data.ts` | AI model pricing & capability scores |
| 6 | Capability Tags | `scripts/capability-tags.data.ts` | Routing capability tags (25 tags) |
| 7 | Fallback Chains | `scripts/fallback-chains.data.ts` | Model fallback strategies (14 chains) |
| 8 | Cost Strategies | `scripts/cost-strategies.data.ts` | Cost optimization strategies (13 strategies) |

### NestJS Backend Startup Flow

When `pnpm dev:api` starts, the following phases execute:

**Phase 1: Environment & Configuration**

1. `loadEnv()` — Load `.env` files (monorepo root → `apps/api/.env` → `.env.{NODE_ENV}`)
2. `initConfig()` — Load YAML config files (`config.local.yaml`, etc.)
3. `initKeysConfig()` — Load encryption key configuration

**Phase 2: Fastify Server Setup**

4. Create Fastify adapter
5. Register plugins: `helmet` → `compress` → `SSE` → `multipart` → `rate-limit` → `cookie`
6. CORS configuration
7. Global prefix `/api`
8. API versioning (Header mode: `x-api-version`)
9. WebSocket adapter (Socket.IO)
10. Swagger docs (non-production)
11. Global pipes (ValidationPipe), guards (VersionGuard), interceptors (TransformInterceptor, VersionHeaderInterceptor)

**Phase 3: NestJS Module Initialization** (`OnModuleInit` lifecycle hooks)

NestJS initializes modules by dependency order. Each service's `onModuleInit()` fires in this hierarchy:

```
Infrastructure Layer (infra)
├── PrismaWriteService      — Connect to write database (PostgreSQL + PrismaPg)
├── PrismaReadService       — Connect to read database (fallback to write DB)
├── DbMetricsService        — Load DB metrics config (slow query thresholds)
├── RabbitmqService         — Connect to RabbitMQ + auto-reconnect
├── FeatureFlagService      — Initialize feature flags (memory/Redis/Unleash)
├── RateLimitService        — Load rate limiting config
├── AppVersionService       — Load version info (package.json + Git hash)
├── OpenAIClient            — Load OpenAI API config
├── EmailService            — Initialize email client (SendCloud)
└── SmsService              — Initialize SMS client (Aliyun/Tencent/Volcengine)

Application Layer
├── AppModule               — Set up transaction metrics service reference
├── DockerService           — Connect to Docker (ping verify, simulation fallback)
├── ConfigurationService    — Load routing configs (model catalog, capability tags,
│                             fallback chains, cost strategies) + periodic refresh (5min)
└── BotUsageAnalyticsService — Load model pricing cache for cost calculations

Startup Services
├── ReconciliationService   — Reconcile DB with Docker container state
│                             (disable via ENABLE_STARTUP_RECONCILIATION)
├── DockerEventService      — Start Docker event listener (2s delay)
└── BotChannelStartupService — Auto-reconnect enabled Feishu channels (max 3 retries)
```

**Phase 4: HTTP Listen**

12. Start HTTP server (default port 3100, listen on `0.0.0.0`)
13. Register graceful shutdown signal handlers (SIGTERM, SIGINT, SIGHUP)

### Init Scripts Reference

| Script | Purpose | When to Run |
| --- | --- | --- |
| `scripts/init-env-secrets.sh` | Generate `BOT_MASTER_KEY` (OpenSSL 64-char hex) | First deployment |
| `scripts/init-project.js` | Interactive project setup (name, ports, DB config) | First deployment (optional) |
| `scripts/start-clawbot.sh` | Docker Compose startup | Production deployment |
| `scripts/stop-clawbot.sh` | Docker Compose shutdown | Production ops |
| `scripts/generate-prisma-enums.ts` | Generate Prisma enum type definitions | After schema changes |
| `scripts/generate-i18n-errors.ts` | Generate i18n error messages | After error code changes |

---

## 🗺️ Roadmap

### Near-term

| Feature | Status |
| --- | --- |
| Channel Connectors (Feishu, Telegram, WeChat, etc.) | 🚧 In Progress |
| Analytics UI Dashboard | 📋 Backend Done |
| Notification UI | 📋 Backend Done |
| Webhook Handlers | 📋 Contract Defined |
| Permission System (RBAC) | 📋 To Design |
| Rate Limiting Verification | 📋 Config Exists |

### Mid-term

- More IM channels (WeCom, DingTalk, etc.)
- Prometheus/Grafana monitoring and alerts
- Latency and cost-based intelligent routing
- Team collaboration (spaces, member management)
- API usage analytics with cost analysis

### Long-term

- Multi-cluster deployment and cross-region scheduling
- Channel marketplace
- Template and Bot sharing marketplace

---

## 🔍 Troubleshooting

### Database Connection Failed

```bash
docker ps | grep postgres
psql $DATABASE_URL -c "SELECT 1"
```

### Docker Permission Denied

```bash
sudo usermod -aG docker $USER
sudo systemctl restart docker
```

### Port Already in Use

```bash
lsof -i :3000
kill -9 <PID>
```

### Prisma Client Out of Sync

```bash
pnpm db:generate
pnpm db:migrate:dev
```

### Bot Container Won't Start

1. Check Docker is running: `docker info`
2. Verify port range is available
3. Check workspace directory permissions
4. Review container logs: `docker logs <container_id>`

---

## 🔒 Security

- All API keys encrypted with **AES-256-GCM** before storage
- Keys decrypted only at runtime in the proxy layer
- Bot containers **never** have direct access to API keys (zero-trust)
- JWT-based authentication with configurable expiration
- Multiple login methods (email, mobile, OAuth)
- `BOT_MASTER_KEY` should be stored securely and rotated periodically

---

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Follow** the coding standards in `CLAUDE.md`
4. **Write** tests for new features
5. **Commit** with clear messages
6. **Open** a Pull Request

---

## 🙏 Acknowledgments

We sincerely thank [BotMaker](https://github.com/jgarzik/botmaker) for its zero-trust API key architecture, keyring-proxy design philosophy, and containerized Bot management approach, which provided important inspiration for this project.

---

## 📄 License

MIT License

---

<p align="center">
  Made with ❤️ by the ClawBotManager Team
  <br>
  <a href="https://github.com/xica-ai/clawbot-manager/issues">Report Bug</a>
  ·
  <a href="https://github.com/xica-ai/clawbot-manager/issues">Request Feature</a>
</p>
