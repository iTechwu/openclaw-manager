/**
 * 飞书客户端模块
 */
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { FeishuClientService } from './feishu-client.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
  ],
  providers: [FeishuClientService],
  exports: [FeishuClientService],
})
export class FeishuClientModule {}
