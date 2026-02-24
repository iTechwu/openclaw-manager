# ClawBotManager 实施与开发指南

本文档汇总 Bot 安装 Skill 流程、飞书渠道迁移、Docker 构建、以及开发规范要点。

---

## 一、Bot 安装 Skill 流程

### 1.1 架构分层

```
前端 UI (React) → API 契约验证 (Zod) → Controller → Service 
→ Client (GitHub) + DB Service → PostgreSQL
```

### 1.2 核心数据模型

| 表 | 说明 |
|----|------|
| `Skill` | 技能定义，含 SKILL.md 内容、source、sourceUrl |
| `BotSkill` | Bot 与 Skill 的关联，含 config、isEnabled |
| 约束 | `@@unique([botId, skillId])` 防止重复安装 |

### 1.3 安装流程

1. 前端调用 `POST /api/bot/:hostname/skills`，传入 `skillId`
2. 后端检查权限与重复
3. 从 GitHub 拉取 SKILL.md 内容
4. 更新 Skill 表、创建 BotSkill 记录
5. 写入 SKILL.md 到宿主机 `data/openclaw/{isolationKey}/skills/{name}/`
6. 容器通过 Volume Mount 自动发现

### 1.4 Skill 同步 (Skill-Sync)

Skill-Sync 模块负责与 OpenClaw 容器同步技能列表，供 Bot 使用。API：`/api/skill-sync/*`。

---

## 二、飞书渠道

### 2.1 接入方式

- **长连接模式（推荐）** — WebSocket，无需公网服务器
- **Webhook 模式** — 需公网域名

### 2.2 必需权限

| 权限 | 标识 |
|------|------|
| 获取与发送单聊、群组消息 | `im:message` |
| 以应用的身份发消息 | `im:message:send_as_bot` |

### 2.3 事件订阅

使用长连接时需添加 `im.message.receive_v1` 等事件，**无需填写 Webhook 地址**。

---

## 三、Docker 构建与部署

### 3.1 构建命令

```bash
pnpm docker:build:all          # 构建所有镜像
pnpm docker:build:gateway      # GATEWAY
pnpm docker:build:sandbox      # TOOL_SANDBOX
pnpm docker:build:browser      # BROWSER_SANDBOX
pnpm docker:build:check        # 检查镜像
```

### 3.2 环境变量

```bash
OPENCLAW_SRC_PATH=../openclaw   # OpenClaw 源码路径
DOCKER_PLATFORM=linux/arm64     # Mac: linux/arm64
BOT_IMAGE_GATEWAY=openclaw:local
BOT_IMAGE_TOOL_SANDBOX=openclaw-sandbox:bookworm-slim
BOT_IMAGE_BROWSER_SANDBOX=openclaw-sandbox-browser:bookworm-slim
```

### 3.3 BROWSER_SANDBOX 端口

除主端口外，额外映射：CDP (port+1)、VNC (port+2)、noVNC (port+3)，并配置 2GB 共享内存。

---

## 四、模型首选协议修复 (preferredApiType)

### 4.1 问题

`inferProtocolFromVendor` 仅根据 vendor 硬编码判断协议，忽略 `ModelAvailability.preferredApiType`。

### 4.2 方案

- **ModelResolverService**：`ResolvedModel` 增加 `preferredApiType`、`supportedApiTypes`、`apiTypeBaseUrls`
- **ResolveOptions**：增加 `respectPreferredApiType`
- **ProxyService**：`handleAutoRoutedRequest` 传入 `respectPreferredApiType: true`
- **RoutingEngineService**：`inferProtocolFromVendor` 接受 `preferredApiType` 参数

---

## 五、开发规范要点

### 5.1 架构约束

- API 层不直接访问 DB 或外部 API
- Service 层通过 DB Service 访问数据库，通过 Client 层调用外部 API
- 仅 DB Service 可使用 `getWriteClient()` / `getReadClient()`
- 外部调用必须使用 `@nestjs/axios`，禁止直接使用 `axios`

### 5.2 验证与日志

- 所有 API 使用 Zod Schema 校验
- 使用 Winston Logger，禁止 `console.log`、NestJS `Logger`

### 5.3 参考文档

- `apps/api/docs/架构分层与事务管理方案-new.md`
- `apps/api/docs/业务与基础设施拆分方案.md`
- `docs/ts-rest_Zod-first_REST_协议框架设计方案.md`
- `.cursorrules` / `CLAUDE.md`
