const { providerDefinitions, implementedProviderNames } = require('../config/aiProviders');

class AIRouterService {
  constructor() {
    this.defaultProvider = process.env.AI_PROVIDER || 'gemini';
    this.localPrivacyMode = !!process.env.LOCAL_PRIVACY_MODE;
    // Only implemented providers are exposed. The registry is shared with
    // utils/aiService, so a name cannot be advertised here without a real
    // chat implementation there. Unknown/legacy names still resolve through
    // resolveProviderName() and degrade with an explicit warning.
    const definitions = providerDefinitions();
    this.providers = Object.fromEntries(
      implementedProviderNames().map((key) => {
        const definition = { ...definitions[key] };
        delete definition.apiKey;
        return [key, definition];
      })
    );
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

    if (localMode) {
      return this.routeLocal(messages, codeContext, provider);
    }

    return this.routeCloud(messages, codeContext, provider);
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
