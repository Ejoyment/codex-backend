const express = require('express');
const router = express.Router();
const CodeFile = require('../models/CodeFile');
const { authenticateToken } = require('../middleware/auth');
const { getAllowedLanguages, isLanguageAllowed, getAllLanguagesWithStatus } = require('../utils/languageRestrictions');

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
