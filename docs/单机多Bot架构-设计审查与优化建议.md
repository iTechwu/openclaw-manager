# 单机多 Bot 架构设计审查与优化建议

> **文档版本**: v1.0
> **更新日期**: 2026-02-24
> **审查目标**: 对比当前设计与 OpenClaw 官方推荐方案，识别符合与不符合的地方

---

## 一、OpenClaw 官方推荐架构

### 1.1 核心原则

| 原则 | 说明 |
|------|------|
| **一个 Gateway = 一个 Bot** | Gateway 是集中式管理器，包含完整的 AI Agent 服务 |
| **Sandbox 动态创建** | 由 Gateway 根据配置动态创建，不是预先部署的资源池 |
| **配置驱动** | 通过 `openclaw.json` 配置文件控制所有行为 |
| **Docker-in-Docker** | Gateway 容器需要访问 Docker Socket 来创建 Sandbox |

### 1.2 官方推荐的 Sandbox 模式

```json
{
  "sandbox": {
    "mode": "session" | "agent" | "shared",
    "image": "openclaw-sandbox:bookworm-slim",
    "browser": {
      "enabled": true,
      "image": "openclaw-sandbox-browser:bookworm-slim"
    }
  }
}
```

| 模式 | 创建时机 | 生命周期 | 适用场景 |
|------|---------|---------|---------|
| **session** | 每次会话开始时 | 会话结束时销毁 | 高隔离需求 |
| **agent** | 每个代理启动时 | 代理结束时销毁 | 多代理协作 |
| **shared** | Gateway 启动时 | Gateway 停止时销毁 | 资源受限场景 |

---

## 二、当前设计审查

### 2.1 符合官方推荐的部分 ✅

#### ✅ 1. 一个 Bot 一个 Gateway 容器

**当前实现**:
```typescript
// docker.service.ts
async createContainer(options: CreateContainerOptions): Promise<string> {
  const containerName = `clawbot-manager-${isolationKey}`;
  // 每个 Bot 创建独立的 Gateway 容器
}
```

**评价**: ✅ **完全符合**

每个业务 Bot (marketing-bot, sales-bot) 都是独立的 Gateway 容器，有独立的配置、Skills、端口。

#### ✅ 2. Sandbox 由 Gateway 动态管理

**当前实现**:
```typescript
// openclaw-config.service.ts - 生成的配置
{
  "sandbox": {
    "mode": "session",
    "image": "openclaw-sandbox:bookworm-slim",
    "browser": { ... }
  }
}
```

**评价**: ✅ **完全符合**

ClawBotManager 不创建/管理 Sandbox 容器，只生成配置。Sandbox 由 OpenClaw Gateway 根据配置动态创建。

#### ✅ 3. 独立的 Volume 隔离

**当前实现**:
```typescript
// docker.service.ts
const binds = [
  `${workspacePath}:/app/workspace:rw`,
  `${secretsDir}/${isolationKey}:/app/secrets:ro`,
  `${openclawDir}/${isolationKey}:/home/node/.openclaw:rw`,
];
```

**评价**: ✅ **完全符合**

每个 Bot 有独立的 workspace、secrets、openclaw 目录，通过 `isolationKey` 隔离。

#### ✅ 4. 配置热更新支持

**当前实现**:
```typescript
// openclaw-gateway.service.ts
async pushConfigUpdate(port, gatewayToken, updates): Promise<GatewayRpcResponse> {
  // 通过 OpenClaw RPC API 推送配置更新
}
```

**评价**: ✅ **完全符合**

支持通过 OpenClaw Gateway RPC API 进行配置热更新，无需重启容器。

#### ✅ 5. 端口动态分配

**当前实现**:
```typescript
// docker.service.ts
async allocatePort(usedPorts: number[]): Promise<number> {
  let port = Number(this.portStart) || 9200;
  while (usedPorts.includes(port)) port++;
  return port;
}
```

**评价**: ✅ **完全符合**

端口从 `BOT_PORT_START` (默认 9200) 动态分配，支持多 Bot 并存。

---

### 2.2 可能不符合或需要优化的部分 ⚠️

#### ⚠️ 1. 多 Bot 数量上限未明确

**当前设计**: 文档建议"单机不超过 30 个 Gateway Bot"

**潜在问题**:
- OpenClaw 官方没有明确说明单机 Bot 数量上限
- 每个 Gateway 都会创建 Sandbox 容器，资源消耗随活跃会话增长
- `session` 模式下，每个活跃会话都会创建 Sandbox 容器

**建议**:
```
资源预估 (假设 10 个 Bot，每个平均 5 个活跃会话):
- Gateway 容器: 10 × 1C/2G = 10C/20G
- Sandbox 容器 (session 模式): 50 × 0.5C/512M = 25C/25G
- 总计: 35C/45G

建议单机 Bot 数量:
- 16C/32G: 建议 3-5 个 Bot
- 32C/64G: 建议 8-12 个 Bot
- 64C/128G: 建议 15-25 个 Bot
```

#### ⚠️ 2. Sandbox 模式选择建议缺失

**当前设计**: 配置中使用 `session` 模式，但没有根据场景推荐

**OpenClaw 官方建议**:
- `session`: 高安全性场景，每次会话完全隔离
- `agent`: 多代理协作，代理间共享状态
- `shared`: 资源受限，所有会话共享同一个 Sandbox

**建议添加配置选项**:
```typescript
interface BotCreateOptions {
  // ...
  sandboxMode?: 'session' | 'agent' | 'shared';  // 新增
}
```

#### ⚠️ 3. Gateway 容器资源限制未生效

**当前实现**:
```typescript
// docker.service.ts - 没有设置容器资源限制
hostConfig: {
  Binds: binds,
  RestartPolicy: { Name: 'unless-stopped' },
  NetworkMode: networkMode,
  // 缺少: CpuQuota, Memory, MemorySwap 等
}
```

**潜在问题**:
- 单个 Gateway 可能消耗过多资源
- 影响其他 Bot 的稳定性

**建议**:
```typescript
hostConfig: {
  // ...
  CpuQuota: 100000,        // 1 CPU
  Memory: 2 * 1024 * 1024 * 1024,  // 2GB
  MemorySwap: 2 * 1024 * 1024 * 1024,
}
```

#### ⚠️ 4. Docker Socket 访问权限过大

**当前实现**:
```yaml
# docker-compose.yml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

**潜在问题**:
- ClawBotManager API 有完整的 Docker 访问权限
- 存在安全风险

**建议**:
1. 使用 Docker Socket 代理 (docker-socket-proxy)
2. 限制只允许特定操作 (create, start, stop, remove)
3. 限制只允许特定镜像

```yaml
# 推荐方案
services:
  docker-proxy:
    image: tecnativa/docker-socket-proxy
    environment:
      - CONTAINERS=1
      - IMAGES=1
      - NETWORKS=1
      - VOLUMES=0
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock

  api:
    environment:
      - DOCKER_HOST=tcp://docker-proxy:2375
```

#### ⚠️ 5. Bot 类型 (BotType) 设计可能造成混淆

**当前数据模型**:
```prisma
enum BotType {
  GATEWAY           // 主 Gateway Bot
  TOOL_SANDBOX      // 工具沙箱
  BROWSER_SANDBOX   // 浏览器沙箱
}
```

**潜在问题**:
- `TOOL_SANDBOX` 和 `BROWSER_SANDBOX` 在当前实现中**从未使用**
- 这些类型暗示 ClawBotManager 会直接创建 Sandbox 容器
- 但实际上 Sandbox 完全由 OpenClaw Gateway 内部管理

**建议**:
1. **方案 A**: 移除 `TOOL_SANDBOX` 和 `BROWSER_SANDBOX` 类型
   ```prisma
   enum BotType {
     GATEWAY  // 只保留 GATEWAY
   }
   ```

2. **方案 B**: 添加注释说明这些类型是预留的
   ```prisma
   enum BotType {
     GATEWAY           // 主 Gateway Bot (当前使用)
     TOOL_SANDBOX      // 预留：未来可能用于独立 Sandbox Pool
     BROWSER_SANDBOX   // 预留：未来可能用于独立 Browser Pool
   }
   ```

---

### 2.3 不推荐的设计模式 ❌

#### ❌ 1. 预先部署 Sandbox Pool (已在文档中纠正)

**错误设计** (之前版本的方案):
```
预先创建 sandbox-1, sandbox-2, sandbox-3, sandbox-4
等待任务分配
```

**正确理解**:
- Sandbox 由 OpenClaw Gateway 根据 `sandbox.mode` 动态创建
- 不是预先部署的资源池
- 生命周期由 Gateway 管理

**当前文档**: ✅ 已在 v3.0 中纠正

#### ❌ 2. 同一个 Bot 多实例负载均衡

**错误设计**:
```
marketing-bot-1  ┐
marketing-bot-2  ├─ 做负载均衡
marketing-bot-3  ┘
```

**问题**:
- 会话状态不同步
- Channel 连接冲突 (飞书/钉钉只能连接一个实例)
- 配置文件冲突

**当前设计**: ✅ 没有 implements 这种模式

---

## 三、优化建议汇总

### 3.1 架构层面

| 优先级 | 建议 | 说明 |
|--------|------|------|
| **P0** | 添加 Gateway 容器资源限制 | 防止单个 Bot 消耗过多资源 |
| **P1** | 使用 Docker Socket 代理 | 降低安全风险 |
| **P1** | 明确单机 Bot 数量上限 | 基于资源容量计算 |
| **P2** | 添加 Sandbox 模式选择 | 允许用户选择 session/agent/shared |
| **P2** | 清理未使用的 BotType | 或添加注释说明 |

### 3.2 代码层面

```typescript
// 建议 1: 添加容器资源限制
// apps/api/src/modules/bot-api/services/docker.service.ts

async createContainer(options: CreateContainerOptions): Promise<string> {
  // ...

  const hostConfig: Docker.HostConfig = {
    Binds: binds,
    RestartPolicy: { Name: 'unless-stopped' },
    NetworkMode: networkMode,

    // 新增: 资源限制
    CpuQuota: 100000,  // 1 CPU
    Memory: 2 * 1024 * 1024 * 1024,  // 2GB
    MemorySwap: 2 * 1024 * 1024 * 1024,
  };

  // BROWSER_SANDBOX 需要更多资源
  if (botType === 'BROWSER_SANDBOX') {
    hostConfig.CpuQuota = 400000;  // 4 CPU
    hostConfig.Memory = 8 * 1024 * 1024 * 1024;  // 8GB
    hostConfig.ShmSize = 2 * 1024 * 1024 * 1024;  // 2GB shm
  }
}
```

```typescript
// 建议 2: 添加 Sandbox 模式配置选项
// packages/contracts/src/schemas/bot.schema.ts

export const SandboxModeSchema = z.enum(['session', 'agent', 'shared']);

export const CreateBotRequestSchema = z.object({
  // ...
  sandboxMode: SandboxModeSchema.optional().default('session'),
});
```

### 3.3 配置层面

```yaml
# 建议 3: 使用 Docker Socket 代理
# docker-compose.yml

services:
  docker-proxy:
    image: tecnativa/docker-socket-proxy:latest
    container_name: docker-proxy
    environment:
      - CONTAINERS=1
      - IMAGES=1
      - NETWORKS=1
      - VOLUMES=0
      - INFO=0
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks:
      - internal
    restart: unless-stopped

  api:
    # ...
    environment:
      - DOCKER_HOST=tcp://docker-proxy:2375
    depends_on:
      - docker-proxy
```

---

## 四、结论

### 4.1 总体评价

| 方面 | 评分 | 说明 |
|------|------|------|
| **架构设计** | ⭐⭐⭐⭐☆ | 核心架构符合官方推荐 |
| **安全性** | ⭐⭐⭐☆☆ | Docker Socket 权限过大 |
| **资源管理** | ⭐⭐⭐☆☆ | 缺少容器资源限制 |
| **可扩展性** | ⭐⭐⭐⭐☆ | 支持多 Bot，但数量上限不明确 |
| **代码质量** | ⭐⭐⭐⭐☆ | 结构清晰，遵循最佳实践 |

### 4.2 符合官方推荐的程度

```
✅ 完全符合:
   - 一个 Bot 一个 Gateway 容器
   - Sandbox 由 Gateway 动态创建
   - 配置驱动
   - Volume 隔离
   - 配置热更新

⚠️ 需要优化:
   - 容器资源限制
   - Docker Socket 安全
   - Bot 数量规划
   - Sandbox 模式选择

❌ 不推荐的设计 (已避免):
   - 预先部署 Sandbox Pool
   - 同一 Bot 多实例负载均衡
```

### 4.3 下一步行动

1. **立即**: 添加 Gateway 容器资源限制
2. **短期**: 使用 Docker Socket 代理
3. **中期**: 添加 Sandbox 模式选择 UI
4. **长期**: 考虑多机部署方案

---

## 五、实施状态跟踪

> **最后更新**: 2026-02-24

| 优先级 | 建议 | 状态 | 实施说明 |
|--------|------|------|---------|
| **P0** | 添加 Gateway 容器资源限制 | ✅ 已完成 | `docker.service.ts` 添加了 `CpuQuota`、`Memory`、`MemorySwap` 配置，支持通过环境变量配置 |
| **P1** | 使用 Docker Socket 代理 | ✅ 已完成 | `docker-compose.prod.yml` 添加了 `docker-socket-proxy` 服务 |
| **P1** | 明确单机 Bot 数量上限 | ✅ 已完成 | 部署方案文档中添加了基于资源的容量规划表 |
| **P2** | 添加 Sandbox 模式选择 | ✅ 已完成 | 添加了 `SandboxModeSchema` 和配置支持 (session/agent/shared) |
| **P2** | 清理未使用的 BotType | ✅ 已完成 | 在 Prisma schema 中添加了详细注释说明 TOOL_SANDBOX/BROWSER_SANDBOX 为预留类型 |

### 5.1 代码变更记录

#### docker.service.ts (容器资源限制)
```typescript
// 新增: 容器资源限制配置
private readonly containerCpuLimit: number;
private readonly containerMemoryLimit: number;

// hostConfig 中添加:
CpuQuota: this.containerCpuLimit * 100000,
Memory: this.containerMemoryLimit,
MemorySwap: this.containerMemoryLimit,
```

#### openclaw-config.service.ts (Sandbox 模式)
```typescript
// 新增: Sandbox 模式配置选项
sandboxMode?: SandboxMode;

// 配置中添加:
sandbox: {
  mode: sandboxMode,
},
```

#### prisma/schema.prisma (BotType 注释)
```prisma
enum BotType {
  GATEWAY         // 主 Gateway bot - 完整 OpenClaw 运行时
  TOOL_SANDBOX    // [预留] 未来用于独立 Sandbox Pool
  BROWSER_SANDBOX // [预留] 未来用于独立 Browser Pool
}
```
