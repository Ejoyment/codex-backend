/**
 * Debug API Routes
 * Handles debugger operations: launch, breakpoints, stepping, etc.
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const debugAdapter = require('../utils/debugAdapter');
const CodeFile = require('../models/CodeFile');

/**
 * @swagger
 * /api/debug/session/create:
 *   post:
 *     summary: Create debug session
 *     tags:
 *       - Debug
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               workspaceId:
 *                 type: string
 *               config:
 *                 type: object
 *     responses:
 *       200:
 *         description: Debug session created
 *       401:
 *         description: Unauthorized
 */
router.post('/session/create', authenticateToken, async (req, res) => {
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

/**
 * @swagger
 * /api/debug/launch:
 *   post:
 *     summary: Launch debugger
 *     tags:
 *       - Debug
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
 *               fileId:
 *                 type: string
 *               language:
 *                 type: string
 *               args:
 *                 type: array
 *                 items:
 *                   type: string
 *               env:
 *                 type: object
 *     responses:
 *       200:
 *         description: Debugger launched
 *       400:
 *         description: Missing required fields
 *       404:
 *         description: File not found
 *       401:
 *         description: Unauthorized
 */
router.post('/launch', authenticateToken, async (req, res) => {
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

/**
 * @swagger
 * /api/debug/breakpoints/set:
 *   post:
 *     summary: Set breakpoints
 *     tags:
 *       - Debug
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
 *               fileId:
 *                 type: string
 *               breakpoints:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Breakpoints set
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized
 */
router.post('/breakpoints/set', authenticateToken, async (req, res) => {
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

/**
 * @swagger
 * /api/debug/continue:
 *   post:
 *     summary: Continue debug execution
 *     tags:
 *       - Debug
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
 *     responses:
 *       200:
 *         description: Execution continued
 *       400:
 *         description: Missing sessionId
 *       401:
 *         description: Unauthorized
 */
router.post('/continue', authenticateToken, async (req, res) => {
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

/**
 * @swagger
 * /api/debug/step-over:
 *   post:
 *     summary: Step over in debugger
 *     tags:
 *       - Debug
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
 *     responses:
 *       200:
 *         description: Stepped over
 *       400:
 *         description: Missing sessionId
 *       401:
 *         description: Unauthorized
 */
router.post('/step-over', authenticateToken, async (req, res) => {
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

/**
 * @swagger
 * /api/debug/step-into:
 *   post:
 *     summary: Step into in debugger
 *     tags:
 *       - Debug
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
 *     responses:
 *       200:
 *         description: Stepped into
 *       400:
 *         description: Missing sessionId
 *       401:
 *         description: Unauthorized
 */
router.post('/step-into', authenticateToken, async (req, res) => {
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

/**
 * @swagger
 * /api/debug/step-out:
 *   post:
 *     summary: Step out in debugger
 *     tags:
 *       - Debug
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
 *     responses:
 *       200:
 *         description: Stepped out
 *       400:
 *         description: Missing sessionId
 *       401:
 *         description: Unauthorized
 */
router.post('/step-out', authenticateToken, async (req, res) => {
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

/**
 * @swagger
 * /api/debug/pause:
 *   post:
 *     summary: Pause debug execution
 *     tags:
 *       - Debug
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
 *     responses:
 *       200:
 *         description: Execution paused
 *       400:
 *         description: Missing sessionId
 *       401:
 *         description: Unauthorized
 */
router.post('/pause', authenticateToken, async (req, res) => {
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

/**
 * @swagger
 * /api/debug/stack-trace/{sessionId}:
 *   get:
 *     summary: Get debug stack trace
 *     tags:
 *       - Debug
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: sessionId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Stack trace retrieved
 *       401:
 *         description: Unauthorized
 */
router.get('/stack-trace/:sessionId', authenticateToken, async (req, res) => {
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

/**
 * @swagger
 * /api/debug/variables/{sessionId}:
 *   get:
 *     summary: Get debug variables
 *     tags:
 *       - Debug
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: sessionId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: scopeId
 *         in: query
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Variables retrieved
 *       401:
 *         description: Unauthorized
 */
router.get('/variables/:sessionId', authenticateToken, async (req, res) => {
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

/**
 * @swagger
 * /api/debug/evaluate:
 *   post:
 *     summary: Evaluate expression in debugger
 *     tags:
 *       - Debug
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
 *               expression:
 *                 type: string
 *               frameId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Expression evaluated
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized
 */
router.post('/evaluate', authenticateToken, async (req, res) => {
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

/**
 * @swagger
 * /api/debug/terminate:
 *   post:
 *     summary: Terminate debug session
 *     tags:
 *       - Debug
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
 *     responses:
 *       200:
 *         description: Session terminated
 *       400:
 *         description: Missing sessionId
 *       401:
 *         description: Unauthorized
 */
router.post('/terminate', authenticateToken, async (req, res) => {
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

/**
 * @swagger
 * /api/debug/session/{sessionId}:
 *   get:
 *     summary: Get debug session info
 *     tags:
 *       - Debug
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: sessionId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Session info retrieved
 *       404:
 *         description: Session not found
 *       401:
 *         description: Unauthorized
 */
router.get('/session/:sessionId', authenticateToken, async (req, res) => {
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

/**
 * @swagger
 * /api/debug/sessions:
 *   get:
 *     summary: Get user's active debug sessions
 *     tags:
 *       - Debug
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Active sessions retrieved
 *       401:
 *         description: Unauthorized
 */
router.get('/sessions', authenticateToken, async (req, res) => {
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

/**
 * @swagger
 * /api/debug/test/breakpoint-hit:
 *   post:
 *     summary: Test endpoint - simulate breakpoint hit
 *     tags:
 *       - Debug
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
 *               fileId:
 *                 type: string
 *               line:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Breakpoint hit simulated
 *       401:
 *         description: Unauthorized
 */
router.post('/test/breakpoint-hit', authenticateToken, async (req, res) => {
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
