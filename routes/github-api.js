const express = require('express');
const router = express.Router();
const axios = require('axios');
const Integration = require('../models/Integration');
const jwt = require('jsonwebtoken');

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.id;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid token' });
    }
};

// Helper to get GitHub integration
async function getGitHubIntegration(userId) {
    const integration = await Integration.findOne({
        userId,
        provider: 'github',
        isActive: true
    });
    
    if (!integration) {
        throw new Error('GitHub not connected');
    }
    
    return integration;
}

// Helper to make GitHub API calls
async function githubAPI(accessToken, endpoint, method = 'GET', data = null) {
    try {
        const response = await axios({
            method,
            url: `https://api.github.com${endpoint}`,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'CODEX-INC-App'
            },
            data
        });
        return response.data;
    } catch (error) {
        console.error('GitHub API error:', error.response?.data || error.message);
        throw error;
    }
}

// ===== REPOSITORIES =====

/**
 * @swagger
 * /api/github/repos:
 *   get:
 *     summary: Get all GitHub repositories
 *     tags:
 *       - GitHub API
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: sort
 *         in: query
 *         schema:
 *           type: string
 *           default: updated
 *       - name: per_page
 *         in: query
 *         schema:
 *           type: integer
 *           default: 30
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           default: 1
 *       - name: type
 *         in: query
 *         schema:
 *           type: string
 *           default: all
 *     responses:
 *       200:
 *         description: List of repositories
 *       401:
 *         description: Unauthorized
 */
router.get('/repos', verifyToken, async (req, res) => {
    try {
        const integration = await getGitHubIntegration(req.userId);
        const { sort = 'updated', per_page = 30, page = 1, type = 'all' } = req.query;
        
        const repos = await githubAPI(integration.accessToken, `/user/repos?sort=${sort}&per_page=${per_page}&page=${page}&type=${type}`);
        
        res.json({
            success: true,
            repositories: repos.map(repo => ({
                id: repo.id,
                name: repo.name,
                fullName: repo.full_name,
                owner: repo.owner.login,
                description: repo.description,
                private: repo.private,
                url: repo.html_url,
                cloneUrl: repo.clone_url,
                stars: repo.stargazers_count,
                forks: repo.forks_count,
                watchers: repo.watchers_count,
                language: repo.language,
                defaultBranch: repo.default_branch,
                createdAt: repo.created_at,
                updatedAt: repo.updated_at,
                size: repo.size,
                openIssues: repo.open_issues_count
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/github/repos/{owner}/{repo}:
 *   get:
 *     summary: Get single GitHub repository
 *     tags:
 *       - GitHub API
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: owner
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: repo
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Repository details
 *       401:
 *         description: Unauthorized
 */
router.get('/repos/:owner/:repo', verifyToken, async (req, res) => {
    try {
        const integration = await getGitHubIntegration(req.userId);
        const { owner, repo } = req.params;
        
        const repository = await githubAPI(integration.accessToken, `/repos/${owner}/${repo}`);
        
        res.json({
            success: true,
            repository: {
                id: repository.id,
                name: repository.name,
                fullName: repository.full_name,
                owner: repository.owner.login,
                description: repository.description,
                private: repository.private,
                url: repository.html_url,
                stars: repository.stargazers_count,
                forks: repository.forks_count,
                language: repository.language,
                defaultBranch: repository.default_branch,
                topics: repository.topics,
                license: repository.license?.name
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/github/repos:
 *   post:
 *     summary: Create GitHub repository
 *     tags:
 *       - GitHub API
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               private:
 *                 type: boolean
 *                 default: false
 *               autoInit:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Repository created successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/repos', verifyToken, async (req, res) => {
    try {
        const integration = await getGitHubIntegration(req.userId);
        const { name, description, private: isPrivate = false, autoInit = true } = req.body;
        
        const repo = await githubAPI(integration.accessToken, '/user/repos', 'POST', {
            name,
            description,
            private: isPrivate,
            auto_init: autoInit
        });
        
        res.json({
            success: true,
            message: 'Repository created successfully',
            repository: {
                name: repo.name,
                url: repo.html_url,
                cloneUrl: repo.clone_url
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ===== BRANCHES =====

/**
 * @swagger
 * /api/github/repos/{owner}/{repo}/branches:
 *   get:
 *     summary: Get GitHub repository branches
 *     tags:
 *       - GitHub API
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: owner
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: repo
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of branches
 *       401:
 *         description: Unauthorized
 */
router.get('/repos/:owner/:repo/branches', verifyToken, async (req, res) => {
    try {
        const integration = await getGitHubIntegration(req.userId);
        const { owner, repo } = req.params;
        
        const branches = await githubAPI(integration.accessToken, `/repos/${owner}/${repo}/branches`);
        
        res.json({
            success: true,
            branches: branches.map(branch => ({
                name: branch.name,
                protected: branch.protected,
                commit: {
                    sha: branch.commit.sha,
                    url: branch.commit.url
                }
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/github/repos/{owner}/{repo}/branches:
 *   post:
 *     summary: Create GitHub branch
 *     tags:
 *       - GitHub API
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: owner
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: repo
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               branchName:
 *                 type: string
 *               fromBranch:
 *                 type: string
 *                 default: main
 *     responses:
 *       200:
 *         description: Branch created successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/repos/:owner/:repo/branches', verifyToken, async (req, res) => {
    try {
        const integration = await getGitHubIntegration(req.userId);
        const { owner, repo } = req.params;
        const { branchName, fromBranch = 'main' } = req.body;
        
        // Get the SHA of the source branch
        const sourceBranch = await githubAPI(integration.accessToken, `/repos/${owner}/${repo}/git/ref/heads/${fromBranch}`);
        const sha = sourceBranch.object.sha;
        
        // Create new branch
        const newBranch = await githubAPI(integration.accessToken, `/repos/${owner}/${repo}/git/refs`, 'POST', {
            ref: `refs/heads/${branchName}`,
            sha
        });
        
        res.json({
            success: true,
            message: 'Branch created successfully',
            branch: {
                name: branchName,
                ref: newBranch.ref,
                sha: newBranch.object.sha
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ===== FILES & CONTENT =====

/**
 * @swagger
 * /api/github/repos/{owner}/{repo}/contents/{path}:
 *   get:
 *     summary: Get GitHub repository contents
 *     tags:
 *       - GitHub API
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: owner
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: repo
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: path
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: ref
 *         in: query
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Repository contents
 *       401:
 *         description: Unauthorized
 */
router.get('/repos/:owner/:repo/contents/*', verifyToken, async (req, res) => {
    try {
        const integration = await getGitHubIntegration(req.userId);
        const { owner, repo } = req.params;
        const path = req.params[0] || '';
        const { ref } = req.query;
        
        const endpoint = `/repos/${owner}/${repo}/contents/${path}${ref ? `?ref=${ref}` : ''}`;
        const contents = await githubAPI(integration.accessToken, endpoint);
        
        // If it's a file, decode content
        if (!Array.isArray(contents) && contents.type === 'file') {
            const content = Buffer.from(contents.content, 'base64').toString('utf-8');
            res.json({
                success: true,
                type: 'file',
                file: {
                    name: contents.name,
                    path: contents.path,
                    sha: contents.sha,
                    size: contents.size,
                    content,
                    encoding: contents.encoding,
                    url: contents.html_url
                }
            });
        } else {
            // It's a directory
            res.json({
                success: true,
                type: 'directory',
                contents: Array.isArray(contents) ? contents.map(item => ({
                    name: item.name,
                    path: item.path,
                    type: item.type,
                    size: item.size,
                    sha: item.sha,
                    url: item.html_url
                })) : []
            });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/github/repos/{owner}/{repo}/contents/{path}:
 *   put:
 *     summary: Update GitHub file
 *     tags:
 *       - GitHub API
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: owner
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: repo
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: path
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *               message:
 *                 type: string
 *               sha:
 *                 type: string
 *               branch:
 *                 type: string
 *     responses:
 *       200:
 *         description: File updated successfully
 *       401:
 *         description: Unauthorized
 */
router.put('/repos/:owner/:repo/contents/*', verifyToken, async (req, res) => {
    try {
        const integration = await getGitHubIntegration(req.userId);
        const { owner, repo } = req.params;
        const path = req.params[0];
        const { content, message, sha, branch } = req.body;
        
        // Encode content to base64
        const encodedContent = Buffer.from(content).toString('base64');
        
        const result = await githubAPI(integration.accessToken, `/repos/${owner}/${repo}/contents/${path}`, 'PUT', {
            message,
            content: encodedContent,
            sha,
            branch
        });
        
        res.json({
            success: true,
            message: 'File updated successfully',
            commit: {
                sha: result.commit.sha,
                url: result.commit.html_url
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/github/repos/{owner}/{repo}/contents/{path}:
 *   post:
 *     summary: Create GitHub file
 *     tags:
 *       - GitHub API
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: owner
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: repo
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: path
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *               message:
 *                 type: string
 *               branch:
 *                 type: string
 *     responses:
 *       200:
 *         description: File created successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/repos/:owner/:repo/contents/*', verifyToken, async (req, res) => {
    try {
        const integration = await getGitHubIntegration(req.userId);
        const { owner, repo } = req.params;
        const path = req.params[0];
        const { content, message, branch } = req.body;
        
        const encodedContent = Buffer.from(content).toString('base64');
        
        const result = await githubAPI(integration.accessToken, `/repos/${owner}/${repo}/contents/${path}`, 'PUT', {
            message,
            content: encodedContent,
            branch
        });
        
        res.json({
            success: true,
            message: 'File created successfully',
            file: {
                path: result.content.path,
                sha: result.content.sha,
                url: result.content.html_url
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ===== COMMITS =====

/**
 * @swagger
 * /api/github/repos/{owner}/{repo}/commits:
 *   get:
 *     summary: Get GitHub repository commits
 *     tags:
 *       - GitHub API
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: owner
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: repo
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: sha
 *         in: query
 *         schema:
 *           type: string
 *       - name: per_page
 *         in: query
 *         schema:
 *           type: integer
 *           default: 30
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           default: 1
 *     responses:
 *       200:
 *         description: List of commits
 *       401:
 *         description: Unauthorized
 */
router.get('/repos/:owner/:repo/commits', verifyToken, async (req, res) => {
    try {
        const integration = await getGitHubIntegration(req.userId);
        const { owner, repo } = req.params;
        const { sha, per_page = 30, page = 1 } = req.query;
        
        const endpoint = `/repos/${owner}/${repo}/commits?per_page=${per_page}&page=${page}${sha ? `&sha=${sha}` : ''}`;
        const commits = await githubAPI(integration.accessToken, endpoint);
        
        res.json({
            success: true,
            commits: commits.map(commit => ({
                sha: commit.sha,
                message: commit.commit.message,
                author: {
                    name: commit.commit.author.name,
                    email: commit.commit.author.email,
                    date: commit.commit.author.date,
                    username: commit.author?.login
                },
                url: commit.html_url,
                stats: commit.stats
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ===== ISSUES =====

/**
 * @swagger
 * /api/github/repos/{owner}/{repo}/issues:
 *   get:
 *     summary: Get GitHub repository issues
 *     tags:
 *       - GitHub API
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: owner
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: repo
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: state
 *         in: query
 *         schema:
 *           type: string
 *           default: open
 *       - name: per_page
 *         in: query
 *         schema:
 *           type: integer
 *           default: 30
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           default: 1
 *     responses:
 *       200:
 *         description: List of issues
 *       401:
 *         description: Unauthorized
 */
router.get('/repos/:owner/:repo/issues', verifyToken, async (req, res) => {
    try {
        const integration = await getGitHubIntegration(req.userId);
        const { owner, repo } = req.params;
        const { state = 'open', per_page = 30, page = 1 } = req.query;
        
        const issues = await githubAPI(integration.accessToken, `/repos/${owner}/${repo}/issues?state=${state}&per_page=${per_page}&page=${page}`);
        
        res.json({
            success: true,
            issues: issues.map(issue => ({
                id: issue.id,
                number: issue.number,
                title: issue.title,
                body: issue.body,
                state: issue.state,
                user: issue.user.login,
                labels: issue.labels.map(l => l.name),
                assignees: issue.assignees.map(a => a.login),
                createdAt: issue.created_at,
                updatedAt: issue.updated_at,
                url: issue.html_url
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/github/repos/{owner}/{repo}/issues:
 *   post:
 *     summary: Create GitHub issue
 *     tags:
 *       - GitHub API
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: owner
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: repo
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               body:
 *                 type: string
 *               labels:
 *                 type: array
 *                 items:
 *                   type: string
 *               assignees:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Issue created successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/repos/:owner/:repo/issues', verifyToken, async (req, res) => {
    try {
        const integration = await getGitHubIntegration(req.userId);
        const { owner, repo } = req.params;
        const { title, body, labels, assignees } = req.body;
        
        const issue = await githubAPI(integration.accessToken, `/repos/${owner}/${repo}/issues`, 'POST', {
            title,
            body,
            labels,
            assignees
        });
        
        res.json({
            success: true,
            message: 'Issue created successfully',
            issue: {
                number: issue.number,
                title: issue.title,
                url: issue.html_url
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ===== PULL REQUESTS =====

/**
 * @swagger
 * /api/github/repos/{owner}/{repo}/pulls:
 *   get:
 *     summary: Get GitHub repository pull requests
 *     tags:
 *       - GitHub API
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: owner
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: repo
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: state
 *         in: query
 *         schema:
 *           type: string
 *           default: open
 *       - name: per_page
 *         in: query
 *         schema:
 *           type: integer
 *           default: 30
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           default: 1
 *     responses:
 *       200:
 *         description: List of pull requests
 *       401:
 *         description: Unauthorized
 */
router.get('/repos/:owner/:repo/pulls', verifyToken, async (req, res) => {
    try {
        const integration = await getGitHubIntegration(req.userId);
        const { owner, repo } = req.params;
        const { state = 'open', per_page = 30, page = 1 } = req.query;
        
        const pulls = await githubAPI(integration.accessToken, `/repos/${owner}/${repo}/pulls?state=${state}&per_page=${per_page}&page=${page}`);
        
        res.json({
            success: true,
            pullRequests: pulls.map(pr => ({
                id: pr.id,
                number: pr.number,
                title: pr.title,
                body: pr.body,
                state: pr.state,
                user: pr.user.login,
                head: pr.head.ref,
                base: pr.base.ref,
                createdAt: pr.created_at,
                updatedAt: pr.updated_at,
                url: pr.html_url,
                mergeable: pr.mergeable
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/github/repos/{owner}/{repo}/pulls:
 *   post:
 *     summary: Create GitHub pull request
 *     tags:
 *       - GitHub API
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: owner
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: repo
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               body:
 *                 type: string
 *               head:
 *                 type: string
 *               base:
 *                 type: string
 *                 default: main
 *     responses:
 *       200:
 *         description: Pull request created successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/repos/:owner/:repo/pulls', verifyToken, async (req, res) => {
    try {
        const integration = await getGitHubIntegration(req.userId);
        const { owner, repo } = req.params;
        const { title, body, head, base = 'main' } = req.body;
        
        const pr = await githubAPI(integration.accessToken, `/repos/${owner}/${repo}/pulls`, 'POST', {
            title,
            body,
            head,
            base
        });
        
        res.json({
            success: true,
            message: 'Pull request created successfully',
            pullRequest: {
                number: pr.number,
                title: pr.title,
                url: pr.html_url
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ===== USER INFO =====

/**
 * @swagger
 * /api/github/user:
 *   get:
 *     summary: Get authenticated GitHub user info
 *     tags:
 *       - GitHub API
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: GitHub user information
 *       401:
 *         description: Unauthorized
 */
router.get('/user', verifyToken, async (req, res) => {
    try {
        const integration = await getGitHubIntegration(req.userId);
        const user = await githubAPI(integration.accessToken, '/user');
        
        res.json({
            success: true,
            user: {
                login: user.login,
                name: user.name,
                email: user.email,
                bio: user.bio,
                company: user.company,
                location: user.location,
                avatarUrl: user.avatar_url,
                publicRepos: user.public_repos,
                followers: user.followers,
                following: user.following,
                createdAt: user.created_at
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
