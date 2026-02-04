import {
  Module,
  NestModule,
  MiddlewareConsumer,
  RequestMethod,
  OnModuleInit,
} from '@nestjs/common';

/** config */
import { ConfigModule, ConfigService } from '@nestjs/config';
import { getConfig } from '@/config/configuration';

/** app filter */
import { APP_FILTER, ModuleRef } from '@nestjs/core';
import { HttpExceptionFilter } from '@/common/filter/exception/http.exception';
/** winston */
import { WinstonModule } from 'nest-winston';
import * as loggerUtil from '@/utils/logger.util';

/** uploader module */
import { UploaderModule } from './modules/uploader/uploader.module';

/** bot-api module */
import { BotApiModule } from './modules/bot-api/bot-api.module';

/** proxy module */
import { ProxyModule } from './modules/proxy/proxy.module';

/** sign-api module */
import { SignModule } from './modules/sign-api/sign-api.module';

/** persona-template-api module */
import { PersonaTemplateApiModule } from './modules/persona-template-api/persona-template-api.module';

/** user-api module */
import { UserApiModule } from './modules/user-api/user-api.module';

/** message-api module */
import { MessageApiModule } from './modules/message-api/message-api.module';

/** operate-log-api module */
import { OperateLogApiModule } from './modules/operate-log-api/operate-log-api.module';

/** channel-api module */
import { ChannelApiModule } from './modules/channel-api/channel-api.module';

/** i18n */
import {
  AcceptLanguageResolver,
  QueryResolver,
  HeaderResolver,
  I18nModule,
} from 'nestjs-i18n';
import * as path from 'path';
import type { AppConfig, ZoneConfig } from '@/config/validation';

/** request middleware */
import RequestMiddleware from '@/common/middleware/request.middleware';
import { IpInfoServiceModule } from '@app/services/ip-info';
import { ScheduleModule } from '@nestjs/schedule';
import { RedisModule } from '@app/redis';
import { CacheDecoratorModule } from '@/common/decorators/cache/cache.module';
import { EventDecoratorModule } from '@/common/decorators/event/event.module';
import { VersionDecoratorModule } from '@/common/decorators/version/version.module';
import { FeatureFlagModule } from '@/common/decorators/feature-flag/feature-flag.module';
import { AppVersionModule } from '@/common/decorators/app-version/app-version.module';
import { JwtModule } from '@app/jwt/jwt.module';
import enviromentUtil from '@/utils/enviroment.util';
import { BullModule } from '@nestjs/bullmq';
import Redis from 'ioredis';
import { VerifyModule } from '@app/clients/internal/verify';
import { SystemHealthModule } from '@app/shared-services/system-health';
import { setTransactionMetricsService } from '@/decorators/transaction/transactional.decorator';
import { DbMetricsService } from '@app/prisma/db-metrics/src/db-metrics.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [getConfig],
    }),
    WinstonModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const output =
          configService.get<loggerUtil.LogOutputMode>('app.nestLogOutput') ||
          'file';
        return loggerUtil.getWinstonConfig(output);
      },
      inject: [ConfigService],
    }),
    I18nModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const appConfig = configService.getOrThrow<AppConfig>('app');
        const zoneConfigs = appConfig.zones;

        let zone: ZoneConfig;
        zoneConfigs.forEach((config: ZoneConfig) => {
          const defaultZone = process.env?.BASE_ZONE || 'cn';
          if (config.zone === defaultZone) {
            zone = config;
          }
        });
        if (!zone) {
          throw new Error('Zone not found');
        }
        let projectRoot = process.env.PROJECT_ROOT;
        if (projectRoot && projectRoot.includes('$(pwd)')) {
          projectRoot = projectRoot.replace('$(pwd)', process.cwd());
        }
        if (!projectRoot) {
          projectRoot = process.cwd();
        }
        return {
          fallbackLanguage: zone.locale,
          loaderOptions: {
            path: path.join(projectRoot, 'libs', 'infra', 'i18n'),
            watch: true,
          },
        };
      },
      resolvers: [
        { use: QueryResolver, options: ['lang'] },
        AcceptLanguageResolver,
        { use: HeaderResolver, options: ['x-lang'] },
      ],
      inject: [ConfigService],
    }),
    BullModule.forRootAsync({
      useFactory: async () => {
        const redisUrl = process.env.REDIS_URL;
        if (!redisUrl) {
          console.warn('⚠️  REDIS_URL 未设置，BullMQ 队列功能将不可用');
          throw new Error('REDIS_URL environment variable is not set');
        }

        try {
          const checkClient = new Redis(redisUrl, {
            maxRetriesPerRequest: 1,
            connectTimeout: 5000,
            lazyConnect: true,
          });

          await checkClient.connect();
          const info = await checkClient.info('server');
          await checkClient.quit();

          const versionMatch = info.match(/redis_version:([\d.]+)/);
          if (versionMatch) {
            const version = versionMatch[1];
            const [major] = version.split('.').map(Number);
            if (major < 5) {
              const errorMsg =
                `❌ Redis 版本错误: 当前版本 ${version}，BullMQ 需要 >= 5.0.0\n` +
                `请升级 Redis 服务器。参考文档: docs/redis-version-error.md\n` +
                `升级命令 (macOS): brew upgrade redis\n` +
                `升级命令 (Linux): sudo apt update && sudo apt install redis-server`;
              console.error(errorMsg);
              throw new Error(
                `Redis version ${version} is too old. BullMQ requires Redis >= 5.0.0. Please upgrade Redis server.`,
              );
            } else {
              if (enviromentUtil.isProduction()) {
                console.log(`✓ Redis 版本检查通过: ${version}`);
              }
            }
          }
        } catch (error) {
          if (error.message && error.message.includes('version')) {
            throw error;
          }
          console.warn(
            '⚠️  无法预先检查 Redis 版本，BullMQ 将尝试连接:',
            error.message,
          );
        }

        return {
          connection: {
            url: redisUrl,
          },
        };
      },
    }),
    IpInfoServiceModule,
    ScheduleModule.forRoot(),
    RedisModule,
    CacheDecoratorModule,
    EventDecoratorModule,
    VersionDecoratorModule,
    FeatureFlagModule,
    AppVersionModule,
    VerifyModule,
    SystemHealthModule,
    JwtModule,
    UploaderModule,
    BotApiModule,
    ProxyModule,
    SignModule,
    PersonaTemplateApiModule,
    UserApiModule,
    MessageApiModule,
    OperateLogApiModule,
    ChannelApiModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule, OnModuleInit {
  constructor(private readonly moduleRef: ModuleRef) {}

  onModuleInit() {
    setTransactionMetricsService(() => {
      try {
        return this.moduleRef.get(DbMetricsService, { strict: false });
      } catch {
        return undefined;
      }
    });
  }

  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
