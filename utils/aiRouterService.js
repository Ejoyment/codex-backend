const { parsePrivacyMode } = require('./aiPrivacy');
const localBridge = require('./localBridge');

class AIRouterService {
  constructor() {
    this.localPrivacyMode = parsePrivacyMode(process.env.LOCAL_PRIVACY_MODE);
    // Only providers utils/aiService can actually serve are listed here.
    // The previous registry also advertised claude-sonnet/gpt-4o/ollama/
    // lm-studio, none of which aiService implements — every selection of one
    // of those names was silently rerouted to the first configured provider
    // (agent sockets and agent-v1 read `provider` from client payloads). Names
    // this service cannot serve are rejected rather than silently substituted.
    this.providers = {
      gemini: {
        name: 'Google Gemini',
        type: 'cloud',
        model: process.env.AI_MODEL || 'gemini-1.5-flash',
        available: !!process.env.GEMINI_API_KEY,
      },
      mistral: {
        name: 'Mistral AI',
        type: 'cloud',
        model: process.env.MISTRAL_MODEL || 'mistral-tiny',
        endpoint: 'https://api.mistral.ai/v1/chat/completions',
        available: !!process.env.MISTRAL_API_KEY,
        apiKey: process.env.MISTRAL_API_KEY,
      },
      groq: {
        name: 'Groq (Fast Completion)',
        type: 'cloud',
        model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
        endpoint: 'https://api.groq.com/openai/v1/chat/completions',
        available: !!process.env.GROQ_API_KEY,
        apiKey: process.env.GROQ_API_KEY,
      },
      huggingface: {
        name: 'Hugging Face',
        type: 'cloud',
        model: process.env.HUGGINGFACE_MODEL || 'mistralai/Mistral-7B-Instruct-v0.2',
        endpoint: 'https://api-inference.huggingface.co/models/',
        available: !!process.env.HUGGINGFACE_API_KEY,
        apiKey: process.env.HUGGINGFACE_API_KEY,
      },
    };
    this.defaultProvider = process.env.AI_PROVIDER ||
      Object.keys(this.providers).find((key) => this.providers[key].available) ||
      null;
    this.tokenUsage = { totalInput: 0, totalOutput: 0 };
    this.rateLimitMap = new Map();
  }

  setLocalPrivacyMode(enabled) {
    this.localPrivacyMode = parsePrivacyMode(enabled, this.localPrivacyMode);
    return this.localPrivacyMode;
  }

  resolveLocalProvider(requested) {
    const candidate = requested || process.env.LOCAL_AI_PROVIDER || 'ollama';
    if (candidate === 'ollama' || candidate === 'lm-studio') return candidate;
    console.warn(`[ai] unsupported local provider "${candidate}"; using ollama`);
    return 'ollama';
  }

  /**
   * Resolve an explicit request, deployment preference, or configured provider.
   * An explicit selection is never replaced by a different provider.
   */
  resolveProviderName(requested) {
    const requestedProvider = requested && requested !== 'auto' ? requested : null;
    const configuredProvider = process.env.AI_PROVIDER && process.env.AI_PROVIDER !== 'auto'
      ? process.env.AI_PROVIDER
      : null;
    const provider = requestedProvider || configuredProvider ||
      Object.keys(this.providers).find((key) => this.providers[key].available);

    if (!provider) {
      throw new Error('No AI provider configured. Add an API key for Gemini, Mistral, Groq, or Hugging Face.');
    }
    if (!this.providers[provider]) {
      throw new Error(`AI provider "${provider}" is not supported. Choose a configured provider or set AI_PROVIDER to a supported provider.`);
    }
    if (!this.providers[provider].available) {
      throw new Error(`AI provider "${provider}" is selected but not configured. Add its API key or select an available provider.`);
    }
    return { provider, substitutedFrom: null };
  }

  resolveRequestProvider(requested, localPrivacyMode) {
    const localMode = parsePrivacyMode(process.env.LOCAL_PRIVACY_MODE) ||
      parsePrivacyMode(localPrivacyMode, this.localPrivacyMode);
    const isLocalProvider = requested === 'ollama' || requested === 'lm-studio';

    if (localMode || isLocalProvider) {
      return {
        provider: this.resolveLocalProvider(isLocalProvider ? requested : null),
        localPrivacyMode: localMode,
      };
    }

    return {
      ...this.resolveProviderName(requested),
      localPrivacyMode: false,
    };
  }

  hasExplicitProviderPreference(requested) {
    const requestPreference = requested && requested !== 'auto';
    const deploymentPreference = process.env.AI_PROVIDER && process.env.AI_PROVIDER !== 'auto';
    return Boolean(requestPreference || deploymentPreference);
  }

  async validateModel(provider, model) {
    if (!model) return true;
    if (typeof model !== 'string' || !model.trim() || model.length > 200) {
      throw new Error('AI model must be a non-empty name of at most 200 characters.');
    }
    if (this.isLocalProvider(provider)) {
      const models = await localBridge.getModels(provider);
      if (!models.includes(model)) {
        throw new Error(`Model "${model}" is not currently available from ${provider}. Refresh the model list and choose a connected model.`);
      }
      return true;
    }
    const configuredModel = this.providers[provider]?.model;
    if (configuredModel !== model) {
      throw new Error(`Model "${model}" is not configured for ${provider}.`);
    }
    return true;
  }

  async routeChat(messages, codeContext = {}, options = {}) {
    const requestedProvider = options.provider || codeContext.provider;
    const { provider, localPrivacyMode } = this.resolveRequestProvider(
      requestedProvider,
      options.localPrivacyMode
    );
    const requestContext = {
      ...codeContext,
      ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    };

    await this.validateModel(provider, options.model || codeContext.model);
    if (options.model || codeContext.model) requestContext.model = options.model || codeContext.model;

    if (localPrivacyMode || this.isLocalProvider(provider)) {
      return this.routeLocal(messages, requestContext, provider);
    }

    return this.routeCloud(
      messages,
      requestContext,
      provider,
      !this.hasExplicitProviderPreference(requestedProvider)
    );
  }

  async routeCloud(messages, codeContext, provider, allowProviderFallback = false) {
    this.checkRateLimit(provider);
    const aiService = require('./aiService');
    const result = await aiService.chat(messages, {
      ...codeContext,
      localPrivacyMode: false,
      provider,
      allowProviderFallback,
    });
    this.trackTokenUsage(result);
    return result;
  }

  async routeLocal(messages, codeContext, provider) {
    const localBridge = require('./localBridge');
    const result = await localBridge.chat(messages, codeContext, provider);
    return result;
  }

  async routeToProvider(messages, codeContext, providerName) {
    const { provider, localPrivacyMode } = this.resolveRequestProvider(providerName);
    if (localPrivacyMode || this.isLocalProvider(provider)) {
      return this.routeLocal(messages, codeContext, provider);
    }

    return this.routeCloud(
      messages,
      codeContext,
      provider,
      !this.hasExplicitProviderPreference(providerName)
    );
  }

  checkRateLimit(provider) {
    const now = Date.now();
    const windowMs = 60000;
    const maxRequests = parseInt(process.env.AI_RATE_LIMIT || '60');
    const key = `${provider}:${now}`;

    const count = this.rateLimitMap.get(provider) || 0;
    if (count >= maxRequests) {
      throw new Error(`Rate limit exceeded for provider ${provider}`);
    }
    this.rateLimitMap.set(provider, count + 1);

    setTimeout(() => {
      const current = this.rateLimitMap.get(provider) || 0;
      if (current > 0) this.rateLimitMap.set(provider, current - 1);
    }, windowMs);
  }

  trackTokenUsage(result) {
    if (result.usage) {
      this.tokenUsage.totalInput += result.usage.input || 0;
      this.tokenUsage.totalOutput += result.usage.output || 0;
    }
  }

  getTokenUsage() {
    return { ...this.tokenUsage };
  }

  getAvailableProviders() {
    // Only configured providers: advertising an option the service cannot
    // serve is what produced the silent-reroute bug this registry just fixed.
    return Object.entries(this.providers)
      .filter(([, p]) => p.available)
      .map(([key, p]) => ({
        key,
        name: p.name,
        type: p.type,
        model: p.model,
      }));
  }

  getProvider(name) {
    return this.providers[name] || null;
  }

  isLocalProvider(name) {
    return name === 'ollama' || name === 'lm-studio';
  }
}

module.exports = new AIRouterService();
