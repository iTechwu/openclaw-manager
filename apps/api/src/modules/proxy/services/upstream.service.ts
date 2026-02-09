import { Inject, Injectable } from '@nestjs/common';
import * as https from 'https';
import * as http from 'http';
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
    return new Promise((resolve, reject) => {
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
      const upstreamPath = targetBasePath + path;

      // 克隆并修改请求头
      const upstreamHeaders: Record<string, string> = { ...headers };

      // 移除 hop-by-hop 头
      delete upstreamHeaders['host'];
      delete upstreamHeaders['connection'];
      delete upstreamHeaders['authorization'];
      delete upstreamHeaders['content-length'];

      // 设置正确的 host
      upstreamHeaders['host'] = targetHost;

      // 设置认证头（使用真实 API key）
      upstreamHeaders[vendorConfig.authHeader.toLowerCase()] =
        vendorConfig.authFormat(apiKey);

      // 如果有 body，设置 content-length
      if (body) {
        upstreamHeaders['content-length'] = String(body.length);
      }

      const options = {
        hostname: targetHost,
        port: targetPort,
        path: upstreamPath,
        method,
        headers: upstreamHeaders,
      };

      this.logger.debug(
        `Forwarding to upstream: ${method} ${useHttps ? 'https' : 'http'}://${targetHost}:${targetPort}${upstreamPath}`,
      );

      // 收集响应数据用于 token 提取
      const responseChunks: Buffer[] = [];

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
            // 收集 chunk 用于 token 提取
            responseChunks.push(chunk);
            // 强制刷新 SSE - 确保事件立即发送
            if (typeof (rawResponse as any).flush === 'function') {
              (rawResponse as any).flush();
            }
          });

          proxyRes.on('end', () => {
            rawResponse.end();

            // Log response data for debugging (concise summary)
            const responseData = Buffer.concat(responseChunks).toString('utf-8');
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
                            input_tokens: parsed.usage.input_tokens || parsed.usage.prompt_tokens,
                            output_tokens: parsed.usage.output_tokens || parsed.usage.completion_tokens,
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
                  `[Proxy] Response: status=${statusCode}, events=${lines.length}, usage=${JSON.stringify(usageSummary)}`,
                );
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
                    `[Proxy] Response: status=${statusCode}, summary=${JSON.stringify(summary)}`,
                  );
                } catch {
                  this.logger.info(
                    `[Proxy] Response: status=${statusCode}, body (truncated)=${responseData.substring(0, 500)}`,
                  );
                }
              }
            } else {
              this.logger.info(`[Proxy] Response: status=${statusCode}, empty body`);
            }

            // 提取 token 使用量
            let tokenUsage: TokenUsage | null = null;
            if (vendor && statusCode >= 200 && statusCode < 300) {
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

            resolve({ statusCode, tokenUsage });
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

      const upstreamPath = targetBasePath + path;

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

      const options = {
        hostname: targetHost,
        port: targetPort,
        path: upstreamPath,
        method,
        headers: upstreamHeaders,
      };

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
