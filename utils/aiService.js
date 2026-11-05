/**
 * Multi-AI Service
 * Supports: Gemini, Mistral AI, Groq, and more
 * Automatic provider selection can fail over; explicit selections stay pinned.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { providerDefinitions, implementedProviderNames } = require('../config/aiProviders');
const { parsePrivacyMode } = require('./aiPrivacy');

// Outbound LLM calls must stay bounded, including provider failover.
const AI_REQUEST_TIMEOUT_MS = parseInt(process.env.AI_REQUEST_TIMEOUT_MS, 10) || 60000;
// Agent runs need enough of the repo to make real cross-file changes. Keep the
// bounds configurable so a deployment can trade context for cost/latency.
const MAX_CONTEXT_FILES = parseInt(process.env.AI_CONTEXT_FILES, 10) || 16;
const MAX_FILE_CONTEXT_CHARS = parseInt(process.env.AI_CONTEXT_FILE_CHARS, 10) || 20000;
const MAX_TOTAL_FILE_CONTEXT_CHARS = parseInt(process.env.AI_CONTEXT_TOTAL_CHARS, 10) || 120000;

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
                        client: key === 'gemini' && definition.apiKey
                            ? new GoogleGenerativeAI(definition.apiKey)
                            : null,
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
     * A per-request provider (passed by the caller, e.g. the user's selection
     * or aiRouterService's routing decision) takes precedence over the
     * process-wide default. Previously `chat()` read only `this.provider`,
     * so aiRouterService's `provider` argument was silently discarded and
     * requests could be sent to a provider different from the caller's choice.
     */
    resolveProvider(requested) {
        const configuredProvider = this.provider && this.provider !== 'auto'
            ? this.provider
            : null;
        const provider = requested && requested !== 'auto'
            ? requested
            : configuredProvider || Object.keys(this.providers).find((key) => this.providers[key].available);

        if (!provider) {
            throw new Error('No AI provider configured. Please add an API key to the environment.');
        }
        if (!this.providers[provider]) {
            throw new Error(`AI provider "${provider}" is not supported by this service.`);
        }
        if (!this.providers[provider].available) {
            throw new Error(`AI provider "${provider}" is selected but not configured. Add its API key or select an available provider.`);
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
        const allowProviderFallback = typeof codeContext.allowProviderFallback === 'boolean'
            ? codeContext.allowProviderFallback
            : !(codeContext.provider && codeContext.provider !== 'auto') &&
                !(this.provider && this.provider !== 'auto');
        let lastError;

        while (provider) {
            const providerConfig = this.providers[provider];
            const remainingMs = deadline - Date.now();
            if (remainingMs <= 0) {
                lastError = new Error('AI request timed out');
                break;
            }

            console.log(`Using AI provider: ${providerConfig.name}`);
            try {
                const requestContext = {
                    ...codeContext,
                    timeoutMs: remainingMs,
                    signal: codeContext.signal || AbortSignal.timeout(remainingMs),
                };
                let result;
                switch (provider) {
                    case 'gemini':
                        result = await this.chatGemini(messages, requestContext);
                        break;
                    case 'mistral':
                        result = await this.chatMistral(messages, requestContext);
                        break;
                    case 'groq':
                        result = await this.chatGroq(messages, requestContext);
                        break;
                    case 'anthropic':
                        result = await this.chatAnthropic(messages, requestContext);
                        break;
                    case 'huggingface':
                        result = await this.chatHuggingFace(messages, requestContext);
                        break;
                    default:
                        throw new Error(`Unknown provider: ${provider}`);
                }
                if (!result?.success || typeof result.content !== 'string' || !result.content.trim()) {
                    throw new Error(result?.error || `${providerConfig.name} returned an empty response`);
                }
                return result;
            } catch (error) {
                lastError = error;
                tried.push(provider);
                console.error(`Error with ${provider}:`, error?.message || String(error));
                provider = allowProviderFallback ? this.getFallbackProvider(provider, tried) : null;
            }
        }

        return {
            success: false,
            error: lastError?.message || 'AI request failed: no available provider succeeded',
        };
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
        return providers.find((p) => !attempted.has(p) && this.providers[p].available);
    }

    // Gemini Implementation
    async chatGemini(messages, codeContext) {
        const config = this.providers.gemini;
        const model = config.client.getGenerativeModel({
            model: codeContext.model || config.model,
            generationConfig: {
                maxOutputTokens: parseInt(process.env.AI_MAX_TOKENS) || 8192,
                temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7,
            }
        });

        const systemMessages = messages
            .filter((message) => message.role === 'system')
            .map((message) => message.content);
        const systemPrompt = [this.buildSystemPrompt(codeContext), ...systemMessages].join('\n\n');
        const conversationHistory = this.formatMessagesForGemini(
            messages.filter((message) => message.role !== 'system')
        );
        const fullPrompt = `${systemPrompt}\n\n${conversationHistory}`;

        const result = await model.generateContent(fullPrompt, {
            timeout: codeContext.timeoutMs || AI_REQUEST_TIMEOUT_MS,
            signal: codeContext.signal || AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
        });
        const response = result.response;
        const text = response.text();

        return {
            success: true,
            content: text,
            codeBlocks: this.extractCodeBlocks(text),
            fileReferences: this.extractFileReferences(text),
            provider: 'gemini'
        };
    }

    // Mistral AI Implementation
    async chatMistral(messages, codeContext) {
        const config = this.providers.mistral;
        const systemPrompt = this.buildSystemPrompt(codeContext);
        
        const formattedMessages = [
            { role: 'system', content: systemPrompt },
            ...messages.map(m => ({
                role: m.role,
                content: m.content
            }))
        ];

        const response = await fetch(config.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify({
                model: codeContext.model || config.model,
                messages: formattedMessages,
                max_tokens: resolveMaxTokens(codeContext, parseInt(process.env.AI_MAX_TOKENS) || 8192),
                temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7
            }),
            signal: codeContext.signal || AbortSignal.timeout(codeContext.timeoutMs || AI_REQUEST_TIMEOUT_MS)
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Mistral API error: ${error}`);
        }

        const data = await response.json();
        const text = data.choices[0].message.content;

        return {
            success: true,
            content: text,
            codeBlocks: this.extractCodeBlocks(text),
            fileReferences: this.extractFileReferences(text),
            provider: 'mistral'
        };
    }

    // Groq Implementation (Fast Inference)
    async chatGroq(messages, codeContext) {
        const config = this.providers.groq;
        const systemPrompt = this.buildSystemPrompt(codeContext);
        
        const formattedMessages = [
            { role: 'system', content: systemPrompt },
            ...messages.map(m => ({
                role: m.role,
                content: m.content
            }))
        ];

        const isAgentReasoning = codeContext.agentReasoning === true;
        const isGptOss = String(codeContext.model || config.model).includes('gpt-oss');
        const availableTools = Array.isArray(codeContext.availableTools) ? codeContext.availableTools : [];
        const responseFormat = isAgentReasoning && isGptOss
            ? {
                type: 'json_schema',
                json_schema: {
                    name: 'agent_reasoning',
                    strict: true,
                    schema: {
                        type: 'object',
                        properties: {
                            thought: { type: 'string' },
                            goalAchieved: { type: 'boolean' },
                            action: {
                                type: 'object',
                                properties: {
                                    tool: { type: 'string', enum: [...availableTools, 'none'] },
                                    parameters: { type: 'string' },
                                },
                                required: ['tool', 'parameters'],
                                additionalProperties: false,
                            },
                        },
                        required: ['thought', 'goalAchieved', 'action'],
                        additionalProperties: false,
                    },
                },
            }
            : isAgentReasoning
                ? { type: 'json_object' }
                : undefined;
        const response = await fetch(config.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify({
                model: codeContext.model || config.model,
                messages: formattedMessages,
                max_tokens: resolveMaxTokens(codeContext, parseInt(process.env.AI_MAX_TOKENS) || 8192),
                temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7,
                ...(isGptOss ? { reasoning_effort: 'low' } : {}),
                ...(responseFormat ? { response_format: responseFormat } : {})
            }),
            signal: codeContext.signal || AbortSignal.timeout(codeContext.timeoutMs || AI_REQUEST_TIMEOUT_MS)
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Groq API error: ${error}`);
        }

        const data = await response.json();
        const msg = data.choices[0].message;
        if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
            throw new Error('Groq returned a native tool call, but this request uses application-managed agent tools');
        }
        const text = msg.content || msg.reasoning || '';

        return {
            success: true,
            content: text,
            codeBlocks: this.extractCodeBlocks(text),
            fileReferences: this.extractFileReferences(text),
            provider: 'groq'
        };
    }

    // Hugging Face Implementation
    async chatHuggingFace(messages, codeContext) {
        const config = this.providers.huggingface;
        const systemPrompt = this.buildSystemPrompt(codeContext);
        const systemMessages = messages
            .filter((message) => message.role === 'system')
            .map((message) => message.content);
        const conversation = messages
            .filter((message) => message.role !== 'system')
            .map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.content}`)
            .join('\n\n');
        const prompt = [
            [systemPrompt, ...systemMessages].join('\n\n'),
            conversation,
            'Assistant:',
        ].filter(Boolean).join('\n\n');

        const response = await fetch(config.endpoint + (codeContext.model || config.model), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify({
                inputs: prompt,
                parameters: {
                    max_new_tokens: resolveMaxTokens(codeContext, parseInt(process.env.AI_MAX_TOKENS) || 2048),
                    temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7,
                    return_full_text: false
                }
            }),
            signal: codeContext.signal || AbortSignal.timeout(codeContext.timeoutMs || AI_REQUEST_TIMEOUT_MS)
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Hugging Face API error: ${error}`);
        }

        const data = await response.json();
        const text = Array.isArray(data) ? data[0]?.generated_text : data?.generated_text;

        return {
            success: true,
            content: text,
            codeBlocks: this.extractCodeBlocks(text),
            fileReferences: this.extractFileReferences(text),
            provider: 'huggingface'
        };
    }

    // Anthropic Claude Implementation
    async chatAnthropic(messages, codeContext) {
        const config = this.providers.anthropic;
        // Anthropic separates the system prompt from the message array and
        // rejects an empty system string, so only send it when there is one.
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
        // Claude's structured-output contract: the agent reasoning loop expects
        // a JSON object with thought/goalAchieved/action. Anthropic wants the
        // schema described in the prompt and the output constrained with
        // max_tokens, so we ask for JSON and parse it the same way the other
        // providers are parsed downstream.
        const responseFormat = isAgentReasoning
            ? { type: 'json_object' }
            : undefined;

        const body = {
            model: codeContext.model || config.model,
            messages: conversation,
            max_tokens: resolveMaxTokens(codeContext, parseInt(process.env.AI_MAX_TOKENS) || 8192),
            temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7,
            ...(systemContent ? { system: systemContent } : {}),
            ...(responseFormat ? { response_format: responseFormat } : {}),
        };

        const response = await fetch(config.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': config.apiKey,
                'anthropic-version': config.anthropicVersion,
            },
            body: JSON.stringify(body),
            signal: codeContext.signal || AbortSignal.timeout(codeContext.timeoutMs || AI_REQUEST_TIMEOUT_MS)
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Anthropic API error: ${error}`);
        }

        const data = await response.json();
        // Claude returns content as an array of blocks; extract the text ones.
        const blocks = Array.isArray(data?.content) ? data.content : [];
        const text = blocks
            .filter((block) => block?.type === 'text' && typeof block.text === 'string')
            .map((block) => block.text)
            .join('');

        return {
            success: true,
            content: text,
            codeBlocks: this.extractCodeBlocks(text),
            fileReferences: this.extractFileReferences(text),
            provider: 'anthropic'
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
            model: config.model
        }));
    }
}

module.exports = new AIService();
