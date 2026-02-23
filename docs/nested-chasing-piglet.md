# BotType 实施方案：基于 OpenClaw 镜像的多类型 Bot 支持

## ✅ 实施状态

| Phase | 状态 | 完成日期 |
|-------|------|----------|
| Phase 1: 数据库 Schema | ✅ 已完成 | 2026-02-21 |
| Phase 2: API Contract | ✅ 已完成 | 2026-02-21 |
| Phase 3: 环境配置 | ✅ 已完成 | 2026-02-21 |
| Phase 4: Docker Service | ✅ 已完成 | 2026-02-21 |
| Phase 5: Bot API Service | ✅ 已完成 | 2026-02-21 |
| Phase 6: Docker 构建脚本 | ✅ 已完成 | 2026-02-21 |
| Phase 7: 前端变更 | ✅ 已完成 | 2026-02-21 |
| Phase 8: 清理过时配置 | ✅ 已完成 | 2026-02-21 |
| Phase 9: 使用本地 openclaw 构建 | ✅ 已完成 | 2026-02-21 |

---

## 背景

当前 clawbot-manager 使用单一 Docker 镜像创建所有 bot 容器。本方案实现：
1. 使用本地克隆的 openclaw 项目 (`/Users/techwu/Documents/codes/xica.ai/openclaw`) 构建 Docker 镜像
2. 根据不同的 bot 类型使用不同的镜像
3. 在创建 bot 时允许用户选择 bot 类型
4. **不使用网络预编译镜像**，全部从 openclaw 源码构建

## 镜像架构

### 镜像类型对应关系

| BotType | 镜像名称 | 构建方式 | 用途 |
|---------|---------|---------|------|
| `GATEWAY` | `openclaw:local` | `openclaw/Dockerfile` | 主 Gateway bot（默认）|
| `TOOL_SANDBOX` | `openclaw-sandbox:bookworm-slim` | `openclaw/scripts/sandbox-setup.sh` | 工具沙箱 |
| `BROWSER_SANDBOX` | `openclaw-sandbox-browser:bookworm-slim` | `openclaw/scripts/sandbox-browser-setup.sh` | 浏览器沙箱 + VNC |

### 环境变量

```bash
# Bot 镜像配置 (按 botType 类型，全部从 openclaw 源码构建)
BOT_IMAGE_GATEWAY=openclaw:local
BOT_IMAGE_TOOL_SANDBOX=openclaw-sandbox:bookworm-slim
BOT_IMAGE_BROWSER_SANDBOX=openclaw-sandbox-browser:bookworm-slim

# OpenClaw 源码路径
OPENCLAW_SRC_PATH=../openclaw
```

**已废弃**: ~~`OPENCLAW_BASE_IMAGE`~~, ~~`BOTENV_IMAGE`~~, ~~`BOT_IMAGE`~~

---

## 构建命令

```bash
# 构建所有镜像
pnpm docker:build:all

# 单独构建
pnpm docker:build:gateway  # GATEWAY 镜像
pnpm docker:build:sandbox  # TOOL_SANDBOX 镜像
pnpm docker:build:browser  # BROWSER_SANDBOX 镜像

# 检查镜像
pnpm docker:build:check

# 推送到镜像仓库
pnpm docker:push:all        # 推送所有镜像
pnpm docker:push:gateway    # 推送 GATEWAY 镜像
pnpm docker:push:sandbox    # 推送 TOOL_SANDBOX 镜像
pnpm docker:push:browser    # 推送 BROWSER_SANDBOX 镜像

# 构建并推送
pnpm docker:build:push:all  # 构建并推送所有镜像

# 登录镜像仓库
pnpm docker:login
```

### 环境变量配置

```bash
# 平台选择 (Mac: linux/arm64, Linux服务器: linux/amd64)
DOCKER_PLATFORM=linux/arm64

# 镜像仓库配置
DOCKER_REGISTRY=uhub.service.ucloud.cn/pardx
DOCKER_IMAGE_TAG=latest
```

---

## 已完成的实施内容

### ✅ Phase 1: 数据库 Schema 变更

**文件**: `apps/api/prisma/schema.prisma`

- [x] 添加 `BotType` 枚举 (`GATEWAY`, `TOOL_SANDBOX`, `BROWSER_SANDBOX`)
- [x] 在 `Bot` model 添加 `botType` 字段，默认 `GATEWAY`
- [x] 添加 `@@index([botType])`
- [x] 运行迁移 `20260221051707_add_bot_type`

### ✅ Phase 2: API Contract 变更

**文件**: `packages/contracts/src/schemas/bot.schema.ts`

- [x] 生成 `BotTypeSchema` 到 `prisma-enums.generated.ts`
- [x] `BotSchema` 添加 `botType` 字段
- [x] `SimpleCreateBotInputSchema` 添加可选 `botType` 参数
- [x] `CreateBotInputSchema` 添加可选 `botType` 参数

### ✅ Phase 3: 环境配置

**文件**: `apps/api/.env.example`, `apps/api/.env`, `.env.example`

- [x] 添加 `BOT_IMAGE_GATEWAY=openclaw:local`
- [x] 添加 `BOT_IMAGE_TOOL_SANDBOX=openclaw-sandbox:bookworm-slim`
- [x] 添加 `BOT_IMAGE_BROWSER_SANDBOX=openclaw-sandbox-browser:bookworm-slim`
- [x] 添加 `OPENCLAW_SRC_PATH`
- [x] 移除废弃的 `OPENCLAW_BASE_IMAGE`、`BOTENV_IMAGE`、`OPENCLAW_BUILD_BASE`

### ✅ Phase 4: Docker Service 变更

**文件**: `apps/api/src/modules/bot-api/services/docker.service.ts`

- [x] `CreateContainerOptions` 添加 `botType` 参数
- [x] 构造函数初始化 `botImages` 映射
- [x] `getBotImage()` 方法按类型选择镜像
- [x] BROWSER_SANDBOX 自动配置额外端口 (CDP, VNC, noVNC)
- [x] BROWSER_SANDBOX 自动配置 2GB 共享内存
- [x] 容器标签添加 `clawbot-manager.bot-type`

**新建文件**: `apps/api/src/modules/bot-api/services/docker-image.service.ts`

- [x] `onModuleInit()` 自动检测并构建缺失镜像
- [x] `imageExists()` 检查镜像是否存在
- [x] `buildImage()` 从 openclaw 源码构建镜像

### ✅ Phase 5: Bot API Service 变更

**文件**: `apps/api/src/modules/bot-api/bot-api.service.ts`

- [x] `createBot()` 传递 `botType` 到数据库和容器创建
- [x] `createBotSimple()` 传递 `botType` 到数据库
- [x] `startBot()` 传递 `botType` 到容器创建

### ✅ Phase 6: Docker 构建脚本

**文件**: `package.json`

```json
{
  "scripts": {
    "docker:build:all": "pnpm docker:build:gateway && pnpm docker:build:sandbox && pnpm docker:build:browser",
    "docker:build:gateway": "cd ${OPENCLAW_SRC_PATH:-../openclaw} && docker build -t ${BOT_IMAGE_GATEWAY:-openclaw:local} -f Dockerfile .",
    "docker:build:sandbox": "cd ${OPENCLAW_SRC_PATH:-../openclaw} && bash scripts/sandbox-setup.sh",
    "docker:build:browser": "cd ${OPENCLAW_SRC_PATH:-../openclaw} && bash scripts/sandbox-browser-setup.sh",
    "docker:build:check": "docker images | grep -E 'openclaw|sandbox'"
  }
}
```

### ✅ Phase 7: 前端变更

**文件**: `apps/web/components/bots/create-wizard/wizard-context.tsx`

- [x] `WizardState` 添加 `botType: BotType`
- [x] `initialState.botType = 'GATEWAY'`
- [x] 添加 `SET_BOT_TYPE` action
- [x] `buildSimpleCreateBotInput()` 包含 `botType`

**新建文件**: `apps/web/components/bots/create-wizard/components/bot-type-selector.tsx`

- [x] 三种类型的选择卡片 UI

**文件**: `apps/web/locales/zh-CN/bots.json`, `apps/web/locales/en/bots.json`

- [x] 添加 `wizard.botType.*` 国际化文本

### ✅ Phase 8-9: 清理过时配置 & 使用本地构建

- [x] `docker-compose.yml`: 移除 `botenv-gateway` 服务，更新环境变量默认值
- [x] `Dockerfile.botenv`: 已删除（不再需要可选扩展镜像）
- [x] `.env.example`: `BOT_IMAGE_GATEWAY` 默认改为 `openclaw:local`
- [x] 移除对 `1panel/openclaw:latest` 网络镜像的依赖

---

## 关键文件清单

| 文件路径 | 变更类型 | 状态 |
|---------|---------|------|
| `apps/api/prisma/schema.prisma` | 添加 BotType 枚举和字段 | ✅ |
| `packages/contracts/src/schemas/prisma-enums.generated.ts` | 生成 BotTypeSchema | ✅ |
| `packages/contracts/src/schemas/bot.schema.ts` | 更新 Zod schemas | ✅ |
| `apps/api/src/modules/bot-api/services/docker.service.ts` | 镜像选择、VNC 端口 | ✅ |
| `apps/api/src/modules/bot-api/services/docker-image.service.ts` | **新建** - 自动检测构建 | ✅ |
| `apps/api/src/modules/bot-api/bot-api.service.ts` | 传递 botType | ✅ |
| `apps/api/src/modules/bot-api/bot-api.module.ts` | 注册 DockerImageService | ✅ |
| `apps/api/.env.example` | 镜像环境变量 | ✅ |
| `apps/api/.env` | 镜像环境变量 | ✅ |
| `.env.example` | 镜像环境变量 | ✅ |
| `docker-compose.yml` | 移除构建服务，更新默认值 | ✅ |
| `package.json` | 构建脚本 | ✅ |
| `apps/web/components/bots/create-wizard/wizard-context.tsx` | 前端状态管理 | ✅ |
| `apps/web/components/bots/create-wizard/components/bot-type-selector.tsx` | **新建** | ✅ |
| `apps/web/locales/zh-CN/bots.json` | 国际化 | ✅ |
| `apps/web/locales/en/bots.json` | 国际化 | ✅ |

---

## 设计决策

| 决策项 | 选择 |
|-------|------|
| Bot 类型可变性 | **不可更改** - 创建后 botType 不可修改，需删除重建 |
| VNC 端口暴露 | **需要暴露** - BROWSER_SANDBOX 暴露 CDP/VNC/noVNC 端口 |
| 镜像构建触发 | **自动检测** - 启动时检测镜像，不存在则自动构建 |
| 镜像来源 | **本地构建** - 从 openclaw 源码构建，不使用网络预编译镜像 |

---

## 验证步骤

```bash
# 1. 构建镜像（从 openclaw 源码）
pnpm docker:build:all

# 2. 检查镜像
pnpm docker:build:check
# 期望输出：
# openclaw:local
# openclaw-sandbox:bookworm-slim
# openclaw-sandbox-browser:bookworm-slim

# 3. 启动服务
pnpm dev

# 4. 创建不同类型的 Bot 并验证
# - GATEWAY: 使用 openclaw:local
# - TOOL_SANDBOX: 使用 openclaw-sandbox:bookworm-slim
# - BROWSER_SANDBOX: 使用 openclaw-sandbox-browser:bookworm-slim

# 5. 验证容器配置
docker inspect <container_id> | grep -E 'Image|bot-type'
```

---

## 迁移策略

- ✅ 所有现有 bot 自动获得 `GATEWAY` 类型（默认值）
- ✅ API 向后兼容：不传 `botType` 时默认使用 `GATEWAY`
- ✅ **botType 字段不包含在更新 API 中**，确保不可更改
- ✅ 移除对网络预编译镜像 (`1panel/openclaw:latest`) 的依赖

---

## 技术细节

### BROWSER_SANDBOX 端口配置

**文件**: `apps/api/src/modules/bot-api/services/docker.service.ts`

```typescript
// BROWSER_SANDBOX 类型需要额外端口映射
if (botType === 'BROWSER_SANDBOX') {
  hostConfig.PortBindings![`${options.port + 1}/tcp`] = [{ HostPort: String(options.port + 1) }]; // CDP (9222)
  hostConfig.PortBindings![`${options.port + 2}/tcp`] = [{ HostPort: String(options.port + 2) }]; // VNC (5900)
  hostConfig.PortBindings![`${options.port + 3}/tcp`] = [{ HostPort: String(options.port + 3) }]; // noVNC (6080)
  hostConfig.ShmSize = 2 * 1024 * 1024 * 1024; // 2GB shared memory for Chrome
}
```

### 镜像自动检测与构建

**文件**: `apps/api/src/modules/bot-api/services/docker-image.service.ts`

```typescript
@Injectable()
export class DockerImageService implements OnModuleInit {
  async onModuleInit() {
    await this.ensureImagesExist();
  }

  private async ensureImagesExist(): Promise<void> {
    const imageConfigs = [
      { type: 'GATEWAY', image: 'openclaw:local', dockerfile: 'Dockerfile' },
      { type: 'TOOL_SANDBOX', image: 'openclaw-sandbox:bookworm-slim', script: 'scripts/sandbox-setup.sh' },
      { type: 'BROWSER_SANDBOX', image: 'openclaw-sandbox-browser:bookworm-slim', script: 'scripts/sandbox-browser-setup.sh' },
    ];

    for (const config of imageConfigs) {
      if (!(await this.imageExists(config.image))) {
        await this.buildImage(config);
      }
    }
  }
}
```

### 前端 BotType 选择器

**文件**: `apps/web/components/bots/create-wizard/components/bot-type-selector.tsx`

```typescript
const BOT_TYPES = [
  { type: 'GATEWAY', icon: Bot, titleKey: 'botType.gateway.title' },
  { type: 'TOOL_SANDBOX', icon: Code, titleKey: 'botType.toolSandbox.title' },
  { type: 'BROWSER_SANDBOX', icon: Globe, titleKey: 'botType.browserSandbox.title' },
];
```

### 国际化配置

**文件**: `apps/web/locales/zh-CN/bots.json`

```json
{
  "wizard": {
    "botType": {
      "title": "Bot 类型",
      "description": "选择 Bot 的运行环境类型",
      "gateway": {
        "title": "Gateway",
        "description": "主 Gateway 类型，包含完整 OpenClaw 运行时，适合一般对话场景"
      },
      "toolSandbox": {
        "title": "工具沙箱",
        "description": "工具沙箱类型，最小化环境执行代码，适合代码执行和工具调用场景"
      },
      "browserSandbox": {
        "title": "浏览器沙箱",
        "description": "浏览器沙箱类型，包含 Chromium 浏览器，支持浏览器自动化和 VNC 远程查看"
      }
    }
  }
}
```
