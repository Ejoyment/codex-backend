const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const CodeFile = require('../models/CodeFile');
const LocalProject = require('../models/LocalProject');
const { authenticateToken } = require('../middleware/auth');
const { getAllowedLanguages, isLanguageAllowed, getAllLanguagesWithStatus } = require('../utils/languageRestrictions');
const { addAuditLog } = require('../utils/auditLogService');
const { trimToLast, MAX_VERSIONS } = require('../utils/retention');
const vfs = require('../utils/virtualFileSystem');
const { emitWorkspaceChange } = require('../utils/realtimeBus');
// Shared tenant-isolation primitive (audit rec 7) — single enforced version.
const {
    assertFileAccess,
    assertCompanyAccess,
    assertCompanyMembership,
    resolveFileAccess,
} = require('../middleware/workspaceAccess');
const { ensurePersonalWorkspace } = require('../utils/personalWorkspace');
const { userCanAccessProject } = require('../utils/specAccess');

/**
 * A file may only be attached to a project the caller can reach. Without this
 * a caller could tag a file with a foreign project id and have it appear in
 * (or be deployed with) another tenant's project.
 */
async function canUseProject(projectId, userId) {
    if (!projectId) return true;
    if (!mongoose.isValidObjectId(projectId)) return false;
    return userCanAccessProject(projectId, userId);
}

function denyProject(res) {
    return res.status(403).json({ success: false, message: 'Access denied' });
}

/**
 * @swagger
 * /api/code-editor/languages:
 *   get:
 *     summary: Get available programming languages (all tiers have full access)
 *     tags:
 *       - Code Editor
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of languages (all available on every tier)
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
// Get available languages (every tier has access to all of them)
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
        
        // Determine company: use companyId from body, or use/create the
        // caller's personal workspace so local projects can always create files.
        let effectiveCompanyId = companyId;
        if (!effectiveCompanyId) {
            const workspace = await ensurePersonalWorkspace(req.userId);
            effectiveCompanyId = workspace._id;
        }

        // Tenant isolation: a caller-supplied companyId must be one of theirs,
        // and creating a file is a write (viewers are read-only).
        if (!(await assertCompanyAccess(effectiveCompanyId, req.userId, res, 'write'))) return;
        if (projectId && !(await canUseProject(projectId, req.userId))) return denyProject(res);

        const codeFile = await CodeFile.create({
            name,
            language: language.toLowerCase(),
            content: content || '',
            company: effectiveCompanyId,
            project: projectId,
            createdBy: req.userId,
            lastModifiedBy: req.userId,
            path: path || '/'
        });
        
        await codeFile.populate('createdBy', 'fullName email profilePicture');
        
        // Update VFS index (keyed by full path: dir + name)
        try {
            const existingIndex = vfs.indexes.get(effectiveCompanyId);
            if (existingIndex) {
                const full = vfs.fullPathOf(codeFile);
                existingIndex.set(full, {
                    id: codeFile._id.toString(),
                    name: codeFile.name,
                    path: full,
                    dirPath: codeFile.path,
                    size: codeFile.size,
                    language: codeFile.language,
                    lastModified: codeFile.updatedAt,
                    createdBy: codeFile.createdBy
                });
            }
        } catch (vfsError) {
            console.error('VFS index update error:', vfsError);
        }
        
        if (projectId) {
            try {
                await LocalProject.updateOne(
                    {
                        _id: projectId,
                        userId: req.userId,
                        $or: [{ workspaceId: null }, { workspaceId: { $exists: false } }],
                    },
                    { $set: { workspaceId: effectiveCompanyId } }
                );
            } catch (projectError) {
                console.error('Attach project workspace error:', projectError);
            }
        }

        // Emit real-time event
        emitWorkspaceChange(effectiveCompanyId, 'file:created', {
            file: {
                _id: codeFile._id,
                name: codeFile.name,
                path: codeFile.path,
                language: codeFile.language,
                company: codeFile.company
            }
        });

        addAuditLog({
            companyId: effectiveCompanyId,
            actorId: req.userId,
            event: 'file.created',
            category: 'code',
            target: codeFile.name,
            details: { fileId: codeFile._id.toString(), language: codeFile.language, path: codeFile.path },
            req
        });
        
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
        const { files, companyId, workspaceId, projectId } = req.body;
        
        if (!Array.isArray(files) || files.length === 0) {
            return res.status(400).json({ success: false, message: 'Files array is required' });
        }

        // A batch may name its target as either companyId or workspaceId, but
        // never both pointing at different workspaces.
        if (companyId && workspaceId && String(companyId) !== String(workspaceId)) {
            return res.status(400).json({ success: false, message: 'companyId and workspaceId must match' });
        }
        const requestedCompanyId = companyId || workspaceId;

        // Tenant isolation: batch target must be one of the caller's companies.
        // A foreign/missing-workspace id is rejected; it is never copied into
        // CodeFile.company from the request body.
        if (requestedCompanyId && !(await assertCompanyAccess(requestedCompanyId, req.userId, res, 'write'))) return;
        if (projectId && !(await canUseProject(projectId, req.userId))) return denyProject(res);

        let effectiveCompanyId = requestedCompanyId;
        if (!effectiveCompanyId) {
            const workspace = await ensurePersonalWorkspace(req.userId);
            effectiveCompanyId = workspace._id;
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
                    company: effectiveCompanyId,
                    project: projectId,
                    createdBy: req.userId,
                    lastModifiedBy: req.userId,
                    path: path || '/'
                });
                
                await codeFile.populate('createdBy', 'fullName email profilePicture');
                createdFiles.push(codeFile);
                
                // Update VFS index (keyed by full path: dir + name)
                try {
                    const existingIndex = vfs.indexes.get(effectiveCompanyId);
                    if (existingIndex) {
                        const full = vfs.fullPathOf(codeFile);
                        existingIndex.set(full, {
                            id: codeFile._id.toString(),
                            name: codeFile.name,
                            path: full,
                            dirPath: codeFile.path,
                            size: codeFile.size,
                            language: codeFile.language,
                            lastModified: codeFile.updatedAt,
                            createdBy: codeFile.createdBy
                        });
                    }
                } catch (vfsError) {
                    console.error('VFS index update error:', vfsError);
                }
            } catch (error) {
                errors.push({ name: fileData.name, error: error.message });
            }
        }
        
        if (projectId && createdFiles.length > 0) {
            try {
                await LocalProject.updateOne(
                    {
                        _id: projectId,
                        userId: req.userId,
                        $or: [{ workspaceId: null }, { workspaceId: { $exists: false } }],
                    },
                    { $set: { workspaceId: effectiveCompanyId } }
                );
            } catch (projectError) {
                console.error('Attach project workspace error:', projectError);
            }
        }

        // Emit real-time event for batch creation
        if (createdFiles.length > 0) {
            emitWorkspaceChange(effectiveCompanyId, 'files:created', {
                files: createdFiles.map(f => ({
                    _id: f._id,
                    name: f.name,
                    path: f.path,
                    language: f.language,
                    company: f.company
                }))
            });
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
        
        // Scope: companyId/projectId when given, otherwise only files in the
        // user's own companies or created by them — never the whole database
        // (an unscoped query used to make newly created files invisible in
        // the editor explorer whenever companyId was missing).
        // Tenant isolation: an explicit companyId must be one of theirs, and
        // a projectId must be a project they can reach (owner/member/workspace).
        if (companyId && !(await assertCompanyMembership(companyId, req.userId, res))) return;
        if (projectId && !(await canUseProject(projectId, req.userId))) return denyProject(res);
        const query = {};
        if (companyId) {
            query.company = companyId;
        } else if (projectId) {
            query.project = projectId;
        } else {
            const Company = require('../models/Company');
            const mine = await Company.find({
                $or: [{ owner: req.userId }, { 'members.user': req.userId }]
            }).select('_id').lean();
            const or = [{ createdBy: req.userId }];
            if (mine.length) or.push({ company: { $in: mine.map(c => c._id) } });
            query.$or = or;
        }
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

        if (!(await assertFileAccess(file, req.userId, res))) return;

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
        if (!(await assertFileAccess(file, req.userId, res, 'write'))) return;
        const oldFull = vfs.fullPathOf(file);
        
        // Save version if content changed
        if (content && content !== file.content) {
            file.versions.push({
                content: file.content,
                modifiedBy: file.lastModifiedBy,
                modifiedAt: file.updatedAt,
                comment: req.body.comment || 'Auto-saved version'
            });
            // Cap version history (each entry is a full content copy).
            trimToLast(file.versions, MAX_VERSIONS);
        }
        
        if (content !== undefined) file.content = content;
        if (name) file.name = name;
        if (language) file.language = language.toLowerCase();
        file.lastModifiedBy = req.userId;
        
        await file.save();
        await file.populate('lastModifiedBy', 'fullName email profilePicture');

        addAuditLog({
            companyId: file.company?.toString(),
            actorId: req.userId,
            event: 'file.updated',
            category: 'code',
            target: file.name,
            details: { fileId: file._id.toString(), language: file.language, path: file.path },
            req
        });
        
        // Update VFS cache and index (re-key when the name/path changed)
        try {
            const workspaceId = file.company.toString();
            const cacheKey = `${workspaceId}:${file._id}`;
            const index = vfs.indexes.get(workspaceId);
            if (index) {
                const newFull = vfs.fullPathOf(file);
                if (oldFull !== newFull) index.delete(oldFull);
                const metadata = index.get(newFull) || {};
                metadata.id = file._id.toString();
                metadata.name = file.name;
                metadata.path = newFull;
                metadata.dirPath = file.path;
                metadata.size = file.size;
                metadata.language = file.language;
                metadata.lastModified = file.updatedAt;
                index.set(newFull, metadata);
            }
            vfs.cache.set(cacheKey, file.toObject());
        } catch (vfsError) {
            console.error('VFS update error:', vfsError);
        }
        
        // Emit real-time event
        emitWorkspaceChange(file.company.toString(), 'file:updated', {
            file: {
                _id: file._id,
                name: file.name,
                path: file.path,
                language: file.language,
                content: file.content,
                company: file.company
            }
        });
        
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
        const file = await CodeFile.findById(req.params.id);

        if (!(await assertFileAccess(file, req.userId, res, 'manage'))) return;

        const workspaceId = file.company.toString();
        const fileId = file._id.toString();
        const filePath = vfs.fullPathOf(file);
        
        // VFS first: it re-reads the doc to drop the index entry, so it must
        // run before the hard delete (the old order always threw not-found
        // and leaked the index entry).
        try {
            await vfs.deleteFile(fileId, workspaceId);
        } catch (vfsError) {
            console.error('VFS delete error:', vfsError);
        }
        // Delete with the workspace filter as well as the id: the mutation
        // itself is tenant-scoped, not just the pre-check above.
        await CodeFile.findOneAndDelete({ _id: req.params.id, company: file.company }).catch(() => null);
        
        // Emit real-time event
        emitWorkspaceChange(workspaceId, 'file:deleted', {
            fileId,
            path: filePath,
            company: workspaceId
        });

        addAuditLog({
            companyId: workspaceId,
            actorId: req.userId,
            event: 'file.deleted',
            category: 'code',
            target: file.name,
            details: { fileId, path: filePath },
            req
        });
        
        res.json({
            success: true,
            message: 'File deleted successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

const FILE_PERMISSIONS = ['read', 'write', 'admin'];

/**
 * @swagger
 * /api/code-editor/files/{id}/collaborators:
 *   get:
 *     summary: List file collaborators and the caller's effective access
 *     tags:
 *       - Code Editor
 *     security:
 *       - bearerAuth: []
 *   post:
 *     summary: Add or update a file collaborator
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
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *               permission:
 *                 type: string
 *                 enum: [read, write, admin]
 *                 default: read
 *     responses:
 *       200:
 *         description: Collaborator added
 *       400:
 *         description: Invalid user or permission
 *       403:
 *         description: Caller cannot manage this file
 *       404:
 *         description: File not found
 */
// List collaborators (also tells the editor whether to show sharing controls)
router.get('/files/:id/collaborators', authenticateToken, async (req, res) => {
    try {
        const file = await CodeFile.findById(req.params.id)
            .populate('collaborators.user', 'fullName email profilePicture');

        if (!(await assertFileAccess(file, req.userId, res))) return;

        const access = await resolveFileAccess(file, req.userId);
        res.json({
            success: true,
            collaborators: file.collaborators || [],
            access,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Add or update collaborator
router.post('/files/:id/collaborators', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.body;
        const permission = req.body.permission || 'read';

        const file = await CodeFile.findById(req.params.id);
        if (!(await assertFileAccess(file, req.userId, res, 'manage'))) return;

        if (!userId || !mongoose.isValidObjectId(userId)) {
            return res.status(400).json({ success: false, message: 'Valid userId is required' });
        }
        if (!FILE_PERMISSIONS.includes(permission)) {
            return res.status(400).json({
                success: false,
                message: `Invalid permission. Allowed values: ${FILE_PERMISSIONS.join(', ')}`
            });
        }

        const targetId = String(userId);
        const existing = (file.collaborators || []).find(
            c => String(c.user?._id || c.user) === targetId
        );
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
 * Remove a collaborator. File management follows the same `canManage` rule as
 * deletion: owners/admins/creator/admin collaborators, never viewers.
 */
router.delete('/files/:id/collaborators/:userId', authenticateToken, async (req, res) => {
    try {
        const file = await CodeFile.findById(req.params.id);
        if (!(await assertFileAccess(file, req.userId, res, 'manage'))) return;

        const targetId = String(req.params.userId);
        const collaborators = file.collaborators || [];
        const index = collaborators.findIndex(
            c => String(c.user?._id || c.user) === targetId
        );
        if (index === -1) {
            return res.status(404).json({ success: false, message: 'Collaborator not found' });
        }

        collaborators.splice(index, 1);
        await file.save();
        await file.populate('collaborators.user', 'fullName email profilePicture');

        res.json({ success: true, file });
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

        if (!(await assertFileAccess(file, req.userId, res))) return;

        res.json({
            success: true,
            versions: file.versions.reverse()
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
