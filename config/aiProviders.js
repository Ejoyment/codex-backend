/**
 * #4 — one registry for AI providers.
 *
 * All AI calls route through OpenRouter. Direct provider implementations
 * (Gemini, Mistral, Groq, HuggingFace) have been removed; their models are
 * accessed via OpenRouter using OpenRouter model names (e.g.
 * `google/gemini-3.8-flash`, `groq/llama-3.3-70b-versatile`).
 */
const PROVIDERS = Object.freeze({
  openrouter: Object.freeze({
    implemented: true,
    name: 'OpenRouter',
    type: 'cloud',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    modelEnv: 'OPENROUTER_MODEL',
    defaultModel: 'anthropic/claude-sonnet-5.5',
    defaultFallbackModels: [
      'google/gemini-4-argon',
      'deepseek/deepseek-v4.1-flash',
      'minimax/minimax-m3.1-flash',
    ],
    fallbackModelsEnv: 'OPENROUTER_FALLBACK_MODELS',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
  }),
  // Add virtual provider definitions so they show up in providerDefinitions()
  gemini: Object.freeze({
    implemented: true,
    name: 'Gemini (via OpenRouter)',
    type: 'cloud',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    modelEnv: 'GEMINI_MODEL',
    defaultModel: 'google/gemini-3.8-flash',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
  }),
  groq: Object.freeze({
    implemented: true,
    name: 'Groq (via OpenRouter)',
    type: 'cloud',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    modelEnv: 'GROQ_MODEL',
    defaultModel: 'groq/llama-3.3-70b-versatile',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
  }),
  mistral: Object.freeze({
    implemented: true,
    name: 'Mistral (via OpenRouter)',
    type: 'cloud',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    modelEnv: 'MISTRAL_MODEL',
    defaultModel: 'mistralai/mistral-large',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
  })
});

// Map legacy provider keys to OpenRouter model prefixes so existing code
// that requests provider=gemini|mistral|groq|huggingface still works — the
// call is transparently routed through OpenRouter with the mapped model name.
const PROVIDER_TO_OPENROUTER_PREFIX = {
  gemini: 'google/gemini',
  mistral: 'mistralai/mistral',
  groq: 'groq',
  huggingface: 'huggingface',
};

function modelForProvider(providerKey, modelName) {
  if (!modelName) return modelName;
  // Already an OpenRouter model name (contains '/'), use as-is.
  if (String(modelName).includes('/')) return modelName;
  const prefix = PROVIDER_TO_OPENROUTER_PREFIX[providerKey];
  return prefix ? `${prefix}/${modelName}` : modelName;
}

function parseModelList(raw, fallback) {
  const value = String(raw || '').trim();
  if (!value) return [...fallback];
  return value
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
}

function providerDefinitions() {
  return Object.fromEntries(
    Object.entries(PROVIDERS).map(([key, definition]) => {
      const apiKey = definition.apiKeyEnv ? process.env[definition.apiKeyEnv] : null;
      const model = process.env[definition.modelEnv] || definition.defaultModel;
      const fallbackModels = parseModelList(
        process.env[definition.fallbackModelsEnv],
        definition.defaultFallbackModels || []
      ).filter((candidate) => candidate !== model);
      return [
        key,
        {
          ...definition,
          model,
          fallbackModels,
          available: Boolean(apiKey),
          apiKey: apiKey || null,
        },
      ];
    })
  );
}

function implementedProviderNames() {
  return Object.entries(PROVIDERS)
    .filter(([, definition]) => definition.implemented)
    .map(([key]) => key);
}

function isImplementedProvider(name) {
  return Boolean(PROVIDERS[name]?.implemented);
}

module.exports = {
  PROVIDERS,
  providerDefinitions,
  implementedProviderNames,
  isImplementedProvider,
  modelForProvider,
  PROVIDER_TO_OPENROUTER_PREFIX,
};
