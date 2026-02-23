/**
 * Docker Exec 服务
 *
 * 提供统一的 Docker 容器命令执行接口
 * 封装 Docker API exec 调用模式，减少代码重复
 */
import { Inject, Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { firstValueFrom, timeout, catchError } from 'rxjs';

/**
 * Docker exec 执行选项
 */
export interface DockerExecOptions {
  /** 执行超时（毫秒），默认 15000 */
  timeout?: number;
  /** 执行用户，默认容器默认用户 */
  user?: string;
  /** 是否在失败时抛出错误，默认 false */
  throwOnError?: boolean;
  /** 是否返回 stderr，默认 false */
  includeStderr?: boolean;
}

/**
 * Docker exec 执行结果
 */
export interface DockerExecResult {
  /** stdout 输出 */
  stdout: string;
  /** stderr 输出 */
  stderr: string;
  /** 是否执行成功（无错误抛出） */
  success: boolean;
  /** 执行耗时（毫秒） */
  durationMs: number;
}

@Injectable()
export class DockerExecService {
  private readonly defaultTimeout = 15000;
  private readonly dockerSocket = '/var/run/docker.sock';

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly httpService: HttpService,
  ) {}

  /**
   * 在容器内执行命令
   *
   * @param containerId 容器 ID
   * @param cmd 命令数组，如 ['node', '-e', script]
   * @param options 执行选项
   * @returns 执行结果
   */
  async executeCommand(
    containerId: string,
    cmd: string[],
    options?: DockerExecOptions,
  ): Promise<DockerExecResult> {
    const {
      timeout: execTimeout = this.defaultTimeout,
      user,
      throwOnError = false,
    } = options ?? {};

    const startTime = Date.now();

    try {
      // Step 1: 创建 exec 实例
      const execId = await this.createExec(containerId, cmd, {
        user,
        timeout: execTimeout,
      });

      // Step 2: 启动 exec 并获取输出
      const rawOutput = await this.startExec(execId, execTimeout);

      // Step 3: 解析输出
      const { stdout, stderr } = this.parseOutput(rawOutput);

      this.logger.debug('DockerExecService: 命令执行成功', {
        containerId,
        cmd: cmd.join(' ').substring(0, 100),
        durationMs: Date.now() - startTime,
        stdoutLength: stdout.length,
      });

      return {
        stdout,
        stderr,
        success: true,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('DockerExecService: 命令执行失败', {
        containerId,
        cmd: cmd.join(' ').substring(0, 100),
        error: errorMessage,
        durationMs: Date.now() - startTime,
      });

      if (throwOnError) {
        throw error;
      }

      return {
        stdout: '',
        stderr: errorMessage,
        success: false,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * 执行 Node.js 脚本
   *
   * @param containerId 容器 ID
   * @param script Node.js 脚本内容
   * @param options 执行选项
   */
  async executeNodeScript(
    containerId: string,
    script: string,
    options?: DockerExecOptions,
  ): Promise<DockerExecResult> {
    return this.executeCommand(containerId, ['node', '-e', script], options);
  }

  /**
   * 执行 Shell 命令
   *
   * @param containerId 容器 ID
   * @param command Shell 命令
   * @param options 执行选项
   */
  async executeShellCommand(
    containerId: string,
    command: string,
    options?: DockerExecOptions,
  ): Promise<DockerExecResult> {
    return this.executeCommand(containerId, ['sh', '-c', command], options);
  }

  /**
   * 验证名称是否安全（防止注入）
   *
   * @param name 要验证的名称
   * @returns 是否安全
   */
  isValidName(name: string): boolean {
    const safeNamePattern = /^[a-zA-Z0-9_\-.]+$/;
    return safeNamePattern.test(name);
  }

  // --- 私有方法 ---

  private async createExec(
    containerId: string,
    cmd: string[],
    options: { user?: string; timeout: number },
  ): Promise<string> {
    const execCreateUrl = `http://localhost/containers/${containerId}/exec`;
    const execCreateBody: Record<string, unknown> = {
      AttachStdout: true,
      AttachStderr: true,
      Cmd: cmd,
    };
    if (options.user) {
      execCreateBody.User = options.user;
    }

    const response = await firstValueFrom(
      this.httpService
        .post(execCreateUrl, execCreateBody, {
          socketPath: this.dockerSocket,
          timeout: options.timeout,
        })
        .pipe(
          timeout(options.timeout),
          catchError((error) => {
            this.logger.error('DockerExecService: 创建 exec 失败', {
              containerId,
              cmd: cmd.join(' ').substring(0, 100),
              error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
          }),
        ),
    );

    const execId = response.data?.Id;
    if (!execId) {
      throw new Error('Failed to create exec instance: no exec ID returned');
    }
    return execId;
  }

  private async startExec(
    execId: string,
    timeoutMs: number,
  ): Promise<ArrayBuffer> {
    const execStartUrl = `http://localhost/exec/${execId}/start`;

    const response = await firstValueFrom(
      this.httpService
        .post(
          execStartUrl,
          { Detach: false, Tty: false },
          {
            socketPath: this.dockerSocket,
            timeout: timeoutMs,
            responseType: 'arraybuffer',
          },
        )
        .pipe(
          timeout(timeoutMs),
          catchError((error) => {
            this.logger.error('DockerExecService: 启动 exec 失败', {
              execId,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
          }),
        ),
    );

    return response.data;
  }

  /**
   * 解析 Docker exec 多路复用流输出
   * Docker exec 输出格式：每帧 8 字节头 + payload
   * 头部：[stream_type(1), 0, 0, 0, size(4 bytes big-endian)]
   */
  private parseOutput(data: ArrayBuffer): { stdout: string; stderr: string } {
    const buffer = Buffer.from(data);
    let stdout = '';
    let stderr = '';
    let offset = 0;

    while (offset + 8 <= buffer.length) {
      const streamType = buffer[offset];
      const size = buffer.readUInt32BE(offset + 4);
      offset += 8;

      if (offset + size > buffer.length) break;

      const content = buffer.subarray(offset, offset + size).toString('utf-8');
      if (streamType === 1) {
        stdout += content;
      } else if (streamType === 2) {
        stderr += content;
      }
      offset += size;
    }

    // 如果解析失败（非多路复用格式），返回原始字符串作为 stdout
    if (!stdout && !stderr && buffer.length > 0) {
      stdout = buffer.toString('utf-8');
    }

    return { stdout: stdout.trim(), stderr: stderr.trim() };
  }
}
