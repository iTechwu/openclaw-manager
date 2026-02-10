/**
 * OpenClaw 客户端模块
 */
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { OpenClawClient } from './openclaw.client';
import { OpenClawSkillSyncClient } from './openclaw-skill-sync.client';
import { SkillTranslationService } from './skill-translation.service';
import { OpenAIClientModule } from '@app/clients/internal/openai';

@Module({
  imports: [
    HttpModule.register({
      timeout: 120000,
      maxRedirects: 5,
    }),
    OpenAIClientModule,
  ],
  providers: [OpenClawClient, OpenClawSkillSyncClient, SkillTranslationService],
  exports: [OpenClawClient, OpenClawSkillSyncClient, SkillTranslationService],
})
export class OpenClawModule {}
