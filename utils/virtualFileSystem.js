/**
 * Virtual File System - Lazy Loading & Efficient File Management
 * Handles large repositories without loading everything into memory
 */

const { LRUCache } = require('lru-cache');
const CodeFile = require('../models/CodeFile');

class VirtualFileSystem {
  constructor() {
    // LRU cache for recently accessed files (max 100 files, ~50MB)
    this.cache = new LRUCache({
      max: 100,
      maxSize: 50 * 1024 * 1024, // 50MB
      sizeCalculation: (value) => {
        return Buffer.byteLength(value.content || '', 'utf8');
      },
      ttl: 1000 * 60 * 30 // 30 minutes
    });

    // File index: path -> metadata (lightweight)
    this.indexes = new Map(); // workspaceId -> Map(path -> metadata)
  }

  /**
   * Build file index for a workspace (lazy loading)
   * Only loads metadata, not content
   */
  async buildIndex(workspaceId) {
    console.log(`Building VFS index for workspace: ${workspaceId}`);
    
    // Fetch only metadata (no content)
    const files = await CodeFile.find({ companyId: workspaceId })
      .select('name path language size updatedAt createdBy')
      .lean()
      .exec();

    // Create index map
    const index = new Map();
    files.forEach(file => {
      index.set(file.path, {
        id: file._id.toString(),
        name: file.name,
        path: file.path,
        size: file.size,
        language: file.language,
        lastModified: file.updatedAt,
        createdBy: file.createdBy
      });
    });

    this.indexes.set(workspaceId, index);
    
    console.log(`VFS index built: ${files.length} files`);
    return {
      fileCount: files.length,
      tree: this.buildTree(index)
    };
  }

  /**
   * Build hierarchical tree structure from flat file list
   */
  buildTree(index) {
    const tree = {
      name: 'root',
      type: 'directory',
      children: {}
    };

    index.forEach((metadata, path) => {
      const parts = path.split('/').filter(p => p);
      let current = tree.children;

      parts.forEach((part, i) => {
        if (i === parts.length - 1) {
          // File node
          current[part] = {
            name: part,
            type: 'file',
            metadata: metadata
          };
        } else {
          // Directory node
          if (!current[part]) {
            current[part] = {
              name: part,
              type: 'directory',
              children: {}
            };
          }
          current = current[part].children;
        }
      });
    });

    return tree;
  }

  /**
   * Get file tree for workspace (lazy loaded)
   */
  async getTree(workspaceId) {
    let index = this.indexes.get(workspaceId);
    
    if (!index) {
      const result = await this.buildIndex(workspaceId);
      return result.tree;
    }

    return this.buildTree(index);
  }

  /**
   * Read file content (with caching)
   */
  async readFile(fileId, workspaceId) {
    const cacheKey = `${workspaceId}:${fileId}`;

    // Check cache first
    if (this.cache.has(cacheKey)) {
      console.log(`VFS cache hit: ${fileId}`);
      return this.cache.get(cacheKey);
    }

    console.log(`VFS cache miss: ${fileId}, loading from DB`);

    // Load from database
    const file = await CodeFile.findById(fileId)
      .select('name path content language size')
      .lean()
      .exec();

    if (!file) {
      throw new Error('File not found');
    }

    // Cache the file
    this.cache.set(cacheKey, file);

    return file;
  }

  /**
   * Read file by path (with caching)
   */
  async readFileByPath(path, workspaceId) {
    const index = this.indexes.get(workspaceId);
    
    if (!index) {
      await this.buildIndex(workspaceId);
      return this.readFileByPath(path, workspaceId);
    }

    const metadata = index.get(path);
    if (!metadata) {
      throw new Error(`File not found: ${path}`);
    }

    return this.readFile(metadata.id, workspaceId);
  }

  /**
   * Write file (updates cache and index)
   */
  async writeFile(fileId, content, workspaceId) {
    const file = await CodeFile.findByIdAndUpdate(
      fileId,
      { 
        content,
        size: Buffer.byteLength(content, 'utf8'),
        updatedAt: new Date()
      },
      { new: true }
    ).lean();

    if (!file) {
      throw new Error('File not found');
    }

    // Update cache
    const cacheKey = `${workspaceId}:${fileId}`;
    this.cache.set(cacheKey, file);

    // Update index
    const index = this.indexes.get(workspaceId);
    if (index && index.has(file.path)) {
      const metadata = index.get(file.path);
      metadata.size = file.size;
      metadata.lastModified = file.updatedAt;
    }

    return file;
  }

  /**
   * Create new file (updates index)
   */
  async createFile(fileData, workspaceId) {
    const file = await CodeFile.create(fileData);

    // Update index
    const index = this.indexes.get(workspaceId);
    if (index) {
      index.set(file.path, {
        id: file._id.toString(),
        name: file.name,
        path: file.path,
        size: file.size,
        language: file.language,
        lastModified: file.updatedAt,
        createdBy: file.createdBy
      });
    }

    // Cache the file
    const cacheKey = `${workspaceId}:${file._id}`;
    this.cache.set(cacheKey, file.toObject());

    return file;
  }

  /**
   * Delete file (updates cache and index)
   */
  async deleteFile(fileId, workspaceId) {
    const file = await CodeFile.findById(fileId);
    if (!file) {
      throw new Error('File not found');
    }

    const path = file.path;

    // Delete from database
    await CodeFile.findByIdAndDelete(fileId);

    // Remove from cache
    const cacheKey = `${workspaceId}:${fileId}`;
    this.cache.delete(cacheKey);

    // Remove from index
    const index = this.indexes.get(workspaceId);
    if (index) {
      index.delete(path);
    }

    return { success: true, path };
  }

  /**
   * Search files by name (fast, uses index)
   */
  searchByName(query, workspaceId) {
    const index = this.indexes.get(workspaceId);
    if (!index) {
      return [];
    }

    const results = [];
    const lowerQuery = query.toLowerCase();

    index.forEach((metadata, path) => {
      if (metadata.name.toLowerCase().includes(lowerQuery)) {
        results.push(metadata);
      }
    });

    return results.slice(0, 50); // Limit to 50 results
  }

  /**
   * Get file metadata without loading content
   */
  async getMetadata(fileId, workspaceId) {
    const index = this.indexes.get(workspaceId);
    
    if (index) {
      // Search in index first
      for (const [path, metadata] of index) {
        if (metadata.id === fileId) {
          return metadata;
        }
      }
    }

    // Fallback to database
    const file = await CodeFile.findById(fileId)
      .select('name path language size updatedAt createdBy')
      .lean()
      .exec();

    return file ? {
      id: file._id.toString(),
      name: file.name,
      path: file.path,
      size: file.size,
      language: file.language,
      lastModified: file.updatedAt,
      createdBy: file.createdBy
    } : null;
  }

  /**
   * Get workspace statistics
   */
  async getStats(workspaceId) {
    const index = this.indexes.get(workspaceId);
    
    if (!index) {
      await this.buildIndex(workspaceId);
      return this.getStats(workspaceId);
    }

    const stats = {
      totalFiles: index.size,
      totalSize: 0,
      byLanguage: {},
      cacheHitRate: this.cache.size / Math.max(index.size, 1)
    };

    index.forEach((metadata) => {
      stats.totalSize += metadata.size || 0;
      
      const lang = metadata.language || 'unknown';
      stats.byLanguage[lang] = (stats.byLanguage[lang] || 0) + 1;
    });

    return stats;
  }

  /**
   * Clear cache for workspace
   */
  clearCache(workspaceId) {
    const keysToDelete = [];
    
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${workspaceId}:`)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
    
    console.log(`Cleared ${keysToDelete.length} cached files for workspace ${workspaceId}`);
  }

  /**
   * Invalidate index (force rebuild on next access)
   */
  invalidateIndex(workspaceId) {
    this.indexes.delete(workspaceId);
    this.clearCache(workspaceId);
    console.log(`Invalidated VFS index for workspace ${workspaceId}`);
  }

  /**
   * Chunk large file for streaming
   */
  async readFileChunked(fileId, workspaceId, chunkSize = 1024 * 100) {
    const file = await this.readFile(fileId, workspaceId);
    const content = file.content || '';
    const chunks = [];

    for (let i = 0; i < content.length; i += chunkSize) {
      chunks.push({
        index: Math.floor(i / chunkSize),
        data: content.slice(i, i + chunkSize),
        isLast: i + chunkSize >= content.length
      });
    }

    return chunks;
  }
}

// Singleton instance
const vfs = new VirtualFileSystem();

module.exports = vfs;
