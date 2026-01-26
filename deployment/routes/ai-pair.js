const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const aiService = require('../utils/aiService'); // Changed from geminiService
const githubService = require('../utils/githubService');
const AIPairSession = require('../models/AIPairSession');
const ChatMessage = require('../models/ChatMessage');
const CodeChange = require('../models/CodeChange');
const Subscription = require('../models/Subscription');
const { createDiffPatch } = require('diff');

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.id;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired token'
        });
    }
};

// Middleware to check AI usage limits
const checkAILimits = async (req, res, next) => {
    try {
        const subscription = await Subscription.findOne({ userId: req.userId });
        const tier = subscription?.tier || 'freebie';
        
        // Get today's message count
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const messageCount = await ChatMessage.countDocuments({
            userId: req.userId,
            role: 'user',
            createdAt: { $gte: today }
        });

        // Define limits
        const limits = {
            freebie: 10,
            professional: 100,
            enterprise: Infinity
        };

        const limit = limits[tier];
        
        if (messageCount >= limit) {
            return res.status(429).json({
                success: false,
                message: `Daily AI message limit reached (${limit} messages). Upgrade to get more.`,
                limit,
                used: messageCount
            });
        }

        req.aiLimit = { limit, used: messageCount, remaining: limit - messageCount };
        next();
    } catch (error) {
        console.error('AI limits check error:', error);
        next();
    }
};

// List user's GitHub repositories
router.get('/repos', verifyToken, async (req, res) => {
    try {
        const repos = await githubService.listRepositories(req.userId);
        
        res.json({
            success: true,
            repositories: repos
        });
    } catch (error) {
        console.error('List repos error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get repository details
router.get('/repo/:owner/:repo', verifyToken, async (req, res) => {
    try {
        const { owner, repo } = req.params;
        
        const repository = await githubService.getRepository(req.userId, owner, repo);
        const branches = await githubService.listBranches(req.userId, owner, repo);
        
        res.json({
            success: true,
            repository,
            branches
        });
    } catch (error) {
        console.error('Get repo error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// List files in repository
router.get('/files/:owner/:repo', verifyToken, async (req, res) => {
    try {
        const { owner, repo } = req.params;
        const { path = '', branch } = req.query;
        
        const files = await githubService.listFiles(req.userId, owner, repo, path, branch);
        
        res.json({
            success: true,
            files
        });
    } catch (error) {
        console.error('List files error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get file content
router.get('/file/:owner/:repo/*', verifyToken, async (req, res) => {
    try {
        const { owner, repo } = req.params;
        const path = req.params[0]; // Everything after /file/:owner/:repo/
        const { branch } = req.query;
        
        const file = await githubService.getFileContent(req.userId, owner, repo, path, branch);
        
        res.json({
            success: true,
            file
        });
    } catch (error) {
        console.error('Get file error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Create new AI pair session
router.post('/session', verifyToken, async (req, res) => {
    try {
        const { repositoryId, repositoryName, repositoryOwner, branch, sessionName } = req.body;
        
        const session = await AIPairSession.create({
            userId: req.userId,
            repositoryId,
            repositoryName,
            repositoryOwner,
            branch: branch || 'main',
            sessionName: sessionName || `Session ${new Date().toLocaleString()}`,
            status: 'active'
        });

        res.json({
            success: true,
            session
        });
    } catch (error) {
        console.error('Create session error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get user's sessions
router.get('/sessions', verifyToken, async (req, res) => {
    try {
        const { status, limit = 20 } = req.query;
        
        const query = { userId: req.userId };
        if (status) {
            query.status = status;
        }

        const sessions = await AIPairSession.find(query)
            .sort({ lastActivityAt: -1 })
            .limit(parseInt(limit));

        res.json({
            success: true,
            sessions
        });
    } catch (error) {
        console.error('Get sessions error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get session details
router.get('/session/:sessionId', verifyToken, async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        const session = await AIPairSession.findOne({
            _id: sessionId,
            userId: req.userId
        });

        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }

        // Get messages
        const messages = await ChatMessage.find({ sessionId })
            .sort({ createdAt: 1 })
            .limit(100);

        // Get code changes
        const codeChanges = await CodeChange.find({ sessionId })
            .sort({ createdAt: -1 })
            .limit(50);

        res.json({
            success: true,
            session,
            messages,
            codeChanges
        });
    } catch (error) {
        console.error('Get session error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Chat with AI
router.post('/chat', verifyToken, checkAILimits, async (req, res) => {
    try {
        const { sessionId, message, codeContext } = req.body;
        
        // Verify session belongs to user
        const session = await AIPairSession.findOne({
            _id: sessionId,
            userId: req.userId
        });

        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }

        // Save user message
        const userMessage = await ChatMessage.create({
            sessionId,
            userId: req.userId,
            role: 'user',
            content: message
        });

        // Get conversation history
        const history = await ChatMessage.find({ sessionId })
            .sort({ createdAt: 1 })
            .limit(20)
            .select('role content');

        // Get AI response
        const aiResponse = await aiService.chat(history, codeContext);

        if (!aiResponse.success) {
            return res.status(500).json({
                success: false,
                message: 'AI service error: ' + aiResponse.error
            });
        }

        // Save AI message
        const assistantMessage = await ChatMessage.create({
            sessionId,
            userId: req.userId,
            role: 'assistant',
            content: aiResponse.content,
            codeBlocks: aiResponse.codeBlocks,
            fileReferences: aiResponse.fileReferences
        });

        // Update session
        session.totalMessages += 2;
        session.lastActivityAt = new Date();
        await session.save();

        res.json({
            success: true,
            message: assistantMessage,
            aiLimit: req.aiLimit
        });
    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Apply code change
router.post('/apply-change', verifyToken, async (req, res) => {
    try {
        const { sessionId, filePath, newContent, operation = 'edit' } = req.body;
        
        // Verify session
        const session = await AIPairSession.findOne({
            _id: sessionId,
            userId: req.userId
        });

        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }

        // Get current file content
        let oldContent = '';
        let fileSha = null;
        
        if (operation === 'edit') {
            try {
                const file = await githubService.getFileContent(
                    req.userId,
                    session.repositoryOwner,
                    session.repositoryName,
                    filePath,
                    session.branch
                );
                oldContent = file.content;
                fileSha = file.sha;
            } catch (error) {
                // File might not exist yet
                console.log('File not found, will create new');
            }
        }

        // Generate diff
        const diff = require('diff');
        const patch = diff.createPatch(filePath, oldContent, newContent);

        // Save code change
        const codeChange = await CodeChange.create({
            sessionId,
            userId: req.userId,
            filePath,
            operation,
            oldContent,
            newContent,
            diff: patch,
            status: 'pending'
        });

        res.json({
            success: true,
            codeChange,
            diff: patch
        });
    } catch (error) {
        console.error('Apply change error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Commit changes to GitHub
router.post('/commit', verifyToken, async (req, res) => {
    try {
        const { sessionId, changeIds, commitMessage } = req.body;
        
        // Verify session
        const session = await AIPairSession.findOne({
            _id: sessionId,
            userId: req.userId
        });

        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }

        // Get pending changes
        const changes = await CodeChange.find({
            _id: { $in: changeIds },
            sessionId,
            status: 'pending'
        });

        if (changes.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No pending changes found'
            });
        }

        const results = [];

        // Apply each change to GitHub
        for (const change of changes) {
            try {
                let result;
                
                if (change.operation === 'delete') {
                    result = await githubService.deleteFile(
                        req.userId,
                        session.repositoryOwner,
                        session.repositoryName,
                        change.filePath,
                        commitMessage || `Delete ${change.filePath}`,
                        session.branch
                    );
                } else {
                    // Get current SHA if editing
                    let sha = null;
                    if (change.operation === 'edit') {
                        try {
                            const file = await githubService.getFileContent(
                                req.userId,
                                session.repositoryOwner,
                                session.repositoryName,
                                change.filePath,
                                session.branch
                            );
                            sha = file.sha;
                        } catch (error) {
                            // File doesn't exist, will create
                        }
                    }

                    result = await githubService.createOrUpdateFile(
                        req.userId,
                        session.repositoryOwner,
                        session.repositoryName,
                        change.filePath,
                        change.newContent,
                        commitMessage || `Update ${change.filePath}`,
                        session.branch,
                        sha
                    );
                }

                // Update change status
                change.status = 'applied';
                change.commitSha = result.commit.sha;
                change.appliedAt = new Date();
                await change.save();

                results.push({
                    changeId: change._id,
                    filePath: change.filePath,
                    success: true,
                    commitSha: result.commit.sha
                });
            } catch (error) {
                console.error(`Failed to apply change for ${change.filePath}:`, error);
                results.push({
                    changeId: change._id,
                    filePath: change.filePath,
                    success: false,
                    error: error.message
                });
            }
        }

        // Update session
        session.totalCommits += results.filter(r => r.success).length;
        session.totalEdits += results.filter(r => r.success).length;
        session.lastActivityAt = new Date();
        await session.save();

        res.json({
            success: true,
            results,
            totalApplied: results.filter(r => r.success).length,
            totalFailed: results.filter(r => !r.success).length
        });
    } catch (error) {
        console.error('Commit error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Update session status
router.patch('/session/:sessionId', verifyToken, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { status } = req.body;
        
        const session = await AIPairSession.findOne({
            _id: sessionId,
            userId: req.userId
        });

        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }

        session.status = status;
        if (status === 'completed') {
            session.completedAt = new Date();
        }
        await session.save();

        res.json({
            success: true,
            session
        });
    } catch (error) {
        console.error('Update session error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
