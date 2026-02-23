# OpenClaw Client 重构优化方案 V2

## 概述

基于对 `openclaw.client.ts` 的深度分析，本文档提出一套更系统化的重构方案。核心思路是将 **Docker 操作** 与 **OpenClaw Gateway 通信** 职责分离，提高代码可维护性和安全性。

---

## 一、当前架构问题

### 1.1 职责混乱

当前 `OpenClawClient` 承担了两个完全不同的职责：
- **Docker 容器管理**：exec 命令执行、技能列表获取、MCP 配置注入
- **OpenClaw Gateway 通信**：WebSocket 聊天、健康检查

这违反了单一职责原则，导致代码臃肿（1100+ 行）且难以维护。

### 1.2 代码重复

Docker exec 模式在 **5 个方法** 中重复：
| 方法 | 行号 | 用途 |
|------|------|------|
| `switchModel()` | 150-219 | 模型切换 |
| `execSkillScript()` | 225-316 | 技能脚本执行 |
| `execInContainer()` | 722-786 | 通用命令执行 |
| `injectMcpConfig()` | 924-1003 | MCP 配置注入 |
| `removeMcpConfig()` | 1010-1085 | MCP 配置移除 |

### 1.3 严重 Bug

#### Bug 1: `injectMcpConfig()` 缺少 socketPath（Line 948-964）

```typescript
// 当前代码（错误）
const execCreateResponse = await firstValueFrom(
  this.httpService
    .post(execCreateUrl, {  // ← 缺少第三个参数 config
      AttachStdout: true,
      AttachStderr: true,
      Cmd: ['node', '-e', nodeScript],
    })
    .pipe(...)
);
```

这导致请求无法到达 Docker API，功能完全失效。

#### Bug 2: `removeMcpConfig()` 同样缺少 socketPath（Line 1029-1045）

同样的问题。

### 1.4 安全漏洞

#### Shell 注入风险（Line 1019）

```typescript
const nodeScript = `
  ...
  delete config.mcpServers.${serverName};  // ← 危险：未转义
  ...
`;
```

如果 `serverName` 包含特殊字符或恶意代码，可能导致注入攻击。

---

## 二、重构方案

### 2.1 架构重构

将 `OpenClawClient` 拆分为两个独立的 Service：

```
apps/api/libs/infra/clients/internal/openclaw/
├── docker-exec.service.ts      # Docker 容器操作（新建）
├── openclaw-gateway.client.ts  # OpenClaw Gateway 通信（重构后）
├── openclaw.module.ts          # NestJS 模块
└── types.ts                    # 共享类型定义
```

**职责划分**：
- `DockerExecService`：所有 Docker exec 操作，提供通用的 `executeCommand()` 方法
- `OpenClawGatewayClient`：WebSocket 聊天、健康检查，通过 DockerExecService 操作容器

### 2.2 DockerExecService 设计

```typescript
// docker-exec.service.ts

export interface DockerExecOptions {
  /** 执行超时（毫秒），默认 15000 */
  timeout?: number;
  /** 执行用户，默认容器默认用户 */
  user?: string;
  /** 是否在失败时抛出错误，默认 false */
  throwOnError?: boolean;
  /** 是否返回 stderr，默认 false */
  includeStderr?: boolean;
}

export interface DockerExecResult {
  /** stdout 输出 */
  stdout: string;
  /** stderr 输出 */
  stderr: string;
  /** 是否执行成功（无错误抛出） */
  success: boolean;
  /** 执行耗时（毫秒） */
  durationMs: number;
}

@Injectable()
export class DockerExecService {
  private readonly defaultTimeout = 15000;
  private readonly dockerSocket = '/var/run/docker.sock';

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly httpService: HttpService,
  ) {}

  /**
   * 在容器内执行命令
   *
   * @param containerId 容器 ID
   * @param cmd 命令数组，如 ['node', '-e', script]
   * @param options 执行选项
   */
  async executeCommand(
    containerId: string,
    cmd: string[],
    options?: DockerExecOptions,
  ): Promise<DockerExecResult> {
    const {
      timeout: execTimeout = this.defaultTimeout,
      user,
      throwOnError = false,
      includeStderr = false,
    } = options ?? {};

    const startTime = Date.now();

    try {
      // Step 1: 创建 exec 实例
      const execId = await this.createExec(containerId, cmd, { user, timeout: execTimeout });

      // Step 2: 启动 exec 并获取输出
      const rawOutput = await this.startExec(execId, execTimeout);

      // Step 3: 解析输出
      const { stdout, stderr } = this.parseOutput(rawOutput);

      return {
        stdout,
        stderr,
        success: true,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('DockerExecService: 命令执行失败', {
        containerId,
        cmd: cmd.join(' '),
        error: errorMessage,
      });

      if (throwOnError) {
        throw error;
      }

      return {
        stdout: '',
        stderr: errorMessage,
        success: false,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * 执行 Node.js 脚本（安全封装）
   */
  async executeNodeScript(
    containerId: string,
    script: string,
    options?: DockerExecOptions,
  ): Promise<DockerExecResult> {
    return this.executeCommand(containerId, ['node', '-e', script], options);
  }

  /**
   * 执行 Shell 命令（带安全校验）
   */
  async executeShellCommand(
    containerId: string,
    command: string,
    options?: DockerExecOptions,
  ): Promise<DockerExecResult> {
    return this.executeCommand(containerId, ['sh', '-c', command], options);
  }

  // --- 私有方法 ---

  private async createExec(
    containerId: string,
    cmd: string[],
    options: { user?: string; timeout: number },
  ): Promise<string> {
    const execCreateUrl = `http://localhost/containers/${containerId}/exec`;
    const execCreateBody: Record<string, unknown> = {
      AttachStdout: true,
      AttachStderr: true,
      Cmd: cmd,
    };
    if (options.user) {
      execCreateBody.User = options.user;
    }

    const response = await firstValueFrom(
      this.httpService
        .post(execCreateUrl, execCreateBody, {
          socketPath: this.dockerSocket,
          timeout: options.timeout,
        })
        .pipe(
          timeout(options.timeout),
          catchError((error) => {
            this.logger.error('DockerExecService: 创建 exec 失败', {
              containerId,
              cmd: cmd.join(' '),
              error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
          }),
        ),
    );

    const execId = response.data?.Id;
    if (!execId) {
      throw new Error('Failed to create exec instance: no exec ID returned');
    }
    return execId;
  }

  private async startExec(execId: string, timeoutMs: number): Promise<ArrayBuffer> {
    const execStartUrl = `http://localhost/exec/${execId}/start`;

    const response = await firstValueFrom(
      this.httpService
        .post(execStartUrl, { Detach: false, Tty: false }, {
          socketPath: this.dockerSocket,
          timeout: timeoutMs,
          responseType: 'arraybuffer',
        })
        .pipe(
          timeout(timeoutMs),
          catchError((error) => {
            this.logger.error('DockerExecService: 启动 exec 失败', {
              execId,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
          }),
        ),
    );

    return response.data;
  }

  private parseOutput(data: ArrayBuffer): { stdout: string; stderr: string } {
    const buffer = Buffer.from(data);
    let stdout = '';
    let stderr = '';
    let offset = 0;

    // Docker 多路复用流格式：每帧 8 字节头 + payload
    while (offset + 8 <= buffer.length) {
      const streamType = buffer[offset];
      const size = buffer.readUInt32BE(offset + 4);
      offset += 8;

      if (offset + size > buffer.length) break;

      const content = buffer.subarray(offset, offset + size).toString('utf-8');
      if (streamType === 1) {
        stdout += content;
      } else if (streamType === 2) {
        stderr += content;
      }
      offset += size;
    }

    // 如果解析失败（非多路复用格式），返回原始字符串作为 stdout
    if (!stdout && !stderr && buffer.length > 0) {
      stdout = buffer.toString('utf-8');
    }

    return { stdout: stdout.trim(), stderr: stderr.trim() };
  }
}
```

### 2.3 OpenClawGatewayClient 重构

```typescript
// openclaw-gateway.client.ts

@Injectable()
export class OpenClawGatewayClient {
  private readonly wsTimeout = 120000;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly dockerExec: DockerExecService,
    private readonly httpService: HttpService,
  ) {}

  // --- WebSocket 通信 ---

  async chat(port: number, token: string, message: string, options?: OpenClawChatOptions): Promise<string> {
    // ... 保持现有 WebSocket 逻辑
  }

  async checkHealth(port: number): Promise<boolean> {
    // ... 保持现有健康检查逻辑
  }

  // --- 容器操作（通过 DockerExecService） ---

  async switchModel(containerId: string, model: string): Promise<void> {
    this.logger.info('OpenClawGatewayClient: 切换模型', { containerId, model });

    const { success, stderr } = await this.dockerExec.executeCommand(
      containerId,
      ['node', '/app/openclaw.mjs', 'models', 'set', model],
      { timeout: 10000 },
    );

    if (!success) {
      this.logger.warn('OpenClawGatewayClient: 模型切换失败', { containerId, model, stderr });
      // 不抛出错误，允许继续使用当前模型
    } else {
      this.logger.info('OpenClawGatewayClient: 模型切换成功', { containerId, model });
    }
  }

  async execSkillScript(
    containerId: string,
    skillName: string,
    scriptName: string = 'init.sh',
  ): Promise<{ stdout: string; success: boolean } | null> {
    // 安全校验
    const safeNamePattern = /^[a-zA-Z0-9_\-.]+$/;
    if (!safeNamePattern.test(skillName) || !safeNamePattern.test(scriptName)) {
      this.logger.warn('OpenClawGatewayClient: 非法技能名或脚本名', { skillName, scriptName });
      return null;
    }

    const scriptPath = `/home/node/.openclaw/skills/${skillName}/scripts/${scriptName}`;
    this.logger.info('OpenClawGatewayClient: 执行技能脚本', { containerId, skillName, scriptPath });

    const result = await this.dockerExec.executeCommand(
      containerId,
      ['sh', scriptPath],
      { user: 'node', timeout: 30000 },
    );

    if (result.success) {
      this.logger.info('OpenClawGatewayClient: 脚本执行完成', {
        containerId,
        skillName,
        outputLength: result.stdout.length,
      });
    } else {
      this.logger.error('OpenClawGatewayClient: 脚本执行失败', {
        containerId,
        skillName,
        stderr: result.stderr,
      });
    }

    return { stdout: result.stdout, success: result.success };
  }

  async listContainerSkills(containerId: string): Promise<ContainerSkillItem[] | null> {
    this.logger.info('OpenClawGatewayClient: 获取容器内置技能', { containerId });

    // 尝试 CLI 命令
    const cliResult = await this.dockerExec.executeCommand(
      containerId,
      ['node', '/app/openclaw.mjs', 'skills', 'list', '--json'],
      { timeout: 15000 },
    );

    let skills: ContainerSkillItem[] | null = null;

    if (cliResult.success && cliResult.stdout) {
      try {
        const parsed = JSON.parse(cliResult.stdout);
        skills = this.normalizeSkillsList(parsed);
      } catch {
        this.logger.warn('OpenClawGatewayClient: CLI 输出解析失败，尝试读取配置文件', {
          containerId,
          outputPreview: cliResult.stdout.substring(0, 200),
        });
      }
    }

    // Fallback: 读取配置文件
    if (!skills) {
      const configResult = await this.dockerExec.executeCommand(
        containerId,
        ['cat', '/home/node/.openclaw/openclaw.json'],
        { timeout: 10000 },
      );

      if (configResult.success && configResult.stdout) {
        try {
          const config = JSON.parse(configResult.stdout);
          skills = this.parseSkillsFromConfig(config);
        } catch {
          this.logger.warn('OpenClawGatewayClient: 配置文件解析失败', { containerId });
        }
      }
    }

    if (!skills) return null;

    // 批量读取技能内容
    await this.enrichSkillsWithContent(containerId, skills);

    return skills;
  }

  async injectMcpConfig(
    containerId: string,
    mcpServers: Record<string, McpServerConfig>,
  ): Promise<void> {
    this.logger.info('OpenClawGatewayClient: 注入 MCP 配置', { containerId });

    // 安全序列化 MCP 配置
    const mcpServersJson = JSON.stringify(mcpServers);
    const escapedJson = mcpServersJson.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    const nodeScript = `
      const fs = require("fs");
      const configPath = "/home/node/.openclaw/openclaw.json";
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      config.mcpServers = config.mcpServers || {};
      const newServers = JSON.parse("${escapedJson}");
      for (const [name, server] of Object.entries(newServers)) {
        config.mcpServers[name] = server;
      }
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
      console.log(JSON.stringify({ success: true }));
    `;

    const result = await this.dockerExec.executeNodeScript(containerId, nodeScript, {
      timeout: 15000,
      throwOnError: true,
    });

    this.logger.info('OpenClawGatewayClient: MCP 配置注入完成', {
      containerId,
      plugins: Object.keys(mcpServers),
      output: result.stdout,
    });
  }

  async removeMcpConfig(containerId: string, serverName: string): Promise<void> {
    this.logger.info('OpenClawGatewayClient: 移除 MCP 配置', { containerId, serverName });

    // 安全校验：只允许合法字符
    const safeNamePattern = /^[a-zA-Z0-9_\-.]+$/;
    if (!safeNamePattern.test(serverName)) {
      throw new Error(`Invalid server name: ${serverName}`);
    }

    // 安全的属性删除方式
    const nodeScript = `
      const fs = require("fs");
      const configPath = "/home/node/.openclaw/openclaw.json";
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (config.mcpServers) {
        delete config.mcpServers["${serverName}"];
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
        console.log(JSON.stringify({ success: true, removed: "${serverName}" }));
      } else {
        console.log(JSON.stringify({ success: true, message: "No mcpServers found" }));
      }
    `;

    const result = await this.dockerExec.executeNodeScript(containerId, nodeScript, {
      timeout: 10000,
      throwOnError: true,
    });

    this.logger.info('OpenClawGatewayClient: MCP 配置移除完成', {
      containerId,
      serverName,
      output: result.stdout,
    });
  }

  // --- 私有辅助方法保持不变 ---
  private normalizeSkillsList(parsed: unknown): ContainerSkillItem[] { /* ... */ }
  private parseSkillsFromConfig(config: unknown): ContainerSkillItem[] { /* ... */ }
  private async enrichSkillsWithContent(containerId: string, skills: ContainerSkillItem[]): Promise<void> { /* ... */ }
  private sendMessageViaWebSocket(...): Promise<string> { /* ... */ }
  private parseDockerExecOutput(data: ArrayBuffer | Buffer): string { /* ... */ }
}
```

---

## 三、立即修复（P0 - 必须修复）

### 3.1 修复 `injectMcpConfig()` 缺少 socketPath

**文件**: `openclaw.client.ts` Line 948-964

```typescript
// 修复前
const execCreateResponse = await firstValueFrom(
  this.httpService.post(execCreateUrl, {
    AttachStdout: true,
    AttachStderr: true,
    Cmd: ['node', '-e', nodeScript],
  }).pipe(...)
);

// 修复后
const execCreateResponse = await firstValueFrom(
  this.httpService.post(
    execCreateUrl,
    {
      AttachStdout: true,
      AttachStderr: true,
      Cmd: ['node', '-e', nodeScript],
    },
    {
      socketPath: '/var/run/docker.sock',  // ← 添加
      timeout: 15000,
    }
  ).pipe(...)
);
```

### 3.2 修复 `removeMcpConfig()` 缺少 socketPath

**文件**: `openclaw.client.ts` Line 1029-1045

同上，添加第三个参数 `{ socketPath: '/var/run/docker.sock', timeout: 10000 }`。

### 3.3 修复 `removeMcpConfig()` Shell 注入风险

**文件**: `openclaw.client.ts` Line 1019

```typescript
// 修复前（危险）
const nodeScript = `
  delete config.mcpServers.${serverName};  // ← 直接插值
`;

// 修复后（安全）
// 1. 添加参数校验
const safeNamePattern = /^[a-zA-Z0-9_\-.]+$/;
if (!safeNamePattern.test(serverName)) {
  throw new Error(`Invalid server name: ${serverName}`);
}

// 2. 使用引号包裹属性名
const nodeScript = `
  delete config.mcpServers["${serverName}"];  // ← 使用引号
`;
```

---

## 四、优化改进（P1 - 建议实现）

### 4.1 超时配置集中化

```typescript
@Injectable()
export class OpenClawClient {
  // 集中配置
  private readonly config = {
    requestTimeout: 120000,
    wsTimeout: 120000,
    dockerExec: {
      create: 10000,
      default: 15000,
      script: 30000,
    },
    healthCheck: 5000,
  };
}
```

### 4.2 改进日志输出

```typescript
// 统一日志格式，包含 containerId 和操作类型
this.logger.info('OpenClawClient: 操作完成', {
  operation: 'switchModel',
  containerId,
  model,
  durationMs,
  success: true,
});
```

### 4.3 添加指标收集（可选）

```typescript
// 收集执行指标，用于监控和诊断
interface ExecMetrics {
  operation: string;
  containerId: string;
  durationMs: number;
  success: boolean;
  errorType?: string;
}
```

---

## 五、实施计划

| 阶段 | 任务 | 优先级 | 预计工作量 |
|------|------|--------|-----------|
| **Phase 1** | 修复 P0 Bug（socketPath + 注入风险） | P0 | 30 分钟 |
| **Phase 2** | 创建 DockerExecService | P1 | 2 小时 |
| **Phase 3** | 重构 OpenClawGatewayClient | P1 | 1 小时 |
| **Phase 4** | 超时配置集中化 | P2 | 30 分钟 |
| **Phase 5** | 单元测试 | P2 | 2 小时 |

### 立即行动项

1. **今天必须完成**: 修复 `injectMcpConfig()` 和 `removeMcpConfig()` 的 socketPath 问题
2. **本周完成**: 添加 serverName 安全校验
3. **下周**: 开始 DockerExecService 重构

---

## 六、文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `openclaw.client.ts` | 修改 | P0 Bug 修复 |
| `docker-exec.service.ts` | 新建 | Docker exec 通用服务 |
| `openclaw-gateway.client.ts` | 新建 | 重构后的 Gateway 客户端 |
| `openclaw.module.ts` | 修改 | 注册新服务 |
| `types.ts` | 新建 | 共享类型定义 |

---

## 七、向后兼容性

重构期间保持 `OpenClawClient` 的现有接口不变：

```typescript
// 现有调用方式继续工作
openClawClient.chat(port, token, message, options);
openClawClient.switchModel(containerId, model);
openClawClient.listContainerSkills(containerId);
openClawClient.injectMcpConfig(containerId, mcpServers);
openClawClient.removeMcpConfig(containerId, serverName);
```

内部实现逐步迁移到 `DockerExecService`。
