# Skill 安装全面实施方案

> **实施状态总览**（2026-02-13 更新）
>
> | Phase | 状态 | 说明 |
> | ----- | ---- | ---- |
> | Phase 1：单文件安装 | ✅ 已完成 | SKILL.md 拉取/写入/清理/补写/GitHub API fallback |
> | Phase 2：整目录安装 | ✅ 已完成 | `fetchSkillDirectory`、`writeSkillFiles`、`SkillFile`、`SKILL_LIMITS` 安全限制 |
> | Phase 3：版本管理与更新 | ✅ 已完成 | 版本字段/比较/更新端点/`checkUpdates` 批量检测/前端检查更新按钮 |
> | Phase 4：脚本执行支持 | ✅ 已完成 | `execSkillScript` Docker exec + `executeSkillScript` 服务层 + 白名单 |
> | 安全限制 | ✅ 已完成 | Token/Proxy/超时 + 文件大小/数量限制 + 路径遍历防护 + 脚本白名单 + 非 root 执行 |
> | 错误处理与 UX | ✅ 已完成 | Rate Limit 检测 + 文件写入回滚 + 重试按钮 + OpenClaw 成功提示 |
> | Skill 详情增强 | ✅ 已完成 | 来源 badge + 作者 + 更新时间 + fileCount + scriptExecuted + hasReferences |
>
> **不实施项**：
> - ⛔ 逐文件安装进度（需 SSE/WebSocket，收益低）
> - ⛔ Skill 文件只读挂载（`.openclaw` 是单个 rw mount，无法单独设置子目录只读）

## 1. 问题背景

### 1.1 当前状态

当前 UI 安装 Skill 的流程仅拉取 `SKILL.md` 文件并写入文件系统。但 GitHub 上的 Skill 目录结构远比单个文件复杂：

```
skills/{author}/{slug}/
├── SKILL.md          # 核心文件（必须）
├── _meta.json        # ClawHub 版本元数据
├── README.md         # 补充文档
├── references/       # 参考文档目录
├── scripts/          # 脚本（init.sh, validate.sh 等）
├── schema/           # JSON Schema 定义
├── examples/         # 示例文件
└── assets/           # 静态资源
```

通过对 GitHub `openclaw/skills` 仓库的抽样调查，常见的附加内容包括：

| 目录/文件     | 出现频率 | 用途                     |
| ------------- | -------- | ------------------------ |
| `_meta.json`  | 几乎所有 | 版本历史（ClawHub 管理） |
| `references/` | 高       | 参考文档、API 文档       |
| `scripts/`    | 中       | 初始化脚本、验证脚本     |
| `examples/`   | 中       | 使用示例                 |
| `schema/`     | 低       | 数据结构定义             |
| `assets/`     | 低       | 图片、模板等静态资源     |
| `README.md`   | 低       | 补充说明文档             |

### 1.2 核心问题

| # | 问题 | 实施状态 |
| - | ---- | -------- |
| 1 | 只拉取 `SKILL.md`，缺少 `references/`、`scripts/` 等辅助文件 | ✅ 已实现整目录安装（`fetchSkillDirectory` + `writeSkillFiles`） |
| 2 | `raw.githubusercontent.com` 在国内被屏蔽 | ✅ 已实现 GitHub API fallback |
| 3 | 没有版本管理，无法检测 Skill 更新 | ✅ 已实现版本字段 + semver 比较 + 更新端点 + 批量检查 |
| 4 | 安装过程缺少进度反馈和错误提示 | ✅ loading + toast + 重试按钮 + OpenClaw 安装成功提示 + Rate Limit 检测 + 文件写入回滚 |

## 2. Skill 分类与安装策略

### 2.1 按内容复杂度分类

| 类型            | 目录内容                              | 安装策略                  | 占比（估算） |
| --------------- | ------------------------------------- | ------------------------- | ------------ |
| A. 纯文档型     | 仅 `SKILL.md` + `_meta.json`          | 拉取 SKILL.md 即可        | ~40%         |
| B. 带参考文档型 | + `references/`                       | 拉取整个目录              | ~35%         |
| C. 带脚本型     | + `scripts/`                          | 拉取目录 + 执行 init 脚本 | ~15%         |
| D. 完整包型     | + `schema/` + `examples/` + `assets/` | 拉取整个目录              | ~10%         |

> **实施状态**：✅ 已支持全部类型。统一使用 `writeSkillToFilesystem()` 整目录安装，失败时 fallback 到单文件 SKILL.md。C 类含脚本的技能安装后自动执行 `scripts/init.sh`。

### 2.2 安装策略决策

推荐采用「整目录拉取」策略：不区分类型，统一拉取 Skill 目录下的所有文件。

理由：

- 实现简单，一套逻辑覆盖所有场景
- 避免遗漏关键文件导致 Skill 功能不完整
- GitHub API 支持递归获取目录内容
- 额外文件体积通常很小（几 KB ~ 几十 KB）

> **实施状态**：✅ 已实施。`writeSkillToFilesystem()` 优先整目录安装，失败时 fallback 到单文件模式。

## 3. 技术方案

### 3.1 GitHub 内容拉取

#### 3.1.1 目录内容获取 ✅ 已实现

使用 GitHub Contents API 递归获取 Skill 目录：

```
GET https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={branch}
```

> 已实现：
> - `fetchSkillDirectory()` 公开方法（`openclaw-skill-sync.client.ts:659-677`）
> - `fetchDirectoryRecursive()` 私有递归方法（`openclaw-skill-sync.client.ts:682-774`）
> - 文件内容优先 base64 decode，fallback 到 `download_url`
> - 过滤 `SKILL_LIMITS.EXCLUDED_FILES`（`_meta.json`）
> - 实时检查 `MAX_DIR_SIZE`（5MB）和 `MAX_FILE_COUNT`（50），超限抛错

#### 3.1.2 URL 转换 ✅ 已实现

从 `sourceUrl` 提取目录路径：

```
sourceUrl: https://github.com/openclaw/skills/tree/main/skills/{author}/{slug}/SKILL.md
目录路径:  skills/{author}/{slug}
API URL:   https://api.github.com/repos/openclaw/skills/contents/skills/{author}/{slug}?ref=main
```

> 已实现：
> - `convertToApiUrl()`：单文件级别（`openclaw-skill-sync.client.ts:587-594`）
> - `convertToRawUrl()`：raw URL 转换（`openclaw-skill-sync.client.ts:574-580`）
> - `convertToDirApiUrl()`：目录级别，去掉 `/SKILL.md` 后缀复用 `convertToApiUrl()`（`openclaw-skill-sync.client.ts:599-602`）

#### 3.1.3 Fallback 策略 ✅ 已实现

```
1. 尝试 raw.githubusercontent.com（快，但国内可能被屏蔽）  ✅
2. Fallback 到 api.github.com（稳定，有 rate limit）       ✅
3. 如果配置了 GITHUB_PROXY_URL，优先使用代理               ✅
4. 整目录安装失败时 fallback 到单文件 SKILL.md              ✅
```

> 已实现于 `fetchSkillDefinition()`、`fetchSkillMeta()`、`fetchSkillDirectory()`。
> `writeSkillToFilesystem()` 整目录失败时自动 fallback 到 `writeInstalledSkillMd()` 单文件模式。

#### 3.1.4 Rate Limit 考虑 ✅ 已实现

- 未认证：60 次/小时
- Token 认证：5000 次/小时
- 建议在 `.env` 中配置 `GITHUB_TOKEN` 以提高限额
- 每个 Skill 安装约消耗 1-5 次 API 调用（1 次目录列表 + N 次文件下载）
- 批量检查更新使用 5 并发控制（`Promise.allSettled`），避免瞬间大量请求

> ✅ `GITHUB_TOKEN` 配置已支持。
> ✅ Rate Limit 监控已实现：`checkRateLimit()` 检测 `x-ratelimit-remaining` < 10 时 warn、= 0 时抛错；`handleGitHubError()` 检测 429 状态码提示配置 GITHUB_TOKEN。

### 3.2 文件写入

#### 3.2.1 目录结构 ✅ 已实现（整目录级别）

```
${BOT_OPENCLAW_DIR}/{isolationKey}/skills/{skillSlug}/
├── SKILL.md          ← ✅ 核心文件
├── references/       ← ✅ 参考文档
│   └── api-docs.md
├── scripts/          ← ✅ 脚本（安装后自动执行 init.sh）
│   └── init.sh
└── ...               ← ✅ 其他文件
```

容器内映射为：

```
/home/node/.openclaw/skills/{skillSlug}/
```

> 已实现：
> - `writeInstalledSkillMd()`：写入单个 SKILL.md（`workspace.service.ts:610-620`）
> - `writeSkillFiles()`：多文件写入，含路径遍历防护（`workspace.service.ts:626-664`）
> - 安装前先 `fs.rm()` 清理旧目录，确保干净安装

#### 3.2.2 文件过滤 ✅ 已实现

安装时排除以下文件（不影响 Skill 运行）：

| 文件         | 排除原因                         |
| ------------ | -------------------------------- |
| `_meta.json` | ClawHub 平台元数据，非运行时需要 |

> 已实现：`SKILL_LIMITS.EXCLUDED_FILES` 在 `fetchDirectoryRecursive()` 中过滤。

### 3.3 API 设计

#### 3.3.1 安装流程 ✅ 已实现

```
installSkill(userId, hostname, data)
  ├── 1. 验证 Bot 和 Skill                              ✅ 已实现
  ├── 2. 检查重复安装                                    ✅ 已实现
  ├── 3. 从 GitHub 拉取 Skill 内容
  │     ├── 3a. 获取 SKILL.md 定义                      ✅ 已实现
  │     └── 3b. 更新 DB definition.content               ✅ 已实现
  ├── 4. 创建 BotSkill 记录（含 installedVersion）       ✅ 已实现
  ├── 5. 写入文件到文件系统
  │     ├── 5a. 尝试整目录安装（fetchSkillDirectory）    ✅ 已实现
  │     ├── 5b. 失败时 fallback 到单文件 SKILL.md        ✅ 已实现
  │     └── 5c. 检测 scripts/init.sh 并执行              ✅ 已实现
  └── 6. 返回安装结果                                    ✅ 已实现
```

#### 3.3.2 方法清单

**OpenClawSkillSyncClient**（Client 层）：

| 方法 | 状态 | 说明 |
| ---- | ---- | ---- |
| `fetchSkillDefinition(sourceUrl)` | ✅ 已实现 | 拉取 SKILL.md，含 raw + API fallback |
| `fetchSkillMeta(sourceUrl)` | ✅ 已实现 | 拉取 \_meta.json，返回 `SkillMetaInfo` |
| `fetchSkillDirectory(sourceUrl)` | ✅ 已实现 | 递归获取整个 Skill 目录，含安全限制 |

```typescript
// ✅ 已实现
export interface SkillFile {
  relativePath: string;
  content: string;
  size: number;
}

async fetchSkillDirectory(sourceUrl: string): Promise<SkillFile[]>
```

**OpenClawClient**（Client 层）：

| 方法 | 状态 | 说明 |
| ---- | ---- | ---- |
| `execSkillScript(containerId, skillName, scriptName)` | ✅ 已实现 | Docker exec 执行脚本，非 root，30s 超时 |

**WorkspaceService**（Service 层）：

| 方法 | 状态 | 说明 |
| ---- | ---- | ---- |
| `writeInstalledSkillMd()` | ✅ 已实现 | 写入单个 SKILL.md |
| `removeInstalledSkillMd()` | ✅ 已实现 | 递归删除 skill 目录 |
| `hasInstalledSkillMd()` | ✅ 已实现 | 检查 SKILL.md 是否存在 |
| `writeSkillFiles()` | ✅ 已实现 | 多文件写入，含路径遍历防护 |

**SkillApiService**（Service 层）：

| 方法 | 状态 | 说明 |
| ---- | ---- | ---- |
| `writeSkillToFilesystem()` | ✅ 已实现 | 整目录安装 + fallback 单文件 |
| `executeSkillScript()` | ✅ 已实现 | 遍历白名单脚本并执行 |
| `checkSkillUpdates()` | ✅ 已实现 | 批量检查更新，5 并发 |

### 3.4 版本管理 ✅ 已实现

#### 3.4.1 版本检测 ✅ 已实现

利用 `_meta.json` 中的版本信息：

```json
{
  "latest": {
    "version": "1.14.1",
    "publishedAt": 1770935725778
  }
}
```

对比 DB 中存储的 `Skill.version` 字段，判断是否有更新。

> 已实现：
> - `SkillMetaInfo` 接口（`openclaw-skill-sync.client.ts:23-32`）
> - `fetchSkillMeta()` 方法获取 \_meta.json
> - DB 字段：`Skill.latestVersion`、`BotSkill.installedVersion`（Prisma migration 已执行）
> - `semver.lt()` 比较版本号（`mapBotSkillToItem` 中计算 `updateAvailable`）

#### 3.4.2 更新流程 ✅ 已实现

```
检测更新 → 提示用户 → 用户确认 → 重新拉取目录 → 覆盖写入 → 更新 DB 版本 → 执行脚本
```

> 已实现：
> - 后端：`updateSkillVersion()` 方法（`skill-api.service.ts`）
> - 合约：`botSkillContract.updateVersion` 端点（`POST /:hostname/skills/:skillId/update`）
> - 控制器：`updateSkillVersion` handler（`skill-api.controller.ts:138-148`）
> - 前端：`InstalledSkillCard` 显示 "有更新" Badge + "更新" 按钮
> - i18n：`updateAvailable`、`update`、`updating`、`updateSuccess`、`updateFailed`
> - 更新时使用 `writeSkillToFilesystem()` 整目录覆盖写入，含脚本执行

#### 3.4.3 批量检查更新 ✅ 已实现

> 已实现：
> - Schema：`SkillUpdateCheckItemSchema`、`CheckSkillUpdatesResponseSchema`（`skill.schema.ts:273-294`）
> - 合约：`botSkillContract.checkUpdates`（`POST /:hostname/skills/check-updates`）
> - Service：`checkSkillUpdates()` — 5 并发 `Promise.allSettled`，`semver.lt()` 比较，更新 `Skill.latestVersion`
> - Controller：`checkSkillUpdates` handler（`skill-api.controller.ts:150-159`）
> - 前端：「检查更新」按钮（`RefreshCw` 图标），toast 显示结果，自动刷新列表
> - i18n：`checkUpdates`、`checkingUpdates`、`checkUpdatesResult`、`noUpdatesAvailable`、`checkUpdatesFailed`

### 3.5 错误处理 ✅ 已实现

| 场景               | 处理方式                                    | 状态 |
| ------------------ | ------------------------------------------- | ---- |
| GitHub 不可达      | 使用 API fallback，仍失败则提示用户检查网络 | ✅ 已实现 |
| Rate Limit 超限    | `checkRateLimit()` 检测 remaining，`handleGitHubError()` 检测 429 提示配置 GITHUB_TOKEN | ✅ 已实现 |
| 单个文件下载失败   | 跳过非关键文件，SKILL.md 失败则整体失败     | ✅ 整目录失败 fallback 到单文件 |
| 文件写入失败       | `writeSkillFiles()` try-catch + `fs.rm()` 回滚半成品目录 | ✅ 已实现 |
| 目录已存在（重装） | 清空目录后重新写入                          | ✅ `writeSkillFiles()` 先 `fs.rm()` 再写入 |
| 文件大小/数量超限  | 抛出错误，中止安装                          | ✅ `SKILL_LIMITS` 检查 |
| 路径遍历攻击       | 跳过含 `..` 的路径 + 二次 `startsWith` 验证 | ✅ `writeSkillFiles()` 双重防护 |

## 4. 前端交互设计

### 4.1 安装按钮状态 ✅ 已实现

```
[安装] → [安装中...] → [已安装 ✓]
                     → [安装失败 ✗] → [重试]  ← ✅ 已实现
```

> 已实现：`installingSkillId` 状态控制 loading，`toast.success/error` 反馈结果。
> 已实现：安装失败后 Sonner toast 内嵌重试按钮（覆盖 install/update/checkUpdates/batchInstall）。

### 4.2 安装进度（可选增强） ⛔ 不实施

对于包含多个文件的 Skill，可显示逐文件进度：

```
正在安装 agent-identity-kit...
  ✓ SKILL.md
  ✓ schema/agent.schema.json
  ✓ scripts/init.sh
  ✓ examples/basic.md
安装完成 (4 个文件)
```

> **不实施原因**：需要 SSE 或 WebSocket 实现实时推送，架构改动大，收益低。当前已有 loading 状态 + toast 反馈 + `fileCount` 展示安装文件数量，用户体验已足够。

### 4.3 Skill 详情增强 ✅ 已完成

在 Skill 卡片或详情页显示：

| 信息项 | 状态 | 说明 |
| ------ | ---- | ---- |
| 版本号（来自 frontmatter 或 \_meta.json） | ✅ | 卡片显示 `v{installedVersion \|\| skill.version}` |
| 包含的文件数量 | ✅ | DB 字段 `fileCount` + 前端 FileText 图标展示 |
| 是否执行了脚本 | ✅ | DB 字段 `scriptExecuted` + 前端 Terminal 图标展示 |
| 是否有 references | ✅ | DB 字段 `hasReferences` + 前端 FileText 图标展示 |
| 最后更新时间 | ✅ | `formatDistanceToNow(botSkill.updatedAt)` 带 locale |
| 来源标识 | ✅ | OpenClaw 来源 Badge + 作者显示 |
| 更新可用提示 | ✅ | `updateAvailable` Badge + 更新按钮 |
| 批量检查更新 | ✅ | 「检查更新」按钮 + toast 结果 |

## 5. 实施步骤

### Phase 1：完善单文件安装 ✅ 已完成

- [x] SKILL.md 拉取和写入
- [x] GitHub API fallback（raw URL 被屏蔽时）
- [x] 安装时自动同步 SKILL.md
- [x] 卸载时清理文件
- [x] 页面加载时补写缺失的 SKILL.md

### Phase 2：整目录安装 ✅ 已完成

- [x] `SkillFile` 接口定义（`openclaw-skill-sync.client.ts:37-44`）
- [x] `convertToDirApiUrl()` 目录级 URL 转换（`openclaw-skill-sync.client.ts:599-602`）
- [x] `fetchSkillDirectory()` 递归获取目录（`openclaw-skill-sync.client.ts:659-677`）
- [x] `fetchDirectoryRecursive()` 递归实现（`openclaw-skill-sync.client.ts:682-774`）
- [x] `writeSkillFiles()` 多文件写入 + 路径遍历防护（`workspace.service.ts:626-664`）
- [x] `writeSkillToFilesystem()` 整合方法 + fallback（`skill-api.service.ts`）
- [x] `installSkill()` 改造使用整目录安装
- [x] `updateSkillVersion()` 改造使用整目录安装
- [x] `batchInstallSkills()` 添加文件写入
- [x] `syncInstalledSkillsMd()` 升级为整目录安装（OpenClaw 技能）
- [x] `SKILL_LIMITS` 安全常量（`packages/constants/src/index.ts`）

### Phase 3：版本管理与更新 ✅ 已完成

- [x] DB 字段：`Skill.latestVersion`、`BotSkill.installedVersion`
- [x] `fetchSkillMeta()` 获取 \_meta.json 版本
- [x] `semver.lt()` 版本比较
- [x] `updateSkillVersion()` 单个更新
- [x] `UpdateBotSkillVersionResponseSchema` 响应 Schema
- [x] `botSkillContract.updateVersion` 端点
- [x] 前端更新 UI（Badge + 按钮）
- [x] `SkillUpdateCheckItemSchema` + `CheckSkillUpdatesResponseSchema`
- [x] `botSkillContract.checkUpdates` 批量检测端点
- [x] `checkSkillUpdates()` 批量检测方法（5 并发）
- [x] `checkSkillUpdates` controller handler
- [x] 前端「检查更新」按钮 + toast 结果
- [x] i18n：`checkUpdates`、`checkingUpdates`、`checkUpdatesResult`、`noUpdatesAvailable`、`checkUpdatesFailed`

### Phase 4：脚本执行支持 ✅ 已完成

- [x] `execSkillScript()` Docker exec 方法（`openclaw.client.ts:216-300`）
- [x] 安全校验：`/^[a-zA-Z0-9_\-.]+$/` 正则验证技能名和脚本名
- [x] 非 root 执行：`User: 'node'`
- [x] 30s 超时控制
- [x] `executeSkillScript()` 服务层方法（`skill-api.service.ts`）
- [x] `SKILL_LIMITS.ALLOWED_SCRIPT_NAMES` 白名单（仅 `init.sh`）
- [x] 安装和更新流程中自动检测并执行脚本

## 6. 安全考虑

### 6.1 文件内容安全 ✅ 已实现

| 安全措施 | 状态 |
| -------- | ---- |
| 限制单个 Skill 目录总大小（5MB 上限） | ✅ `SKILL_LIMITS.MAX_DIR_SIZE` |
| 限制文件数量（50 个文件上限） | ✅ `SKILL_LIMITS.MAX_FILE_COUNT` |
| 过滤可执行文件的自动执行 | ✅ `SKILL_LIMITS.ALLOWED_SCRIPT_NAMES` 白名单 |
| 文件路径校验，防止路径穿越攻击 | ✅ `path.normalize()` + `startsWith()` 双重验证 |
| 排除非运行时文件 | ✅ `SKILL_LIMITS.EXCLUDED_FILES` 过滤 `_meta.json` |

### 6.2 GitHub API 安全 ✅ 已实现

| 安全措施 | 状态 |
| -------- | ---- |
| Token 存储在环境变量，不暴露给前端 | ✅ 通过 ConfigService 读取 |
| Rate Limit 监控和告警 | ✅ `checkRateLimit()` + `handleGitHubError()` |
| 请求超时控制（60 秒） | ✅ HttpModule 配置 timeout: 60000 |
| 批量请求并发控制 | ✅ checkSkillUpdates 使用 5 并发 |

### 6.3 容器安全 ✅ 已实现（基础）

| 安全措施 | 状态 |
| -------- | ---- |
| 脚本以非 root 用户执行 | ✅ `User: 'node'` |
| 脚本名白名单 | ✅ `ALLOWED_SCRIPT_NAMES: ['init.sh']` |
| 技能名/脚本名正则校验 | ✅ `/^[a-zA-Z0-9_\-.]+$/` |
| 脚本执行超时 | ✅ 30s |
| Skill 文件以只读方式挂载 | ⛔ 不实施（见附录分析） |

## 7. 配置项 ✅ 已实现

```env
# .env

# GitHub Token（提高 API rate limit 从 60 到 5000 次/小时）
GITHUB_TOKEN=ghp_xxxxxxxxxxxx                    # ✅ 已支持

# GitHub 代理 URL（可选，用于加速 raw.githubusercontent.com）
GITHUB_PROXY_URL=https://ghproxy.com/...          # ✅ 已支持

# Skill 安装限制（硬编码在 SKILL_LIMITS 常量中）
# SKILL_LIMITS.MAX_DIR_SIZE = 5MB                 # ✅ 已实现
# SKILL_LIMITS.MAX_FILE_COUNT = 50                # ✅ 已实现
# SKILL_LIMITS.SCRIPT_EXEC_TIMEOUT = 30000        # ✅ 已实现
```

## 8. 监控与日志 ✅ 已实现

安装过程的关键日志点：

| 日志 | 状态 |
| ---- | ---- |
| `[INFO] Skill installed: {botId, skillId, hostname}` | ✅ |
| `[INFO] 目录获取完成: {sourceUrl, fileCount, totalSize}` | ✅ `fetchSkillDirectory` |
| `[INFO] Full directory install succeeded: {skillDirName, fileCount, scriptExists}` | ✅ `writeSkillToFilesystem` |
| `[WARN] Full directory install failed, falling back to SKILL.md only` | ✅ fallback 日志 |
| `[INFO] Skill script executed: {skillDirName, scriptName, success}` | ✅ `executeSkillScript` |
| `[WARN] Skill script execution failed: {skillDirName, scriptName, error}` | ✅ |
| `[INFO] Skill version updated: {skillId, previousVersion, newVersion}` | ✅ |
| `[INFO] Skill updates checked: {hostname, checkedCount, updatesAvailable}` | ✅ |
| `[WARN] Skipping unsafe file path: {relativePath}` | ✅ 路径遍历防护 |

---

## 附录：已实现代码索引

| 功能 | 文件 | 方法/位置 |
| ---- | ---- | ---- |
| GitHub API fallback | `openclaw-skill-sync.client.ts` | `fetchSkillDefinition()` |
| \_meta.json 获取 | `openclaw-skill-sync.client.ts` | `fetchSkillMeta()` |
| 整目录获取 | `openclaw-skill-sync.client.ts` | `fetchSkillDirectory()` + `fetchDirectoryRecursive()` |
| URL 转换 | `openclaw-skill-sync.client.ts` | `convertToRawUrl()`, `convertToApiUrl()`, `convertToDirApiUrl()` |
| GitHub Token/Proxy | `openclaw-skill-sync.client.ts` | `getGitHubRequestConfig()` |
| SkillFile 接口 | `openclaw-skill-sync.client.ts` | `:37-44` |
| SkillMetaInfo 接口 | `openclaw-skill-sync.client.ts` | `:23-32` |
| 安全常量 | `packages/constants/src/index.ts` | `SKILL_LIMITS` |
| 多文件写入 | `workspace.service.ts` | `writeSkillFiles()` |
| 整目录安装 + fallback | `skill-api.service.ts` | `writeSkillToFilesystem()` |
| 脚本执行（Docker） | `openclaw.client.ts` | `execSkillScript()` |
| 脚本执行（Service） | `skill-api.service.ts` | `executeSkillScript()` |
| DB: latestVersion | `prisma/schema.prisma` | Skill model |
| DB: installedVersion | `prisma/schema.prisma` | BotSkill model |
| 版本比较 | `skill-api.service.ts` | `mapBotSkillToItem()` 中 `semver.lt()` |
| 单个更新 | `skill-api.service.ts` | `updateSkillVersion()` |
| 批量检查更新 | `skill-api.service.ts` | `checkSkillUpdates()` |
| 更新端点 | `skill-api.controller.ts` | `updateSkillVersion`, `checkSkillUpdates` |
| 批量检查 Schema | `skill.schema.ts` | `SkillUpdateCheckItemSchema`, `CheckSkillUpdatesResponseSchema` |
| 批量检查 Contract | `skill.contract.ts` | `botSkillContract.checkUpdates` |
| 前端更新 UI | `skills/page.tsx` | `InstalledSkillCard`, `handleUpdate()`, `handleCheckUpdates()` |
| Rate Limit 检测 | `openclaw-skill-sync.client.ts` | `checkRateLimit()`, `handleGitHubError()` |
| 文件写入回滚 | `workspace.service.ts` | `writeSkillFiles()` try-catch + `fs.rm()` |
| 重试按钮 | `skills/page.tsx` | Sonner toast `action` 按钮 |
| 安装元数据 DB | `prisma/schema.prisma` | BotSkill: `fileCount`, `scriptExecuted`, `hasReferences` |
| 安装元数据存储 | `skill-api.service.ts` | `installSkill()`, `updateSkillVersion()`, `batchInstallSkills()` |
| i18n | `locales/{en,zh-CN}/botSkills.json` | `updateAvailable`, `checkUpdates`, `retry`, `fileCount`, `hasScript`, `hasReferences` 等 |

## 附录：待优化项

| 项目 | 状态 | 说明 |
| ---- | ---- | ---- |
| Rate Limit 监控 | ✅ 已完成 | `checkRateLimit()` 检测 remaining < 10 告警、= 0 抛错；`handleGitHubError()` 检测 429 提示配置 GITHUB_TOKEN |
| 安装进度展示 | ⛔ 不实施 | 需 SSE/WebSocket，架构改动大，收益低；当前已有 loading + toast + fileCount |
| 安装失败重试按钮 | ✅ 已完成 | Sonner toast action 按钮，覆盖 install/update/checkUpdates/batchInstall |
| 文件写入回滚 | ✅ 已完成 | `writeSkillFiles()` try-catch + `fs.rm()` 清理半成品目录 |
| OpenClaw 安装成功提示 | ✅ 已完成 | 区分 OpenClaw 和普通技能的 toast 消息 |
| 技能卡片详情增强 | ✅ 已完成 | 来源 badge（OpenClaw）、作者、更新时间、fileCount、scriptExecuted、hasReferences |
| 只读挂载 | ⛔ 不实施 | 见下方分析 |

### 只读挂载分析

**结论：不实施。**

原因：
- 整个 `.openclaw` 目录是单个 Docker volume mount（`rw`）
- 容器需要对 `.openclaw/` 的写权限（config、logs、memory、sessions 等子目录）
- 仅对 `skills/` 子目录设置只读需要额外的 Docker volume mount，架构改动大
- 当前安全措施已足够：路径遍历双重防护（`workspace.service.ts` + `openclaw-skill-sync.client.ts`）、5MB/50 文件限制、脚本白名单、非 root 执行
