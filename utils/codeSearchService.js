/**
 * Code Search Service - Fast full-text search with Meilisearch
 * Alternative: Falls back to MongoDB text search if Meilisearch unavailable
 */

const { MeiliSearch } = require('meilisearch');
const CodeFile = require('../models/CodeFile');

class CodeSearchService {
  constructor() {
    this.useMeilisearch = false;
    this.client = null;
    this.index = null;

    // Try to initialize Meilisearch
    this.initializeMeilisearch();
  }

  /**
   * Initialize Meilisearch client
   */
  async initializeMeilisearch() {
    try {
      if (process.env.MEILISEARCH_HOST && process.env.MEILISEARCH_KEY) {
        this.client = new MeiliSearch({
          host: process.env.MEILISEARCH_HOST,
          apiKey: process.env.MEILISEARCH_KEY
        });

        // Test connection
        await this.client.health();

        // Get or create index
        this.index = this.client.index('code_files');
        
        // Configure searchable attributes
        await this.index.updateSettings({
          searchableAttributes: ['name', 'path', 'content'],
          filterableAttributes: ['companyId', 'language', 'createdBy'],
          sortableAttributes: ['updatedAt', 'size'],
          displayedAttributes: ['id', 'name', 'path', 'language', 'size', 'companyId']
        });

        this.useMeilisearch = true;
        console.log('✓ Meilisearch initialized successfully');
      } else {
        console.log('⚠ Meilisearch not configured, using MongoDB fallback');
      }
    } catch (error) {
      console.error('✗ Meilisearch initialization failed:', error.message);
      console.log('⚠ Falling back to MongoDB text search');
      this.useMeilisearch = false;
    }
  }

  /**
   * Index a file in Meilisearch
   */
  async indexFile(file) {
    if (!this.useMeilisearch) return;

    try {
      await this.index.addDocuments([{
        id: file._id.toString(),
        name: file.name,
        path: file.path,
        content: file.content || '',
        language: file.language || 'unknown',
        companyId: file.companyId.toString(),
        createdBy: file.createdBy?.toString(),
        size: file.size || 0,
        updatedAt: file.updatedAt?.getTime() || Date.now()
      }]);

      console.log(`Indexed file: ${file.path}`);
    } catch (error) {
      console.error('Meilisearch indexing error:', error.message);
    }
  }

  /**
   * Index multiple files in batch
   */
  async indexFiles(files) {
    if (!this.useMeilisearch) return;

    try {
      const documents = files.map(file => ({
        id: file._id.toString(),
        name: file.name,
        path: file.path,
        content: file.content || '',
        language: file.language || 'unknown',
        companyId: file.companyId.toString(),
        createdBy: file.createdBy?.toString(),
        size: file.size || 0,
        updatedAt: file.updatedAt?.getTime() || Date.now()
      }));

      await this.index.addDocuments(documents);
      console.log(`Batch indexed ${files.length} files`);
    } catch (error) {
      console.error('Meilisearch batch indexing error:', error.message);
    }
  }

  /**
   * Update file in index
   */
  async updateFile(file) {
    if (!this.useMeilisearch) return;

    try {
      await this.index.updateDocuments([{
        id: file._id.toString(),
        name: file.name,
        path: file.path,
        content: file.content || '',
        language: file.language || 'unknown',
        size: file.size || 0,
        updatedAt: file.updatedAt?.getTime() || Date.now()
      }]);

      console.log(`Updated file in index: ${file.path}`);
    } catch (error) {
      console.error('Meilisearch update error:', error.message);
    }
  }

  /**
   * Delete file from index
   */
  async deleteFile(fileId) {
    if (!this.useMeilisearch) return;

    try {
      await this.index.deleteDocument(fileId.toString());
      console.log(`Deleted file from index: ${fileId}`);
    } catch (error) {
      console.error('Meilisearch delete error:', error.message);
    }
  }

  /**
   * Search files with Meilisearch
   */
  async searchWithMeilisearch(query, workspaceId, options = {}) {
    try {
      const results = await this.index.search(query, {
        filter: `companyId = ${workspaceId}`,
        attributesToHighlight: ['content', 'name', 'path'],
        highlightPreTag: '<mark>',
        highlightPostTag: '</mark>',
        limit: options.limit || 50,
        offset: options.offset || 0
      });

      return {
        hits: results.hits.map(hit => ({
          id: hit.id,
          file: hit.name,
          path: hit.path,
          language: hit.language,
          size: hit.size,
          matches: hit._formatted?.content || hit.content,
          highlightedName: hit._formatted?.name || hit.name,
          highlightedPath: hit._formatted?.path || hit.path,
          score: hit._rankingScore
        })),
        total: results.estimatedTotalHits,
        processingTime: results.processingTimeMs
      };
    } catch (error) {
      console.error('Meilisearch search error:', error.message);
      throw error;
    }
  }

  /**
   * Search files with MongoDB (fallback)
   */
  async searchWithMongoDB(query, workspaceId, options = {}) {
    try {
      // Create text index if not exists (run once)
      await CodeFile.collection.createIndex({ 
        name: 'text', 
        path: 'text', 
        content: 'text' 
      }).catch(() => {}); // Ignore if already exists

      const results = await CodeFile.find({
        companyId: workspaceId,
        $text: { $search: query }
      })
      .select('name path language size content')
      .limit(options.limit || 50)
      .skip(options.offset || 0)
      .lean()
      .exec();

      // Simple highlighting (basic implementation)
      const highlightedResults = results.map(file => {
        const content = file.content || '';
        const queryWords = query.toLowerCase().split(' ');
        
        // Find first match
        let matchIndex = -1;
        for (const word of queryWords) {
          matchIndex = content.toLowerCase().indexOf(word);
          if (matchIndex !== -1) break;
        }

        // Extract context around match
        let matches = content;
        if (matchIndex !== -1) {
          const start = Math.max(0, matchIndex - 100);
          const end = Math.min(content.length, matchIndex + 200);
          matches = '...' + content.slice(start, end) + '...';
        }

        return {
          id: file._id.toString(),
          file: file.name,
          path: file.path,
          language: file.language,
          size: file.size,
          matches: matches,
          highlightedName: file.name,
          highlightedPath: file.path,
          score: 1
        };
      });

      return {
        hits: highlightedResults,
        total: results.length,
        processingTime: 0
      };
    } catch (error) {
      console.error('MongoDB search error:', error.message);
      throw error;
    }
  }

  /**
   * Search files (auto-selects best method)
   */
  async search(query, workspaceId, options = {}) {
    if (!query || query.trim().length === 0) {
      return { hits: [], total: 0, processingTime: 0 };
    }

    try {
      if (this.useMeilisearch) {
        return await this.searchWithMeilisearch(query, workspaceId, options);
      } else {
        return await this.searchWithMongoDB(query, workspaceId, options);
      }
    } catch (error) {
      console.error('Search error:', error.message);
      
      // Fallback to MongoDB if Meilisearch fails
      if (this.useMeilisearch) {
        console.log('Falling back to MongoDB search');
        return await this.searchWithMongoDB(query, workspaceId, options);
      }
      
      throw error;
    }
  }

  /**
   * Search by file name only (faster)
   */
  async searchByName(query, workspaceId, options = {}) {
    try {
      const results = await CodeFile.find({
        companyId: workspaceId,
        name: { $regex: query, $options: 'i' }
      })
      .select('name path language size')
      .limit(options.limit || 50)
      .lean()
      .exec();

      return {
        hits: results.map(file => ({
          id: file._id.toString(),
          file: file.name,
          path: file.path,
          language: file.language,
          size: file.size
        })),
        total: results.length
      };
    } catch (error) {
      console.error('Name search error:', error.message);
      throw error;
    }
  }

  /**
   * Search by language
   */
  async searchByLanguage(language, workspaceId, options = {}) {
    try {
      const results = await CodeFile.find({
        companyId: workspaceId,
        language: language
      })
      .select('name path language size')
      .limit(options.limit || 100)
      .lean()
      .exec();

      return {
        hits: results.map(file => ({
          id: file._id.toString(),
          file: file.name,
          path: file.path,
          language: file.language,
          size: file.size
        })),
        total: results.length
      };
    } catch (error) {
      console.error('Language search error:', error.message);
      throw error;
    }
  }

  /**
   * Rebuild entire index for workspace
   */
  async rebuildIndex(workspaceId) {
    if (!this.useMeilisearch) {
      console.log('Meilisearch not available, skipping index rebuild');
      return;
    }

    try {
      console.log(`Rebuilding search index for workspace: ${workspaceId}`);

      // Fetch all files
      const files = await CodeFile.find({ companyId: workspaceId })
        .select('name path content language size createdBy updatedAt')
        .lean()
        .exec();

      // Delete old documents for this workspace
      await this.index.deleteDocuments({
        filter: `companyId = ${workspaceId}`
      });

      // Index in batches of 100
      const batchSize = 100;
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        await this.indexFiles(batch);
      }

      console.log(`✓ Rebuilt index: ${files.length} files indexed`);
      return { success: true, filesIndexed: files.length };
    } catch (error) {
      console.error('Index rebuild error:', error.message);
      throw error;
    }
  }

  /**
   * Get search statistics
   */
  async getStats() {
    if (!this.useMeilisearch) {
      return { available: false };
    }

    try {
      const stats = await this.index.getStats();
      return {
        available: true,
        numberOfDocuments: stats.numberOfDocuments,
        isIndexing: stats.isIndexing,
        fieldDistribution: stats.fieldDistribution
      };
    } catch (error) {
      console.error('Stats error:', error.message);
      return { available: false, error: error.message };
    }
  }
}

// Singleton instance
const codeSearchService = new CodeSearchService();

module.exports = codeSearchService;
