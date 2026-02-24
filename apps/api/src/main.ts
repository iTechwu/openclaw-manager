require('dotenv').config();
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  ValidationPipe,
  INestApplication,
  VersioningType,
} from '@nestjs/common';
import { initConfig, getConfig, initKeysConfig } from '@/config/configuration';

import * as rateLimit from '@fastify/rate-limit';
import * as fastifyHelmet from '@fastify/helmet';
import * as compress from '@fastify/compress';
import fastifyCookie from '@fastify/cookie';
import fastifySSE from 'fastify-sse-v2';
import fastifyMultipart from '@fastify/multipart';

import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { TransformInterceptor } from '@/interceptor/transform/transform.interceptor';
import { VersionGuard } from '@/common/guards/version.guard';
import { VersionHeaderInterceptor } from '@/interceptor/version/version-header.interceptor';

import loadEnvUtil from '@/utils/load-env.util';
import { RedisService } from '@app/redis';

import ipUtil from '@/utils/ip.util';
import enviromentUtil from '@/utils/enviroment.util';

// 添加全局错误处理 - 未处理的 Promise 拒绝
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // 可选择性地退出应用程序
  // process.exit(1)
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// interface CustomRateLimitOptions extends rateLimit.FastifyRateLimitOptions {
//     skip?: (req: any) => boolean;
// }

async function bootstrap() {
  // 加载环境变量
  // 先加载 monorepo 根目录的 .env（包含共享的 ClawBotManager 配置）
  // 然后加载 apps/api 的 .env（可以覆盖或引用根目录的变量）
  loadEnvUtil.loadEnv([
    '../../.env', // monorepo 根目录的共享配置
    '.env', // apps/api 的配置
    `.env.${enviromentUtil.getEnv()}`,
  ]);
  // 初始化配置
  await initConfig();
  initKeysConfig();
  const config = getConfig();

  const adapter = new FastifyAdapter();
  // 安全防护
  adapter.register(fastifyHelmet as any);
  // , {
  //     contentSecurityPolicy: false,
  //     crossOriginResourcePolicy: false,
  // })
  // 压缩请求
  adapter.register(compress as any, {
    global: true,
    encodings: ['gzip', 'deflate'],
  });
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
    {
      rawBody: true,
      logger: ['error', 'warn', 'verbose', 'debug'],
    },
  );
  await app.register(fastifySSE as any);
  // 注册 multipart 插件用于文件上传
  await app.register(fastifyMultipart as any, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB 最大文件大小
    },
  });

  const redisService = app.get(RedisService);

  // 入口限流: 多维度限流保护
  // 优先级: userId > apiKey > tenantId > IP
  app.register(rateLimit as any, {
    max: 200,
    timeWindow: '1 minute',
    keyGenerator: (req) => {
      // 多维度 Key 生成: 优先使用用户身份，降级到 IP
      const userId = req.user?.id || req.userId;
      const apiKey = req.headers['x-api-key'];
      const tenantId = req.teamId || req.tenantId;
      const ip = ipUtil.extractIp(req);

      if (userId) return `user:${userId}`;
      if (apiKey) return `apiKey:${apiKey}`;
      if (tenantId) return `tenant:${tenantId}`;
      return `ip:${ip}`;
    },
    redis: redisService.redis,
    allowList: (req) => {
      // 白名单路由不受限流
      const excludedRoutes = [
        '/health',
        '/metrics',
        '/docs',
        '/api/apis',
        '/uploader/token/multipart',
        '/uploader/token/private',
        '/uploader/token/private/thumb',
      ];
      // 检查精确匹配或前缀匹配
      const isExcluded = excludedRoutes.some((route) =>
        req.url.startsWith(route),
      );

      // 特殊处理：匹配流式语音识别的音频上传路由
      // 格式：/api/streaming-asr/sessions/{sessionId}/audio
      if (!isExcluded) {
        const streamingAsrAudioPattern =
          /^\/api\/streaming-asr\/sessions\/[^/]+\/audio/;
        if (streamingAsrAudioPattern.test(req.url)) {
          return true;
        }
        const streamingAsrHeartbeatPattern =
          /^\/api\/streaming-asr\/sessions\/[^/]+\/heartbeat/;
        if (streamingAsrHeartbeatPattern.test(req.url)) {
          return true;
        }
      }

      return isExcluded;
    },
    errorResponseBuilder: (req, context) => ({
      code: 925429,
      msg: '请求过于频繁，请稍后再试',
      error: {
        limit: context.max,
        remaining: 0,
        resetTime: Math.ceil(Date.now() / 1000 + context.ttl / 1000),
        retryAfter: Math.ceil(context.ttl / 1000),
      },
      traceId: req.traceId || '',
    }),
  });
  // 不需要对cookie进行校验
  await app.register(fastifyCookie as any);

  // 如果需要校验则
  // await app.register(fastifyCookie, {
  //     secret: 'my-secret', // 用于cookie签名的密钥
  // })
  const corsDomains = enviromentUtil.generateEnvironmentUrls().corsDomains;
  // 跨域配置
  const corsOptions = {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
      } else {
        const domainPattern = enviromentUtil.isDev()
          ? `^https?://(.*\\.)?${corsDomains.join('|').replace(/\*/g, '.*')}(:[0-9]+)?$`
          : `^https?://(.*\\.)?${corsDomains.join('|').replace(/\*/g, '.*')}$`;
        const regex = new RegExp(domainPattern);
        // 检查是否为局域网地址
        const isLanOrigin =
          /^https?:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(
            origin,
          );
        if (
          regex.test(origin) ||
          origin.includes('localhost') ||
          origin.includes('127.0.0.1') ||
          isLanOrigin
        ) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'), false);
        }
      }
    },
    // origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    optionsSuccessStatus: 204,
  };
  app.enableCors(corsOptions);

  // 设置全局前缀（排除监控端点）
  app.setGlobalPrefix('api', {
    exclude: ['/metrics', '/health', '/health/ready'],
  });

  // 启用 API 版本控制 (Header 模式，保持 api/... 结构不变)
  // 规则：
  // 1. 只允许 Header 版本控制，禁止 URI 版本
  // 2. 禁止 fallback 到默认版本
  // 3. 版本中立的路由（VERSION_NEUTRAL）接受任何版本或无版本
  // 4. 非版本中立的路由必须提供正确的版本 header
  app.enableVersioning({
    type: VersioningType.HEADER,
    header: 'x-api-version',
    // 注意：不设置 defaultVersion，强制要求版本化的路由必须提供版本 header
    // VERSION_NEUTRAL 的路由会接受任何请求
  });

  // 配置Socket.IO适配器
  const ioAdapter = new IoAdapter(app);
  app.useWebSocketAdapter(ioAdapter);

  // 启动swagger
  await setupSwagger(app);
  // 使用全局验证管道
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true, // 自动将输入数据转换为 DTO 类型
      transformOptions: {
        enableImplicitConversion: true, // 隐式转换（如 string -> number）
      },
    }),
  );

  // 版本控制: Guard 校验前端版本，Interceptor 添加响应头
  const reflector = app.get(Reflector);
  app.useGlobalGuards(new VersionGuard(reflector));
  app.useGlobalInterceptors(
    new VersionHeaderInterceptor(),
    new TransformInterceptor(),
  );

  // 添加优雅关闭的处理
  const server = await app.listen(config.app.port, '0.0.0.0').then((server) => {
    console.log(`http://127.0.0.1:${config.app.port}`);
    console.log(`接口文档: http://127.0.0.1:${config.app.port}/docs`);
    console.log(
      `接口文档 rapidoc: http://127.0.0.1:${config.app.port}/api/apis`,
    );
    return server;
  });

  // 处理进程退出信号
  const signals = ['SIGTERM', 'SIGINT', 'SIGHUP'];
  signals.forEach((signal) => {
    process.on(signal, async () => {
      if (enviromentUtil.isProduction()) {
        console.log(`❌ Received ${signal}. Gracefully shutting down...`);
      }
      try {
        await app.close();
        if (enviromentUtil.isProduction()) {
          console.log('✅ Server closed successfully');
        }
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    });
  });

  return server;
}

async function setupSwagger(app: INestApplication) {
  if (enviromentUtil.isProduction() && process.env.SWAGGER_ENABLE !== 'true') {
    return false;
  }
  const options = new DocumentBuilder()
    .setTitle('Pardx API')
    .setDescription('Pardx api 接口文档')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        in: 'header',
        name: 'Authorization',
        description:
          'Please enter JWT token in the format *** Bearer {token} ***',
      },
      'jwtAuth',
    )
    .addServer('http://127.0.0.1:3100')
    // .addServer('https://mp.pardx.cn')
    // .https://mp.pardx.cn/
    .build();

  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('docs', app, document);
}

bootstrap().catch((error) => {
  console.error('Error starting application:', error);
  process.exit(1);
});
