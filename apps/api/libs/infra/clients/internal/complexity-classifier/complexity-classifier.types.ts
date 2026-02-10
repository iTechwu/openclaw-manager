/**
 * Complexity Classifier Types
 *
 * 基于 llmrouter 项目的复杂度分类系统
 * 参考: https://github.com/alexrudloff/llmrouter
 */

/**
 * 复杂度等级 (5 级)
 */
export type ComplexityLevel =
  | 'super_easy'
  | 'easy'
  | 'medium'
  | 'hard'
  | 'super_hard';

/**
 * 复杂度等级数组（用于验证和排序）
 */
export const COMPLEXITY_LEVELS: ComplexityLevel[] = [
  'super_easy',
  'easy',
  'medium',
  'hard',
  'super_hard',
];

/**
 * 复杂度分类请求
 */
export interface ClassifyRequest {
  /** 用户消息 */
  message: string;
  /** 上下文消息（可选，用于继承复杂度） */
  context?: string;
  /** 是否包含工具调用 */
  hasTools?: boolean;
}

/**
 * 复杂度分类结果
 */
export interface ClassifyResult {
  /** 复杂度等级 */
  level: ComplexityLevel;
  /** 分类耗时（毫秒） */
  latencyMs: number;
  /** 原始响应（用于调试） */
  rawResponse?: string;
  /** 是否使用了上下文继承 */
  inheritedFromContext?: boolean;
}

/**
 * 复杂度路由配置
 */
export interface ComplexityRoutingConfig {
  /** 各复杂度对应的模型配置 */
  models: Record<ComplexityLevel, ModelConfig>;
  /** 工具调用时的最低复杂度 */
  toolMinComplexity?: ComplexityLevel;
  /** 工具调用时强制使用的模型（覆盖复杂度路由） */
  toolOverrideModel?: ModelConfig;
}

/**
 * 模型配置
 */
export interface ModelConfig {
  /** Provider (e.g., 'openai', 'anthropic', 'deepseek') */
  vendor: string;
  /** 模型名称 */
  model: string;
  /** API 类型 */
  apiType?: string;
  /** 自定义 Base URL */
  baseUrl?: string;
}

/**
 * 复杂度分类器配置
 */
export interface ClassifierConfig {
  /** 分类器使用的模型 */
  model: string;
  /** 分类器使用的 vendor */
  vendor: string;
  /** 自定义 Base URL */
  baseUrl?: string;
  /** API Key（可选，默认使用配置中的 key） */
  apiKey?: string;
  /** 超时时间（毫秒） */
  timeout?: number;
}
