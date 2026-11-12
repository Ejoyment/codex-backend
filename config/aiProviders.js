/**
 * #4 — one registry for AI providers.
 *
 * utils/aiService.js (the implementation) and utils/aiRouterService.js (the
 * selector) used to duplicate the same list with slightly different names.
 * A provider is advertised only when `implemented` is true and its API key is
 * configured; adding a name here without adding a chat method is a test
 * failure, not a silent reroute to another model.
 */
const PROVIDERS = Object.freeze({
  openrouter: Object.freeze({
    implemented: true,
    name: 'OpenRouter (Claude)',
    type: 'cloud',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    modelEnv: 'OPENROUTER_MODEL',
    defaultModel: 'anthropic/claude-sonnet-5.5',
    // Tried in order when the primary model is overloaded or retired. All
    // names are verifiable against GET /api/v1/models.
    defaultFallbackModels: [
      'google/gemini-3.8-flash',
      'deepseek/deepseek-v4.1-flash',
    ],
    fallbackModelsEnv: 'OPENROUTER_FALLBACK_MODELS',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    // OpenRouter is OpenAI-compatible: standard messages array, Bearer auth,
    // json_object response format.
  }),
  gemini: Object.freeze({
    implemented: true,
    name: 'Google Gemini',
    type: 'cloud',
    apiKeyEnv: 'GEMINI_API_KEY',
    modelEnv: 'AI_MODEL',
    defaultModel: 'gemini-3.8-flash',
    // Gemini returns 503 "model is experiencing high demand" for a single
    // model while its siblings stay healthy, so a model-level retry is the
    // difference between a working repair and a failed deployment.
    defaultFallbackModels: ['gemini-3.7-flash'],
    fallbackModelsEnv: 'GEMINI_FALLBACK_MODELS',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/',
  }),
  mistral: Object.freeze({
    implemented: true,
    name: 'Mistral AI',
    type: 'cloud',
    apiKeyEnv: 'MISTRAL_API_KEY',
    modelEnv: 'MISTRAL_MODEL',
    defaultModel: 'mistral-small-latest',
    defaultFallbackModels: ['mistral-medium-latest', 'ministral-8b-latest'],
    fallbackModelsEnv: 'MISTRAL_FALLBACK_MODELS',
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
  }),
  groq: Object.freeze({
    implemented: true,
    name: 'Groq (Fast Inference)',
    type: 'cloud',
    apiKeyEnv: 'GROQ_API_KEY',
    modelEnv: 'GROQ_MODEL',
    defaultModel: 'openai/gpt-oss-120b',
    defaultFallbackModels: ['llama-3.3-70b-versatile'],
    fallbackModelsEnv: 'GROQ_FALLBACK_MODELS',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
  }),
  huggingface: Object.freeze({
    implemented: true,
    name: 'Hugging Face',
    type: 'cloud',
    apiKeyEnv: 'HUGGINGFACE_API_KEY',
    modelEnv: 'HUGGINGFACE_MODEL',
    defaultModel: 'Qwen/Qwen3.8-27B',
    defaultFallbackModels: ['Qwen/Qwen3-32B'],
    fallbackModelsEnv: 'HUGGINGFACE_FALLBACK_MODELS',
    endpoint: 'https://api-inference.huggingface.co/models/',
  }),
});

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
};
