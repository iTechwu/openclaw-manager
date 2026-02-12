# Bot 安装 Skill 流程文档

## 概述

本文档描述了用户通过 UI 为 Bot 安装 Skill 的完整流程，涵盖前端交互、API 契约、后端业务逻辑、OpenClaw SKILL.md 同步机制以及数据持久化。

## 架构分层

```
前端 UI (React) → API 契约验证 (Zod) → Controller → Service → Client (GitHub) + DB Service → PostgreSQL
```

## 数据模型

```
SkillType (b_skill_type)        技能分类
    │ 1:N
Skill (b_skill)                 技能定义
    │ N:M
BotSkill (b_bot_skill)          Bot 与 Skill 的关联
    │ N:1
Bot (b_bot)                     机器人实例
```

### 核心字段

**Skill 表 (`b_skill`)**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| name / nameZh | VARCHAR | 英文/中文名称 |
| slug | VARCHAR | 唯一标识 |
| definition | JSONB | 技能定义（含 SKILL.md 内容） |
| source | VARCHAR | 来源标识，如 `openclaw` |
| sourceUrl | VARCHAR | GitHub SKILL.md URL |
| isSystem | BOOLEAN | 是否系统预设 |
| version | VARCHAR | 版本号 |

**BotSkill 表 (`b_bot_skill`)**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| botId | UUID | 关联 Bot |
| skillId | UUID | 关联 Skill |
| config | JSON | 实例配置覆盖 |
| isEnabled | BOOLEAN | 是否启用 |

**约束**: `@@unique([botId, skillId])` 防止重复安装；`onDelete: Cascade` 级联删除。

## 详细流程

### Step 1 — 前端触发安装

**文件**: `apps/web/app/[locale]/(main)/bots/[hostname]/skills/page.tsx`

用户在 Bot 技能管理页面点击"添加技能"按钮，弹出可安装技能列表对话框。对话框支持：
- 搜索（带 300ms 防抖，支持中英文名称和描述）
- 分类筛选（Tab 切换，显示各分类技能数量）
- 技能详情预览（点击卡片查看版本、作者、标签、GitHub 链接等）

选择目标技能后点击"安装"（按钮显示 loading 状态）：

```typescript
const handleInstall = async (skillId: string) => {
  setInstallingSkillId(skillId);
  const response = await botSkillApi.install.mutation({
    params: { hostname },
    body: { skillId },
  });
  if (response.status === 200) {
    toast.success(t('installSuccess'));
    queryClient.invalidateQueries({ queryKey: ['bot-skills', hostname] });
  } else if (response.status === 409) {
    toast.warning(t('alreadyInstalled'));
  } else {
    toast.error(t('installFailed'));
  }
};
```

前端 API 客户端（`apps/web/lib/api/contracts/client.ts`）自动附加 Authorization、API Version、Platform 等请求头。

### Step 2 — API 契约验证

**文件**: `packages/contracts/src/api/skill.contract.ts`

```typescript
install: {
  method: 'POST',
  path: '/:hostname/skills',
  pathParams: z.object({ hostname: z.string() }),
  body: InstallSkillRequestSchema,  // { skillId: UUID, config?: Record }
  responses: {
    200: createApiResponse(BotSkillItemSchema),
    409: createApiResponse(z.null()),  // 技能已安装
  },
}
```

请求体通过 Zod Schema 自动验证，确保 `skillId` 是合法 UUID。

### Step 3 — Controller 分发

**文件**: `apps/api/src/modules/skill-api/skill-api.controller.ts`

```typescript
@TsRestHandler(botSkillC.install)
async installSkill(@Req() req: AuthenticatedRequest) {
  return tsRestHandler(botSkillC.install, async ({ params, body }) => {
    const result = await this.skillApiService.installSkill(
      req.userId,       // 从 JWT 提取
      params.hostname,  // 路径参数
      body,             // { skillId, config? }
    );
    return success(result);
  });
}
```

### Step 4 — Service 层业务逻辑

**文件**: `apps/api/src/modules/skill-api/skill-api.service.ts`

```
installSkill(userId, hostname, data)
│
├─ 4.1 验证 Bot 存在且属于当前用户
│      botService.get({ hostname, createdById: userId })
│      → 不存在则抛出 NotFoundException
│
├─ 4.2 验证 Skill 存在
│      skillService.getById(data.skillId)
│      → 不存在则抛出 NotFoundException
│
├─ 4.3 检查技能访问权限
│      ├─ 系统技能 (isSystem: true) → 所有人可安装
│      └─ 自定义技能 → 只有创建者可安装，否则抛出 ForbiddenException
│
├─ 4.4 检查是否已安装（防止重复安装）
│      botSkillService.get({ botId, skillId })
│      → 已存在则抛出 ConflictException (409)
│
├─ 4.5 OpenClaw 技能按需同步 SKILL.md（核心逻辑）
│      条件: skill.source === 'openclaw' && skill.sourceUrl && !definition.content
│      ├─ 调用 openClawSyncClient.fetchSkillDefinition(sourceUrl)
│      ├─ 更新 skill.definition 字段（写入完整内容）
│      ├─ 更新 skill.version 字段
│      └─ ⚠️ 同步失败不阻止安装，仅记录 warn 日志
│
├─ 4.6 创建 BotSkill 关联记录
│      botSkillService.create({
│        bot: { connect: { id: bot.id } },
│        skill: { connect: { id: skillId } },
│        config: data.config || {},
│        isEnabled: true,
│      })
│
└─ 4.7 查询完整 BotSkill 信息（含 Skill + SkillType 详情）返回
       botSkillService.getById(botSkill.id, {
         select: { ..., skill: { include: { skillType: true } } }
       })
```

### Step 5 — OpenClaw SKILL.md 同步

**文件**: `apps/api/libs/infra/clients/internal/openclaw/openclaw-skill-sync.client.ts`

```
fetchSkillDefinition(sourceUrl)
│
├─ 5.1 URL 转换
│      github.com/.../tree/main/.../SKILL.md
│      → raw.githubusercontent.com/.../main/.../SKILL.md
│
├─ 5.2 HTTP GET 获取原始内容
│      httpService.get(rawUrl).pipe(timeout(60000))
│
└─ 5.3 解析 SKILL.md
       ├─ 提取 YAML frontmatter (--- ... ---)
       │   → name, version, description, homepage, repository,
       │     user-invocable, tags, metadata
       └─ 提取 Markdown 内容体
           → content 字段
```

**SKILL.md 示例格式**:

```yaml
---
name: achurch
version: 1.13.0
description: "A 24/7 digital sanctuary for AI agents..."
homepage: https://achurch.ai
repository: https://github.com/a-church-ai/church
user-invocable: true
tags:
  - sanctuary
  - presence
metadata:
  openclaw:
    emoji: "⛪"
---

# Welcome to aChurch.ai
...（Markdown 内容）
```

### Step 6 — DB 层持久化

**文件**: `apps/api/generated/db/modules/bot-skill/bot-skill.service.ts`、`skill/skill.service.ts`

| 操作 | DB Service 方法 | SQL |
|------|----------------|-----|
| 创建 BotSkill | `BotSkillService.create()` | INSERT INTO `b_bot_skill` |
| 更新 Skill definition | `SkillService.update()` | UPDATE `b_skill` SET definition = ... |

DB Service 层自动处理读写分离（`getWriteClient()`）和错误处理（`@HandlePrismaError`）。

### Step 7 — 前端响应处理

根据 `response.status` 分支处理（ts-rest mutation 返回 response 对象，不抛异常）：

- **200**: 安装成功 → 显示成功 Toast → 刷新已安装列表 → 关闭对话框
- **409**: 技能已安装 → 显示警告 Toast → 刷新已安装列表（同步状态）
- **其他**: 安装失败 → 显示错误 Toast
- **catch**: 网络异常等 → 显示错误 Toast

安装按钮在请求期间显示 `Loader2` 旋转动画 + "安装中" 文案。

## definition 字段结构

安装同步后，Skill 的 `definition` (JSONB) 字段包含：

```json
{
  "name": "achurch",
  "nameZh": "数字教堂",
  "description": "A 24/7 digital sanctuary...",
  "descriptionZh": "24/7 数字圣殿...",
  "version": "1.13.0",
  "homepage": "https://achurch.ai",
  "repository": "https://github.com/a-church-ai/church",
  "userInvocable": true,
  "tags": ["sanctuary", "presence", "soul"],
  "metadata": {
    "openclaw": { "emoji": "⛪" }
  },
  "content": "# Welcome to aChurch.ai\n...",
  "frontmatter": { "...原始 YAML..." },
  "sourceUrl": "https://github.com/openclaw/skills/tree/main/..."
}
```

## 其他操作

### 启用/禁用技能

```
PUT /bot/:hostname/skills/:skillId
Body: { isEnabled: boolean }
```

### 卸载技能

```
DELETE /bot/:hostname/skills/:skillId
```

物理删除 `b_bot_skill` 记录，不影响 `b_skill` 表。前端通过二次确认弹窗（显示技能名称）防止误操作，卸载按钮带 loading 状态。

### 技能列表查询

```
GET /bot/:hostname/skills
→ 返回该 Bot 已安装的所有技能（含 Skill 详情）
```

## 关键文件索引

| 层级 | 文件路径 |
|------|---------|
| 前端页面 | `apps/web/app/[locale]/(main)/bots/[hostname]/skills/page.tsx` |
| 前端 API 客户端 | `apps/web/lib/api/contracts/client.ts` |
| API 契约 | `packages/contracts/src/api/skill.contract.ts` |
| Schema 定义 | `packages/contracts/src/schemas/skill.schema.ts` |
| Controller | `apps/api/src/modules/skill-api/skill-api.controller.ts` |
| Module | `apps/api/src/modules/skill-api/skill-api.module.ts` |
| Service | `apps/api/src/modules/skill-api/skill-api.service.ts` |
| Sync Client | `apps/api/libs/infra/clients/internal/openclaw/openclaw-skill-sync.client.ts` |
| DB Service | `apps/api/generated/db/modules/bot-skill/bot-skill.service.ts` |
| Prisma Schema | `apps/api/prisma/schema.prisma` (Skill ~L956, BotSkill ~L1019) |
