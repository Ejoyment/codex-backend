const axios = require('axios');
const aiService = require('./aiService');

class LocalBridge {
  constructor() {
    this.ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    this.lmStudioUrl = process.env.LM_STUDIO_URL || 'http://localhost:1234';
    this.isConnected = {
      ollama: false,
      'lm-studio': false,
    };
  }

  async checkConnection(provider) {
    const baseUrl = provider === 'lm-studio' ? this.lmStudioUrl : this.ollamaUrl;
    try {
      const response = await axios.get(`${baseUrl}/api/tags`, { timeout: 3000 });
      this.isConnected[provider] = true;
      return true;
    } catch (error) {
      this.isConnected[provider] = false;
      console.error(`Local bridge connection failed for ${provider}:`, error.message);
      return false;
    }
  }

  async chat(messages, codeContext = {}, provider = 'ollama') {
    const baseUrl = provider === 'lm-studio' ? this.lmStudioUrl : this.ollamaUrl;
    const model = provider === 'lm-studio'
      ? (process.env.LM_STUDIO_MODEL || 'local-model')
      : (process.env.OLLAMA_MODEL || 'llama3');

    const systemPrompt = this.buildSystemPrompt(codeContext);
    const formattedMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    ];

    try {
      const response = await axios.post(`${baseUrl}/api/chat`, {
        model,
        messages: formattedMessages,
        stream: false,
        options: {
          temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7,
          num_predict: parseInt(process.env.AI_MAX_TOKENS) || 8192,
        },
      }, {
        timeout: 120000,
        headers: { 'Content-Type': 'application/json' },
      });

      const content = response.data?.message?.content || response.data?.response || '';

      return {
        success: true,
        content,
        codeBlocks: this.extractCodeBlocks(content),
        fileReferences: this.extractFileReferences(content),
        provider: provider,
        localMode: true,
      };
    } catch (error) {
      console.error(`Local bridge error (${provider}):`, error.message);
      return {
        success: false,
        error: error.message,
        provider,
        localMode: true,
      };
    }
  }

  async stream(messages, codeContext = {}, provider = 'ollama', onChunk) {
    const baseUrl = provider === 'lm-studio' ? this.lmStudioUrl : this.ollamaUrl;
    const model = provider === 'lm-studio'
      ? (process.env.LM_STUDIO_MODEL || 'local-model')
      : (process.env.OLLAMA_MODEL || 'llama3');

    const systemPrompt = this.buildSystemPrompt(codeContext);
    const formattedMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    ];

    try {
      const response = await axios.post(`${baseUrl}/api/chat`, {
        model,
        messages: formattedMessages,
        stream: true,
        options: {
          temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7,
          num_predict: parseInt(process.env.AI_MAX_TOKENS) || 8192,
        },
      }, {
        timeout: 120000,
        headers: { 'Content-Type': 'application/json' },
        responseType: 'stream',
      });

      let fullContent = '';
      for await (const chunk of response.data) {
        const line = chunk.toString();
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.substring(6));
          const content = data?.message?.content || data?.response || '';
          fullContent += content;
          if (onChunk) {
            onChunk(content);
          }
        }
      }

      return {
        success: true,
        content: fullContent,
        codeBlocks: this.extractCodeBlocks(fullContent),
        fileReferences: this.extractFileReferences(fullContent),
        provider,
        localMode: true,
      };
    } catch (error) {
      console.error(`Local bridge stream error (${provider}):`, error.message);
      return {
        success: false,
        error: error.message,
        provider,
        localMode: true,
      };
    }
  }

  buildSystemPrompt(codeContext) {
    const { repository, files, currentFile, agentMode, instructions } = codeContext || {};
    let prompt = `You are an expert AI pair programming assistant running locally. You help developers write, debug, and improve code.

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
- Be helpful and encouraging`;

    if (agentMode && instructions) {
      prompt += `\n\n${instructions}`;
    }

    if (repository) {
      prompt += `\n\nCurrent Repository: ${repository.owner}/${repository.name}`;
      prompt += `\nBranch: ${repository.branch || 'main'}`;
    }

    if (currentFile) {
      prompt += `\n\nCurrent File: ${currentFile.path}`;
      prompt += `\nLanguage: ${currentFile.language || 'unknown'}`;
    }

    if (files && files.length > 0) {
      prompt += '\n\nAvailable Files:';
      files.slice(0, 10).forEach(file => {
        prompt += `\n- ${file.path}`;
      });
    }

    return prompt;
  }

  extractCodeBlocks(text) {
    const regex = /```(\w+)?\n([\s\S]*?)```/g;
    const blocks = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      blocks.push({ language: match[1] || 'text', code: match[2].trim() });
    }
    return blocks;
  }

  extractFileReferences(text) {
    const regex = /(?:file|path):\s*([^\s,]+\.[a-z]+)/gi;
    const references = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      references.push({ path: match[1] });
    }
    return references;
  }

  getStatus() {
    return {
      ollama: this.isConnected.ollama,
      'lm-studio': this.isConnected['lm-studio'],
      ollamaUrl: this.ollamaUrl,
      lmStudioUrl: this.lmStudioUrl,
    };
  }
}

module.exports = new LocalBridge();