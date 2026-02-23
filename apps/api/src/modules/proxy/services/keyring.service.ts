import { Inject, Injectable } from '@nestjs/common';
import { ProviderKeyService } from '@app/db';
import { EncryptionService } from '../../bot-api/services/encryption.service';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

/**
 * 密钥选择结果
 */
export interface KeySelection {
  keyId: string;
  secret: string;
  /** 自定义 API 基础 URL（如果配置了） */
  baseUrl?: string | null;
  /** 提供商 vendor */
  vendor: string;
  /** Provider 特定的元数据 */
  metadata?: Record<string, unknown> | null;
}

/**
 * KeyringService - 密钥环服务
 *
 * 负责 API 密钥的选择和管理：
 * - 基于 tag 的路由选择
 * - Round-robin 负载均衡
 * - 密钥解密
 */
@Injectable()
export class KeyringService {
  private roundRobinIndex: Map<string, number> = new Map();

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly providerKeyService: ProviderKeyService,
    private readonly encryptionService: EncryptionService,
  ) {}

  /**
   * 从密钥列表中使用 round-robin 选择一个密钥
   * secretEncrypted 可能为 Prisma Bytes 返回的 Buffer 或 Uint8Array
   */
  private selectFromKeys(
    keys: Array<{
      id: string;
      secretEncrypted: Buffer | Uint8Array;
      baseUrl?: string | null;
      vendor: string;
      metadata?: unknown;
    }>,
    cacheKey: string,
  ): KeySelection | null {
    if (keys.length === 0) {
      return null;
    }

    const currentIndex = this.roundRobinIndex.get(cacheKey) ?? 0;
    const key = keys[currentIndex % keys.length];
    this.roundRobinIndex.set(cacheKey, currentIndex + 1);

    try {
      const raw = Buffer.isBuffer(key.secretEncrypted)
        ? key.secretEncrypted
        : Buffer.from(key.secretEncrypted);
      const secret = this.encryptionService.decrypt(raw);
      return {
        keyId: key.id,
        secret,
        baseUrl: key.baseUrl,
        vendor: key.vendor,
        metadata: (key.metadata as Record<string, unknown>) ?? null,
      };
    } catch (error) {
      this.logger.error(`Failed to decrypt key ${key.id}:`, error);
      return null;
    }
  }

  /**
   * 为指定 vendor 选择一个密钥（无 tag 过滤）
   */
  async selectKey(vendor: string): Promise<KeySelection | null> {
    const { list: keys } = await this.providerKeyService.list(
      { vendor, isDeleted: false },
      { limit: 100 },
    );

    return this.selectFromKeys(keys, vendor);
  }

  /**
   * 为 Bot 选择密钥，基于 tag 路由
   *
   * 选择逻辑：
   * 1. 如果 Bot 有 tags，按顺序尝试匹配带相同 tag 的密钥
   * 2. 如果没有匹配，回退到默认（无 tag）密钥
   * 3. 在匹配的密钥集合中使用 round-robin
   */
  async selectKeyForBot(
    vendor: string,
    botTags: string[] | null,
  ): Promise<KeySelection | null> {
    // 尝试按 Bot tag 顺序匹配
    if (botTags && botTags.length > 0) {
      for (const tag of botTags) {
        const { list: taggedKeys } = await this.providerKeyService.list(
          { vendor, tag, isDeleted: false },
          { limit: 100 },
        );

        if (taggedKeys.length > 0) {
          return this.selectFromKeys(taggedKeys, `${vendor}:${tag}`);
        }
      }
    }

    // 回退到默认（无 tag）密钥
    const { list: defaultKeys } = await this.providerKeyService.list(
      { vendor, tag: null, isDeleted: false },
      { limit: 100 },
    );

    if (defaultKeys.length > 0) {
      return this.selectFromKeys(defaultKeys, `${vendor}:default`);
    }

    // 最后尝试：该 vendor 的任意密钥
    const { list: allKeys } = await this.providerKeyService.list(
      { vendor, isDeleted: false },
      { limit: 100 },
    );

    if (allKeys.length > 0) {
      return this.selectFromKeys(allKeys, vendor);
    }

    return null;
  }

  /**
   * 获取指定 vendor 的可用密钥数量
   */
  async getKeyCount(vendor: string): Promise<number> {
    const { total } = await this.providerKeyService.list(
      { vendor, isDeleted: false },
      { limit: 1 },
    );
    return total;
  }

  /**
   * 获取所有可用的 vendor 列表
   */
  async getAvailableVendors(): Promise<string[]> {
    const { list: keys } = await this.providerKeyService.list(
      { isDeleted: false },
      { limit: 1000 },
    );

    const vendors = new Set(keys.map((k) => k.vendor));
    return Array.from(vendors);
  }
}
