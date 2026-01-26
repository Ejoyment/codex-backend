const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiService {
    constructor() {
        if (!process.env.GEMINI_API_KEY) {
            console.warn('⚠️ GEMINI_API_KEY not set. AI Pair Programming will not work.');
            this.genAI = null;
            return;
        }
        
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = process.env.AI_MODEL || 'gemini-2.0-flash-exp';
        this.maxTokens = parseInt(process.env.AI_MAX_TOKENS) || 8192;
        this.temperature = parseFloat(process.env.AI_TEMPERATURE) || 0.7;
    }

    async chat(messages, codeContext = {}) {
        if (!this.genAI) {
            throw new Error('Gemini AI not configured. Please set GEMINI_API_KEY in .env');
        }

        try {
            const model = this.genAI.getGenerativeModel({ 
                model: this.model,
                generationConfig: {
                    maxOutputTokens: this.maxTokens,
                    temperature: this.temperature,
                }
            });

            // Build context-aware prompt
            const systemPrompt = this.buildSystemPrompt(codeContext);
            const conversationHistory = this.formatMessages(messages);
            
            const fullPrompt = `${systemPrompt}\n\n${conversationHistory}`;

            const result = await model.generateContent(fullPrompt);
            const response = result.response;
            const text = response.text();

            return {
                success: true,
                content: text,
                codeBlocks: this.extractCodeBlocks(text),
                fileReferences: this.extractFileReferences(text)
            };
        } catch (error) {
            console.error('Gemini AI error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async streamChat(messages, codeContext = {}, onChunk) {
        if (!this.genAI) {
            throw new Error('Gemini AI not configured');
        }

        try {
            const model = this.genAI.getGenerativeModel({ 
                model: this.model,
                generationConfig: {
                    maxOutputTokens: this.maxTokens,
                    temperature: this.temperature,
                }
            });

            const systemPrompt = this.buildSystemPrompt(codeContext);
            const conversationHistory = this.formatMessages(messages);
            const fullPrompt = `${systemPrompt}\n\n${conversationHistory}`;

            const result = await model.generateContentStream(fullPrompt);
            
            let fullText = '';
            for await (const chunk of result.stream) {
                const chunkText = chunk.text();
                fullText += chunkText;
                if (onChunk) {
                    onChunk(chunkText);
                }
            }

            return {
                success: true,
                content: fullText,
                codeBlocks: this.extractCodeBlocks(fullText),
                fileReferences: this.extractFileReferences(fullText)
            };
        } catch (error) {
            console.error('Gemini AI streaming error:', error);
            throw error;
        }
    }

    buildSystemPrompt(codeContext) {
        const { repository, files, currentFile } = codeContext;
        
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

Guidelines:
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
            files.forEach(file => {
                prompt += `- ${file.path}\n`;
            });
        }

        return prompt;
    }

    formatMessages(messages) {
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
        // Extract file paths mentioned in the text
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

    async analyzeCode(code, language, task) {
        const prompt = `Analyze this ${language} code and ${task}:

\`\`\`${language}
${code}
\`\`\`

Provide a detailed analysis.`;

        return await this.chat([{ role: 'user', content: prompt }]);
    }

    async generateCode(description, language, context = '') {
        const prompt = `Generate ${language} code for: ${description}

${context ? `Context:\n${context}\n` : ''}

Provide clean, well-commented code.`;

        return await this.chat([{ role: 'user', content: prompt }]);
    }

    async suggestFix(code, language, error) {
        const prompt = `This ${language} code has an error:

\`\`\`${language}
${code}
\`\`\`

Error: ${error}

Suggest a fix with explanation.`;

        return await this.chat([{ role: 'user', content: prompt }]);
    }

    async refactorCode(code, language, goal) {
        const prompt = `Refactor this ${language} code to ${goal}:

\`\`\`${language}
${code}
\`\`\`

Provide the refactored code with explanation.`;

        return await this.chat([{ role: 'user', content: prompt }]);
    }
}

module.exports = new GeminiService();
