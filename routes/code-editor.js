const express = require('express');
const router = express.Router();
const CodeFile = require('../models/CodeFile');
const { authenticateToken } = require('../middleware/auth');
const { getAllowedLanguages, isLanguageAllowed, getAllLanguagesWithStatus } = require('../utils/languageRestrictions');

/**
 * @swagger
 * /api/code-editor/languages:
 *   get:
 *     summary: Get allowed programming languages for user's subscription tier
 *     tags:
 *       - Code Editor
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of languages with availability status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 tier:
 *                   type: string
 *                 languages:
 *                   type: array
 *                 allowedCount:
 *                   type: integer
 *                 totalCount:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 */
// Get allowed languages for user's tier
router.get('/languages', authenticateToken, async (req, res) => {
    try {
        const user = await require('../models/User').findById(req.userId).populate('subscription');
        const tier = user.subscription?.tier || 'free';
        
        const languages = getAllLanguagesWithStatus(tier);
        
        res.json({
            success: true,
            tier,
            languages,
            allowedCount: languages.filter(l => l.allowed).length,
            totalCount: languages.length
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/code-editor/files:
 *   post:
 *     summary: Create a new code file
 *     tags:
 *       - Code Editor
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - language
 *             properties:
 *               name:
 *                 type: string
 *                 example: index.js
 *               language:
 *                 type: string
 *                 example: javascript
 *               content:
 *                 type: string
 *               companyId:
 *                 type: string
 *               projectId:
 *                 type: string
 *               path:
 *                 type: string
 *                 example: /src
 *     responses:
 *       200:
 *         description: File created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 file:
 *                   $ref: '#/components/schemas/CodeFile'
 *       403:
 *         description: Language not available in current plan
 *       401:
 *         description: Unauthorized
 */
// Create new code file
router.post('/files', authenticateToken, async (req, res) => {
    try {
        const { name, language, content, companyId, projectId, path } = req.body;
        
        const user = await require('../models/User').findById(req.userId).populate('subscription');
        const tier = user.subscription?.tier || 'free';
        
        // Check if language is allowed
        if (!isLanguageAllowed(language, tier)) {
            return res.status(403).json({
                success: false,
                message: `${language} is not available in your ${tier} plan. Upgrade to access 50+ languages.`,
                requiresUpgrade: true
            });
        }
        
        const codeFile = await CodeFile.create({
            name,
            language: language.toLowerCase(),
            content: content || '',
            company: companyId,
            project: projectId,
            createdBy: req.userId,
            lastModifiedBy: req.userId,
            path: path || '/'
        });
        
        await codeFile.populate('createdBy', 'fullName email profilePicture');
        
        res.json({
            success: true,
            file: codeFile
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/code-editor/files/batch:
 *   post:
 *     summary: Batch create multiple code files
 *     tags:
 *       - Code Editor
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - files
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     language:
 *                       type: string
 *                     content:
 *                       type: string
 *                     path:
 *                       type: string
 *               companyId:
 *                 type: string
 *               projectId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Files created (with partial failure info if any)
 *       400:
 *         description: Files array is required
 *       401:
 *         description: Unauthorized
 */
// Batch create multiple files (for AI agent)
router.post('/files/batch', authenticateToken, async (req, res) => {
    try {
        const { files, companyId, projectId } = req.body;
        
        if (!Array.isArray(files) || files.length === 0) {
            return res.status(400).json({ success: false, message: 'Files array is required' });
        }
        
        const user = await require('../models/User').findById(req.userId).populate('subscription');
        const tier = user.subscription?.tier || 'free';
        
        const createdFiles = [];
        const errors = [];
        
        for (const fileData of files) {
            try {
                const { name, language, content, path } = fileData;
                
                // Check if language is allowed
                if (!isLanguageAllowed(language, tier)) {
                    errors.push({ name, error: `${language} not available in ${tier} plan` });
                    continue;
                }
                
                const codeFile = await CodeFile.create({
                    name,
                    language: language.toLowerCase(),
                    content: content || '',
                    company: companyId,
                    project: projectId,
                    createdBy: req.userId,
                    lastModifiedBy: req.userId,
                    path: path || '/'
                });
                
                await codeFile.populate('createdBy', 'fullName email profilePicture');
                createdFiles.push(codeFile);
            } catch (error) {
                errors.push({ name: fileData.name, error: error.message });
            }
        }
        
        res.json({
            success: true,
            files: createdFiles,
            errors: errors.length > 0 ? errors : undefined,
            created: createdFiles.length,
            failed: errors.length
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/code-editor/files:
 *   get:
 *     summary: Get all code files for a company
 *     tags:
 *       - Code Editor
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: companyId
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *       - name: projectId
 *         in: query
 *         schema:
 *           type: string
 *       - name: language
 *         in: query
 *         schema:
 *           type: string
 *       - name: path
 *         in: query
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of code files
 *       401:
 *         description: Unauthorized
 */
// Get all files for a company
router.get('/files', authenticateToken, async (req, res) => {
    try {
        const { companyId, projectId, language, path } = req.query;
        
        const query = { company: companyId };
        if (projectId) query.project = projectId;
        if (language) query.language = language.toLowerCase();
        if (path) query.path = path;
        
        const files = await CodeFile.find(query)
            .populate('createdBy', 'fullName email profilePicture')
            .populate('lastModifiedBy', 'fullName email profilePicture')
            .sort({ updatedAt: -1 });
        
        res.json({
            success: true,
            files
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/code-editor/files/{id}:
 *   get:
 *     summary: Get a single code file by ID
 *     tags:
 *       - Code Editor
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Code file details
 *       404:
 *         description: File not found
 *       401:
 *         description: Unauthorized
 *   put:
 *     summary: Update a code file
 *     tags:
 *       - Code Editor
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *               name:
 *                 type: string
 *               language:
 *                 type: string
 *               comment:
 *                 type: string
 *                 description: Version comment
 *     responses:
 *       200:
 *         description: File updated
 *       404:
 *         description: File not found
 *       401:
 *         description: Unauthorized
 *   delete:
 *     summary: Delete a code file
 *     tags:
 *       - Code Editor
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File deleted
 *       404:
 *         description: File not found
 *       401:
 *         description: Unauthorized
 */
// Get single file
router.get('/files/:id', authenticateToken, async (req, res) => {
    try {
        const file = await CodeFile.findById(req.params.id)
            .populate('createdBy', 'fullName email profilePicture')
            .populate('lastModifiedBy', 'fullName email profilePicture')
            .populate('collaborators.user', 'fullName email profilePicture');
        
        if (!file) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }
        
        res.json({
            success: true,
            file
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update file
router.put('/files/:id', authenticateToken, async (req, res) => {
    try {
        const { content, name, language } = req.body;
        
        const file = await CodeFile.findById(req.params.id);
        if (!file) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }
        
        // Save version if content changed
        if (content && content !== file.content) {
            file.versions.push({
                content: file.content,
                modifiedBy: file.lastModifiedBy,
                modifiedAt: file.updatedAt,
                comment: req.body.comment || 'Auto-saved version'
            });
        }
        
        if (content !== undefined) file.content = content;
        if (name) file.name = name;
        if (language) file.language = language.toLowerCase();
        file.lastModifiedBy = req.userId;
        
        await file.save();
        await file.populate('lastModifiedBy', 'fullName email profilePicture');
        
        res.json({
            success: true,
            file
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete file
router.delete('/files/:id', authenticateToken, async (req, res) => {
    try {
        const file = await CodeFile.findByIdAndDelete(req.params.id);
        
        if (!file) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }
        
        res.json({
            success: true,
            message: 'File deleted successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/code-editor/files/{id}/collaborators:
 *   post:
 *     summary: Add a collaborator to a code file
 *     tags:
 *       - Code Editor
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
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
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *               permission:
 *                 type: string
 *                 enum: [read, write, admin]
 *                 default: write
 *     responses:
 *       200:
 *         description: Collaborator added
 *       404:
 *         description: File not found
 *       401:
 *         description: Unauthorized
 */
// Add collaborator
router.post('/files/:id/collaborators', authenticateToken, async (req, res) => {
    try {
        const { userId, permission } = req.body;
        
        const file = await CodeFile.findById(req.params.id);
        if (!file) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }
        
        // Check if already a collaborator
        const existing = file.collaborators.find(c => c.user.toString() === userId);
        if (existing) {
            existing.permission = permission;
        } else {
            file.collaborators.push({ user: userId, permission });
        }
        
        await file.save();
        await file.populate('collaborators.user', 'fullName email profilePicture');
        
        res.json({
            success: true,
            file
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/code-editor/files/{id}/versions:
 *   get:
 *     summary: Get version history of a code file
 *     tags:
 *       - Code Editor
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of file versions
 *       404:
 *         description: File not found
 *       401:
 *         description: Unauthorized
 */
// Get file versions
router.get('/files/:id/versions', authenticateToken, async (req, res) => {
    try {
        const file = await CodeFile.findById(req.params.id)
            .populate('versions.modifiedBy', 'fullName email profilePicture');
        
        if (!file) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }
        
        res.json({
            success: true,
            versions: file.versions.reverse()
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
