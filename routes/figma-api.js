const { sendInternalError } = require('../utils/httpErrors');
const express = require('express');
const router = express.Router();
const axios = require('axios');
const Integration = require('../models/Integration');
const jwt = require('jsonwebtoken');
const { createStateToken, verifyStateToken } = require('../utils/oauthState');
const { authenticateToken } = require('../middleware/auth');
const { buildFigmaAuthorizeUrl } = require('../utils/figmaOAuth');
const { parseFigmaUrl, normalizeNodeId, listPagesAndFrames } = require('../utils/figmaDesignSpec');
const { getNodeImageUrls } = require('../utils/figmaContextService');
const crypto = require('crypto');

// Normalize the backend origin so a `BACKEND_URL` ending in `/api` or a slash
// never produces a doubled path.
function backendBaseUrl() {
    return String(process.env.BACKEND_URL || '')
        .trim()
        .replace(/\/+$/, '')
        .replace(/\/api$/i, '')
        .replace(/\/+$/, '');
}

function figmaCallbackUrl() {
    return process.env.FIGMA_CALLBACK_URL || `${backendBaseUrl()}/api/figma/callback`;
}

async function getFigmaIntegration(userId) {
    const integration = await Integration.findOne({ userId, provider: 'figma', isActive: true });
    if (!integration) throw new Error('Figma not connected');
    
    // Check if token expired
    if (integration.expiresAt && new Date() > integration.expiresAt) {
        try {
            const refreshed = await refreshFigmaToken(integration);
            return refreshed;
        } catch (error) {
            throw new Error('Figma token expired. Please reconnect.');
        }
    }
    
    return integration;
}

async function refreshFigmaToken(integration) {
    try {
        // Figma expects client credentials via HTTP Basic auth on this endpoint.
        const basicAuth = Buffer.from(
            `${process.env.FIGMA_CLIENT_ID}:${process.env.FIGMA_CLIENT_SECRET}`
        ).toString('base64');

        const response = await axios.post(
            'https://api.figma.com/v1/oauth/refresh',
            new URLSearchParams({ refresh_token: integration.refreshToken }),
            {
                headers: {
                    'Authorization': `Basic ${basicAuth}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 15000
            }
        );
        
        const data = response.data;
        integration.accessToken = data.access_token;
        integration.expiresAt = new Date(Date.now() + data.expires_in * 1000);
        await integration.save();
        
        return integration;
    } catch (error) {
        console.error('Figma token refresh error:', error);
        throw error;
    }
}

// Figma cannot enumerate a user's teams/projects programmatically with the
// granular OAuth scopes it hands out today (`/v1/me` no longer returns teams).
// Files are therefore imported from a link/key the user pastes and remembered
// on the integration so the picker keeps working across sessions.
function parseFigmaFileKey(input) {
    return parseFigmaUrl(input)?.fileKey || null;
}

function readSavedFigmaFiles(integration) {
    const saved = integration?.metadata?.get?.('figmaFiles');
    if (!Array.isArray(saved)) return [];
    return saved
        .filter((file) => file && typeof file.key === 'string' && file.key)
        .map((file) => ({
            key: file.key,
            name: file.name || 'Untitled file',
            thumbnail_url: file.thumbnail_url || null,
            last_modified: file.last_modified || null,
            addedAt: file.addedAt || null,
            source: file.source || 'link',
            selection: Array.isArray(file.selection) ? file.selection : [],
            pushedAt: file.pushedAt || null,
        }));
}

function toSavedFigmaFile(file, fallbackKey, extra = {}) {
    const key = file?.key || fallbackKey;
    if (!key) return null;
    return {
        key,
        name: file?.name || 'Untitled file',
        thumbnail_url: file?.thumbnailUrl || file?.thumbnail_url || null,
        last_modified: file?.lastModified || file?.last_modified || null,
        addedAt: new Date().toISOString(),
        source: 'link',
        selection: [],
        pushedAt: null,
        ...extra,
    };
}

// Newest import first, deduped by Figma file key.
async function saveFigmaFiles(integration, incoming) {
    const merged = new Map();
    for (const file of [...incoming, ...readSavedFigmaFiles(integration)]) {
        if (file?.key && !merged.has(file.key)) merged.set(file.key, file);
    }
    const next = Array.from(merged.values()).slice(0, 100);
    if (!integration.metadata) integration.metadata = new Map();
    integration.metadata.set('figmaFiles', next);
    if (typeof integration.markModified === 'function') integration.markModified('metadata');
    await integration.save();
    return next;
}

// Legacy best-effort discovery. Some older tokens still carry team access, so
// try it, but never let it fail the listing request.
async function discoverFigmaFiles(integration) {
    const user = await figmaAPI(integration.accessToken, '/me');
    const teamId = user?.teams?.[0]?.id;
    if (!teamId) return [];

    const projects = await figmaAPI(integration.accessToken, `/teams/${teamId}/projects`);
    const projectIds = (projects?.projects || []).map((project) => project.id).filter(Boolean).slice(0, 5);
    const discovered = [];

    for (const projectId of projectIds) {
        try {
            const result = await figmaAPI(integration.accessToken, `/projects/${projectId}/files`);
            for (const file of result?.files || []) {
                const saved = toSavedFigmaFile(file);
                if (saved) discovered.push(saved);
            }
        } catch (error) {
            // Per-project failures are expected; skip and continue.
        }
    }

    return discovered;
}

async function figmaAPI(accessToken, endpoint, method = 'GET', data = null) {
    try {
        const response = await axios({
            method,
            url: `https://api.figma.com/v1${endpoint}`,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            data,
            timeout: 20000
        });
        return response.data;
    } catch (error) {
        console.error('Figma API error:', error.response?.data || error.message);
        throw error;
    }
}

/**
 * @swagger
 * /api/figma/me:
 *   get:
 *     summary: Get current Figma user information
 *     tags:
 *       - Figma API
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Figma user information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     handle:
 *                       type: string
 *                     img_url:
 *                       type: string
 *       401:
 *         description: Unauthorized - invalid or missing token
 *       500:
 *         description: Internal server error
 */
// Get current user
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const integration = await getFigmaIntegration(req.userId);
        const user = await figmaAPI(integration.accessToken, '/me');
        res.json({ success: true, user });
    } catch (error) {
        return sendInternalError(req, res, error);
    }
});

// Get user's files
router.get('/files', authenticateToken, async (req, res) => {
    try {
        const integration = await Integration.findOne({
            userId: req.userId,
            provider: 'figma',
            isActive: true,
        });

        if (!integration) {
            return res.json({ success: true, connected: false, files: [] });
        }

        const saved = readSavedFigmaFiles(integration);

        // Only fall back to team discovery when nothing has been imported yet.
        if (!saved.length) {
            const discovered = await discoverFigmaFiles(integration).catch(() => []);
            if (discovered.length) {
                const files = await saveFigmaFiles(integration, discovered);
                return res.json({ success: true, connected: true, files });
            }
        }

        return res.json({
            success: true,
            connected: true,
            files: saved,
            message: saved.length
                ? undefined
                : 'No Figma files saved yet. Paste a Figma file link to add one.',
        });
    } catch (error) {
        // Listing is a browser convenience: never turn it into a 500 that
        // blanks the page. Surface an actionable empty state instead.
        console.error('Figma file listing error:', error.message);
        return res.json({
            success: true,
            connected: true,
            files: [],
            message: 'Could not list Figma files. Paste a Figma file link to add one.',
        });
    }
});

// Import a Figma file by link or key
router.post('/files', authenticateToken, async (req, res) => {
    try {
        const integration = await getFigmaIntegration(req.userId);
        const submitted = req.body?.url || req.body?.fileKey || req.body?.link;
        const fileKey = parseFigmaFileKey(submitted);

        if (!fileKey) {
            return res.status(400).json({
                success: false,
                message: 'Paste a Figma file link (figma.com/file/…) or a file key.',
            });
        }

        let file;
        try {
            file = await figmaAPI(
                integration.accessToken,
                `/files/${encodeURIComponent(fileKey)}?depth=1`
            );
        } catch (error) {
            const status = error.response?.status;
            if (status === 404) {
                return res.status(404).json({
                    success: false,
                    message: 'That Figma file was not found. Check the link and try again.',
                });
            }
            if (status === 403) {
                return res.status(403).json({
                    success: false,
                    message: 'Your Figma account does not have access to that file.',
                });
            }
            throw error;
        }

        const saved = toSavedFigmaFile(file, fileKey);
        const files = await saveFigmaFiles(integration, [saved]);
        return res.json({ success: true, file: saved, files });
    } catch (error) {
        if (error.message === 'Figma not connected') {
            return res.status(400).json({ success: false, message: 'Connect Figma first.' });
        }
        return sendInternalError(req, res, error);
    }
});

function figmaAccessError(res, error) {
    const status = error.response?.status;
    if (status === 404) {
        return res.status(404).json({ success: false, message: 'That Figma file was not found.' });
    }
    if (status === 403) {
        return res.status(403).json({ success: false, message: 'Your Figma account does not have access to that file.' });
    }
    return null;
}

// Pages and top-level frames of a file, with rendered thumbnails, for the
// frame browser (convert to code / link to a task).
router.get('/files/:fileKey/frames', authenticateToken, async (req, res) => {
    try {
        const integration = await getFigmaIntegration(req.userId);
        const fileKey = parseFigmaFileKey(req.params.fileKey);
        if (!fileKey) {
            return res.status(400).json({ success: false, message: 'Invalid Figma file key.' });
        }

        let file;
        try {
            file = await figmaAPI(integration.accessToken, `/files/${encodeURIComponent(fileKey)}?depth=2`);
        } catch (error) {
            if (figmaAccessError(res, error)) return;
            throw error;
        }

        const pages = listPagesAndFrames(file.document);
        pages.forEach((page) => page.frames.forEach((frame) => { frame.thumbnailUrl = null; }));
        if (req.query.thumbnails !== '0') {
            const frameIds = pages.flatMap((page) => page.frames.map((frame) => frame.id)).slice(0, 50);
            try {
                const images = await getNodeImageUrls(integration.accessToken, fileKey, frameIds, { scale: 0.5 });
                pages.forEach((page) => page.frames.forEach((frame) => {
                    frame.thumbnailUrl = images[frame.id] || null;
                }));
            } catch (error) {
                // Thumbnails are cosmetic; the frame list is still usable.
                console.warn('Figma frame thumbnails unavailable:', error.message);
            }
        }

        // Opening a file keeps it in the user's library with fresh metadata.
        const existing = readSavedFigmaFiles(integration).find((saved) => saved.key === fileKey);
        await saveFigmaFiles(integration, [toSavedFigmaFile(file, fileKey, existing ? {
            addedAt: existing.addedAt,
            source: existing.source,
            selection: existing.selection,
            pushedAt: existing.pushedAt,
        } : {})]);

        return res.json({
            success: true,
            file: {
                key: fileKey,
                name: file.name || 'Untitled file',
                thumbnail_url: file.thumbnailUrl || null,
                last_modified: file.lastModified || null,
                editorType: file.editorType || null,
            },
            pages,
            selection: existing?.selection || [],
        });
    } catch (error) {
        if (error.message === 'Figma not connected') {
            return res.status(400).json({ success: false, message: 'Connect Figma first.' });
        }
        return sendInternalError(req, res, error);
    }
});

// Remove a file from the user's Buildrs library (does not touch Figma).
router.delete('/files/:fileKey', authenticateToken, async (req, res) => {
    try {
        const integration = await Integration.findOne({ userId: req.userId, provider: 'figma', isActive: true });
        if (!integration) return res.json({ success: true, files: [] });
        const remaining = readSavedFigmaFiles(integration).filter((file) => file.key !== req.params.fileKey);
        if (!integration.metadata) integration.metadata = new Map();
        integration.metadata.set('figmaFiles', remaining);
        if (typeof integration.markModified === 'function') integration.markModified('metadata');
        await integration.save();
        return res.json({ success: true, files: remaining });
    } catch (error) {
        return sendInternalError(req, res, error);
    }
});

// ===== FIGMA PLUGIN =====
//
// The "Send to Buildrs" plugin runs inside Figma and pushes the open file and
// selected frames here. It authenticates with a per-user plugin token
// (`bfp_<userId>_<secret>`) generated on the Buildrs Figma page; only its
// SHA-256 hash is stored. Design data is still read through the user's own
// Figma OAuth token, so the plugin cannot reach files the user can't open.

const PLUGIN_TOKEN_RE = /^bfp_([a-f0-9]{24})_([A-Za-z0-9_-]{32,})$/;

function hashPluginToken(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
}

async function authenticatePluginToken(req, res, next) {
    try {
        const header = String(req.headers.authorization || '');
        const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
        const match = token.match(PLUGIN_TOKEN_RE);
        if (!match) {
            return res.status(401).json({ success: false, message: 'Invalid Buildrs plugin token. Generate a new one on the Buildrs Figma page.' });
        }

        const integration = await Integration.findOne({ userId: match[1], provider: 'figma', isActive: true });
        const storedHash = integration?.metadata?.get?.('pluginTokenHash');
        const presented = Buffer.from(hashPluginToken(token), 'hex');
        const expected = storedHash ? Buffer.from(String(storedHash), 'hex') : null;
        if (!expected || expected.length !== presented.length || !crypto.timingSafeEqual(expected, presented)) {
            return res.status(401).json({ success: false, message: 'This plugin token was revoked or replaced. Generate a new one on the Buildrs Figma page.' });
        }

        req.userId = match[1];
        req.figmaIntegration = integration;
        return next();
    } catch (error) {
        return sendInternalError(req, res, error);
    }
}

// Generate (or rotate) the plugin token. The plaintext is shown once.
router.post('/plugin/token', authenticateToken, async (req, res) => {
    try {
        const integration = await Integration.findOne({ userId: req.userId, provider: 'figma', isActive: true });
        if (!integration) {
            return res.status(400).json({ success: false, message: 'Connect Figma first.' });
        }
        const token = `bfp_${String(req.userId)}_${crypto.randomBytes(32).toString('base64url')}`;
        if (!integration.metadata) integration.metadata = new Map();
        integration.metadata.set('pluginTokenHash', hashPluginToken(token));
        integration.metadata.set('pluginTokenCreatedAt', new Date().toISOString());
        if (typeof integration.markModified === 'function') integration.markModified('metadata');
        await integration.save();
        return res.json({ success: true, token });
    } catch (error) {
        return sendInternalError(req, res, error);
    }
});

router.get('/plugin/status', authenticateToken, async (req, res) => {
    try {
        const integration = await Integration.findOne({ userId: req.userId, provider: 'figma', isActive: true });
        const createdAt = integration?.metadata?.get?.('pluginTokenCreatedAt') || null;
        return res.json({
            success: true,
            paired: Boolean(integration?.metadata?.get?.('pluginTokenHash')),
            createdAt,
            lastPushAt: integration?.metadata?.get?.('pluginLastPushAt') || null,
        });
    } catch (error) {
        return sendInternalError(req, res, error);
    }
});

router.delete('/plugin/token', authenticateToken, async (req, res) => {
    try {
        const integration = await Integration.findOne({ userId: req.userId, provider: 'figma', isActive: true });
        if (integration?.metadata) {
            integration.metadata.delete('pluginTokenHash');
            integration.metadata.delete('pluginTokenCreatedAt');
            if (typeof integration.markModified === 'function') integration.markModified('metadata');
            await integration.save();
        }
        return res.json({ success: true, paired: false });
    } catch (error) {
        return sendInternalError(req, res, error);
    }
});

// Plugin handshake: confirms the token and who it belongs to.
router.get('/plugin/me', authenticatePluginToken, async (req, res) => {
    const integration = req.figmaIntegration;
    return res.json({
        success: true,
        account: integration.providerEmail || integration.providerUsername || null,
        frontendUrl: String(process.env.FRONTEND_URL || '').replace(/\/+$/, '') || null,
    });
});

function sanitizeSelection(selection) {
    if (!Array.isArray(selection)) return [];
    return selection
        .map((node) => ({
            id: normalizeNodeId(node?.id),
            name: String(node?.name || 'Untitled layer').slice(0, 200),
            type: String(node?.type || 'FRAME').slice(0, 40),
            pageId: normalizeNodeId(node?.pageId),
            pageName: node?.pageName ? String(node.pageName).slice(0, 200) : null,
        }))
        .filter((node) => node.id)
        .slice(0, 25);
}

// Receive the open file (and current selection) from the plugin.
router.post('/plugin/push', authenticatePluginToken, async (req, res) => {
    try {
        const integration = await getFigmaIntegration(req.userId);
        const fileKey = parseFigmaFileKey(req.body?.fileKey) || parseFigmaFileKey(req.body?.fileUrl);
        if (!fileKey) {
            return res.status(400).json({
                success: false,
                code: 'FILE_KEY_REQUIRED',
                message: 'Buildrs needs this file\'s link once. In Figma choose Share → Copy link and paste it into the plugin.',
            });
        }

        let file;
        try {
            file = await figmaAPI(integration.accessToken, `/files/${encodeURIComponent(fileKey)}?depth=1`);
        } catch (error) {
            if (figmaAccessError(res, error)) return;
            throw error;
        }

        const selection = sanitizeSelection(req.body?.selection);
        const pushedAt = new Date().toISOString();
        const existing = readSavedFigmaFiles(integration).find((saved) => saved.key === fileKey);
        const saved = toSavedFigmaFile(file, fileKey, {
            addedAt: existing?.addedAt || pushedAt,
            source: 'plugin',
            selection,
            pushedAt,
        });
        integration.metadata = integration.metadata || new Map();
        integration.metadata.set('pluginLastPushAt', pushedAt);
        await saveFigmaFiles(integration, [saved]);

        const frontend = String(process.env.FRONTEND_URL || '').replace(/\/+$/, '');
        const params = new URLSearchParams({ file: fileKey });
        if (selection[0]?.id) params.set('node', selection[0].id);
        return res.json({
            success: true,
            file: saved,
            openUrl: frontend ? `${frontend}/figma?${params.toString()}` : null,
        });
    } catch (error) {
        if (error.message === 'Figma not connected') {
            return res.status(400).json({ success: false, message: 'Connect Figma in Buildrs first.' });
        }
        return sendInternalError(req, res, error);
    }
});

// Get file
router.get('/files/:fileKey', authenticateToken, async (req, res) => {
    try {
        const integration = await getFigmaIntegration(req.userId);
        const { fileKey } = req.params;
        const { geometry = 'paths' } = req.query;
        
        const file = await figmaAPI(integration.accessToken, `/files/${fileKey}?geometry=${geometry}`);
        res.json({ success: true, file });
    } catch (error) {
        return sendInternalError(req, res, error);
    }
});

// Get file nodes
router.get('/files/:fileKey/nodes', authenticateToken, async (req, res) => {
    try {
        const integration = await getFigmaIntegration(req.userId);
        const { fileKey } = req.params;
        const { ids } = req.query; // Comma-separated node IDs
        
        const nodes = await figmaAPI(integration.accessToken, `/files/${fileKey}/nodes?ids=${ids}`);
        res.json({ success: true, nodes });
    } catch (error) {
        return sendInternalError(req, res, error);
    }
});

// Get file images
router.get('/images/:fileKey', authenticateToken, async (req, res) => {
    try {
        const integration = await getFigmaIntegration(req.userId);
        const { fileKey } = req.params;
        const { ids, scale = 1, format = 'png' } = req.query;
        
        const images = await figmaAPI(integration.accessToken, `/images/${fileKey}?ids=${ids}&scale=${scale}&format=${format}`);
        res.json({ success: true, images });
    } catch (error) {
        return sendInternalError(req, res, error);
    }
});

// Get file versions
router.get('/files/:fileKey/versions', authenticateToken, async (req, res) => {
    try {
        const integration = await getFigmaIntegration(req.userId);
        const { fileKey } = req.params;
        
        const versions = await figmaAPI(integration.accessToken, `/files/${fileKey}/versions`);
        res.json({ success: true, versions: versions.versions });
    } catch (error) {
        return sendInternalError(req, res, error);
    }
});

// Get file comments
router.get('/files/:fileKey/comments', authenticateToken, async (req, res) => {
    try {
        const integration = await getFigmaIntegration(req.userId);
        const { fileKey } = req.params;
        
        const comments = await figmaAPI(integration.accessToken, `/files/${fileKey}/comments`);
        res.json({ success: true, comments: comments.comments });
    } catch (error) {
        return sendInternalError(req, res, error);
    }
});

// Post comment
router.post('/files/:fileKey/comments', authenticateToken, async (req, res) => {
    try {
        const integration = await getFigmaIntegration(req.userId);
        const { fileKey } = req.params;
        const { message, client_meta } = req.body;
        
        const comment = await figmaAPI(integration.accessToken, `/files/${fileKey}/comments`, 'POST', { message, client_meta });
        res.json({ success: true, comment });
    } catch (error) {
        return sendInternalError(req, res, error);
    }
});

// Get team projects
router.get('/teams/:teamId/projects', authenticateToken, async (req, res) => {
    try {
        const integration = await getFigmaIntegration(req.userId);
        const { teamId } = req.params;
        
        const projects = await figmaAPI(integration.accessToken, `/teams/${teamId}/projects`);
        res.json({ success: true, projects: projects.projects });
    } catch (error) {
        return sendInternalError(req, res, error);
    }
});

// Get project files
router.get('/projects/:projectId/files', authenticateToken, async (req, res) => {
    try {
        const integration = await getFigmaIntegration(req.userId);
        const { projectId } = req.params;
        
        const files = await figmaAPI(integration.accessToken, `/projects/${projectId}/files`);
        res.json({ success: true, files: files.files });
    } catch (error) {
        return sendInternalError(req, res, error);
    }
});

// Get component
router.get('/components/:key', authenticateToken, async (req, res) => {
    try {
        const integration = await getFigmaIntegration(req.userId);
        const { key } = req.params;
        
        const component = await figmaAPI(integration.accessToken, `/components/${key}`);
        res.json({ success: true, component: component.meta });
    } catch (error) {
        return sendInternalError(req, res, error);
    }
});

// Get component sets
router.get('/component_sets/:key', authenticateToken, async (req, res) => {
    try {
        const integration = await getFigmaIntegration(req.userId);
        const { key } = req.params;
        
        const componentSet = await figmaAPI(integration.accessToken, `/component_sets/${key}`);
        res.json({ success: true, componentSet: componentSet.meta });
    } catch (error) {
        return sendInternalError(req, res, error);
    }
});

// Get styles
router.get('/styles/:key', authenticateToken, async (req, res) => {
    try {
        const integration = await getFigmaIntegration(req.userId);
        const { key } = req.params;
        
        const style = await figmaAPI(integration.accessToken, `/styles/${key}`);
        res.json({ success: true, style: style.meta });
    } catch (error) {
        return sendInternalError(req, res, error);
    }
});

const pkceStore = require('../utils/pkceStore');

// ===== OAUTH / CONFIGURATION =====

/**
 * @swagger
 * /api/figma/connect:
 *   get:
 *     summary: Start Figma OAuth flow
 *     tags:
 *       - Figma API
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Returns Figma authorization URL
 *       401:
 *         description: Unauthorized
 */
router.get('/connect', authenticateToken, (req, res) => {
    // Figma requires PKCE: generate a code_verifier and its SHA-256 code_challenge
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');

    // Store the verifier so /callback can retrieve it using the same state (userId)
    pkceStore.set(req.userId, codeVerifier);

    const authUrl = buildFigmaAuthorizeUrl({
        clientId: process.env.FIGMA_CLIENT_ID,
        redirectUri: figmaCallbackUrl(),
        state: createStateToken(req.userId), // signed state token prevents session fixation
        codeChallenge
    });

    res.json({
        success: true,
        authUrl
    });
});

/**
 * @swagger
 * /api/figma/callback:
 *   get:
 *     summary: Figma OAuth callback
 *     tags:
 *       - Figma API
 *     parameters:
 *       - name: code
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *       - name: state
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Figma connected successfully
 *       400:
 *         description: Missing code, state, or expired PKCE verifier
 *       500:
 *         description: OAuth exchange failed
 */
router.get('/callback', async (req, res) => {
    try {
        const { code, state } = req.query;

        if (!code || !state) {
            return res.status(400).json({ success: false, message: 'Missing code or state' });
        }

        // Verify signed state token instead of trusting raw userId
        let userId;
        try {
            userId = verifyStateToken(state);
        } catch (e) {
            return res.status(400).json({ success: false, message: 'Invalid or expired state token' });
        }

        const codeVerifier = pkceStore.get(userId);
        if (!codeVerifier) {
            return res.status(400).json({ success: false, message: 'PKCE verifier expired or missing. Please reconnect.' });
        }
        pkceStore.delete(userId); // one-time use

        // Figma requires Basic Auth (client_id:client_secret base64-encoded) for token exchange
        const basicAuth = Buffer.from(
            `${process.env.FIGMA_CLIENT_ID}:${process.env.FIGMA_CLIENT_SECRET}`
        ).toString('base64');

        const tokenResponse = await axios.post(
            'https://api.figma.com/v1/oauth/token',
            new URLSearchParams({
                redirect_uri: figmaCallbackUrl(),
                code,
                grant_type: 'authorization_code',
                code_verifier: codeVerifier
            }),
            {
                headers: {
                    'Authorization': `Basic ${basicAuth}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 15000
            }
        );

        const { access_token, refresh_token, expires_in } = tokenResponse.data;

        if (!access_token) {
            return res.status(500).json({ success: false, message: 'Token exchange failed' });
        }

        // Fetch Figma user info to store alongside the integration
        const meResponse = await axios.get('https://api.figma.com/v1/me', {
            headers: { 'Authorization': `Bearer ${access_token}` },
            timeout: 15000
        });

        await Integration.findOneAndUpdate(
            { userId, provider: 'figma' },
            {
                userId,
                provider: 'figma',
                accessToken: access_token,
                refreshToken: refresh_token,
                expiresAt: new Date(Date.now() + expires_in * 1000),
                isActive: true,
                accountEmail: meResponse.data.email,
                connectedAt: new Date()
            },
            { upsert: true, new: true }
        );

        // Redirect back to your frontend settings page
        res.redirect(`${process.env.FRONTEND_URL}/integrations?figma=connected`);
    } catch (error) {
        console.error('Figma OAuth callback error:', error.response?.data || error.message);
        res.status(500).json({ success: false, message: 'Figma connection failed' });
    }
});

/**
 * @swagger
 * /api/figma/status:
 *   get:
 *     summary: Check Figma connection status
 *     tags:
 *       - Figma API
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Connection status
 *       401:
 *         description: Unauthorized
 */
router.get('/status', authenticateToken, async (req, res) => {
    try {
        const integration = await Integration.findOne({
            userId: req.userId,
            provider: 'figma',
            isActive: true
        });

        res.json({
            success: true,
            connected: !!integration,
            account: integration
                ? (integration.providerEmail || integration.providerUsername || null)
                : null
        });
    } catch (error) {
        return sendInternalError(req, res, error);
    }
});

/**
 * @swagger
 * /api/figma/disconnect:
 *   delete:
 *     summary: Disconnect Figma integration
 *     tags:
 *       - Figma API
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Disconnected successfully
 *       401:
 *         description: Unauthorized
 */
router.delete('/disconnect', authenticateToken, async (req, res) => {
    try {
        await Integration.findOneAndUpdate(
            { userId: req.userId, provider: 'figma' },
            { isActive: false }
        );

        res.json({ success: true, message: 'Figma disconnected' });
    } catch (error) {
        return sendInternalError(req, res, error);
    }
});

module.exports = router;
// Exposed for unit tests (route parsing is pure and has no Express deps).
module.exports.parseFigmaFileKey = parseFigmaFileKey;
