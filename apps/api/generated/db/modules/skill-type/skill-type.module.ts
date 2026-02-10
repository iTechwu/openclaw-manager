import { Module } from '@nestjs/common';
import { SkillTypeService } from './skill-type.service';
import { PrismaModule } from '@app/prisma';
import { RedisModule } from '@app/redis';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, RedisModule, ConfigModule],
  providers: [SkillTypeService],
  exports: [SkillTypeService],
})
export class SkillTypeModule {}
