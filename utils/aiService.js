/**
 * Multi-AI Service
 * All AI calls route through OpenRouter.
 * Supports: Claude, Gemini, Mistral, Groq, Hugging Face, and more
 * via OpenRouter model names (e.g. anthropic/claude-sonnet-5.5,
 * google/gemini-3.8-flash, groq/llama-3.3-70b-versatile).
 * Automatic provider selection can fail over; explicit selections stay pinned.
 */

const { providerDefinitions, implementedProviderNames, modelForProvider, PROVIDER_TO_OPENROUTER_PREFIX } = require('../config/aiProviders');
const { parsePrivacyMode } = require('./aiPrivacy');
const { classifyAiError, retryDelayMs, sleep, DEFAULT_MAX_RETRIES } = require('./aiResilience');

// Outbound LLM calls must stay bounded, including provider failover.
const AI_REQUEST_TIMEOUT_MS = parseInt(process.env.AI_REQUEST_TIMEOUT_MS, 10) || 60000;
const AI_MAX_RETRIES = Number.isFinite(parseInt(process.env.AI_MAX_RETRIES, 10))
    ? Math.max(0, Math.min(parseInt(process.env.AI_MAX_RETRIES, 10), 5))
    : DEFAULT_MAX_RETRIES;
// A provider that just failed transiently is skipped for a short while so a
// multi-step agent run does not stall on the same dead model every iteration.
const PROVIDER_COOLDOWN_MS = parseInt(process.env.AI_PROVIDER_COOLDOWN_MS, 10) || 60000;
// A rejected key will not heal itself in a minute; stop burning requests.
const PROVIDER_AUTH_COOLDOWN_MS = parseInt(process.env.AI_PROVIDER_AUTH_COOLDOWN_MS, 10) || 300000;
// Agent runs need enough of the repo to make real cross-file changes. Keep the
// bounds configurable so a deployment can trade context for cost/latency.
const MAX_CONTEXT_FILES = parseInt(process.env.AI_CONTEXT_FILES, 10) || 16;
const MAX_FILE_CONTEXT_CHARS = parseInt(process.env.AI_CONTEXT_FILE_CHARS, 10) || 20000;
const MAX_TOTAL_FILE_CONTEXT_CHARS = parseInt(process.env.AI_CONTEXT_TOTAL_CHARS, 10) || 120000;

/**
 * Turn a non-2xx provider response into an error the retry layer understands:
 * status and Retry-After must survive so 429/503 back off correctly.
 */
async function providerHttpError(name, response) {
    let detail = '';
    try {
        detail = String(await response.text()).slice(0, 2000);
    } catch (_) {}
    const error = new Error(`${name} API error (${response.status}): ${detail || response.statusText}`);
    error.status = response.status;
    const retryAfter = response.headers?.get?.('retry-after');
    if (retryAfter) {
        const seconds = Number(retryAfter);
        if (Number.isFinite(seconds)) error.retryAfterMs = Math.max(0, seconds * 1000);
    }
    return error;
}

// Providers such as Groq count the requested output budget toward their
// tokens-per-minute limit. Callers that only need a small JSON decision (the
// agent reasoning loop) can pass a lower maxTokens so the request fits.
function resolveMaxTokens(codeContext, fallback) {
    const requested = Number(codeContext?.maxTokens);
    if (Number.isFinite(requested) && requested > 0) {
        return Math.min(Math.floor(requested), 32768);
    }
    return fallback;
}

class AIService {
    constructor() {
        this.provider = process.env.AI_PROVIDER || 'auto'; // auto, gemini, mistral, groq
        // Per-provider runtime state (failures/cooldown), used to skip a
        // provider that just returned 503 instead of retrying it every step.
        this.providerHealth = {};
        this.maxRetries = AI_MAX_RETRIES;
        this.initializeProviders();
    }

    initializeProviders() {
        const definitions = providerDefinitions();
        this.providers = Object.fromEntries(
            implementedProviderNames().map((key) => {
                const definition = definitions[key];
                return [
                    key,
                    {
                        ...definition,
                        client: null,
                    },
                ];
            })
        );

        // Log available providers
        const available = Object.entries(this.providers)
            .filter(([_, p]) => p.available)
            .map(([name, p]) => p.name);
        
        if (available.length > 0) {
            console.log(`✓ AI Providers available: ${available.join(', ')}`);
        } else {
            console.warn('⚠️ No AI providers configured. Please add API keys to .env');
        }
    }

    /**
     * Resolve which provider to use for a call.
     *
     * All cloud calls route through OpenRouter. Legacy provider keys
     * (gemini, mistral, groq, huggingface) are transparently mapped to
     * openrouter with an OpenRouter model name (e.g. provider=gemini
     * becomes openrouter + model google/gemini-3.8-flash).
     *
     * A per-request provider (passed by the caller) takes precedence over the
     * process-wide default.
     */
    resolveProvider(requested) {
        const explicit = requested && requested !== 'auto';
        const configuredProvider = this.provider && this.provider !== 'auto'
            ? this.provider
            : null;

        // Map legacy provider keys to openrouter so existing callers that
        // request provider=gemini|mistral|groq|huggingface still work — the
        // call goes through OpenRouter with the mapped model name.
        const mappedProvider = explicit && PROVIDER_TO_OPENROUTER_PREFIX[requested]
            ? 'openrouter'
            : requested;

        // An explicit request is validated strictly: never silently serve a
        // different provider than the caller named.
        if (explicit) {
            if (!this.providers[mappedProvider]) {
                throw new Error(`AI provider "${requested}" is not supported by this service.`);
            }
            if (!this.providers[mappedProvider].available) {
                throw new Error(`AI provider "${requested}" is selected but not configured. Add OPENROUTER_API_KEY or select an available provider.`);
            }
            return mappedProvider;
        }

        if (configuredProvider) {
            const mappedConfigured = PROVIDER_TO_OPENROUTER_PREFIX[configuredProvider]
                ? 'openrouter'
                : configuredProvider;
            if (!this.providers[mappedConfigured]) {
                throw new Error(`AI provider "${configuredProvider}" is not supported by this service.`);
            }
            if (this.providers[mappedConfigured].available) return mappedConfigured;
            const alternate = Object.keys(this.providers).find((key) => this.providers[key].available);
            if (alternate) {
                console.warn(`[ai] AI_PROVIDER="${configuredProvider}" is not configured; using "${alternate}"`);
                return alternate;
            }
            throw new Error(`AI provider "${configuredProvider}" is selected but not configured. Add its API key or select an available provider.`);
        }

        const provider = Object.keys(this.providers).find((key) => this.providers[key].available);
        if (!provider) {
            throw new Error('No AI provider configured. Please add an API key to the environment.');
        }
        return provider;
    }

    async chat(messages, codeContext = {}) {
        if (!codeContext || typeof codeContext !== 'object' || Array.isArray(codeContext)) {
            return { success: false, error: 'AI request context must be an object.' };
        }
        if (!Array.isArray(messages) || messages.length === 0) {
            return { success: false, error: 'AI request requires at least one message.' };
        }
        const invalidMessage = messages.find((message) =>
            !message ||
            !['system', 'user', 'assistant'].includes(message.role) ||
            typeof message.content !== 'string'
        );
        if (invalidMessage) {
            return { success: false, error: 'AI messages must have a supported role and string content.' };
        }
        if (!messages.some((message) => message.role === 'user')) {
            return { success: false, error: 'AI request requires at least one user message.' };
        }

        const requestedLocalProvider = ['ollama', 'lm-studio'].includes(codeContext.provider)
            ? codeContext.provider
            : null;
        const localPrivacyMode =
            parsePrivacyMode(process.env.LOCAL_PRIVACY_MODE) ||
            parsePrivacyMode(codeContext.localPrivacyMode);
        if (localPrivacyMode || requestedLocalProvider) {
            const configuredLocalProvider = process.env.LOCAL_AI_PROVIDER || 'ollama';
            const localProvider = requestedLocalProvider ||
                (['ollama', 'lm-studio'].includes(configuredLocalProvider)
                    ? configuredLocalProvider
                    : 'ollama');
            if (!requestedLocalProvider && configuredLocalProvider !== localProvider) {
                console.warn(`[ai] unsupported local provider "${configuredLocalProvider}"; using ollama`);
            }
            return require('./localBridge').chat(messages, codeContext, localProvider);
        }

        // Per-request provider from the router/caller.
        let provider;
        try {
            provider = this.resolveProvider(codeContext.provider);
        } catch (error) {
            return { success: false, error: error.message };
        }

        const timeoutMs = Number.isFinite(Number(codeContext.timeoutMs)) && Number(codeContext.timeoutMs) > 0
            ? Number(codeContext.timeoutMs)
            : AI_REQUEST_TIMEOUT_MS;
        const deadline = Date.now() + timeoutMs;
        const tried = Array.isArray(codeContext._tried) ? [...codeContext._tried] : [];
        // A provider preference is a preference, not a promise to fail: when
        // the chosen provider is temporarily unavailable, another configured
        // provider must be able to finish the request (deployment self-heal
        // runs unattended and cannot ask the user to try again later). Only an
        // explicit `allowProviderFallback: false` hard-pins the provider.
        const allowProviderFallback = typeof codeContext.allowProviderFallback === 'boolean'
            ? codeContext.allowProviderFallback
            : true;
        const allowModelFallback = codeContext.allowModelFallback !== false;
        let lastError;

        while (provider) {
            const providerConfig = this.providers[provider];
            const remainingMs = deadline - Date.now();
            if (remainingMs <= 0) {
                lastError = lastError || new Error('AI request timed out');
                break;
            }

            console.log(`Using AI provider: ${providerConfig.name} (${providerConfig.model})`);
            try {
                const requestContext = {
                    ...codeContext,
                    timeoutMs: remainingMs,
                    signal: codeContext.signal || AbortSignal.timeout(remainingMs),
                };
                const result = await this.requestWithRetries(
                    provider,
                    providerConfig,
                    messages,
                    requestContext,
                    { deadline, allowModelFallback }
                );
                this.markProviderSuccess(provider);
                return result;
            } catch (error) {
                lastError = error;
                tried.push(provider);
                const info = classifyAiError(error);
                this.markProviderFailure(provider, error, info);
                console.error(`Error with ${provider} (${info.kind}):`, error?.message || String(error));
                // Fail over only when the provider itself is unavailable or
                // the model is gone. A malformed request or an unknown error
                // would fail the same way everywhere; report the real error.
                const canFailover = allowProviderFallback
                    && (info.retryable || info.modelMissing || info.kind === 'auth' || error.isEmptyResponse);
                provider = canFailover ? this.getFallbackProvider(provider, tried) : null;
            }
        }

        return {
            success: false,
            error: lastError?.message || 'AI request failed: no available provider succeeded',
        };
    }

    /**
     * Models to try on one provider, in order. The primary comes from the
     * request (a pinned model) or the provider config; the rest are the
     * provider's fallback models (env-configurable). A Gemini 503 is usually
     * model-specific, so switching model inside the provider is faster than
     * switching provider.
     *
     * Model names are mapped to OpenRouter format (e.g. provider=gemini with
     * model="3.8-flash" becomes "google/gemini-3.8-flash").
     */
    modelCandidates(provider, requestedModel) {
        const config = this.providers[provider];
        if (!config) return [];
        const mappedModel = requestedModel
            ? modelForProvider(provider, requestedModel)
            : config.model;
        return [...new Set([
            mappedModel,
            ...(config.fallbackModels || []),
        ].filter(Boolean))];
    }

    /**
     * Call one provider with retries. Transient errors (429/5xx/network) are
     * retried with backoff; a missing/overloaded model moves to the provider's
     * next model; auth and token-limit errors fail immediately.
     */
    async requestWithRetries(provider, config, messages, requestContext, options = {}) {
        const { deadline, allowModelFallback } = options;
        const models = allowModelFallback
            ? this.modelCandidates(provider, requestContext.model)
            : [requestContext.model || config.model];
        const configuredRetries = Number.isFinite(Number(requestContext.aiMaxRetries))
            ? Number(requestContext.aiMaxRetries)
            : this.maxRetries;
        const maxAttempts = Math.max(1, Math.min(configuredRetries, 5) + 1);
        let lastError;

        for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
            const model = models[modelIndex];
            for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
                const remainingMs = deadline - Date.now();
                if (remainingMs <= 0) {
                    throw lastError || new Error('AI request timed out');
                }

                try {
                    const result = await this.callProvider(provider, messages, {
                        ...requestContext,
                        model,
                    });
                    if (result && result.success === false) {
                        // Providers that return an error envelope instead of
                        // throwing still carry a retryable message/status.
                        throw new Error(result.error || `${config.name} request failed`);
                    }
                    if (!result?.success || typeof result.content !== 'string' || !result.content.trim()) {
                        const empty = new Error(result?.error || `${config.name} returned an empty response`);
                        empty.isEmptyResponse = true;
                        throw empty;
                    }
                    return result;
                } catch (error) {
                    lastError = error;
                    const info = classifyAiError(error);

                    // The caller must fix a key or the prompt size; retrying
                    // here only burns the deployment's repair budget.
                    if (info.kind === 'auth' || info.kind === 'token_limit') throw error;

                    const hasNextModel = modelIndex < models.length - 1;
                    const retrySameModel = info.retryable && !error.isEmptyResponse && attempt < maxAttempts;

                    if (retrySameModel) {
                        const delay = retryDelayMs(attempt, { retryAfterMs: info.retryAfterMs });
                        if (Date.now() + delay < deadline) {
                            console.warn(
                                `[ai] ${provider}/${model} ${info.kind} failure ` +
                                `(attempt ${attempt}/${maxAttempts}); retrying in ${delay}ms`
                            );
                            await sleep(delay, requestContext.signal);
                            continue;
                        }
                    }

                    // Out of retries for this model. A provider/model-side
                    // failure can still succeed on the provider's next model.
                    if (hasNextModel && (info.retryable || info.modelMissing || error.isEmptyResponse)) {
                        console.warn(`[ai] ${provider}/${model} failed (${info.kind}); trying ${models[modelIndex + 1]}`);
                        break;
                    }
                    throw error;
                }
            }
        }

        throw lastError || new Error(`${config.name} returned no response`);
    }

    async callProvider(provider, messages, codeContext) {
        switch (provider) {
            case 'openrouter':
                return this.chatOpenRouter(messages, codeContext);
            default:
                throw new Error(`Unknown provider: ${provider}`);
        }
    }

    providerHealthEntry(name) {
        if (!this.providerHealth[name]) {
            this.providerHealth[name] = {
                failures: 0,
                cooldownUntil: 0,
                lastError: null,
                lastFailureAt: null,
                lastSuccessAt: null,
            };
        }
        return this.providerHealth[name];
    }

    isProviderCooling(name) {
        const entry = this.providerHealth[name];
        return Boolean(entry?.cooldownUntil && entry.cooldownUntil > Date.now());
    }

    markProviderSuccess(name) {
        const entry = this.providerHealthEntry(name);
        entry.failures = 0;
        entry.cooldownUntil = 0;
        entry.lastError = null;
        entry.lastSuccessAt = new Date();
    }

    markProviderFailure(name, error, info = classifyAiError(error)) {
        const entry = this.providerHealthEntry(name);
        entry.failures += 1;
        entry.lastError = String(error?.message || error || 'AI request failed').slice(0, 500);
        entry.lastFailureAt = new Date();
        if (info.kind === 'auth') {
            entry.cooldownUntil = Date.now() + PROVIDER_AUTH_COOLDOWN_MS;
        } else if (info.retryable) {
            entry.cooldownUntil = Date.now() + PROVIDER_COOLDOWN_MS;
        }
    }

    /**
     * Specialized method for code review
     */
    async reviewCode(code, language, context = {}) {
        const prompt = `Perform a comprehensive code review for the following ${language || 'source'} code.
Focus on:
1. Logic errors and bugs
2. Security vulnerabilities
3. Performance bottlenecks
4. Readability and maintainability
5. Best practices

Code to review:
\`\`\`${language || ''}
${code}
\`\`\`

Additional Context: ${context.details || 'None'}
`;
        return await this.chat([{ role: 'user', content: prompt }], { ...context, agentMode: false });
    }

    /**
     * Specialized method for debugging
     */
    async debugCode(code, language, error, context = {}) {
        const prompt = `I'm encountering an error in my ${language || 'source'} code. Please help me debug it.

Error Message:
${error || 'Not provided'}

Code Snippet:
\`\`\`${language || ''}
${code}
\`\`\`

Additional Context: ${context.details || 'None'}

Please:
1. Explain the likely cause of the error.
2. Provide a fixed version of the code.
3. Suggest how to prevent similar issues in the future.
`;
        return await this.chat([{ role: 'user', content: prompt }], { ...context, agentMode: false });
    }

    getFallbackProvider(currentProvider, tried = []) {
        const providers = Object.keys(this.providers);
        const attempted = new Set([...(Array.isArray(tried) ? tried : []), currentProvider]);
        const candidates = providers.filter((p) => !attempted.has(p) && this.providers[p].available);
        // Prefer a provider that is not cooling down from a recent outage.
        // If every candidate is cooling, still try one: a short cooldown must
        // not turn into a hard outage for an unattended repair run.
        const ready = candidates.filter((p) => !this.isProviderCooling(p));
        return (ready.length ? ready : candidates)[0];
    }

    // OpenRouter Implementation (all AI models via OpenRouter)
    // OpenRouter is OpenAI-compatible: standard messages array, Bearer auth,
    // json_object response format. All models (Claude, Gemini, Mistral, Groq,
    // etc.) are accessed via OpenRouter model names (e.g.
    // anthropic/claude-sonnet-5.5, google/gemini-3.8-flash).
    async chatOpenRouter(messages, codeContext) {
        const config = this.providers.openrouter;
        const systemMessages = messages
            .filter((message) => message.role === 'system')
            .map((message) => message.content);
        const systemContent = [this.buildSystemPrompt(codeContext), ...systemMessages]
            .filter((text) => typeof text === 'string' && text.trim())
            .join('\n\n');
        const conversation = messages
            .filter((message) => message.role !== 'system')
            .map((message) => ({
                role: message.role === 'assistant' ? 'assistant' : 'user',
                content: message.content,
            }));

        const isAgentReasoning = codeContext.agentReasoning === true;
        const availableTools = Array.isArray(codeContext.availableTools) ? codeContext.availableTools : [];
        const responseFormat = isAgentReasoning
            ? { type: 'json_object' }
            : undefined;

        const body = {
            model: codeContext.model || config.model,
            messages: systemContent ? [{ role: 'system', content: systemContent }, ...conversation] : conversation,
            max_tokens: resolveMaxTokens(codeContext, parseInt(process.env.AI_MAX_TOKENS) || 8192),
            temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7,
            ...(responseFormat ? { response_format: responseFormat } : {}),
        };

        const response = await fetch(config.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify(body),
            signal: codeContext.signal || AbortSignal.timeout(codeContext.timeoutMs || AI_REQUEST_TIMEOUT_MS)
        });

        if (!response.ok) {
            throw await providerHttpError('OpenRouter', response);
        }

        const data = await response.json();
        const msg = data.choices?.[0]?.message;
        const text = msg?.content || '';

        return {
            success: true,
            content: text,
            codeBlocks: this.extractCodeBlocks(text),
            fileReferences: this.extractFileReferences(text),
            provider: 'openrouter'
        };
    }

    buildSystemPrompt(codeContext) {
        const { repository, files, currentFile, agentMode, instructions } = codeContext || {};
        
        let prompt = `You are an expert AI pair programming assistant. You help developers write, debug, and improve code.

Your capabilities:
- Read and analyze code files
- Suggest code improvements
- Write new code
- Debug issues
- Explain code concepts
- Refactor code
- Generate tests
- Write documentation

`;

        // Add agent mode instructions if enabled
        if (agentMode && instructions) {
            prompt += `\n${instructions}\n`;
            prompt += codeContext.agentReasoning
                ? 'Do not emit native tool or function calls. Describe the next tool action only in the requested JSON response; tools are executed by the application after validating that response.\n\n'
                : 'Do not emit native tool or function calls. Return the requested plan and file-level changes as message text.\n\n';
        }

        prompt += `Guidelines:
- Always provide clear, concise explanations
- Use proper code formatting with language tags
- Reference specific files and line numbers when relevant
- Suggest best practices and patterns
- Consider performance and security
- Be helpful and encouraging

`;

        if (repository) {
            prompt += `\nCurrent Repository: ${repository.owner}/${repository.name}\n`;
            prompt += `Branch: ${repository.branch || 'main'}\n`;
        }

        if (currentFile) {
            prompt += `\nCurrent File: ${currentFile.path}\n`;
            prompt += `Language: ${currentFile.language || 'unknown'}\n`;
        }

        if (codeContext.fileManifest?.paths?.length) {
            // The manifest is the full repository shape; the files passed in
            // `files` are only the most relevant subset whose contents fit.
            prompt += `\nRepository Manifest (${codeContext.fileManifest.total || codeContext.fileManifest.paths.length} files):\n`;
            codeContext.fileManifest.paths.forEach((filePath) => {
                prompt += `- ${filePath}\n`;
            });
            if (codeContext.fileManifest.truncated) {
                prompt += '- [manifest truncated to keep the request bounded]\n';
            }
        } else if (files && files.length > 0) {
            prompt += `\nAvailable Files:\n`;
            files.slice(0, MAX_CONTEXT_FILES).forEach(file => {
                prompt += `- ${file.path}\n`;
            });
        }

        let remainingContextChars = MAX_TOTAL_FILE_CONTEXT_CHARS;
        const contextFiles = [
            ...(currentFile?.content ? [currentFile] : []),
            ...(files || []).filter((file) => typeof file.content === 'string' && file.content.length > 0),
        ].filter((file, index, allFiles) => {
            const path = file.path || file.name;
            return !path || allFiles.findIndex((candidate) => (candidate.path || candidate.name) === path) === index;
        }).slice(0, MAX_CONTEXT_FILES);
        let fileContextTruncated = false;
        if (contextFiles.length) {
            prompt += '\nRelevant File Contents:\n';
            for (const file of contextFiles) {
                const header = `\n--- ${file.path || file.name || 'current file'} ---\n`;
                const availableContentChars = Math.max(0, Math.min(
                    MAX_FILE_CONTEXT_CHARS,
                    remainingContextChars - header.length - 1
                ));
                if (availableContentChars === 0) {
                    fileContextTruncated = true;
                    break;
                }
                const content = file.content.slice(0, availableContentChars);
                prompt += `${header}${content}\n`;
                remainingContextChars -= header.length + content.length + 1;
                if (content.length < file.content.length) {
                    fileContextTruncated = true;
                    break;
                }
            }
            if (fileContextTruncated) {
                prompt += '\n[File context truncated to keep the request within a bounded size.]\n';
            }
        }

        // Add capabilities list if in agent mode
        if (agentMode && codeContext.capabilities) {
            prompt += `\nAvailable Actions:\n`;
            codeContext.capabilities.forEach(cap => {
                prompt += `- ${cap}\n`;
            });
        }

        return prompt;
    }

    formatMessagesForGemini(messages) {
        return messages.map(msg => {
            const role = msg.role === 'user' ? 'User' : 'Assistant';
            return `${role}: ${msg.content}`;
        }).join('\n\n');
    }

    extractCodeBlocks(text) {
        const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
        const blocks = [];
        let match;

        while ((match = codeBlockRegex.exec(text)) !== null) {
            blocks.push({
                language: match[1] || 'text',
                code: match[2].trim()
            });
        }

        return blocks;
    }

    extractFileReferences(text) {
        const filePathRegex = /(?:file|path):\s*([^\s,]+\.[a-z]+)/gi;
        const references = [];
        let match;

        while ((match = filePathRegex.exec(text)) !== null) {
            references.push({
                path: match[1]
            });
        }

        return references;
    }

    getProviderInfo() {
        return Object.entries(this.providers).map(([key, config]) => ({
            name: key,
            displayName: config.name,
            available: config.available,
            model: config.model,
            fallbackModels: config.fallbackModels || [],
        }));
    }

    /**
     * Safe, network-free snapshot for /api/health and the model check script.
     * Never includes API keys. `status` is 'unconfigured', 'cooling' (recent
     * transient failure, still skipped for a short while) or 'ready'.
     */
    getHealthSummary() {
        const now = Date.now();
        return {
            defaultProvider: this.provider,
            maxRetries: this.maxRetries,
            providers: this.getProviderInfo().map((provider) => {
                const entry = this.providerHealth[provider.name] || {};
                const cooling = Number(entry.cooldownUntil) > now;
                return {
                    ...provider,
                    provider: provider.name,
                    status: !provider.available ? 'unconfigured' : (cooling ? 'cooling' : 'ready'),
                    cooldownUntil: cooling ? new Date(entry.cooldownUntil).toISOString() : null,
                    lastError: entry.lastError || null,
                    lastFailureAt: entry.lastFailureAt ? new Date(entry.lastFailureAt).toISOString() : null,
                    lastSuccessAt: entry.lastSuccessAt ? new Date(entry.lastSuccessAt).toISOString() : null,
                };
            }),
        };
    }
}

module.exports = new AIService();
