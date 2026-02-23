/**
 * OpenClaw 客户端模块
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { DockerExecService } from './docker-exec.service';
import { OpenClawClient } from './openclaw.client';
import { OpenClawSkillSyncClient } from './openclaw-skill-sync.client';
import { SkillTranslationService } from './skill-translation.service';
import { OpenAIClientModule } from '@app/clients/internal/openai';

@Module({
  imports: [
    ConfigModule,
    HttpModule.register({
      timeout: 120000,
      maxRedirects: 5,
    }),
    OpenAIClientModule,
  ],
  providers: [
    DockerExecService,
    OpenClawClient,
    OpenClawSkillSyncClient,
    SkillTranslationService,
  ],
  exports: [
    DockerExecService,
    OpenClawClient,
    OpenClawSkillSyncClient,
    SkillTranslationService,
  ],
})
export class OpenClawModule {}
