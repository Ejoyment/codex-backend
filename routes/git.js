/**
 * Git API Routes
 * Provides version control operations
 */

const express = require('express');
const router = express.Router();
const gitService = require('../utils/gitService');
const { authenticateToken } = require('../middleware/auth');
const permissionMatrix = require('../middleware/permissionMatrix');

/**
 * Initialize repository
 * POST /api/git/init
 */
router.post('/init', authenticateToken, async (req, res) => {
  try {
    const { workspaceId, userName, userEmail } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const result = await gitService.init(workspaceId, { userName, userEmail });
    res.json(result);
  } catch (error) {
    console.error('Git init error:', error);
    res.status(500).json({ error: 'Failed to initialize repository' });
  }
});

/**
 * Get repository status
 * GET /api/git/status/:workspaceId
 */
router.get('/status/:workspaceId', authenticateToken, permissionMatrix.requirePermission('git', 'read'), async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const result = await gitService.status(workspaceId);
    res.json(result);
  } catch (error) {
    console.error('Git status error:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

/**
 * Get diff
 * GET /api/git/diff/:workspaceId
 */
router.get('/diff/:workspaceId', authenticateToken, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { file } = req.query;
    
    const result = await gitService.diff(workspaceId, file);
    res.json(result);
  } catch (error) {
    console.error('Git diff error:', error);
    res.status(500).json({ error: 'Failed to get diff' });
  }
});

/**
 * Stage files
 * POST /api/git/add
 */
router.post('/add', authenticateToken, async (req, res) => {
  try {
    const { workspaceId, files } = req.body;

    if (!workspaceId || !files) {
      return res.status(400).json({ error: 'workspaceId and files are required' });
    }

    const result = await gitService.add(workspaceId, files);
    res.json(result);
  } catch (error) {
    console.error('Git add error:', error);
    res.status(500).json({ error: 'Failed to stage files' });
  }
});

/**
 * Unstage files
 * POST /api/git/reset
 */
router.post('/reset', authenticateToken, async (req, res) => {
  try {
    const { workspaceId, files } = req.body;

    if (!workspaceId || !files) {
      return res.status(400).json({ error: 'workspaceId and files are required' });
    }

    const result = await gitService.reset(workspaceId, files);
    res.json(result);
  } catch (error) {
    console.error('Git reset error:', error);
    res.status(500).json({ error: 'Failed to unstage files' });
  }
});

/**
 * Commit changes
 * POST /api/git/commit
 */
router.post('/commit', authenticateToken, permissionMatrix.requirePermission('git', 'commit'), async (req, res) => {
  try {
    const { workspaceId, message, files } = req.body;

    if (!workspaceId || !message) {
      return res.status(400).json({ error: 'workspaceId and message are required' });
    }

    const result = await gitService.commit(workspaceId, message, files);
    res.json(result);
  } catch (error) {
    console.error('Git commit error:', error);
    res.status(500).json({ error: 'Failed to commit changes' });
  }
});

/**
 * Get commit log
 * GET /api/git/log/:workspaceId
 */
router.get('/log/:workspaceId', authenticateToken, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { limit, file } = req.query;

    const result = await gitService.log(workspaceId, {
      limit: parseInt(limit) || 50,
      file
    });
    res.json(result);
  } catch (error) {
    console.error('Git log error:', error);
    res.status(500).json({ error: 'Failed to get commit log' });
  }
});

/**
 * List branches
 * GET /api/git/branches/:workspaceId
 */
router.get('/branches/:workspaceId', authenticateToken, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const result = await gitService.branches(workspaceId);
    res.json(result);
  } catch (error) {
    console.error('Git branches error:', error);
    res.status(500).json({ error: 'Failed to list branches' });
  }
});

/**
 * Create branch
 * POST /api/git/branch
 */
router.post('/branch', authenticateToken, permissionMatrix.requirePermission('git', 'branch'), async (req, res) => {
  try {
    const { workspaceId, branchName } = req.body;

    if (!workspaceId || !branchName) {
      return res.status(400).json({ error: 'workspaceId and branchName are required' });
    }

    const result = await gitService.createBranch(workspaceId, branchName);
    res.json(result);
  } catch (error) {
    console.error('Git create branch error:', error);
    res.status(500).json({ error: 'Failed to create branch' });
  }
});

/**
 * Switch branch
 * POST /api/git/checkout
 */
router.post('/checkout', authenticateToken, async (req, res) => {
  try {
    const { workspaceId, branchName } = req.body;

    if (!workspaceId || !branchName) {
      return res.status(400).json({ error: 'workspaceId and branchName are required' });
    }

    const result = await gitService.checkout(workspaceId, branchName);
    res.json(result);
  } catch (error) {
    console.error('Git checkout error:', error);
    res.status(500).json({ error: 'Failed to switch branch' });
  }
});

/**
 * Merge branch
 * POST /api/git/merge
 */
router.post('/merge', authenticateToken, async (req, res) => {
  try {
    const { workspaceId, branchName } = req.body;

    if (!workspaceId || !branchName) {
      return res.status(400).json({ error: 'workspaceId and branchName are required' });
    }

    const result = await gitService.merge(workspaceId, branchName);
    res.json(result);
  } catch (error) {
    console.error('Git merge error:', error);
    res.status(500).json({ error: 'Failed to merge branch' });
  }
});

/**
 * Pull from remote
 * POST /api/git/pull
 */
router.post('/pull', authenticateToken, permissionMatrix.requirePermission('git', 'pull'), async (req, res) => {
  try {
    const { workspaceId, remote, branch } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const result = await gitService.pull(workspaceId, remote, branch);
    res.json(result);
  } catch (error) {
    console.error('Git pull error:', error);
    res.status(500).json({ error: 'Failed to pull from remote' });
  }
});

/**
 * Push to remote
 * POST /api/git/push
 */
router.post('/push', authenticateToken, permissionMatrix.requirePermission('git', 'push'), async (req, res) => {
  try {
    const { workspaceId, remote, branch } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const result = await gitService.push(workspaceId, remote, branch);
    res.json(result);
  } catch (error) {
    console.error('Git push error:', error);
    res.status(500).json({ error: 'Failed to push to remote' });
  }
});

/**
 * Add remote
 * POST /api/git/remote
 */
router.post('/remote', authenticateToken, async (req, res) => {
  try {
    const { workspaceId, name, url } = req.body;

    if (!workspaceId || !name || !url) {
      return res.status(400).json({ error: 'workspaceId, name, and url are required' });
    }

    const result = await gitService.addRemote(workspaceId, name, url);
    res.json(result);
  } catch (error) {
    console.error('Git add remote error:', error);
    res.status(500).json({ error: 'Failed to add remote' });
  }
});

/**
 * List remotes
 * GET /api/git/remotes/:workspaceId
 */
router.get('/remotes/:workspaceId', authenticateToken, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const result = await gitService.remotes(workspaceId);
    res.json(result);
  } catch (error) {
    console.error('Git remotes error:', error);
    res.status(500).json({ error: 'Failed to list remotes' });
  }
});

/**
 * Clone repository
 * POST /api/git/clone
 */
router.post('/clone', authenticateToken, async (req, res) => {
  try {
    const { workspaceId, repoUrl, args } = req.body;

    if (!workspaceId || !repoUrl) {
      return res.status(400).json({ error: 'workspaceId and repoUrl are required' });
    }

    const result = await gitService.clone(workspaceId, repoUrl, { args });
    res.json(result);
  } catch (error) {
    console.error('Git clone error:', error);
    res.status(500).json({ error: 'Failed to clone repository' });
  }
});

/**
 * Get file at commit
 * GET /api/git/show/:workspaceId
 */
router.get('/show/:workspaceId', authenticateToken, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { commit, file } = req.query;

    if (!commit || !file) {
      return res.status(400).json({ error: 'commit and file are required' });
    }

    const result = await gitService.show(workspaceId, commit, file);
    res.json(result);
  } catch (error) {
    console.error('Git show error:', error);
    res.status(500).json({ error: 'Failed to get file content' });
  }
});

/**
 * Stash changes
 * POST /api/git/stash
 */
router.post('/stash', authenticateToken, async (req, res) => {
  try {
    const { workspaceId, message } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const result = await gitService.stash(workspaceId, message);
    res.json(result);
  } catch (error) {
    console.error('Git stash error:', error);
    res.status(500).json({ error: 'Failed to stash changes' });
  }
});

/**
 * Apply stash
 * POST /api/git/stash/pop
 */
router.post('/stash/pop', authenticateToken, async (req, res) => {
  try {
    const { workspaceId } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const result = await gitService.stashPop(workspaceId);
    res.json(result);
  } catch (error) {
    console.error('Git stash pop error:', error);
    res.status(500).json({ error: 'Failed to apply stash' });
  }
});

/**
 * Cleanup workspace
 * DELETE /api/git/workspace/:workspaceId
 */
router.delete('/workspace/:workspaceId', authenticateToken, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const result = await gitService.cleanup(workspaceId);
    res.json(result);
  } catch (error) {
    console.error('Git cleanup error:', error);
    res.status(500).json({ error: 'Failed to cleanup workspace' });
  }
});

module.exports = router;
