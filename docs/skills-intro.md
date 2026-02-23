# OpenClaw Skills 技能体系介绍

## 概述

OpenClaw 的 Skill（技能）是一种基于 Markdown 的 AI 能力扩展机制。每个 Skill 本质上是一个 `SKILL.md` 文件，包含 YAML frontmatter 元数据和 Markdown 格式的 prompt 指令，用于指导 AI 助手执行特定任务。

Skill 遵循 Anthropic 提出的 Agent Skill 开放标准，是 AI 编码助手的通用扩展格式。

## Skill 文件结构

### 最小结构

一个 Skill 只需要一个 `SKILL.md` 文件：

```
skills/
└── my-skill/
    └── SKILL.md
```

### SKILL.md 格式

```markdown
---
name: translator
version: 1.0.0
description: Translate text between languages
homepage: https://github.com/author/translator
repository: https://github.com/author/translator
user-invocable: true
tags:
  - translation
  - language
metadata:
  author: someone
---

You are a professional translator. When the user provides text...
```

### Frontmatter 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 推荐 | 技能名称 |
| `version` | string | 推荐 | 版本号，默认 `1.0.0` |
| `description` | string | 推荐 | 简短描述 |
| `homepage` | string | 可选 | 主页 URL |
| `repository` | string | 可选 | 仓库 URL |
| `user-invocable` | boolean | 可选 | 用户是否可直接调用 |
| `tags` | string[] | 可选 | 分类标签 |
| `metadata` | object | 可选 | 扩展元数据 |

Frontmatter 是可选的。如果没有 frontmatter，整个文件内容作为 prompt 使用。

## Skill 复杂度分级

### Level 1：纯 Prompt Skill

最轻量的形式，只包含 prompt 指令，不依赖任何外部工具。

```yaml
---
name: code-reviewer
description: Review code for best practices
tools: []
---

You are a senior code reviewer...
```

适用场景：翻译、总结、代码审查、写作辅助、prompt workflow。

### Level 2：声明工具依赖的 Skill

Skill 本身仍然只有 `SKILL.md`，但声明了对 MCP 工具的依赖。

```yaml
---
name: file-organizer
description: Organize project files
tools:
  - filesystem.read
  - filesystem.write
---
```

运行条件：需要对应的 MCP Server 已启动。如果工具不可用，调用时会报 `tool unavailable`。

### Level 3：带配置的 Skill

部分 Skill 可能附带额外配置文件：

```
skill/
├── SKILL.md
├── config.json      # 默认参数、权限配置
└── manifest.yml     # MCP endpoint 映射
```

这些配置文件是可选增强，OpenClaw 核心只读取 `SKILL.md`。

### Level 4：带代码的 Skill

复杂 Skill 可能包含可执行代码：

```
skill/
├── SKILL.md
├── handler.py       # 自定义工具逻辑
├── tools/           # 工具实现
└── requirements.txt # Python 依赖
```

这类 Skill 需要安装运行依赖（pip install / npm install），属于高级扩展。

### Level 5：Docker 化 Skill

提供 `docker-compose.yml`，用于自动启动 MCP Server 或依赖服务。属于打包便利方案。

## Skill 来源

### 1. 容器内置技能（Built-in）

预装在 OpenClaw Docker 镜像中，位于容器内 `/app/skills/{skillName}/SKILL.md`。

特点：
- 随容器版本更新
- 不可卸载或修改
- 容器启动即可用

### 2. 用户安装技能（User-installed）

通过 UI 从 OpenClaw 技能市场安装，存储在宿主机并通过 Volume 挂载到容器。

路径映射：
```
宿主机: ${BOT_OPENCLAW_DIR}/{isolationKey}/skills/{skillName}/SKILL.md
容器内: /home/node/.openclaw/skills/{skillName}/SKILL.md
```

技能市场来源：[ClawHub](https://www.clawhub.ai/)（OpenClaw 官方技能注册中心），本项目通过 GitHub 仓库 `VoltAgent/awesome-openclaw-skills` 的 README 索引获取技能列表。

### 3. 自定义技能（Custom）

用户自行创建的技能，存储在数据库中，不来自 OpenClaw 官方仓库。

## 容器内 Skill 加载机制

OpenClaw 容器启动后，按以下方式发现和加载技能：

```
1. 扫描 /app/skills/ 目录（内置技能）
2. 扫描 /home/node/.openclaw/skills/ 目录（用户安装技能）
3. 读取每个 SKILL.md → 解析 frontmatter → 注册能力
4. 用户安装技能优先级高于内置技能（同名覆盖）
```

加载优先级：`Workspace > User-installed > Built-in`

OpenClaw 不会在加载时检查工具依赖是否满足，只有在实际调用时才会报错。

## 当前系统架构

### 数据流

```
GitHub (openclaw/skills)
    ↓ fetchSkillDefinition()
PostgreSQL (Skill 表)
    ↓ installSkill()
PostgreSQL (BotSkill 表) + 文件系统 (SKILL.md)
    ↓ Volume Mount
Docker 容器 (/home/node/.openclaw/skills/)
```

### 存储位置

| 位置 | 路径 | 用途 |
|------|------|------|
| 数据库 | `Skill` 表 | 技能元数据 + definition.content |
| 数据库 | `BotSkill` 表 | Bot 与 Skill 的安装关系 |
| 宿主机 | `data/openclaw/{isolationKey}/skills/{name}/SKILL.md` | 容器可读的技能文件 |
| 容器 | `/home/node/.openclaw/skills/{name}/SKILL.md` | 运行时加载路径 |
| 容器 | `/app/skills/{name}/SKILL.md` | 内置技能路径 |
| 缓存 | `skills/container-skills.json` | 容器技能列表缓存 |
| GitHub | `openclaw/skills/tree/main/skills/{author}/{slug}/SKILL.md` | 源仓库 |

### 当前安装流程（简化）

```
用户点击"安装" → API installSkill()
  → 检查权限和重复
  → 从 GitHub 拉取 SKILL.md 内容（raw URL → GitHub API fallback）
  → 更新数据库 definition.content
  → 创建 BotSkill 记录
  → 写入 SKILL.md 到文件系统
  → 容器通过 Volume Mount 自动发现
```
