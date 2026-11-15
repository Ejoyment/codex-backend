const { providerDefinitions, implementedProviderNames, modelForProvider, PROVIDER_TO_OPENROUTER_PREFIX } = require('../config/aiProviders');
const { parsePrivacyMode } = require('./aiPrivacy');
const localBridge = require('./localBridge');

class AIRouterService {
  constructor() {
    this.localPrivacyMode = parsePrivacyMode(process.env.LOCAL_PRIVACY_MODE);
    // Only implemented providers are exposed. The registry is shared with
    // utils/aiService, so a name cannot be advertised here without a real
    // chat implementation there. Unknown/legacy names are rejected rather
    // than silently substituted.
    const definitions = providerDefinitions();
    this.providers = Object.fromEntries(
      implementedProviderNames().map((key) => {
        const definition = { ...definitions[key] };
        delete definition.apiKey;
        return [key, definition];
      })
    );
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
   * Legacy provider keys (gemini, mistral, groq, huggingface) are transparently
   * mapped to openrouter so the call goes through OpenRouter with the mapped
   * model name. An explicit selection is never replaced by a different provider.
   */
  resolveProviderName(requested) {
    const requestedProvider = requested && requested !== 'auto' ? requested : null;
    const configuredProvider = process.env.AI_PROVIDER && process.env.AI_PROVIDER !== 'auto'
      ? process.env.AI_PROVIDER
      : null;

    // Map legacy provider keys to openrouter so existing callers that
    // request provider=gemini|mistral|groq|huggingface still work — the call
    // goes through OpenRouter with the mapped model name.
    const mappedRequested = requestedProvider && PROVIDER_TO_OPENROUTER_PREFIX[requestedProvider]
      ? 'openrouter'
      : requestedProvider;
    const mappedConfigured = configuredProvider && PROVIDER_TO_OPENROUTER_PREFIX[configuredProvider]
      ? 'openrouter'
      : configuredProvider;

    // An explicit selection is never replaced by a different provider.
    if (mappedRequested) {
      if (!this.providers[mappedRequested]) {
        throw new Error(`AI provider "${requestedProvider}" is not supported. Choose a configured provider or set AI_PROVIDER to a supported provider.`);
      }
      if (!this.providers[mappedRequested].available) {
        throw new Error(`AI provider "${requestedProvider}" is selected but not configured. Add its API key or select an available provider.`);
      }
      return { provider: mappedRequested, substitutedFrom: null };
    }

    if (mappedConfigured) {
      if (!this.providers[mappedConfigured]) {
        throw new Error(`AI provider "${configuredProvider}" is not supported. Choose a configured provider or set AI_PROVIDER to a supported provider.`);
      }
      if (this.providers[mappedConfigured].available) {
        return { provider: mappedConfigured, substitutedFrom: null };
      }
      // A stale default key removal should not disable AI entirely.
      const alternate = Object.keys(this.providers).find((key) => this.providers[key].available);
      if (alternate) {
        console.warn(`[ai] AI_PROVIDER="${configuredProvider}" is not configured; using "${alternate}"`);
        return { provider: alternate, substitutedFrom: configuredProvider };
      }
      throw new Error(`AI provider "${configuredProvider}" is selected but not configured. Add its API key or select an available provider.`);
    }

    const provider = Object.keys(this.providers).find((key) => this.providers[key].available);
    if (!provider) {
      throw new Error('No AI provider configured. Add OPENROUTER_API_KEY to the environment.');
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

  /**
   * Normalize a model selection coming from a client. Older/stale UI
   * preferences can store the provider key (for example `{provider:"groq",
   * model:"groq"}`) in the model slot. That is not a real model, but treating
   * it as "use this provider's configured model" lets the run continue instead
   * of failing the whole chat with `Model "groq" is not configured for groq`.
   */
  normalizeModel(provider, model) {
    if (model === undefined || model === null) return null;
    const value = String(model).trim();
    if (!value) return null;
    // OpenRouter model names (e.g. google/gemini-4-argon) pass through as-is.
    if (value.includes('/')) return value;
    if (provider && value.toLowerCase() === String(provider).toLowerCase()) return null;
    // Cloud providers expose multiple models (primary + fallbacks).
    // Accept any of them instead of rejecting non-primary models.
    const config = this.providers[provider];
    if (config && !this.isLocalProvider(provider)) {
      const allModels = [config.model, ...(config.fallbackModels || [])];
      if (!allModels.includes(value)) return null;
    }
    return value;
  }

  async validateModel(provider, model) {
    model = this.normalizeModel(provider, model);
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

    const requestedModel = this.normalizeModel(provider, options.model || codeContext.model);
    await this.validateModel(provider, requestedModel);
    if (requestedModel) requestContext.model = requestedModel;
    else delete requestContext.model;

    if (localPrivacyMode || this.isLocalProvider(provider)) {
      return this.routeLocal(messages, requestContext, provider);
    }

    return this.routeCloud(
      messages,
      requestContext,
      provider,
      // `undefined` lets aiService apply its default (fail over on transient
      // provider outages); an explicit boolean still wins.
      typeof options.allowProviderFallback === 'boolean' ? options.allowProviderFallback : undefined
    );
  }

  async routeCloud(messages, codeContext, provider, allowProviderFallback) {
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
