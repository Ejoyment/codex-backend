/**
 * Vector Memory System
 * 
 * Provides long-term context retention for the AI agent using embeddings.
 * Stores code snippets, patterns, and solutions for semantic search.
 * 
 * Supports multiple backends:
 * - In-Memory (Development)
 * - MongoDB Atlas Vector Search (Production)
 * - Pinecone (Optional)
 * - Weaviate (Optional)
 */

class VectorMemory {
    constructor() {
        this.backend = process.env.VECTOR_BACKEND || 'memory'; // memory, mongodb, pinecone, weaviate
        this.embeddingModel = process.env.EMBEDDING_MODEL || 'text-embedding-ada-002';
        this.initialize();
    }

    async initialize() {
        switch (this.backend) {
            case 'mongodb':
                await this.initializeMongoDBVectorSearch();
                break;
            case 'pinecone':
                await this.initializePinecone();
                break;
            case 'weaviate':
                await this.initializeWeaviate();
                break;
            default:
                this.initializeInMemory();
        }
        
        console.log(`✓ Vector Memory initialized with ${this.backend} backend`);
    }

    /**
     * In-Memory Vector Store (Development)
     */
    initializeInMemory() {
        this.store = [];
        this.backend = 'memory';
    }

    /**
     * MongoDB Atlas Vector Search (Production)
     */
    async initializeMongoDBVectorSearch() {
        const mongoose = require('mongoose');
        
        // Create vector memory schema
        const vectorMemorySchema = new mongoose.Schema({
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
            workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
            content: { type: String, required: true },
            embedding: { type: [Number], required: true },
            metadata: {
                type: { type: String }, // code_snippet, pattern, solution, error_fix
                language: String,
                fileName: String,
                timestamp: Date,
                tags: [String],
                context: String
            },
            createdAt: { type: Date, default: Date.now }
        });

        // Create vector search index (run once in MongoDB Atlas)
        // db.vectormemories.createIndex(
        //   { embedding: "vectorSearch" },
        //   { name: "vector_index", vectorSearchOptions: { dimensions: 1536, similarity: "cosine" } }
        // )

        this.VectorMemory = mongoose.model('VectorMemory', vectorMemorySchema);
    }

    /**
     * Pinecone Vector Database
     */
    async initializePinecone() {
        if (!process.env.PINECONE_API_KEY) {
            console.warn('⚠️ Pinecone API key not found, falling back to in-memory');
            return this.initializeInMemory();
        }

        const { PineconeClient } = require('@pinecone-database/pinecone');
        this.pinecone = new PineconeClient();
        
        await this.pinecone.init({
            apiKey: process.env.PINECONE_API_KEY,
            environment: process.env.PINECONE_ENVIRONMENT || 'us-west1-gcp'
        });

        this.index = this.pinecone.Index(process.env.PINECONE_INDEX || 'code-memory');
    }

    /**
     * Weaviate Vector Database
     */
    async initializeWeaviate() {
        if (!process.env.WEAVIATE_URL) {
            console.warn('⚠️ Weaviate URL not found, falling back to in-memory');
            return this.initializeInMemory();
        }

        const weaviate = require('weaviate-ts-client');
        this.weaviate = weaviate.client({
            scheme: 'https',
            host: process.env.WEAVIATE_URL,
            apiKey: new weaviate.ApiKey(process.env.WEAVIATE_API_KEY)
        });
    }

    /**
     * Generate embedding for text
     */
    async generateEmbedding(text) {
        // Use OpenAI embeddings (or alternative)
        if (process.env.OPENAI_API_KEY) {
            return await this.generateOpenAIEmbedding(text);
        }
        
        // Fallback: Simple hash-based embedding (not recommended for production)
        return this.generateSimpleEmbedding(text);
    }

    async generateOpenAIEmbedding(text) {
        const response = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: this.embeddingModel,
                input: text
            })
        });

        const data = await response.json();
        return data.data[0].embedding;
    }

    generateSimpleEmbedding(text) {
        // Simple TF-IDF-like embedding (1536 dimensions to match OpenAI)
        const embedding = new Array(1536).fill(0);
        const words = text.toLowerCase().split(/\W+/);
        
        words.forEach((word, index) => {
            const hash = this.simpleHash(word);
            embedding[hash % 1536] += 1;
        });

        // Normalize
        const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
        return embedding.map(val => magnitude > 0 ? val / magnitude : 0);
    }

    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash);
    }

    /**
     * Store code snippet or pattern
     */
    async store(content, metadata, userId, workspaceId = null) {
        const embedding = await this.generateEmbedding(content);

        switch (this.backend) {
            case 'mongodb':
                return await this.storeInMongoDB(content, embedding, metadata, userId, workspaceId);
            case 'pinecone':
                return await this.storeInPinecone(content, embedding, metadata, userId, workspaceId);
            case 'weaviate':
                return await this.storeInWeaviate(content, embedding, metadata, userId, workspaceId);
            default:
                return this.storeInMemory(content, embedding, metadata, userId, workspaceId);
        }
    }

    async storeInMongoDB(content, embedding, metadata, userId, workspaceId) {
        const memory = await this.VectorMemory.create({
            userId,
            workspaceId,
            content,
            embedding,
            metadata: {
                ...metadata,
                timestamp: new Date()
            }
        });

        return {
            success: true,
            id: memory._id,
            message: 'Stored in MongoDB Vector Search'
        };
    }

    async storeInPinecone(content, embedding, metadata, userId, workspaceId) {
        const id = `${userId}_${Date.now()}`;
        
        await this.index.upsert({
            upsertRequest: {
                vectors: [{
                    id,
                    values: embedding,
                    metadata: {
                        content,
                        userId: userId.toString(),
                        workspaceId: workspaceId?.toString(),
                        ...metadata
                    }
                }]
            }
        });

        return {
            success: true,
            id,
            message: 'Stored in Pinecone'
        };
    }

    async storeInWeaviate(content, embedding, metadata, userId, workspaceId) {
        const result = await this.weaviate
            .data
            .creator()
            .withClassName('CodeMemory')
            .withProperties({
                content,
                userId: userId.toString(),
                workspaceId: workspaceId?.toString(),
                ...metadata
            })
            .withVector(embedding)
            .do();

        return {
            success: true,
            id: result.id,
            message: 'Stored in Weaviate'
        };
    }

    storeInMemory(content, embedding, metadata, userId, workspaceId) {
        const id = `mem_${Date.now()}`;
        
        this.store.push({
            id,
            content,
            embedding,
            metadata: {
                ...metadata,
                userId,
                workspaceId,
                timestamp: new Date()
            }
        });

        return {
            success: true,
            id,
            message: 'Stored in memory'
        };
    }

    /**
     * Retrieve similar code snippets
     */
    async retrieve(query, k = 5, userId = null, workspaceId = null) {
        const queryEmbedding = await this.generateEmbedding(query);

        switch (this.backend) {
            case 'mongodb':
                return await this.retrieveFromMongoDB(queryEmbedding, k, userId, workspaceId);
            case 'pinecone':
                return await this.retrieveFromPinecone(queryEmbedding, k, userId, workspaceId);
            case 'weaviate':
                return await this.retrieveFromWeaviate(queryEmbedding, k, userId, workspaceId);
            default:
                return this.retrieveFromMemory(queryEmbedding, k, userId, workspaceId);
        }
    }

    async retrieveFromMongoDB(queryEmbedding, k, userId, workspaceId) {
        // MongoDB Atlas Vector Search
        const pipeline = [
            {
                $vectorSearch: {
                    index: 'vector_index',
                    path: 'embedding',
                    queryVector: queryEmbedding,
                    numCandidates: k * 10,
                    limit: k
                }
            }
        ];

        // Add filters
        if (userId) {
            pipeline.push({ $match: { userId } });
        }
        if (workspaceId) {
            pipeline.push({ $match: { workspaceId } });
        }

        const results = await this.VectorMemory.aggregate(pipeline);

        return results.map(r => ({
            id: r._id,
            content: r.content,
            metadata: r.metadata,
            score: r.score
        }));
    }

    async retrieveFromPinecone(queryEmbedding, k, userId, workspaceId) {
        const filter = {};
        if (userId) filter.userId = userId.toString();
        if (workspaceId) filter.workspaceId = workspaceId.toString();

        const queryResponse = await this.index.query({
            queryRequest: {
                vector: queryEmbedding,
                topK: k,
                includeMetadata: true,
                filter
            }
        });

        return queryResponse.matches.map(match => ({
            id: match.id,
            content: match.metadata.content,
            metadata: match.metadata,
            score: match.score
        }));
    }

    async retrieveFromWeaviate(queryEmbedding, k, userId, workspaceId) {
        let query = this.weaviate
            .graphql
            .get()
            .withClassName('CodeMemory')
            .withFields('content metadata { type language fileName }')
            .withNearVector({ vector: queryEmbedding })
            .withLimit(k);

        if (userId) {
            query = query.withWhere({
                path: ['userId'],
                operator: 'Equal',
                valueString: userId.toString()
            });
        }

        const result = await query.do();

        return result.data.Get.CodeMemory.map(item => ({
            content: item.content,
            metadata: item.metadata,
            score: item._additional?.certainty
        }));
    }

    retrieveFromMemory(queryEmbedding, k, userId, workspaceId) {
        // Calculate cosine similarity
        let results = this.store.map(item => {
            // Filter by user/workspace
            if (userId && item.metadata.userId.toString() !== userId.toString()) {
                return null;
            }
            if (workspaceId && item.metadata.workspaceId?.toString() !== workspaceId.toString()) {
                return null;
            }

            const similarity = this.cosineSimilarity(queryEmbedding, item.embedding);
            return {
                ...item,
                score: similarity
            };
        }).filter(Boolean);

        // Sort by similarity and return top k
        results.sort((a, b) => b.score - a.score);
        return results.slice(0, k);
    }

    cosineSimilarity(a, b) {
        let dotProduct = 0;
        let magnitudeA = 0;
        let magnitudeB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            magnitudeA += a[i] * a[i];
            magnitudeB += b[i] * b[i];
        }

        magnitudeA = Math.sqrt(magnitudeA);
        magnitudeB = Math.sqrt(magnitudeB);

        if (magnitudeA === 0 || magnitudeB === 0) return 0;
        return dotProduct / (magnitudeA * magnitudeB);
    }

    /**
     * Delete memory
     */
    async delete(id) {
        switch (this.backend) {
            case 'mongodb':
                await this.VectorMemory.findByIdAndDelete(id);
                break;
            case 'pinecone':
                await this.index.delete1({ ids: [id] });
                break;
            case 'weaviate':
                await this.weaviate.data.deleter().withId(id).do();
                break;
            default:
                this.store = this.store.filter(item => item.id !== id);
        }

        return { success: true, message: 'Memory deleted' };
    }

    /**
     * Clear all memories for a user/workspace
     */
    async clear(userId, workspaceId = null) {
        switch (this.backend) {
            case 'mongodb':
                const query = { userId };
                if (workspaceId) query.workspaceId = workspaceId;
                await this.VectorMemory.deleteMany(query);
                break;
            case 'pinecone':
                // Pinecone doesn't support bulk delete by metadata, need to query first
                const results = await this.retrieve('', 10000, userId, workspaceId);
                const ids = results.map(r => r.id);
                if (ids.length > 0) {
                    await this.index.delete1({ ids });
                }
                break;
            case 'weaviate':
                // Similar limitation
                break;
            default:
                this.store = this.store.filter(item => {
                    if (item.metadata.userId.toString() !== userId.toString()) return true;
                    if (workspaceId && item.metadata.workspaceId?.toString() !== workspaceId.toString()) return true;
                    return false;
                });
        }

        return { success: true, message: 'Memories cleared' };
    }

    /**
     * Get statistics
     */
    async getStats(userId, workspaceId = null) {
        switch (this.backend) {
            case 'mongodb':
                const query = { userId };
                if (workspaceId) query.workspaceId = workspaceId;
                const count = await this.VectorMemory.countDocuments(query);
                return { total: count, backend: 'mongodb' };
            default:
                const filtered = this.store.filter(item => {
                    if (item.metadata.userId.toString() !== userId.toString()) return false;
                    if (workspaceId && item.metadata.workspaceId?.toString() !== workspaceId.toString()) return false;
                    return true;
                });
                return { total: filtered.length, backend: 'memory' };
        }
    }
}

module.exports = new VectorMemory();
