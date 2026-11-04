/**
 * Git API Routes
 * Provides version control operations
 */

const express = require('express');
const router = express.Router();
const gitService = require('../utils/gitService');
const { authenticateToken } = require('../middleware/auth');
const permissionMatrix = require('../middleware/permissionMatrix');
const { addAuditLog } = require('../utils/auditLogService');
const Company = require('../models/Company');
const LocalProject = require('../models/LocalProject');
const TeamProject = require('../models/TeamProject');
const { userCanAccessProject } = require('../utils/specAccess');

async function requireGitAccess(req, res, next) {
  const workspaceId = req.params.workspaceId || req.body?.workspaceId || req.query.workspaceId;
  const projectId = req.params.projectId || req.body?.projectId || req.query.projectId;
  if (projectId) {
    try {
      const localProject = await LocalProject.findById(projectId).select('workspaceId').lean();
      const project = localProject || await TeamProject.findById(projectId)
        .select('workspaceId company owner members')
        .lean();
      if (!project) return res.status(404).json({ error: 'Project not found' });
      if (localProject) {
        if (!(await userCanAccessProject(projectId, req.userId))) {
          return res.status(403).json({ error: 'Access denied to project' });
        }
      } else {
        const teamWorkspaceId = project.workspaceId || project.company;
        const company = teamWorkspaceId
          ? await Company.findById(teamWorkspaceId).select('members owner')
          : null;
        const isWorkspaceMember = company && (
          String(company.owner) === String(req.userId)
          || company.members.some((member) => String(member.user || member.userId) === String(req.userId))
        );
        if (!isWorkspaceMember) return res.status(403).json({ error: 'Access denied to project' });
      }
      const projectWorkspaceId = project.workspaceId || project.company;
      if (workspaceId && projectWorkspaceId && String(projectWorkspaceId) !== String(workspaceId)) {
        return res.status(403).json({ error: 'Project does not belong to this workspace' });
      }
      req.gitWorkspaceId = workspaceId || projectWorkspaceId;
      req.gitProjectId = String(projectId);
      if (!req.gitWorkspaceId) {
        return res.status(400).json({ error: 'A project workspace is required for Git operations' });
      }
      return next();
    } catch (error) {
      console.error('Git project access check error:', error);
      return res.status(500).json({ error: 'Failed to verify project access' });
    }
  }
  if (!workspaceId) return next();
  try {
    const company = await Company.findById(workspaceId).select('members owner');
    if (!company) return res.status(404).json({ error: 'Workspace not found' });
    const isMember = company.members.some(m => m.user?.toString() === req.userId) || company.owner?.toString() === req.userId;
    if (!isMember) return res.status(403).json({ error: 'Access denied: not a workspace member' });
    req.gitWorkspaceId = workspaceId;
    req.gitProjectId = null;
    next();
  } catch (error) {
    console.error('Git workspace access check error:', error);
    res.status(500).json({ error: 'Failed to verify workspace access' });
  }
}

// Verify user is a member of the company/workspace before operating
async function requireWorkspaceAccess(req, res, next) {
    const workspaceId = req.params.workspaceId || req.body.workspaceId;
    if (!workspaceId) return next(); // Some routes don't use workspaceId
    try {
        const company = await Company.findById(workspaceId).select('members owner');
        if (!company) return res.status(404).json({ error: 'Workspace not found' });
        const isMember = company.members.some(m => m.user?.toString() === req.userId) || company.owner?.toString() === req.userId;
        if (!isMember) return res.status(403).json({ error: 'Access denied: not a workspace member' });
        next();
    } catch (err) {
        res.status(500).json({ error: 'Failed to verify workspace access' });
    }
}

/**
 * @swagger
 * /api/git/init:
 *   post:
 *     summary: Initialize Git repository in workspace
 *     tags:
 *       - Git
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - workspaceId
 *             properties:
 *               workspaceId:
 *                 type: string
 *                 description: Workspace ID
 *               userName:
 *                 type: string
 *                 description: Git user name
 *               userEmail:
 *                 type: string
 *                 description: Git user email
 *     responses:
 *       200:
 *         description: Git repository initialized successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Bad request - missing required fields
 *       401:
 *         description: Unauthorized - invalid or missing token
 *       500:
 *         description: Internal server error
 */
router.post('/init', authenticateToken, requireGitAccess, async (req, res) => {
  try {
    const { workspaceId, userName, userEmail } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const result = await gitService.init(workspaceId, { userName, userEmail }, req.gitProjectId);
    res.json(result);
  } catch (error) {
    console.error('Git init error:', error);
    res.status(500).json({ error: 'Failed to initialize repository' });
  }
});

/**
 * @swagger
 * /api/git/status/{workspaceId}:
 *   get:
 *     summary: Get repository status
 *     tags:
 *       - Git
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: workspaceId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Repository status retrieved
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/status/:workspaceId', authenticateToken, requireGitAccess, permissionMatrix.requirePermission('git', 'read'), async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const result = await gitService.status(workspaceId, req.gitProjectId);
    res.json(result);
  } catch (error) {
    console.error('Git status error:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

/**
 * @swagger
 * /api/git/diff/{workspaceId}:
 *   get:
 *     summary: Get diff of changes
 *     tags:
 *       - Git
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: workspaceId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: file
 *         in: query
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Diff retrieved
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/diff/:workspaceId', authenticateToken, requireGitAccess, permissionMatrix.requirePermission('git', 'read'), async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { file } = req.query;
    
    const result = await gitService.diff(workspaceId, file, req.gitProjectId);
    res.json(result);
  } catch (error) {
    console.error('Git diff error:', error);
    res.status(500).json({ error: 'Failed to get diff' });
  }
});

/**
 * @swagger
 * /api/git/add:
 *   post:
 *     summary: Stage files
 *     tags:
 *       - Git
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - workspaceId
 *               - files
 *             properties:
 *               workspaceId:
 *                 type: string
 *               files:
 *                 type: array
 *                 deprecated: true
 *                 description: Ignored; stage files with POST /api/git/add before committing.
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Files staged successfully
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/add', authenticateToken, requireGitAccess, async (req, res) => {
  try {
    const { workspaceId, files } = req.body;

    if (!workspaceId || !files) {
      return res.status(400).json({ error: 'workspaceId and files are required' });
    }

    const result = await gitService.add(workspaceId, files, req.gitProjectId);
    res.json(result);
  } catch (error) {
    console.error('Git add error:', error);
    res.status(500).json({ error: 'Failed to stage files' });
  }
});

/**
 * @swagger
 * /api/git/reset:
 *   post:
 *     summary: Unstage files
 *     tags:
 *       - Git
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - workspaceId
 *               - files
 *             properties:
 *               workspaceId:
 *                 type: string
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Files unstaged successfully
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/reset', authenticateToken, requireGitAccess, async (req, res) => {
  try {
    const { workspaceId, files } = req.body;

    if (!workspaceId || !files) {
      return res.status(400).json({ error: 'workspaceId and files are required' });
    }

    const result = await gitService.reset(workspaceId, files, req.gitProjectId);
    res.json(result);
  } catch (error) {
    console.error('Git reset error:', error);
    res.status(500).json({ error: 'Failed to unstage files' });
  }
});

/**
 * @swagger
 * /api/git/commit:
 *   post:
 *     summary: Commit changes
 *     tags:
 *       - Git
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - workspaceId
 *               - message
 *             properties:
 *               workspaceId:
 *                 type: string
 *               message:
 *                 type: string
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Changes committed successfully
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/commit', authenticateToken, requireGitAccess, permissionMatrix.requirePermission('git', 'commit'), async (req, res) => {
  try {
    const { workspaceId, message, files } = req.body;

    if (!workspaceId || !message) {
      return res.status(400).json({ error: 'workspaceId and message are required' });
    }

    const result = await gitService.commit(workspaceId, message, req.gitProjectId);
    addAuditLog({
      companyId: workspaceId,
      actorId: req.userId,
      event: 'git.commit',
      category: 'git',
      target: (message || '').split('\n')[0].slice(0, 80),
      details: { workspaceId, files: files || [] },
      req
    });
    res.json(result);
  } catch (error) {
    console.error('Git commit error:', error);
    res.status(500).json({ error: 'Failed to commit changes' });
  }
});

/**
 * @swagger
 * /api/git/log/{workspaceId}:
 *   get:
 *     summary: Get commit log
 *     tags:
 *       - Git
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: workspaceId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *       - name: file
 *         in: query
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Commit log retrieved
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/log/:workspaceId', authenticateToken, requireGitAccess, permissionMatrix.requirePermission('git', 'read'), async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { limit, file } = req.query;

    const result = await gitService.log(workspaceId, {
      limit: parseInt(limit) || 50,
      file,
      projectId: req.gitProjectId,
    });
    res.json(result);
  } catch (error) {
    console.error('Git log error:', error);
    res.status(500).json({ error: 'Failed to get commit log' });
  }
});

/**
 * @swagger
 * /api/git/branches/{workspaceId}:
 *   get:
 *     summary: List branches
 *     tags:
 *       - Git
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: workspaceId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Branches listed
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/branches/:workspaceId', authenticateToken, requireGitAccess, permissionMatrix.requirePermission('git', 'read'), async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const result = await gitService.branches(workspaceId, req.gitProjectId);
    res.json(result);
  } catch (error) {
    console.error('Git branches error:', error);
    res.status(500).json({ error: 'Failed to list branches' });
  }
});

/**
 * @swagger
 * /api/git/branch:
 *   post:
 *     summary: Create branch
 *     tags:
 *       - Git
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - workspaceId
 *               - branchName
 *             properties:
 *               workspaceId:
 *                 type: string
 *               branchName:
 *                 type: string
 *     responses:
 *       200:
 *         description: Branch created
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/branch', authenticateToken, requireGitAccess, permissionMatrix.requirePermission('git', 'branch'), async (req, res) => {
  try {
    const { workspaceId, branchName } = req.body;

    if (!workspaceId || !branchName) {
      return res.status(400).json({ error: 'workspaceId and branchName are required' });
    }

    const result = await gitService.createBranch(workspaceId, branchName, req.gitProjectId);
    res.json(result);
  } catch (error) {
    console.error('Git create branch error:', error);
    res.status(500).json({ error: 'Failed to create branch' });
  }
});

/**
 * @swagger
 * /api/git/checkout:
 *   post:
 *     summary: Switch branch
 *     tags:
 *       - Git
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - workspaceId
 *               - branchName
 *             properties:
 *               workspaceId:
 *                 type: string
 *               branchName:
 *                 type: string
 *     responses:
 *       200:
 *         description: Branch switched
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/checkout', authenticateToken, requireGitAccess, async (req, res) => {
  try {
    const { workspaceId, branchName } = req.body;

    if (!workspaceId || !branchName) {
      return res.status(400).json({ error: 'workspaceId and branchName are required' });
    }

    const result = await gitService.checkout(workspaceId, branchName, req.gitProjectId);
    res.json(result);
  } catch (error) {
    console.error('Git checkout error:', error);
    res.status(500).json({ error: 'Failed to switch branch' });
  }
});

/**
 * @swagger
 * /api/git/merge:
 *   post:
 *     summary: Merge branch
 *     tags:
 *       - Git
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - workspaceId
 *               - branchName
 *             properties:
 *               workspaceId:
 *                 type: string
 *               branchName:
 *                 type: string
 *     responses:
 *       200:
 *         description: Branch merged
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/merge', authenticateToken, requireGitAccess, async (req, res) => {
  try {
    const { workspaceId, branchName } = req.body;

    if (!workspaceId || !branchName) {
      return res.status(400).json({ error: 'workspaceId and branchName are required' });
    }

    const result = await gitService.merge(workspaceId, branchName, req.gitProjectId);
    res.json(result);
  } catch (error) {
    console.error('Git merge error:', error);
    res.status(500).json({ error: 'Failed to merge branch' });
  }
});

/**
 * @swagger
 * /api/git/pull:
 *   post:
 *     summary: Pull from remote
 *     tags:
 *       - Git
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - workspaceId
 *             properties:
 *               workspaceId:
 *                 type: string
 *               remote:
 *                 type: string
 *               branch:
 *                 type: string
 *     responses:
 *       200:
 *         description: Pulled from remote
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/pull', authenticateToken, requireWorkspaceAccess, permissionMatrix.requirePermission('git', 'pull'), async (req, res) => {
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
 * @swagger
 * /api/git/push:
 *   post:
 *     summary: Push to remote
 *     tags:
 *       - Git
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - workspaceId
 *             properties:
 *               workspaceId:
 *                 type: string
 *               remote:
 *                 type: string
 *               branch:
 *                 type: string
 *     responses:
 *       200:
 *         description: Pushed to remote
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/push', authenticateToken, requireWorkspaceAccess, permissionMatrix.requirePermission('git', 'push'), async (req, res) => {
  try {
    const { workspaceId, remote, branch } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const result = await gitService.push(workspaceId, remote, branch);
    addAuditLog({
      companyId: workspaceId,
      actorId: req.userId,
      event: 'git.push',
      category: 'git',
      target: branch || 'current branch',
      details: { workspaceId, remote: remote || '' },
      req
    });
    res.json(result);
  } catch (error) {
    console.error('Git push error:', error);
    res.status(500).json({ error: 'Failed to push to remote' });
  }
});

/**
 * @swagger
 * /api/git/remote:
 *   post:
 *     summary: Add remote
 *     tags:
 *       - Git
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - workspaceId
 *               - name
 *               - url
 *             properties:
 *               workspaceId:
 *                 type: string
 *               name:
 *                 type: string
 *               url:
 *                 type: string
 *     responses:
 *       200:
 *         description: Remote added
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/remote', authenticateToken, requireWorkspaceAccess, permissionMatrix.requirePermission('git', 'push'), async (req, res) => {
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
 * @swagger
 * /api/git/remotes/{workspaceId}:
 *   get:
 *     summary: List remotes
 *     tags:
 *       - Git
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: workspaceId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Remotes listed
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/remotes/:workspaceId', authenticateToken, requireWorkspaceAccess, permissionMatrix.requirePermission('git', 'read'), async (req, res) => {
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
 * @swagger
 * /api/git/clone:
 *   post:
 *     summary: Clone repository
 *     tags:
 *       - Git
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - workspaceId
 *               - repoUrl
 *             properties:
 *               workspaceId:
 *                 type: string
 *               repoUrl:
 *                 type: string
 *               args:
 *                 type: object
 *     responses:
 *       200:
 *         description: Repository cloned
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/clone', authenticateToken, requireWorkspaceAccess, async (req, res) => {
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
 * @swagger
 * /api/git/show/{workspaceId}:
 *   get:
 *     summary: Get file at commit
 *     tags:
 *       - Git
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: workspaceId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: commit
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *       - name: file
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File content retrieved
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/show/:workspaceId', authenticateToken, requireWorkspaceAccess, permissionMatrix.requirePermission('git', 'read'), async (req, res) => {
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
 * @swagger
 * /api/git/stash:
 *   post:
 *     summary: Stash changes
 *     tags:
 *       - Git
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - workspaceId
 *             properties:
 *               workspaceId:
 *                 type: string
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: Changes stashed
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/stash', authenticateToken, requireWorkspaceAccess, async (req, res) => {
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
 * @swagger
 * /api/git/stash/pop:
 *   post:
 *     summary: Apply stash
 *     tags:
 *       - Git
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - workspaceId
 *             properties:
 *               workspaceId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Stash applied
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/stash/pop', authenticateToken, requireWorkspaceAccess, async (req, res) => {
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
 * @swagger
 * /api/git/workspace/{workspaceId}:
 *   delete:
 *     summary: Cleanup workspace
 *     tags:
 *       - Git
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: workspaceId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Workspace cleaned up
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.delete('/workspace/:workspaceId', authenticateToken, requireWorkspaceAccess, async (req, res) => {
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