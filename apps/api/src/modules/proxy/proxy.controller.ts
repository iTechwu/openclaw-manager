import { Controller, All, Req, Res, Param } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { ProxyService } from './services/proxy.service';
import { ProtocolRouterService } from './services/protocol-router.service';
import { TsRestController } from '@/decorators/ts-rest-controller.decorator';

/**
 * ProxyController - API 代理控制器
 *
 * 处理 /v1/:vendor/* 路由，将请求转发到对应的 AI 提供商
 *
 * 支持的协议端点：
 * - /v1/:vendor/* - OpenAI 兼容协议（第一层：生产 + 路由层）
 * - /v1/anthropic/* - Anthropic 协议（第二层：研究 Agent 专用）
 */
@TsRestController({ path: 'v1' })
export class ProxyController {
  constructor(
    private readonly proxyService: ProxyService,
    private readonly protocolRouterService: ProtocolRouterService,
  ) {}

  /**
   * 代理请求到 AI 提供商
   *
   * 路由: ALL /v1/:vendor/*
   * 认证: Bearer token (Bot proxy token)
   */
  @All(':vendor/*')
  async proxyRequest(
    @Param('vendor') vendor: string,
    @Param('*') path: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    // 提取 Authorization header
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      reply.status(401).send({ error: 'Missing authorization' });
      return;
    }

    const botToken = auth.slice(7);

    // 构建请求头
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') {
        headers[key] = value;
      } else if (Array.isArray(value)) {
        headers[key] = value[0];
      }
    }

    // 获取请求体
    let body: Buffer | null = null;
    if (req.body) {
      if (Buffer.isBuffer(req.body)) {
        body = req.body;
      } else if (typeof req.body === 'string') {
        body = Buffer.from(req.body, 'utf8');
      } else {
        body = Buffer.from(JSON.stringify(req.body), 'utf8');
      }
    }

    // 获取原始响应对象用于流式传输
    const rawResponse = reply.raw;
    // 处理代理请求
    const result = await this.proxyService.handleProxyRequest(
      {
        vendor,
        path: '/' + path,
        method: req.method,
        headers,
        body,
        botToken,
      },
      rawResponse,
    );

    // 如果有错误，发送错误响应
    if (!result.success && result.error) {
      // 检查响应是否已发送（流式响应可能已经开始）
      if (!rawResponse.headersSent) {
        const statusCode = this.getErrorStatusCode(result.error);
        reply.status(statusCode).send({ error: result.error });
      }
    }
  }

  /**
   * 根据错误消息确定 HTTP 状态码
   */
  private getErrorStatusCode(error: string): number {
    if (error.includes('Unknown vendor')) {
      return 400;
    }
    if (error.includes('Invalid bot token')) {
      return 403;
    }
    if (error.includes('No API keys available')) {
      return 503;
    }
    if (error.includes('Upstream error')) {
      return 502;
    }
    return 500;
  }

  /**
   * Anthropic 协议端点
   *
   * 用于第二层（研究 Agent）模型的请求
   * 支持 Extended Thinking 和 Cache Control
   *
   * 路由: ALL /v1/anthropic/*
   * 认证: Bearer token (Bot proxy token)
   */
  @All('anthropic/*')
  async anthropicRequest(
    @Param('*') path: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    // 提取 Authorization header
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      reply.status(401).send({ error: 'Missing authorization' });
      return;
    }

    const botToken = auth.slice(7);

    // 构建请求头
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') {
        headers[key] = value;
      } else if (Array.isArray(value)) {
        headers[key] = value[0];
      }
    }

    // 获取请求体
    let body: Buffer | null = null;
    if (req.body) {
      if (Buffer.isBuffer(req.body)) {
        body = req.body;
      } else if (typeof req.body === 'string') {
        body = Buffer.from(req.body, 'utf8');
      } else {
        body = Buffer.from(JSON.stringify(req.body), 'utf8');
      }
    }

    // 获取原始响应对象用于流式传输
    const rawResponse = reply.raw;

    // 处理 Anthropic 协议请求
    const result = await this.protocolRouterService.handleAnthropicRequest(
      {
        protocol: 'anthropic',
        path: '/' + path,
        method: req.method,
        headers,
        body,
        botToken,
        vendor: 'anthropic',
      },
      rawResponse,
    );

    // 如果有错误，发送错误响应
    if (!result.success && result.error) {
      if (!rawResponse.headersSent) {
        const statusCode = this.getErrorStatusCode(result.error);
        reply.status(statusCode).send({ error: result.error });
      }
    }
  }
}
