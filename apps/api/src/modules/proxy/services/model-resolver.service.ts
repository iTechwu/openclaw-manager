import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import {
  ModelAvailabilityService,
  ProviderKeyService,
} from '@app/db';

/**
 * 解析后的模型实例
 */
export interface ResolvedModel {
  availabilityId: string;
  providerKeyId: string;
  model: string;
  vendor: string;
  apiType: string;
  baseUrl: string;
  vendorPriority: number;
  healthScore: number;
}

export interface ResolveOptions {
  preferredVendor?: string;
  requiredProtocol?: string;
  excludeProviderKeyIds?: string[];
  minHealthScore?: number;
}

/**
 * ModelResolverService - 模型到 Vendor 实例的运行时解析
 *
 * 当路由决策选定一个模型后，将其解析为最优的可用 vendor 实例（ProviderKey）。
 *
 * 解析优先级：
 * 1. isAvailable = true（必须可用）
 * 2. vendorPriority DESC（用户配置的优先级）
 * 3. healthScore DESC（动态健康评分）
 */
@Injectable()
export class ModelResolverService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly modelAvailabilityService: ModelAvailabilityService,
    private readonly providerKeyService: ProviderKeyService,
  ) {}

  /**
   * 将模型名称解析为最优的可用 vendor 实例
   */
  async resolve(
    model: string,
    options?: ResolveOptions,
  ): Promise<ResolvedModel | null> {
    const { list: availabilities } = await this.modelAvailabilityService.list(
      { model, isAvailable: true },
      { limit: 50 },
    );

    if (availabilities.length === 0) {
      this.logger.warn(`[ModelResolver] No available vendor for model: ${model}`);
      return null;
    }

    const enriched = await this.enrichWithProviderKeys(availabilities);
    const candidates = this.filterAndSort(enriched, options);
    if (candidates.length === 0) {
      this.logger.warn(`[ModelResolver] No candidates after filtering for model: ${model}`);
      return null;
    }

    const best = candidates[0];
    this.logger.debug(
      `[ModelResolver] Resolved ${model} → ${best.vendor} (priority=${best.vendorPriority}, health=${best.healthScore})`,
    );
    return best;
  }

  /**
   * 解析模型的所有可用 vendor 实例（按优先级排序）
   * 用于 Fallback 场景：同一模型内多 vendor 容错
   */
  async resolveAll(
    model: string,
    options?: ResolveOptions,
  ): Promise<ResolvedModel[]> {
    const { list: availabilities } = await this.modelAvailabilityService.list(
      { model, isAvailable: true },
      { limit: 50 },
    );

    const enriched = await this.enrichWithProviderKeys(availabilities);
    return this.filterAndSort(enriched, options);
  }

  /**
   * 更新 vendor 实例的健康评分
   * 指数移动平均：newScore = 0.9 * oldScore + 0.1 * (success ? 100 : 0)
   */
  async updateHealthScore(
    providerKeyId: string,
    model: string,
    success: boolean,
  ): Promise<void> {
    const availability = await this.modelAvailabilityService.get({
      providerKeyId,
      model,
    });
    if (!availability) return;

    const newScore = Math.round(
      0.9 * availability.healthScore + 0.1 * (success ? 100 : 0),
    );

    await this.modelAvailabilityService.update(
      { id: availability.id },
      { healthScore: newScore },
    );

    if (!success) {
      this.logger.warn(
        `[ModelResolver] Health degraded for ${model}@${providerKeyId}: ${availability.healthScore} → ${newScore}`,
      );
    }
  }

  private filterAndSort(
    enriched: Array<{ availability: any; providerKey: any }>,
    options?: ResolveOptions,
  ): ResolvedModel[] {
    let candidates = enriched.filter(({ availability: a, providerKey: pk }) => {
      if (!pk) return false;
      if (options?.excludeProviderKeyIds?.includes(a.providerKeyId)) return false;
      if (options?.minHealthScore && a.healthScore < options.minHealthScore) return false;
      if (options?.requiredProtocol && pk.apiType !== options.requiredProtocol) return false;
      return true;
    });

    candidates.sort(({ availability: a, providerKey: pkA }, { availability: b, providerKey: pkB }) => {
      if (options?.preferredVendor) {
        const aP = pkA?.vendor === options.preferredVendor;
        const bP = pkB?.vendor === options.preferredVendor;
        if (aP && !bP) return -1;
        if (!aP && bP) return 1;
      }
      if (b.vendorPriority !== a.vendorPriority) return b.vendorPriority - a.vendorPriority;
      return b.healthScore - a.healthScore;
    });

    return candidates.map(({ availability: c, providerKey: pk }) => ({
      availabilityId: c.id,
      providerKeyId: c.providerKeyId,
      model: c.model,
      vendor: pk.vendor,
      apiType: pk.apiType,
      baseUrl: pk.baseUrl || '',
      vendorPriority: c.vendorPriority,
      healthScore: c.healthScore,
    }));
  }

  private async enrichWithProviderKeys(
    availabilities: any[],
  ): Promise<Array<{ availability: any; providerKey: any }>> {
    const pkIds = [...new Set(availabilities.map((a) => a.providerKeyId))];
    const pkMap = new Map<string, any>();

    for (const pkId of pkIds) {
      const pk = await this.providerKeyService.getById(pkId);
      if (pk) pkMap.set(pkId, pk);
    }

    return availabilities.map((a) => ({
      availability: a,
      providerKey: pkMap.get(a.providerKeyId) || null,
    }));
  }
}
