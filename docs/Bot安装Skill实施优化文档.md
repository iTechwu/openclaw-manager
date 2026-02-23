# Bot 安装 Skill 实施优化文档

## 1. 当前实现状态

### 已完成

| 模块 | 状态 | 文件 |
|------|------|------|
| API 契约 (skill + botSkill) | ✅ | `packages/contracts/src/api/skill.contract.ts` |
| 前端 API 客户端 | ✅ | `apps/web/lib/api/contracts/client.ts` |
| 后端 Controller | ✅ | `apps/api/src/modules/skill-api/skill-api.controller.ts` |
| 后端 Service | ✅ | `apps/api/src/modules/skill-api/skill-api.service.ts` |
| 后端 Module 注册 | ✅ | `apps/api/src/modules/skill-api/skill-api.module.ts` |
| DB Service 层 | ✅ | `apps/api/generated/db/modules/bot-skill/` |
| 前端技能管理页面 | ✅ | `apps/web/app/[locale]/(main)/bots/[hostname]/skills/page.tsx` |
| 前端导航入口 | ✅ | `apps/web/lib/config/bot-nav.ts` |
| 国际化 (zh-CN / en) | ✅ | `apps/web/locales/*/botSkills.json` |
| OpenClaw SKILL.md 同步 | ✅ | `apps/api/libs/infra/clients/internal/openclaw/openclaw-skill-sync.client.ts` |
| 技能同步定时任务 | ✅ | `apps/api/src/modules/skill-sync/skill-sync.service.ts` |

### 核心流程可用性

基础的安装、卸载、启用/禁用流程已全部打通，前后端联调可用。

---

## 2. 优化问题清单（实施状态标注）

### P0 — 必须修复（影响功能正确性）

#### 2.1 重复安装未做前置检查 ✅ 已完成

**实现位置**: `skill-api.service.ts:328-334`

```typescript
const existing = await this.botSkillService.get({
  botId: bot.id,
  skillId: data.skillId,
});
if (existing) {
  throw new ConflictException('该技能已安装');
}
```

#### 2.2 YAML 解析器不够健壮 ✅ 已完成

**实现位置**: `openclaw-skill-sync.client.ts:17,504-515`

- 引入 `js-yaml` 替代手写 `parseSimpleYaml`
- `yaml.load()` + try/catch 降级为空对象
- 已删除旧的 `parseSimpleYaml` 和 `parseYamlValue` 方法

---

### P1 — 重要优化（影响用户体验）

#### 2.3 安装对话框搜索和分类筛选 ✅ 已完成

**实现位置**: `skills/page.tsx`

- `searchQuery` + `debouncedSearch`（300ms 防抖）+ `selectedTypeId` 状态
- `skillSyncApi.skillTypes.useQuery` 获取分类列表
- `useMemo` 构建 `skillListQuery`，传入 `search` 和 `skillTypeId`
- 搜索框带 Search 图标，分类 Tab 带技能数量 Badge
- Tab 支持横向滚动（`overflow-x-auto` + `shrink-0`）

#### 2.4 卸载操作二次确认 ✅ 已完成

**实现位置**: `skills/page.tsx`

- 使用 `Dialog` + `DialogFooter` 实现确认弹窗
- `uninstallTarget` 状态管理（含 skillId + name），destructive 按钮样式
- 确认弹窗显示技能名称，卸载中禁止关闭弹窗

#### 2.5 安装时同步进度反馈 ✅ 已完成

- `Loader2` 旋转动画 + `installing` 文案
- 在 `AvailableSkillCard` 和 `SkillDetailPreview` 中均有实现

#### 2.6 技能详情预览 ✅ 已完成

- `SkillDetailPreview` 组件：图标、名称、描述、版本、作者、来源、分类 Badge
- 展示 `definition.tags` 标签列表 + GitHub 源链接

---

## 3. 深度代码审查发现的问题

### 🔴 Bug 级别

#### 3.1 已安装技能缺少 skillType 关联查询 ✅ 已修复

`getBotSkills`、`installSkill`、`updateBotSkillConfig` 三个方法均已修复为 `skill: { include: { skillType: true } }`。

#### 3.2 前端未区分 409 Conflict 错误 ✅ 已修复

合约层添加 `409: createApiResponse(z.null())` 响应定义，前端通过 `response.status` 判断。

#### 3.3 后端搜索未覆盖中文字段 ✅ 已修复

`nameZh` + `descriptionZh` 加入 OR 搜索条件。

### 🟡 体验问题

#### 3.4 搜索无防抖 ✅ 已修复

使用 `useDebouncedValue(searchQuery, 300)`。

#### 3.5 卸载确认未显示技能名称 ✅ 已修复

#### 3.6 InstalledSkillCard 的 hostname prop 未使用 ✅ 已修复

#### 3.7 安装对话框硬编码 limit: 100 ✅ 已修复

替换为 `PAGE_SIZE = 20` + 分页加载（"加载更多"按钮），后端 `sort`/`asc` 参数传递到 DB 层。

#### 3.8 卸载操作无 loading 状态 ✅ 已修复

---

## 4. 进一步 UI 优化建议

### P1.5 — 应尽快修复 ✅ 全部完成

| # | 优化项 | 状态 | 说明 |
|---|--------|------|------|
| 4.1 | 搜索防抖 | ✅ | `useDebouncedValue(searchQuery, 300)` |
| 4.2 | 卸载确认显示技能名 | ✅ | `uninstallTarget.name` 显示在弹窗中 |
| 4.3 | 修复 skillType 关联 | ✅ | 3 处 `skill: { include: { skillType: true } }` |
| 4.4 | 搜索覆盖中文字段 | ✅ | `nameZh` + `descriptionZh` 加入 OR 条件 |
| 4.5 | 409 错误区分处理 | ✅ | 合约 + 前端 `response.status` 判断 |
| 4.6 | 安装弹框布局优化 | ✅ | 固定头部 + 可滚动内容区 + Tab 横向滚动 |

### P2 — 可选优化（提升体验）✅ 全部完成

| # | 优化项 | 状态 | 说明 | 涉及文件 |
|---|--------|------|------|----------|
| 4.7 | 已安装技能搜索 | ✅ | 安装 3 个以上时显示搜索框，客户端过滤 | `skills/page.tsx` |
| 4.8 | 分页加载 | ✅ | `PAGE_SIZE=20` + "加载更多"按钮 + 后端 sort/asc 传递 | `skills/page.tsx` + `skill-api.service.ts` |
| 4.9 | 批量安装 | ✅ | 多选模式 + `batchInstall` API（合约+后端+前端） | `skill.contract.ts` + `skill.schema.ts` + `skill-api.service.ts` + `skill-api.controller.ts` + `skills/page.tsx` |
| 4.10 | 技能配置面板 | ✅ | `SkillConfigDialog` 组件，Key-Value 动态表单 | `skills/page.tsx` |
| 4.11 | GitHub 请求代理 | ✅ | `GITHUB_TOKEN` + `GITHUB_PROXY_URL` 环境变量支持 | `openclaw-skill-sync.client.ts` + `openclaw.module.ts` |
| 4.12 | 卸载 loading 状态 | ✅ | `isUninstalling` + `Loader2` | `skills/page.tsx` |
| 4.13 | 移除未使用 prop | ✅ | `InstalledSkillCard` 移除 `hostname` | `skills/page.tsx` |
| 4.14 | 排序选项 | ✅ | Select 下拉：名称 A-Z/Z-A、日期升/降序，后端 orderBy 支持 | `skills/page.tsx` + `skill-api.service.ts` |
| 4.15 | GitHub 链接 | ✅ | 详情预览中 `skill.sourceUrl` 外链 | `skills/page.tsx` |
| 4.16 | 技能标签展示 | ✅ | 详情预览中展示 `definition.tags` | `skills/page.tsx` |

---

## 5. 关键文件索引

| 文件 | 修改类型 | 阶段 | 状态 |
|------|---------|------|------|
| `apps/api/src/modules/skill-api/skill-api.service.ts` | 修改 | P0+P1.5+P2 | ✅ 已完成（排序+批量安装） |
| `apps/api/src/modules/skill-api/skill-api.controller.ts` | 修改 | P2 | ✅ 已完成（批量安装 handler） |
| `apps/api/libs/infra/clients/internal/openclaw/openclaw-skill-sync.client.ts` | 修改 | P0+P2 | ✅ 已完成（GitHub Token+代理） |
| `apps/api/libs/infra/clients/internal/openclaw/openclaw.module.ts` | 修改 | P2 | ✅ 已完成（ConfigModule 导入） |
| `apps/api/package.json` | 修改 | P0 | ✅ 已完成 |
| `apps/web/app/[locale]/(main)/bots/[hostname]/skills/page.tsx` | 修改 | P1+P1.5+P2 | ✅ 已完成（排序+分页+批量+配置面板） |
| `apps/web/locales/zh-CN/botSkills.json` | 修改 | P1+P2 | ✅ 已完成 |
| `apps/web/locales/en/botSkills.json` | 修改 | P1+P2 | ✅ 已完成 |
| `packages/contracts/src/api/skill.contract.ts` | 修改 | P1.5+P2 | ✅ 已完成（409 响应+批量安装端点） |
| `packages/contracts/src/schemas/skill.schema.ts` | 修改 | P2 | ✅ 已完成（BatchInstall Schema） |

---

## 6. 完成度总结

| 优先级 | 总数 | 已完成 | 完成率 |
|--------|------|--------|--------|
| P0 | 2 | 2 | 100% |
| P1 | 4 | 4 | 100% |
| P1.5 | 6 | 6 | 100% |
| P2 | 10 | 10 | 100% |
| **总计** | **22** | **22** | **100%** |

所有优化项已全部完成。

---

## 7. P2 新增功能详细说明

### 7.1 排序选项（4.14）

- 前端：安装对话框搜索栏右侧新增 `Select` 下拉，支持 4 种排序：日期降序/升序、名称 A-Z/Z-A
- 后端：`listSkills` 方法从 query 中提取 `sort`/`asc`，转换为 Prisma `orderBy` 传入 DB 层
- 搜索/筛选/排序变化时自动重置分页到第 1 页

### 7.2 分页加载（4.8）

- 前端：`PAGE_SIZE = 20`，`currentPage` 状态，底部"加载更多"按钮
- 后端：已有 `PaginationQuerySchema` 支持 `page`/`limit`，无需额外修改
- 当 `currentPage * PAGE_SIZE >= total` 时显示"没有更多了"

### 7.3 批量安装（4.9）

- 合约：`BatchInstallSkillRequestSchema`（`skillIds: uuid[].min(1).max(20)`）+ `BatchInstallResultSchema`
- 后端：`batchInstallSkills` 方法逐个安装，跳过已安装/无权限的，返回 `{ installed, skipped, failed }`
- 前端：`CheckSquare` 图标切换批量模式，全选/取消全选，选中后显示"安装选中 (N)"按钮
- 关闭对话框时自动退出批量模式

### 7.4 技能配置面板（4.10）

- `SkillConfigDialog` 组件：Key-Value 动态表单
- 从 `botSkill.config` 初始化条目，支持添加/删除参数
- 值自动尝试 JSON.parse，失败则作为字符串保存
- 调用 `botSkillApi.updateConfig` 保存配置

### 7.5 GitHub 请求代理（4.11）

- 新增 `GITHUB_TOKEN` 环境变量：设置后自动在 GitHub 请求中添加 `Authorization: token xxx` 头
- 新增 `GITHUB_PROXY_URL` 环境变量：设置后替换 `raw.githubusercontent.com` 为代理地址
- `getGitHubRequestConfig()` 统一处理 Token 和代理 URL
- `fetchFromGitHub()` 和 `fetchSkillDefinition()` 均已适配
- `OpenClawModule` 新增 `ConfigModule` 导入
