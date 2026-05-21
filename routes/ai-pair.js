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

/**
 * @swagger
 * /api/ai-pair/session:
 *   post:
 *     summary: Create a new AI pair programming session
 *     tags:
 *       - AI Pair Programming
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               repositoryId:
 *                 type: string
 *                 example: "12345"
 *               repositoryName:
 *                 type: string
 *                 example: "my-project"
 *               repositoryOwner:
 *                 type: string
 *                 example: "john"
 *               branch:
 *                 type: string
 *                 example: "main"
 *               sessionName:
 *                 type: string
 *                 example: "Debug Auth Flow"
 *     responses:
 *       201:
 *         description: AI pair session created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 session:
 *                   $ref: '#/components/schemas/AIPairSession'
 */
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

/**
 * @swagger
 * /api/ai-pair/chat:
 *   post:
 *     summary: Chat with AI pair programmer
 *     tags:
 *       - AI Pair Programming
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sessionId:
 *                 type: string
 *               message:
 *                 type: string
 *                 example: "Why is this authentication token not working?"
 *               codeContext:
 *                 type: object
 *                 properties:
 *                   file:
 *                     type: string
 *                   language:
 *                     type: string
 *               enableActions:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: AI response with suggestions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 reply:
 *                   type: string
 *                 suggestions:
 *                   type: array
 *                 usage:
 *                   type: object
 */
// Chat with AI (Enhanced with ReAct Agent Loop)
router.post('/chat', verifyToken, checkAILimits, async (req, res) => {
    try {
        const { sessionId, message, codeContext, enableActions = false, useAgentLoop = false } = req.body;
        
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

        // If agent loop is requested, use orchestrator
        if (useAgentLoop) {
            const agentOrchestrator = require('../utils/agentOrchestrator');
            
            const context = {
                userId: req.userId,
                workspaceId: codeContext.workspace?.id,
                workspaceName: codeContext.workspace?.name,
                files: codeContext.files || [],
                currentFile: codeContext.currentFile
            };

            const result = await agentOrchestrator.executeAgenticLoop(
                message, // The goal
                context,
                sessionId
            );

            // Save agent summary
            await ChatMessage.create({
                sessionId,
                userId: req.userId,
                role: 'assistant',
                content: JSON.stringify(result.summary),
                metadata: {
                    type: 'agent_summary',
                    iterations: result.iterations.length
                }
            });

            // Update session
            session.totalMessages += 2;
            session.lastActivityAt = new Date();
            await session.save();

            return res.json({
                success: true,
                agentMode: true,
                result,
                aiLimit: req.aiLimit
            });
        }

        // Standard chat mode (existing logic)
        const history = await ChatMessage.find({ sessionId })
            .sort({ createdAt: 1 })
            .limit(20)
            .select('role content');

        // Enhanced context with agent instructions
        const enhancedContext = {
            ...codeContext,
            agentMode: enableActions,
            instructions: enableActions ? `You are an autonomous AI coding agent. When users ask you to create files, projects, or make changes:

1. AUTOMATICALLY generate actions to execute - don't just explain
2. Use these action types:
   - create_file: Create a single file
   - create_multiple_files: Create multiple files at once (preferred for projects)
   - update_file: Update existing file
   - delete_file: Delete a file
   - update_current_file: Update the currently open file
   - insert_code: Insert code at cursor position

3. For "create a website" or "create a project" requests:
   - Use create_multiple_files with ALL files needed
   - Include complete, working code in each file
   - Organize files in proper paths (e.g., "/styles/main.css", "/scripts/app.js")
   - DO NOT show code blocks - return actions instead

4. Response format when creating files:
{
  "actions": [{
    "action": "create_multiple_files",
    "files": [
      {"name": "index.html", "path": "/", "content": "<!DOCTYPE html>...", "language": "html"},
      {"name": "styles.css", "path": "/styles", "content": "body {...}", "language": "css"}
    ]
  }],
  "message": "I've created a complete website with HTML, CSS, and JavaScript files."
}

5. Only show code blocks if user asks to "show me" or "explain" - otherwise execute actions` : ''
        };

        // Get AI response
        const aiResponse = await aiService.chat(history, enhancedContext);

        if (!aiResponse.success) {
            return res.status(500).json({
                success: false,
                message: 'AI service error: ' + aiResponse.error
            });
        }

        // Parse AI response for actions
        let actions = [];
        let responseContent = aiResponse.content;
        
        if (enableActions) {
            // Try to extract JSON actions from response
            const jsonMatch = aiResponse.content.match(/\{[\s\S]*"actions"[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    const parsed = JSON.parse(jsonMatch[0]);
                    if (parsed.actions && Array.isArray(parsed.actions)) {
                        actions = parsed.actions;
                        responseContent = parsed.message || aiResponse.content;
                    }
                } catch (e) {
                    console.log('Failed to parse actions from AI response:', e);
                }
            }
            
            // Fallback: Detect intent from message
            if (actions.length === 0) {
                actions = detectActionsFromMessage(message, aiResponse.content, codeContext);
            }
        }

        // Save AI message
        const assistantMessage = await ChatMessage.create({
            sessionId,
            userId: req.userId,
            role: 'assistant',
            content: responseContent,
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
            actions: actions.length > 0 ? actions : undefined,
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

// Helper function to detect actions from AI response
function detectActionsFromMessage(userMessage, aiResponse, codeContext) {
    const actions = [];
    const lowerMessage = userMessage.toLowerCase();
    
    // Detect "create website" or "create project" intent
    if (lowerMessage.includes('create') && (lowerMessage.includes('website') || lowerMessage.includes('site') || lowerMessage.includes('page'))) {
        // Extract code blocks from AI response
        const codeBlocks = extractCodeBlocks(aiResponse);
        
        if (codeBlocks.length > 0) {
            const files = codeBlocks.map(block => ({
                name: block.filename || guessFilename(block.language, block.code),
                path: guessFilePath(block.filename || '', block.language),
                content: block.code,
                language: block.language || 'text'
            }));
            
            actions.push({
                action: 'create_multiple_files',
                files: files
            });
        }
    }
    
    // Detect "fix" or "update current file" intent
    if (codeContext?.currentFile && (lowerMessage.includes('fix') || lowerMessage.includes('update') || lowerMessage.includes('change'))) {
        const codeBlocks = extractCodeBlocks(aiResponse);
        if (codeBlocks.length > 0 && codeBlocks[0].code.length > 50) {
            actions.push({
                action: 'update_current_file',
                content: codeBlocks[0].code
            });
        }
    }
    
    return actions;
}

// Extract code blocks from markdown
function extractCodeBlocks(text) {
    const blocks = [];
    const regex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
        blocks.push({
            language: match[1] || 'text',
            code: match[2].trim(),
            filename: null
        });
    }
    
    return blocks;
}

// Guess filename from language
function guessFilename(language, code) {
    const map = {
        'html': 'index.html',
        'css': 'styles.css',
        'javascript': 'script.js',
        'js': 'script.js',
        'python': 'main.py',
        'java': 'Main.java',
        'typescript': 'index.ts'
    };
    return map[language] || `file.${language}`;
}

// Guess file path from filename
function guessFilePath(filename, language) {
    if (filename.includes('/')) {
        return filename.substring(0, filename.lastIndexOf('/'));
    }
    
    if (language === 'css') return '/styles';
    if (language === 'javascript' || language === 'js') return '/scripts';
    if (language === 'html') return '/';
    
    return '/';
}

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

// ============================================
// VECTOR MEMORY ENDPOINTS
// ============================================

// Store code pattern in vector memory
router.post('/memory/store', verifyToken, async (req, res) => {
    try {
        const { content, metadata, workspaceId } = req.body;
        
        if (!content) {
            return res.status(400).json({
                success: false,
                message: 'Content is required'
            });
        }

        const vectorMemory = require('../utils/vectorMemory');
        
        const result = await vectorMemory.store(
            content,
            metadata || {},
            req.userId,
            workspaceId
        );

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('Store memory error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Retrieve similar patterns from vector memory
router.get('/memory/retrieve', verifyToken, async (req, res) => {
    try {
        const { query, k = 5, workspaceId } = req.query;
        
        if (!query) {
            return res.status(400).json({
                success: false,
                message: 'Query is required'
            });
        }

        const vectorMemory = require('../utils/vectorMemory');
        
        const results = await vectorMemory.retrieve(
            query,
            parseInt(k),
            req.userId,
            workspaceId
        );

        res.json({
            success: true,
            results,
            count: results.length
        });
    } catch (error) {
        console.error('Retrieve memory error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Clear memories for user/workspace
router.delete('/memory/clear', verifyToken, async (req, res) => {
    try {
        const { workspaceId } = req.query;
        
        const vectorMemory = require('../utils/vectorMemory');
        
        const result = await vectorMemory.clear(
            req.userId,
            workspaceId
        );

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('Clear memory error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get memory statistics
router.get('/memory/stats', verifyToken, async (req, res) => {
    try {
        const { workspaceId } = req.query;
        
        const vectorMemory = require('../utils/vectorMemory');
        
        const stats = await vectorMemory.getStats(
            req.userId,
            workspaceId
        );

        res.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('Memory stats error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ============================================
// SANDBOX EXECUTION ENDPOINTS
// ============================================

// Execute code in sandbox
router.post('/execute', verifyToken, async (req, res) => {
    try {
        const { code, language = 'javascript', timeout } = req.body;
        
        if (!code) {
            return res.status(400).json({
                success: false,
                message: 'Code is required'
            });
        }

        const sandboxExecutor = require('../utils/sandboxExecutor');
        
        // Validate code
        const validation = sandboxExecutor.validateCode(code, language);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: validation.error
            });
        }

        // Execute
        const result = await sandboxExecutor.execute(code, language, { timeout });

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('Execute code error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get sandbox statistics
router.get('/sandbox/stats', verifyToken, async (req, res) => {
    try {
        const sandboxExecutor = require('../utils/sandboxExecutor');
        const stats = sandboxExecutor.getStats();

        res.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('Sandbox stats error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
