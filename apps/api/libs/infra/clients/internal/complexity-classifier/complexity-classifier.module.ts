import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { ComplexityClassifierService } from './complexity-classifier.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    ConfigModule,
  ],
  providers: [ComplexityClassifierService],
  exports: [ComplexityClassifierService],
})
export class ComplexityClassifierModule {}
