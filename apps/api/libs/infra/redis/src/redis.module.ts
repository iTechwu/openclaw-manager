import { Module } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_AUTH } from '@app/redis/dto/redis.dto';
import { RedisService } from './redis.service';
import { ConfigModule } from '@nestjs/config';
import { CommonErrorCode } from '@repo/contracts/errors';
import { ApiException, apiError } from '@/filter/exception/api.exception';
import enviroment from '@/utils/enviroment.util';
import { createContextLogger } from '@/utils/logger-standalone.util';

const logger = createContextLogger('RedisModule');

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_AUTH,
      useFactory: async () => {
        const redisUrl = process.env.REDIS_URL;
        // console.log( "TECHWU" , redisUrl )
        if (!redisUrl) {
          throw apiError(CommonErrorCode.InvalidRedis);
        }
        try {
          const client = new Redis(redisUrl, {
            retryStrategy(times) {
              if (times > 10) {
                logger.error('Redis reconnect exhausted after 10 retries');
                return null;
              }
              return Math.min(times * 150, 3000);
            },
          });

          client.on('connect', () => {
            logger.info('Redis client connected');
          });

          client.on('error', (error) => {
            logger.error('Error connecting to Redis', { error: error.message });
          });

          return client;
        } catch (e) {
          logger.error('Redis error', {
            error: e instanceof Error ? e.message : String(e),
          });
          return null;
        }
      },
    },
    RedisService,
  ],
  exports: [REDIS_AUTH, RedisService],
  // 导出 Redis 客户端和服务
})
export class RedisModule {}
