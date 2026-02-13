import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import {
  ModelAvailabilityService,
  ModelCatalogService,
  ProviderKeyService,
} from '@app/db';
import { CapabilityTagMatchingService } from './capability-tag-matching.service';

/**
 * 同步定价结果
 */
export interface SyncPricingResult {
  synced: number;
  skipped: number;
  errors: Array<{ modelId: string; error: string }>;
}

/**
 * 同步标签结果
 */
export interface SyncTagsResult {
  processed: number;
  tagsAssigned: number;
  errors: Array<{ modelId: string; error: string }>;
}

/**
 * 同步状态
 */
export interface ModelSyncStatus {
  totalModels: number;
  pricingSynced: number;
  pricingNotSynced: number;
  tagsSynced: number;
  tagsNotSynced: number;
  lastSyncAt: Date | null;
}

/**
 * ModelSyncService
 *
 * 统一管理模型的定价和能力标签同步
 */
@Injectable()
export class ModelSyncService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly modelAvailabilityService: ModelAvailabilityService,
    private readonly modelCatalogService: ModelCatalogService,
    private readonly providerKeyService: ProviderKeyService,
    private readonly capabilityTagMatchingService: CapabilityTagMatchingService,
  ) {}

  /**
   * 同步所有模型的定价信息
   * 从 ModelPricing 表查找匹配的定价并关联到 ModelAvailability
   */
  async syncAllPricing(): Promise<SyncPricingResult> {
    const result: SyncPricingResult = {
      synced: 0,
      skipped: 0,
      errors: [],
    };

    // 获取所有 ModelAvailability
    const { list: availabilities } = await this.modelAvailabilityService.list(
      {},
      { limit: 10000 },
    );

    // 获取所有 ProviderKey 用于获取 vendor
    const { list: providerKeys } = await this.providerKeyService.list(
      {},
      { limit: 1000 },
    );
    const providerKeyMap = new Map(providerKeys.map((pk) => [pk.id, pk]));

    // 获取所有 ModelCatalog
    const pricingList = await this.modelCatalogService.listAll();
    const pricingMap = new Map(
      pricingList.map((p) => [`${p.vendor}:${p.model}`, p]),
    );

    for (const availability of availabilities) {
      try {
        const pk = providerKeyMap.get(availability.providerKeyId);
        if (!pk) {
          result.skipped++;
          continue;
        }

        // 查找匹配的 ModelCatalog
        const pricingKey = `${pk.vendor}:${availability.model}`;
        const catalog = pricingMap.get(pricingKey);

        if (catalog) {
          // 更新 ModelAvailability 关联 ModelCatalog
          await this.modelAvailabilityService.update(
            { id: availability.id },
            {
              modelCatalog: { connect: { id: catalog.id } },
            },
          );
          result.synced++;
        } else {
          result.skipped++;
        }
      } catch (error) {
        result.errors.push({
          modelId: availability.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.info('[ModelSync] Pricing sync completed', result);
    return result;
  }

  /**
   * 同步单个模型的定价信息
   */
  async syncModelPricing(modelAvailabilityId: string): Promise<boolean> {
    const availability = await this.modelAvailabilityService.get({
      id: modelAvailabilityId,
    });
    if (!availability) {
      throw new Error(`ModelAvailability not found: ${modelAvailabilityId}`);
    }

    const pk = await this.providerKeyService.get({
      id: availability.providerKeyId,
    });
    if (!pk) {
      throw new Error(`ProviderKey not found: ${availability.providerKeyId}`);
    }

    // 查找匹配的 ModelCatalog
    const catalog = await this.modelCatalogService.get({
      model: availability.model,
    });

    if (catalog && catalog.vendor === pk.vendor) {
      await this.modelAvailabilityService.update(
        { id: modelAvailabilityId },
        {
          modelCatalog: { connect: { id: catalog.id } },
        },
      );
      return true;
    }

    return false;
  }

  /**
   * 重新分配所有模型的能力标签
   */
  async reassignAllCapabilityTags(): Promise<SyncTagsResult> {
    const result: SyncTagsResult = {
      processed: 0,
      tagsAssigned: 0,
      errors: [],
    };

    // 获取所有 ModelCatalog（标签现在挂在 ModelCatalog 上）
    const { list: catalogs } = await this.modelCatalogService.list(
      { isDeleted: false },
      { limit: 10000 },
    );

    for (const catalog of catalogs) {
      try {
        // 分配能力标签
        await this.capabilityTagMatchingService.assignTagsToModelCatalog(
          catalog.id,
          catalog.model,
          catalog.vendor,
        );

        result.processed++;
        result.tagsAssigned++; // 简化计数
      } catch (error) {
        result.errors.push({
          modelId: catalog.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.info('[ModelSync] Tags sync completed', result);
    return result;
  }

  /**
   * 重新分配单个模型的能力标签
   */
  async reassignModelCapabilityTags(modelCatalogId: string): Promise<void> {
    const catalog = await this.modelCatalogService.get({
      id: modelCatalogId,
    });
    if (!catalog) {
      throw new Error(`ModelCatalog not found: ${modelCatalogId}`);
    }

    await this.capabilityTagMatchingService.assignTagsToModelCatalog(
      modelCatalogId,
      catalog.model,
      catalog.vendor,
    );
  }

  /**
   * 获取同步状态概览
   */
  async getSyncStatus(): Promise<ModelSyncStatus> {
    // 获取所有 ModelAvailability
    const { list: availabilities } = await this.modelAvailabilityService.list(
      {},
      { limit: 10000 },
    );

    const totalModels = availabilities.length;
    const pricingSynced = availabilities.filter(
      (a: any) => a.modelCatalogId,
    ).length;
    const tagsSynced = totalModels; // Tags are now on ModelCatalog level, always considered synced

    // 获取最后同步时间
    const lastSyncAt: Date | null = null;

    return {
      totalModels,
      pricingSynced,
      pricingNotSynced: totalModels - pricingSynced,
      tagsSynced,
      tagsNotSynced: totalModels - tagsSynced,
      lastSyncAt,
    };
  }
}
