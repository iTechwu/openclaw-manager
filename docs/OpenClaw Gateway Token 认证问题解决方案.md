# OpenClaw Gateway Token 认证问题解决方案

## 问题描述

访问 `http://localhost:19000/chat?session=main` 时出现以下错误：

```
disconnected (1008): unauthorized: gateway token missing (open a tokenized dashboard URL or paste token in Control UI settings)
```

从 Docker 日志可以看到多次 WebSocket 连接被拒绝：

```
[ws] unauthorized conn=xxx remote=xxx client=openclaw-control-ui webchat vdev reason=token_missing
[ws] closed before connect ... code=1008 reason=unauthorized: gateway token missing
```

## 问题根因分析

### 1. OpenClaw Gateway 认证机制

OpenClaw Gateway 默认要求所有 WebSocket 连接进行身份验证。认证方式包括：

- **Token 认证** (`gateway.auth.mode: "token"`)：通过共享 token 进行认证
- **Password 认证** (`gateway.auth.mode: "password"`)：通过密码进行认证
- **Tailscale 身份认证**：通过 Tailscale Serve 的身份头进行认证

### 2. 当前配置问题

从日志分析，当前 OpenClaw 容器启动时：

1. 设置了 `OPENCLAW_GATEWAY_TOKEN` 环境变量
2. 使用 `--bind lan --allow-unconfigured` 启动 gateway
3. **但是**：`openclaw.json` 配置文件中没有配置 `gateway.auth.token`

关键问题：**环境变量 `OPENCLAW_GATEWAY_TOKEN` 仅用于 CLI 工具认证，不会自动配置 Gateway 的 WebSocket 认证**。

### 3. WebSocket 认证流程

当客户端（如 WebChat）连接到 Gateway 时：

1. 客户端需要在 WebSocket 握手时提供 `connect.params.auth.token` 或 `connect.params.auth.password`
2. Gateway 验证提供的凭证与 `gateway.auth.token` 或 `gateway.auth.password` 是否匹配
3. 如果未配置认证或凭证不匹配，连接被拒绝（错误码 1008）

## 解决方案

### 方案一：配置 Gateway Token（推荐）

在 `openclaw.json` 中配置 `gateway.auth.token`，然后通过 tokenized URL 访问。

#### 步骤 1：修改 Docker 容器启动脚本

在 [docker.service.ts](../apps/api/src/modules/bot-api/services/docker.service.ts) 中，需要在容器启动时配置 `openclaw.json`：

```typescript
// 在容器启动脚本中添加 gateway.auth.token 配置
const startupScript = `
  # ... 现有配置 ...

  # 配置 Gateway Token 认证
  CONFIG_DIR="/home/node/.openclaw"
  CONFIG_FILE="$CONFIG_DIR/openclaw.json"
  mkdir -p "$CONFIG_DIR"

  # 创建或更新 openclaw.json
  cat > "$CONFIG_FILE" << JSON_EOF
{
  "gateway": {
    "mode": "local",
    "port": ${options.port},
    "bind": "lan",
    "auth": {
      "mode": "token",
      "token": "$OPENCLAW_GATEWAY_TOKEN"
    }
  },
  "agents": {
    "defaults": {
      "workspace": "/app/workspace"
    }
  }
}
JSON_EOF

  # 启动 gateway
  exec node /app/openclaw.mjs gateway --port ${options.port} --bind lan
`;
```

#### 步骤 2：使用 Tokenized URL 访问

配置完成后，使用带 token 的 URL 访问：

```
http://localhost:19000/?token=<your-gateway-token>
```

或者访问 chat 页面：

```
http://localhost:19000/chat?session=main&token=<your-gateway-token>
```

### 方案二：禁用 Gateway 认证（仅限开发环境）

如果是本地开发环境，可以禁用 Gateway 认证。

#### 配置 openclaw.json

```json5
{
  "gateway": {
    "mode": "local",
    "port": 19000,
    "bind": "lan",
    "auth": {
      "mode": "none"  // 禁用认证（不推荐用于生产环境）
    },
    "controlUi": {
      "dangerouslyDisableDeviceAuth": true,
      "allowInsecureAuth": true
    }
  }
}
```

**警告**：此方案仅适用于本地开发环境，生产环境必须启用认证。

### 方案三：使用 Control UI 设置 Token

1. 访问 `http://localhost:19000/`
2. 打开设置面板（Settings）
3. 在 Token 字段中粘贴 Gateway Token
4. 保存设置后重新连接

## 实施步骤

### 1. 修改 DockerService

编辑 [docker.service.ts:392-535](../apps/api/src/modules/bot-api/services/docker.service.ts#L392-L535)，在容器启动脚本中添加 `openclaw.json` 配置：

```typescript
Cmd: [
  `
  # ... 现有的环境变量配置 ...

  # 配置 openclaw.json 以启用 Gateway Token 认证
  CONFIG_DIR="/home/node/.openclaw"
  CONFIG_FILE="$CONFIG_DIR/openclaw.json"
  mkdir -p "$CONFIG_DIR"

  # 生成 openclaw.json 配置
  cat > "$CONFIG_FILE" << JSON_EOF
{
  "gateway": {
    "mode": "local",
    "port": ${options.port},
    "bind": "lan",
    "auth": {
      "mode": "token",
      "token": "$OPENCLAW_GATEWAY_TOKEN"
    }
  },
  "agents": {
    "defaults": {
      "workspace": "$BOT_WORKSPACE_DIR"
    }
  }
}
JSON_EOF

  echo "Created openclaw.json with gateway token authentication"
  cat "$CONFIG_FILE"

  # 运行 doctor 修复配置
  node /app/openclaw.mjs doctor --fix 2>/dev/null || true

  # 启动 gateway（移除 --allow-unconfigured，因为已有配置）
  exec node /app/openclaw.mjs gateway --port ${options.port} --bind lan
  `,
],
```

### 2. 更新 Bot API 返回 Token

在 Bot 创建/启动 API 响应中返回 Gateway Token，以便前端构建 tokenized URL：

```typescript
// bot-api.service.ts
async createBot(dto: CreateBotDto): Promise<BotResponse> {
  // ... 创建 bot 逻辑 ...

  return {
    // ... 其他字段 ...
    gatewayToken: bot.gatewayToken,  // 返回 token 供前端使用
    dashboardUrl: `http://localhost:${bot.port}/?token=${bot.gatewayToken}`,
    chatUrl: `http://localhost:${bot.port}/chat?session=main&token=${bot.gatewayToken}`,
  };
}
```

### 3. 前端使用 Tokenized URL

前端在打开 Bot 控制台时，使用带 token 的 URL：

```typescript
// 打开 Bot 控制台
const openBotDashboard = (bot: Bot) => {
  const url = `http://localhost:${bot.port}/?token=${bot.gatewayToken}`;
  window.open(url, '_blank');
};

// 打开 Bot 聊天界面
const openBotChat = (bot: Bot) => {
  const url = `http://localhost:${bot.port}/chat?session=main&token=${bot.gatewayToken}`;
  window.open(url, '_blank');
};
```

## 配置参考

### openclaw.json 完整示例

```json5
{
  // Gateway 配置
  "gateway": {
    "mode": "local",           // 本地模式
    "port": 19000,             // 监听端口
    "bind": "lan",             // 绑定到 LAN（允许外部访问）
    "auth": {
      "mode": "token",         // 使用 token 认证
      "token": "your-secret-token-here"  // Gateway Token
    },
    "controlUi": {
      "enabled": true,         // 启用 Control UI
      "basePath": "/"          // UI 路径
    }
  },

  // Agent 配置
  "agents": {
    "defaults": {
      "workspace": "/app/workspace"
    }
  },

  // 日志配置
  "logging": {
    "level": "info",
    "consoleLevel": "info"
  }
}
```

### 环境变量说明

| 环境变量 | 说明 | 示例 |
|---------|------|------|
| `OPENCLAW_GATEWAY_TOKEN` | Gateway 认证 Token | `abc123...` |
| `OPENCLAW_GATEWAY_PORT` | Gateway 端口 | `19000` |
| `OPENCLAW_GATEWAY_PASSWORD` | Gateway 密码（可选） | `secret` |

## 安全建议

1. **生产环境必须启用认证**：不要在生产环境禁用 Gateway 认证
2. **使用强随机 Token**：建议使用 `openssl rand -hex 32` 生成 Token
3. **Token 保密**：不要在日志或前端代码中暴露 Token
4. **使用 HTTPS**：生产环境建议使用 Tailscale Serve 或反向代理提供 HTTPS
5. **定期轮换 Token**：定期更换 Gateway Token

## 参考文档

- [OpenClaw Gateway Configuration](https://docs.openclaw.ai/gateway/configuration)
- [OpenClaw Authentication](https://docs.openclaw.ai/gateway/authentication)
- [OpenClaw Control UI](https://docs.openclaw.ai/web/control-ui)
- [OpenClaw WebChat](https://docs.openclaw.ai/web/webchat)
- [GitHub: openclaw/openclaw](https://github.com/openclaw/openclaw)

## 相关文件

- [docker.service.ts](../apps/api/src/modules/bot-api/services/docker.service.ts) - Docker 容器管理服务
- [bot-api.service.ts](../apps/api/src/modules/bot-api/bot-api.service.ts) - Bot API 服务
- [bot.schema.ts](../packages/contracts/src/schemas/bot.schema.ts) - Bot Schema 定义
- [Dockerfile.botenv](../Dockerfile.botenv) - Bot 环境镜像

## 实施记录

### 已完成的修改 (2026-02-09)

#### 1. DockerService 容器启动脚本修改

**文件**: [docker.service.ts](../apps/api/src/modules/bot-api/services/docker.service.ts)

**修改内容**:
- 在容器启动脚本中添加 `openclaw.json` 配置文件创建逻辑
- 配置 `gateway.auth.mode: "token"` 和 `gateway.auth.token`
- 移除 `--allow-unconfigured` 参数，因为现在有了正确的配置文件

**关键代码**:
```bash
# Create openclaw.json configuration with gateway token authentication
CONFIG_DIR="/home/node/.openclaw"
JSON_CONFIG_FILE="$CONFIG_DIR/openclaw.json"
mkdir -p "$CONFIG_DIR"

cat > "$JSON_CONFIG_FILE" << JSON_EOF
{
  "gateway": {
    "mode": "local",
    "port": $BOT_PORT,
    "bind": "lan",
    "auth": {
      "mode": "token",
      "token": "$OPENCLAW_GATEWAY_TOKEN"
    },
    "controlUi": {
      "enabled": true,
      "allowInsecureAuth": true
    }
  },
  "agents": {
    "defaults": {
      "workspace": "$BOT_WORKSPACE_DIR"
    }
  }
}
JSON_EOF
```

**注意**: `allowInsecureAuth: true` 用于禁用设备配对认证。当从非本地连接（如 Docker 容器外部）访问时，Gateway 默认要求设备配对。此设置禁用该要求，仅依赖 token 认证。

#### 2. Bot Schema 更新

**文件**: [bot.schema.ts](../packages/contracts/src/schemas/bot.schema.ts)

**修改内容**:
- 添加 `dashboardUrl` 字段：带 token 的控制台 URL
- 添加 `chatUrl` 字段：带 token 的聊天界面 URL

```typescript
export const BotSchema = z.object({
  // ... 其他字段 ...
  // Tokenized URLs for accessing the bot's OpenClaw gateway
  dashboardUrl: z.string().nullable().optional(),
  chatUrl: z.string().nullable().optional(),
});
```

#### 3. BotApiService 更新

**文件**: [bot-api.service.ts](../apps/api/src/modules/bot-api/bot-api.service.ts)

**修改内容**:
- 添加 `buildTokenizedUrls()` 私有方法，用于构建带 token 的 URL
- 更新 `listBots()` 方法，在返回结果中包含 tokenized URLs
- 更新 `getBotByHostname()` 方法，在返回结果中包含 tokenized URLs

```typescript
private buildTokenizedUrls(bot: Bot): {
  dashboardUrl: string | null;
  chatUrl: string | null;
} {
  if (!bot.port || !bot.gatewayToken) {
    return { dashboardUrl: null, chatUrl: null };
  }
  const baseUrl = `http://localhost:${bot.port}`;
  return {
    dashboardUrl: `${baseUrl}/?token=${bot.gatewayToken}`,
    chatUrl: `${baseUrl}/chat?session=main&token=${bot.gatewayToken}`,
  };
}
```

### 验证步骤

1. **重新构建并启动 Bot 容器**:
   ```bash
   # 停止现有容器
   docker stop <container_name>

   # 通过 API 重新启动 Bot
   curl -X POST http://localhost:3200/api/bots/<hostname>/start
   ```

2. **检查容器日志**:
   ```bash
   docker logs <container_name>
   ```
   应该看到：
   - `Created openclaw.json:` 后面跟着配置内容
   - Gateway 启动成功的日志

3. **使用 Tokenized URL 访问**:
   - 从 API 获取 Bot 信息，使用返回的 `dashboardUrl` 或 `chatUrl`
   - 或者手动构建 URL: `http://localhost:<port>/?token=<gatewayToken>`

4. **验证 WebSocket 连接**:
   - 打开浏览器开发者工具
   - 检查 WebSocket 连接是否成功建立
   - 不应再看到 `token_missing` 错误

