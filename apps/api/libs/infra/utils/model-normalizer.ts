/**
 * Model Normalizer Utility
 *
 * OpenAI and other providers return alias model names that OpenClaw doesn't recognize.
 * This utility normalizes model names to their canonical forms.
 *
 * IMPORTANT: Custom providers (custom endpoints like OneAPI, NewAPI, proxies) should
 * NOT have their model names normalized, as they may use different model naming conventions.
 *
 * Example:
 * - chatgpt-4o-latest -> gpt-4o (only for official openai provider)
 * - gpt-4o-2024-08-06 -> gpt-4o (only for official openai provider)
 * - gpt-4-turbo-2024-04-09 -> gpt-4-turbo (only for official openai provider)
 */

/**
 * Providers that should skip model normalization
 * Custom providers may have their own model naming conventions
 */
const SKIP_NORMALIZATION_PROVIDERS = new Set([
  'custom',
  'openai-compatible',
  'ollama',
  'openrouter', // OpenRouter uses its own model naming
]);

/**
 * OpenAI model alias mappings
 * Maps alias/dated model names to their canonical forms
 * Only applied for official OpenAI provider
 */
const OPENAI_MODEL_ALIASES: Record<string, string> = {
  // ChatGPT aliases (these are pointer models)
  'chatgpt-4o-latest': 'gpt-4o',
  'chatgpt-4o-mini-latest': 'gpt-4o-mini',

  // GPT-4o dated versions
  'gpt-4o-2024-11-20': 'gpt-4o',
  'gpt-4o-2024-08-06': 'gpt-4o',
  'gpt-4o-2024-05-13': 'gpt-4o',

  // GPT-4o mini dated versions
  'gpt-4o-mini-2024-07-18': 'gpt-4o-mini',

  // GPT-4 Turbo dated versions
  'gpt-4-turbo-2024-04-09': 'gpt-4-turbo',
  'gpt-4-turbo-preview': 'gpt-4-turbo',
  'gpt-4-0125-preview': 'gpt-4-turbo',
  'gpt-4-1106-preview': 'gpt-4-turbo',

  // GPT-4 dated versions
  'gpt-4-0613': 'gpt-4',
  'gpt-4-0314': 'gpt-4',

  // GPT-3.5 Turbo dated versions
  'gpt-3.5-turbo-0125': 'gpt-3.5-turbo',
  'gpt-3.5-turbo-1106': 'gpt-3.5-turbo',
  'gpt-3.5-turbo-0613': 'gpt-3.5-turbo',
  'gpt-3.5-turbo-16k-0613': 'gpt-3.5-turbo-16k',

  // O1 models
  'o1-preview-2024-09-12': 'o1-preview',
  'o1-mini-2024-09-12': 'o1-mini',
};

/**
 * Anthropic model alias mappings
 */
const ANTHROPIC_MODEL_ALIASES: Record<string, string> = {
  // Claude 3.5 aliases
  'claude-3-5-sonnet-latest': 'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-latest': 'claude-3-5-haiku-20241022',
};

/**
 * Provider-specific model alias maps
 */
const PROVIDER_MODEL_ALIASES: Record<string, Record<string, string>> = {
  openai: OPENAI_MODEL_ALIASES,
  anthropic: ANTHROPIC_MODEL_ALIASES,
};

/**
 * Normalize a model name to its canonical form
 *
 * IMPORTANT: Custom providers (custom, openai-compatible, ollama, openrouter)
 * will NOT have their model names normalized, as they may use different naming conventions.
 *
 * @param model - The model name to normalize
 * @param provider - The AI provider (openai, anthropic, custom, etc.)
 * @returns The normalized model name
 */
export function normalizeModelName(model: string, provider?: string): string {
  if (!model) return model;

  // Skip normalization for custom providers
  if (provider && SKIP_NORMALIZATION_PROVIDERS.has(provider.toLowerCase())) {
    return model;
  }

  // Check provider-specific aliases first
  if (provider) {
    const providerAliases = PROVIDER_MODEL_ALIASES[provider.toLowerCase()];
    if (providerAliases && providerAliases[model]) {
      return providerAliases[model];
    }
  }

  // Check all provider aliases as fallback (only if provider is not specified)
  if (!provider) {
    for (const aliases of Object.values(PROVIDER_MODEL_ALIASES)) {
      if (aliases[model]) {
        return aliases[model];
      }
    }
  }

  return model;
}

/**
 * Check if a model name is an alias that should be normalized
 *
 * @param model - The model name to check
 * @returns True if the model is an alias
 */
export function isModelAlias(model: string): boolean {
  for (const aliases of Object.values(PROVIDER_MODEL_ALIASES)) {
    if (aliases[model]) {
      return true;
    }
  }
  return false;
}

/**
 * Get the canonical model name for display purposes
 * Returns both the original and normalized names if different
 *
 * @param model - The model name
 * @param provider - The AI provider
 * @returns Object with original and normalized names
 */
export function getModelDisplayInfo(
  model: string,
  provider?: string,
): { original: string; normalized: string; isAlias: boolean } {
  const normalized = normalizeModelName(model, provider);
  return {
    original: model,
    normalized,
    isAlias: model !== normalized,
  };
}

/**
 * Strip provider prefix from model name
 *
 * OpenClaw and other clients may send model names with provider prefixes like:
 * - openai-compatible/gpt-4o -> gpt-4o
 * - openai/gpt-4o -> gpt-4o
 * - anthropic/claude-3-5-sonnet -> claude-3-5-sonnet
 *
 * This function strips the provider prefix to get the raw model name
 * that can be sent to the upstream AI provider.
 *
 * @param model - The model name (may include provider prefix)
 * @returns The model name without provider prefix
 */
export function stripProviderPrefix(model: string): string {
  if (!model) return model;

  // Check if model contains a provider prefix (format: provider/model-name)
  const slashIndex = model.indexOf('/');
  if (slashIndex > 0 && slashIndex < model.length - 1) {
    // Return the part after the slash
    return model.substring(slashIndex + 1);
  }

  return model;
}

/**
 * Normalize model name for proxy forwarding
 *
 * This function:
 * 1. Strips provider prefix (e.g., openai-compatible/gpt-4o -> gpt-4o)
 * 2. Optionally applies alias normalization
 *
 * @param model - The model name from the request
 * @param targetVendor - The target vendor for alias normalization (optional)
 * @returns The normalized model name ready for upstream
 */
export function normalizeModelForProxy(
  model: string,
  targetVendor?: string,
): string {
  if (!model) return model;

  // First strip provider prefix
  let normalized = stripProviderPrefix(model);

  // Then apply alias normalization if target vendor is specified
  if (targetVendor) {
    normalized = normalizeModelName(normalized, targetVendor);
  }

  return normalized;
}
