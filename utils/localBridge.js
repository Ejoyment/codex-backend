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
      const endpoint = provider === 'lm-studio' ? '/v1/models' : '/api/tags';
      await axios.get(`${baseUrl}${endpoint}`, { timeout: 3000 });
      this.isConnected[provider] = true;
      return true;
    } catch (error) {
      this.isConnected[provider] = false;
      console.error(`Local bridge connection failed for ${provider}:`, error.message);
      return false;
    }
  }

  async getModels(provider) {
    const isLmStudio = provider === 'lm-studio';
    const baseUrl = isLmStudio ? this.lmStudioUrl : this.ollamaUrl;
    const endpoint = isLmStudio ? '/v1/models' : '/api/tags';
    const response = await axios.get(`${baseUrl}${endpoint}`, { timeout: 3000 });
    const models = isLmStudio ? response.data?.data : response.data?.models;
    return (Array.isArray(models) ? models : [])
      .map((model) => (typeof model === 'string' ? model : model?.name || model?.id))
      .filter((name) => typeof name === 'string' && name.trim())
      .map((name) => name.trim());
  }

  async chat(messages, codeContext = {}, provider = 'ollama') {
    const isLmStudio = provider === 'lm-studio';
    const baseUrl = isLmStudio ? this.lmStudioUrl : this.ollamaUrl;
    const model = isLmStudio
      ? (codeContext.model || process.env.LM_STUDIO_MODEL || 'local-model')
      : (codeContext.model || process.env.OLLAMA_MODEL || 'llama3');

    const systemPrompt = this.buildSystemPrompt(codeContext);
    const systemMessages = messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content);
    const formattedMessages = [
      { role: 'system', content: [systemPrompt, ...systemMessages].join('\n\n') },
      ...messages.filter((message) => message.role !== 'system').map(m => ({
        role: m.role,
        content: m.content,
      })),
    ];

    try {
      const endpoint = isLmStudio ? '/v1/chat/completions' : '/api/chat';
      const body = isLmStudio
        ? {
          model,
          messages: formattedMessages,
          stream: false,
          temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7,
          max_tokens: parseInt(process.env.AI_MAX_TOKENS) || 8192,
        }
        : {
          model,
          messages: formattedMessages,
          stream: false,
          options: {
            temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7,
            num_predict: parseInt(process.env.AI_MAX_TOKENS) || 8192,
          },
        };
      const response = await axios.post(`${baseUrl}${endpoint}`, body, {
        timeout: codeContext.timeoutMs || 120000,
        signal: codeContext.signal,
        headers: { 'Content-Type': 'application/json' },
      });

      const content = isLmStudio
        ? response.data?.choices?.[0]?.message?.content || ''
        : response.data?.message?.content || response.data?.response || '';
      if (typeof content !== 'string' || !content.trim()) {
        throw new Error(`${provider} returned an empty response`);
      }

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
    const isLmStudio = provider === 'lm-studio';
    const baseUrl = isLmStudio ? this.lmStudioUrl : this.ollamaUrl;
    const model = isLmStudio
      ? (codeContext.model || process.env.LM_STUDIO_MODEL || 'local-model')
      : (codeContext.model || process.env.OLLAMA_MODEL || 'llama3');

    const systemPrompt = this.buildSystemPrompt(codeContext);
    const systemMessages = messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content);
    const formattedMessages = [
      { role: 'system', content: [systemPrompt, ...systemMessages].join('\n\n') },
      ...messages.filter((message) => message.role !== 'system').map(m => ({
        role: m.role,
        content: m.content,
      })),
    ];

    try {
      const endpoint = isLmStudio ? '/v1/chat/completions' : '/api/chat';
      const body = isLmStudio
        ? {
          model,
          messages: formattedMessages,
          stream: true,
          temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7,
          max_tokens: parseInt(process.env.AI_MAX_TOKENS) || 8192,
        }
        : {
          model,
          messages: formattedMessages,
          stream: true,
          options: {
            temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7,
            num_predict: parseInt(process.env.AI_MAX_TOKENS) || 8192,
          },
        };
      const timeoutMs = codeContext.timeoutMs || 120000;
      const response = await axios.post(`${baseUrl}${endpoint}`, body, {
        timeout: timeoutMs,
        signal: codeContext.signal || AbortSignal.timeout(timeoutMs),
        headers: { 'Content-Type': 'application/json' },
        responseType: 'stream',
      });

      let fullContent = '';
      let pending = '';
      const consumeLine = (line) => {
        const payload = line.trim().replace(/^data:\s*/, '');
        if (!payload || payload === '[DONE]') return;
        const data = JSON.parse(payload);
        const content = data?.message?.content ||
          data?.response ||
          data?.choices?.[0]?.delta?.content ||
          data?.choices?.[0]?.message?.content ||
          '';
        if (typeof content !== 'string' || !content) return;
        fullContent += content;
        if (onChunk) onChunk(content);
      };
      for await (const chunk of response.data) {
        pending += chunk.toString();
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() || '';
        for (const line of lines) {
          if (line.trim()) consumeLine(line);
        }
      }
      if (pending.trim()) consumeLine(pending);
      if (!fullContent.trim()) throw new Error(`${provider} returned an empty response`);

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
    return `${aiService.buildSystemPrompt(codeContext)}\n\nThis request is running on a local model. Keep all provided context within this local execution.`;
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