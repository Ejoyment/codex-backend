/**
 * Debug API Routes
 * Handles debugger operations: launch, breakpoints, stepping, etc.
 */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const debugAdapter = require('../utils/debugAdapter');
const CodeFile = require('../models/CodeFile');

// Create debug session
router.post('/session/create', auth, async (req, res) => {
    try {
        const { workspaceId, config } = req.body;
        
        const session = await debugAdapter.createSession(
            req.user._id.toString(),
            workspaceId,
            config
        );
        
        res.json({
            success: true,
            session: {
                id: session.id,
                state: session.state
            }
        });
    } catch (error) {
        console.error('Error creating debug session:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Launch debugger
router.post('/launch', auth, async (req, res) => {
    try {
        const { sessionId, fileId, language, args, env } = req.body;
        
        if (!sessionId || !fileId) {
            return res.status(400).json({
                success: false,
                error: 'sessionId and fileId are required'
            });
        }
        
        // Get file to debug
        const file = await CodeFile.findById(fileId);
        if (!file) {
            return res.status(404).json({
                success: false,
                error: 'File not found'
            });
        }
        
        // Create temporary file for debugging
        const fs = require('fs');
        const path = require('path');
        const tempDir = path.join(__dirname, '../temp');
        
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const tempFile = path.join(tempDir, `debug_${Date.now()}_${file.name}`);
        fs.writeFileSync(tempFile, file.content);
        
        const result = await debugAdapter.launch(sessionId, {
            program: tempFile,
            language: language || file.language,
            args: args || [],
            cwd: tempDir,
            env: env || {}
        });
        
        res.json(result);
    } catch (error) {
        console.error('Error launching debugger:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Set breakpoints
router.post('/breakpoints/set', auth, async (req, res) => {
    try {
        const { sessionId, fileId, breakpoints } = req.body;
        
        if (!sessionId || !fileId || !Array.isArray(breakpoints)) {
            return res.status(400).json({
                success: false,
                error: 'sessionId, fileId, and breakpoints array are required'
            });
        }
        
        const verified = await debugAdapter.setBreakpoints(sessionId, fileId, breakpoints);
        
        res.json({
            success: true,
            breakpoints: verified
        });
    } catch (error) {
        console.error('Error setting breakpoints:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Continue execution
router.post('/continue', auth, async (req, res) => {
    try {
        const { sessionId } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: 'sessionId is required'
            });
        }
        
        const result = await debugAdapter.continue(sessionId);
        res.json(result);
    } catch (error) {
        console.error('Error continuing execution:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Step over
router.post('/step-over', auth, async (req, res) => {
    try {
        const { sessionId } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: 'sessionId is required'
            });
        }
        
        const result = await debugAdapter.stepOver(sessionId);
        res.json(result);
    } catch (error) {
        console.error('Error stepping over:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Step into
router.post('/step-into', auth, async (req, res) => {
    try {
        const { sessionId } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: 'sessionId is required'
            });
        }
        
        const result = await debugAdapter.stepInto(sessionId);
        res.json(result);
    } catch (error) {
        console.error('Error stepping into:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Step out
router.post('/step-out', auth, async (req, res) => {
    try {
        const { sessionId } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: 'sessionId is required'
            });
        }
        
        const result = await debugAdapter.stepOut(sessionId);
        res.json(result);
    } catch (error) {
        console.error('Error stepping out:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Pause execution
router.post('/pause', auth, async (req, res) => {
    try {
        const { sessionId } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: 'sessionId is required'
            });
        }
        
        const result = await debugAdapter.pause(sessionId);
        res.json(result);
    } catch (error) {
        console.error('Error pausing execution:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get stack trace
router.get('/stack-trace/:sessionId', auth, async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        const stackTrace = await debugAdapter.getStackTrace(sessionId);
        
        res.json({
            success: true,
            stackTrace
        });
    } catch (error) {
        console.error('Error getting stack trace:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get variables
router.get('/variables/:sessionId', auth, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { scopeId } = req.query;
        
        const variables = await debugAdapter.getVariables(sessionId, scopeId);
        
        res.json({
            success: true,
            variables
        });
    } catch (error) {
        console.error('Error getting variables:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Evaluate expression
router.post('/evaluate', auth, async (req, res) => {
    try {
        const { sessionId, expression, frameId } = req.body;
        
        if (!sessionId || !expression) {
            return res.status(400).json({
                success: false,
                error: 'sessionId and expression are required'
            });
        }
        
        const result = await debugAdapter.evaluate(sessionId, expression, frameId);
        
        res.json({
            success: true,
            result
        });
    } catch (error) {
        console.error('Error evaluating expression:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Terminate session
router.post('/terminate', auth, async (req, res) => {
    try {
        const { sessionId } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: 'sessionId is required'
            });
        }
        
        const result = await debugAdapter.terminate(sessionId);
        res.json(result);
    } catch (error) {
        console.error('Error terminating session:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get session info
router.get('/session/:sessionId', auth, async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        const session = debugAdapter.getSession(sessionId);
        
        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Session not found'
            });
        }
        
        res.json({
            success: true,
            session
        });
    } catch (error) {
        console.error('Error getting session:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get user's active sessions
router.get('/sessions', auth, async (req, res) => {
    try {
        const sessions = debugAdapter.getUserSessions(req.user._id.toString());
        
        res.json({
            success: true,
            sessions
        });
    } catch (error) {
        console.error('Error getting sessions:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Test endpoint - simulate breakpoint hit
router.post('/test/breakpoint-hit', auth, async (req, res) => {
    try {
        const { sessionId, fileId, line } = req.body;
        
        debugAdapter.simulateBreakpointHit(sessionId, fileId, line);
        
        res.json({
            success: true,
            message: 'Breakpoint hit simulated'
        });
    } catch (error) {
        console.error('Error simulating breakpoint:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
