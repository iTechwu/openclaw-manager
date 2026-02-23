/**
 * Fallback 链种子数据
 * 定义模型降级策略，支持多模型故障转移
 * 最后更新：2026-02-14
 */

export interface FallbackChainModel {
  vendor: string;
  model: string;
  protocol: 'openai-compatible' | 'anthropic-native';
  features?: {
    extendedThinking?: boolean;
    cacheControl?: boolean;
  };
}

export interface FallbackChainData {
  chainId: string;
  name: string;
  description?: string;
  models: FallbackChainModel[];
  triggerStatusCodes: number[];
  triggerErrorTypes: string[];
  triggerTimeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  preserveProtocol: boolean;
  isBuiltin: boolean;
}

export const FALLBACK_CHAINS_DATA: FallbackChainData[] = [
  {
    chainId: 'default',
    name: '默认 Fallback 链',
    description: '通用场景的模型降级策略，平衡性能与成本，GLM-5 优先',
    models: [
      {
        vendor: 'zhipu',
        model: 'glm-5',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'anthropic',
        model: 'claude-opus-4-6',
        protocol: 'anthropic-native',
      },
      {
        vendor: 'deepseek',
        model: 'deepseek-v3-2-251201',
        protocol: 'openai-compatible',
      },
      { vendor: 'openai', model: 'gpt-5.2', protocol: 'openai-compatible' },
      { vendor: 'openai', model: 'gpt-4o', protocol: 'openai-compatible' },
      {
        vendor: 'google',
        model: 'gemini-2.5-flash',
        protocol: 'openai-compatible',
      },
    ],
    triggerStatusCodes: [429, 500, 502, 503, 504],
    triggerErrorTypes: [
      'rate_limit',
      'overloaded',
      'timeout',
      'connection_error',
      'connection_refused',
    ],
    triggerTimeoutMs: 60000,
    maxRetries: 3,
    retryDelayMs: 2000,
    preserveProtocol: false,
    isBuiltin: true,
  },
  {
    chainId: 'deep-reasoning',
    name: '深度推理 Fallback 链',
    description: '深度推理任务的模型降级策略，GLM-5 优先，支持扩展思考',
    models: [
      {
        vendor: 'zhipu',
        model: 'glm-5',
        protocol: 'openai-compatible',
        features: { extendedThinking: true },
      },
      {
        vendor: 'anthropic',
        model: 'claude-opus-4-6',
        protocol: 'anthropic-native',
        features: { extendedThinking: true },
      },
      {
        vendor: 'deepseek',
        model: 'deepseek-v3-2-251201',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'anthropic',
        model: 'claude-opus-4-5-20251101',
        protocol: 'anthropic-native',
        features: { extendedThinking: true },
      },
      { vendor: 'openai', model: 'o3', protocol: 'openai-compatible' },
      { vendor: 'openai', model: 'gpt-5.2-pro', protocol: 'openai-compatible' },
      {
        vendor: 'deepseek',
        model: 'deepseek-r1',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'xai',
        model: 'grok-3-reasoner-r',
        protocol: 'openai-compatible',
      },
      { vendor: 'xai', model: 'grok-4', protocol: 'openai-compatible' },
      {
        vendor: 'doubao',
        model: 'doubao-seed-1.6-thinking',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'dashscope',
        model: 'qwen-3.0-thinking',
        protocol: 'openai-compatible',
      },
    ],
    triggerStatusCodes: [429, 500, 502, 503, 504],
    triggerErrorTypes: [
      'rate_limit',
      'overloaded',
      'timeout',
      'connection_error',
      'connection_refused',
    ],
    triggerTimeoutMs: 120000,
    maxRetries: 3,
    retryDelayMs: 3000,
    preserveProtocol: false,
    isBuiltin: true,
  },
  {
    chainId: 'cost-optimized',
    name: '成本优化 Fallback 链',
    description: '优先使用低成本高性价比模型',
    models: [
      {
        vendor: 'deepseek',
        model: 'deepseek-v3-2-251201',
        protocol: 'openai-compatible',
      },
      { vendor: 'openai', model: 'gpt-4o-mini', protocol: 'openai-compatible' },
      {
        vendor: 'google',
        model: 'gemini-3-flash-preview',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'google',
        model: 'gemini-2.5-flash',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'doubao',
        model: 'doubao-seed-1-6-flash',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'doubao',
        model: 'doubao-1.5-lite',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'anthropic',
        model: 'claude-haiku-4-5-20251001',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'zhipu',
        model: 'glm-4.5-air',
        protocol: 'openai-compatible',
      },
    ],
    triggerStatusCodes: [429, 500, 502, 503, 504],
    triggerErrorTypes: [
      'rate_limit',
      'overloaded',
      'timeout',
      'connection_error',
      'connection_refused',
    ],
    triggerTimeoutMs: 30000,
    maxRetries: 3,
    retryDelayMs: 1000,
    preserveProtocol: true,
    isBuiltin: true,
  },
  {
    chainId: 'fast-response',
    name: '快速响应 Fallback 链',
    description: '优先使用响应速度快的模型，GLM-5 优先',
    models: [
      {
        vendor: 'zhipu',
        model: 'glm-5',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'anthropic',
        model: 'claude-opus-4-6',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'deepseek',
        model: 'deepseek-v3-2-251201',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'google',
        model: 'gemini-3-flash-preview',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'anthropic',
        model: 'claude-haiku-4-5-20251001',
        protocol: 'openai-compatible',
      },
      { vendor: 'openai', model: 'gpt-4o-mini', protocol: 'openai-compatible' },
      {
        vendor: 'openai',
        model: 'gpt-5-nano',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'openai',
        model: 'gpt-4.1-nano',
        protocol: 'openai-compatible',
      },
      { vendor: 'xai', model: 'grok-3-mini', protocol: 'openai-compatible' },
      {
        vendor: 'zhipu',
        model: 'glm-4.5-flash',
        protocol: 'openai-compatible',
      },
    ],
    triggerStatusCodes: [429, 500, 502, 503, 504],
    triggerErrorTypes: [
      'rate_limit',
      'overloaded',
      'timeout',
      'connection_error',
      'connection_refused',
    ],
    triggerTimeoutMs: 15000,
    maxRetries: 2,
    retryDelayMs: 500,
    preserveProtocol: true,
    isBuiltin: true,
  },
  {
    chainId: 'coding',
    name: '编程任务 Fallback 链',
    description: '编程任务专用，GLM-5 优先，代码能力强',
    models: [
      {
        vendor: 'zhipu',
        model: 'glm-5',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'anthropic',
        model: 'claude-opus-4-6',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'deepseek',
        model: 'deepseek-v3-2-251201',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'openai',
        model: 'gpt-5.2-codex',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'openai',
        model: 'gpt-5.1-codex',
        protocol: 'openai-compatible',
      },
      { vendor: 'openai', model: 'o4-mini', protocol: 'openai-compatible' },
      {
        vendor: 'xai',
        model: 'grok-code-fast-1',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'dashscope',
        model: 'qwen-3.0',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'moonshot',
        model: 'kimi-k2',
        protocol: 'openai-compatible',
      },
    ],
    triggerStatusCodes: [429, 500, 502, 503, 504],
    triggerErrorTypes: [
      'rate_limit',
      'overloaded',
      'timeout',
      'connection_error',
      'connection_refused',
    ],
    triggerTimeoutMs: 90000,
    maxRetries: 3,
    retryDelayMs: 2000,
    preserveProtocol: true,
    isBuiltin: true,
  },
  {
    chainId: 'vision',
    name: '视觉理解 Fallback 链',
    description: '多模态视觉任务专用，GLM-5 优先',
    models: [
      {
        vendor: 'zhipu',
        model: 'glm-5',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'anthropic',
        model: 'claude-opus-4-6',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'deepseek',
        model: 'deepseek-v3-2-251201',
        protocol: 'openai-compatible',
      },
      { vendor: 'openai', model: 'gpt-5.2', protocol: 'openai-compatible' },
      { vendor: 'openai', model: 'gpt-4o', protocol: 'openai-compatible' },
      {
        vendor: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'google',
        model: 'gemini-3-pro-preview',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'google',
        model: 'gemini-2.5-pro',
        protocol: 'openai-compatible',
      },
      { vendor: 'xai', model: 'grok-4', protocol: 'openai-compatible' },
      {
        vendor: 'doubao',
        model: 'doubao-1.5-vision-pro-32k',
        protocol: 'openai-compatible',
      },
    ],
    triggerStatusCodes: [429, 500, 502, 503, 504],
    triggerErrorTypes: [
      'rate_limit',
      'overloaded',
      'timeout',
      'connection_error',
      'connection_refused',
    ],
    triggerTimeoutMs: 60000,
    maxRetries: 3,
    retryDelayMs: 2000,
    preserveProtocol: true,
    isBuiltin: true,
  },
  {
    chainId: 'long-context',
    name: '长上下文 Fallback 链',
    description: '处理超长文档的模型降级策略，GLM-5 优先',
    models: [
      {
        vendor: 'zhipu',
        model: 'glm-5',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'anthropic',
        model: 'claude-opus-4-6',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'deepseek',
        model: 'deepseek-v3-2-251201',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'google',
        model: 'gemini-3-pro-preview',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'google',
        model: 'gemini-2.5-pro',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'anthropic',
        model: 'claude-opus-4-5-20251101',
        protocol: 'openai-compatible',
      },
      { vendor: 'openai', model: 'gpt-5.2', protocol: 'openai-compatible' },
      { vendor: 'xai', model: 'grok-4', protocol: 'openai-compatible' },
      {
        vendor: 'doubao',
        model: 'doubao-1.5-pro-256k',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'dashscope',
        model: 'qwen-long',
        protocol: 'openai-compatible',
      },
    ],
    triggerStatusCodes: [429, 500, 502, 503, 504],
    triggerErrorTypes: [
      'rate_limit',
      'overloaded',
      'timeout',
      'context_length_exceeded',
      'connection_error',
      'connection_refused',
    ],
    triggerTimeoutMs: 180000,
    maxRetries: 2,
    retryDelayMs: 5000,
    preserveProtocol: true,
    isBuiltin: true,
  },
  {
    chainId: 'image-generation',
    name: '图像生成 Fallback 链',
    description: '图像生成任务的模型降级策略',
    models: [
      {
        vendor: 'midjourney',
        model: 'Midjourney',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'openai',
        model: 'gpt-image-1.5-plus',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'openai',
        model: 'gpt-image-1.5',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'flux',
        model: 'flux-kontext-max',
        protocol: 'openai-compatible',
      },
      { vendor: 'xai', model: 'grok-4-image', protocol: 'openai-compatible' },
      {
        vendor: 'ideogram',
        model: 'ideogram-generate-v3',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'doubao',
        model: 'doubao-seedream-4-5-251128',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'doubao',
        model: 'doubao-seedream-3.0-t2i',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'google',
        model: 'gemini-3-pro-image-preview',
        protocol: 'openai-compatible',
      },
    ],
    triggerStatusCodes: [429, 500, 502, 503, 504],
    triggerErrorTypes: [
      'rate_limit',
      'overloaded',
      'timeout',
      'connection_error',
      'connection_refused',
    ],
    triggerTimeoutMs: 120000,
    maxRetries: 2,
    retryDelayMs: 3000,
    preserveProtocol: true,
    isBuiltin: true,
  },
  {
    chainId: 'video-generation',
    name: '视频生成 Fallback 链',
    description: '视频生成任务的模型降级策略',
    models: [
      { vendor: 'openai', model: 'sora-2-pro', protocol: 'openai-compatible' },
      { vendor: 'google', model: 'veo3.1-pro', protocol: 'openai-compatible' },
      {
        vendor: 'kling',
        model: 'kling-video-o1-pro',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'minimax',
        model: 'hailuo-2.3-pro',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'doubao',
        model: 'doubao-seedance-1-0-pro',
        protocol: 'openai-compatible',
      },
      { vendor: 'vidu', model: 'viduq3-pro', protocol: 'openai-compatible' },
      { vendor: 'alibaba', model: 'wan2.1-14b', protocol: 'openai-compatible' },
    ],
    triggerStatusCodes: [429, 500, 502, 503, 504],
    triggerErrorTypes: [
      'rate_limit',
      'overloaded',
      'timeout',
      'connection_error',
      'connection_refused',
    ],
    triggerTimeoutMs: 300000,
    maxRetries: 2,
    retryDelayMs: 5000,
    preserveProtocol: true,
    isBuiltin: true,
  },
  {
    chainId: 'chinese-optimized',
    name: '中文优化 Fallback 链',
    description: '中文任务优化，GLM-5 优先，中文能力强',
    models: [
      {
        vendor: 'zhipu',
        model: 'glm-5',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'anthropic',
        model: 'claude-opus-4-6',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'deepseek',
        model: 'deepseek-v3-2-251201',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'doubao',
        model: 'doubao-seed-1-6-251015',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'doubao',
        model: 'doubao-1.5-pro-256k-250115',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'dashscope',
        model: 'qwen-max-latest',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'dashscope',
        model: 'qwen-3.0',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'moonshot',
        model: 'kimi-k2',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'zhipu',
        model: 'glm-4.5',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'zhipu',
        model: 'glm-4.5-flash',
        protocol: 'openai-compatible',
      },
    ],
    triggerStatusCodes: [429, 500, 502, 503, 504],
    triggerErrorTypes: [
      'rate_limit',
      'overloaded',
      'timeout',
      'connection_error',
      'connection_refused',
    ],
    triggerTimeoutMs: 60000,
    maxRetries: 3,
    retryDelayMs: 2000,
    preserveProtocol: true,
    isBuiltin: true,
  },
  {
    chainId: 'agent-optimized',
    name: 'Agent 任务 Fallback 链',
    description: 'Agent 任务专用，GLM-5 优先，工具调用能力强',
    models: [
      {
        vendor: 'zhipu',
        model: 'glm-5',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'anthropic',
        model: 'claude-opus-4-6',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'deepseek',
        model: 'deepseek-v3-2-251201',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        protocol: 'openai-compatible',
      },
      { vendor: 'openai', model: 'gpt-4o', protocol: 'openai-compatible' },
      { vendor: 'openai', model: 'gpt-4.1', protocol: 'openai-compatible' },
      {
        vendor: 'moonshot',
        model: 'kimi-k2',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'dashscope',
        model: 'qwen-max-latest',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'google',
        model: 'gemini-2.5-pro',
        protocol: 'openai-compatible',
      },
    ],
    triggerStatusCodes: [429, 500, 502, 503, 504],
    triggerErrorTypes: [
      'rate_limit',
      'overloaded',
      'timeout',
      'tool_error',
      'connection_error',
      'connection_refused',
    ],
    triggerTimeoutMs: 90000,
    maxRetries: 3,
    retryDelayMs: 2000,
    preserveProtocol: true,
    isBuiltin: true,
  },
  {
    chainId: 'creative',
    name: '创意写作 Fallback 链',
    description: '创意写作任务专用，GLM-5 优先，创造力强',
    models: [
      {
        vendor: 'zhipu',
        model: 'glm-5',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'anthropic',
        model: 'claude-opus-4-6',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'deepseek',
        model: 'deepseek-v3-2-251201',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'anthropic',
        model: 'claude-opus-4-5-20251101',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'openai',
        model: 'gpt-4.5-preview',
        protocol: 'openai-compatible',
      },
      { vendor: 'openai', model: 'gpt-5.2-pro', protocol: 'openai-compatible' },
      {
        vendor: 'google',
        model: 'gemini-2.5-pro',
        protocol: 'openai-compatible',
      },
      { vendor: 'xai', model: 'grok-4', protocol: 'openai-compatible' },
      {
        vendor: 'dashscope',
        model: 'qwen-max-latest',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'doubao',
        model: 'doubao-1.5-character-pro-32k',
        protocol: 'openai-compatible',
      },
    ],
    triggerStatusCodes: [429, 500, 502, 503, 504],
    triggerErrorTypes: [
      'rate_limit',
      'overloaded',
      'timeout',
      'connection_error',
      'connection_refused',
    ],
    triggerTimeoutMs: 90000,
    maxRetries: 3,
    retryDelayMs: 2000,
    preserveProtocol: true,
    isBuiltin: true,
  },
  {
    chainId: 'multimodal',
    name: '多模态 Fallback 链',
    description: '多模态任务专用，GLM-5 优先，支持图像、音频等多种输入',
    models: [
      {
        vendor: 'zhipu',
        model: 'glm-5',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'anthropic',
        model: 'claude-opus-4-6',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'deepseek',
        model: 'deepseek-v3-2-251201',
        protocol: 'openai-compatible',
      },
      { vendor: 'openai', model: 'gpt-4o', protocol: 'openai-compatible' },
      { vendor: 'openai', model: 'gpt-4.1', protocol: 'openai-compatible' },
      {
        vendor: 'google',
        model: 'gemini-2.5-pro',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'dashscope',
        model: 'qwen-vl-max-latest',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'dashscope',
        model: 'qvq-max',
        protocol: 'openai-compatible',
      },
      {
        vendor: 'doubao',
        model: 'doubao-1.5-vision-pro-32k',
        protocol: 'openai-compatible',
      },
    ],
    triggerStatusCodes: [429, 500, 502, 503, 504],
    triggerErrorTypes: [
      'rate_limit',
      'overloaded',
      'timeout',
      'connection_error',
      'connection_refused',
    ],
    triggerTimeoutMs: 60000,
    maxRetries: 3,
    retryDelayMs: 2000,
    preserveProtocol: true,
    isBuiltin: true,
  },
];
