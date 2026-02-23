import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { AgentXClient } from './agentx-client.service';
import { AgentXFileClient } from './agentx-file-client.service';

/**
 * AgentX Client Module
 *
 * 提供与 Python AgentX API 交互的客户端服务
 * - AgentXClient: 任务管理
 * - AgentXFileClient: 文件上传
 */
@Module({
  imports: [
    HttpModule.register({
      timeout: 30000, // 默认 30 秒超时
      maxRedirects: 5,
    }),
    ConfigModule,
  ],
  providers: [AgentXClient, AgentXFileClient],
  exports: [AgentXClient, AgentXFileClient],
})
export class AgentXClientModule {}
