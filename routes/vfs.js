/**
 * Virtual File System API Routes
 * Provides lazy loading and efficient file management
 */

const express = require('express');
const router = express.Router();
const vfs = require('../utils/virtualFileSystem');
const codeSearchService = require('../utils/codeSearchService');
const auth = require('../middleware/auth');
const permissionMatrix = require('../middleware/permissionMatrix');

/**
 * Get file tree for workspace
 * GET /api/vfs/tree/:workspaceId
 */
router.get('/tree/:workspaceId', auth, permissionMatrix.requirePermission('vfs', 'read'), async (req, res) => {
  try {
    const { workspaceId } = req.params;
    
    const tree = await vfs.getTree(workspaceId);
    
    res.json({ 
      success: true, 
      tree 
    });
  } catch (error) {
    console.error('VFS tree error:', error);
    res.status(500).json({ error: 'Failed to get file tree' });
  }
});

/**
 * Read file content (lazy loaded)
 * GET /api/vfs/file/:fileId
 */
router.get('/file/:fileId', auth, permissionMatrix.requirePermission('vfs', 'read'), async (req, res) => {
  try {
    const { fileId } = req.params;
    const { workspaceId } = req.query;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const file = await vfs.readFile(fileId, workspaceId);
    
    res.json({ 
      success: true, 
      file 
    });
  } catch (error) {
    console.error('VFS read error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Read file by path
 * GET /api/vfs/file-by-path
 */
router.get('/file-by-path', auth, async (req, res) => {
  try {
    const { path, workspaceId } = req.query;

    if (!path || !workspaceId) {
      return res.status(400).json({ error: 'path and workspaceId are required' });
    }

    const file = await vfs.readFileByPath(path, workspaceId);
    
    res.json({ 
      success: true, 
      file 
    });
  } catch (error) {
    console.error('VFS read by path error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Read file in chunks (for large files)
 * GET /api/vfs/file-chunked/:fileId
 */
router.get('/file-chunked/:fileId', auth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const { workspaceId, chunkSize } = req.query;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const chunks = await vfs.readFileChunked(
      fileId, 
      workspaceId, 
      parseInt(chunkSize) || 102400
    );
    
    res.json({ 
      success: true, 
      chunks,
      totalChunks: chunks.length
    });
  } catch (error) {
    console.error('VFS chunked read error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get file metadata (without content)
 * GET /api/vfs/metadata/:fileId
 */
router.get('/metadata/:fileId', auth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const { workspaceId } = req.query;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const metadata = await vfs.getMetadata(fileId, workspaceId);
    
    if (!metadata) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json({ 
      success: true, 
      metadata 
    });
  } catch (error) {
    console.error('VFS metadata error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Search files by name (fast, uses index)
 * GET /api/vfs/search-name
 */
router.get('/search-name', auth, async (req, res) => {
  try {
    const { query, workspaceId } = req.query;

    if (!query || !workspaceId) {
      return res.status(400).json({ error: 'query and workspaceId are required' });
    }

    const results = vfs.searchByName(query, workspaceId);
    
    res.json({ 
      success: true, 
      results,
      count: results.length
    });
  } catch (error) {
    console.error('VFS name search error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Full-text search in file content
 * GET /api/vfs/search
 */
router.get('/search', auth, permissionMatrix.requirePermission('vfs', 'search'), async (req, res) => {
  try {
    const { query, workspaceId, limit, offset } = req.query;

    if (!query || !workspaceId) {
      return res.status(400).json({ error: 'query and workspaceId are required' });
    }

    const results = await codeSearchService.search(query, workspaceId, {
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });
    
    res.json({ 
      success: true, 
      ...results
    });
  } catch (error) {
    console.error('VFS search error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Search by language
 * GET /api/vfs/search-language
 */
router.get('/search-language', auth, async (req, res) => {
  try {
    const { language, workspaceId, limit } = req.query;

    if (!language || !workspaceId) {
      return res.status(400).json({ error: 'language and workspaceId are required' });
    }

    const results = await codeSearchService.searchByLanguage(language, workspaceId, {
      limit: parseInt(limit) || 100
    });
    
    res.json({ 
      success: true, 
      ...results
    });
  } catch (error) {
    console.error('VFS language search error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get workspace statistics
 * GET /api/vfs/stats/:workspaceId
 */
router.get('/stats/:workspaceId', auth, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    
    const stats = await vfs.getStats(workspaceId);
    
    res.json({ 
      success: true, 
      stats 
    });
  } catch (error) {
    console.error('VFS stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Rebuild file index
 * POST /api/vfs/rebuild-index/:workspaceId
 */
router.post('/rebuild-index/:workspaceId', auth, permissionMatrix.requirePermission('vfs', 'index'), async (req, res) => {
  try {
    const { workspaceId } = req.params;
    
    const result = await vfs.buildIndex(workspaceId);
    
    res.json({ 
      success: true, 
      message: 'Index rebuilt successfully',
      ...result
    });
  } catch (error) {
    console.error('VFS rebuild index error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Rebuild search index
 * POST /api/vfs/rebuild-search/:workspaceId
 */
router.post('/rebuild-search/:workspaceId', auth, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    
    const result = await codeSearchService.rebuildIndex(workspaceId);
    
    res.json({ 
      success: true, 
      message: 'Search index rebuilt successfully',
      ...result
    });
  } catch (error) {
    console.error('VFS rebuild search error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Clear cache for workspace
 * POST /api/vfs/clear-cache/:workspaceId
 */
router.post('/clear-cache/:workspaceId', auth, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    
    vfs.clearCache(workspaceId);
    
    res.json({ 
      success: true, 
      message: 'Cache cleared successfully'
    });
  } catch (error) {
    console.error('VFS clear cache error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get search service stats
 * GET /api/vfs/search-stats
 */
router.get('/search-stats', auth, async (req, res) => {
  try {
    const stats = await codeSearchService.getStats();
    
    res.json({ 
      success: true, 
      stats 
    });
  } catch (error) {
    console.error('VFS search stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
