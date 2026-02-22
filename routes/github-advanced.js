const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const githubService = require('../utils/githubService');
const aiService = require('../utils/aiService');

// Direct push to GitHub (multi-file commit)
router.post('/push', authenticateToken, async (req, res) => {
    try {
        const { owner, repo, branch, files, message, description } = req.body;
        
        if (!files || files.length === 0) {
            return res.status(400).json({ success: false, message: 'No files to push' });
        }

        const results = [];
        let commitSha = null;

        // Push each file
        for (const file of files) {
            try {
                // Get current file SHA if it exists
                let sha = null;
                try {
                    const existing = await githubService.getFileContent(
                        req.userId, owner, repo, file.path, branch
                    );
                    sha = existing.sha;
                } catch (error) {
                    // File doesn't exist, will create new
                }

                const result = await githubService.createOrUpdateFile(
                    req.userId,
                    owner,
                    repo,
                    file.path,
                    file.content,
                    message || `Update ${file.path}`,
                    branch,
                    sha
                );

                commitSha = result.commit.sha;
                results.push({
                    path: file.path,
                    success: true,
                    commitSha: result.commit.sha
                });
            } catch (error) {
                results.push({
                    path: file.path,
                    success: false,
                    error: error.message
                });
            }
        }

        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        res.json({
            success: successCount > 0,
            message: `Pushed ${successCount} file(s) successfully${failCount > 0 ? `, ${failCount} failed` : ''}`,
            results,
            commitSha,
            commitUrl: commitSha ? `https://github.com/${owner}/${repo}/commit/${commitSha}` : null
        });
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
