class AIRouterService {
  constructor() {
    this.defaultProvider = process.env.AI_PROVIDER || 'gemini';
    this.localPrivacyMode = !!process.env.LOCAL_PRIVACY_MODE;
    this.providers = {
      'claude-sonnet': {
        name: 'Claude 3.5 Sonnet',
        type: 'cloud',
        model: 'claude-3-5-sonnet-20241022',
        endpoint: 'https://api.anthropic.com/v1/messages',
        available: !!process.env.ANTHROPIC_API_KEY,
        apiKey: process.env.ANTHROPIC_API_KEY,
      },
      'gpt-4o': {
        name: 'GPT-4o',
        type: 'cloud',
        model: 'gpt-4o',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        available: !!process.env.OPENAI_API_KEY,
        apiKey: process.env.OPENAI_API_KEY,
      },
      'groq': {
        name: 'Groq (Fast Completion)',
        type: 'cloud',
        model: process.env.GROQ_MODEL || 'mixtral-8x7b-32768',
        endpoint: 'https://api.groq.com/openai/v1/chat/completions',
        available: !!process.env.GROQ_API_KEY,
        apiKey: process.env.GROQ_API_KEY,
      },
      'gemini': {
        name: 'Google Gemini',
        type: 'cloud',
        model: process.env.AI_MODEL || 'gemini-1.5-flash',
        available: !!process.env.GEMINI_API_KEY,
      },
      'ollama': {
        name: 'Ollama (Local Privacy)',
        type: 'local',
        model: process.env.OLLAMA_MODEL || 'llama3',
        endpoint: process.env.OLLAMA_URL || 'http://localhost:11434',
        available: !!process.env.OLLAMA_ENABLED,
      },
      'lm-studio': {
        name: 'LM Studio (Local Privacy)',
        type: 'local',
        model: process.env.LM_STUDIO_MODEL || 'local-model',
        endpoint: process.env.LM_STUDIO_URL || 'http://localhost:1234',
        available: !!process.env.LM_STUDIO_ENABLED,
      },
    };
    this.tokenUsage = { totalInput: 0, totalOutput: 0 };
    this.rateLimitMap = new Map();
  }

  setLocalPrivacyMode(enabled) {
    this.localPrivacyMode = Boolean(enabled);
    return this.localPrivacyMode;
  }

  async routeChat(messages, codeContext = {}, options = {}) {
    const provider = options.provider || this.defaultProvider;
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
    const provider = this.providers[providerName];
    if (!provider) {
      throw new Error(`Unknown provider: ${providerName}`);
    }

    if (provider.type === 'local' || this.localPrivacyMode) {
      return this.routeLocal(messages, codeContext, providerName);
    }

    return this.routeCloud(messages, codeContext, providerName);
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
    return Object.entries(this.providers).map(([key, p]) => ({
      key,
      name: p.name,
      type: p.type,
      available: p.available,
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
