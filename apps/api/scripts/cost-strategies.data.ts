/**
 * 成本策略种子数据
 * 定义成本优化策略，用于模型选择决策
 * 最后更新：2026-02-10
 */

export interface CostStrategyData {
  strategyId: string;
  name: string;
  description?: string;
  costWeight: number;
  performanceWeight: number;
  capabilityWeight: number;
  maxCostPerRequest?: number;
  maxLatencyMs?: number;
  minCapabilityScore?: number;
  scenarioWeights?: {
    reasoning?: number;
    coding?: number;
    creativity?: number;
    speed?: number;
    chinese?: number;
    multimodal?: number;
    longContext?: number;
  };
  /** 推荐模型列表，按优先级排序 */
  recommendedModels?: string[];
  /** 适用的能力标签 */
  applicableTags?: string[];
  isBuiltin: boolean;
}

export const COST_STRATEGIES_DATA: CostStrategyData[] = [
  {
    strategyId: 'lowest-cost',
    name: '最低成本',
    description: '优先选择成本最低的模型，适合预算有限或简单任务场景',
    costWeight: 0.8,
    performanceWeight: 0.1,
    capabilityWeight: 0.1,
    maxCostPerRequest: 0.01,
    scenarioWeights: {
      reasoning: 0.2,
      coding: 0.2,
      creativity: 0.2,
      speed: 0.6,
    },
    recommendedModels: [
      'deepseek-v3-2-251201',
      'qwen-plus-latest',
      'doubao-1-5-pro-32k-250115',
      'glm-4-flash',
      'moonshot-v1-8k',
    ],
    applicableTags: ['cost-optimized', 'fast-response'],
    isBuiltin: true,
  },
  {
    strategyId: 'best-value',
    name: '最佳性价比',
    description: '在成本和能力之间取得最佳平衡，推荐大多数场景使用',
    costWeight: 0.5,
    performanceWeight: 0.2,
    capabilityWeight: 0.3,
    scenarioWeights: {
      reasoning: 0.4,
      coding: 0.4,
      creativity: 0.3,
      speed: 0.4,
    },
    recommendedModels: [
      'deepseek-v3-2-251201',
      'qwen-max-latest',
      'doubao-1.5-pro-256k-250115',
      'kimi-k2',
      'glm-4.5-flash',
    ],
    applicableTags: ['cost-optimized', 'general-purpose'],
    isBuiltin: true,
  },
  {
    strategyId: 'performance-first',
    name: '性能优先',
    description: '优先选择能力最强的模型，不考虑成本，适合关键任务',
    costWeight: 0.1,
    performanceWeight: 0.3,
    capabilityWeight: 0.6,
    minCapabilityScore: 85,
    scenarioWeights: {
      reasoning: 0.8,
      coding: 0.7,
      creativity: 0.5,
      speed: 0.3,
    },
    recommendedModels: [
      'claude-opus-4-5-20251101',
      'gpt-4.5-preview',
      'gemini-2.5-pro',
      'o3-mini',
      'deepseek-r1',
    ],
    applicableTags: ['premium', 'deep-reasoning'],
    isBuiltin: true,
  },
  {
    strategyId: 'balanced',
    name: '均衡策略',
    description: '综合考虑成本、性能和能力，适合一般业务场景',
    costWeight: 0.4,
    performanceWeight: 0.3,
    capabilityWeight: 0.3,
    scenarioWeights: {
      reasoning: 0.5,
      coding: 0.5,
      creativity: 0.4,
      speed: 0.5,
    },
    recommendedModels: [
      'gpt-4o',
      'claude-sonnet-4-20250514',
      'qwen-max-latest',
      'deepseek-v3-2-251201',
      'doubao-1.5-pro-256k-250115',
    ],
    applicableTags: ['general-purpose'],
    isBuiltin: true,
  },
  {
    strategyId: 'speed-first',
    name: '速度优先',
    description: '优先选择响应速度最快的模型，适合实时交互场景',
    costWeight: 0.3,
    performanceWeight: 0.5,
    capabilityWeight: 0.2,
    maxLatencyMs: 5000,
    scenarioWeights: {
      reasoning: 0.3,
      coding: 0.3,
      creativity: 0.2,
      speed: 0.9,
    },
    recommendedModels: [
      'gpt-4o-mini',
      'claude-haiku-3-5-20241022',
      'glm-4-flash',
      'moonshot-v1-8k',
      'qwen-turbo-latest',
    ],
    applicableTags: ['fast-response', 'fast-reasoning'],
    isBuiltin: true,
  },
  {
    strategyId: 'reasoning-optimized',
    name: '推理优化',
    description: '优先选择推理能力强的模型，适合复杂分析任务',
    costWeight: 0.2,
    performanceWeight: 0.3,
    capabilityWeight: 0.5,
    minCapabilityScore: 90,
    scenarioWeights: {
      reasoning: 0.9,
      coding: 0.6,
      creativity: 0.4,
      speed: 0.2,
    },
    recommendedModels: [
      'o3-mini',
      'deepseek-r1',
      'qwen-qwq-plus',
      'gemini-2.5-pro',
      'claude-opus-4-5-20251101',
    ],
    applicableTags: ['deep-reasoning', 'premium'],
    isBuiltin: true,
  },
  {
    strategyId: 'coding-optimized',
    name: '编程优化',
    description: '优先选择代码能力强的模型，适合开发任务',
    costWeight: 0.3,
    performanceWeight: 0.3,
    capabilityWeight: 0.4,
    minCapabilityScore: 88,
    scenarioWeights: {
      reasoning: 0.6,
      coding: 0.9,
      creativity: 0.3,
      speed: 0.4,
    },
    recommendedModels: [
      'claude-sonnet-4-20250514',
      'deepseek-v3-2-251201',
      'kimi-k2',
      'qwen-coder-plus-latest',
      'gpt-4o',
    ],
    applicableTags: ['coding', 'agent-capable'],
    isBuiltin: true,
  },
  {
    strategyId: 'creative-optimized',
    name: '创意优化',
    description: '优先选择创造力强的模型，适合内容创作任务',
    costWeight: 0.3,
    performanceWeight: 0.2,
    capabilityWeight: 0.5,
    scenarioWeights: {
      reasoning: 0.4,
      coding: 0.3,
      creativity: 0.9,
      speed: 0.3,
    },
    recommendedModels: [
      'claude-opus-4-5-20251101',
      'gpt-4.5-preview',
      'gemini-2.5-pro',
      'qwen-max-latest',
      'doubao-1.5-pro-256k-250115',
    ],
    applicableTags: ['creative', 'premium'],
    isBuiltin: true,
  },
  {
    strategyId: 'enterprise',
    name: '企业级',
    description: '企业级策略，平衡成本控制与服务质量',
    costWeight: 0.35,
    performanceWeight: 0.35,
    capabilityWeight: 0.3,
    maxCostPerRequest: 0.1,
    minCapabilityScore: 80,
    scenarioWeights: {
      reasoning: 0.5,
      coding: 0.5,
      creativity: 0.4,
      speed: 0.5,
    },
    recommendedModels: [
      'gpt-4o',
      'claude-sonnet-4-20250514',
      'qwen-max-latest',
      'deepseek-v3-2-251201',
      'glm-4.5-flash',
    ],
    applicableTags: ['general-purpose', 'agent-capable'],
    isBuiltin: true,
  },
  {
    strategyId: 'chinese-optimized',
    name: '中文优化',
    description: '优先选择中文能力强的模型，适合中文内容处理场景',
    costWeight: 0.4,
    performanceWeight: 0.2,
    capabilityWeight: 0.4,
    scenarioWeights: {
      reasoning: 0.5,
      coding: 0.4,
      creativity: 0.6,
      speed: 0.4,
      chinese: 0.9,
    },
    recommendedModels: [
      'deepseek-v3-2-251201',
      'qwen-max-latest',
      'doubao-1.5-pro-256k-250115',
      'kimi-k2',
      'glm-4.5-flash',
      'moonshot-v1-auto',
    ],
    applicableTags: ['chinese-optimized', 'cost-optimized'],
    isBuiltin: true,
  },
  {
    strategyId: 'multimodal-optimized',
    name: '多模态优化',
    description: '优先选择多模态能力强的模型，适合图像、视频、音频处理场景',
    costWeight: 0.3,
    performanceWeight: 0.3,
    capabilityWeight: 0.4,
    scenarioWeights: {
      reasoning: 0.4,
      coding: 0.3,
      creativity: 0.6,
      speed: 0.3,
      multimodal: 0.9,
    },
    recommendedModels: [
      'gpt-4o',
      'gemini-2.5-pro',
      'claude-sonnet-4-20250514',
      'qwen-vl-max-latest',
      'doubao-vision-pro-32k',
    ],
    applicableTags: ['vision', 'multimodal'],
    isBuiltin: true,
  },
  {
    strategyId: 'long-context-optimized',
    name: '长上下文优化',
    description: '优先选择支持长上下文的模型，适合长文档处理场景',
    costWeight: 0.4,
    performanceWeight: 0.2,
    capabilityWeight: 0.4,
    scenarioWeights: {
      reasoning: 0.5,
      coding: 0.4,
      creativity: 0.4,
      speed: 0.3,
      longContext: 0.9,
    },
    recommendedModels: [
      'gemini-2.5-pro',
      'claude-sonnet-4-20250514',
      'qwen-long',
      'doubao-1.5-pro-256k-250115',
      'moonshot-v1-128k',
      'kimi-k2',
    ],
    applicableTags: ['long-context'],
    isBuiltin: true,
  },
  {
    strategyId: 'agent-optimized',
    name: 'Agent优化',
    description: '优先选择适合Agent场景的模型，支持工具调用和复杂任务编排',
    costWeight: 0.3,
    performanceWeight: 0.3,
    capabilityWeight: 0.4,
    minCapabilityScore: 85,
    scenarioWeights: {
      reasoning: 0.7,
      coding: 0.7,
      creativity: 0.4,
      speed: 0.5,
    },
    recommendedModels: [
      'claude-sonnet-4-20250514',
      'gpt-4o',
      'kimi-k2',
      'deepseek-v3-2-251201',
      'qwen-max-latest',
    ],
    applicableTags: ['agent-capable', 'function-calling'],
    isBuiltin: true,
  },
];
