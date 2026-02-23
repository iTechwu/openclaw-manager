# OpenClaw Client 优化方案

## 一、严重问题（阻塞编译）

### 1.1 类定义语法错误（Line 1077-1123）

**问题**：`OpenClawClient` 类在第 1077 行关闭 `}`，但 `enrichSkillsWithContent` 方法（第 1079-1123 行）被定义在类外部。

```typescript
// Line 1076-1077
}  // ← 类在此关闭

  /**
   * 批量读取容器内每个技能的 SKILL.md 内容   * ← 这段代码在类外部！
   */
  private async enrichSkillsWithContent(...)
```

**修复**：删除第 1077 行的 `}`，将 `enrichSkillsWithContent` 方法保留在类内部，然后在第 1123 行添加正确的类关闭括号。

---

## 二、功能性 Bug

### 2.1 Docker Socket Path 缺失

**位置**：`injectMcpConfig()` (Line 938-954), `removeMcpConfig()` (Line 1019-1035)

**问题**：这两个方法的 HTTP POST 请求缺少 `socketPath: '/var/run/docker.sock'` 配置，导致请求无法到达 Docker API。

```typescript
// 当前代码（错误）
this.httpService.post(execCreateUrl, {
  AttachStdout: true,
  AttachStderr: true,
  Cmd: ['node', '-e', nodeScript],
})  // ← 缺少 socketPath 配置

// 其他方法（正确）
this.httpService.post(execCreateUrl, {...}, {
  socketPath: '/var/run/docker.sock',  // ← 有配置
  timeout: 10000,
})
```

**修复**：为这两个方法添加 `socketPath` 配置。

### 2.2 Shell 注入风险

**位置**：`removeMcpConfig()` (Line 1010)

**问题**：直接将 `serverName` 插入到 shell 脚本中，未做安全校验。

```typescript
const nodeScript = `
  ...
  delete config.mcpServers.${serverName};  // ← 危险：未转义
  ...
`;
```

**修复**：
1. 在方法开头添加参数校验（类似 `execSkillScript` 的 `safeNamePattern`）
2. 或使用 JSON.stringify 转义

---

## 三、代码重复问题

### 3.1 Docker Exec 模式重复

**影响范围**：6 个方法中重复相同的 Docker exec 调用模式

| 方法 | 行号 | 职责 |
|------|------|------|
| `switchModel()` | 141-210 | 模型切换 |
| `execSkillScript()` | 216-307 | 技能脚本执行 |
| `execInContainer()` | 713-777 | 通用命令执行 |
| `injectMcpConfig()` | 915-994 | MCP 配置注入 |
| `removeMcpConfig()` | 1001-1076 | MCP 配置移除 |
| `enrichSkillsWithContent()` | 1083-1122 | 技能内容读取 |

**重复代码模式**：
```typescript
// 1. 创建 exec
const execCreateUrl = `http://localhost/containers/${containerId}/exec`;
const execCreateResponse = await firstValueFrom(
  this.httpService.post(execCreateUrl, { ... }, { socketPath: '...', timeout: ... })
  .pipe(timeout(...), catchError(...))
);

// 2. 获取 execId
const execId = execCreateResponse.data?.Id;
if (!execId) { throw/return ... }

// 3. 启动 exec
const execStartUrl = `http://localhost/exec/${execId}/start`;
const execStartResponse = await firstValueFrom(
  this.httpService.post(execStartUrl, { ... }, { socketPath: '...', timeout: ..., responseType: 'arraybuffer' })
  .pipe(timeout(...), catchError(...))
);

// 4. 解析输出
const stdout = this.parseDockerExecOutput(execStartResponse.data);
```

**优化方案**：提取为通用方法

```typescript
/**
 * 通用 Docker exec 执行方法
 * @param containerId 容器 ID
 * @param cmd 执行命令
 * @param options 可选配置
 */
private async executeDockerCommand(
  containerId: string,
  cmd: string[],
  options?: {
    timeout?: number;
    user?: string;
    throwOnError?: boolean;
  },
): Promise<{ stdout: string; stderr: string; success: boolean }> {
  const {
    timeout: execTimeout = 15000,
    user,
    throwOnError = false,
  } = options ?? {};

  const execCreateUrl = `http://localhost/containers/${containerId}/exec`;
  const execCreateBody: Record<string, unknown> = {
    AttachStdout: true,
    AttachStderr: true,
    Cmd: cmd,
  };
  if (user) execCreateBody.User = user;

  try {
    // Step 1: Create exec instance
    const execCreateResponse = await firstValueFrom(
      this.httpService
        .post(execCreateUrl, execCreateBody, {
          socketPath: '/var/run/docker.sock',
          timeout: execTimeout,
        })
        .pipe(
          timeout(execTimeout),
          catchError((error) => {
            this.logger.error('Docker exec create failed', {
              containerId,
              cmd: cmd.join(' '),
              error: error instanceof Error ? error.message : 'Unknown',
            });
            throw error;
          }),
        ),
    );

    const execId = execCreateResponse.data?.Id;
    if (!execId) {
      throw new Error('Failed to create exec instance');
    }

    // Step 2: Start exec
    const execStartUrl = `http://localhost/exec/${execId}/start`;
    const execStartResponse = await firstValueFrom(
      this.httpService
        .post(execStartUrl, { Detach: false, Tty: false }, {
          socketPath: '/var/run/docker.sock',
          timeout: execTimeout,
          responseType: 'arraybuffer',
        })
        .pipe(
          timeout(execTimeout),
          catchError((error) => {
            this.logger.error('Docker exec start failed', {
              containerId,
              execId,
              error: error instanceof Error ? error.message : 'Unknown',
            });
            throw error;
          }),
        ),
    );

    // Step 3: Parse output
    const { stdout, stderr } = this.parseDockerExecOutputWithStderr(execStartResponse.data);

    return { stdout, stderr, success: true };
  } catch (error) {
    if (throwOnError) {
      throw error;
    }
    return {
      stdout: '',
      stderr: error instanceof Error ? error.message : 'Unknown error',
      success: false,
    };
  }
}
```

**重构后各方法简化为**：
```typescript
async switchModel(containerId: string, model: string): Promise<void> {
  this.logger.info('OpenClawClient: 切换模型', { containerId, model });

  const { success, stderr } = await this.executeDockerCommand(
    containerId,
    ['node', '/app/openclaw.mjs', 'models', 'set', model],
    { timeout: 10000 },
  );

  if (!success) {
    this.logger.warn('OpenClawClient: 模型切换失败', { containerId, model, stderr });
    // 不抛出错误，允许继续使用当前模型
  }
}
```

---

## 四、配置问题

### 4.1 硬编码超时值

**当前状态**：超时值分散在代码各处

| 超时值 | 位置 | 用途 |
|--------|------|------|
| 120000 | Line 65-66 | 请求/WebSocket 总超时 |
| 10000 | 多处 | Docker exec 创建/启动 |
| 15000 | 多处 | Docker exec 启动 |
| 30000 | Line 276 | 技能脚本执行 |
| 5000 | Line 638 | 健康检查 |

**优化方案**：集中配置

```typescript
@Injectable()
export class OpenClawClient {
  // 集中配置超时值
  private readonly config = {
    requestTimeout: 120000,      // 请求总超时
    wsTimeout: 120000,           // WebSocket 响应超时
    dockerExecTimeout: {
      create: 10000,             // exec 创建
      default: 15000,            // 默认执行
      script: 30000,             // 脚本执行
    },
    healthCheckTimeout: 5000,    // 健康检查
  };

  // 使用方式
  // timeout: this.config.dockerExecTimeout.default
}
```

---

## 五、WebSocket 优化

### 5.1 缺少连接池/复用

**问题**：每次 `chat()` 调用都创建新的 WebSocket 连接，对于频繁调用场景效率低下。

**优化方案**：实现连接池（可选，按需实现）

```typescript
// 连接池方案（适用于高频调用场景）
private wsConnectionPool = new Map<string, {
  ws: WebSocket;
  lastUsed: number;
  isConnected: boolean;
}>();

private async getOrCreateConnection(port: number, token: string): Promise<WebSocket> {
  const key = `${port}:${token.slice(0, 8)}`;
  const cached = this.wsConnectionPool.get(key);

  if (cached?.isConnected && cached.ws.readyState === WebSocket.OPEN) {
    cached.lastUsed = Date.now();
    return cached.ws;
  }

  // 创建新连接...
}
```

### 5.2 资源清理不完整

**问题**：WebSocket 错误时可能未正确清理定时器和事件监听器。

**优化方案**：使用 AbortController 模式

```typescript
private sendMessageViaWebSocket(...): Promise<string> {
  return new Promise((resolve, reject) => {
    const abortController = new AbortController();
    const { signal } = abortController;

    const cleanup = () => {
      abortController.abort();
      ws.removeAllListeners();
      ws.close();
    };

    const timeoutId = setTimeout(() => {
      if (!signal.aborted) {
        cleanup();
        reject(new Error('WebSocket 响应超时'));
      }
    }, this.config.wsTimeout);

    signal.addEventListener('abort', () => {
      clearTimeout(timeoutId);
    });

    // ... 其余逻辑
  });
}
```

---

## 六、类型定义缺失

### 6.1 McpServerConfig 类型未定义

**位置**：Line 917, 1001

```typescript
async injectMcpConfig(
  containerId: string,
  mcpServers: Record<string, McpServerConfig>,  // ← McpServerConfig 未定义
): Promise<void>
```

**修复**：添加类型定义

```typescript
export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  disabled?: boolean;
}
```

---

## 七、实施优先级

| 优先级 | 问题 | 影响 | 工作量 |
|--------|------|------|--------|
| P0 | 类定义语法错误 | 阻塞编译 | 5分钟 |
| P0 | Docker socketPath 缺失 | 功能失效 | 10分钟 |
| P1 | Shell 注入风险 | 安全问题 | 15分钟 |
| P1 | McpServerConfig 类型缺失 | 类型安全 | 5分钟 |
| P2 | Docker exec 模式提取 | 代码重复 | 1小时 |
| P2 | 超时配置集中化 | 可维护性 | 30分钟 |
| P3 | WebSocket 连接池 | 性能优化 | 2小时 |
| P3 | 资源清理优化 | 稳定性 | 1小时 |

---

## 八、修复代码示例

### 8.1 立即修复（P0）

```typescript
// 1. 删除 Line 1077 的 }
// 2. enrichSkillsWithContent 保持在类内部
// 3. 在 Line 1123 之后添加正确的类关闭

// 修复 injectMcpConfig
async injectMcpConfig(containerId: string, mcpServers: Record<string, McpServerConfig>): Promise<void> {
  // ...
  const execCreateResponse = await firstValueFrom(
    this.httpService.post(execCreateUrl, {
      AttachStdout: true,
      AttachStderr: true,
      Cmd: ['node', '-e', nodeScript],
    }, {
      socketPath: '/var/run/docker.sock',  // ← 添加
      timeout: 15000,
    }).pipe(timeout(15000), catchError(...))
  );
  // ...
}

// 修复 removeMcpConfig 并添加安全校验
async removeMcpConfig(containerId: string, serverName: string): Promise<void> {
  // 安全校验
  const safeNamePattern = /^[a-zA-Z0-9_\-.]+$/;
  if (!safeNamePattern.test(serverName)) {
    throw new Error(`Invalid server name: ${serverName}`);
  }
  // ...
}
```

---

## 九、文件结构建议

```
apps/api/libs/infra/clients/internal/openclaw/
├── openclaw.client.ts           # 主客户端（重构后 ~400 行）
├── docker-exec.util.ts          # Docker exec 通用方法
├── websocket-manager.util.ts    # WebSocket 连接管理（可选）
├── types.ts                     # 类型定义
└── constants.ts                 # 配置常量
```
