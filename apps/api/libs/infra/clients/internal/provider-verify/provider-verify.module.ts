import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ProviderVerifyClient } from './provider-verify.client';

@Module({
  imports: [
    HttpModule.register({
      timeout: 15000,
      maxRedirects: 5,
    }),
  ],
  providers: [ProviderVerifyClient],
  exports: [ProviderVerifyClient],
})
export class ProviderVerifyModule {}
