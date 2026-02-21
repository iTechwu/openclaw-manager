# Feishu 通道迁移实施文档

## 实施状态

| Phase | 状态 | 完成日期 |
|-------|------|----------|
| Phase 1: 更新 Workspace 配置生成 | ✅ 已完成 | 2026-02-21 |
| Phase 2: 简化 BotChannelStartupService | ✅ 已完成 | 2026-02-21 |
| Phase 3: 删除冗余代码 | 📋 待OpenClaw验证后执行 |
| Phase 4: 更新 OpenClaw 配置模板 | ✅ 已完成 | 2026-02-21 |
| Phase 5: 创建数据迁移脚本 | ✅ 已完成 | 2026-02-21 |
| Phase 6: 测试验证 | 📋 待开始 |

---

## 前置条件确认

- [x] OpenClaw 镜像包含 feishu 扩展 (`extensions/feishu/`)
- [x] OpenClaw 支持通过 `openclaw.json` 配置飞书通道
- [x] 功能对齐：消息收发、多模态、群聊、DM 配对

---

## 迁移概览

```
┌─────────────────────────────────────────────────────────────────────┐
│                         迁移范围                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  需要修改的文件:                                                      │
│  ├── apps/api/src/modules/bot-api/services/workspace.service.ts     │
│  ├── apps/api/src/modules/bot-channel-api/bot-channel-api.module.ts│
│  ├── apps/api/src/modules/bot-channel-api/bot-channel-startup.*.ts │
│  └── apps/api/prisma/schema.prisma (可能需要调整)                    │
│                                                                      │
│  需要删除的文件:                                                      │
│  ├── apps/api/src/modules/bot-channel-api/feishu-message-handler.* │
│  ├── apps/api/libs/infra/clients/internal/feishu/                   │
│  │   ├── feishu-client.service.ts                                    │
│  │   ├── feishu-client.module.ts                                     │
│  │   ├── feishu-message-parser.ts                                    │
│  │   └── feishu.types.ts                                             │
│  └── (保留) feishu-api.client.ts (用于验证)                          │
│                                                                      │
│  需要新增的文件:                                                      │
│  └── 无 (使用 OpenClaw 原生功能)                                      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: 更新 Workspace 配置生成

### 1.1 修改 WorkspaceService

**文件**: `apps/api/src/modules/bot-api/services/workspace.service.ts`

**目标**: 在创建 workspace 时，将飞书通道配置写入 `openclaw.json`

```typescript
// 新增方法：生成飞书通道配置
private buildFeishuChannelConfig(channels: BotChannel[]): Record<string, any> {
  const feishuChannels = channels.filter(c => c.channelType === 'feishu');
  if (feishuChannels.length === 0) {
    return {};
  }

  const config: Record<string, any> = {};

  for (const channel of feishuChannels) {
    const credentials = channel.credentials as any;
    const accountId = channel.accountId || 'default';

    config[accountId] = {
      appId: credentials.appId,
      appSecret: credentials.appSecret,
      dmPolicy: channel.dmPolicy || 'pairing',
      allowFrom: channel.allowFrom || [],
      enabled: channel.isEnabled ?? true,
    };

    // 如果有自定义域名
    if (credentials.domain) {
      config[accountId].domain = credentials.domain;
    }
  }

  return config;
}

// 修改 createWorkspace 方法
async createWorkspace(options: WorkspaceOptions): Promise<string> {
  // ... 现有代码 ...

  // 构建 openclaw.json 配置
  const openclawConfig = {
    // 现有配置
    gateway: {
      port: 18789,
      auth: {
        mode: 'token',
        token: gatewayToken,
      },
    },
    model: {
      provider: aiProvider,
      model: model,
    },

    // 新增：飞书通道配置
    channels: {
      feishu: this.buildFeishuChannelConfig(options.channels),
    },
  };

  // 写入 openclaw.json
  const configPath = path.join(workspacePath, 'openclaw.json');
  await fs.writeJson(configPath, openclawConfig, { spaces: 2 });

  // ... 其余代码 ...
}
```

### 1.2 更新 BotChannel Schema

**文件**: `apps/api/prisma/schema.prisma`

确保 BotChannel 模型包含以下字段（可能已存在）：

```prisma
model BotChannel {
  // ... 现有字段 ...

  // 飞书特定配置
  dmPolicy    String?   @map("dm_policy")     // 'pairing' | 'open'
  allowFrom   String[]  @map("allow_from")    // 允许的用户 ID 列表
  accountId   String?   @map("account_id")    // 多账户支持
  isEnabled   Boolean   @default(true) @map("is_enabled")
}
```

---

## Phase 2: 简化 BotChannelStartupService

### 2.1 移除飞书连接逻辑

**文件**: `apps/api/src/modules/bot-channel-api/bot-channel-startup.service.ts`

**修改前**:
```typescript
// 当前：启动时主动建立飞书 WebSocket 连接
async connectFeishuChannel(channel: BotChannel) {
  const credentials = channel.credentials;
  await this.feishuClientService.createConnection(channel, credentials);
}
```

**修改后**:
```typescript
// 简化：仅验证配置并更新状态
async validateFeishuChannel(channel: BotChannel): Promise<boolean> {
  const credentials = channel.credentials as any;
  if (!credentials.appId || !credentials.appSecret) {
    await this.botChannelDb.update(
      { id: channel.id },
      {
        connectionStatus: 'DISCONNECTED',
        lastError: 'Missing appId or appSecret',
      },
    );
    return false;
  }

  // 验证凭证有效性（可选）
  try {
    const isValid = await this.feishuApiClient.validateCredentials(
      credentials.appId,
      credentials.appSecret,
    );

    await this.botChannelDb.update(
      { id: channel.id },
      {
        connectionStatus: isValid ? 'PENDING' : 'DISCONNECTED',
        lastError: isValid ? null : 'Invalid credentials',
      },
    );
    return isValid;
  } catch (error) {
    this.logger.error('Failed to validate feishu credentials', { channelId: channel.id, error });
    return false;
  }
}
```

### 2.2 更新 onModuleInit

```typescript
async onModuleInit() {
  // 获取所有需要连接的飞书通道
  const { list: feishuChannels } = await this.botChannelDb.list(
    { channelType: 'feishu', isEnabled: true },
    {},
  );

  for (const channel of feishuChannels) {
    // 不再主动连接，只验证配置
    await this.validateFeishuChannel(channel);
  }

  this.logger.log(`Validated ${feishuChannels.length} feishu channels`);
}
```

---

## Phase 3: 删除冗余代码

### 3.1 删除文件列表

```bash
# 删除飞书消息处理相关文件
rm apps/api/src/modules/bot-channel-api/feishu-message-handler.service.ts

# 删除飞书客户端连接管理
rm apps/api/libs/infra/clients/internal/feishu/feishu-client.service.ts
rm apps/api/libs/infra/clients/internal/feishu/feishu-client.module.ts
rm apps/api/libs/infra/clients/internal/feishu/feishu-message-parser.ts
rm apps/api/libs/infra/clients/internal/feishu/feishu.types.ts

# 保留 API 客户端（用于验证和管理操作）
# apps/api/libs/infra/clients/internal/feishu/feishu-api.client.ts
# apps/api/libs/infra/clients/internal/feishu/feishu-sdk.client.ts
```

### 3.2 更新模块依赖

**文件**: `apps/api/src/modules/bot-channel-api/bot-channel-api.module.ts`

```typescript
// 移除导入
// import { FeishuClientModule } from '@app/clients/internal/feishu';
// import { FeishuMessageHandlerService } from './feishu-message-handler.service';

@Module({
  imports: [
    // 移除 FeishuClientModule
    // FeishuClientModule,

    // 保留其他模块
    DbModule,
    // ...
  ],
  providers: [
    BotChannelApiService,
    BotChannelStartupService,
    // 移除 FeishuMessageHandlerService
    // FeishuMessageHandlerService,
  ],
  // ...
})
export class BotChannelApiModule {}
```

### 3.3 更新 FeishuClientService 导出

**文件**: `apps/api/libs/infra/clients/internal/feishu/index.ts`

```typescript
// 修改前
export * from './feishu-client.service';
export * from './feishu-message-parser';
export * from './feishu.types';

// 修改后：只保留 API 客户端
export * from './feishu-api.client';
export * from './feishu-sdk.client';
```

---

## Phase 4: 更新 OpenClaw 配置模板

### 4.1 修改容器启动脚本

**文件**: `apps/api/src/modules/bot-api/services/docker.service.ts`

确保容器启动时正确挂载 `openclaw.json`：

```typescript
// 在 createContainer 方法中
const container = await this.docker.createContainer({
  // ... 其他配置 ...

  HostConfig: {
    Binds: [
      // 现有挂载
      `${workspacePath}:/home/node/.openclaw`,

      // 确保 openclaw.json 可读写
      `${workspacePath}/openclaw.json:/home/node/.openclaw/openclaw.json:rw`,
    ],
  },

  // 启动命令保持不变，OpenClaw 会自动读取配置
  // ...
});
```

### 4.2 配置文件示例

**生成的 `openclaw.json` 示例**:

```json
{
  "gateway": {
    "port": 18789,
    "auth": {
      "mode": "token",
      "token": "bot-gateway-token-xxx"
    }
  },
  "model": {
    "provider": "openai",
    "model": "gpt-4o"
  },
  "channels": {
    "feishu": {
      "default": {
        "appId": "cli_a90efcbf2239dbb6",
        "appSecret": "oWpyZp0N33Aw34r7pvFtefHkad3HDzn7",
        "dmPolicy": "pairing",
        "allowFrom": [],
        "enabled": true
      }
    }
  }
}
```

---

## Phase 5: 数据迁移

### 5.1 现有 Bot 迁移脚本

创建迁移脚本为现有 Bot 生成正确的 `openclaw.json`：

**文件**: `apps/api/scripts/migrate-feishu-channels.ts`

```typescript
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs-extra';
import * as path from 'path';

const prisma = new PrismaClient();

async function migrateFeishuChannels() {
  console.log('Starting feishu channel migration...');

  // 获取所有飞书通道
  const channels = await prisma.botChannel.findMany({
    where: { channelType: 'feishu' },
    include: { bot: true },
  });

  console.log(`Found ${channels.length} feishu channels to migrate`);

  for (const channel of channels) {
    const bot = channel.bot;
    if (!bot || !bot.hostname) {
      console.log(`Skipping channel ${channel.id}: no associated bot`);
      continue;
    }

    // 构建工作空间路径
    const workspacePath = path.join(
      process.env.BOT_DATA_DIR || '/data/bots',
      bot.createdById,
      bot.hostname,
    );

    const configPath = path.join(workspacePath, 'openclaw.json');

    // 读取现有配置
    let config: any = {};
    if (await fs.pathExists(configPath)) {
      config = await fs.readJson(configPath);
    }

    // 添加飞书通道配置
    const credentials = channel.credentials as any;
    config.channels = config.channels || {};
    config.channels.feishu = config.channels.feishu || {};
    config.channels.feishu[channel.accountId || 'default'] = {
      appId: credentials.appId,
      appSecret: credentials.appSecret,
      dmPolicy: channel.dmPolicy || 'pairing',
      allowFrom: channel.allowFrom || [],
      enabled: channel.isEnabled ?? true,
    };

    // 写入配置
    await fs.ensureDir(workspacePath);
    await fs.writeJson(configPath, config, { spaces: 2 });

    console.log(`Migrated channel ${channel.id} for bot ${bot.hostname}`);
  }

  console.log('Migration completed!');
}

migrateFeishuChannels()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

### 5.2 执行迁移

```bash
# 运行迁移脚本
npx ts-node apps/api/scripts/migrate-feishu-channels.ts

# 验证配置文件
ls -la /data/bots/*/*/openclaw.json
```

---

## Phase 6: 测试验证

### 6.1 测试清单

| 测试项 | 验证方法 | 状态 |
|--------|---------|------|
| Bot 创建 | 创建新 Bot 并配置飞书通道 | [ ] |
| 配置生成 | 检查 `openclaw.json` 包含飞书配置 | [ ] |
| 容器启动 | 确认容器正常启动，无错误日志 | [ ] |
| 飞书连接 | 在 OpenClaw 日志中确认飞书连接成功 | [ ] |
| 消息收发 | 发送测试消息，验证 AI 回复 | [ ] |
| 多模态 | 发送图片/文件，验证处理 | [ ] |
| 群聊 | 在群聊中 @Bot，验证响应 | [ ] |
| DM 配对 | 新用户发送消息，验证配对流程 | [ ] |

### 6.2 日志验证

```bash
# 检查 OpenClaw 网关日志
docker logs <container_id> | grep -i feishu

# 期望输出类似：
# [feishu] Starting provider for account default
# [feishu] Connected to Feishu gateway
# [feishu] Bot xxx is online
```

### 6.3 状态验证

```bash
# 检查通道状态
curl http://localhost:3200/api/bot/<hostname>/channels

# 期望返回：
# {
#   "channels": [{
#     "channelType": "feishu",
#     "connectionStatus": "CONNECTED",
#     ...
#   }]
# }
```

---

## 回滚计划

### 快速回滚

如果迁移出现问题，可以快速回滚：

```bash
# 1. 恢复删除的文件
git checkout -- apps/api/src/modules/bot-channel-api/
git checkout -- apps/api/libs/infra/clients/internal/feishu/

# 2. 恢复模块依赖
# 手动编辑 bot-channel-api.module.ts 恢复导入

# 3. 重启服务
pnpm dev:api
```

### 部分回滚

如果只是某些 Bot 有问题，可以：

1. 保留新架构代码
2. 为有问题的 Bot 重新生成 `openclaw.json`
3. 重启对应的 Bot 容器

---

## 时间估算

| 阶段 | 任务 | 预计时间 |
|------|------|---------|
| Phase 1 | 更新 Workspace 配置生成 | 2 小时 |
| Phase 2 | 简化 BotChannelStartupService | 1 小时 |
| Phase 3 | 删除冗余代码 | 1 小时 |
| Phase 4 | 更新 OpenClaw 配置模板 | 1 小时 |
| Phase 5 | 数据迁移 | 2 小时 |
| Phase 6 | 测试验证 | 2 小时 |
| **总计** | | **9 小时** |

---

## 附录：文件变更汇总

### 修改的文件

| 文件路径 | 变更类型 | 说明 |
|---------|---------|------|
| `apps/api/src/modules/bot-api/services/workspace.service.ts` | 修改 | 添加飞书配置生成 |
| `apps/api/src/modules/bot-channel-api/bot-channel-startup.service.ts` | 修改 | 简化为仅验证配置 |
| `apps/api/src/modules/bot-channel-api/bot-channel-api.module.ts` | 修改 | 移除冗余依赖 |
| `apps/api/libs/infra/clients/internal/feishu/index.ts` | 修改 | 移除已删除文件导出 |

### 删除的文件

| 文件路径 | 说明 |
|---------|------|
| `apps/api/src/modules/bot-channel-api/feishu-message-handler.service.ts` | 消息处理（由 OpenClaw 处理） |
| `apps/api/libs/infra/clients/internal/feishu/feishu-client.service.ts` | 连接管理（由 OpenClaw 处理） |
| `apps/api/libs/infra/clients/internal/feishu/feishu-client.module.ts` | 模块定义 |
| `apps/api/libs/infra/clients/internal/feishu/feishu-message-parser.ts` | 消息解析（由 OpenClaw 处理） |
| `apps/api/libs/infra/clients/internal/feishu/feishu.types.ts` | 类型定义（移至 contracts） |

### 保留的文件

| 文件路径 | 说明 |
|---------|------|
| `apps/api/libs/infra/clients/internal/feishu/feishu-api.client.ts` | API 调用（用于验证） |
| `apps/api/libs/infra/clients/internal/feishu/feishu-sdk.client.ts` | SDK 封装（管理操作） |

### 新增的文件

| 文件路径 | 说明 |
|---------|------|
| `apps/api/scripts/migrate-feishu-channels.ts` | 数据迁移脚本 |

---

## 完成标志

- [x] Phase 1 完成：Workspace 配置生成已更新
- [x] Phase 2 完成：BotChannelStartupService 已简化
- [ ] Phase 3 完成：冗余代码已删除（待 OpenClaw 验证后执行）
- [x] Phase 4 完成：OpenClaw 配置模板已更新
- [x] Phase 5 完成：现有数据已迁移
- [ ] Phase 6 完成：所有测试通过
- [x] 文档已更新

---

## 实际修改的文件清单

### 已修改

| 文件路径 | 变更说明 |
|---------|---------|
| `apps/api/src/modules/bot-api/services/workspace.service.ts` | 添加 `buildFeishuChannelConfig()`、`buildOpenclawConfig()`、`updateFeishuChannelConfig()`、`removeFeishuChannelConfig()`、`syncFeishuChannelsConfig()` 方法 |
| `apps/api/src/modules/bot-channel-api/bot-channel-api.service.ts` | 添加 `WorkspaceService` 注入，在创建/更新/删除通道时更新 openclaw.json |
| `apps/api/src/modules/bot-channel-api/bot-channel-api.module.ts` | 添加 `BotApiModule` 导入 |
| `apps/api/src/modules/bot-channel-api/bot-channel-startup.service.ts` | 简化为仅验证配置，移除 WebSocket 连接逻辑 |

### 已新增

| 文件路径 | 说明 |
|---------|------|
| `apps/api/scripts/migrate-feishu-channels.ts` | 数据迁移脚本 |

---

*文档创建时间: 2026-02-21*
*最后更新: 2026-02-21*
