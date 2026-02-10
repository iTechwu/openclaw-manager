# ClawBotManager

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11-red.svg)](https://nestjs.com/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

> AI Bot lifecycle management and API key orchestration platform, solving key security, request proxy, and operations challenges in multi-Bot, multi-provider scenarios.

[中文文档](./README.zh-CN.md) | [Demo](#-demo) | [Quick Start](#-quick-start) | [Documentation](#-documentation--standards)

## 🎬 Demo

<!-- Add screenshots or GIFs here -->
> Screenshots and demo videos coming soon. Star this repo to stay updated!

---

## 🆕 What's New

### v1.0.0 (2026-02)

- **Model Routing System**: Intelligent multi-model routing with capability tags, fallback chains, cost strategies, and load balancing
- **Skill Management System**: New SkillType model with upsert functionality and OpenClaw synchronization
- **Bot Usage Analytics**: Enhanced token usage tracking, routing statistics, and analytics dashboard
- **Bot Configuration Resolver**: Runtime configuration now derived from `BotProviderKey` and `BotChannel` tables for better data consistency
- **Zero-Trust Architecture**: Bot containers never touch API keys directly - all keys are injected at the proxy layer
- **10 Channel Integrations**: Support for Feishu, Telegram, Slack, WeChat, Discord, WhatsApp, X, Instagram, Teams, and LINE
- **22 MCP Plugins**: Pre-built plugins for search, file operations, database access, and development tools
- **Skill System**: Custom tools, prompt templates, and workflows with one-click installation to Bots
- **Notification System**: Backend quota notifications with real-time alerts

---

## 📋 Table of Contents

- [Demo](#-demo)
- [What's New](#-whats-new)
- [Project Overview](#-project-overview)
- [Project Status](#-project-status)
- [Tech Stack](#-tech-stack)
- [Architecture](#️-architecture)
- [Core Features](#-core-features)
- [Supported Channels](#-supported-channels)
- [Quick Start](#-quick-start)
- [Environment Variables](#-environment-variables)
- [Docker Deployment](#-docker-deployment)
- [API Overview](#-api-overview)
- [Development Guide](#-development-guide)
- [Roadmap](#️-roadmap)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [License](#-license)

---

## 📌 Project Overview

### Purpose & Goals

ClawBotManager is designed for **teams and developers who need to deploy and manage multiple AI Bots**, providing:

- **Bot Lifecycle Management**: Create, start, stop, delete - containerized with Docker
- **API Key Security Orchestration**: Encrypted storage, tag-based routing, round-robin load balancing
- **Unified AI Request Proxy**: Single entry point for multiple AI providers, authenticated via Bot Token
- **Multi-tenant Isolation**: User-based Bot and key separation, supporting team collaboration

### Problems Solved

| Pain Point | Solution |
| --- | --- |
| API Keys scattered and prone to leakage in multi-Bot scenarios | Centralized encrypted storage (AES-256-GCM), unified access via Bot Token |
| Complex integration with multiple AI providers (OpenAI, Anthropic, Google, etc.) | Unified `/v1/:vendor/*` proxy with automatic authentication and forwarding |
| Bot-to-key mapping, quotas, failover | Provider Key tag routing + round-robin |
| Container and database state inconsistency | Reconciliation, orphan resource detection and cleanup |

### Target Users

- Product/development teams running multiple AI Bots
- Developers wanting unified management of OpenAI, Anthropic, DeepSeek API keys
- Operations teams needing Bot and API call auditing and usage logs

---

## 🧩 Project Status

**Current Stage: MVP / Production Ready**

### Completed ✅

- **Core Capabilities**: Bot CRUD, Provider Key management, AI proxy, Docker container orchestration
- **Model Routing System**: Capability tags, fallback chains, cost strategies, load balancing, routing statistics
- **Plugin System**: MCP plugin management, 22 preset plugins (search, file, database, dev tools, etc.), region filtering
- **Skill System**: Custom tools, prompt templates, workflows, skill installation to Bots, OpenClaw synchronization
- **Channel System**: 10 channel definitions (Feishu, Telegram, Slack, WeChat, Discord, WhatsApp, X, Instagram, Teams, LINE), credential management, locale-based recommendations
- **Infrastructure**: User authentication, multiple login methods, file upload, SMS, i18n (Chinese/English)
- **Diagnostics & Ops**: Container stats, orphan resource detection and cleanup, startup reconciliation
- **Security**: Zero-trust proxy mode (Bot containers don't touch API keys), AES-256-GCM encryption
- **Quota Management**: Daily/monthly token limits, 80% threshold warnings, over-quota notifications
- **Template System**: Persona templates (system + user), 5-step creation wizard
- **Audit Logs**: Operation logging (CREATE, START, STOP, DELETE)
- **Bot Usage Analytics**: Token usage tracking, routing statistics, analytics dashboard
- **Notification System**: Backend quota notifications implemented

### Pending ⏳

- **Channel Connectors**: Actual message send/receive connectors for Feishu, Telegram, WeChat, etc.
- **Analytics UI**: Backend analytics implemented, frontend dashboard pending
- **Notification UI**: Backend quota notifications implemented, frontend UI pending
- **Webhook Handlers**: Contract defined, handlers pending
- **Permission System**: Fine-grained access control pending
- **Rate Limiting**: Configuration exists, implementation verification pending

### Production Deployment Notes ⚠️

- Key backup strategy
- High availability deployment plan
- Resource rate limiting configuration

---

## 🛠️ Tech Stack

### Frontend
| Technology | Version | Purpose |
| --- | --- | --- |
| Next.js | 16 | React framework with App Router |
| React | 19 | UI library |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 4 | Styling |
| shadcn/ui | Latest | UI components |
| TanStack Query | 5.x | Server state management |
| ts-rest | 3.53.x | Type-safe API client |
| next-intl | Latest | Internationalization |

### Backend
| Technology | Version | Purpose |
| --- | --- | --- |
| NestJS | 11 | Node.js framework |
| Fastify | 5.x | HTTP server |
| Prisma | 7.x | ORM |
| PostgreSQL | 14+ | Primary database |
| Redis | 7+ | Caching & queues |
| BullMQ | Latest | Job queue |
| Zod | 4.x | Schema validation |
| ts-rest | 3.53.x | API contracts |

### Infrastructure
| Technology | Purpose |
| --- | --- |
| Docker | Bot containerization |
| RabbitMQ | Message queue |
| Winston | Logging |
| Passport | Authentication (JWT, OAuth2) |

---

## 🏗️ Architecture

### Design Principles

1. **Layered Architecture**: API Layer → Service Layer → DB Layer / Client Layer, strict no cross-layer access
2. **Zod-first**: All API requests/responses validated via Zod Schema, type-safe
3. **Contract-driven**: ts-rest defines frontend-backend contracts, compile-time types + runtime validation
4. **infra / domain boundary**: infra doesn't depend on domain, domain can depend on infra, enabling reuse and testing
5. **Zero plaintext keys**: API keys encrypted with AES-256-GCM, decrypted only at runtime

### Overall Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            ClawBotManager                                │
├─────────────────────────────────────────────────────────────────────────┤
│  Web (Next.js 16)          │  API (NestJS 11 + Fastify)                 │
│  - Bot Management/Wizard   │  - Bot API (CRUD, lifecycle)               │
│  - Provider Key Management │  - Proxy (/v1/:vendor/* proxy)             │
│  - Diagnostics & Ops       │  - Sign / SMS / Uploader                   │
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
            │  OpenAI           │                   │  Anthropic        │
            │  DeepSeek / Groq  │   ...             │  Google / Venice  │
            └───────────────────┘                   └───────────────────┘
```

### Data Flow (Simplified)

1. **Create Bot**: User fills config → Assign port → Create Workspace (config.json, soul.md, features.json) → Start Docker container → Write to DB, generate Gateway Token
2. **Proxy Request**: Client with `Authorization: Bearer <gateway_token>` accesses `/api/v1/openai/...` → Validate Token → Select Provider Key (tag + round-robin) → Decrypt key → Forward to upstream API → Log to BotUsageLog
3. **Key Management**: User adds Provider Key → AES-256-GCM encrypt → Write to ProviderKey table, supports tag, baseUrl, etc.

### Directory Structure

```
clawbotmanager/
├── apps/
│   ├── web/                    # Next.js 16 Frontend
│   │   ├── app/[locale]/       # Routes
│   │   │   ├── (auth)/         # Auth route group
│   │   │   └── (main)/         # Main route group (authenticated)
│   │   │       ├── bots/       # Bot management
│   │   │       ├── diagnostics/# Container diagnostics
│   │   │       ├── plugins/    # Plugin management
│   │   │       ├── routing/    # Model routing config
│   │   │       ├── secrets/    # API key management
│   │   │       ├── settings/   # Settings
│   │   │       ├── skills/     # Skill management
│   │   │       └── templates/  # Persona templates
│   │   ├── components/         # Common components
│   │   ├── hooks/              # React Hooks
│   │   └── lib/                # API client, config
│   │
│   └── api/                    # NestJS 11 Backend
│       ├── src/modules/        # Feature modules (15 modules)
│       │   ├── bot-api/        # Bot CRUD, Provider Key, Docker, Workspace
│       │   ├── bot-channel-api/# Bot channel management
│       │   ├── channel-api/    # Channel definitions
│       │   ├── message-api/    # Messaging system
│       │   ├── operate-log-api/# Operation audit logs
│       │   ├── persona-template-api/ # Persona templates
│       │   ├── plugin-api/     # MCP plugin management
│       │   ├── proxy/          # AI request proxy, Keyring, Upstream
│       │   ├── sign-api/       # Login/register
│       │   ├── skill-api/      # Skill management
│       │   ├── skill-sync/     # Skill synchronization
│       │   ├── sms-api/        # SMS
│       │   ├── sse-api/        # Server-sent events
│       │   ├── uploader/       # File upload
│       │   └── user-api/       # User management
│       ├── libs/
│       │   ├── infra/          # Infrastructure (prisma, redis, jwt, clients…)
│       │   │   ├── common/     # Decorators, interceptors, pipes
│       │   │   ├── clients/    # Third-party API clients (18 clients)
│       │   │   ├── prisma/     # DB connection, read/write split
│       │   │   ├── redis/      # Cache
│       │   │   ├── rabbitmq/   # Message queue
│       │   │   ├── jwt/        # JWT authentication
│       │   │   ├── utils/      # Pure utilities
│       │   │   ├── i18n/       # Internationalization
│       │   │   ├── shared-db/  # TransactionalServiceBase, UnitOfWork
│       │   │   └── shared-services/ # Shared services (7 services)
│       │   └── domain/         # Domain (auth, services)
│       └── prisma/             # Schema (33 models), migrations
│
├── packages/                   # Shared packages (7 packages)
│   ├── contracts/              # ts-rest contracts + Zod Schema (25 contracts)
│   ├── ui/                     # shadcn/ui components
│   ├── utils/                  # Utility functions
│   ├── validators/             # Zod validators
│   ├── constants/              # Constants
│   ├── types/                  # Type definitions
│   └── config/                 # ESLint, Prettier, TS config
│
├── docs/                       # Documentation
└── scripts/                    # Init and ops scripts
```

### Supported AI Providers

| Category | Vendor | Description |
| ---- | ------ | ---- |
| **Mainstream** | `openai` | OpenAI API |
| | `anthropic` | Anthropic Claude |
| | `google` | Google Generative AI |
| | `deepseek` | DeepSeek API |
| | `groq` | Groq API |
| **Cloud Services** | `azure-openai` | Azure OpenAI |
| | `mistral` | Mistral AI |
| | `openrouter` | OpenRouter |
| | `together` | Together AI |
| | `fireworks` | Fireworks AI |
| | `perplexity` | Perplexity AI |
| | `cohere` | Cohere |
| **China** | `zhipu` | Zhipu AI |
| | `moonshot` | Moonshot AI |
| | `baichuan` | Baichuan AI |
| | `dashscope` | Alibaba Tongyi |
| | `stepfun` | StepFun |
| | `doubao` | ByteDance Doubao |
| | `minimax` | MiniMax |
| | `yi` | 01.AI |
| | `hunyuan` | Tencent Hunyuan |
| | `siliconflow` | SiliconFlow |
| **Other** | `venice` | Venice AI |
| | `ollama` | Ollama (local) |
| | `custom` | Custom endpoint |

---

## ✨ Core Features

- **Bot Lifecycle**: Create, start, stop, delete - Docker containers + workspace (config.json, soul.md, features.json)
- **Provider Key Management**: Encrypted storage (AES-256-GCM), tag routing, round-robin, custom baseUrl
- **Model Routing System**: Capability tags, fallback chains, cost strategies, load balancing, routing statistics
- **AI Request Proxy**: `/v1/:vendor/*` unified entry, Bot Token auth, streaming response (SSE)
- **Plugin System (MCP)**: 22 preset plugins (search, file, database, dev tools, etc.), region filtering, one-click install to Bot
- **Skill System**: Custom tools, prompt templates, workflows, skill installation and configuration, OpenClaw sync
- **Channel System**: 10 channel definitions, locale-based recommendations, credential management
- **Zero-trust Mode**: Bot containers don't touch API keys, proxy layer injects keys
- **Quota Management**: Daily/monthly token limits, threshold warnings, over-quota notifications
- **Bot Usage Analytics**: Token usage tracking, routing statistics, analytics dashboard
- **Template System**: Persona templates (system/user), 5-step creation wizard
- **Diagnostics & Ops**: Container stats, orphan resource detection and cleanup, startup reconciliation
- **Audit Logs**: Operation logging, compliance audit support
- **Multi-tenant**: User-isolated Bots and Keys, JWT authentication
- **Internationalization**: Chinese and English support

---

## 📱 Supported Channels

ClawBotManager supports 10 messaging channels with locale-based recommendations:

| Channel | ID | Recommended For | Credentials Required |
| --- | --- | --- | --- |
| **Feishu/Lark** | `feishu` | 🇨🇳 Chinese, 🌍 English | App ID, App Secret |
| **Telegram** | `telegram` | 🌍 English | Bot Token |
| **Slack** | `slack` | 🌍 English | Bot Token, App Token, Signing Secret |
| **WeChat** | `wechat` | 🇨🇳 Chinese, 🌍 English | App ID, App Secret, Token, Encoding AES Key |
| **Discord** | `discord` | - | Bot Token, Application ID |
| **WhatsApp** | `whatsapp` | - | Access Token, Phone Number ID, Business Account ID |
| **Twitter/X** | `twitter` | - | API Key, API Secret, Access Token, Access Token Secret |
| **Instagram** | `instagram` | - | Access Token, App Secret |
| **Microsoft Teams** | `teams` | - | App ID, App Password, Tenant ID |
| **LINE** | `line` | - | Channel Access Token, Channel Secret |

> **Note**: Channel definitions are stored in the database and can be customized. The `popularLocales` field determines which channels are recommended for each locale.

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
# Seed default data from project root
pnpm db:seed:api
```

### 6. Start

```bash
pnpm dev          # All
pnpm dev:web      # Frontend only
pnpm dev:api      # Backend only
```

- Frontend: <http://localhost:3000>
- Backend API: <http://localhost:3100/api>

---

## 🔧 Environment Variables

### Backend (`apps/api/.env`)

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | PostgreSQL connection string (write) |
| `REDIS_URL` | ✅ | Redis connection string |
| `RABBITMQ_URL` | ✅ | RabbitMQ connection string |
| `READ_DATABASE_URL` | ❌ | PostgreSQL read replica (defaults to DATABASE_URL) |
| `BOT_MASTER_KEY` | ❌ | Master key for API key encryption (auto-generated if not set) |
| `BOT_IMAGE` | ❌ | Docker image for Bot containers (default: `openclaw:latest`) |
| `BOT_PORT_START` | ❌ | Starting port for Bot containers (default: `9200`) |
| `BOT_DATA_DIR` | ❌ | Bot data directory (default: `/data/bots`) |
| `BOT_SECRETS_DIR` | ❌ | Bot secrets directory (default: `/data/secrets`) |
| `ZERO_TRUST_MODE` | ❌ | Enable zero-trust mode (default: `false`) |
| `PROXY_TOKEN_TTL` | ❌ | Proxy token TTL in seconds (default: `86400`) |

> **Note**: JWT configuration (`secret`, `expireIn`) is in `config.local.yaml`, not environment variables.

### Frontend (`apps/web/.env.local`)

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_SERVER_BASE_URL` | ✅ | Backend API base URL |
| `NEXT_PUBLIC_API_BASE_URL` | ❌ | API base URL (defaults to server URL + `/api`) |

---

## 🐳 Docker Deployment

```bash
./scripts/start-clawbot.sh
```

Uses `docker-compose.yml`, starts API and Web services. After health check passes:
- Frontend: <http://localhost:13000>
- API: <http://localhost:13100/api>

> Note: AI proxy functionality (keyring-proxy) is integrated into the API service, available via `/api/v1/:vendor/*` endpoints.

---

## 📡 API Overview

### Bot (JWT Required)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET    | `/api/bot` | List current user's Bots |
| POST   | `/api/bot` | Create Bot |
| GET    | `/api/bot/:hostname` | Get single Bot |
| POST   | `/api/bot/:hostname/start` | Start |
| POST   | `/api/bot/:hostname/stop` | Stop |
| DELETE | `/api/bot/:hostname` | Delete |
| GET    | `/api/bot/stats` | Container stats |
| GET    | `/api/bot/admin/orphans` | Orphan resources |
| POST   | `/api/bot/admin/cleanup` | Cleanup orphans |

### Provider Key (JWT Required)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET    | `/api/provider-key` | List API Keys |
| POST   | `/api/provider-key` | Add Key |
| DELETE | `/api/provider-key/:id` | Delete Key |
| GET    | `/api/provider-key/health` | Health check |

### Plugin (JWT Required)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET    | `/api/plugin` | List all plugins |
| GET    | `/api/plugin/:id` | Get plugin details |
| GET    | `/api/bot/:hostname/plugins` | Get Bot's installed plugins |
| POST   | `/api/bot/:hostname/plugins` | Install plugin to Bot |
| DELETE | `/api/bot/:hostname/plugins/:id` | Uninstall plugin from Bot |

### Skill (JWT Required)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET    | `/api/skill` | List all skills |
| GET    | `/api/skill/:id` | Get skill details |
| POST   | `/api/skill` | Create custom skill |
| PUT    | `/api/skill/:id` | Update skill |
| DELETE | `/api/skill/:id` | Delete skill |
| GET    | `/api/bot/:hostname/skills` | Get Bot's installed skills |
| POST   | `/api/bot/:hostname/skills` | Install skill to Bot |
| PUT    | `/api/bot/:hostname/skills/:id` | Update skill config |
| DELETE | `/api/bot/:hostname/skills/:id` | Uninstall skill from Bot |

### Model Routing (JWT Required)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET    | `/api/bot/:hostname/routing` | Get Bot's routing config |
| PUT    | `/api/bot/:hostname/routing` | Update routing config |
| GET    | `/api/routing/capability-tags` | List capability tags |
| GET    | `/api/routing/fallback-chains` | List fallback chains |
| GET    | `/api/routing/cost-strategies` | List cost strategies |
| GET    | `/api/routing/statistics` | Get routing statistics |

### Channel (JWT Required)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET    | `/api/channel` | List all channel definitions |
| GET    | `/api/channel/:id` | Get channel definition details |
| GET    | `/api/bot/:hostname/channels` | Get Bot's configured channels |
| POST   | `/api/bot/:hostname/channels` | Add channel to Bot |
| PUT    | `/api/bot/:hostname/channels/:id` | Update channel config |
| DELETE | `/api/bot/:hostname/channels/:id` | Delete channel |
| POST   | `/api/bot/:hostname/channels/:id/connection` | Connect/disconnect channel |

### AI Proxy (Bearer Bot Token)

| Method | Path | Description |
| ---- | ---- | ----------- |
| ALL  | `/api/v1/:vendor/*` | Forward to corresponding AI provider (openai, anthropic, etc.) |

More examples in `https/rest-client.http`.

---

## 👨‍💻 Development Guide

### Project Structure

This is a **pnpm monorepo** managed with **Turborepo**:

```bash
# Install dependencies
pnpm install

# Development (all apps)
pnpm dev

# Development (specific apps)
pnpm dev:web          # Next.js frontend only
pnpm dev:api          # NestJS backend only

# Build
pnpm build
pnpm build:web        # Build web only
pnpm build:api        # Build api only

# Lint & Type Check
pnpm lint
pnpm type-check

# Test
pnpm test
pnpm test:api
```

### Adding New Features

#### 1. Define API Contract (packages/contracts)

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

#### 2. Implement Backend (apps/api)

```bash
# Generate NestJS module
cd apps/api
npx nest g module example src/modules
npx nest g controller example src/modules
npx nest g service example src/modules
```

#### 3. Consume in Frontend (apps/web)

```typescript
// Use ts-rest React Query hooks
const { data } = exampleApi.list.useQuery(['example'], {});
```

### Database Operations

```bash
# Generate Prisma Client after schema changes
pnpm db:generate

# Create migration
pnpm db:migrate:dev --name <migration_name>

# Apply migrations (production)
pnpm db:migrate:deploy

# Push schema without migration
pnpm db:push

# Seed database
pnpm db:seed:api
```

### Code Style

- **TypeScript**: Strict mode enabled
- **ESLint**: Configured in `packages/config`
- **Prettier**: Auto-formatting
- **Zod 4**: For all validation (NOT Zod 3)
- **Winston Logger**: Use instead of `console.log`

---

## 🗺️ Roadmap

### Near-term Goals

| Feature | Status | Description |
| ---- | ---- | ---- |
| Channel Connectors | 🚧 In Progress | Implement message send/receive connectors for Feishu, Telegram, WeChat, etc. |
| Analytics Backend | 📋 Contract Defined | Implement `/analytics/track` endpoint, usage statistics |
| Notification UI | 📋 Backend Done | Complete frontend notification center, real-time push |
| Webhook Handlers | 📋 Contract Defined | Implement transcode, audio-transcribe callbacks |
| Permission System | 📋 To Design | Fine-grained access control (RBAC) |
| Rate Limiting | 📋 Config Exists | Verify and improve @fastify/rate-limit integration |

### Mid-term Goals

- **More IM Channels**: WeCom, DingTalk, Slack, Discord, etc.
- **Monitoring & Alerts**: Prometheus/Grafana integration, Bot health monitoring
- **Advanced Routing**: Latency and cost-based intelligent routing
- **Team Collaboration**: Team spaces, member management, permission assignment
- **API Usage Analytics**: Token consumption stats, cost analysis, trend charts

### Long-term Vision

- **Multi-cluster Deployment**: Cross-region Bot scheduling
- **Channel Marketplace**: More third-party channel integrations
- **Marketplace**: Template market, Bot sharing

---

## 📝 Common Commands

```bash
pnpm dev              # Development
pnpm build            # Build
pnpm db:generate      # Generate Prisma Client
pnpm db:migrate:dev   # Development migration
pnpm db:migrate:deploy # Production migration
pnpm db:push          # Push schema
pnpm lint             # Lint
pnpm type-check       # Type check
pnpm test             # Test
```

---

## 🔍 Troubleshooting

### Common Issues

#### Database Connection Failed

```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Verify connection string
psql $DATABASE_URL -c "SELECT 1"
```

#### Docker Permission Denied

```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Restart Docker daemon
sudo systemctl restart docker
```

#### Port Already in Use

```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>
```

#### Prisma Client Out of Sync

```bash
# Regenerate Prisma Client
pnpm db:generate

# If schema changed, create migration
pnpm db:migrate:dev
```

#### Bot Container Won't Start

1. Check Docker is running: `docker info`
2. Verify port range is available
3. Check workspace directory permissions
4. Review container logs: `docker logs <container_id>`

---

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Follow** the coding standards in `CLAUDE.md`
4. **Write** tests for new features
5. **Commit** with clear messages
6. **Push** to your fork
7. **Open** a Pull Request

### Development Standards

- Read `CLAUDE.md` for architecture guidelines
- Follow the layered architecture (API → Service → DB/Client)
- Use Zod schemas for all API validation
- Write Winston logs, not console.log
- Keep infra and domain layers separate

---

## 🙏 Acknowledgments & Project Origins

### Acknowledgments

We sincerely thank [BotMaker](https://github.com/jgarzik/botmaker), an excellent open-source project. BotMaker's zero-trust API key architecture, keyring-proxy design philosophy, and containerized Bot management approach provided important inspiration and reference for this project's design and implementation.

### Why ClawBotManager Still Exists

Before open-sourcing ClawBotManager, we had already implemented a similar multi-user, multi-team Bot management and API key orchestration system internally. At that time, we discovered the BotMaker project and borrowed many ideas and implementation details from it.

Although BotMaker already solves similar problems well, we decided to open-source ClawBotManager for the following reasons:

1. **Supplementary Capabilities**: During the AI-Native transformation of [psylos1.com](https://psylos1.com), we accumulated enterprise-grade capabilities like multi-tenancy, team collaboration, Provider Key tag routing and round-robin, Prisma + PostgreSQL, etc. We hope to provide the community with alternative technology choices and implementation paths.
2. **Giving Back**: BotMaker inspired our design. We hope to share our practical experience in multi-user, multi-team management scenarios through open-sourcing our implementation, providing more reference and help to teams with similar needs.
3. **Joint Progress**: AI Bot management and key orchestration is still a rapidly evolving field. We look forward to working with BotMaker and more open-source projects to provide the community with more choices and better solutions.

---

## 🔒 Security Considerations

### API Key Protection

- All API keys are encrypted with **AES-256-GCM** before storage
- Keys are only decrypted at runtime in the proxy layer
- Bot containers **never** have direct access to API keys (zero-trust)
- `BOT_MASTER_KEY` should be stored securely and backed up

### Authentication

- JWT-based authentication with configurable expiration
- Support for multiple login methods (email, mobile, OAuth)
- Token refresh mechanism for long-lived sessions

### Best Practices

1. **Never commit** `.env` files or secrets
2. **Rotate** `BOT_MASTER_KEY` periodically (requires re-encryption)
3. **Use** read replicas for database scaling
4. **Enable** rate limiting in production
5. **Monitor** audit logs for suspicious activity

---

## 📂 Documentation & Standards

- **Architecture & Standards**: `CLAUDE.md`, `.cursorrules`
- **API Contracts**: `packages/contracts/src/api/`
- **Backend Standards**: `apps/api/docs/` (if exists)
- **Frontend Standards**: `apps/web/docs/` (if exists)

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
