import { Module } from '@nestjs/common';
import { PrismaModule } from '@app/prisma';
import { CountryCodeService } from './country-code.service';
import { RedisModule } from '@app/redis';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, RedisModule, ConfigModule],
  providers: [CountryCodeService],
  exports: [CountryCodeService],
})
export class CountryCodeModule {}
