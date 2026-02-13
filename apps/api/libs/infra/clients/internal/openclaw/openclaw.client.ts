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

export interface OpenClawMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
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

@Injectable()
export class OpenClawClient {
  private readonly requestTimeout = 120000; // 2 分钟超时
  private readonly wsTimeout = 120000; // WebSocket 响应超时

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly httpService: HttpService,
  ) {}

  /**
   * 发送消息到 OpenClaw Gateway 并获取 AI 响应
   * 使用 WebSocket 进行通信
   * @param port OpenClaw Gateway 端口
   * @param token Gateway 认证 token
   * @param message 用户消息
   * @param options 可选的聊天选项（上下文、模型、路由提示等）
   */
  async chat(
    port: number,
    token: string,
    message: string,
    options?: OpenClawChatOptions,
  ): Promise<string> {
    this.logger.info('OpenClawClient: 发送消息到 OpenClaw', {
      port,
      messageLength: message.length,
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
    message: string,
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

    try {
      // 使用 HTTP 调用 Docker API 执行命令
      // 注意：这需要 Docker socket 访问权限
      const execCreateUrl = `http://localhost/containers/${containerId}/exec`;
      const execCreateResponse = await firstValueFrom(
        this.httpService
          .post(
            execCreateUrl,
            {
              AttachStdout: true,
              AttachStderr: true,
              Cmd: ['node', '/app/openclaw.mjs', 'models', 'set', model],
            },
            {
              socketPath: '/var/run/docker.sock',
              timeout: 10000,
            },
          )
          .pipe(
            timeout(10000),
            catchError((error) => {
              this.logger.error('OpenClawClient: 创建 exec 失败', {
                error: error instanceof Error ? error.message : 'Unknown error',
              });
              throw error;
            }),
          ),
      );

      const execId = execCreateResponse.data?.Id;
      if (!execId) {
        throw new Error('Failed to create exec instance');
      }

      // 启动 exec
      const execStartUrl = `http://localhost/exec/${execId}/start`;
      await firstValueFrom(
        this.httpService
          .post(
            execStartUrl,
            { Detach: false, Tty: false },
            {
              socketPath: '/var/run/docker.sock',
              timeout: 10000,
            },
          )
          .pipe(
            timeout(10000),
            catchError((error) => {
              this.logger.error('OpenClawClient: 启动 exec 失败', {
                error: error instanceof Error ? error.message : 'Unknown error',
              });
              throw error;
            }),
          ),
      );

      this.logger.info('OpenClawClient: 模型切换成功', { containerId, model });
    } catch (error) {
      this.logger.error('OpenClawClient: 模型切换失败', {
        containerId,
        model,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // 不抛出错误，允许继续使用当前模型
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
    const safeNamePattern = /^[a-zA-Z0-9_\-.]+$/;
    if (!safeNamePattern.test(skillName) || !safeNamePattern.test(scriptName)) {
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

    try {
      const execCreateUrl = `http://localhost/containers/${containerId}/exec`;
      const execCreateResponse = await firstValueFrom(
        this.httpService
          .post(
            execCreateUrl,
            {
              AttachStdout: true,
              AttachStderr: true,
              Cmd: ['sh', scriptPath],
              User: 'node',
            },
            {
              socketPath: '/var/run/docker.sock',
              timeout: 10000,
            },
          )
          .pipe(
            timeout(10000),
            catchError((error) => {
              this.logger.error('OpenClawClient: 创建脚本 exec 失败', {
                error: error instanceof Error ? error.message : 'Unknown error',
              });
              throw error;
            }),
          ),
      );

      const execId = execCreateResponse.data?.Id;
      if (!execId) return null;

      const execStartUrl = `http://localhost/exec/${execId}/start`;
      const execStartResponse = await firstValueFrom(
        this.httpService
          .post(
            execStartUrl,
            { Detach: false, Tty: false },
            {
              socketPath: '/var/run/docker.sock',
              timeout: 30000,
              responseType: 'arraybuffer',
            },
          )
          .pipe(
            timeout(30000),
            catchError((error) => {
              this.logger.error('OpenClawClient: 脚本执行超时或失败', {
                error: error instanceof Error ? error.message : 'Unknown error',
              });
              throw error;
            }),
          ),
      );

      const stdout = this.parseDockerExecOutput(execStartResponse.data);
      this.logger.info('OpenClawClient: 脚本执行完成', {
        containerId,
        skillName,
        outputLength: stdout.length,
      });

      return { stdout, success: true };
    } catch (error) {
      this.logger.error('OpenClawClient: 脚本执行失败', {
        containerId,
        skillName,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return { stdout: '', success: false };
    }
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
    message: string,
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
   */
  private async execInContainer(
    containerId: string,
    cmd: string[],
  ): Promise<string | null> {
    try {
      const execCreateUrl = `http://localhost/containers/${containerId}/exec`;
      const execCreateResponse = await firstValueFrom(
        this.httpService
          .post(
            execCreateUrl,
            {
              AttachStdout: true,
              AttachStderr: true,
              Cmd: cmd,
            },
            {
              socketPath: '/var/run/docker.sock',
              timeout: 10000,
            },
          )
          .pipe(
            timeout(10000),
            catchError((error) => {
              this.logger.error('OpenClawClient: 创建 exec 失败', {
                error: error instanceof Error ? error.message : 'Unknown error',
                cmd: cmd.join(' '),
              });
              throw error;
            }),
          ),
      );

      const execId = execCreateResponse.data?.Id;
      if (!execId) {
        return null;
      }

      const execStartUrl = `http://localhost/exec/${execId}/start`;
      const execStartResponse = await firstValueFrom(
        this.httpService
          .post(
            execStartUrl,
            { Detach: false, Tty: false },
            {
              socketPath: '/var/run/docker.sock',
              timeout: 15000,
              responseType: 'arraybuffer',
            },
          )
          .pipe(
            timeout(15000),
            catchError((error) => {
              this.logger.error('OpenClawClient: 启动 exec 失败', {
                error: error instanceof Error ? error.message : 'Unknown error',
              });
              throw error;
            }),
          ),
      );

      return this.parseDockerExecOutput(execStartResponse.data);
    } catch {
      return null;
    }
  }

  /**
   * 解析 Docker exec 多路复用流输出
   * Docker exec 输出格式：每帧 8 字节头 + payload
   * 头部：[stream_type(1), 0, 0, 0, size(4 bytes big-endian)]
   */
  private parseDockerExecOutput(data: ArrayBuffer | Buffer): string {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    let output = '';
    let offset = 0;

    while (offset + 8 <= buffer.length) {
      const streamType = buffer[offset];
      const size = buffer.readUInt32BE(offset + 4);
      offset += 8;

      if (offset + size > buffer.length) break;

      // streamType 1 = stdout, 2 = stderr; 只取 stdout
      if (streamType === 1) {
        output += buffer.subarray(offset, offset + size).toString('utf-8');
      }
      offset += size;
    }

    // 如果解析失败（非多路复用格式），直接返回原始字符串
    if (!output && buffer.length > 0) {
      output = buffer.toString('utf-8');
    }

    return output.trim();
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
   * 批量读取容器内每个技能的 SKILL.md 内容
   * 使用单次 exec 调用读取所有技能的 MD 文件，减少 Docker API 调用次数
   */
  private async enrichSkillsWithContent(
    containerId: string,
    skills: ContainerSkillItem[],
  ): Promise<void> {
    if (skills.length === 0) return;

    // 安全校验：只允许合法字符的技能名参与 shell 命令（防止注入）
    const safeNamePattern = /^[a-zA-Z0-9_\-.]+$/;
    const safeSkills = skills.filter((s) => safeNamePattern.test(s.name));

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
