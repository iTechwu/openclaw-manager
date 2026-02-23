/**
 * OpenClaw 客户端
 *
 * 职责：
 * - 与 OpenClaw Gateway 通信
 * - 发送消息到 OpenClaw 并获取 AI 响应
 * - 使用 WebSocket 进行实时通信
 */
import { Injectable, Inject } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import type { ContainerSkillItem } from '@repo/contracts';
import { DockerExecService } from './docker-exec.service';

export interface OpenClawMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | OpenClawContentPart[];
}

/**
 * OpenClaw 多模态内容部分
 * 支持文本、图片和文件
 */
export interface OpenClawContentPart {
  type: 'text' | 'image' | 'file';
  text?: string;
  image_url?: {
    url: string;
    detail?: 'low' | 'high' | 'auto';
  };
  file_url?: {
    url: string;
    name?: string;
  };
}

export interface OpenClawChatRequest {
  messages: OpenClawMessage[];
  stream?: boolean;
  model?: string;
}

export interface OpenClawChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenClaw 聊天选项
 */
export interface OpenClawChatOptions {
  /** 上下文消息 */
  context?: OpenClawMessage[];
  /** 指定模型（用于路由后的模型切换） */
  model?: string;
  /** 路由提示（用于功能路由匹配） */
  routingHint?: string;
  /** 容器 ID（用于模型切换时执行 Docker exec） */
  containerId?: string;
}

/**
 * 直接通过 Proxy 发送多模态消息的选项
 * 绕过 OpenClaw Gateway，直接调用 Keyring Proxy HTTP 端点
 */
export interface ProxyVisionChatOptions {
  /** Docker 容器 ID（用于读取 proxy token） */
  containerId: string;
  /** Proxy 基础 URL（如 http://127.0.0.1:3200/api） */
  proxyBaseUrl: string;
  /** 视觉模型名称 */
  visionModel: string;
  /** 多模态消息内容 */
  content: OpenClawContentPart[];
}

/**
 * MCP Server 配置（用于 openclaw.json mcpServers）
 */
export interface McpServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

@Injectable()
export class OpenClawClient {
  private readonly requestTimeout = 120000; // 2 分钟超时
  private readonly wsTimeout = 120000; // WebSocket 响应超时
  /** 缓存容器的 proxy token（containerId → token） */
  private readonly proxyTokenCache = new Map<string, string>();

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly httpService: HttpService,
    private readonly dockerExec: DockerExecService,
  ) {}

  /**
   * 发送消息到 OpenClaw Gateway 并获取 AI 响应
   * 使用 WebSocket 进行通信
   * @param port OpenClaw Gateway 端口
   * @param token Gateway 认证 token
   * @param message 用户消息（字符串或多模态内容数组）
   * @param options 可选的聊天选项（上下文、模型、路由提示等）
   */
  async chat(
    port: number,
    token: string,
    message: string | OpenClawContentPart[],
    options?: OpenClawChatOptions,
  ): Promise<string> {
    const messageInfo =
      typeof message === 'string'
        ? { length: message.length, type: 'text' }
        : {
            length: message.length,
            type: 'multimodal',
            imageCount: message.filter((p) => p.type === 'image').length,
          };

    this.logger.info('OpenClawClient: 发送消息到 OpenClaw', {
      port,
      ...messageInfo,
      contextLength: options?.context?.length || 0,
      model: options?.model,
      routingHint: options?.routingHint,
    });

    try {
      // 如果指定了模型且提供了容器 ID，先切换模型
      if (options?.model && options?.containerId) {
        await this.switchModel(options.containerId, options.model);
      }

      const response = await this.sendMessageViaWebSocket(
        port,
        token,
        message,
        options?.context,
      );

      this.logger.info('OpenClawClient: 收到 AI 响应', {
        port,
        responseLength: response.length,
      });

      return response;
    } catch (error) {
      this.logger.error('OpenClawClient: 通信失败', {
        port,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * 发送消息到 OpenClaw Gateway（兼容旧接口）
   * @deprecated 使用带 options 参数的 chat 方法
   */
  async chatLegacy(
    port: number,
    token: string,
    message: string | OpenClawContentPart[],
    context?: OpenClawMessage[],
  ): Promise<string> {
    return this.chat(port, token, message, { context });
  }

  /**
   * 通过 Docker exec 切换 OpenClaw 容器的模型
   * @param containerId Docker 容器 ID
   * @param model 目标模型名称
   */
  async switchModel(containerId: string, model: string): Promise<void> {
    this.logger.info('OpenClawClient: 切换模型', { containerId, model });

    const result = await this.dockerExec.executeCommand(
      containerId,
      ['node', '/app/openclaw.mjs', 'models', 'set', model],
      { timeout: 10000 },
    );

    if (result.success) {
      this.logger.info('OpenClawClient: 模型切换成功', {
        containerId,
        model,
        durationMs: result.durationMs,
      });
    } else {
      this.logger.warn('OpenClawClient: 模型切换失败', {
        containerId,
        model,
        stderr: result.stderr,
        durationMs: result.durationMs,
      });
      // 不抛出错误，允许继续使用当前模型
    }
  }

  /**
   * 从容器环境变量中读取 Proxy Token（带缓存）
   * @param containerId Docker 容器 ID
   * @returns Proxy Token 字符串，失败返回 null
   */
  async getContainerProxyToken(containerId: string): Promise<string | null> {
    // 检查缓存
    const cached = this.proxyTokenCache.get(containerId);
    if (cached) return cached;

    const result = await this.dockerExec.executeCommand(
      containerId,
      ['printenv', 'PROXY_TOKEN'],
      { timeout: 5000 },
    );

    if (result.success && result.stdout.trim()) {
      const token = result.stdout.trim();
      this.proxyTokenCache.set(containerId, token);
      return token;
    }

    this.logger.warn('OpenClawClient: 无法读取容器 Proxy Token', {
      containerId,
      stderr: result.stderr,
    });
    return null;
  }

  /**
   * 通过 Keyring Proxy 直接发送多模态消息（绕过 OpenClaw Gateway）
   *
   * 用于包含图片的视觉请求，因为 OpenClaw Gateway 的 chat.send
   * WebSocket 协议不支持多模态内容数组。
   *
   * 流程：
   * 1. 从容器读取 Proxy Token
   * 2. 构建 OpenAI 兼容的 chat/completions 请求
   * 3. 直接调用 Keyring Proxy HTTP 端点
   * 4. 收集并返回响应文本
   */
  async chatViaProxy(options: ProxyVisionChatOptions): Promise<string> {
    const { containerId, proxyBaseUrl, visionModel, content } = options;

    this.logger.info('OpenClawClient: 通过 Proxy 发送视觉请求', {
      containerId,
      visionModel,
      contentParts: content.length,
      imageCount: content.filter((p) => p.type === 'image').length,
      fileCount: content.filter((p) => p.type === 'file').length,
    });

    // 1. 获取 Proxy Token
    const proxyToken = await this.getContainerProxyToken(containerId);
    if (!proxyToken) {
      throw new Error('无法获取 Proxy Token，无法发送视觉请求');
    }

    // 2. 过滤并转换有效的内容部分
    const validContentParts = content
      .filter((part) => {
        // 过滤空文本
        if (part.type === 'text') {
          return part.text && part.text.trim().length > 0;
        }
        // 过滤无效的图片 URL
        if (part.type === 'image') {
          return part.image_url && part.image_url.url;
        }
        // 过滤无效的文件 URL
        if (part.type === 'file') {
          return part.file_url && part.file_url.url;
        }
        return false;
      })
      .map((part) => {
        if (part.type === 'text') {
          return { type: 'text' as const, text: part.text! };
        }
        if (part.type === 'file' && part.file_url) {
          return {
            type: 'file_url' as const,
            file_url: part.file_url,
          };
        }
        // 图片文件
        return {
          type: 'image_url' as const,
          image_url: part.image_url!,
        };
      });

    // 验证是否有有效内容
    if (validContentParts.length === 0) {
      throw new Error('没有有效的多模态内容可发送');
    }

    this.logger.info('OpenClawClient: 有效内容部分', {
      totalParts: content.length,
      validParts: validContentParts.length,
      textParts: validContentParts.filter((p) => p.type === 'text').length,
      imageParts: validContentParts.filter((p) => p.type === 'image_url')
        .length,
      fileParts: validContentParts.filter((p) => p.type === 'file_url').length,
    });

    // 3. 构建 OpenAI 兼容请求体
    const requestBody = {
      model: visionModel,
      messages: [
        {
          role: 'user',
          content: validContentParts,
        },
      ],
      stream: false,
      max_tokens: 4096,
    };

    // 4. 调用 Proxy HTTP 端点
    // 使用 openai-compatible vendor 触发自动路由
    const url = `${proxyBaseUrl}/v1/openai-compatible/chat/completions`;

    try {
      const response = await firstValueFrom(
        this.httpService
          .post(url, requestBody, {
            headers: {
              Authorization: `Bearer ${proxyToken}`,
              'Content-Type': 'application/json',
            },
            timeout: this.requestTimeout,
          })
          .pipe(
            catchError((error) => {
              this.logger.error('OpenClawClient: Proxy 视觉请求失败', {
                error: error.message,
                status: error.response?.status,
                data: error.response?.data
                  ? JSON.stringify(error.response.data).substring(0, 500)
                  : undefined,
              });
              throw error;
            }),
          ),
      );

      // 5. 提取响应文本
      const data = response.data;
      const responseText = data?.choices?.[0]?.message?.content || '';

      this.logger.info('OpenClawClient: Proxy 视觉请求成功', {
        visionModel,
        responseLength: responseText.length,
        responsePreview: responseText.substring(0, 200),
      });

      return responseText;
    } catch (error) {
      this.logger.error('OpenClawClient: Proxy 视觉请求异常', {
        containerId,
        visionModel,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * 在容器内执行技能脚本
   * 仅允许执行白名单中的脚本（如 init.sh）
   */
  async execSkillScript(
    containerId: string,
    skillName: string,
    scriptName: string = 'init.sh',
  ): Promise<{ stdout: string; success: boolean } | null> {
    // 使用 DockerExecService 的安全验证
    if (
      !this.dockerExec.isValidName(skillName) ||
      !this.dockerExec.isValidName(scriptName)
    ) {
      this.logger.warn('OpenClawClient: 非法技能名或脚本名', {
        skillName,
        scriptName,
      });
      return null;
    }

    const scriptPath = `/home/node/.openclaw/skills/${skillName}/scripts/${scriptName}`;
    this.logger.info('OpenClawClient: 执行技能脚本', {
      containerId,
      skillName,
      scriptPath,
    });

    const result = await this.dockerExec.executeCommand(
      containerId,
      ['sh', scriptPath],
      { user: 'node', timeout: 30000 },
    );

    if (result.success) {
      this.logger.info('OpenClawClient: 脚本执行完成', {
        containerId,
        skillName,
        outputLength: result.stdout.length,
        durationMs: result.durationMs,
      });
    } else {
      this.logger.error('OpenClawClient: 脚本执行失败', {
        containerId,
        skillName,
        stderr: result.stderr,
        durationMs: result.durationMs,
      });
    }

    return { stdout: result.stdout, success: result.success };
  }

  /**
   * 通过 WebSocket 发送消息并获取响应
   * 使用 OpenClaw Gateway 协议：
   * 1. 连接后发送 connect 请求进行认证
   * 2. 收到 hello-ok 后发送 chat.send 请求
   * 3. 监听 chat 事件获取响应
   */
  private sendMessageViaWebSocket(
    port: number,
    token: string,
    message: string | OpenClawContentPart[],
    _context?: OpenClawMessage[],
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      // OpenClaw gateway WebSocket 端点（不需要在 URL 中传递 token）
      const wsUrl = `ws://localhost:${port}`;

      this.logger.info('OpenClawClient: 建立 WebSocket 连接', {
        port,
        url: wsUrl,
      });

      // OpenClaw gateway 需要 Origin 和 User-Agent 头
      const ws = new WebSocket(wsUrl, {
        origin: `http://localhost:${port}`,
        headers: {
          'User-Agent': 'ClawbotManager/1.0',
        },
      });

      let responseText = '';
      let isResolved = false;
      let isConnected = false;
      let requestId = 0;
      let connectRequestId = '';
      let chatRequestId = '';

      const generateId = () => `req-${++requestId}-${randomUUID().slice(0, 8)}`;

      const timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          ws.close();
          reject(new Error('WebSocket 响应超时'));
        }
      }, this.wsTimeout);

      // 发送请求帧
      const sendRequest = (method: string, params: unknown) => {
        const frame = {
          type: 'req',
          id: generateId(),
          method,
          params,
        };
        this.logger.info('OpenClawClient: 发送请求', { method, id: frame.id });
        ws.send(JSON.stringify(frame));
        return frame.id;
      };

      ws.on('open', () => {
        this.logger.info('OpenClawClient: WebSocket 连接已建立', { port });

        // 第一步：发送 connect 请求进行认证
        connectRequestId = sendRequest('connect', {
          minProtocol: 3,
          maxProtocol: 3,
          client: {
            id: 'gateway-client',
            version: '1.0.0',
            platform: 'node',
            mode: 'backend',
          },
          auth: {
            token: token,
          },
        });
      });

      ws.on('message', (data: WebSocket.Data) => {
        try {
          const frame = JSON.parse(data.toString());
          this.logger.info('OpenClawClient: 收到消息', {
            type: frame.type,
            event: frame.event,
            ok: frame.ok,
            id: frame.id,
            payload: frame.payload
              ? JSON.stringify(frame.payload).substring(0, 500)
              : undefined,
          });

          // 处理 hello-ok 响应（connect 成功 - 旧协议）
          if (frame.type === 'hello-ok') {
            isConnected = true;
            this.logger.info('OpenClawClient: 认证成功 (hello-ok)', { port });

            // 第二步：发送聊天消息
            chatRequestId = sendRequest('chat.send', {
              sessionKey: 'main',
              message: message,
              idempotencyKey: randomUUID(),
            });
            return;
          }

          // 处理响应帧
          if (frame.type === 'res') {
            // connect 请求成功响应
            if (frame.id === connectRequestId && frame.ok && !isConnected) {
              isConnected = true;
              this.logger.info('OpenClawClient: 认证成功 (res)', { port });

              // 第二步：发送聊天消息
              chatRequestId = sendRequest('chat.send', {
                sessionKey: 'main',
                message: message,
                idempotencyKey: randomUUID(),
              });
              return;
            }

            // chat.send 请求成功响应
            if (frame.id === chatRequestId && frame.ok) {
              this.logger.info('OpenClawClient: chat.send 请求成功', { port });
              // 等待 chat 事件返回响应
              return;
            }

            // 错误响应
            if (!frame.ok && frame.error) {
              this.logger.error('OpenClawClient: 请求失败', {
                error: frame.error,
              });
              if (!isResolved) {
                isResolved = true;
                clearTimeout(timeoutId);
                ws.close();
                reject(new Error(frame.error.message || 'Request failed'));
              }
            }
            return;
          }

          // 处理事件帧（聊天响应）
          if (frame.type === 'event') {
            const { event } = frame;
            // payload 可能是 JSON 字符串，需要解析
            let payload: Record<string, unknown> | undefined;
            try {
              payload =
                typeof frame.payload === 'string'
                  ? JSON.parse(frame.payload)
                  : frame.payload;
            } catch {
              this.logger.warn('OpenClawClient: 解析 payload 失败', {
                payload: String(frame.payload).slice(0, 200),
              });
              payload = undefined;
            }

            // 处理 agent 事件（流式文本）
            // 格式: { stream: 'assistant', data: { text: '...' } }
            if (event === 'agent' && payload?.stream === 'assistant') {
              const data = payload.data as { text?: string } | undefined;
              if (data?.text) {
                // 流式文本累积 - 但 agent 事件发送的是累积文本，不是增量
                // 所以我们只保存最新的完整文本
                responseText = data.text;
                this.logger.debug('OpenClawClient: 收到 agent 流式文本', {
                  textLength: responseText.length,
                });
              }
              return;
            }

            // 处理 agent lifecycle 事件（结束信号）
            // 格式: { stream: 'lifecycle', data: { phase: 'end' } }
            if (event === 'agent' && payload?.stream === 'lifecycle') {
              const data = payload.data as { phase?: string } | undefined;
              if (data?.phase === 'end') {
                this.logger.info('OpenClawClient: agent 生命周期结束', {
                  responseLength: responseText.length,
                });
              }
              // 不在这里 resolve，等待 chat 事件的 final 状态
              return;
            }

            // 处理 chat 事件（最终结果）
            // 格式: { state: 'final', message: { role: 'assistant', content: [{ type: 'text', text: '...' }] } }
            if (event === 'chat') {
              const chatEvent = payload as Record<string, unknown> | undefined;
              this.logger.info('OpenClawClient: 处理 chat 事件', {
                state: chatEvent?.state,
                hasMessage: !!chatEvent?.message,
                currentResponseLength: responseText.length,
              });

              // 处理 final 状态
              if (chatEvent?.state === 'final') {
                // 尝试从 message.content 提取最终文本
                const message = chatEvent?.message as
                  | { content?: Array<{ type: string; text?: string }> }
                  | undefined;
                if (message?.content && Array.isArray(message.content)) {
                  let finalText = '';
                  for (const item of message.content) {
                    if (item.type === 'text' && item.text) {
                      finalText += item.text;
                    }
                  }
                  if (finalText) {
                    responseText = finalText;
                  }
                }

                this.logger.info('OpenClawClient: 聊天完成 (final)', {
                  finalResponseLength: responseText.length,
                  responsePreview: responseText.substring(0, 200),
                });

                // 无论是否有 message，final 状态都应该 resolve
                if (!isResolved) {
                  isResolved = true;
                  clearTimeout(timeoutId);
                  ws.close();
                  resolve(responseText);
                }
                return;
              }

              // 兼容旧格式: payload.type === 'text' / 'result' / 'error'
              if (chatEvent?.type === 'text' && chatEvent?.text) {
                const text = String(chatEvent.text);
                responseText += text;
                this.logger.debug('OpenClawClient: 累积响应文本 (旧格式)', {
                  addedLength: text.length,
                  totalLength: responseText.length,
                });
              } else if (chatEvent?.type === 'result') {
                this.logger.info('OpenClawClient: 聊天完成 (result)', {
                  finalResponseLength: responseText.length,
                  responsePreview: responseText.substring(0, 200),
                });
                if (!isResolved) {
                  isResolved = true;
                  clearTimeout(timeoutId);
                  ws.close();
                  resolve(responseText);
                }
              } else if (chatEvent?.type === 'error') {
                const errorMessage = String(chatEvent.message || 'Chat error');
                this.logger.error('OpenClawClient: 聊天错误', {
                  errorMessage,
                });
                if (!isResolved) {
                  isResolved = true;
                  clearTimeout(timeoutId);
                  ws.close();
                  reject(new Error(errorMessage));
                }
              }
            }
            return;
          }
        } catch (e) {
          this.logger.warn('OpenClawClient: 解析消息失败', {
            error: e instanceof Error ? e.message : 'Unknown error',
            data: data.toString().slice(0, 200),
          });
        }
      });

      ws.on('error', (error: Error) => {
        this.logger.error('OpenClawClient: WebSocket 错误', {
          port,
          error: error.message,
        });
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeoutId);
          reject(error);
        }
      });

      ws.on('close', (code: number, reason: Buffer) => {
        this.logger.debug('OpenClawClient: WebSocket 连接关闭', {
          port,
          code,
          reason: reason.toString(),
          isConnected,
        });

        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeoutId);

          // 如果有响应文本，返回它
          if (responseText) {
            resolve(responseText);
          } else if (code === 1008) {
            // 1008 = Policy Violation (unauthorized)
            reject(
              new Error(
                `WebSocket 认证失败: ${reason.toString() || 'gateway token missing'}`,
              ),
            );
          } else {
            reject(
              new Error(
                `WebSocket 连接意外关闭: code=${code}, reason=${reason.toString()}`,
              ),
            );
          }
        }
      });
    });
  }

  /**
   * 检查 OpenClaw Gateway 健康状态
   */
  async checkHealth(port: number): Promise<boolean> {
    const url = `http://localhost:${port}/health`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(url).pipe(
          timeout(5000),
          catchError(() => {
            return Promise.resolve({ status: 500 });
          }),
        ),
      );
      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * 通过 Docker exec 获取容器内安装的技能列表
   * 优先使用 `openclaw skills list --json`，失败则 fallback 到读取配置文件
   * 获取技能列表后，还会尝试读取每个技能的 SKILL.md 内容
   * @param containerId Docker 容器 ID
   * @returns 技能列表或 null（exec 失败时）
   */
  async listContainerSkills(
    containerId: string,
  ): Promise<ContainerSkillItem[] | null> {
    this.logger.info('OpenClawClient: 获取容器内置技能', { containerId });

    // 尝试 CLI 命令
    const cliOutput = await this.execInContainer(containerId, [
      'node',
      '/app/openclaw.mjs',
      'skills',
      'list',
      '--json',
    ]);

    let skills: ContainerSkillItem[] | null = null;

    if (cliOutput) {
      try {
        const parsed = JSON.parse(cliOutput);
        skills = this.normalizeSkillsList(parsed);
      } catch {
        this.logger.warn('OpenClawClient: CLI 输出解析失败，尝试读取配置文件', {
          containerId,
          outputPreview: cliOutput.substring(0, 200),
        });
      }
    }

    // Fallback: 读取容器内的 openclaw.json 配置
    if (!skills) {
      const configOutput = await this.execInContainer(containerId, [
        'cat',
        '/home/node/.openclaw/openclaw.json',
      ]);

      if (configOutput) {
        try {
          const config = JSON.parse(configOutput);
          skills = this.parseSkillsFromConfig(config);
        } catch {
          this.logger.warn('OpenClawClient: 配置文件解析失败', { containerId });
        }
      }
    }

    if (!skills) return null;

    // 批量读取每个技能的 SKILL.md 内容
    await this.enrichSkillsWithContent(containerId, skills);

    return skills;
  }

  /**
   * 在容器内执行命令并返回 stdout 输出
   * 使用 DockerExecService 统一处理
   */
  private async execInContainer(
    containerId: string,
    cmd: string[],
  ): Promise<string | null> {
    const result = await this.dockerExec.executeCommand(containerId, cmd, {
      timeout: 15000,
    });
    return result.success ? result.stdout : null;
  }

  /**
   * 标准化技能列表输出
   * 处理不同格式：数组、{ skills: [] }、{ builtin: {} } 等
   */
  private normalizeSkillsList(parsed: unknown): ContainerSkillItem[] {
    if (Array.isArray(parsed)) {
      return parsed.map((item) => ({
        name: String(item.name || item.slug || 'unknown'),
        enabled: item.enabled !== false,
        description: item.description || null,
        version: item.version || null,
        content: null,
      }));
    }

    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;

      // { skills: [...] }
      if (Array.isArray(obj.skills)) {
        return this.normalizeSkillsList(obj.skills);
      }

      // { builtin: { skill_name: true/false, ... } }
      if (obj.builtin && typeof obj.builtin === 'object') {
        return Object.entries(obj.builtin as Record<string, boolean>).map(
          ([name, enabled]) => ({
            name,
            enabled: enabled !== false,
            description: null,
            version: null,
            content: null,
          }),
        );
      }
    }

    return [];
  }

  /**
   * 从 openclaw.json 配置中解析技能信息
   */
  private parseSkillsFromConfig(config: unknown): ContainerSkillItem[] {
    if (!config || typeof config !== 'object') return [];
    const cfg = config as Record<string, unknown>;

    // 尝试 skills.builtin 路径
    const skills = cfg.skills as Record<string, unknown> | undefined;
    if (skills?.builtin && typeof skills.builtin === 'object') {
      return Object.entries(skills.builtin as Record<string, boolean>).map(
        ([name, enabled]) => ({
          name,
          enabled: enabled !== false,
          description: null,
          version: null,
          content: null,
        }),
      );
    }

    // 尝试 commands.nativeSkills 路径
    const commands = cfg.commands as Record<string, unknown> | undefined;
    if (commands?.nativeSkills && commands.nativeSkills !== 'auto') {
      if (
        typeof commands.nativeSkills === 'object' &&
        !Array.isArray(commands.nativeSkills)
      ) {
        return Object.entries(
          commands.nativeSkills as Record<string, boolean>,
        ).map(([name, enabled]) => ({
          name,
          enabled: enabled !== false,
          description: null,
          version: null,
          content: null,
        }));
      }
    }

    // nativeSkills: "auto" 表示全部启用，但无法获取具体列表
    if (commands?.nativeSkills === 'auto') {
      return [
        {
          name: 'native-skills',
          enabled: true,
          description: 'All native skills enabled (auto mode)',
          version: null,
          content: null,
        },
      ];
    }

    return [];
  }

  /**
   * 注入 MCP Server 配置到 OpenClaw 容器的 openclaw.json
   * 在插件安装后，将 mcpConfig 实际注入到容器的配置文件中
   * @param containerId Docker 容器 ID
   * @param mcpServers Record<string, McpServerConfig>
   *   McpServerConfig 格式：{ "plugin-slug": { "command": "npx", "args": [...], "env": {...} }
   *   注意：这会合并（而非覆盖）openclaw.json 中的 mcpServers 配置
   */
  async injectMcpConfig(
    containerId: string,
    mcpServers: Record<string, McpServerConfig>,
  ): Promise<void> {
    this.logger.info('OpenClawClient: 注入 MCP 配置', { containerId });

    // 安全序列化 MCP 配置
    const mcpServersJson = JSON.stringify(mcpServers).replace(/"/g, '\\"');

    const nodeScript = `
      const fs = require("fs");
      const configPath = "/home/node/.openclaw/openclaw.json";
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      config.mcpServers = config.mcpServers || {};
      const newServers = ${mcpServersJson};
      for (const [name, server] of Object.entries(newServers)) {
        config.mcpServers[name] = server;
      }
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
      console.log(JSON.stringify({ success: true }));
    `;

    const result = await this.dockerExec.executeNodeScript(
      containerId,
      nodeScript,
      { timeout: 15000, throwOnError: true },
    );

    this.logger.info('OpenClawClient: MCP 配置注入完成', {
      containerId,
      plugins: Object.keys(mcpServers),
      output: result.stdout,
      durationMs: result.durationMs,
    });
  }

  /**
   * 移除指定 MCP Server 配置
   * @param containerId Docker 容器 ID
   * @param serverName MCP Server plugin slug（如 "mcp-server-slack"）
   */
  async removeMcpConfig(
    containerId: string,
    serverName: string,
  ): Promise<void> {
    this.logger.info('OpenClawClient: 移除 MCP 配置', {
      containerId,
      serverName,
    });

    // 安全校验：只允许合法字符（防止 shell 注入）
    if (!this.dockerExec.isValidName(serverName)) {
      throw new Error(`Invalid server name: ${serverName}`);
    }

    // 构建 node 脚本：读取 openclaw.json，删除指定 mcpServers，写回文件
    // 使用引号包裹属性名，避免注入风险
    const nodeScript = `
      const fs = require("fs");
      const configPath = "/home/node/.openclaw/openclaw.json";
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (config.mcpServers) {
        delete config.mcpServers["${serverName}"];
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
        console.log(JSON.stringify({ success: true, removed: "${serverName}" }));
      } else {
        console.log(JSON.stringify({ success: true, message: "No mcpServers found" }));
      }
    `;

    const result = await this.dockerExec.executeNodeScript(
      containerId,
      nodeScript,
      { timeout: 10000, throwOnError: true },
    );

    this.logger.info('OpenClawClient: MCP 配置移除完成', {
      containerId,
      serverName,
      output: result.stdout,
      durationMs: result.durationMs,
    });
  }

  // ============================================================================
  // 热加载机制（无需重启容器即可生效）
  // ============================================================================

  /**
   * 重新加载 Skills（热加载通知）
   * 通知 OpenClaw 重新扫描并加载 skills 目录
   * @param containerId Docker 容器 ID
   */
  async reloadSkills(containerId: string): Promise<void> {
    this.logger.info('OpenClawClient: 重新加载 Skills', { containerId });

    // 方案1：尝试调用 OpenClaw CLI 的 reload 命令（如果支持）
    // 方案2：通过发送 SIGHUP 信号通知进程重载
    // 方案3：目前 OpenClaw 会自动检测文件变化，此方法预留用于未来扩展

    // 当前实现：记录日志，OpenClaw 通过文件系统 watch 自动重载
    // 未来可以添加显式的 reload API 调用
    this.logger.info(
      'OpenClawClient: Skills 热加载完成（OpenClaw 自动检测文件变化）',
      {
        containerId,
      },
    );
  }

  /**
   * 重新加载 MCP Servers（热加载通知）
   * 通知 OpenClaw 重新连接所有 MCP 服务器
   * @param containerId Docker 容器 ID
   */
  async reloadMcpServers(containerId: string): Promise<void> {
    this.logger.info('OpenClawClient: 重新加载 MCP Servers', { containerId });

    // 当前实现：记录日志，OpenClaw 会自动检测配置变化
    // 未来可以添加显式的 MCP reload API 调用
    this.logger.info(
      'OpenClawClient: MCP Servers 热加载完成（OpenClaw 自动检测配置变化）',
      {
        containerId,
      },
    );
  }

  /**
   * 检查 Skill 是否存在于容器内
   * @param containerId Docker 容器 ID
   * @param skillName 技能名称
   */
  async checkSkillExists(
    containerId: string,
    skillName: string,
  ): Promise<boolean> {
    // 安全校验
    if (!this.dockerExec.isValidName(skillName)) {
      return false;
    }

    const result = await this.dockerExec.executeCommand(containerId, [
      'test',
      '-d',
      `/home/node/.openclaw/skills/${skillName}`,
    ]);

    return result.success;
  }

  /**
   * 批量读取容器内每个技能的 SKILL.md 内容
   * 使用单次 exec 调用读取所有技能的 MD 文件，减少 Docker API 调用次数
   */
  private async enrichSkillsWithContent(
    containerId: string,
    skills: ContainerSkillItem[],
  ): Promise<void> {
    if (skills.length === 0) return;

    // 安全校验：只允许合法字符的技能名参与 shell 命令（防止注入）
    const safeSkills = skills.filter((s) =>
      this.dockerExec.isValidName(s.name),
    );

    if (safeSkills.length === 0) return;

    // 构建 shell 命令：遍历已知技能名，尝试多个路径读取 SKILL.md
    const script = safeSkills
      .map(
        (s) =>
          `echo "===SKILL:${s.name}==="; cat "/home/node/.openclaw/skills/${s.name}/SKILL.md" 2>/dev/null || cat "/app/skills/${s.name}/SKILL.md" 2>/dev/null || echo ""`,
      )
      .join('; ');

    const output = await this.execInContainer(containerId, [
      'sh',
      '-c',
      script,
    ]);

    if (!output) return;

    // 解析输出，按 ===SKILL:name=== 分隔符拆分
    const sections = output.split(/===SKILL:([^=]+)===/);
    // sections: ['', name1, content1, name2, content2, ...]
    for (let i = 1; i < sections.length; i += 2) {
      const name = sections[i].trim();
      const content = sections[i + 1]?.trim() || null;
      const skill = skills.find((s) => s.name === name);
      if (skill && content) {
        skill.content = content;
      }
    }
  }
}
