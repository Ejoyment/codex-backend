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
    defaultModel: 'anthropic/claude-3.5-sonnet',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    // OpenRouter is OpenAI-compatible: standard messages array, Bearer auth,
    // json_object response format. Claude models accessed via OpenRouter
    // (e.g. anthropic/claude-sonnet-4-20250514).
  }),
  gemini: Object.freeze({
    implemented: true,
    name: 'Google Gemini',
    type: 'cloud',
    apiKeyEnv: 'GEMINI_API_KEY',
    modelEnv: 'AI_MODEL',
    defaultModel: 'gemini-3.8-flash',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta2/models/',
  }),
  mistral: Object.freeze({
    implemented: true,
    name: 'Mistral AI',
    type: 'cloud',
    apiKeyEnv: 'MISTRAL_API_KEY',
    modelEnv: 'MISTRAL_MODEL',
    defaultModel: 'mistral-small-latest',
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
  }),
  groq: Object.freeze({
    implemented: true,
    name: 'Groq (Fast Inference)',
    type: 'cloud',
    apiKeyEnv: 'GROQ_API_KEY',
    modelEnv: 'GROQ_MODEL',
    defaultModel: 'llama-3.3-70b-versatile',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
  }),
  huggingface: Object.freeze({
    implemented: true,
    name: 'Hugging Face',
    type: 'cloud',
    apiKeyEnv: 'HUGGINGFACE_API_KEY',
    modelEnv: 'HUGGINGFACE_MODEL',
    defaultModel: 'Qwen/Qwen3.8-27B',
    endpoint: 'https://api-inference.huggingface.co/models/',
  }),
});

function providerDefinitions() {
  return Object.fromEntries(
    Object.entries(PROVIDERS).map(([key, definition]) => {
      const apiKey = definition.apiKeyEnv ? process.env[definition.apiKeyEnv] : null;
      return [
        key,
        {
          ...definition,
          model: process.env[definition.modelEnv] || definition.defaultModel,
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
