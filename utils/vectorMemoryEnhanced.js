/**
 * Enhanced Vector Memory with Reranking and Smart Chunking
 */

const vectorMemory = require('./vectorMemory');
const crypto = require('crypto');

class VectorMemoryEnhanced {
    constructor() {
        this.base = vectorMemory;
    }

    /**
     * Smart chunking for code/text
     */
    chunkContent(content, options = {}) {
        const { maxChunkSize = 1000, overlap = 200 } = options;
        if (!content) return [];
        
        // For code, try to split by functions/classes
        const functionMatches = content.match(/(?:function|class|const\s+\w+\s*=|export\s+(?:function|class|const))[\s\S]{0,800}/g);
        if (functionMatches && functionMatches.length > 3) {
            return functionMatches.slice(0, 10).map(chunk => chunk.substring(0, maxChunkSize));
        }
        
        // Fallback to sliding window
        const chunks = [];
        for (let i = 0; i < content.length; i += maxChunkSize - overlap) {
            chunks.push(content.substring(i, i + maxChunkSize));
            if (i + maxChunkSize >= content.length) break;
        }
        return chunks;
    }

    /**
     * Store with smart chunking
     */
    async storeEnhanced(content, metadata = {}, userId = null, workspaceId = null) {
        const chunks = this.chunkContent(content);
        const results = [];
        for (let i = 0; i < chunks.length; i++) {
            const chunkMeta = {
                ...metadata,
                chunkIndex: i,
                totalChunks: chunks.length,
                chunkId: crypto.randomBytes(8).toString('hex')
            };
            const result = await this.base.store(chunks[i], chunkMeta, userId, workspaceId);
            results.push(result);
        }
        return results;
    }

    /**
     * Retrieve with reranking
     */
    async retrieveEnhanced(query, limit = 10, userId = null, workspaceId = null, filters = {}) {
        // Get more candidates for reranking
        const candidates = await this.base.retrieve(query, limit * 3, userId, workspaceId);
        if (!candidates || candidates.length === 0) return [];

        // Rerank based on multiple factors
        const reranked = candidates.map(candidate => {
            let score = candidate.score || 0;
            const meta = candidate.metadata || {};
            
            // Boost recent content
            if (meta.createdAt) {
                const ageHours = (Date.now() - new Date(meta.createdAt).getTime()) / (1000 * 60 * 60);
                if (ageHours < 24) score *= 1.2;
                else if (ageHours < 72) score *= 1.1;
            }
            
            // Boost same workspace
            if (workspaceId && meta.workspaceId === workspaceId) score *= 1.15;
            
            // Boost by type relevance
            if (meta.type === 'message' && filters.preferMessages) score *= 1.1;
            if (meta.type === 'meeting' && filters.preferMeetings) score *= 1.1;
            if (meta.type === 'file' && filters.preferFiles) score *= 1.1;
            
            // Boost if has task link
            if (meta.taskId) score *= 1.1;
            
            return { ...candidate, rerankedScore: score };
        });

        // Sort by reranked score
        reranked.sort((a, b) => b.rerankedScore - a.rerankedScore);
        
        // Deduplicate by content similarity
        const seen = new Set();
        const deduped = [];
        for (const item of reranked) {
            const key = (item.content || '').substring(0, 100).toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            deduped.push({ ...item, score: item.rerankedScore });
            if (deduped.length >= limit) break;
        }

        return deduped;
    }

    async store(content, metadata = {}, userId = null, workspaceId = null) {
        return this.storeEnhanced(content, metadata, userId, workspaceId);
    }

    async retrieve(query, limit = 10, userId = null, workspaceId = null) {
        return this.retrieveEnhanced(query, limit, userId, workspaceId);
    }
}

module.exports = new VectorMemoryEnhanced();
