/**
 * AI 模型定价数据
 * 价格单位：美元/百万 tokens
 * 数据来源：各 AI 服务商官方定价页面
 * 最后更新：2026-02-09
 */

export interface ModelPricingData {
  model: string;
  vendor: string;
  inputPrice: number;
  outputPrice: number;
  displayName?: string;
  notes?: string;
}

export const MODEL_PRICING_DATA: ModelPricingData[] = [
  // ============================================================================
  // OpenAI Models
  // https://openai.com/api/pricing/
  // ============================================================================
  {
    model: 'gpt-4o',
    vendor: 'openai',
    inputPrice: 2.5,
    outputPrice: 10,
    displayName: 'GPT-4o',
    notes: 'OpenAI flagship model',
  },
  {
    model: 'gpt-4o-2024-11-20',
    vendor: 'openai',
    inputPrice: 2.5,
    outputPrice: 10,
    displayName: 'GPT-4o (2024-11-20)',
  },
  {
    model: 'gpt-4o-2024-08-06',
    vendor: 'openai',
    inputPrice: 2.5,
    outputPrice: 10,
    displayName: 'GPT-4o (2024-08-06)',
  },
  {
    model: 'gpt-4o-2024-05-13',
    vendor: 'openai',
    inputPrice: 5,
    outputPrice: 15,
    displayName: 'GPT-4o (2024-05-13)',
  },
  {
    model: 'gpt-4o-mini',
    vendor: 'openai',
    inputPrice: 0.15,
    outputPrice: 0.6,
    displayName: 'GPT-4o Mini',
    notes: 'Cost-effective small model',
  },
  {
    model: 'gpt-4o-mini-2024-07-18',
    vendor: 'openai',
    inputPrice: 0.15,
    outputPrice: 0.6,
    displayName: 'GPT-4o Mini (2024-07-18)',
  },
  {
    model: 'gpt-4-turbo',
    vendor: 'openai',
    inputPrice: 10,
    outputPrice: 30,
    displayName: 'GPT-4 Turbo',
  },
  {
    model: 'gpt-4-turbo-2024-04-09',
    vendor: 'openai',
    inputPrice: 10,
    outputPrice: 30,
    displayName: 'GPT-4 Turbo (2024-04-09)',
  },
  {
    model: 'gpt-4',
    vendor: 'openai',
    inputPrice: 30,
    outputPrice: 60,
    displayName: 'GPT-4',
  },
  {
    model: 'gpt-4-0613',
    vendor: 'openai',
    inputPrice: 30,
    outputPrice: 60,
    displayName: 'GPT-4 (0613)',
  },
  {
    model: 'gpt-3.5-turbo',
    vendor: 'openai',
    inputPrice: 0.5,
    outputPrice: 1.5,
    displayName: 'GPT-3.5 Turbo',
  },
  {
    model: 'gpt-3.5-turbo-0125',
    vendor: 'openai',
    inputPrice: 0.5,
    outputPrice: 1.5,
    displayName: 'GPT-3.5 Turbo (0125)',
  },
  {
    model: 'o1',
    vendor: 'openai',
    inputPrice: 15,
    outputPrice: 60,
    displayName: 'o1',
    notes: 'OpenAI reasoning model',
  },
  {
    model: 'o1-2024-12-17',
    vendor: 'openai',
    inputPrice: 15,
    outputPrice: 60,
    displayName: 'o1 (2024-12-17)',
  },
  {
    model: 'o1-preview',
    vendor: 'openai',
    inputPrice: 15,
    outputPrice: 60,
    displayName: 'o1 Preview',
  },
  {
    model: 'o1-mini',
    vendor: 'openai',
    inputPrice: 3,
    outputPrice: 12,
    displayName: 'o1 Mini',
  },
  {
    model: 'o1-mini-2024-09-12',
    vendor: 'openai',
    inputPrice: 3,
    outputPrice: 12,
    displayName: 'o1 Mini (2024-09-12)',
  },
  {
    model: 'o3-mini',
    vendor: 'openai',
    inputPrice: 1.1,
    outputPrice: 4.4,
    displayName: 'o3 Mini',
    notes: 'OpenAI latest reasoning model',
  },

  // ============================================================================
  // Anthropic Models
  // https://www.anthropic.com/pricing
  // ============================================================================
  {
    model: 'claude-3-5-sonnet-20241022',
    vendor: 'anthropic',
    inputPrice: 3,
    outputPrice: 15,
    displayName: 'Claude 3.5 Sonnet (2024-10-22)',
    notes: 'Latest Claude 3.5 Sonnet',
  },
  {
    model: 'claude-3-5-sonnet-20240620',
    vendor: 'anthropic',
    inputPrice: 3,
    outputPrice: 15,
    displayName: 'Claude 3.5 Sonnet (2024-06-20)',
  },
  {
    model: 'claude-3-5-sonnet',
    vendor: 'anthropic',
    inputPrice: 3,
    outputPrice: 15,
    displayName: 'Claude 3.5 Sonnet',
  },
  {
    model: 'claude-3-5-haiku-20241022',
    vendor: 'anthropic',
    inputPrice: 0.8,
    outputPrice: 4,
    displayName: 'Claude 3.5 Haiku (2024-10-22)',
  },
  {
    model: 'claude-3-5-haiku',
    vendor: 'anthropic',
    inputPrice: 0.8,
    outputPrice: 4,
    displayName: 'Claude 3.5 Haiku',
  },
  {
    model: 'claude-3-opus-20240229',
    vendor: 'anthropic',
    inputPrice: 15,
    outputPrice: 75,
    displayName: 'Claude 3 Opus',
  },
  {
    model: 'claude-3-opus',
    vendor: 'anthropic',
    inputPrice: 15,
    outputPrice: 75,
    displayName: 'Claude 3 Opus',
  },
  {
    model: 'claude-3-sonnet-20240229',
    vendor: 'anthropic',
    inputPrice: 3,
    outputPrice: 15,
    displayName: 'Claude 3 Sonnet',
  },
  {
    model: 'claude-3-sonnet',
    vendor: 'anthropic',
    inputPrice: 3,
    outputPrice: 15,
    displayName: 'Claude 3 Sonnet',
  },
  {
    model: 'claude-3-haiku-20240307',
    vendor: 'anthropic',
    inputPrice: 0.25,
    outputPrice: 1.25,
    displayName: 'Claude 3 Haiku',
  },
  {
    model: 'claude-3-haiku',
    vendor: 'anthropic',
    inputPrice: 0.25,
    outputPrice: 1.25,
    displayName: 'Claude 3 Haiku',
  },

  // ============================================================================
  // DeepSeek Models
  // https://platform.deepseek.com/api-docs/pricing
  // ============================================================================
  {
    model: 'deepseek-chat',
    vendor: 'deepseek',
    inputPrice: 0.14,
    outputPrice: 0.28,
    displayName: 'DeepSeek Chat',
    notes: 'DeepSeek V3',
  },
  {
    model: 'deepseek-coder',
    vendor: 'deepseek',
    inputPrice: 0.14,
    outputPrice: 0.28,
    displayName: 'DeepSeek Coder',
  },
  {
    model: 'deepseek-reasoner',
    vendor: 'deepseek',
    inputPrice: 0.55,
    outputPrice: 2.19,
    displayName: 'DeepSeek Reasoner',
    notes: 'DeepSeek R1',
  },

  // ============================================================================
  // Google Models
  // https://ai.google.dev/pricing
  // ============================================================================
  {
    model: 'gemini-2.0-flash-exp',
    vendor: 'google',
    inputPrice: 0,
    outputPrice: 0,
    displayName: 'Gemini 2.0 Flash (Experimental)',
    notes: 'Free during experimental phase',
  },
  {
    model: 'gemini-1.5-pro',
    vendor: 'google',
    inputPrice: 1.25,
    outputPrice: 5,
    displayName: 'Gemini 1.5 Pro',
    notes: 'Up to 128K context',
  },
  {
    model: 'gemini-1.5-pro-002',
    vendor: 'google',
    inputPrice: 1.25,
    outputPrice: 5,
    displayName: 'Gemini 1.5 Pro (002)',
  },
  {
    model: 'gemini-1.5-flash',
    vendor: 'google',
    inputPrice: 0.075,
    outputPrice: 0.3,
    displayName: 'Gemini 1.5 Flash',
    notes: 'Fast and cost-effective',
  },
  {
    model: 'gemini-1.5-flash-002',
    vendor: 'google',
    inputPrice: 0.075,
    outputPrice: 0.3,
    displayName: 'Gemini 1.5 Flash (002)',
  },
  {
    model: 'gemini-1.5-flash-8b',
    vendor: 'google',
    inputPrice: 0.0375,
    outputPrice: 0.15,
    displayName: 'Gemini 1.5 Flash 8B',
    notes: 'Smallest Gemini model',
  },

  // ============================================================================
  // Groq Models
  // https://groq.com/pricing/
  // ============================================================================
  {
    model: 'llama-3.3-70b-versatile',
    vendor: 'groq',
    inputPrice: 0.59,
    outputPrice: 0.79,
    displayName: 'Llama 3.3 70B Versatile',
  },
  {
    model: 'llama-3.1-70b-versatile',
    vendor: 'groq',
    inputPrice: 0.59,
    outputPrice: 0.79,
    displayName: 'Llama 3.1 70B Versatile',
  },
  {
    model: 'llama-3.1-8b-instant',
    vendor: 'groq',
    inputPrice: 0.05,
    outputPrice: 0.08,
    displayName: 'Llama 3.1 8B Instant',
  },
  {
    model: 'llama3-70b-8192',
    vendor: 'groq',
    inputPrice: 0.59,
    outputPrice: 0.79,
    displayName: 'Llama 3 70B',
  },
  {
    model: 'llama3-8b-8192',
    vendor: 'groq',
    inputPrice: 0.05,
    outputPrice: 0.08,
    displayName: 'Llama 3 8B',
  },
  {
    model: 'mixtral-8x7b-32768',
    vendor: 'groq',
    inputPrice: 0.24,
    outputPrice: 0.24,
    displayName: 'Mixtral 8x7B',
  },
  {
    model: 'gemma2-9b-it',
    vendor: 'groq',
    inputPrice: 0.2,
    outputPrice: 0.2,
    displayName: 'Gemma 2 9B',
  },

  // ============================================================================
  // Mistral Models
  // https://mistral.ai/technology/#pricing
  // ============================================================================
  {
    model: 'mistral-large-latest',
    vendor: 'mistral',
    inputPrice: 2,
    outputPrice: 6,
    displayName: 'Mistral Large',
  },
  {
    model: 'mistral-large-2411',
    vendor: 'mistral',
    inputPrice: 2,
    outputPrice: 6,
    displayName: 'Mistral Large (2411)',
  },
  {
    model: 'mistral-small-latest',
    vendor: 'mistral',
    inputPrice: 0.2,
    outputPrice: 0.6,
    displayName: 'Mistral Small',
  },
  {
    model: 'mistral-small-2409',
    vendor: 'mistral',
    inputPrice: 0.2,
    outputPrice: 0.6,
    displayName: 'Mistral Small (2409)',
  },
  {
    model: 'codestral-latest',
    vendor: 'mistral',
    inputPrice: 0.2,
    outputPrice: 0.6,
    displayName: 'Codestral',
    notes: 'Code generation model',
  },
  {
    model: 'pixtral-large-latest',
    vendor: 'mistral',
    inputPrice: 2,
    outputPrice: 6,
    displayName: 'Pixtral Large',
    notes: 'Vision model',
  },
  {
    model: 'open-mistral-nemo',
    vendor: 'mistral',
    inputPrice: 0.15,
    outputPrice: 0.15,
    displayName: 'Mistral Nemo',
  },

  // ============================================================================
  // Together AI Models
  // https://www.together.ai/pricing
  // ============================================================================
  {
    model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    vendor: 'together',
    inputPrice: 0.88,
    outputPrice: 0.88,
    displayName: 'Llama 3.3 70B Instruct Turbo',
  },
  {
    model: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
    vendor: 'together',
    inputPrice: 3.5,
    outputPrice: 3.5,
    displayName: 'Llama 3.1 405B Instruct Turbo',
  },
  {
    model: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    vendor: 'together',
    inputPrice: 0.88,
    outputPrice: 0.88,
    displayName: 'Llama 3.1 70B Instruct Turbo',
  },
  {
    model: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
    vendor: 'together',
    inputPrice: 0.18,
    outputPrice: 0.18,
    displayName: 'Llama 3.1 8B Instruct Turbo',
  },
  {
    model: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
    vendor: 'together',
    inputPrice: 1.2,
    outputPrice: 1.2,
    displayName: 'Qwen 2.5 72B Instruct Turbo',
  },
  {
    model: 'deepseek-ai/DeepSeek-R1',
    vendor: 'together',
    inputPrice: 3,
    outputPrice: 7,
    displayName: 'DeepSeek R1 (Together)',
  },
  {
    model: 'deepseek-ai/DeepSeek-V3',
    vendor: 'together',
    inputPrice: 0.9,
    outputPrice: 0.9,
    displayName: 'DeepSeek V3 (Together)',
  },

  // ============================================================================
  // OpenRouter Models (Aggregator)
  // https://openrouter.ai/models
  // ============================================================================
  {
    model: 'openai/gpt-4o',
    vendor: 'openrouter',
    inputPrice: 2.5,
    outputPrice: 10,
    displayName: 'GPT-4o (OpenRouter)',
  },
  {
    model: 'anthropic/claude-3.5-sonnet',
    vendor: 'openrouter',
    inputPrice: 3,
    outputPrice: 15,
    displayName: 'Claude 3.5 Sonnet (OpenRouter)',
  },
  {
    model: 'google/gemini-pro-1.5',
    vendor: 'openrouter',
    inputPrice: 1.25,
    outputPrice: 5,
    displayName: 'Gemini 1.5 Pro (OpenRouter)',
  },

  // ============================================================================
  // Chinese AI Models
  // ============================================================================
  // 智谱 AI (Zhipu)
  {
    model: 'glm-4-plus',
    vendor: 'zhipu',
    inputPrice: 0.7,
    outputPrice: 0.7,
    displayName: 'GLM-4 Plus',
    notes: '智谱 AI 旗舰模型',
  },
  {
    model: 'glm-4-air',
    vendor: 'zhipu',
    inputPrice: 0.14,
    outputPrice: 0.14,
    displayName: 'GLM-4 Air',
  },
  {
    model: 'glm-4-flash',
    vendor: 'zhipu',
    inputPrice: 0,
    outputPrice: 0,
    displayName: 'GLM-4 Flash',
    notes: '免费模型',
  },

  // 月之暗面 (Moonshot)
  {
    model: 'moonshot-v1-8k',
    vendor: 'moonshot',
    inputPrice: 0.17,
    outputPrice: 0.17,
    displayName: 'Moonshot V1 8K',
  },
  {
    model: 'moonshot-v1-32k',
    vendor: 'moonshot',
    inputPrice: 0.34,
    outputPrice: 0.34,
    displayName: 'Moonshot V1 32K',
  },
  {
    model: 'moonshot-v1-128k',
    vendor: 'moonshot',
    inputPrice: 0.85,
    outputPrice: 0.85,
    displayName: 'Moonshot V1 128K',
  },

  // 百川 (Baichuan)
  {
    model: 'Baichuan4',
    vendor: 'baichuan',
    inputPrice: 1.4,
    outputPrice: 1.4,
    displayName: 'Baichuan 4',
  },
  {
    model: 'Baichuan3-Turbo',
    vendor: 'baichuan',
    inputPrice: 0.17,
    outputPrice: 0.17,
    displayName: 'Baichuan 3 Turbo',
  },

  // 阿里云 (Dashscope/Qwen)
  {
    model: 'qwen-max',
    vendor: 'dashscope',
    inputPrice: 2.8,
    outputPrice: 8.4,
    displayName: 'Qwen Max',
    notes: '通义千问旗舰模型',
  },
  {
    model: 'qwen-plus',
    vendor: 'dashscope',
    inputPrice: 0.56,
    outputPrice: 1.68,
    displayName: 'Qwen Plus',
  },
  {
    model: 'qwen-turbo',
    vendor: 'dashscope',
    inputPrice: 0.28,
    outputPrice: 0.84,
    displayName: 'Qwen Turbo',
  },
  {
    model: 'qwen-long',
    vendor: 'dashscope',
    inputPrice: 0.07,
    outputPrice: 0.28,
    displayName: 'Qwen Long',
    notes: '长文本模型',
  },

  // 阶跃星辰 (StepFun)
  {
    model: 'step-1-200k',
    vendor: 'stepfun',
    inputPrice: 2.1,
    outputPrice: 14,
    displayName: 'Step 1 200K',
  },
  {
    model: 'step-1-32k',
    vendor: 'stepfun',
    inputPrice: 1.68,
    outputPrice: 5.6,
    displayName: 'Step 1 32K',
  },
  {
    model: 'step-1-flash',
    vendor: 'stepfun',
    inputPrice: 0.14,
    outputPrice: 0.28,
    displayName: 'Step 1 Flash',
  },

  // 字节跳动 (Doubao)
  {
    model: 'doubao-pro-32k',
    vendor: 'doubao',
    inputPrice: 0.11,
    outputPrice: 0.28,
    displayName: 'Doubao Pro 32K',
  },
  {
    model: 'doubao-pro-128k',
    vendor: 'doubao',
    inputPrice: 0.7,
    outputPrice: 1.26,
    displayName: 'Doubao Pro 128K',
  },
  {
    model: 'doubao-lite-32k',
    vendor: 'doubao',
    inputPrice: 0.04,
    outputPrice: 0.08,
    displayName: 'Doubao Lite 32K',
  },

  // MiniMax
  {
    model: 'abab6.5s-chat',
    vendor: 'minimax',
    inputPrice: 0.14,
    outputPrice: 0.14,
    displayName: 'ABAB 6.5s Chat',
  },
  {
    model: 'abab6.5-chat',
    vendor: 'minimax',
    inputPrice: 0.42,
    outputPrice: 0.42,
    displayName: 'ABAB 6.5 Chat',
  },

  // 零一万物 (Yi)
  {
    model: 'yi-large',
    vendor: 'yi',
    inputPrice: 2.8,
    outputPrice: 2.8,
    displayName: 'Yi Large',
  },
  {
    model: 'yi-medium',
    vendor: 'yi',
    inputPrice: 0.35,
    outputPrice: 0.35,
    displayName: 'Yi Medium',
  },
  {
    model: 'yi-spark',
    vendor: 'yi',
    inputPrice: 0.14,
    outputPrice: 0.14,
    displayName: 'Yi Spark',
  },

  // 腾讯混元 (Hunyuan)
  {
    model: 'hunyuan-pro',
    vendor: 'hunyuan',
    inputPrice: 4.2,
    outputPrice: 5.6,
    displayName: 'Hunyuan Pro',
  },
  {
    model: 'hunyuan-standard',
    vendor: 'hunyuan',
    inputPrice: 0.63,
    outputPrice: 0.7,
    displayName: 'Hunyuan Standard',
  },
  {
    model: 'hunyuan-lite',
    vendor: 'hunyuan',
    inputPrice: 0,
    outputPrice: 0,
    displayName: 'Hunyuan Lite',
    notes: '免费模型',
  },

  // 硅基流动 (SiliconFlow)
  {
    model: 'deepseek-ai/DeepSeek-V3',
    vendor: 'siliconflow',
    inputPrice: 0.14,
    outputPrice: 0.28,
    displayName: 'DeepSeek V3 (SiliconFlow)',
  },
  {
    model: 'Qwen/Qwen2.5-72B-Instruct',
    vendor: 'siliconflow',
    inputPrice: 0.56,
    outputPrice: 0.56,
    displayName: 'Qwen 2.5 72B (SiliconFlow)',
  },
  {
    model: 'Pro/Qwen/Qwen2.5-7B-Instruct',
    vendor: 'siliconflow',
    inputPrice: 0,
    outputPrice: 0,
    displayName: 'Qwen 2.5 7B (SiliconFlow Free)',
    notes: '免费模型',
  },
];
