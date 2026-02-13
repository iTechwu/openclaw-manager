import { z } from 'zod';

import type { ModelType } from './prisma-enums.generated';

// ============================================================================
// Provider Vendor Schema - 支持的 AI 提供商
// ============================================================================

/**
 * 所有支持的 AI 提供商 ID
 * 参考 cherry-studio 项目，支持 60+ 个平台
 */
export const ProviderVendorSchema = z.enum([
  // === 国际主流平台 ===
  'openai',
  'anthropic',
  'google', // Gemini
  'azure-openai',
  'aws-bedrock',
  'vertexai',
  'mistral',
  'groq',
  'together',
  'fireworks',
  'perplexity',
  'grok', // xAI
  'nvidia',
  'hyperbolic',
  'cerebras',
  'huggingface',
  'github', // GitHub Models
  'copilot', // GitHub Copilot
  'cohere',
  'ai21',
  'replicate',

  // === 国内平台 ===
  'deepseek',
  'zhipu', // 智谱
  'moonshot', // 月之暗面/Kimi
  'baichuan', // 百川
  'dashscope', // 阿里百炼
  'stepfun', // 阶跃星辰
  'doubao', // 字节豆包
  'minimax',
  'yi', // 零一万物
  'hunyuan', // 腾讯混元
  'tencent-cloud-ti', // 腾讯云 TI
  'baidu-cloud', // 百度云
  'infini',
  'modelscope', // 魔搭
  'xirang', // 天翼云息壤
  'mimo', // 小米 MiMo

  // === 聚合/代理平台 ===
  'openrouter',
  'silicon', // 硅基流动
  'aihubmix',
  '302ai',
  'tokenflux',
  'poe',
  'venice',
  'ocoolai',
  'dmxapi',
  'burncloud',
  'cephalon',
  'lanyun',
  'ph8',
  'qiniu', // 七牛
  'ppio',
  'alayanew',
  'aionly',
  'longcat',
  'sophnet',
  'gateway', // Vercel AI Gateway

  // === 本地/私有化部署 ===
  'ollama',
  'lmstudio',
  'gpustack',
  'ovms', // OpenVINO Model Server
  'new-api',

  // === 自定义平台 ===
  'custom',
]);

export type ProviderVendor = z.infer<typeof ProviderVendorSchema>;

// ============================================================================
// Provider API Type - API 协议类型
// ============================================================================

export const ProviderApiTypeSchema = z.enum([
  'openai', // OpenAI 兼容 API
  'openai-response', // OpenAI Response API
  'anthropic', // Anthropic API
  'gemini', // Google Gemini API
  'azure-openai', // Azure OpenAI API
  'aws-bedrock', // AWS Bedrock API
  'vertexai', // Google Vertex AI API
  'ollama', // Ollama API
  'new-api', // New API 兼容
  'gateway', // AI Gateway
]);

export type ProviderApiType = z.infer<typeof ProviderApiTypeSchema>;

// ============================================================================
// Provider Category - 提供商分类
// ============================================================================

export const ProviderCategorySchema = z.enum([
  'international', // 国际主流
  'domestic', // 国内平台
  'aggregator', // 聚合/代理
  'local', // 本地部署
  'custom', // 自定义
]);

export type ProviderCategory = z.infer<typeof ProviderCategorySchema>;

// ============================================================================
// Credential Form Schema - 凭证表单配置 (Dify-style)
// ============================================================================

export const CredentialFieldTypeSchema = z.enum([
  'secret-input', // 密码输入框
  'text-input', // 文本输入框
  'select', // 下拉选择
]);

export type CredentialFieldType = z.infer<typeof CredentialFieldTypeSchema>;

export interface CredentialFieldSchema {
  variable: string;
  label: string;
  type: CredentialFieldType;
  required: boolean;
  placeholder?: string;
  default?: string;
  options?: Array<{ value: string; label: string }>;
}

// ============================================================================
// Provider Configuration - 提供商配置信息
// ============================================================================

export interface ProviderConfig {
  id: ProviderVendor;
  name: string;
  apiType: ProviderApiType;
  category: ProviderCategory;
  apiHost: string;
  /** 提供商 Logo 路径 (相对于 /images/providers/) */
  logo?: string;
  websites?: {
    official?: string;
    apiKey?: string;
    docs?: string;
    models?: string;
  };
  /** 是否需要额外配置（如 Azure 需要 apiVersion） */
  requiresExtraConfig?: boolean;
  /** 是否为本地服务 */
  isLocal?: boolean;
  /** 支持的模型类型 (Dify-style) */
  supportedModelTypes?: ModelType[];
  /** 凭证表单配置 (Dify-style) */
  credentialFormSchemas?: CredentialFieldSchema[];
  /** 提供商描述 */
  description?: string;
}

/**
 * 所有提供商的配置信息
 * 包含 API 地址、分类、官网链接等
 */
export const PROVIDER_CONFIGS: Record<ProviderVendor, ProviderConfig> = {
  // ============================================================================
  // 国际主流平台
  // ============================================================================
  openai: {
    id: 'openai',
    name: 'OpenAI',
    apiType: 'openai-response',
    category: 'international',
    apiHost: 'https://api.openai.com/v1',
    logo: 'openai.svg',
    description: 'OpenAI 提供 GPT-4、GPT-3.5 等先进的大语言模型',
    supportedModelTypes: [
      'llm',
      'text-embedding',
      'speech2text',
      'tts',
      'image',
      'moderation',
    ],
    credentialFormSchemas: [
      {
        variable: 'api_key',
        label: 'API Key',
        type: 'secret-input',
        required: true,
        placeholder: 'sk-...',
      },
      {
        variable: 'organization',
        label: 'Organization ID',
        type: 'text-input',
        required: false,
        placeholder: 'org-...',
      },
    ],
    websites: {
      official: 'https://openai.com/',
      apiKey: 'https://platform.openai.com/api-keys',
      docs: 'https://platform.openai.com/docs',
      models: 'https://platform.openai.com/docs/models',
    },
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    apiType: 'anthropic',
    category: 'international',
    apiHost: 'https://api.anthropic.com',
    logo: 'anthropic.svg',
    description: 'Anthropic 提供 Claude 系列模型，以安全性和有用性著称',
    supportedModelTypes: ['llm'],
    credentialFormSchemas: [
      {
        variable: 'api_key',
        label: 'API Key',
        type: 'secret-input',
        required: true,
        placeholder: 'sk-ant-...',
      },
    ],
    websites: {
      official: 'https://anthropic.com/',
      apiKey: 'https://console.anthropic.com/settings/keys',
      docs: 'https://docs.anthropic.com/en/docs',
      models: 'https://docs.anthropic.com/en/docs/about-claude/models',
    },
  },
  google: {
    id: 'google',
    name: 'Google Gemini',
    apiType: 'gemini',
    category: 'international',
    apiHost: 'https://generativelanguage.googleapis.com/v1beta',
    logo: 'google.svg',
    description: 'Google Gemini 是 Google 最新的多模态 AI 模型',
    supportedModelTypes: ['llm', 'text-embedding', 'image'],
    credentialFormSchemas: [
      {
        variable: 'api_key',
        label: 'API Key',
        type: 'secret-input',
        required: true,
        placeholder: 'AIza...',
      },
    ],
    websites: {
      official: 'https://gemini.google.com/',
      apiKey: 'https://aistudio.google.com/app/apikey',
      docs: 'https://ai.google.dev/gemini-api/docs',
      models: 'https://ai.google.dev/gemini-api/docs/models/gemini',
    },
  },
  'azure-openai': {
    id: 'azure-openai',
    name: 'Azure OpenAI',
    apiType: 'azure-openai',
    category: 'international',
    apiHost: '',
    logo: 'azure.svg',
    requiresExtraConfig: true,
    websites: {
      official:
        'https://azure.microsoft.com/en-us/products/ai-services/openai-service',
      apiKey:
        'https://portal.azure.com/#view/Microsoft_Azure_ProjectOxford/CognitiveServicesHub/~/OpenAI',
      docs: 'https://learn.microsoft.com/en-us/azure/ai-services/openai/',
      models:
        'https://learn.microsoft.com/en-us/azure/ai-services/openai/concepts/models',
    },
  },
  'aws-bedrock': {
    id: 'aws-bedrock',
    name: 'AWS Bedrock',
    apiType: 'aws-bedrock',
    category: 'international',
    apiHost: '',
    logo: 'aws.svg',
    requiresExtraConfig: true,
    websites: {
      official: 'https://aws.amazon.com/bedrock/',
      apiKey:
        'https://docs.aws.amazon.com/bedrock/latest/userguide/security-iam.html',
      docs: 'https://docs.aws.amazon.com/bedrock/',
      models:
        'https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html',
    },
  },
  vertexai: {
    id: 'vertexai',
    name: 'Google Vertex AI',
    apiType: 'vertexai',
    category: 'international',
    apiHost: '',
    logo: 'google-cloud.svg',
    requiresExtraConfig: true,
    websites: {
      official: 'https://cloud.google.com/vertex-ai',
      apiKey: 'https://console.cloud.google.com/apis/credentials',
      docs: 'https://cloud.google.com/vertex-ai/generative-ai/docs',
      models:
        'https://cloud.google.com/vertex-ai/generative-ai/docs/learn/models',
    },
  },
  mistral: {
    id: 'mistral',
    name: 'Mistral AI',
    apiType: 'openai',
    category: 'international',
    apiHost: 'https://api.mistral.ai/v1',
    logo: 'mistral.svg',
    websites: {
      official: 'https://mistral.ai',
      apiKey: 'https://console.mistral.ai/api-keys/',
      docs: 'https://docs.mistral.ai',
      models: 'https://docs.mistral.ai/getting-started/models/models_overview',
    },
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    apiType: 'openai',
    category: 'international',
    apiHost: 'https://api.groq.com/openai/v1',
    logo: 'groq.svg',
    websites: {
      official: 'https://groq.com/',
      apiKey: 'https://console.groq.com/keys',
      docs: 'https://console.groq.com/docs/quickstart',
      models: 'https://console.groq.com/docs/models',
    },
  },
  together: {
    id: 'together',
    name: 'Together AI',
    apiType: 'openai',
    category: 'international',
    apiHost: 'https://api.together.xyz/v1',
    websites: {
      official: 'https://www.together.ai/',
      apiKey: 'https://api.together.ai/settings/api-keys',
      docs: 'https://docs.together.ai/docs/introduction',
      models: 'https://docs.together.ai/docs/serverless-models',
    },
  },
  fireworks: {
    id: 'fireworks',
    name: 'Fireworks AI',
    apiType: 'openai',
    category: 'international',
    apiHost: 'https://api.fireworks.ai/inference/v1',
    websites: {
      official: 'https://fireworks.ai/',
      apiKey: 'https://fireworks.ai/account/api-keys',
      docs: 'https://docs.fireworks.ai/getting-started/introduction',
      models: 'https://fireworks.ai/dashboard/models',
    },
  },
  perplexity: {
    id: 'perplexity',
    name: 'Perplexity',
    apiType: 'openai',
    category: 'international',
    apiHost: 'https://api.perplexity.ai',
    websites: {
      official: 'https://perplexity.ai/',
      apiKey: 'https://www.perplexity.ai/settings/api',
      docs: 'https://docs.perplexity.ai/home',
      models: 'https://docs.perplexity.ai/guides/model-cards',
    },
  },
  grok: {
    id: 'grok',
    name: 'Grok (xAI)',
    apiType: 'openai',
    category: 'international',
    apiHost: 'https://api.x.ai/v1',
    websites: {
      official: 'https://x.ai/',
      docs: 'https://docs.x.ai/',
      models: 'https://docs.x.ai/docs/models',
    },
  },
  nvidia: {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    apiType: 'openai',
    category: 'international',
    apiHost: 'https://integrate.api.nvidia.com/v1',
    websites: {
      official: 'https://build.nvidia.com/explore/discover',
      apiKey: 'https://build.nvidia.com/meta/llama-3_1-405b-instruct',
      docs: 'https://docs.api.nvidia.com/nim/reference/llm-apis',
      models: 'https://build.nvidia.com/nim',
    },
  },
  hyperbolic: {
    id: 'hyperbolic',
    name: 'Hyperbolic',
    apiType: 'openai',
    category: 'international',
    apiHost: 'https://api.hyperbolic.xyz/v1',
    websites: {
      official: 'https://app.hyperbolic.xyz',
      apiKey: 'https://app.hyperbolic.xyz/settings',
      docs: 'https://docs.hyperbolic.xyz',
      models: 'https://app.hyperbolic.xyz/models',
    },
  },
  cerebras: {
    id: 'cerebras',
    name: 'Cerebras',
    apiType: 'openai',
    category: 'international',
    apiHost: 'https://api.cerebras.ai/v1',
    websites: {
      official: 'https://www.cerebras.ai',
      apiKey: 'https://cloud.cerebras.ai',
      docs: 'https://inference-docs.cerebras.ai/introduction',
      models: 'https://inference-docs.cerebras.ai/models/overview',
    },
  },
  huggingface: {
    id: 'huggingface',
    name: 'Hugging Face',
    apiType: 'openai-response',
    category: 'international',
    apiHost: 'https://router.huggingface.co/v1',
    websites: {
      official: 'https://huggingface.co/',
      apiKey: 'https://huggingface.co/settings/tokens',
      docs: 'https://huggingface.co/docs',
      models: 'https://huggingface.co/models',
    },
  },
  github: {
    id: 'github',
    name: 'GitHub Models',
    apiType: 'openai',
    category: 'international',
    apiHost: 'https://models.github.ai/inference',
    websites: {
      official: 'https://github.com/marketplace/models',
      apiKey: 'https://github.com/settings/tokens',
      docs: 'https://docs.github.com/en/github-models',
      models: 'https://github.com/marketplace/models',
    },
  },
  copilot: {
    id: 'copilot',
    name: 'GitHub Copilot',
    apiType: 'openai',
    category: 'international',
    apiHost: 'https://api.githubcopilot.com',
    websites: {
      official: 'https://github.com/features/copilot',
    },
  },
  cohere: {
    id: 'cohere',
    name: 'Cohere',
    apiType: 'openai',
    category: 'international',
    apiHost: 'https://api.cohere.ai/v1',
    websites: {
      official: 'https://cohere.com/',
      apiKey: 'https://dashboard.cohere.com/api-keys',
      docs: 'https://docs.cohere.com/',
      models: 'https://docs.cohere.com/docs/models',
    },
  },
  ai21: {
    id: 'ai21',
    name: 'AI21 Labs',
    apiType: 'openai',
    category: 'international',
    apiHost: 'https://api.ai21.com/studio/v1',
    websites: {
      official: 'https://www.ai21.com/',
      apiKey: 'https://studio.ai21.com/account/api-key',
      docs: 'https://docs.ai21.com/',
      models: 'https://docs.ai21.com/docs/models-overview',
    },
  },
  replicate: {
    id: 'replicate',
    name: 'Replicate',
    apiType: 'openai',
    category: 'international',
    apiHost: 'https://api.replicate.com/v1',
    websites: {
      official: 'https://replicate.com/',
      apiKey: 'https://replicate.com/account/api-tokens',
      docs: 'https://replicate.com/docs',
      models: 'https://replicate.com/explore',
    },
  },

  // ============================================================================
  // 国内平台
  // ============================================================================
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    apiType: 'openai',
    category: 'domestic',
    apiHost: 'https://api.deepseek.com/v1',
    logo: 'deepseek.svg',
    websites: {
      official: 'https://deepseek.com/',
      apiKey: 'https://platform.deepseek.com/api_keys',
      docs: 'https://platform.deepseek.com/api-docs/',
      models: 'https://platform.deepseek.com/api-docs/',
    },
  },
  zhipu: {
    id: 'zhipu',
    name: '智谱 AI (ZhiPu)',
    apiType: 'openai',
    category: 'domestic',
    apiHost: 'https://open.bigmodel.cn/api/paas/v4',
    logo: 'zhipu.svg',
    websites: {
      official: 'https://open.bigmodel.cn/',
      apiKey: 'https://open.bigmodel.cn/usercenter/apikeys',
      docs: 'https://docs.bigmodel.cn/',
      models: 'https://open.bigmodel.cn/modelcenter/square',
    },
  },
  moonshot: {
    id: 'moonshot',
    name: '月之暗面 (Kimi)',
    apiType: 'openai',
    category: 'domestic',
    apiHost: 'https://api.moonshot.cn/v1',
    logo: 'moonshot.svg',
    websites: {
      official: 'https://www.moonshot.cn/',
      apiKey: 'https://platform.moonshot.cn/console/api-keys',
      docs: 'https://platform.moonshot.cn/docs/',
      models: 'https://platform.moonshot.cn/docs/intro',
    },
  },
  baichuan: {
    id: 'baichuan',
    name: '百川 AI',
    apiType: 'openai',
    category: 'domestic',
    apiHost: 'https://api.baichuan-ai.com/v1',
    logo: 'baichuan.svg',
    websites: {
      official: 'https://www.baichuan-ai.com/',
      apiKey: 'https://platform.baichuan-ai.com/console/apikey',
      docs: 'https://platform.baichuan-ai.com/docs',
      models: 'https://platform.baichuan-ai.com/prices',
    },
  },
  dashscope: {
    id: 'dashscope',
    name: '阿里百炼 (通义)',
    apiType: 'openai',
    category: 'domestic',
    apiHost: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    logo: 'aliyun.svg',
    websites: {
      official: 'https://www.aliyun.com/product/bailian',
      apiKey: 'https://bailian.console.aliyun.com/?tab=model#/api-key',
      docs: 'https://help.aliyun.com/zh/model-studio/getting-started/',
      models: 'https://bailian.console.aliyun.com/?tab=model#/model-market',
    },
  },
  stepfun: {
    id: 'stepfun',
    name: '阶跃星辰',
    apiType: 'openai',
    category: 'domestic',
    apiHost: 'https://api.stepfun.com/v1',
    websites: {
      official: 'https://platform.stepfun.com/',
      apiKey: 'https://platform.stepfun.com/interface-key',
      docs: 'https://platform.stepfun.com/docs/overview/concept',
      models: 'https://platform.stepfun.com/docs/llm/text',
    },
  },
  doubao: {
    id: 'doubao',
    name: '字节豆包',
    apiType: 'openai',
    category: 'domestic',
    apiHost: 'https://ark.cn-beijing.volces.com/api/v3',
    logo: 'doubao.svg',
    websites: {
      official: 'https://console.volcengine.com/ark/',
      apiKey: 'https://www.volcengine.com/experience/ark',
      docs: 'https://www.volcengine.com/docs/82379/1182403',
      models:
        'https://console.volcengine.com/ark/region:ark+cn-beijing/endpoint',
    },
  },
  minimax: {
    id: 'minimax',
    name: 'MiniMax',
    apiType: 'openai',
    category: 'domestic',
    apiHost: 'https://api.minimaxi.com/v1',
    description:
      'MiniMax 提供 abab 系列大语言模型。新版 API (api.minimaxi.com) 无需 Group ID；旧版 API (api.minimax.chat) 需要填写 Group ID',
    credentialFormSchemas: [
      {
        variable: 'api_key',
        label: 'API Key',
        type: 'secret-input',
        required: true,
        placeholder: 'eyJh...',
      },
      {
        variable: 'group_id',
        label: 'Group ID',
        type: 'text-input',
        required: false,
        placeholder: '如使用旧版 API (api.minimax.chat) 则需填写',
      },
    ],
    websites: {
      official: 'https://platform.minimaxi.com/',
      apiKey:
        'https://platform.minimaxi.com/user-center/basic-information/interface-key',
      docs: 'https://platform.minimaxi.com/docs/api-reference/text-openai-api',
      models: 'https://platform.minimaxi.com/document/Models',
    },
  },
  yi: {
    id: 'yi',
    name: '零一万物 (Yi)',
    apiType: 'openai',
    category: 'domestic',
    apiHost: 'https://api.lingyiwanwu.com/v1',
    websites: {
      official: 'https://platform.lingyiwanwu.com/',
      apiKey: 'https://platform.lingyiwanwu.com/apikeys',
      docs: 'https://platform.lingyiwanwu.com/docs',
      models: 'https://platform.lingyiwanwu.com/docs',
    },
  },
  hunyuan: {
    id: 'hunyuan',
    name: '腾讯混元',
    apiType: 'openai',
    category: 'domestic',
    apiHost: 'https://api.hunyuan.cloud.tencent.com/v1',
    logo: 'tencent.svg',
    websites: {
      official: 'https://cloud.tencent.com/product/hunyuan',
      apiKey: 'https://console.cloud.tencent.com/hunyuan/api-key',
      docs: 'https://cloud.tencent.com/document/product/1729/111007',
      models: 'https://cloud.tencent.com/document/product/1729/104753',
    },
  },
  'tencent-cloud-ti': {
    id: 'tencent-cloud-ti',
    name: '腾讯云 TI',
    apiType: 'openai',
    category: 'domestic',
    apiHost: 'https://api.lkeap.cloud.tencent.com/v1',
    websites: {
      official: 'https://cloud.tencent.com/product/ti',
      apiKey: 'https://console.cloud.tencent.com/lkeap/api',
      docs: 'https://cloud.tencent.com/document/product/1772',
      models: 'https://console.cloud.tencent.com/tione/v2/aimarket',
    },
  },
  'baidu-cloud': {
    id: 'baidu-cloud',
    name: '百度云千帆',
    apiType: 'openai',
    category: 'domestic',
    apiHost: 'https://qianfan.baidubce.com/v2',
    websites: {
      official: 'https://cloud.baidu.com/',
      apiKey: 'https://console.bce.baidu.com/iam/#/iam/apikey/list',
      docs: 'https://cloud.baidu.com/doc/index.html',
      models: 'https://cloud.baidu.com/doc/WENXINWORKSHOP/s/Fm2vrveyu',
    },
  },
  infini: {
    id: 'infini',
    name: 'Infini AI',
    apiType: 'openai',
    category: 'domestic',
    apiHost: 'https://cloud.infini-ai.com/maas/v1',
    websites: {
      official: 'https://cloud.infini-ai.com/',
      apiKey: 'https://cloud.infini-ai.com/iam/secret/key',
      docs: 'https://docs.infini-ai.com/gen-studio/api/maas.html',
      models: 'https://cloud.infini-ai.com/genstudio/model',
    },
  },
  modelscope: {
    id: 'modelscope',
    name: '魔搭 ModelScope',
    apiType: 'openai',
    category: 'domestic',
    apiHost: 'https://api-inference.modelscope.cn/v1',
    websites: {
      official: 'https://modelscope.cn',
      apiKey: 'https://modelscope.cn/my/myaccesstoken',
      docs: 'https://modelscope.cn/docs/model-service/API-Inference/intro',
      models: 'https://modelscope.cn/models',
    },
  },
  xirang: {
    id: 'xirang',
    name: '天翼云息壤',
    apiType: 'openai',
    category: 'domestic',
    apiHost: 'https://wishub-x1.ctyun.cn/v1',
    websites: {
      official: 'https://www.ctyun.cn',
      apiKey: 'https://huiju.ctyun.cn/service/serviceGroup',
      docs: 'https://www.ctyun.cn/products/ctxirang',
      models: 'https://huiju.ctyun.cn/modelSquare/',
    },
  },
  mimo: {
    id: 'mimo',
    name: '小米 MiMo',
    apiType: 'openai',
    category: 'domestic',
    apiHost: 'https://api.xiaomimimo.com/v1',
    websites: {
      official: 'https://platform.xiaomimimo.com/',
      apiKey: 'https://platform.xiaomimimo.com/#/console/usage',
      docs: 'https://platform.xiaomimimo.com/#/docs/welcome',
      models: 'https://platform.xiaomimimo.com/',
    },
  },

  // ============================================================================
  // 聚合/代理平台
  // ============================================================================
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    apiType: 'openai',
    category: 'aggregator',
    apiHost: 'https://openrouter.ai/api/v1',
    logo: 'openrouter.svg',
    websites: {
      official: 'https://openrouter.ai/',
      apiKey: 'https://openrouter.ai/settings/keys',
      docs: 'https://openrouter.ai/docs/quick-start',
      models: 'https://openrouter.ai/models',
    },
  },
  silicon: {
    id: 'silicon',
    name: '硅基流动 (SiliconFlow)',
    apiType: 'openai',
    category: 'aggregator',
    apiHost: 'https://api.siliconflow.cn/v1',
    logo: 'siliconflow.svg',
    websites: {
      official: 'https://www.siliconflow.cn',
      apiKey: 'https://cloud.siliconflow.cn/i/d1nTBKXU',
      docs: 'https://docs.siliconflow.cn/',
      models: 'https://cloud.siliconflow.cn/models',
    },
  },
  aihubmix: {
    id: 'aihubmix',
    name: 'AiHubMix',
    apiType: 'openai',
    category: 'aggregator',
    apiHost: 'https://aihubmix.com/v1',
    websites: {
      official: 'https://aihubmix.com',
      apiKey: 'https://aihubmix.com',
      docs: 'https://doc.aihubmix.com/',
      models: 'https://aihubmix.com/models',
    },
  },
  '302ai': {
    id: '302ai',
    name: '302.AI',
    apiType: 'openai',
    category: 'aggregator',
    apiHost: 'https://api.302.ai/v1',
    websites: {
      official: 'https://302.ai',
      apiKey: 'https://dash.302.ai/apis/list',
      docs: 'https://302ai.apifox.cn/api-147522039',
      models: 'https://302.ai/pricing/',
    },
  },
  tokenflux: {
    id: 'tokenflux',
    name: 'TokenFlux',
    apiType: 'openai',
    category: 'aggregator',
    apiHost: 'https://api.tokenflux.ai/openai/v1',
    websites: {
      official: 'https://tokenflux.ai',
      apiKey: 'https://tokenflux.ai/dashboard/api-keys',
      docs: 'https://tokenflux.ai/docs',
      models: 'https://tokenflux.ai/models',
    },
  },
  poe: {
    id: 'poe',
    name: 'Poe',
    apiType: 'openai',
    category: 'aggregator',
    apiHost: 'https://api.poe.com/v1',
    websites: {
      official: 'https://poe.com/',
      apiKey: 'https://poe.com/api_key',
      docs: 'https://creator.poe.com/docs/external-applications/openai-compatible-api',
      models: 'https://poe.com/',
    },
  },
  venice: {
    id: 'venice',
    name: 'Venice AI',
    apiType: 'openai',
    category: 'aggregator',
    apiHost: 'https://api.venice.ai/api/v1',
    websites: {
      official: 'https://venice.ai/',
      docs: 'https://docs.venice.ai/',
    },
  },
  ocoolai: {
    id: 'ocoolai',
    name: 'ocoolAI',
    apiType: 'openai',
    category: 'aggregator',
    apiHost: 'https://api.ocoolai.com/v1',
    websites: {
      official: 'https://one.ocoolai.com/',
      apiKey: 'https://one.ocoolai.com/token',
      docs: 'https://docs.ocoolai.com/',
      models: 'https://api.ocoolai.com/info/models/',
    },
  },
  dmxapi: {
    id: 'dmxapi',
    name: 'DMXAPI',
    apiType: 'openai',
    category: 'aggregator',
    apiHost: 'https://www.dmxapi.cn/v1',
    websites: {
      official: 'https://www.dmxapi.cn',
      apiKey: 'https://www.dmxapi.cn',
      docs: 'https://doc.dmxapi.cn/',
      models: 'https://www.dmxapi.cn/pricing',
    },
  },
  burncloud: {
    id: 'burncloud',
    name: 'BurnCloud',
    apiType: 'openai',
    category: 'aggregator',
    apiHost: 'https://ai.burncloud.com/v1',
    websites: {
      official: 'https://ai.burncloud.com/',
      apiKey: 'https://ai.burncloud.com/token',
      docs: 'https://ai.burncloud.com/docs',
      models: 'https://ai.burncloud.com/pricing',
    },
  },
  cephalon: {
    id: 'cephalon',
    name: 'Cephalon',
    apiType: 'openai',
    category: 'aggregator',
    apiHost: 'https://cephalon.cloud/user-center/v1/model',
    websites: {
      official: 'https://cephalon.cloud',
      apiKey: 'https://cephalon.cloud/api',
      docs: 'https://cephalon.cloud/apitoken/1864244127731589124',
      models: 'https://cephalon.cloud/model',
    },
  },
  lanyun: {
    id: 'lanyun',
    name: 'LANYUN',
    apiType: 'openai',
    category: 'aggregator',
    apiHost: 'https://maas-api.lanyun.net/v1',
    websites: {
      official: 'https://maas.lanyun.net',
      apiKey: 'https://maas.lanyun.net/#/system/apiKey',
      docs: 'https://archive.lanyun.net/#/maas/',
      models: 'https://maas.lanyun.net/#/model/modelSquare',
    },
  },
  ph8: {
    id: 'ph8',
    name: 'PH8',
    apiType: 'openai',
    category: 'aggregator',
    apiHost: 'https://ph8.co/v1',
    websites: {
      official: 'https://ph8.co',
      apiKey: 'https://ph8.co/apiKey',
      docs: 'https://m1r239or5aw.feishu.cn/wiki/SegzwS4x1i2P4OksFY2cMvujn9f',
      models: 'https://ph8.co/v1/models',
    },
  },
  qiniu: {
    id: 'qiniu',
    name: '七牛云',
    apiType: 'openai',
    category: 'aggregator',
    apiHost: 'https://api.qnaigc.com/v1',
    websites: {
      official: 'https://qiniu.com',
      apiKey: 'https://portal.qiniu.com/ai-inference/api-key',
      docs: 'https://developer.qiniu.com/aitokenapi',
      models: 'https://developer.qiniu.com/aitokenapi/12883/model-list',
    },
  },
  ppio: {
    id: 'ppio',
    name: 'PPIO',
    apiType: 'openai',
    category: 'aggregator',
    apiHost: 'https://api.ppinfra.com/v3/openai',
    websites: {
      official: 'https://ppio.com',
      apiKey: 'https://ppio.com/settings/key-management',
      docs: 'https://docs.cherry-ai.com/pre-basic/providers/ppio',
      models: 'https://ppio.com/model-api/product/llm-api',
    },
  },
  alayanew: {
    id: 'alayanew',
    name: 'AlayaNew',
    apiType: 'openai',
    category: 'aggregator',
    apiHost: 'https://deepseek.alayanew.com/v1',
    websites: {
      official: 'https://www.alayanew.com',
      apiKey: 'https://www.alayanew.com/backend/register',
      docs: 'https://docs.alayanew.com/docs/modelService/interview',
      models: 'https://www.alayanew.com/product/deepseek',
    },
  },
  aionly: {
    id: 'aionly',
    name: 'AIOnly',
    apiType: 'openai',
    category: 'aggregator',
    apiHost: 'https://api.aiionly.com/v1',
    websites: {
      official: 'https://www.aiionly.com',
      apiKey: 'https://www.aiionly.com/keyApi',
      docs: 'https://www.aiionly.com/document',
      models: 'https://www.aiionly.com',
    },
  },
  longcat: {
    id: 'longcat',
    name: 'LongCat',
    apiType: 'openai',
    category: 'aggregator',
    apiHost: 'https://api.longcat.chat/openai/v1',
    websites: {
      official: 'https://longcat.chat',
      apiKey: 'https://longcat.chat/platform/api_keys',
      docs: 'https://longcat.chat/platform/docs/zh/',
      models: 'https://longcat.chat/platform/docs/zh/APIDocs.html',
    },
  },
  sophnet: {
    id: 'sophnet',
    name: 'SophNet',
    apiType: 'openai',
    category: 'aggregator',
    apiHost: 'https://www.sophnet.com/api/open-apis/v1',
    websites: {
      official: 'https://sophnet.com',
      apiKey: 'https://sophnet.com/#/project/key',
      docs: 'https://sophnet.com/docs/component/introduce.html',
      models: 'https://sophnet.com/#/model/list',
    },
  },
  gateway: {
    id: 'gateway',
    name: 'Vercel AI Gateway',
    apiType: 'gateway',
    category: 'aggregator',
    apiHost: 'https://ai-gateway.vercel.sh/v1/ai',
    websites: {
      official: 'https://vercel.com/ai-gateway',
      apiKey: 'https://vercel.com/',
      docs: 'https://vercel.com/docs/ai-gateway',
      models: 'https://vercel.com/ai-gateway/models',
    },
  },

  // ============================================================================
  // 本地/私有化部署
  // ============================================================================
  ollama: {
    id: 'ollama',
    name: 'Ollama',
    apiType: 'ollama',
    category: 'local',
    apiHost: 'http://localhost:11434/v1',
    logo: 'ollama.svg',
    isLocal: true,
    websites: {
      official: 'https://ollama.com/',
      docs: 'https://github.com/ollama/ollama/tree/main/docs',
      models: 'https://ollama.com/library',
    },
  },
  lmstudio: {
    id: 'lmstudio',
    name: 'LM Studio',
    apiType: 'openai',
    category: 'local',
    apiHost: 'http://localhost:1234/v1',
    isLocal: true,
    websites: {
      official: 'https://lmstudio.ai/',
      docs: 'https://lmstudio.ai/docs',
      models: 'https://lmstudio.ai/models',
    },
  },
  gpustack: {
    id: 'gpustack',
    name: 'GPUStack',
    apiType: 'openai',
    category: 'local',
    apiHost: '',
    isLocal: true,
    requiresExtraConfig: true,
    websites: {
      official: 'https://gpustack.ai/',
      docs: 'https://docs.gpustack.ai/latest/',
      models: 'https://docs.gpustack.ai/latest/overview/#supported-models',
    },
  },
  ovms: {
    id: 'ovms',
    name: 'OpenVINO Model Server',
    apiType: 'openai',
    category: 'local',
    apiHost: 'http://localhost:8000/v3',
    isLocal: true,
    websites: {
      official:
        'https://www.intel.com/content/www/us/en/developer/tools/openvino-toolkit/overview.html',
      docs: 'https://docs.openvino.ai/2025/model-server/ovms_what_is_openvino_model_server.html',
      models: 'https://www.modelscope.cn/organization/OpenVINO',
    },
  },
  'new-api': {
    id: 'new-api',
    name: 'New API',
    apiType: 'new-api',
    category: 'local',
    apiHost: 'http://localhost:3000/v1',
    isLocal: true,
    websites: {
      official: 'https://docs.newapi.pro/',
      docs: 'https://docs.newapi.pro',
    },
  },

  // ============================================================================
  // 自定义平台
  // ============================================================================
  custom: {
    id: 'custom',
    name: '自定义 (Custom)',
    apiType: 'openai',
    category: 'custom',
    apiHost: '',
    requiresExtraConfig: true,
  },
};

// ============================================================================
// Helper Functions - 辅助函数
// ============================================================================

/**
 * 获取提供商的默认 API 地址
 */
export function getProviderDefaultApiHost(vendor: ProviderVendor): string {
  return PROVIDER_CONFIGS[vendor]?.apiHost || '';
}

/**
 * 获取有效的 API 地址（自定义或默认）
 */
export function getEffectiveApiHost(
  vendor: ProviderVendor,
  customApiHost?: string | null,
): string {
  if (customApiHost && customApiHost.trim()) {
    return customApiHost.trim();
  }
  return getProviderDefaultApiHost(vendor);
}

/**
 * 检查是否为自定义 API 地址
 */
export function isCustomApiHost(
  vendor: ProviderVendor,
  apiHost?: string | null,
): boolean {
  if (!apiHost) return false;
  return apiHost.trim() !== getProviderDefaultApiHost(vendor);
}

/**
 * 获取提供商配置
 */
export function getProviderConfig(vendor: ProviderVendor): ProviderConfig {
  return PROVIDER_CONFIGS[vendor];
}

/**
 * 按分类获取提供商列表
 */
export function getProvidersByCategory(
  category: ProviderCategory,
): ProviderConfig[] {
  return Object.values(PROVIDER_CONFIGS).filter((p) => p.category === category);
}

/**
 * 获取所有提供商列表（按分类排序）
 */
export function getAllProviders(): ProviderConfig[] {
  const categoryOrder: ProviderCategory[] = [
    'international',
    'domestic',
    'aggregator',
    'local',
    'custom',
  ];

  return Object.values(PROVIDER_CONFIGS).sort((a, b) => {
    const aIndex = categoryOrder.indexOf(a.category);
    const bIndex = categoryOrder.indexOf(b.category);
    if (aIndex !== bIndex) return aIndex - bIndex;
    return a.name.localeCompare(b.name);
  });
}

/**
 * 分类标签映射
 */
export const PROVIDER_CATEGORY_LABELS: Record<ProviderCategory, string> = {
  international: '国际主流',
  domestic: '国内平台',
  aggregator: '聚合/代理',
  local: '本地部署',
  custom: '自定义',
};

/**
 * 分类标签映射（英文）
 */
export const PROVIDER_CATEGORY_LABELS_EN: Record<ProviderCategory, string> = {
  international: 'International',
  domestic: 'Domestic (China)',
  aggregator: 'Aggregator',
  local: 'Local/Self-hosted',
  custom: 'Custom',
};

// ============================================================================
// Legacy Compatibility - 向后兼容
// ============================================================================

/**
 * @deprecated 使用 getProviderDefaultApiHost 代替
 */
export const PROVIDER_DEFAULT_BASE_URLS: Record<ProviderVendor, string> = (
  Object.keys(PROVIDER_CONFIGS) as ProviderVendor[]
).reduce(
  (acc, key) => {
    acc[key] = PROVIDER_CONFIGS[key].apiHost;
    return acc;
  },
  {} as Record<ProviderVendor, string>,
);

/**
 * @deprecated 使用 getEffectiveApiHost 代替
 */
export function getEffectiveBaseUrl(
  vendor: ProviderVendor,
  customBaseUrl?: string | null,
): string {
  return getEffectiveApiHost(vendor, customBaseUrl);
}

/**
 * @deprecated 使用 isCustomApiHost 代替
 */
export function isCustomBaseUrl(
  vendor: ProviderVendor,
  baseUrl?: string | null,
): boolean {
  return isCustomApiHost(vendor, baseUrl);
}
