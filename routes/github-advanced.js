const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const githubService = require('../utils/githubService');
const aiService = require('../utils/aiService');

/**
 * @swagger
 * /api/github-advanced/push:
 *   post:
 *     summary: Direct push to GitHub with multi-file commit
 *     tags:
 *       - GitHub Advanced
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - owner
 *               - repo
 *               - files
 *             properties:
 *               owner:
 *                 type: string
 *                 description: Repository owner
 *               repo:
 *                 type: string
 *                 description: Repository name
 *               branch:
 *                 type: string
 *                 description: "Branch name (default: main)"
 *               files:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     path:
 *                       type: string
 *                     content:
 *                       type: string
 *               message:
 *                 type: string
 *                 description: Commit message
 *               description:
 *                 type: string
 *                 description: Commit description
 *     responses:
 *       200:
 *         description: Files pushed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       path:
 *                         type: string
 *                       success:
 *                         type: boolean
 *                       commitSha:
 *                         type: string
 *                 commitSha:
 *                   type: string
 *       400:
 *         description: Bad request - missing required fields
 *       401:
 *         description: Unauthorized - invalid or missing token
 *       500:
 *         description: Internal server error
 */
// Direct push to GitHub — one atomic commit for all files (Git Data API).
router.post('/push', authenticateToken, async (req, res) => {
    try {
        const { owner, repo, branch, files, message, description } = req.body;

        if (!files || files.length === 0) {
            return res.status(400).json({ success: false, message: 'No files to push' });
        }

        // Accept both path conventions: directory path + name (workspace
        // CodeFiles) and full path including the filename (GitHub tree
        // entries) — the old naive `${path}/${name}` join doubled paths like
        // src/app.js/app.js and the push failed.
        const smartPath = (f) => {
            const name = String(f.name || '');
            const p = String(f.path || '/').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
            if (!name) return p;
            if (p === name) return name;
            if (p.endsWith('/' + name)) return p;
            return p ? `${p}/${name}` : name;
        };

        const entries = files
            .filter((f) => f && typeof f.content === 'string')
            .map((f) => ({ path: smartPath(f), content: f.content }));

        if (!entries.length) {
            return res.status(400).json({ success: false, message: 'No file content to push' });
        }

        try {
            const result = await githubService.pushCommit(
                req.userId, owner, repo, branch, entries,
                message || `Update ${entries.length} file(s) from Buildrs HQ`
            );

            res.json({
                success: true,
                message: `Pushed ${entries.length} file(s) in commit ${String(result.commit.sha).slice(0, 7)}`,
                results: entries.map((e) => ({ path: e.path, success: true, commitSha: result.commit.sha })),
                commitSha: result.commit.sha,
                commitUrl: result.commit.url || `https://github.com/${owner}/${repo}/commit/${result.commit.sha}`,
                branch: result.branch,
            });
        } catch (pushErr) {
            console.error('Push error:', pushErr);
            res.status(502).json({
                success: false,
                message: `Push to ${owner}/${repo} failed: ${pushErr.message}`,
            });
        }
    } catch (error) {
        console.error('Push error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create pull request
router.post('/pull-request', authenticateToken, async (req, res) => {
    try {
        const { owner, repo, title, head, base, body, draft = false } = req.body;
        
        if (!title || !head || !base) {
            return res.status(400).json({ 
                success: false, 
                message: 'Title, head branch, and base branch are required' 
            });
        }

        const pr = await githubService.createPullRequest(
            req.userId,
            owner,
            repo,
            title,
            head,
            base,
            body
        );

        res.json({
            success: true,
            pullRequest: pr,
            message: `Pull request #${pr.number} created successfully`
        });
    } catch (error) {
        console.error('Create PR error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create branch
router.post('/branch', authenticateToken, async (req, res) => {
    try {
        const { owner, repo, newBranch, fromBranch = 'main' } = req.body;
        
        if (!newBranch) {
            return res.status(400).json({ success: false, message: 'Branch name is required' });
        }

        const branch = await githubService.createBranch(
            req.userId,
            owner,
            repo,
            newBranch,
            fromBranch
        );

        res.json({
            success: true,
            branch,
            message: `Branch '${newBranch}' created from '${fromBranch}'`
        });
    } catch (error) {
        console.error('Create branch error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// List branches
router.get('/branches/:owner/:repo', authenticateToken, async (req, res) => {
    try {
        const { owner, repo } = req.params;
        
        const branches = await githubService.listBranches(req.userId, owner, repo);

        res.json({
            success: true,
            branches,
            count: branches.length
        });
    } catch (error) {
        console.error('List branches error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get commit history
router.get('/commits/:owner/:repo', authenticateToken, async (req, res) => {
    try {
        const { owner, repo } = req.params;
        const { branch, path, limit = 20 } = req.query;
        
        const commits = await githubService.getCommits(
            req.userId,
            owner,
            repo,
            branch,
            path,
            parseInt(limit)
        );

        res.json({
            success: true,
            commits,
            count: commits.length
        });
    } catch (error) {
        console.error('Get commits error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get file diff
router.get('/diff/:owner/:repo', authenticateToken, async (req, res) => {
    try {
        const { owner, repo } = req.params;
        const { path, base, head } = req.query;
        
        if (!path || !base || !head) {
            return res.status(400).json({ 
                success: false, 
                message: 'Path, base, and head are required' 
            });
        }

        const diff = await githubService.getFileDiff(
            req.userId,
            owner,
            repo,
            path,
            base,
            head
        );

        res.json({
            success: true,
            diff
        });
    } catch (error) {
        console.error('Get diff error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// List pull requests
router.get('/pull-requests/:owner/:repo', authenticateToken, async (req, res) => {
    try {
        const { owner, repo } = req.params;
        const { state = 'open', limit = 20 } = req.query;
        
        const prs = await githubService.listPullRequests(
            req.userId,
            owner,
            repo,
            state,
            parseInt(limit)
        );

        res.json({
            success: true,
            pullRequests: prs,
            count: prs.length
        });
    } catch (error) {
        console.error('List PRs error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get pull request details
router.get('/pull-request/:owner/:repo/:number', authenticateToken, async (req, res) => {
    try {
        const { owner, repo, number } = req.params;
        
        const pr = await githubService.getPullRequest(
            req.userId,
            owner,
            repo,
            parseInt(number)
        );

        res.json({
            success: true,
            pullRequest: pr
        });
    } catch (error) {
        console.error('Get PR error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Merge pull request
router.post('/merge/:owner/:repo/:number', authenticateToken, async (req, res) => {
    try {
        const { owner, repo, number } = req.params;
        const { commitMessage, mergeMethod = 'merge' } = req.body;
        
        const result = await githubService.mergePullRequest(
            req.userId,
            owner,
            repo,
            parseInt(number),
            commitMessage,
            mergeMethod
        );

        res.json({
            success: true,
            result,
            message: `Pull request #${number} merged successfully`
        });
    } catch (error) {
        console.error('Merge PR error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Add comment to PR
router.post('/comment/:owner/:repo/:number', authenticateToken, async (req, res) => {
    try {
        const { owner, repo, number } = req.params;
        const { body } = req.body;
        
        if (!body) {
            return res.status(400).json({ success: false, message: 'Comment body is required' });
        }

        const comment = await githubService.addPRComment(
            req.userId,
            owner,
            repo,
            parseInt(number),
            body
        );

        res.json({
            success: true,
            comment,
            message: 'Comment added successfully'
        });
    } catch (error) {
        console.error('Add comment error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Request review
router.post('/request-review/:owner/:repo/:number', authenticateToken, async (req, res) => {
    try {
        const { owner, repo, number } = req.params;
        const { reviewers } = req.body;
        
        if (!reviewers || reviewers.length === 0) {
            return res.status(400).json({ success: false, message: 'Reviewers are required' });
        }

        const result = await githubService.requestReview(
            req.userId,
            owner,
            repo,
            parseInt(number),
            reviewers
        );

        res.json({
            success: true,
            result,
            message: 'Review requested successfully'
        });
    } catch (error) {
        console.error('Request review error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// AI-generated commit message
router.post('/ai/commit-message', authenticateToken, async (req, res) => {
    try {
        const { files, diffs } = req.body;
        
        if (!files || files.length === 0) {
            return res.status(400).json({ success: false, message: 'Files are required' });
        }

        // Build context for AI
        const context = {
            files: files.map(f => ({
                path: f.path,
                additions: f.additions || 0,
                deletions: f.deletions || 0,
                changes: f.changes || ''
            })),
            diffs: diffs || []
        };

        const prompt = `Generate a conventional commit message for these changes:

Files changed:
${files.map(f => `- ${f.path} (+${f.additions || 0}/-${f.deletions || 0})`).join('\n')}

${diffs && diffs.length > 0 ? `\nCode changes:\n${diffs.join('\n\n')}` : ''}

Generate a commit message following conventional commits format:
<type>(<scope>): <subject>

<body>

Types: feat, fix, docs, style, refactor, test, chore
Keep subject under 50 characters
Explain what and why, not how`;

        const aiResponse = await aiService.chat([
            { role: 'user', content: prompt }
        ], {});

        if (!aiResponse.success) {
            return res.status(500).json({ 
                success: false, 
                message: 'AI service error: ' + aiResponse.error 
            });
        }

        // Extract commit message from AI response
        let commitMessage = aiResponse.content.trim();
        
        // Remove markdown code blocks if present
        commitMessage = commitMessage.replace(/```[\s\S]*?```/g, '').trim();

        res.json({
            success: true,
            commitMessage,
            suggestion: commitMessage
        });
    } catch (error) {
        console.error('AI commit message error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// AI-generated PR description
router.post('/ai/pr-description', authenticateToken, async (req, res) => {
    try {
        const { title, commits, files } = req.body;
        
        if (!title) {
            return res.status(400).json({ success: false, message: 'PR title is required' });
        }

        const prompt = `Generate a comprehensive pull request description for:

Title: ${title}

${commits && commits.length > 0 ? `Commits:\n${commits.map(c => `- ${c.message}`).join('\n')}\n` : ''}

${files && files.length > 0 ? `Files changed:\n${files.map(f => `- ${f.path}`).join('\n')}\n` : ''}

Generate a PR description with:
1. Summary of changes
2. What was changed and why
3. Testing done
4. Screenshots (if UI changes)
5. Checklist for reviewers

Use markdown formatting.`;

        const aiResponse = await aiService.chat([
            { role: 'user', content: prompt }
        ], {});

        if (!aiResponse.success) {
            return res.status(500).json({ 
                success: false, 
                message: 'AI service error: ' + aiResponse.error 
            });
        }

        res.json({
            success: true,
            description: aiResponse.content.trim()
        });
    } catch (error) {
        console.error('AI PR description error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// AI conflict resolution
router.post('/ai/resolve-conflict', authenticateToken, async (req, res) => {
    try {
        const { file, ours, theirs, base } = req.body;
        
        if (!file || !ours || !theirs) {
            return res.status(400).json({ 
                success: false, 
                message: 'File, ours, and theirs content are required' 
            });
        }

        const prompt = `Resolve this merge conflict intelligently:

File: ${file}

<<<<<<< HEAD (ours)
${ours}
=======
${theirs}
>>>>>>> branch

${base ? `\nOriginal (base):\n${base}` : ''}

Analyze both versions and provide:
1. The best merged version
2. Explanation of resolution strategy
3. Any potential issues

Return only the resolved code without conflict markers.`;

        const aiResponse = await aiService.chat([
            { role: 'user', content: prompt }
        ], {});

        if (!aiResponse.success) {
            return res.status(500).json({ 
                success: false, 
                message: 'AI service error: ' + aiResponse.error 
            });
        }

        // Extract code from response
        let resolved = aiResponse.content;
        const codeMatch = resolved.match(/```[\w]*\n([\s\S]*?)```/);
        if (codeMatch) {
            resolved = codeMatch[1].trim();
        }

        res.json({
            success: true,
            resolved,
            explanation: aiResponse.content
        });
    } catch (error) {
        console.error('AI conflict resolution error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
