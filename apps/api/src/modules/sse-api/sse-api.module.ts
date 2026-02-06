import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '@app/auth';
import { UserInfoModule } from '@app/db';
import { JwtModule } from '@app/jwt/jwt.module';
import { RedisModule } from '@app/redis';
import { SseApiController } from './sse-api.controller';
import { BotApiModule } from '../bot-api/bot-api.module';

/**
 * SSE API 模块
 *
 * 集中管理所有 Server-Sent Events 端点
 * 统一使用 @SseAuth() 装饰器进行认证
 *
 * 注意：SSE 端点因为 EventSource 不支持自定义 headers，
 * 所以需要从 query 参数获取 access_token，而不是从 Authorization header
 *
 * 需导入 AuthModule 及其依赖（与 AuthModule 一致）：AuthGuard 在声明控制器的模块内实例化，
 * 其依赖（AuthService、JwtService、ConfigService、RedisService、UserInfoService 等）须在本模块可用。
 */
@Module({
  imports: [
    ConfigModule,
    AuthModule,
    JwtModule,
    RedisModule,
    UserInfoModule,
    BotApiModule,
  ],
  controllers: [SseApiController],
})
export class SseApiModule {}
