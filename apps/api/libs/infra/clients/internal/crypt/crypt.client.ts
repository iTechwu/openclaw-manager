import { Injectable, Inject } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { ConfigService } from '@nestjs/config';
import * as cryptoUtil from '@/utils/crypto.util';
import urlencodeUtil from '@/utils/urlencode.util';
import { CryptoConfig } from '@/config/validation';

@Injectable()
export class CryptClient {
  private config: CryptoConfig;
  constructor(
    private readonly configService: ConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {
    this.config = configService.getOrThrow<CryptoConfig>('crypto');
  }

  encrypt(text: string, iv?: string, key?: string): string {
    key = key || this.config.key;
    iv = iv || this.config.iv;
    const cry = cryptoUtil.aesCbcEncrypt(text, key, iv);
    return urlencodeUtil.base64ToUrlSafe(cry);
  }

  decrypt(text: string, iv?: string, key?: string): string {
    const originalText = text;
    text = urlencodeUtil.urlSafeToBase64(text);
    key = key || this.config.key;
    iv = iv || this.config.iv;

    this.logger.debug('CryptClient.decrypt', {
      originalTextLength: originalText?.length,
      originalTextPreview: originalText?.substring(0, 30),
      convertedTextLength: text?.length,
      keyLength: key?.length,
      ivLength: iv?.length,
    });

    return cryptoUtil.aesCbcDecrypt(text, key, iv);
  }

  getSignUrl(url: string): string {
    return cryptoUtil.signUrl(url, this.config.key);
  }
}
