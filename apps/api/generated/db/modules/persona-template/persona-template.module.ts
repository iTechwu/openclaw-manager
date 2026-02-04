import { Module } from '@nestjs/common';
import { PersonaTemplateService } from './persona-template.service';
import { PrismaModule } from '@app/prisma';
import { RedisModule } from '@app/redis';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, RedisModule, ConfigModule],
  providers: [PersonaTemplateService],
  exports: [PersonaTemplateService],
})
export class PersonaTemplateModule {}
