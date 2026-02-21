import { z } from 'zod';

/**
 * OpenClaw 原生 Provider 映射配置
 *
 * 定义 clawbot-manager vendor 到 OpenClaw provider 的映射关系
 * 以及原生支持的相关配置
 *
 * 参考: https://docs.openclaw.ai/concepts/model-providers
 */

/**
 * OpenClaw API 类型
 *
 * - openai-completions: OpenAI 兼容的 chat completions API
 * - anthropic-messages: Anthropic Messages API
 * - gemini: Google Gemini API
 * - mistral: Mistral API
 */
export const OpenclawApiTypeSchema = z.enum([
  'openai-completions',
  'anthropic-messages',
  'gemini',
  'mistral',
]);

export type OpenclawApiType = z.infer<typeof OpenclawApiTypeSchema>;

/**
 * 原生 Provider 配置
 */
export const OpenclawNativeProviderConfigSchema = z.object({
  /** OpenClaw 中的 provider ID */
  openclawProviderId: z.string(),
  /** 模型引用格式，{model} 会被替换为实际模型名 */
  modelFormat: z.string(),
  /** API 类型 */
  apiType: OpenclawApiTypeSchema,
  /** 环境变量名称（用于 API Key） */
  envVar: z.string(),
  /** 是否原生支持 */
  nativeSupport: z.boolean().default(true),
  /** 是否需要响应转换（如 GLM 的 reasoning_content） */
  requiresTransformation: z.boolean().default(false),
  /** 默认 Base URL（可选） */
  defaultBaseUrl: z.string().optional(),
  /** Provider 显示名称 */
  displayName: z.string(),
});

export type OpenclawNativeProviderConfig = z.infer<
  typeof OpenclawNativeProviderConfigSchema
>;

/**
 * Clawbot Vendor 到 OpenClaw Provider 的映射
 *
 * 映射规则：
 * - 完全原生支持：OpenClaw 内置支持，无需额外配置
 * - 需要 Proxy 支持：clawbot-manager proxy 提供兼容层
 *
 * 参考: https://docs.openclaw.ai/concepts/model-providers
 */
export const OPENCLAW_NATIVE_PROVIDERS: Record<
  string,
  OpenclawNativeProviderConfig | { useProxy: true }
> = {
  // ============ 完全原生支持 (pi-ai catalog) ============
  zhipu: {
    openclawProviderId: 'zai',
    modelFormat: 'zai/{model}',
    apiType: 'openai-completions',
    envVar: 'ZAI_API_KEY',
    nativeSupport: true,
    requiresTransformation: true, // reasoning_content 需要转换
    displayName: 'Z.AI (智谱 GLM)',
  },
  anthropic: {
    openclawProviderId: 'anthropic',
    modelFormat: 'anthropic/{model}',
    apiType: 'anthropic-messages',
    envVar: 'ANTHROPIC_API_KEY',
    nativeSupport: true,
    requiresTransformation: false,
    displayName: 'Anthropic (Claude)',
  },
  openai: {
    openclawProviderId: 'openai',
    modelFormat: 'openai/{model}',
    apiType: 'openai-completions',
    envVar: 'OPENAI_API_KEY',
    nativeSupport: true,
    requiresTransformation: false,
    displayName: 'OpenAI',
  },
  google: {
    openclawProviderId: 'google',
    modelFormat: 'google/{model}',
    apiType: 'gemini',
    envVar: 'GEMINI_API_KEY',
    nativeSupport: true,
    requiresTransformation: false,
    displayName: 'Google (Gemini)',
  },
  deepseek: {
    openclawProviderId: 'deepseek',
    modelFormat: 'deepseek/{model}',
    apiType: 'openai-completions',
    envVar: 'DEEPSEEK_API_KEY',
    nativeSupport: true,
    requiresTransformation: false,
    displayName: 'DeepSeek',
  },
  moonshot: {
    openclawProviderId: 'moonshot',
    modelFormat: 'moonshot/{model}',
    apiType: 'openai-completions',
    envVar: 'MOONSHOT_API_KEY',
    nativeSupport: true,
    requiresTransformation: false,
    defaultBaseUrl: 'https://api.moonshot.ai/v1',
    displayName: 'Moonshot (Kimi)',
  },
  groq: {
    openclawProviderId: 'groq',
    modelFormat: 'groq/{model}',
    apiType: 'openai-completions',
    envVar: 'GROQ_API_KEY',
    nativeSupport: true,
    requiresTransformation: false,
    displayName: 'Groq',
  },
  xai: {
    openclawProviderId: 'xai',
    modelFormat: 'xai/{model}',
    apiType: 'openai-completions',
    envVar: 'XAI_API_KEY',
    nativeSupport: true,
    requiresTransformation: false,
    displayName: 'xAI (Grok)',
  },
  openrouter: {
    openclawProviderId: 'openrouter',
    modelFormat: 'openrouter/{model}',
    apiType: 'openai-completions',
    envVar: 'OPENROUTER_API_KEY',
    nativeSupport: true,
    requiresTransformation: false,
    displayName: 'OpenRouter',
  },
  mistral: {
    openclawProviderId: 'mistral',
    modelFormat: 'mistral/{model}',
    apiType: 'mistral',
    envVar: 'MISTRAL_API_KEY',
    nativeSupport: true,
    requiresTransformation: false,
    displayName: 'Mistral',
  },
  cerebras: {
    openclawProviderId: 'cerebras',
    modelFormat: 'cerebras/{model}',
    apiType: 'openai-completions',
    envVar: 'CEREBRAS_API_KEY',
    nativeSupport: true,
    requiresTransformation: false,
    defaultBaseUrl: 'https://api.cerebras.ai/v1',
    displayName: 'Cerebras',
  },
  ollama: {
    openclawProviderId: 'ollama',
    modelFormat: 'ollama/{model}',
    apiType: 'openai-completions',
    envVar: '', // Ollama 不需要 API Key
    nativeSupport: true,
    requiresTransformation: false,
    defaultBaseUrl: 'http://127.0.0.1:11434/v1',
    displayName: 'Ollama (Local)',
  },

  // ============ 火山引擎/字节 (OpenClaw 原生支持) ============
  doubao: {
    // 火山引擎 (国内)
    openclawProviderId: 'volcengine',
    modelFormat: 'volcengine/{model}',
    apiType: 'openai-completions',
    envVar: 'VOLCANO_ENGINE_API_KEY',
    nativeSupport: true,
    requiresTransformation: false,
    displayName: 'Volcano Engine (Doubao)',
  },
  volcengine: {
    // 别名
    openclawProviderId: 'volcengine',
    modelFormat: 'volcengine/{model}',
    apiType: 'openai-completions',
    envVar: 'VOLCANO_ENGINE_API_KEY',
    nativeSupport: true,
    requiresTransformation: false,
    displayName: 'Volcano Engine',
  },
  byteplus: {
    // BytePlus (国际)
    openclawProviderId: 'byteplus',
    modelFormat: 'byteplus/{model}',
    apiType: 'openai-completions',
    envVar: 'BYTEPLUS_API_KEY',
    nativeSupport: true,
    requiresTransformation: false,
    displayName: 'BytePlus (International)',
  },

  // ============ 需要 Proxy 支持（OpenClaw 无原生支持） ============
  dashscope: {
    useProxy: true, // 阿里云百炼
  },
  baichuan: {
    useProxy: true, // 百川
  },
  stepfun: {
    useProxy: true, // 阶跃星辰
  },
  qwen: {
    useProxy: true, // 通义千问（非 portal）
  },
  siliconflow: {
    useProxy: true, // SiliconFlow
  },
  minimax: {
    useProxy: true, // MiniMax (需要 Anthropic 兼容配置)
  },
  custom: {
    useProxy: true, // 自定义 Provider
  },
};

/**
 * Provider ID 规范化映射
 * 处理 OpenClaw 中的 provider 别名
 */
export const OPENCLAW_PROVIDER_NORMALIZATION: Record<string, string> = {
  'z.ai': 'zai',
  'z-ai': 'zai',
  'opencode-zen': 'opencode',
  'qwen': 'qwen-portal',
  'kimi-code': 'kimi-coding',
};

/**
 * 获取原生 Provider 配置
 */
export function getOpenclawNativeProvider(
  vendor: string,
): OpenclawNativeProviderConfig | null {
  const config = OPENCLAW_NATIVE_PROVIDERS[vendor];
  if (!config || 'useProxy' in config) {
    return null;
  }
  return config;
}

/**
 * 检查 vendor 是否支持 OpenClaw 原生模式
 */
export function isOpenclawNativeSupported(vendor: string): boolean {
  const config = OPENCLAW_NATIVE_PROVIDERS[vendor];
  return config != null && !('useProxy' in config);
}

/**
 * 构建模型引用字符串
 */
export function buildModelRef(vendor: string, modelId: string): string {
  const nativeConfig = getOpenclawNativeProvider(vendor);
  if (nativeConfig) {
    return nativeConfig.modelFormat.replace('{model}', modelId);
  }
  // 非 Native 模式，使用 openai provider 通过 proxy
  return `openai/${modelId}`;
}

/**
 * 模型 Fallback Chain 配置
 * 定义当主模型不可用时的 fallback 顺序
 */
export const MODEL_FALLBACK_CHAINS: Record<string, string[]> & {
  default: string[];
} = {
  // GLM 系列
  'glm-5': ['anthropic/claude-opus-4-5', 'deepseek/deepseek-chat'],
  'glm-4.7': ['anthropic/claude-sonnet-4-5', 'deepseek/deepseek-chat'],
  'glm-4.5': ['openai/gpt-4o-mini', 'deepseek/deepseek-chat'],

  // Claude 系列
  'claude-opus-4-5': ['zai/glm-5', 'openai/gpt-4o'],
  'claude-opus-4-6': ['zai/glm-5', 'openai/gpt-4o'],
  'claude-sonnet-4-5': ['openai/gpt-4o', 'deepseek/deepseek-chat'],
  'claude-sonnet-4-6': ['openai/gpt-4o', 'deepseek/deepseek-chat'],

  // GPT 系列
  'gpt-4o': ['anthropic/claude-sonnet-4-5', 'zai/glm-4.7'],
  'gpt-4o-mini': ['deepseek/deepseek-chat', 'zai/glm-4.5-flash'],
  'gpt-4.1': ['anthropic/claude-sonnet-4-6', 'zai/glm-5'],
  'gpt-5.2': ['anthropic/claude-opus-4-6', 'zai/glm-5'],

  // DeepSeek 系列
  'deepseek-chat': ['zai/glm-4.7', 'openai/gpt-4o-mini'],
  'deepseek-reasoner': ['anthropic/claude-opus-4-6', 'zai/glm-5'],

  // Gemini 系列
  'gemini-2.5-pro': ['anthropic/claude-sonnet-4-6', 'openai/gpt-4o'],
  'gemini-2.5-flash': ['openai/gpt-4o-mini', 'deepseek/deepseek-chat'],

  // 默认
  default: ['anthropic/claude-sonnet-4-5', 'openai/gpt-4o-mini'],
};

/**
 * 获取模型的 Fallback Chain
 */
export function getFallbackChain(modelId: string): string[] {
  // 精确匹配
  if (MODEL_FALLBACK_CHAINS[modelId]) {
    return MODEL_FALLBACK_CHAINS[modelId];
  }

  // 模糊匹配（处理带前缀的模型名）
  const normalizedModel = modelId.toLowerCase();
  for (const [key, value] of Object.entries(MODEL_FALLBACK_CHAINS)) {
    if (normalizedModel.includes(key.toLowerCase())) {
      return value;
    }
  }

  // 返回默认
  return MODEL_FALLBACK_CHAINS.default;
}
