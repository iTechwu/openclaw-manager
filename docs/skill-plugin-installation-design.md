# Skill 与 Plugin 安装逻辑全面设计方案

## 实施状态

| Phase | 内容 | 状态 |
|-------|------|------|
| Phase 1 | 预同步优化（Prisma Schema + skill-sync + skill-api） | ✅ 已完成 |
| Phase 2 | 热加载机制（reloadSkills + reloadMcpServers） | ✅ 已完成 |
| Phase 3 | 容器恢复机制（reconcileBotSkills） | ✅ 已完成 |
| Phase 4 | Redis 缓存层 | ⏳ 可选优化 |

---

## 一、当前问题分析

### 1.1 路径问题

| 类型 | 宿主机路径 | 容器内路径 | 来源 |
|------|-----------|-----------|------|
| **容器内置 Skills** | (Docker 镜像内) | `/app/skills/{skillName}/` | 镜像构建时 |
| **用户安装 Skills** | `${BOT_OPENCLAW_DIR}/{isolationKey}/skills/{skillName}/` | `/home/node/.openclaw/skills/{skillName}/` | API 安装 |

**问题**：两个路径不同，OpenClaw 需要同时扫描两个路径才能发现所有 skills。

### 1.2 同步问题

当前 `skill-sync.service.ts` 的行为：
- ✅ 同步 Skill 元数据（name, slug, description, sourceUrl）到数据库
- ❌ **不**同步 SKILL.md 内容
- ❌ **不**同步完整目录（references/, scripts/ 等）

**问题**：安装时需要实时从 GitHub 拉取，如果 GitHub 不可用会导致安装失败或只有空的 SKILL.md。

### 1.3 生效机制对比

| 特性 | Skill | Plugin |
|------|-------|--------|
| **配置位置** | 文件系统 (`/home/node/.openclaw/skills/`) | 数据库 + `openclaw.json` |
| **生效方式** | 文件系统挂载（热加载） | MCP 配置注入 |
| **是否需要重启** | ❌ 不需要 | ❌ 不需要 |
| **配置持久化** | 文件系统自动持久化 | 容器重启后需 `reconcileBotPlugins()` 恢复 |

---

## 二、设计方案

### 2.1 统一的 Skill 路径策略

#### 方案 A：统一到挂载目录（推荐）

**思路**：所有 skills（包括内置）都存储在 `/home/node/.openclaw/skills/`，由 volume mount 持久化。

```
容器内路径:
/home/node/.openclaw/
├── skills/
│   ├── builtin/              # 内置 skills（从镜像复制或预置）
│   │   ├── core-search/
│   │   └── web-browsing/
│   └── installed/            # 用户安装的 skills
│       ├── xiaohongshu-mcp/
│       └── custom-skill/
└── openclaw.json
```

**优点**：
- 统一的路径，OpenClaw 只需扫描一个目录
- 内置 skills 也可以被用户覆盖/更新
- 持久化简单

**缺点**：
- 需要容器启动时复制内置 skills 到挂载目录

#### 方案 B：双路径扫描（当前方案优化）

**思路**：OpenClaw CLI 支持扫描多个路径，保持当前架构但优化发现逻辑。

```typescript
// OpenClaw skills list 命令支持多路径
const SKILL_PATHS = [
  '/app/skills',           // 内置 skills（只读）
  '/home/node/.openclaw/skills', // 用户安装（读写）
];
```

**优点**：
- 最小改动
- 内置 skills 保持只读，不会被意外修改

**缺点**：
- 需要处理 skill 名称冲突
- 两套路径管理复杂

#### 推荐：方案 A

---

### 2.2 Skill 同步策略优化

#### 当前流程（问题）

```
GitHub README → 解析元数据 → 存入 Skill 表（不含 definition）
     ↓
安装请求 → fetchSkillDirectory() → 写入文件系统
     ↓
如果 GitHub 不可用 → 只有空 SKILL.md 或失败
```

#### 优化后流程

```
定时同步任务:
GitHub README → 解析元数据 → 存入 Skill 表
     ↓
GitHub Tree API → fetchSkillDirectory() → 存入 SkillDefinition 表
     ↓
同时缓存到 Redis（TTL 1小时）

安装请求:
     ↓
检查 SkillDefinition 表是否有完整目录
     ↓
有 → 直接写入文件系统
无 → 尝试从 GitHub 实时拉取
     ↓
写入文件系统 + 执行 init.sh（如有）
```

#### 数据库 Schema 扩展

```prisma
model Skill {
  id          String   @id @default(cuid())
  slug        String   @unique
  name        String
  description String?
  source      String   // 'openclaw', 'custom'
  sourceUrl   String?
  author      String?

  // 新增：预同步的完整目录
  definition  SkillDefinition?

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  lastSyncedAt DateTime?
}

model SkillDefinition {
  id        String   @id @default(cuid())
  skillId   String   @unique
  skill     Skill    @relation(fields: [skillId], references: [id])

  // 存储完整目录结构
  files     Json     // [{ relativePath, content, size }]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

---

### 2.3 Skill 安装完整流程

```typescript
async installSkill(userId: string, hostname: string, data: InstallSkillRequest) {
  const { skillId, botId, enabled = true } = data;

  // 1. 验证
  const bot = await this.validateBotAccess(userId, hostname, botId);
  const skill = await this.skillDb.findById(skillId);

  // 2. 检查重复
  const existing = await this.botSkillDb.findByBotAndSkill(bot.id, skillId);
  if (existing) throw new ConflictException('Skill already installed');

  // 3. 获取完整目录（优先本地缓存，其次 GitHub）
  const skillFiles = await this.getOrFetchSkillFiles(skill);

  // 4. 写入文件系统
  const skillDirName = this.toDirName(skill.slug);
  const installResult = await this.workspaceService.writeSkillFiles(
    userId, hostname, skillDirName, skillFiles
  );

  // 5. 创建数据库记录
  const botSkill = await this.botSkillDb.create({
    botId: bot.id,
    skillId,
    enabled,
    installedVersion: skill.version,
    installedAt: new Date(),
    fileCount: skillFiles.length,
    hasInitScript: installResult.scriptExists,
  });

  // 6. 执行初始化脚本（如果容器运行中）
  if (bot.containerId && installResult.scriptExists) {
    await this.executeSkillScript(bot.containerId, skillDirName);
  }

  // 7. 触发 OpenClaw 重新加载 skills（热加载通知）
  if (bot.containerId) {
    await this.openClawClient.reloadSkills(bot.containerId);
  }

  return this.toResponse(botSkill, skill);
}

private async getOrFetchSkillFiles(skill: Skill): Promise<SkillFile[]> {
  // 优先从数据库获取预同步的完整目录
  if (skill.definition?.files) {
    return skill.definition.files as SkillFile[];
  }

  // 尝试从 Redis 缓存获取
  const cached = await this.redis.get(`skill:files:${skill.id}`);
  if (cached) {
    return JSON.parse(cached);
  }

  // 实时从 GitHub 拉取
  if (skill.sourceUrl) {
    const files = await this.openClawSyncClient.fetchSkillDirectory(skill.sourceUrl);

    // 缓存到 Redis（1小时）
    await this.redis.setex(`skill:files:${skill.id}`, 3600, JSON.stringify(files));

    return files;
  }

  throw new BadRequestException('Skill files not available');
}
```

---

### 2.4 Plugin 安装完整流程

```typescript
async installPlugin(userId: string, hostname: string, data: InstallPluginRequest) {
  const { pluginId, botId, config = {}, enabled = true } = data;

  // 1. 验证
  const bot = await this.validateBotAccess(userId, hostname, botId);
  const plugin = await this.pluginDb.findById(pluginId);

  // 2. 检查重复
  const existing = await this.botPluginDb.findByBotAndPlugin(bot.id, pluginId);
  if (existing) throw new ConflictException('Plugin already installed');

  // 3. 创建数据库记录
  const botPlugin = await this.botPluginDb.create({
    botId: bot.id,
    pluginId,
    enabled,
    config,
    installedAt: new Date(),
  });

  // 4. 注入 MCP 配置（如果容器运行中）
  if (bot.containerId && plugin.mcpConfig) {
    const botConfig = await this.getBotConfig(bot.id);
    const mcpConfig = this.formatMcpConfig(plugin.mcpConfig, botConfig);

    await this.openClawClient.injectMcpConfig(bot.containerId, {
      [plugin.slug]: mcpConfig,
    });

    // 5. 触发 OpenClaw 重新连接 MCP 服务器
    await this.openClawClient.reloadMcpServers(bot.containerId);
  }

  return this.toResponse(botPlugin, plugin);
}
```

---

### 2.5 容器启动时的配置恢复

```typescript
// bot-api.service.ts - startBot()
async startBot(userId: string, hostname: string): Promise<Bot> {
  // ... 创建/启动容器 ...

  // 恢复 Plugin MCP 配置
  await this.pluginApiService.reconcileBotPlugins(bot.id, bot.containerId);

  // 恢复 Skill 文件（如果 volume 被清理）
  await this.skillApiService.reconcileBotSkills(bot.id, bot.containerId);

  // 等待 OpenClaw 就绪
  await this.waitForOpenClawReady(bot.containerId);

  return bot;
}

// skill-api.service.ts - reconcileBotSkills()
async reconcileBotSkills(botId: string, containerId: string): Promise<void> {
  const installedSkills = await this.botSkillDb.findByBotId(botId);

  for (const botSkill of installedSkills) {
    if (!botSkill.enabled) continue;

    const skill = await this.skillDb.findById(botSkill.skillId);
    const skillDirName = this.toDirName(skill.slug);

    // 检查容器内是否存在
    const exists = await this.openClawClient.checkSkillExists(containerId, skillDirName);

    if (!exists) {
      // 重新写入
      const files = await this.getOrFetchSkillFiles(skill);
      await this.workspaceService.writeSkillFiles(
        botSkill.bot.userId,
        botSkill.bot.hostname,
        skillDirName,
        files,
      );

      this.logger.info('Reconciled skill', { botId, skillDirName });
    }
  }
}
```

---

## 三、新增 API 接口

### 3.1 Skill API 扩展

| 接口 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 安装 Skill | POST | `/bots/{hostname}/skills` | 安装到指定 Bot |
| 卸载 Skill | DELETE | `/bots/{hostname}/skills/{skillId}` | 从 Bot 移除 |
| 更新 Skill | PATCH | `/bots/{hostname}/skills/{skillId}` | 更新版本/启用状态 |
| 批量安装 | POST | `/bots/{hostname}/skills/batch` | 批量安装多个 Skills |
| 重新同步 | POST | `/bots/{hostname}/skills/resync` | 重新同步所有已安装 Skills |

### 3.2 Plugin API 扩展

| 接口 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 安装 Plugin | POST | `/bots/{hostname}/plugins` | 安装到指定 Bot |
| 卸载 Plugin | DELETE | `/bots/{hostname}/plugins/{pluginId}` | 从 Bot 移除 |
| 更新配置 | PATCH | `/bots/{hostname}/plugins/{pluginId}` | 更新 Plugin 配置 |
| 重载 MCP | POST | `/bots/{hostname}/plugins/reload-mcp` | 重新加载所有 MCP 配置 |

---

## 四、OpenClaw Client 扩展

### 4.1 新增方法

```typescript
// openclaw.client.ts

/**
 * 重新加载 Skills（热加载通知）
 */
async reloadSkills(containerId: string): Promise<void> {
  const script = `
    const openclaw = require('/app/openclaw.mjs');
    await openclaw.skills.reload();
    console.log(JSON.stringify({ success: true }));
  `;
  await this.dockerExec.executeNodeScript(containerId, script);
}

/**
 * 重新加载 MCP 服务器
 */
async reloadMcpServers(containerId: string): Promise<void> {
  const script = `
    const openclaw = require('/app/openclaw.mjs');
    await openclaw.mcp.reload();
    console.log(JSON.stringify({ success: true }));
  `;
  await this.dockerExec.executeNodeScript(containerId, script);
}

/**
 * 检查 Skill 是否存在
 */
async checkSkillExists(containerId: string, skillName: string): Promise<boolean> {
  const result = await this.dockerExec.executeCommand(containerId, [
    'test', '-d', `/home/node/.openclaw/skills/${skillName}`
  ]);
  return result.success;
}

/**
 * 获取容器内所有 Skills（合并内置 + 用户安装）
 */
async listAllContainerSkills(containerId: string): Promise<{
  builtin: ContainerSkillItem[];
  installed: ContainerSkillItem[];
}> {
  const builtin = await this.listBuiltinSkills(containerId);
  const installed = await this.listInstalledSkills(containerId);
  return { builtin, installed };
}
```

---

## 五、定时任务优化

### 5.1 Skill 同步任务

```typescript
@Cron('0 3 * * *') // 每天凌晨 3 点
async syncOpenClawSkills() {
  this.logger.info('Starting OpenClaw skills sync');

  // 1. 同步元数据
  const skills = await this.fetchSkillsFromGitHub();

  // 2. 预同步完整目录（新增）
  for (const skill of skills) {
    try {
      const files = await this.openClawSyncClient.fetchSkillDirectory(skill.sourceUrl);

      await this.prisma.skillDefinition.upsert({
        where: { skillId: skill.id },
        create: { skillId: skill.id, files },
        update: { files },
      });

      this.logger.debug('Synced skill files', { slug: skill.slug, fileCount: files.length });
    } catch (error) {
      this.logger.warn('Failed to sync skill files', {
        slug: skill.slug,
        error: error.message
      });
    }
  }

  this.logger.info('OpenClaw skills sync completed', { count: skills.length });
}
```

---

## 六、错误处理与降级

### 6.1 安装失败降级策略

```typescript
async installSkillWithFallback(...): Promise<InstallResult> {
  try {
    // 尝试完整安装
    return await this.installSkillFull(...);
  } catch (error) {
    if (error.code === 'GITHUB_UNAVAILABLE') {
      // 降级：只安装 SKILL.md
      return await this.installSkillMinimal(...);
    }
    throw error;
  }
}
```

### 6.2 重试机制

```typescript
const retryOptions = {
  maxRetries: 3,
  backoff: 'exponential',
  initialDelay: 1000,
};

const files = await retry(
  () => this.openClawSyncClient.fetchSkillDirectory(sourceUrl),
  retryOptions
);
```

---

## 七、安全考虑

### 7.1 路径遍历防护（已有）

```typescript
// workspace.service.ts
const normalized = path.normalize(file.relativePath);
if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
  continue;
}
```

### 7.2 脚本执行白名单（已有）

```typescript
// packages/constants
SKILL_LIMITS.ALLOWED_SCRIPT_NAMES = ['init.sh']
```

### 7.3 新增：文件类型限制

```typescript
const ALLOWED_EXTENSIONS = ['.md', '.txt', '.json', '.js', '.ts', '.sh', '.py'];
const BLOCKED_PATTERNS = ['.env', 'credentials', 'secrets', 'private_key'];

function validateSkillFile(file: SkillFile): boolean {
  const ext = path.extname(file.relativePath);
  if (!ALLOWED_EXTENSIONS.includes(ext)) return false;

  for (const pattern of BLOCKED_PATTERNS) {
    if (file.relativePath.toLowerCase().includes(pattern)) return false;
  }

  return true;
}
```

---

## 八、实施步骤

### Phase 1: 路径统一
1. 修改 Dockerfile，将内置 skills 复制到 `/home/node/.openclaw/skills/builtin/`
2. 更新容器启动脚本，检查并复制内置 skills
3. 修改 `listContainerSkills` 只扫描一个路径

### Phase 2: 预同步优化
1. 添加 `SkillDefinition` 表
2. 修改 `skill-sync.service.ts` 预同步完整目录
3. 添加 Redis 缓存层

### Phase 3: 热加载通知
1. 添加 `reloadSkills()` 方法
2. 添加 `reloadMcpServers()` 方法
3. 安装后自动调用

### Phase 4: 容错与降级
1. 添加降级安装逻辑
2. 添加重试机制
3. 添加文件类型验证

---

## 九、监控与日志

### 9.1 关键指标

```typescript
// Metrics
- skill_install_duration_seconds
- skill_install_success_total
- skill_install_failure_total
- skill_sync_duration_seconds
- plugin_mcp_injection_duration_seconds
```

### 9.2 日志规范

```typescript
this.logger.info('Skill install started', { userId, hostname, skillId });
this.logger.info('Skill files fetched', { skillId, fileCount, source: 'cache|github' });
this.logger.info('Skill installed', { botId, skillId, duration });
this.logger.error('Skill install failed', { botId, skillId, error, stack });
```
