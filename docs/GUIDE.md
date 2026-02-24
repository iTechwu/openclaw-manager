# ClawBotManager 使用与接入指南

本文档汇总飞书接入、OpenClaw 配置、Skills 技能体系等使用说明。

---

## 一、飞书机器人接入

### 1.1 前置要求

- 已部署 ClawBotManager 并创建 Bot
- 飞书账号（个人账号即可）

### 1.2 特性

- ✅ 无需公网服务器（长连接模式）
- ✅ 无需企业认证（企业自建应用）
- ✅ 支持私聊和群聊（@机器人 触发）
- ✅ 支持多媒体消息

### 1.3 配置步骤

1. **创建飞书应用** — 访问 [飞书开放平台](https://open.feishu.cn/)，创建企业自建应用
2. **添加机器人能力** — 应用能力 → 机器人
3. **获取凭证** — App ID、App Secret
4. **配置权限** — `im:message`、`im:message:send_as_bot` 等
5. **事件订阅** — 选择「使用长连接接收事件」，添加 `im.message.receive_v1`
6. **发布应用** — 版本管理与发布
7. **ClawBotManager 配置** — Bot 详情 → 渠道 → 添加飞书，填写 App ID / App Secret
8. **添加机器人到群** — 群设置 → 群机器人 → 添加

### 1.4 常见问题

- **不回复**：检查 Bot 状态、事件订阅、权限、应用是否发布、长连接状态
- **群聊触发**：需 @机器人
- **国际版**：选择 Lark（国际版）或切换域名

---

## 二、OpenClaw 配置示例

### 2.1 核心配置结构

```yaml
version: "1.0"
debug: false

llm:
  provider: anthropic      # anthropic | openai | openai-compatible | ollama | ...
  api_key: "sk-ant-xxx"
  model: claude-sonnet-4-20250514
  max_tokens: 4096
  temperature: 0.7

identity:
  bot_name: "Clawd"
  user_name: "主人"
  timezone: "Asia/Shanghai"
  language: "zh-CN"
  personality: |
    你是一个聪明、幽默的AI助手...

gateway:
  host: "127.0.0.1"
  port: 18789

channels:
  feishu:
    enabled: false
    app_id: "your-app-id"
    app_secret: "your-app-secret"
    connection_mode: "websocket"
    domain: "feishu"
    require_mention: true

skills:
  enabled: true
  path: "~/.openclaw/skills"
  builtin:
    daily_report: true
    web_search: true
```

### 2.2 支持的 Provider

`anthropic`、`openai`、`openai-compatible`、`ollama`、`openrouter`、`google`、`azure`、`groq`、`mistral`、`xai`、`zai`（智谱）、`minimax`、`opencode` 等。

### 2.3 OpenAI Compatible 示例

```yaml
llm:
  provider: openai-compatible
  base_url: "https://oneapi.example.com/v1"
  api_key: "sk-your-api-key"
  model: claude-sonnet-4.5
```

---

## 三、OpenClaw Skills 技能体系

### 3.1 概述

Skill 是基于 Markdown 的 AI 能力扩展，每个 Skill 是一个 `SKILL.md` 文件，包含 YAML frontmatter 和 prompt 指令。

### 3.2 SKILL.md 格式

```markdown
---
name: translator
version: 1.0.0
description: Translate text between languages
user-invocable: true
tags:
  - translation
---

You are a professional translator. When the user provides text...
```

### 3.3 复杂度分级

| Level | 类型 | 说明 |
|-------|------|------|
| 1 | 纯 Prompt | 无外部工具依赖 |
| 2 | 声明工具依赖 | 依赖 MCP 工具 |
| 3 | 带配置 | config.json、manifest.yml |
| 4 | 带代码 | handler.py、tools/ |
| 5 | Docker 化 | docker-compose.yml |

### 3.4 技能来源

- **Built-in** — 容器内置，随镜像更新
- **User-installed** — 从 ClawHub/市场安装，挂载到容器
- **Custom** — 用户自建，存储在 DB

### 3.5 加载优先级

`Workspace > User-installed > Built-in`

---

## 四、相关链接

- [飞书开放平台](https://open.feishu.cn/)
- [飞书长连接文档](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/event-subscription-guide/long-connection-mode)
- [ClawHub 技能市场](https://www.clawhub.ai/)
- [OpenClaw 配置文档](https://clawd.bot/docs/config)
