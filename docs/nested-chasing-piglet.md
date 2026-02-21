# BotType 实施方案：基于 OpenClaw 镜像的多类型 Bot 支持

## 背景

当前 clawbot-manager 使用单一 Docker 镜像 (`openclaw:latest`) 创建所有 bot 容器。用户希望能够：

1. 使用本地克隆的 openclaw 项目 (`/Users/techwu/Documents/codes/xica.ai/openclaw`) 构建 Docker 镜像
2. 根据不同的 bot 类型使用不同的镜像
3. 在创建 bot 时允许用户选择 bot 类型

## OpenClaw 镜像结构

| 镜像类型        | Dockerfile                   | 镜像名称                                 | 用途                                      |
| --------------- | ---------------------------- | ---------------------------------------- | ----------------------------------------- |
| Gateway         | `Dockerfile`                 | `openclaw:local`                         | 主 Gateway 镜像，包含完整 OpenClaw 运行时 |
| Tool Sandbox    | `Dockerfile.sandbox`         | `openclaw-sandbox:bookworm-slim`         | 工具沙箱，最小化环境执行代码              |
| Browser Sandbox | `Dockerfile.sandbox-browser` | `openclaw-sandbox-browser:bookworm-slim` | 浏览器沙箱，包含 Chromium + VNC           |

---

## 实施步骤

### Phase 1: 数据库 Schema 变更

**文件**: `apps/api/prisma/schema.prisma`

1. 添加 `BotType` 枚举（在 `HealthStatus` 枚举后）:

```prisma
enum BotType {
  GATEWAY          // 主 Gateway bot（默认）
  TOOL_SANDBOX     // 工具沙箱容器
  BROWSER_SANDBOX  // 浏览器沙箱容器

  @@map("bot_type")
}
```

2. 在 `Bot` model 中添加 `botType` 字段:

```prisma
model Bot {
  // ... 现有字段 ...
  botType           BotType   @default(GATEWAY) @map("bot_type")
  // ... 其他字段 ...
  @@index([botType])
}
```

3. 运行迁移:

```bash
cd apps/api && pnpm db:migrate:dev --name add_bot_type
```

---

### Phase 2: API Contract 变更

**文件**: `packages/contracts/src/schemas/bot.schema.ts`

1. 添加 BotType Schema（从 Prisma 生成后自动可用）

2. 更新 `SimpleCreateBotInputSchema`:

```typescript
export const SimpleCreateBotInputSchema = z.object({
  // ... 现有字段 ...
  botType: BotTypeSchema.optional().default('GATEWAY'),
});
```

3. 更新 `CreateBotInputSchema`:

```typescript
export const CreateBotInputSchema = z.object({
  // ... 现有字段 ...
  botType: BotTypeSchema.optional().default('GATEWAY'),
});
```

4. 更新 `BotSchema` 包含 `botType` 字段

---

### Phase 3: 环境配置

**文件**: `apps/api/.env.example` 和 `.env`

```bash
# Bot Images (per type)
BOT_IMAGE_GATEWAY=openclaw:local
BOT_IMAGE_TOOL_SANDBOX=openclaw-sandbox:bookworm-slim
BOT_IMAGE_BROWSER_SANDBOX=openclaw-sandbox-browser:bookworm-slim

# OpenClaw source path (for building)
OPENCLAW_SRC_PATH=/Users/techwu/Documents/codes/xica.ai/openclaw
```

---

### Phase 4: Docker Service 变更

**文件**: `apps/api/src/modules/bot-api/services/docker.service.ts`

1. 更新 `CreateContainerOptions` 接口:

```typescript
import type { BotType } from '@prisma/client';

export interface CreateContainerOptions {
  // ... 现有字段 ...
  botType?: BotType;
}
```

2. 更新构造函数，支持多镜像映射:

```typescript
private readonly botImages: Record<BotType, string>;

constructor() {
  this.botImages = {
    GATEWAY: process.env.BOT_IMAGE_GATEWAY || 'openclaw:local',
    TOOL_SANDBOX: process.env.BOT_IMAGE_TOOL_SANDBOX || 'openclaw-sandbox:bookworm-slim',
    BROWSER_SANDBOX: process.env.BOT_IMAGE_BROWSER_SANDBOX || 'openclaw-sandbox-browser:bookworm-slim',
  };
}

private getBotImage(botType: BotType): string {
  return this.botImages[botType] || this.botImages.GATEWAY;
}
```

3. 更新 `createContainer` 方法:

```typescript
async createContainer(options: CreateContainerOptions): Promise<string> {
  const botType = options.botType || 'GATEWAY';
  const botImage = this.getBotImage(botType);

  // 容器创建时使用 botImage
  const container = await this.docker.createContainer({
    Image: botImage,
    Labels: {
      'clawbot-manager.bot-type': botType,
      // ... 其他 labels ...
    },
    // ... 根据类型调整 HostConfig ...
  });
}
```

4. 添加类型特定配置:

```typescript
private getHostConfigForBotType(botType: BotType, baseConfig: HostConfig): HostConfig {
  if (botType === 'BROWSER_SANDBOX') {
    return { ...baseConfig, ShmSize: 2 * 1024 * 1024 * 1024 }; // 2GB for Chrome
  }
  return baseConfig;
}
```

---

### Phase 5: Bot API Service 变更

**文件**: `apps/api/src/modules/bot-api/bot-api.service.ts`

1. 更新 `createBotSimple` 方法:

```typescript
const bot = await this.botService.create({
  // ... 现有字段 ...
  botType: input.botType || 'GATEWAY',
});
```

2. 更新 `startBot` 方法:

```typescript
const containerId = await this.dockerService.createContainer({
  // ... 现有参数 ...
  botType: bot.botType || 'GATEWAY',
});
```

---

### Phase 6: Docker 构建脚本

**文件**: `package.json`

```json
{
  "scripts": {
    "docker:build:all": "pnpm docker:build:gateway && pnpm docker:build:sandbox && pnpm docker:build:browser",
    "docker:build:gateway": "cd ${OPENCLAW_SRC_PATH:-../openclaw} && docker build -t openclaw:local -f Dockerfile .",
    "docker:build:sandbox": "cd ${OPENCLAW_SRC_PATH:-../openclaw} && bash scripts/sandbox-setup.sh",
    "docker:build:browser": "cd ${OPENCLAW_SRC_PATH:-../openclaw} && bash scripts/sandbox-browser-setup.sh"
  }
}
```

---

### Phase 7: 前端变更

**文件**: `apps/web/components/bots/create-wizard/wizard-context.tsx`

1. 添加 `botType` 到 WizardState:

```typescript
export interface WizardState {
  // ... 现有字段 ...
  botType: BotType;
}

const initialState: WizardState = {
  // ... 现有字段 ...
  botType: 'GATEWAY',
};
```

2. 创建 BotType 选择组件:

- `apps/web/components/bots/create-wizard/bot-type-selector.tsx`

3. 添加国际化:

- `apps/web/locales/zh-CN/bots.json`
- `apps/web/locales/en/bots.json`

---

## 关键文件清单

| 文件路径                                                        | 变更类型                      |
| --------------------------------------------------------------- | ----------------------------- |
| `apps/api/prisma/schema.prisma`                                 | 添加 BotType 枚举和字段       |
| `packages/contracts/src/schemas/bot.schema.ts`                  | 更新 Zod schemas              |
| `apps/api/src/modules/bot-api/services/docker.service.ts`       | 镜像选择、VNC 端口配置        |
| `apps/api/src/modules/bot-api/services/docker-image.service.ts` | **新建** - 镜像自动检测与构建 |
| `apps/api/src/modules/bot-api/bot-api.service.ts`               | 传递 botType 参数             |
| `apps/api/src/modules/bot-api/bot-api.module.ts`                | 注册 DockerImageService       |
| `apps/api/.env.example`                                         | 添加镜像环境变量              |
| `package.json`                                                  | 添加构建脚本                  |
| `apps/web/components/bots/create-wizard/wizard-context.tsx`     | 前端状态管理                  |
| `apps/web/components/bots/create-wizard/bot-type-selector.tsx`  | **新建** - BotType 选择组件   |
| `apps/web/locales/zh-CN/bots.json`                              | 添加国际化文本                |
| `apps/web/locales/en/bots.json`                                 | 添加国际化文本                |

---

## 验证步骤

1. **构建镜像**:

   ```bash
   pnpm docker:build:all
   ```

2. **运行数据库迁移**:

   ```bash
   cd apps/api && pnpm db:migrate:dev
   ```

3. **测试 API**:
   - 创建 GATEWAY 类型 bot（默认）
   - 创建 TOOL_SANDBOX 类型 bot
   - 创建 BROWSER_SANDBOX 类型 bot
   - 验证容器使用正确镜像

4. **验证容器**:
   ```bash
   docker inspect <container_id> | grep Image
   docker inspect <container_id> | grep -A5 Labels
   ```

---

## 设计决策

| 决策项         | 选择                                                                  |
| -------------- | --------------------------------------------------------------------- |
| Bot 类型可变性 | **不可更改** - 创建后 botType 不可修改，需删除重建                    |
| VNC 端口暴露   | **需要暴露** - BROWSER_SANDBOX 类型暴露 VNC(5900) 和 noVNC(6080) 端口 |
| 镜像构建触发   | **自动检测** - 启动时检测镜像，不存在则自动构建                       |

---

### BROWSER_SANDBOX 端口配置

**文件**: `apps/api/src/modules/bot-api/services/docker.service.ts`

```typescript
// BROWSER_SANDBOX 类型需要额外端口映射
private getBrowserSandboxPortConfig(port: number): PortBinding[] {
  return [
    { hostPort: port.toString(), containerPort: '18789' },      // Gateway
    { hostPort: (port + 1).toString(), containerPort: '9222' }, // CDP
    { hostPort: (port + 2).toString(), containerPort: '5900' }, // VNC
    { hostPort: (port + 3).toString(), containerPort: '6080' }, // noVNC
  ];
}
```

---

### 镜像自动检测与构建

**文件**: `apps/api/src/modules/bot-api/services/docker-image.service.ts` (新建)

```typescript
@Injectable()
export class DockerImageService implements OnModuleInit {
  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.ensureImagesExist();
  }

  private async ensureImagesExist(): Promise<void> {
    const imageConfigs = [
      {
        type: 'GATEWAY',
        image: process.env.BOT_IMAGE_GATEWAY || 'openclaw:local',
        dockerfile: 'Dockerfile',
      },
      {
        type: 'TOOL_SANDBOX',
        image: process.env.BOT_IMAGE_TOOL_SANDBOX,
        script: 'scripts/sandbox-setup.sh',
      },
      {
        type: 'BROWSER_SANDBOX',
        image: process.env.BOT_IMAGE_BROWSER_SANDBOX,
        script: 'scripts/sandbox-browser-setup.sh',
      },
    ];

    for (const config of imageConfigs) {
      if (!(await this.imageExists(config.image))) {
        this.logger.log(`Image ${config.image} not found, building...`);
        await this.buildImage(config);
      }
    }
  }

  private async imageExists(imageName: string): Promise<boolean> {
    try {
      await this.docker.getImage(imageName).inspect();
      return true;
    } catch {
      return false;
    }
  }

  private async buildImage(config: ImageConfig): Promise<void> {
    const openclawPath = process.env.OPENCLAW_SRC_PATH || '../openclaw';
    // 执行构建命令...
  }
}
```

---

## 迁移策略

- 所有现有 bot 自动获得 `GATEWAY` 类型（默认值）
- `BOT_IMAGE` 环境变量作为 `BOT_IMAGE_GATEWAY` 的 fallback
- API 向后兼容：不传 `botType` 时默认使用 `GATEWAY`
- **botType 字段不包含在更新 API 中**，确保不可更改
