/**
 * Multi-AI Service
 * Supports: Gemini, Mistral AI, Groq, and more
 * Automatically falls back to available providers
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

class AIService {
    constructor() {
        this.provider = process.env.AI_PROVIDER || 'auto'; // auto, gemini, mistral, groq
        this.initializeProviders();
    }

    initializeProviders() {
        this.providers = {
            gemini: {
                available: !!process.env.GEMINI_API_KEY,
                client: process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null,
                model: process.env.AI_MODEL || 'gemini-1.5-flash',
                name: 'Google Gemini'
            },
            mistral: {
                available: !!process.env.MISTRAL_API_KEY,
                apiKey: process.env.MISTRAL_API_KEY,
                model: process.env.MISTRAL_MODEL || 'mistral-tiny',
                endpoint: 'https://api.mistral.ai/v1/chat/completions',
                name: 'Mistral AI'
            },
            groq: {
                available: !!process.env.GROQ_API_KEY,
                apiKey: process.env.GROQ_API_KEY,
                model: process.env.GROQ_MODEL || 'mixtral-8x7b-32768',
                endpoint: 'https://api.groq.com/openai/v1/chat/completions',
                name: 'Groq (Fast Inference)'
            },
            huggingface: {
                available: !!process.env.HUGGINGFACE_API_KEY,
                apiKey: process.env.HUGGINGFACE_API_KEY,
                model: process.env.HUGGINGFACE_MODEL || 'mistralai/Mistral-7B-Instruct-v0.2',
                endpoint: 'https://api-inference.huggingface.co/models/',
                name: 'Hugging Face'
            }
        };

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

    getAvailableProvider() {
        // If specific provider requested, use it
        if (this.provider !== 'auto' && this.providers[this.provider]?.available) {
            return this.provider;
        }

        // Auto-select first available provider
        const available = Object.keys(this.providers).find(key => this.providers[key].available);
        
        if (!available) {
            throw new Error('No AI provider configured. Please add API keys to .env file.');
        }

        return available;
    }

    async chat(messages, codeContext = {}) {
        const provider = this.getAvailableProvider();
        console.log(`Using AI provider: ${this.providers[provider].name}`);

        try {
            switch (provider) {
                case 'gemini':
                    return await this.chatGemini(messages, codeContext);
                case 'mistral':
                    return await this.chatMistral(messages, codeContext);
                case 'groq':
                    return await this.chatGroq(messages, codeContext);
                case 'huggingface':
                    return await this.chatHuggingFace(messages, codeContext);
                default:
                    throw new Error(`Unknown provider: ${provider}`);
            }
        } catch (error) {
            console.error(`Error with ${provider}:`, error.message);
            
            // Try fallback to another provider
            const fallback = this.getFallbackProvider(provider);
            if (fallback) {
                console.log(`Falling back to: ${this.providers[fallback].name}`);
                this.provider = fallback;
                return await this.chat(messages, codeContext);
            }
            
            throw error;
        }
    }

    getFallbackProvider(currentProvider) {
        const providers = Object.keys(this.providers);
        return providers.find(p => p !== currentProvider && this.providers[p].available);
    }

    // Gemini Implementation
    async chatGemini(messages, codeContext) {
        const config = this.providers.gemini;
        const model = config.client.getGenerativeModel({ 
            model: config.model,
            generationConfig: {
                maxOutputTokens: parseInt(process.env.AI_MAX_TOKENS) || 8192,
                temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7,
            }
        });

        const systemPrompt = this.buildSystemPrompt(codeContext);
        const conversationHistory = this.formatMessagesForGemini(messages);
        const fullPrompt = `${systemPrompt}\n\n${conversationHistory}`;

        const result = await model.generateContent(fullPrompt);
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
                role: m.role === 'assistant' ? 'assistant' : 'user',
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
                model: config.model,
                messages: formattedMessages,
                max_tokens: parseInt(process.env.AI_MAX_TOKENS) || 8192,
                temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7
            })
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
                role: m.role === 'assistant' ? 'assistant' : 'user',
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
                model: config.model,
                messages: formattedMessages,
                max_tokens: parseInt(process.env.AI_MAX_TOKENS) || 8192,
                temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Groq API error: ${error}`);
        }

        const data = await response.json();
        const text = data.choices[0].message.content;

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
        const lastMessage = messages[messages.length - 1];
        
        const prompt = `${systemPrompt}\n\nUser: ${lastMessage.content}\nAssistant:`;

        const response = await fetch(config.endpoint + config.model, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify({
                inputs: prompt,
                parameters: {
                    max_new_tokens: parseInt(process.env.AI_MAX_TOKENS) || 2048,
                    temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7,
                    return_full_text: false
                }
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Hugging Face API error: ${error}`);
        }

        const data = await response.json();
        const text = Array.isArray(data) ? data[0].generated_text : data.generated_text;

        return {
            success: true,
            content: text,
            codeBlocks: this.extractCodeBlocks(text),
            fileReferences: this.extractFileReferences(text),
            provider: 'huggingface'
        };
    }

    buildSystemPrompt(codeContext) {
        const { repository, files, currentFile, agentMode, instructions } = codeContext;
        
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
            prompt += `\n${instructions}\n\n`;
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

        if (files && files.length > 0) {
            prompt += `\nAvailable Files:\n`;
            files.slice(0, 10).forEach(file => {
                prompt += `- ${file.path}\n`;
            });
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
