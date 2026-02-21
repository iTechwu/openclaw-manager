import { Inject, Injectable } from '@nestjs/common';
import * as https from 'https';
import * as http from 'http';
import * as zlib from 'zlib';
import type { IncomingMessage, ServerResponse } from 'http';
import type { VendorConfig } from '../config/vendor.config';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { TokenExtractorService, TokenUsage } from './token-extractor.service';

/**
 * 上游请求参数
 */
export interface UpstreamRequest {
  vendorConfig: VendorConfig;
  path: string;
  method: string;
  headers: Record<string, string>;
  body: Buffer | null;
  apiKey: string;
  /** 自定义 URL（如果提供，将覆盖 vendorConfig 的 host 和 basePath） */
  customUrl?: string;
  /** Provider 特定的元数据（如 MiniMax groupId） */
  metadata?: Record<string, unknown> | null;
  /** Provider vendor 标识 */
  vendor?: string;
}

/**
 * 上游响应结果
 */
export interface UpstreamResult {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body?: Buffer;
}

/**
 * 流式转发结果
 */
export interface StreamForwardResult {
  statusCode: number;
  tokenUsage: TokenUsage | null;
  /** 响应时间 (ms) */
  responseTimeMs: number;
  /** 请求是否成功（2xx 状态码） */
  success: boolean;
}

/**
 * 解析 URL 获取请求参数
 */
interface ParsedUrl {
  protocol: 'http' | 'https';
  hostname: string;
  port: number;
  basePath: string;
}

/**
 * UpstreamService - 上游转发服务
 *
 * 负责将请求转发到 AI 提供商的 API：
 * - 处理 HTTP/HTTPS 请求
 * - 支持 SSE 流式响应
 * - 处理认证头替换
 * - 支持自定义 endpoint URL
 */
@Injectable()
export class UpstreamService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly tokenExtractor: TokenExtractorService,
  ) {}

  /**
   * 解析 URL 获取协议、主机名、端口和路径
   */
  private parseUrl(url: string): ParsedUrl {
    try {
      const parsed = new URL(url);
      return {
        protocol: parsed.protocol === 'http:' ? 'http' : 'https',
        hostname: parsed.hostname,
        port: parsed.port
          ? parseInt(parsed.port, 10)
          : parsed.protocol === 'http:'
            ? 80
            : 443,
        basePath: parsed.pathname === '/' ? '' : parsed.pathname,
      };
    } catch {
      // 默认 HTTPS
      return {
        protocol: 'https',
        hostname: url,
        port: 443,
        basePath: '',
      };
    }
  }

  /**
   * 构建上游请求选项（URL 解析、header 清理、MiniMax GroupId 注入）
   */
  private buildUpstreamOptions(req: UpstreamRequest): {
    options: {
      hostname: string;
      port: number;
      path: string;
      method: string;
      headers: Record<string, string>;
    };
    useHttps: boolean;
  } {
    const { vendorConfig, path, method, headers, body, apiKey, customUrl } =
      req;

    // 解析目标 URL
    let targetHost: string;
    let targetPort: number;
    let targetBasePath: string;
    let useHttps: boolean;

    if (customUrl) {
      const parsed = this.parseUrl(customUrl);
      targetHost = parsed.hostname;
      targetPort = parsed.port;
      targetBasePath = parsed.basePath;
      useHttps = parsed.protocol === 'https';
    } else {
      targetHost = vendorConfig.host;
      targetPort = 443;
      targetBasePath = vendorConfig.basePath;
      useHttps = true;
    }

    // 构建上游路径
    let upstreamPath = targetBasePath + path;

    // 注入 provider 特定的 query 参数（如 MiniMax GroupId）
    if (req.metadata && req.vendor === 'minimax' && req.metadata.group_id) {
      const separator = upstreamPath.includes('?') ? '&' : '?';
      upstreamPath += `${separator}GroupId=${encodeURIComponent(String(req.metadata.group_id))}`;
    }

    // 克隆并修改请求头
    const upstreamHeaders: Record<string, string> = { ...headers };
    delete upstreamHeaders['host'];
    delete upstreamHeaders['connection'];
    delete upstreamHeaders['authorization'];
    delete upstreamHeaders['content-length'];

    upstreamHeaders['host'] = targetHost;
    upstreamHeaders[vendorConfig.authHeader.toLowerCase()] =
      vendorConfig.authFormat(apiKey);

    if (body) {
      upstreamHeaders['content-length'] = String(body.length);
    }

    return {
      options: {
        hostname: targetHost,
        port: targetPort,
        path: upstreamPath,
        method,
        headers: upstreamHeaders,
      },
      useHttps,
    };
  }

  /**
   * 转发请求到上游服务（流式响应）
   *
   * @param req 上游请求参数
   * @param rawResponse 原始响应对象（用于流式传输）
   * @param vendor AI 提供商标识（用于 token 提取）
   * @returns 响应状态码和 token 使用量
   */
  async forwardToUpstream(
    req: UpstreamRequest,
    rawResponse: ServerResponse,
    vendor?: string,
  ): Promise<StreamForwardResult> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const { body } = req;
      const { options, useHttps } = this.buildUpstreamOptions(req);

      this.logger.info(
        `[Proxy] Forwarding to upstream: ${options.method} ${useHttps ? 'https' : 'http'}://${options.hostname}:${options.port}${options.path}`,
      );

      // 收集响应数据用于 token 提取（仅收集最后 64KB 用于 usage 提取）
      const responseChunks: Buffer[] = [];
      let totalBufferSize = 0;
      const MAX_BUFFER_SIZE = 64 * 1024; // 64KB limit for usage extraction

      const httpModule = useHttps ? https : http;
      const proxyReq = httpModule.request(
        options,
        (proxyRes: IncomingMessage) => {
          const statusCode = proxyRes.statusCode ?? 500;

          // 构建转发的响应头（排除 hop-by-hop 头）
          const forwardHeaders: Record<string, string | string[]> = {};
          for (const [key, value] of Object.entries(proxyRes.headers)) {
            const lowerKey = key.toLowerCase();
            if (
              value &&
              !['connection', 'transfer-encoding', 'content-length'].includes(
                lowerKey,
              )
            ) {
              forwardHeaders[key] = value;
            }
          }

          // 对于 SSE 响应，确保正确的流式头
          const contentType = proxyRes.headers['content-type'];
          if (contentType?.includes('text/event-stream')) {
            forwardHeaders['cache-control'] = 'no-cache';
            forwardHeaders['connection'] = 'keep-alive';
          }

          // 使用原始响应绕过 Fastify/NestJS 缓冲
          // 这对于 SSE 流式传输正常工作至关重要
          rawResponse.writeHead(statusCode, forwardHeaders);

          proxyRes.on('data', (chunk) => {
            rawResponse.write(chunk);
            // 仅收集最后 64KB 用于 usage 提取（避免长对话内存爆炸）
            if (totalBufferSize + chunk.length <= MAX_BUFFER_SIZE) {
              responseChunks.push(chunk);
              totalBufferSize += chunk.length;
            } else {
              // 超过限制时，丢弃旧数据，保留最新的
              const overflow = totalBufferSize + chunk.length - MAX_BUFFER_SIZE;
              while (overflow > 0 && responseChunks.length > 0) {
                const first = responseChunks[0];
                if (first.length <= overflow) {
                  totalBufferSize -= first.length;
                  responseChunks.shift();
                } else {
                  responseChunks[0] = first.subarray(overflow);
                  totalBufferSize -= overflow;
                  break;
                }
              }
              responseChunks.push(chunk);
              totalBufferSize += chunk.length;
            }
            // 强制刷新 SSE - 确保事件立即发送
            if (typeof (rawResponse as any).flush === 'function') {
              (rawResponse as any).flush();
            }
          });

          proxyRes.on('end', () => {
            rawResponse.end();

            const responseTimeMs = Date.now() - startTime;

            // Log response data for debugging (concise summary)
            const rawBuffer = Buffer.concat(responseChunks);
            // Decompress gzip/deflate responses for readable logging
            const contentEncoding =
              proxyRes.headers['content-encoding']?.toLowerCase();
            let responseData: string;
            try {
              if (contentEncoding === 'gzip') {
                responseData = zlib.gunzipSync(rawBuffer).toString('utf-8');
              } else if (contentEncoding === 'deflate') {
                responseData = zlib.inflateSync(rawBuffer).toString('utf-8');
              } else if (contentEncoding === 'br') {
                responseData = zlib
                  .brotliDecompressSync(rawBuffer)
                  .toString('utf-8');
              } else {
                responseData = rawBuffer.toString('utf-8');
              }
            } catch {
              responseData = rawBuffer.toString('utf-8');
            }
            if (responseData.length > 0) {
              // For SSE responses, extract usage from last event; for JSON, extract key fields
              if (contentType?.includes('text/event-stream')) {
                // Try to extract usage info from the last SSE event
                const lines = responseData.split('\n').filter((l) => l.trim());
                let usageSummary = {};
                try {
                  // Find the last data line that contains usage info
                  for (let i = lines.length - 1; i >= 0; i--) {
                    const line = lines[i];
                    if (line.startsWith('data:')) {
                      const jsonStr = line.slice(5).trim();
                      if (jsonStr && jsonStr !== '[DONE]') {
                        const parsed = JSON.parse(jsonStr);
                        if (parsed.usage) {
                          usageSummary = {
                            model: parsed.model,
                            input_tokens:
                              parsed.usage.input_tokens ||
                              parsed.usage.prompt_tokens,
                            output_tokens:
                              parsed.usage.output_tokens ||
                              parsed.usage.completion_tokens,
                            total_tokens: parsed.usage.total_tokens,
                          };
                          break;
                        }
                      }
                    }
                  }
                } catch {
                  // Ignore parse errors
                }
                this.logger.info(
                  `[Proxy] Response: status=${statusCode}, time=${responseTimeMs}ms, events=${lines.length}, usage=${JSON.stringify(usageSummary)}`,
                );
                // 当事件数量异常少或 usage 为空时，记录详细响应用于调试
                if (lines.length <= 2 || Object.keys(usageSummary).length === 0) {
                  this.logger.warn(
                    `[Proxy] Suspicious response detected, raw content: ${responseData.substring(0, 1000)}`,
                  );
                }
              } else {
                try {
                  const jsonResponse = JSON.parse(responseData);
                  // Extract key fields for summary
                  const summary = {
                    model: jsonResponse.model,
                    usage: jsonResponse.usage,
                    error: jsonResponse.error,
                  };
                  this.logger.info(
                    `[Proxy] Response: status=${statusCode}, time=${responseTimeMs}ms, summary=${JSON.stringify(summary)}`,
                  );
                } catch {
                  this.logger.info(
                    `[Proxy] Response: status=${statusCode}, time=${responseTimeMs}ms, body (truncated)=${responseData.substring(0, 500)}`,
                  );
                }
              }
            } else {
              this.logger.info(
                `[Proxy] Response: status=${statusCode}, time=${responseTimeMs}ms, empty body`,
              );
            }

            // 提取 token 使用量
            let tokenUsage: TokenUsage | null = null;
            const success = statusCode >= 200 && statusCode < 300;
            if (vendor && success) {
              try {
                tokenUsage = this.tokenExtractor.extractFromResponse(
                  vendor,
                  responseData,
                  contentType || '',
                );
              } catch (err) {
                this.logger.debug('Failed to extract token usage:', err);
              }
            }

            resolve({ statusCode, tokenUsage, responseTimeMs, success });
          });

          proxyRes.on('error', (err) => {
            this.logger.error('Upstream response error:', err);
            rawResponse.end();
            reject(err);
          });
        },
      );

      proxyReq.on('error', (err) => {
        this.logger.error('Upstream request error:', err);
        reject(err);
      });

      // 设置超时
      proxyReq.setTimeout(120000, () => {
        proxyReq.destroy(new Error('Upstream request timeout'));
      });

      if (body) {
        proxyReq.write(body);
      }
      proxyReq.end();
    });
  }

  /**
   * 转发请求到上游服务（缓冲响应）
   *
   * 用于非流式请求，返回完整响应
   */
  async forwardToUpstreamBuffered(
    req: UpstreamRequest,
  ): Promise<UpstreamResult> {
    return new Promise((resolve, reject) => {
      const { body } = req;
      const { options, useHttps } = this.buildUpstreamOptions(req);

      const httpModule = useHttps ? https : http;
      const proxyReq = httpModule.request(
        options,
        (proxyRes: IncomingMessage) => {
          const statusCode = proxyRes.statusCode ?? 500;
          const chunks: Buffer[] = [];

          const responseHeaders: Record<string, string | string[]> = {};
          for (const [key, value] of Object.entries(proxyRes.headers)) {
            if (value) {
              responseHeaders[key] = value;
            }
          }

          proxyRes.on('data', (chunk) => {
            chunks.push(chunk);
          });

          proxyRes.on('end', () => {
            resolve({
              statusCode,
              headers: responseHeaders,
              body: Buffer.concat(chunks),
            });
          });

          proxyRes.on('error', (err) => {
            reject(err);
          });
        },
      );

      proxyReq.on('error', (err) => {
        reject(err);
      });

      proxyReq.setTimeout(120000, () => {
        proxyReq.destroy(new Error('Upstream request timeout'));
      });

      if (body) {
        proxyReq.write(body);
      }
      proxyReq.end();
    });
  }
}
