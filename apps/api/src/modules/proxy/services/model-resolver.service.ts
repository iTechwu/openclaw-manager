import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { ModelAvailabilityService, ProviderKeyService } from '@app/db';

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
 * 缓存条目
 */
interface CacheEntry<T> {
  data: T;
  expiry: number;
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
 *
 * 缓存策略：
 * - ProviderKey 信息缓存 5 分钟（不常变化）
 * - ModelAvailability 列表缓存 1 分钟（健康评分实时获取）
 */
@Injectable()
export class ModelResolverService implements OnModuleDestroy {
  // ProviderKey 缓存（缓存 vendor、apiType、baseUrl 等静态信息）
  private readonly providerKeyCache = new Map<string, CacheEntry<any>>();
  private readonly providerKeyCacheTTL = 5 * 60 * 1000; // 5 分钟

  // 模型可用性列表缓存（缓存模型列表，但健康评分实时获取）
  private readonly availabilityCache = new Map<string, CacheEntry<any[]>>();
  private readonly availabilityCacheTTL = 60 * 1000; // 1 分钟

  // 定期清理过期缓存的定时器
  private cleanupInterval?: NodeJS.Timeout;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly modelAvailabilityService: ModelAvailabilityService,
    private readonly providerKeyService: ProviderKeyService,
  ) {
    // 每分钟清理过期缓存
    this.cleanupInterval = setInterval(
      () => this.cleanupExpiredCache(),
      60 * 1000,
    );
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  /**
   * 清理过期缓存
   */
  private cleanupExpiredCache(): void {
    const now = Date.now();

    for (const [key, entry] of this.providerKeyCache) {
      if (entry.expiry < now) {
        this.providerKeyCache.delete(key);
      }
    }

    for (const [key, entry] of this.availabilityCache) {
      if (entry.expiry < now) {
        this.availabilityCache.delete(key);
      }
    }
  }

  /**
   * 手动清除指定模型的缓存
   * 当 Provider 配置变更时调用
   */
  invalidateCache(model?: string): void {
    if (model) {
      this.availabilityCache.delete(model);
      this.logger.debug(
        `[ModelResolver] Cache invalidated for model: ${model}`,
      );
    } else {
      this.availabilityCache.clear();
      this.providerKeyCache.clear();
      this.logger.debug('[ModelResolver] All cache invalidated');
    }
  }

  /**
   * 将模型名称解析为最优的可用 vendor 实例
   */
  async resolve(
    model: string,
    options?: ResolveOptions,
  ): Promise<ResolvedModel | null> {
    const candidates = await this.resolveAll(model, options);

    if (candidates.length === 0) {
      this.logger.warn(
        `[ModelResolver] No available vendor for model: ${model}`,
      );
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
    // 获取可用性列表（健康评分实时获取，不缓存）
    const { list: availabilities } = await this.modelAvailabilityService.list(
      { model, isAvailable: true },
      { limit: 50 },
    );

    if (availabilities.length === 0) {
      return [];
    }

    // 使用缓存的 ProviderKey 信息进行增强
    const enriched = await this.enrichWithProviderKeysCached(availabilities);
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
    const candidates = enriched.filter(
      ({ availability: a, providerKey: pk }) => {
        if (!pk) return false;
        if (options?.excludeProviderKeyIds?.includes(a.providerKeyId))
          return false;
        if (options?.minHealthScore && a.healthScore < options.minHealthScore)
          return false;
        if (
          options?.requiredProtocol &&
          pk.apiType !== options.requiredProtocol
        )
          return false;
        return true;
      },
    );

    candidates.sort(
      (
        { availability: a, providerKey: pkA },
        { availability: b, providerKey: pkB },
      ) => {
        if (options?.preferredVendor) {
          const aP = pkA?.vendor === options.preferredVendor;
          const bP = pkB?.vendor === options.preferredVendor;
          if (aP && !bP) return -1;
          if (!aP && bP) return 1;
        }
        if (b.vendorPriority !== a.vendorPriority)
          return b.vendorPriority - a.vendorPriority;
        return b.healthScore - a.healthScore;
      },
    );

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

    if (pkIds.length === 0) {
      return availabilities.map((a) => ({
        availability: a,
        providerKey: null,
      }));
    }

    // 批量查询，避免 N+1 问题
    const { list: providerKeys } = await this.providerKeyService.list(
      { id: { in: pkIds } },
      { limit: pkIds.length },
    );

    const pkMap = new Map(providerKeys.map((pk) => [pk.id, pk]));

    return availabilities.map((a) => ({
      availability: a,
      providerKey: pkMap.get(a.providerKeyId) || null,
    }));
  }

  /**
   * 使用缓存的 ProviderKey 信息进行增强
   * 只缓存 ProviderKey 的静态信息（vendor、apiType、baseUrl），健康评分实时获取
   */
  private async enrichWithProviderKeysCached(
    availabilities: any[],
  ): Promise<Array<{ availability: any; providerKey: any }>> {
    const pkIds = [...new Set(availabilities.map((a) => a.providerKeyId))];
    const now = Date.now();

    if (pkIds.length === 0) {
      return availabilities.map((a) => ({
        availability: a,
        providerKey: null,
      }));
    }

    // 检查缓存，找出需要从数据库加载的 ProviderKey
    const pkMap = new Map<string, any>();
    const uncachedIds: string[] = [];

    for (const pkId of pkIds) {
      const cached = this.providerKeyCache.get(pkId);
      if (cached && cached.expiry > now) {
        pkMap.set(pkId, cached.data);
      } else {
        uncachedIds.push(pkId);
      }
    }

    // 批量加载未缓存的 ProviderKey
    if (uncachedIds.length > 0) {
      const { list: providerKeys } = await this.providerKeyService.list(
        { id: { in: uncachedIds } },
        { limit: uncachedIds.length },
      );

      for (const pk of providerKeys) {
        pkMap.set(pk.id, pk);
        // 缓存 ProviderKey 信息
        this.providerKeyCache.set(pk.id, {
          data: pk,
          expiry: now + this.providerKeyCacheTTL,
        });
      }
    }

    return availabilities.map((a) => ({
      availability: a,
      providerKey: pkMap.get(a.providerKeyId) || null,
    }));
  }
}
