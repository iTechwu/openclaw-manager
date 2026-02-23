import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import {
  FallbackChainService,
  ModelAvailabilityService,
  ProviderKeyService,
  CapabilityTagService,
} from '@app/db';
import type { FallbackChain } from '@prisma/client';

/**
 * FallbackChain 中的模型配置
 */
interface FallbackChainModel {
  vendor: string;
  model: string;
  protocol?: string;
  features?: Record<string, boolean>;
}

/**
 * FallbackChain 验证结果
 */
export interface FallbackChainValidationResult {
  chainId: string;
  name: string;
  totalModels: number;
  availableModels: number;
  unavailableModels: Array<{
    model: string;
    vendor: string;
    reason: string;
  }>;
  isValid: boolean;
}

/**
 * 更新 FallbackChain 结果
 */
export interface UpdateFallbackChainsResult {
  chainsUpdated: number;
  modelsRemoved: number;
  modelsAdded: number;
  errors: Array<{ chainId: string; error: string }>;
}

/**
 * RoutingConfigService
 *
 * 管理路由配置，包括 FallbackChain 的验证和自动更新
 */
@Injectable()
export class RoutingConfigService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly fallbackChainService: FallbackChainService,
    private readonly modelAvailabilityService: ModelAvailabilityService,
    private readonly providerKeyService: ProviderKeyService,
    private readonly capabilityTagService: CapabilityTagService,
  ) {}

  /**
   * 验证单个 FallbackChain 中的所有模型是否可用
   */
  async validateFallbackChain(
    chainId: string,
  ): Promise<FallbackChainValidationResult> {
    const chain = await this.fallbackChainService.get({ chainId });
    if (!chain) {
      throw new Error(`FallbackChain not found: ${chainId}`);
    }

    return this.validateChain(chain);
  }

  /**
   * 验证所有 FallbackChain
   */
  async validateAllFallbackChains(): Promise<FallbackChainValidationResult[]> {
    const { list: chains } = await this.fallbackChainService.list(
      { isActive: true, isDeleted: false },
      { limit: 100 },
    );

    const results: FallbackChainValidationResult[] = [];
    for (const chain of chains) {
      results.push(await this.validateChain(chain));
    }

    return results;
  }

  /**
   * 根据模型可用性自动更新 FallbackChain
   */
  async updateFallbackChainsFromAvailability(options: {
    removeUnavailable: boolean;
    addNewAvailable: boolean;
  }): Promise<UpdateFallbackChainsResult> {
    const result: UpdateFallbackChainsResult = {
      chainsUpdated: 0,
      modelsRemoved: 0,
      modelsAdded: 0,
      errors: [],
    };

    // 获取所有活跃的 FallbackChain
    const { list: chains } = await this.fallbackChainService.list(
      { isActive: true, isDeleted: false },
      { limit: 100 },
    );

    // 获取所有可用模型
    const availableModels = await this.getAvailableModelsMap();

    for (const chain of chains) {
      try {
        const models = chain.models as unknown as FallbackChainModel[];
        let updated = false;
        const newModels: FallbackChainModel[] = [];

        // 处理现有模型
        for (const model of models) {
          const key = `${model.vendor}:${model.model}`;
          const isAvailable = availableModels.has(key);

          if (isAvailable) {
            newModels.push(model);
          } else if (options.removeUnavailable) {
            result.modelsRemoved++;
            updated = true;
            this.logger.info(
              `[RoutingConfig] Removing unavailable model from chain ${chain.chainId}`,
              { model: model.model, vendor: model.vendor },
            );
          } else {
            // 保留不可用模型
            newModels.push(model);
          }
        }

        // 更新 FallbackChain
        if (updated) {
          await this.fallbackChainService.update(
            { id: chain.id },
            { models: newModels as unknown as any },
          );
          result.chainsUpdated++;
        }
      } catch (error) {
        result.errors.push({
          chainId: chain.chainId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.info('[RoutingConfig] FallbackChains update completed', result);
    return result;
  }

  /**
   * 根据能力标签自动生成推荐的 FallbackChain
   */
  async generateRecommendedFallbackChain(
    capabilityTagId: string,
    name: string,
    maxModels: number = 5,
  ): Promise<FallbackChain> {
    // 获取能力标签
    const tag = await this.capabilityTagService.get({ id: capabilityTagId });
    if (!tag) {
      throw new Error(`CapabilityTag not found: ${capabilityTagId}`);
    }

    // 获取所有可用模型
    const { list: availabilities } = await this.modelAvailabilityService.list(
      { isAvailable: true },
      { limit: 1000 },
    );

    // 获取 ProviderKey 映射
    const { list: providerKeys } = await this.providerKeyService.list(
      {},
      { limit: 1000 },
    );
    const providerKeyMap = new Map(providerKeys.map((pk) => [pk.id, pk]));

    // 筛选匹配能力标签的模型
    const matchingModels: FallbackChainModel[] = [];
    const requiredModels = tag.requiredModels as string[] | null;

    for (const availability of availabilities) {
      const pk = providerKeyMap.get(availability.providerKeyId);
      if (!pk) continue;

      // 检查是否匹配 requiredModels 模式
      if (requiredModels && requiredModels.length > 0) {
        const matches = requiredModels.some((pattern) => {
          const regexPattern = pattern
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\\\*/g, '.*');
          const regex = new RegExp(`^${regexPattern}$`, 'i');
          return regex.test(availability.model);
        });

        if (matches) {
          matchingModels.push({
            vendor: pk.vendor,
            model: availability.model,
          });
        }
      }

      if (matchingModels.length >= maxModels) break;
    }

    // 生成唯一的 chainId
    const chainId = `auto-${tag.tagId}-${Date.now()}`;

    // 创建 FallbackChain
    const chain = await this.fallbackChainService.create({
      chainId,
      name,
      description: `Auto-generated fallback chain for capability tag: ${tag.tagId}`,
      models: matchingModels as unknown as any,
      isActive: true,
      isBuiltin: false,
    });

    this.logger.info('[RoutingConfig] Generated FallbackChain', {
      chainId,
      tagId: tag.tagId,
      modelCount: matchingModels.length,
    });

    return chain;
  }

  /**
   * 验证单个 FallbackChain
   */
  private async validateChain(
    chain: FallbackChain,
  ): Promise<FallbackChainValidationResult> {
    const models = chain.models as unknown as FallbackChainModel[];
    const availableModels = await this.getAvailableModelsMap();

    const unavailableModels: Array<{
      model: string;
      vendor: string;
      reason: string;
    }> = [];

    for (const model of models) {
      const key = `${model.vendor}:${model.model}`;
      if (!availableModels.has(key)) {
        unavailableModels.push({
          model: model.model,
          vendor: model.vendor,
          reason: 'Model not found in available models',
        });
      }
    }

    return {
      chainId: chain.chainId,
      name: chain.name,
      totalModels: models.length,
      availableModels: models.length - unavailableModels.length,
      unavailableModels,
      isValid: unavailableModels.length === 0,
    };
  }

  /**
   * 获取所有可用模型的映射
   */
  private async getAvailableModelsMap(): Promise<Map<string, boolean>> {
    const { list: availabilities } = await this.modelAvailabilityService.list(
      { isAvailable: true },
      { limit: 10000 },
    );

    const { list: providerKeys } = await this.providerKeyService.list(
      {},
      { limit: 1000 },
    );
    const providerKeyMap = new Map(providerKeys.map((pk) => [pk.id, pk]));

    const availableModels = new Map<string, boolean>();
    for (const availability of availabilities) {
      const pk = providerKeyMap.get(availability.providerKeyId);
      if (pk) {
        const key = `${pk.vendor}:${availability.model}`;
        availableModels.set(key, true);
      }
    }

    return availableModels;
  }
}
