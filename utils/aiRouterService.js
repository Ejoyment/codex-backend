class AIRouterService {
  constructor() {
    this.defaultProvider = process.env.AI_PROVIDER || 'gemini';
    this.localPrivacyMode = !!process.env.LOCAL_PRIVACY_MODE;
    // Only providers utils/aiService can actually serve are listed here.
    // The previous registry also advertised claude-sonnet/gpt-4o/ollama/
    // lm-studio, none of which aiService implements — every selection of one
    // of those names was silently rerouted to the first configured provider
    // (agent sockets and agent-v1 read `provider` from client payloads, so
    // this was reachable by any signed-up account). Legacy names now resolve
    // through resolveProviderName() and degrade with an explicit warning.
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
    this.tokenUsage = { totalInput: 0, totalOutput: 0 };
    this.rateLimitMap = new Map();
  }

  setLocalPrivacyMode(enabled) {
    this.localPrivacyMode = Boolean(enabled);
    return this.localPrivacyMode;
  }

  /**
   * Resolve a possibly-legacy or unknown provider name to one this service can
   * serve. Never reroutes silently: when the request cannot be honored the
   * substitution is logged and reported via substitutedFrom.
   */
  resolveProviderName(requested) {
    if (!requested || requested === 'auto') {
      return { provider: this.defaultProvider, substitutedFrom: null };
    }
    if (this.providers[requested]) {
      return { provider: requested, substitutedFrom: null };
    }
    const fallback =
      this.providers[this.defaultProvider] ? this.defaultProvider
        : Object.keys(this.providers).find((key) => this.providers[key].available) || null;
    console.warn(
      `[ai] requested provider "${requested}" is not implemented by this service — using "${fallback || 'default'}" instead`
    );
    return { provider: fallback, substitutedFrom: requested };
  }

  async routeChat(messages, codeContext = {}, options = {}) {
    const { provider } = this.resolveProviderName(options.provider);
    const localMode = options.localPrivacyMode ?? this.localPrivacyMode;
    const requestContext = {
      ...codeContext,
      ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    };

    if (localMode) {
      return this.routeLocal(messages, requestContext, provider);
    }

    return this.routeCloud(messages, requestContext, provider);
  }

  async routeCloud(messages, codeContext, provider) {
    this.checkRateLimit(provider);
    const aiService = require('./aiService');
    const result = await aiService.chat(messages, { ...codeContext, localPrivacyMode: false, provider });
    this.trackTokenUsage(result);
    return result;
  }

  async routeLocal(messages, codeContext, provider) {
    const localBridge = require('./localBridge');
    const result = await localBridge.chat(messages, codeContext, provider);
    return result;
  }

  async routeToProvider(messages, codeContext, providerName) {
    const { provider } = this.resolveProviderName(providerName);
    if (!provider) {
      throw new Error('No AI provider configured. Please add API keys to .env file.');
    }

    if (this.localPrivacyMode) {
      return this.routeLocal(messages, codeContext, provider);
    }

    return this.routeCloud(messages, codeContext, provider);
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
    const provider = this.providers[name];
    return provider && provider.type === 'local';
  }
}

module.exports = new AIRouterService();
