/**
 * OpenClaw Skill Sync Module
 */
import { Module } from '@nestjs/common';
import { SkillSyncController } from './skill-sync.controller';
import { SkillSyncService } from './skill-sync.service';
import { OpenClawModule } from '@app/clients/internal/openclaw';
import { SkillModule, SkillTypeModule } from '@app/db';

@Module({
  imports: [OpenClawModule, SkillModule, SkillTypeModule],
  controllers: [SkillSyncController],
  providers: [SkillSyncService],
  exports: [SkillSyncService],
})
export class SkillSyncModule {}
