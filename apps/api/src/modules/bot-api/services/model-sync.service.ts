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
  autoCreated: number;
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
  catalogSynced: number;
  catalogNotSynced: number;
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
   * 按 model name 匹配 ModelCatalog（统一定价，不区分 vendor）
   * 对于没有 ModelCatalog 的模型，自动创建基础记录
   */
  async syncAllPricing(): Promise<SyncPricingResult> {
    const result: SyncPricingResult = {
      synced: 0,
      autoCreated: 0,
      skipped: 0,
      errors: [],
    };

    // 获取所有 ModelAvailability
    const { list: availabilities } = await this.modelAvailabilityService.list(
      {},
      { limit: 10000 },
    );

    // 获取所有 ProviderKey 用于获取 vendor（自动创建 catalog 时需要）
    const { list: providerKeys } = await this.providerKeyService.list(
      {},
      { limit: 1000 },
    );
    const providerKeyMap = new Map(providerKeys.map((pk) => [pk.id, pk]));

    // 获取所有 ModelCatalog，按 model name 索引
    const catalogList = await this.modelCatalogService.listAll();
    const catalogMap = new Map(catalogList.map((c) => [c.model, c]));

    for (const availability of availabilities) {
      try {
        // 已关联则跳过
        if (availability.modelCatalogId) {
          result.skipped++;
          continue;
        }

        // 按 model name 查找 ModelCatalog
        let catalog = catalogMap.get(availability.model);

        // 不存在则自动创建基础记录
        if (!catalog) {
          const pk = providerKeyMap.get(availability.providerKeyId);
          const vendor = pk?.vendor || 'unknown';

          catalog = await this.modelCatalogService.create({
            model: availability.model,
            vendor,
            displayName: availability.model,
            inputPrice: 0,
            outputPrice: 0,
            dataSource: 'auto',
          });
          catalogMap.set(catalog.model, catalog);
          result.autoCreated++;

          this.logger.info(
            `[ModelSync] Auto-created ModelCatalog for: ${availability.model}, vendor: ${vendor}`,
          );
        }

        // 关联 ModelAvailability → ModelCatalog
        await this.modelAvailabilityService.update(
          { id: availability.id },
          {
            modelCatalog: { connect: { id: catalog.id } },
          },
        );
        result.synced++;
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
   * 同步单个模型的定价信息（关联 ModelCatalog）
   * 按 model name 匹配，不存在则自动创建
   */
  async syncModelCatalog(modelAvailabilityId: string): Promise<boolean> {
    const availability = await this.modelAvailabilityService.get({
      id: modelAvailabilityId,
    });
    if (!availability) {
      throw new Error(`ModelAvailability not found: ${modelAvailabilityId}`);
    }

    // 已关联则直接返回
    if (availability.modelCatalogId) {
      return true;
    }

    // 按 model name 查找 ModelCatalog
    let catalog = await this.modelCatalogService.getByModel(availability.model);

    // 不存在则自动创建
    if (!catalog) {
      const pk = await this.providerKeyService.get({
        id: availability.providerKeyId,
      });
      const vendor = pk?.vendor || 'unknown';

      catalog = await this.modelCatalogService.create({
        model: availability.model,
        vendor,
        displayName: availability.model,
        inputPrice: 0,
        outputPrice: 0,
        dataSource: 'auto',
      });

      this.logger.info(
        `[ModelSync] Auto-created ModelCatalog for: ${availability.model}, vendor: ${vendor}`,
      );
    }

    await this.modelAvailabilityService.update(
      { id: modelAvailabilityId },
      {
        modelCatalog: { connect: { id: catalog.id } },
      },
    );
    return true;
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
    const catalogSynced = availabilities.filter(
      (a: any) => a.modelCatalogId,
    ).length;
    const tagsSynced = totalModels; // Tags are now on ModelCatalog level, always considered synced

    // 获取最后同步时间
    const lastSyncAt: Date | null = null;

    return {
      totalModels,
      catalogSynced,
      catalogNotSynced: totalModels - catalogSynced,
      tagsSynced,
      tagsNotSynced: totalModels - tagsSynced,
      lastSyncAt,
    };
  }
}
