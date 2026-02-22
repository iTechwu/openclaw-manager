import { z } from 'zod';

/**
 * 模型 API 协议支持配置
 *
 * 定义哪些 Provider 的哪些模型支持多种协议
 * 用于前端显示协议选择器和后端验证
 *
 * ## 双层模型体系
 *
 * 第一层（生产 + 路由层）：
 * - 协议：OpenAI-compatible
 * - 用途：普通对话、翻译、总结、数据分析、普通工具调用
 * - 模型：全部模型
 *
 * 第二层（研究 Agent 专用）：
 * - 协议：Anthropic / 原生协议
 * - 用途：深度规划、复杂推理、Extended Thinking
 * - 模型：少数精选模型
 */

// ============================================================================
// API 协议类型定义
// ============================================================================

/**
 * 模型 API 协议类型
 */
export const ModelApiTypeSchema = z.enum([
  'openai', // OpenAI 兼容协议 (Chat Completions API)
  'anthropic', // Anthropic 协议 (Messages API)
  'gemini', // Google Gemini 协议
]);

export type ModelApiType = z.infer<typeof ModelApiTypeSchema>;

/**
 * 模型层级
 * - production: 第一层（生产 + 路由层）
 * - research: 第二层（研究 Agent 专用）
 * - both: 两者皆可
 */
export const ModelLayerSchema = z.enum(['production', 'research', 'both']);

export type ModelLayer = z.infer<typeof ModelLayerSchema>;

// ============================================================================
// 模型协议支持配置 Schema
// ============================================================================

/**
 * 单个模型的协议支持配置
 */
export const ModelApiTypeConfigSchema = z.object({
  /** 模型 ID（OpenAI 协议下的标识） */
  modelId: z.string(),
  /** 模型显示名称 */
  displayName: z.string(),
  /** 支持的协议列表 */
  supportedApiTypes: z.array(ModelApiTypeSchema),
  /** Anthropic 协议下的模型标识符（如果不同） */
  anthropicModelId: z.string().optional(),
  /** 是否推荐使用 Anthropic 协议 */
  recommendAnthropic: z.boolean().default(false),
  /** 推荐原因 */
  recommendReason: z.string().optional(),
  /** 模型所属层级 */
  layer: ModelLayerSchema.default('production'),
});

export type ModelApiTypeConfig = z.infer<typeof ModelApiTypeConfigSchema>;

/**
 * Provider 的模型协议支持配置
 */
export const ProviderModelApiTypeSupportSchema = z.object({
  /** Provider ID */
  providerId: z.string(),
  /** 支持多协议的模型配置列表 */
  models: z.array(ModelApiTypeConfigSchema),
});

export type ProviderModelApiTypeSupport = z.infer<
  typeof ProviderModelApiTypeSupportSchema
>;

// ============================================================================
// 支持多协议的 Provider 和模型配置
// ============================================================================

/**
 * 支持多协议的 Provider 和模型配置
 *
 * 参考资料：
 * - 智谱 AI: https://open.bigmodel.cn/dev/api#anthropic
 * - 月之暗面: https://platform.moonshot.cn/docs/api/anthropic
 * - 硅基流动: https://docs.siliconflow.cn/cn/api-reference/anthropic
 */
export const MODEL_API_TYPE_SUPPORT: ProviderModelApiTypeSupport[] = [
  // ============ 智谱 AI (Zhipu) ============
  {
    providerId: 'zhipu',
    models: [
      {
        modelId: 'glm-5',
        displayName: 'GLM-5',
        supportedApiTypes: ['openai', 'anthropic'],
        anthropicModelId: 'glm-5',
        recommendAnthropic: true,
        recommendReason: '更好的 Extended Thinking 和流式输出支持',
        layer: 'research',
      },
      {
        modelId: 'glm-5-flash',
        displayName: 'GLM-5-Flash',
        supportedApiTypes: ['openai', 'anthropic'],
        anthropicModelId: 'glm-5-flash',
        recommendAnthropic: true,
        recommendReason: '更好的 Extended Thinking 和流式输出支持',
        layer: 'research',
      },
      {
        modelId: 'glm-4-plus',
        displayName: 'GLM-4-Plus',
        supportedApiTypes: ['openai', 'anthropic'],
        anthropicModelId: 'glm-4-plus',
        recommendAnthropic: false,
        layer: 'production',
      },
      {
        modelId: 'glm-4-air',
        displayName: 'GLM-4-Air',
        supportedApiTypes: ['openai', 'anthropic'],
        anthropicModelId: 'glm-4-air',
        recommendAnthropic: false,
        layer: 'production',
      },
      {
        modelId: 'glm-4-airx',
        displayName: 'GLM-4-AirX',
        supportedApiTypes: ['openai', 'anthropic'],
        anthropicModelId: 'glm-4-airx',
        recommendAnthropic: false,
        layer: 'production',
      },
      {
        modelId: 'glm-4-flash',
        displayName: 'GLM-4-Flash',
        supportedApiTypes: ['openai', 'anthropic'],
        anthropicModelId: 'glm-4-flash',
        recommendAnthropic: false,
        layer: 'production',
      },
      {
        modelId: 'glm-4-long',
        displayName: 'GLM-4-Long',
        supportedApiTypes: ['openai', 'anthropic'],
        anthropicModelId: 'glm-4-long',
        recommendAnthropic: false,
        layer: 'production',
      },
    ],
  },

  // ============ 月之暗面 (Moonshot) ============
  {
    providerId: 'moonshot',
    models: [
      {
        modelId: 'kimi-latest',
        displayName: 'Kimi Latest',
        supportedApiTypes: ['openai', 'anthropic'],
        anthropicModelId: 'kimi-latest',
        recommendAnthropic: true,
        recommendReason: '更好的工具调用和流式输出支持',
        layer: 'research',
      },
      {
        modelId: 'moonshot-v1-8k',
        displayName: 'Moonshot V1 8K',
        supportedApiTypes: ['openai', 'anthropic'],
        anthropicModelId: 'moonshot-v1-8k',
        recommendAnthropic: false,
        layer: 'production',
      },
      {
        modelId: 'moonshot-v1-32k',
        displayName: 'Moonshot V1 32K',
        supportedApiTypes: ['openai', 'anthropic'],
        anthropicModelId: 'moonshot-v1-32k',
        recommendAnthropic: false,
        layer: 'production',
      },
      {
        modelId: 'moonshot-v1-128k',
        displayName: 'Moonshot V1 128K',
        supportedApiTypes: ['openai', 'anthropic'],
        anthropicModelId: 'moonshot-v1-128k',
        recommendAnthropic: false,
        layer: 'production',
      },
    ],
  },

  // ============ 硅基流动 (Silicon) ============
  {
    providerId: 'silicon',
    models: [
      {
        modelId: 'deepseek-ai/DeepSeek-V3',
        displayName: 'DeepSeek V3',
        supportedApiTypes: ['openai', 'anthropic'],
        anthropicModelId: 'deepseek-ai/DeepSeek-V3',
        recommendAnthropic: false,
        layer: 'production',
      },
      {
        modelId: 'Qwen/Qwen2.5-72B-Instruct',
        displayName: 'Qwen2.5-72B',
        supportedApiTypes: ['openai', 'anthropic'],
        anthropicModelId: 'Qwen/Qwen2.5-72B-Instruct',
        recommendAnthropic: false,
        layer: 'production',
      },
    ],
  },

  // ============ Anthropic (原生支持) ============
  {
    providerId: 'anthropic',
    models: [
      {
        modelId: 'claude-opus-4-20250514',
        displayName: 'Claude Opus 4',
        supportedApiTypes: ['anthropic'],
        anthropicModelId: 'claude-opus-4-20250514',
        recommendAnthropic: true,
        recommendReason: '原生 Anthropic 协议，支持 Extended Thinking',
        layer: 'research',
      },
      {
        modelId: 'claude-sonnet-4-20250514',
        displayName: 'Claude Sonnet 4',
        supportedApiTypes: ['anthropic'],
        anthropicModelId: 'claude-sonnet-4-20250514',
        recommendAnthropic: true,
        recommendReason: '原生 Anthropic 协议，支持 Extended Thinking',
        layer: 'research',
      },
      {
        modelId: 'claude-3-5-haiku-20241022',
        displayName: 'Claude 3.5 Haiku',
        supportedApiTypes: ['anthropic'],
        anthropicModelId: 'claude-3-5-haiku-20241022',
        recommendAnthropic: true,
        recommendReason: '原生 Anthropic 协议，支持 Cache Control',
        layer: 'production',
      },
    ],
  },
];

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 获取 Provider 支持多协议的模型列表
 */
export function getProviderMultiApiTypeModels(
  providerId: string,
): ModelApiTypeConfig[] | null {
  const support = MODEL_API_TYPE_SUPPORT.find(
    (s) => s.providerId === providerId,
  );
  return support?.models ?? null;
}

/**
 * 检查模型是否支持多种协议
 */
export function isModelMultiApiTypeSupported(
  providerId: string,
  modelId: string,
): boolean {
  const models = getProviderMultiApiTypeModels(providerId);
  if (!models) return false;
  return models.some(
    (m) => m.modelId === modelId && m.supportedApiTypes.length > 1,
  );
}

/**
 * 获取模型支持的协议类型
 */
export function getModelSupportedApiTypes(
  providerId: string,
  modelId: string,
): ModelApiType[] {
  const models = getProviderMultiApiTypeModels(providerId);
  if (!models) return ['openai'];
  const model = models.find((m) => m.modelId === modelId);
  return model?.supportedApiTypes ?? ['openai'];
}

/**
 * 获取模型的 Anthropic 协议标识符
 */
export function getAnthropicModelId(
  providerId: string,
  modelId: string,
): string | null {
  const models = getProviderMultiApiTypeModels(providerId);
  if (!models) return null;
  const model = models.find((m) => m.modelId === modelId);
  return model?.anthropicModelId ?? null;
}

/**
 * 检查是否推荐使用 Anthropic 协议
 */
export function shouldRecommendAnthropic(
  providerId: string,
  modelId: string,
): { recommend: boolean; reason?: string } {
  const models = getProviderMultiApiTypeModels(providerId);
  if (!models) return { recommend: false };
  const model = models.find((m) => m.modelId === modelId);
  if (!model) return { recommend: false };
  return {
    recommend: model.recommendAnthropic ?? false,
    reason: model.recommendReason,
  };
}

/**
 * 获取模型所属层级
 */
export function getModelLayer(
  providerId: string,
  modelId: string,
): ModelLayer {
  const models = getProviderMultiApiTypeModels(providerId);
  if (!models) return 'production';
  const model = models.find((m) => m.modelId === modelId);
  return model?.layer ?? 'production';
}

/**
 * 获取第二层（研究）模型列表
 */
export function getResearchLayerModels(): Array<{
  providerId: string;
  model: ModelApiTypeConfig;
}> {
  const result: Array<{ providerId: string; model: ModelApiTypeConfig }> = [];

  for (const support of MODEL_API_TYPE_SUPPORT) {
    for (const model of support.models) {
      if (model.layer === 'research' || model.layer === 'both') {
        result.push({
          providerId: support.providerId,
          model,
        });
      }
    }
  }

  return result;
}

/**
 * 获取所有支持 Anthropic 协议的模型
 */
export function getAnthropicSupportedModels(): Array<{
  providerId: string;
  model: ModelApiTypeConfig;
}> {
  const result: Array<{ providerId: string; model: ModelApiTypeConfig }> = [];

  for (const support of MODEL_API_TYPE_SUPPORT) {
    for (const model of support.models) {
      if (model.supportedApiTypes.includes('anthropic')) {
        result.push({
          providerId: support.providerId,
          model,
        });
      }
    }
  }

  return result;
}

/**
 * 检查 Provider 是否支持自定义协议选择（非 custom provider）
 */
export function isProviderSupportsApiTypeSelection(providerId: string): boolean {
  // custom provider 不支持协议选择
  if (providerId === 'custom') return false;
  // 检查是否有配置
  return MODEL_API_TYPE_SUPPORT.some((s) => s.providerId === providerId);
}
