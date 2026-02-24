import { Module } from '@nestjs/common';
import * as Rabbitmq from 'amqplib';
import { RABBITMQ_CONNECTION, RabbitmqConnection } from './dto/rabbitmq.dto';
import { RabbitmqService } from './rabbitmq.service';
import { PrismaModule } from '@app/prisma';
import { RedisModule } from '@app/redis';
import { ConfigModule } from '@nestjs/config';
import { createContextLogger } from '@/utils/logger-standalone.util';

const logger = createContextLogger('RabbitmqModule');

@Module({
  imports: [PrismaModule, RedisModule, ConfigModule],
  providers: [
    {
      provide: RABBITMQ_CONNECTION,
      useFactory: async (): Promise<RabbitmqConnection> => {
        const maxRetries = 5;
        const retryDelay = 3000; // 3 seconds
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            logger.info(
              `Attempting to connect to RabbitMQ (attempt ${attempt}/${maxRetries})`,
            );

            const connection = await Rabbitmq.connect(
              process.env.RABBITMQ_URL,
              {
                heartbeat: 60,
                reconnect: true,
                reconnectBackoffStrategy: 'linear',
                reconnectBackoffTime: 1000,
              },
            );
            logger.info('RabbitMQ connection established successfully');

            // 设置连接错误监听
            connection.on('error', (error) => {
              logger.error('RabbitMQ connection error', {
                error: error.message,
              });
            });

            connection.on('close', () => {
              logger.warn('RabbitMQ connection closed');
            });

            return {
              connection,
              close: async () => {
                try {
                  await connection.close();
                  logger.info('RabbitMQ connection closed gracefully');
                } catch (error) {
                  // 忽略已关闭的连接错误
                  if (
                    !(error instanceof Error) ||
                    (!error.message.includes('closed') &&
                      !error.message.includes('Connection closed') &&
                      !error.message.includes('IllegalOperationError'))
                  ) {
                    logger.error('Error closing RabbitMQ connection', {
                      error:
                        error instanceof Error ? error.message : String(error),
                    });
                  }
                }
              },
            };
          } catch (error) {
            lastError = error as Error;
            logger.error(
              `RabbitMQ connection attempt ${attempt}/${maxRetries} failed`,
              {
                error: lastError.message,
              },
            );

            if (attempt < maxRetries) {
              logger.info(`Retrying in ${retryDelay}ms...`);
              await new Promise((resolve) => setTimeout(resolve, retryDelay));
            }
          }
        }

        logger.error(
          'Failed to establish RabbitMQ connection after all retries',
        );
        throw new Error(
          `Failed to connect to RabbitMQ after ${maxRetries} attempts. Last error: ${lastError?.message}`,
        );
      },
    },
    RabbitmqService,
  ],

  exports: [RABBITMQ_CONNECTION, RabbitmqService],
})
export class RabbitmqModule {}
