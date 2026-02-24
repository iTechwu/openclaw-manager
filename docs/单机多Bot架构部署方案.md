# 单机多 Bot 架构部署方案

本文档描述单机部署多 Bot 的完整架构方案，基于 OpenClaw 官方推荐的设计模式和 ClawBotManager 现有代码实现。

> **文档版本**: v4.1
> **更新日期**: 2026-02-24
> **变更说明**: PostgreSQL 和 Redis 改为外部服务，支持云托管或其他 docker-compose 部署
> **适用版本**: ClawBotManager v0.1.0+

---

## 一、OpenClaw 官方架构理解

### 1.1 核心概念澄清

> ⚠️ **重要**: 以下是基于 OpenClaw 官方文档的正确理解

#### Gateway 不是多实例设计

```
❌ 错误理解: 多个 Gateway 实例做负载均衡
✅ 正确理解: 一个 Gateway = 一个 Bot = 一个完整的 AI Agent 服务

Gateway 是集中式管理器，负责:
- WebSocket 认证与连接管理
- 会话路由与状态管理
- 频道连接（飞书、钉钉等）
- 技能(Skills)加载与调用
- Sandbox 容器的动态创建与管理

多个 Gateway 会导致冲突:
- 端口冲突
- 配置文件冲突
- 状态管理冲突
```

#### Sandbox 不是预先部署的"资源池"

```
❌ 错误理解: 预先部署 Sandbox 容器池，等待任务分配
✅ 正确理解: Sandbox 由 Gateway 动态创建，有三种模式

OpenClaw Sandbox 模式 (sandbox.mode 配置):
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  session (默认)              agent                  shared              │
│  ══════════════              ══════                 ═══════             │
│                                                                         │
│  ┌─────────────┐            ┌─────────────┐        ┌─────────────┐     │
│  │ Session 1   │            │ Agent A     │        │             │     │
│  │ Sandbox     │            │ Sandbox     │        │   Shared    │     │
│  └─────────────┘            └─────────────┘        │   Sandbox   │     │
│                                                                         │
│  ┌─────────────┐            ┌─────────────┐        │   (所有会话  │     │
│  │ Session 2   │            │ Agent B     │        │    共享)    │     │
│  │ Sandbox     │            │ Sandbox     │        │             │     │
│  └─────────────┘            └─────────────┘        └─────────────┘     │
│                                                                         │
│  每会话一容器               每代理一容器           所有会话共享容器     │
│  隔离性最高                 按代理隔离             资源占用最少         │
│  资源占用最大               中等                   隔离性最低           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 OpenClaw Docker 模式架构

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                         OpenClaw Docker 模式架构                                          │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│   │                          ClawBotManager API (NestJS)                              │   │
│   │                                                                                  │   │
│   │  职责:                                                                           │   │
│   │  - Gateway Bot 生命周期管理 (CRUD、启动、停止、删除)                               │   │
│   │  - Gateway Bot 配置管理 (Provider Key、Channel、Skills)                          │   │
│   │  - Gateway Bot 容器创建与监控                                                    │   │
│   │  - 多租户隔离 (isolationKey)                                                     │   │
│   │                                                                                  │   │
│   │  不负责:                                                                         │   │
│   │  - Sandbox 容器管理 (由 OpenClaw Gateway 内部处理)                               │   │
│   │  - 会话级任务调度 (由 OpenClaw Gateway 内部处理)                                  │   │
│   └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                           │                                            │
│         ┌─────────────────────────────────┼─────────────────────────────────┐         │
│         │                                 │                                 │         │
│         ▼                                 ▼                                 ▼         │
│  ┌──────────────┐                 ┌──────────────┐                 ┌──────────────┐    │
│  │ Gateway Bot  │                 │ Gateway Bot  │                 │ Gateway Bot  │    │
│  │ (Marketing)  │                 │ (Sales)      │                 │ (Support)    │    │
│  ├──────────────┤                 ├──────────────┤                 ├──────────────┤    │
│  │ Port: 9200   │                 │ Port: 9201   │                 │ Port: 9202   │    │
│  │ CPU: 1核     │                 │ CPU: 1核     │                 │ CPU: 1核     │    │
│  │ Mem: 2GB     │                 │ Mem: 2GB     │                 │ Mem: 2GB     │    │
│  └──────┬───────┘                 └──────┬───────┘                 └──────┬───────┘    │
│         │                                │                                │            │
│         │ 内部动态创建                    │ 内部动态创建                    │ 内部动态创建 │
│         ▼                                ▼                                ▼            │
│  ┌──────────────┐                 ┌──────────────┐                 ┌──────────────┐    │
│  │ Sandbox 容器 │                 │ Sandbox 容器 │                 │ Sandbox 容器 │    │
│  │ (按需创建)   │                 │ (按需创建)   │                 │ (按需创建)   │    │
│  └──────────────┘                 └──────────────┘                 └──────────────┘    │
│                                                                                         │
│  每个 Gateway Bot 是独立的:                                                             │
│  - 独立的 OpenClaw 配置 (openclaw.json)                                                 │
│  - 独立的 Skills 目录                                                                   │
│  - 独立的端口和资源限制                                                                  │
│  - 独立的 Sandbox 容器 (由 Gateway 动态管理)                                             │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 二、资源规划与容量计算

### 2.1 资源消耗模型

> ⚠️ **关键**: 以下计算基于 OpenClaw 官方推荐配置

```
资源消耗公式:

总CPU需求 = Σ(Gateway容器) + Σ(活跃Sandbox容器)
总内存需求 = Σ(Gateway容器) + Σ(活跃Sandbox容器)

假设条件:
- 每个 Bot 平均 5 个并发活跃会话
- session 模式下，每个会话创建一个 Sandbox 容器
```

#### 单容器资源需求

| 容器类型              | CPU    | 内存   | 说明             |
| --------------------- | ------ | ------ | ---------------- |
| **Gateway Bot**       | 1 核   | 2 GB   | 主服务容器       |
| **Sandbox (session)** | 0.5 核 | 512 MB | 每会话一个       |
| **Sandbox (agent)**   | 0.5 核 | 512 MB | 每代理一个       |
| **Sandbox (shared)**  | 0.5 核 | 512 MB | 所有会话共享一个 |
| **Browser Sandbox**   | 4 核   | 8 GB   | 浏览器自动化     |

### 2.2 容量规划表

#### 基于资源计算的建议上限

```
计算公式 (session 模式，每 Bot 5 个并发会话):
- Gateway: N × 1C/2G
- Sandbox: N × 5 × 0.5C/512M = N × 2.5C/2.5G
- 基础服务: 2C/4G (API + Web，不含外部 PostgreSQL/Redis)
- 总计: N × 3.5C/4.5G + 2C/4G

注意: PostgreSQL 和 Redis 为外部服务，资源需求未包含在上述计算中
```

| 服务器配置   | 建议 Bot 上限 | 计算依据                             | 安全裕度 |
| ------------ | ------------- | ------------------------------------ | -------- |
| **8C/16G**   | 2-3 个        | 3×3.5C=10.5C, 3×4.5G=13.5G + 基础10G | 80%      |
| **16C/32G**  | 4-6 个        | 6×3.5C=21C, 6×4.5G=27G + 基础        | 80%      |
| **32C/64G**  | 8-12 个       | 12×3.5C=42C, 12×4.5G=54G + 基础      | 80%      |
| **64C/128G** | 15-25 个      | 25×3.5C=87C, 25×4.5G=112G + 基础     | 80%      |

#### 不同 Sandbox 模式的影响

| Sandbox 模式 | 10 个 Bot 的资源需求 | 说明                                        |
| ------------ | -------------------- | ------------------------------------------- |
| **session**  | 35C/45G              | 10 Gateway + 50 Sandbox                     |
| **agent**    | 20C/25G              | 10 Gateway + 20 Sandbox (假设每 Bot 2 代理) |
| **shared**   | 10.5C/25G            | 10 Gateway + 10 Sandbox                     |

### 2.3 推荐硬件配置

| 场景             | CPU   | 内存   | 磁盘       | Bot 数量 | Sandbox 模式 |
| ---------------- | ----- | ------ | ---------- | -------- | ------------ |
| **开发环境**     | 8 核  | 16 GB  | 100 GB SSD | 1-3      | shared       |
| **小规模生产**   | 16 核 | 32 GB  | 200 GB SSD | 4-6      | session      |
| **中等规模生产** | 32 核 | 64 GB  | 500 GB SSD | 8-12     | session      |
| **大规模生产**   | 64 核 | 128 GB | 1 TB SSD   | 15-25    | session      |

---

## 三、生产环境部署配置

> ⚠️ **重要**: PostgreSQL 和 Redis 为**外部服务**，不包含在本 docker-compose 中。
>
> - 可使用云服务商托管的 PostgreSQL/Redis
> - 也可使用其他 docker-compose 部署的 PostgreSQL/Redis
> - 需要预先创建外部网络并确保网络连通性

### 3.1 前置条件

```bash
# 1. 创建外部网络 (如需与其他服务通信)
docker network create clawbot-internal
docker network create clawbot-external

# 2. 确保 PostgreSQL 和 Redis 服务可用
# 方式 A: 使用云服务商托管服务
# 方式 B: 使用其他 docker-compose 部署

# 3. 如果 PostgreSQL/Redis 在其他 docker-compose 中:
#    确保它们也连接到 clawbot-internal 网络
# docker network connect clawbot-internal <postgres-container>
# docker network connect clawbot-internal <redis-container>
```

### 3.2 完整 Docker Compose 配置 (生产级)

```yaml
# docker-compose.prod.yml
# 生产环境配置 - 包含安全增强和资源限制
#
# 架构:
#   - Docker Socket 代理 (安全增强)
#   - ClawBotManager API + Web
#   - PostgreSQL 和 Redis 为外部服务 (通过环境变量配置)
#   - Gateway Bot 由 API 动态创建

x-common-env: &common-env
  TZ: Asia/Shanghai
  NODE_ENV: production

x-healthcheck: &healthcheck
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 30s

services:
  # =========================================================================
  # Docker Socket 代理 (安全增强)
  # =========================================================================
  docker-proxy:
    image: tecnativa/docker-socket-proxy:latest
    container_name: clawbot-docker-proxy
    restart: unless-stopped
    environment:
      # 只允许必要的 Docker API 操作
      - CONTAINERS=1 # 允许容器操作
      - IMAGES=1 # 允许镜像操作
      - NETWORKS=1 # 允许网络操作
      - VOLUMES=0 # 禁止卷操作
      - INFO=0 # 禁止信息查询
      - VERSION=1 # 允许版本查询
      - POST=1 # 允许 POST 请求 (创建容器)
      - DELETE=1 # 允许 DELETE 请求 (删除容器)
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks:
      - clawbot-internal
    healthcheck:
      <<: *healthcheck
      test: ['CMD', 'wget', '-q', '--spider', 'http://localhost:2375/version']
    deploy:
      resources:
        limits:
          cpus: '0.25'
          memory: 128M
    logging:
      driver: 'json-file'
      options:
        max-size: '10m'
        max-file: '2'

  # =========================================================================
  # ClawBotManager API
  # =========================================================================
  api:
    image: ${DOCKER_REGISTRY:-uhub.service.ucloud.cn/pardx}/clawbot-api:${IMAGE_TAG:-latest}
    container_name: clawbot-api
    restart: unless-stopped
    depends_on:
      docker-proxy:
        condition: service_healthy
    environment:
      <<: *common-env
      # Docker 配置 (通过代理)
      DOCKER_HOST: tcp://docker-proxy:2375
      # Bot 配置
      BOT_PORT_START: ${BOT_PORT_START:-9200}
      BOT_IMAGE_GATEWAY: ${BOT_IMAGE_GATEWAY:-openclaw:local}
      BOT_IMAGE_TOOL_SANDBOX: ${BOT_IMAGE_TOOL_SANDBOX:-openclaw-sandbox:bookworm-slim}
      BOT_IMAGE_BROWSER_SANDBOX: ${BOT_IMAGE_BROWSER_SANDBOX:-openclaw-sandbox-browser:bookworm-slim}
      # Bot 资源限制
      BOT_CONTAINER_CPU_LIMIT: ${BOT_CONTAINER_CPU_LIMIT:-1}
      BOT_CONTAINER_MEMORY_LIMIT: ${BOT_CONTAINER_MEMORY_LIMIT:-2147483648}
      # 数据库连接 (外部服务)
      # 格式: postgresql://用户名:密码@主机:端口/数据库名
      DATABASE_URL: ${DATABASE_URL:-}
      # Redis 连接 (外部服务)
      # 格式: redis://主机:端口 或 redis://:密码@主机:端口
      REDIS_URL: ${REDIS_URL:-redis://redis:6379}
      # 日志级别
      LOG_LEVEL: ${LOG_LEVEL:-info}
    volumes:
      - clawbot-data:/data/bots
      - clawbot-secrets:/data/secrets
      - clawbot-openclaw:/data/openclaw
      - clawbot-logs:/var/log/clawbot
    networks:
      - clawbot-internal
      - clawbot-external
    ports:
      - '${API_PORT:-13100}:3200'
    healthcheck:
      <<: *healthcheck
      test: ['CMD', 'curl', '-f', 'http://localhost:3200/health']
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G
    logging:
      driver: 'json-file'
      options:
        max-size: '100m'
        max-file: '5'
        labels: 'service'
        tag: '{{.Name}}'

  # =========================================================================
  # ClawBotManager Web
  # =========================================================================
  web:
    image: ${DOCKER_REGISTRY:-uhub.service.ucloud.cn/pardx}/clawbot-web:${IMAGE_TAG:-latest}
    container_name: clawbot-web
    restart: unless-stopped
    depends_on:
      api:
        condition: service_healthy
    environment:
      <<: *common-env
      NEXT_PUBLIC_API_BASE_URL: ${NEXT_PUBLIC_API_BASE_URL:-http://localhost:13100/api}
    networks:
      - clawbot-external
    ports:
      - '${WEB_PORT:-13000}:3000'
    healthcheck:
      <<: *healthcheck
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/api/health']
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 1G
    logging:
      driver: 'json-file'
      options:
        max-size: '50m'
        max-file: '3'

# =============================================================================
# Networks
# =============================================================================
# 注意: 这些网络需要预先创建
#
# 创建命令:
#   docker network create clawbot-internal
#   docker network create clawbot-external
#
# 如果 PostgreSQL 和 Redis 在其他 docker-compose 中:
#   确保它们也连接到 clawbot-internal 网络
networks:
  # 内部网络 - 服务间通信
  # 用于 API 与 PostgreSQL、Redis、Docker Proxy 通信
  clawbot-internal:
    external: true
  # 外部网络 - 暴露给用户的服务
  # Web 和 API 对外暴露
  clawbot-external:
    external: true

# =============================================================================
# Volumes
# =============================================================================
volumes:
  clawbot-data:
    name: clawbot-data
  clawbot-secrets:
    name: clawbot-secrets
  clawbot-openclaw:
    name: clawbot-openclaw
  clawbot-logs:
    name: clawbot-logs
```

### 3.3 部署命令

```bash
# 创建环境文件
cp .env.example .env.prod
# 编辑 .env.prod 设置数据库连接和密钥

# 启动服务
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# 查看状态
docker compose -f docker-compose.prod.yml ps

# 查看日志
docker compose -f docker-compose.prod.yml logs -f api

# 或使用 npm scripts
pnpm prod:up      # 启动
pnpm prod:ps      # 查看状态
pnpm prod:logs    # 查看日志
pnpm prod:down    # 停止
```

### 3.5 开发环境配置

> 开发环境中 PostgreSQL 和 Redis 使用共享的 `pardx-postgres` 和 `pardx-redis` 容器，
> 它们运行在 `common_network` 网络中。

```yaml
# docker-compose.dev.yml
# 开发环境配置 - 使用共享的 PostgreSQL 和 Redis

services:
  docker-proxy:
    image: tecnativa/docker-socket-proxy:latest
    environment:
      - CONTAINERS=1
      - IMAGES=1
      - NETWORKS=1
      - POST=1
      - DELETE=1
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks:
      - common_network
      - dev-network

  api:
    build:
      context: ./apps/api
      dockerfile: Dockerfile.dev
    environment:
      NODE_ENV: development
      DOCKER_HOST: tcp://docker-proxy:2375
      BOT_PORT_START: 9200
    volumes:
      - ./apps/api/src:/app/src
      - ./data/bots:/data/bots
      - ./data/secrets:/data/secrets
      - ./data/openclaw:/data/openclaw
    ports:
      - '3200:3200'
    depends_on:
      - docker-proxy
    networks:
      - common_network
      - dev-network

  web:
    build:
      context: ./apps/web
      dockerfile: Dockerfile.dev
    environment:
      NEXT_PUBLIC_API_BASE_URL: http://localhost:3200
    volumes:
      - ./apps/web:/app
      - /app/node_modules
    ports:
      - '3000:3000'
    networks:
      - dev-network

# 使用外部共享网络连接到 pardx-postgres 和 pardx-redis
networks:
  common_network:
    external: true # 共享网络，包含 pardx-postgres 和 pardx-redis
  dev-network:
    driver: bridge
```

> **前置条件**: 确保 `common_network` 网络和 `pardx-postgres`、`pardx-redis` 容器已启动。
>
> ```bash
> # 检查网络是否存在
> docker network ls | grep common_network
>
> # 如果不存在，创建网络并连接 PostgreSQL 和 Redis
> docker network create common_network
> docker network connect common_network pardx-postgres
> docker network connect common_network pardx-redis
> ```

---

## 四、容器资源限制配置

### 4.1 Gateway Bot 容器资源限制

ClawBotManager 在创建 Gateway Bot 容器时应设置资源限制：

```typescript
// 建议在 docker.service.ts 中添加

interface BotResourceLimits {
  cpuQuota: number; // CPU 配额 (100000 = 1 CPU)
  memory: number; // 内存限制 (字节)
  memorySwap: number; // 内存+交换分区限制
}

// 默认 Gateway 资源限制
const DEFAULT_GATEWAY_LIMITS: BotResourceLimits = {
  cpuQuota: 100000, // 1 CPU
  memory: 2 * 1024 * 1024 * 1024, // 2GB
  memorySwap: 2 * 1024 * 1024 * 1024,
};

// Browser Sandbox 资源限制
const BROWSER_SANDBOX_LIMITS: BotResourceLimits = {
  cpuQuota: 400000, // 4 CPU
  memory: 8 * 1024 * 1024 * 1024, // 8GB
  memorySwap: 8 * 1024 * 1024 * 1024,
  shmSize: 2 * 1024 * 1024 * 1024, // 2GB shm
};
```

### 4.2 OpenClaw 生成的配置应包含资源限制

```json
{
  "sandbox": {
    "mode": "session",
    "image": "openclaw-sandbox:bookworm-slim",
    "resources": {
      "limits": {
        "cpu": "0.5",
        "memory": "512Mi"
      }
    },
    "browser": {
      "enabled": true,
      "image": "openclaw-sandbox-browser:bookworm-slim",
      "resources": {
        "limits": {
          "cpu": "4",
          "memory": "8Gi"
        }
      }
    }
  }
}
```

---

## 五、安全配置

### 5.1 Docker Socket 安全

#### 方案 A: Docker Socket 代理 (推荐)

```yaml
# 使用 docker-socket-proxy 限制 API 访问
services:
  docker-proxy:
    image: tecnativa/docker-socket-proxy:latest
    environment:
      - CONTAINERS=1 # 只允许容器操作
      - IMAGES=1 # 只允许使用已存在的镜像
      - NETWORKS=1 # 只允许网络操作
      - VOLUMES=0 # 禁止卷操作
      - POST=1 # 允许创建
      - DELETE=1 # 允许删除
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
```

#### 方案 B: rootless Docker (更高安全性)

```bash
# 安装 rootless Docker
curl -fsSL https://get.docker.com/rootless | sh

# 配置环境变量
export DOCKER_HOST=unix:///run/user/1000/docker.sock
```

### 5.2 网络隔离

```yaml
# 使用外部网络实现服务间通信
networks:
  # 内部网络 - 服务间通信
  clawbot-internal:
    external: true # 连接外部 PostgreSQL、Redis

  # 外部网络 - 暴露服务
  clawbot-external:
    external: true # 暴露 Web 和 API 给用户

services:
  api:
    networks:
      - clawbot-internal # 访问外部 DB、Redis
      - clawbot-external # 暴露给用户

  web:
    networks:
      - clawbot-external # 只暴露给用户


# 注意: PostgreSQL 和 Redis 需要连接到 clawbot-internal 网络
# docker network connect clawbot-internal <postgres-container>
# docker network connect clawbot-internal <redis-container>
```

### 5.3 Secrets 管理

```yaml
# 使用 Docker Secrets (Swarm 模式)
secrets:
  db_password:
    external: true
  jwt_secret:
    external: true
  encryption_key:
    external: true

services:
  api:
    secrets:
      - db_password
      - jwt_secret
      - encryption_key
    environment:
      DATABASE_PASSWORD_FILE: /run/secrets/db_password
```

---

## 六、环境变量参考

### 6.1 外部服务连接

| 变量名         | 格式                                             | 说明                  |
| -------------- | ------------------------------------------------ | --------------------- |
| `DATABASE_URL` | `postgresql://用户:密码@主机:端口/数据库`        | PostgreSQL 连接字符串 |
| `REDIS_URL`    | `redis://主机:端口` 或 `redis://:密码@主机:端口` | Redis 连接字符串      |

### 6.2 核心配置

| 变量名                       | 默认值                                 | 说明                        |
| ---------------------------- | -------------------------------------- | --------------------------- |
| `BOT_PORT_START`             | 9200                                   | Bot 端口起始值              |
| `BOT_IMAGE_GATEWAY`          | openclaw:local                         | Gateway 镜像                |
| `BOT_IMAGE_TOOL_SANDBOX`     | openclaw-sandbox:bookworm-slim         | Sandbox 镜像                |
| `BOT_IMAGE_BROWSER_SANDBOX`  | openclaw-sandbox-browser:bookworm-slim | Browser 镜像                |
| `BOT_CONTAINER_CPU_LIMIT`    | 1                                      | Gateway 容器 CPU 限制 (核)  |
| `BOT_CONTAINER_MEMORY_LIMIT` | 2147483648                             | Gateway 容器内存限制 (字节) |

### 6.3 数据目录配置

| 变量名             | 默认值         | 说明              |
| ------------------ | -------------- | ----------------- |
| `BOT_DATA_DIR`     | /data/bots     | Workspace 目录    |
| `BOT_SECRETS_DIR`  | /data/secrets  | Secrets 目录      |
| `BOT_OPENCLAW_DIR` | /data/openclaw | OpenClaw 配置目录 |

### 6.4 容器化部署 (命名卷)

| 变量名                 | 说明            |
| ---------------------- | --------------- |
| `DATA_VOLUME_NAME`     | 数据卷名称      |
| `SECRETS_VOLUME_NAME`  | Secrets 卷名称  |
| `OPENCLAW_VOLUME_NAME` | OpenClaw 卷名称 |

---

## 七、运维指南

### 7.1 日常运维命令

```bash
# 查看所有 Gateway Bot 容器
docker ps --filter "label=clawbot-manager.managed=true"

# 查看特定 Bot 日志
docker logs -f clawbot-manager-user-techcorp-001_marketing-bot

# 查看所有 Bot 状态
curl http://localhost:3200/api/bot/list

# 重启特定 Bot (通过 API)
curl -X POST http://localhost:3200/api/bot/{botId}/restart

# 查看动态创建的 Sandbox 容器 (由 OpenClaw 创建)
docker ps --filter "ancestor=openclaw-sandbox:bookworm-slim"
docker ps --filter "ancestor=openclaw-sandbox-browser:bookworm-slim"

# 检查资源使用
docker stats --no-stream

# 清理停止的 Sandbox 容器
docker container prune --filter "label=openclaw.sandbox=true"
```

### 7.2 监控告警

```yaml
# Prometheus 告警规则示例
groups:
  - name: clawbot
    rules:
      - alert: BotContainerHighCPU
        expr: container_cpu_usage_seconds_total{name=~"clawbot-manager-.*"} > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: 'Bot 容器 CPU 使用率过高'

      - alert: BotContainerHighMemory
        expr: container_memory_usage_bytes{name=~"clawbot-manager-.*"} / container_spec_memory_limit_bytes{name=~"clawbot-manager-.*"} > 0.9
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: 'Bot 容器内存使用率过高'

      - alert: TooManySandboxContainers
        expr: count(container_last_seen{name=~"openclaw-sandbox.*"}) > 50
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: 'Sandbox 容器数量过多'

      - alert: BotCountExceedsLimit
        expr: count(container_last_seen{name=~"clawbot-manager-.*"}) > 25
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: 'Bot 数量超过建议上限'
```

### 7.3 日志管理

```yaml
# Docker 日志驱动配置
services:
  api:
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
        max-file: "5"
        labels: "service,environment"
        tag: "{{.Name}}/{{.ID}}"

# 或使用 Fluentd/Loki 收集日志
  api:
    logging:
      driver: "fluentd"
      options:
        fluentd-address: localhost:24224
        tag: clawbot.api
```

---

## 八、最佳实践

### 8.1 Bot 设计建议

1. **一个场景一个 Bot**: 营销、销售、客服使用不同的 Bot
2. **Skills 按需配置**: 每个 Bot 只安装必要的 Skills
3. **Channel 独立配置**: 每个 Bot 连接不同的飞书群/频道
4. **Sandbox 模式选择**:
   - 高隔离需求 → `session` 模式
   - 资源受限 → `shared` 模式
   - 多代理场景 → `agent` 模式

### 8.2 资源优化建议

1. **严格控制 Bot 数量**: 参考容量规划表
2. **监控 Sandbox 容器**: 定期清理无用的 Sandbox 容器
3. **日志轮转**: 配置 Docker 日志驱动限制日志大小
4. **资源限制**: 为每个 Bot 容器设置 CPU 和内存限制
5. **使用 shared 模式**: 在资源受限场景下优先使用

### 8.3 安全建议

1. **使用 Docker Socket 代理**: 不要直接挂载 docker.sock
2. **网络隔离**: 内部服务使用 internal 网络
3. **Secrets 管理**: 使用 Docker Secrets 或外部密钥管理
4. **定期更新**: 保持镜像和依赖更新

---

## 九、故障排查

### 9.1 常见问题

| 问题             | 可能原因           | 解决方案                          |
| ---------------- | ------------------ | --------------------------------- |
| Bot 启动失败     | 镜像不存在         | 检查镜像是否已构建                |
| 端口冲突         | 端口被占用         | 检查 `BOT_PORT_START` 配置        |
| Sandbox 创建失败 | Docker Socket 权限 | 检查 docker-proxy 配置            |
| 容器内存不足     | 资源限制过低       | 调整 `BOT_CONTAINER_MEMORY_LIMIT` |
| Bot 无响应       | 资源耗尽           | 检查 Sandbox 容器数量             |

### 9.2 诊断命令

```bash
# 检查 Docker 代理状态
docker logs docker-proxy

# 检查 API 服务状态
docker logs clawbot-api

# 检查 Bot 容器状态
docker inspect clawbot-manager-{isolationKey}

# 检查资源使用
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"

# 检查网络连通性
docker exec clawbot-api curl -s http://docker-proxy:2375/version
```

---

## 十、相关文档

- [ARCHITECTURE.md](./ARCHITECTURE.md) - 整体架构设计
- [SKILL_HOT_RELOAD.md](./SKILL_HOT_RELOAD.md) - Skill 热加载方案
- [DEVELOPMENT.md](./DEVELOPMENT.md) - 开发指南
- [docker-compose.yml](../docker-compose.yml) - 基础 Compose 配置
- **[单机多Bot架构-设计审查与优化建议.md](./单机多Bot架构-设计审查与优化建议.md)** - 设计审查报告
