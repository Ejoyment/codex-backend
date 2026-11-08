const { sendInternalError } = require('../utils/httpErrors');
const express = require('express');
const router = express.Router();
const axios = require('axios');
const Integration = require('../models/Integration');
const jwt = require('jsonwebtoken');
const { createStateToken, verifyStateToken } = require('../utils/oauthState');
const { authenticateToken } = require('../middleware/auth');
const { buildFigmaAuthorizeUrl } = require('../utils/figmaOAuth');
const { parseFigmaUrl, listPagesAndFrames } = require('../utils/figmaDesignSpec');
const { getNodeImageUrls } = require('../utils/figmaContextService');
const { parseFigmaSourceUrl, fetchSourceLibrary, describeFigmaError } = require('../utils/figmaLibrary');
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

    // Token still fresh — return as-is.
    if (!integration.expiresAt || new Date() < integration.expiresAt) return integration;

    // Token expired — attempt a silent refresh.
    try {
        return await refreshFigmaToken(integration);
    } catch (error) {
        console.error('Figma token refresh failed:', error.response?.data || error.message);
        // Mark integration inactive so the UI shows "reconnect" instead of a
        // cryptic 403 on every subsequent request.
        integration.isActive = false;
        await integration.save().catch(() => {});
        throw new Error('Figma token expired. Please reconnect Figma from the integrations page.');
    }
}

async function refreshFigmaToken(integration) {
    // Figma's refresh endpoint is the same token URL with grant_type=refresh_token,
    // not a separate /refresh path.
    const basicAuth = Buffer.from(
        `${process.env.FIGMA_CLIENT_ID}:${process.env.FIGMA_CLIENT_SECRET}`
    ).toString('base64');

    const response = await axios.post(
        'https://api.figma.com/v1/oauth/token',
        new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: integration.refreshToken,
        }),
        {
            headers: {
                'Authorization': `Basic ${basicAuth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            timeout: 15000,
        }
    );

    const data = response.data;
    if (!data.access_token) throw new Error('No access_token in Figma refresh response');

        integration.accessToken = data.access_token;
    integration.expiresAt = new Date(Date.now() + (data.expires_in || 7776000) * 1000);
    if (data.refresh_token) integration.refreshToken = data.refresh_token;
    await integration.save();
    return integration;
}

// Figma's REST API cannot enumerate the files a user can open: `/v1/me` has no
// team list and every folder endpoint needs an id Figma never exposes. A small
// Buildrs browser helper therefore reads the user's own "recent files" list
// with their Figma session and posts keys/names/thumbnails here. This endpoint
// is the only writer of `figmaFiles`; Buildrs never asks for a Figma link.
const MAX_SYNCED_FILES = 200;
const FIGMA_FILE_KEY_RE = /^[A-Za-z0-9_-]{1,128}$/;

function parseFigmaFileKey(input) {
    return parseFigmaUrl(input)?.fileKey || null;
}

function sanitizeSyncedFile(file) {
    const key = String(file?.key || '').trim();
    if (!FIGMA_FILE_KEY_RE.test(key)) return null;
    const thumbnail = typeof file?.thumbnail_url === 'string' && /^https?:\/\//i.test(file.thumbnail_url)
        ? file.thumbnail_url.slice(0, 2048)
        : null;
    return {
        key,
        name: String(file?.name || '').trim().slice(0, 200) || 'Untitled file',
        thumbnail_url: thumbnail,
        last_modified: typeof file?.last_modified === 'string' ? file.last_modified.slice(0, 40) : null,
        source: 'helper',
    };
}

function readSavedFigmaFiles(integration) {
    const saved = integration?.metadata?.get?.('figmaFiles');
    if (!Array.isArray(saved)) return [];
    return saved.map(sanitizeSyncedFile).filter(Boolean);
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
// Temporary debug: test the stored OAuth token against Figma directly.
// Remove this route once the access issue is confirmed resolved.
router.get('/debug-token', authenticateToken, async (req, res) => {
    try {
        const integration = await Integration.findOne({ userId: req.userId, provider: 'figma', isActive: true });
        if (!integration) return res.json({ connected: false });

        const tokenPreview = String(integration.getFigmaToken() || '').slice(0, 12) + '…';
        const expiresAt = integration.expiresAt;
        const expired = expiresAt ? new Date() > new Date(expiresAt) : null;

        // Try a live call to /v1/me
        let figmaMe = null;
        let figmaError = null;
        try {
            const r = await axios.get('https://api.figma.com/v1/me', {
                headers: { Authorization: `Bearer ${integration.getFigmaToken()}` },
                timeout: 10000,
            });
            figmaMe = { email: r.data.email, handle: r.data.handle, id: r.data.id };
        } catch (err) {
            figmaError = {
                status: err.response?.status,
                data: err.response?.data,
                message: err.message,
            };
        }

        return res.json({
            connected: true,
            tokenPreview,
            expiresAt,
            expired,
            providerEmail: integration.providerEmail,
            figmaMe,
            figmaError,
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const integration = await getFigmaIntegration(req.userId);
        const user = await figmaAPI(integration.getFigmaToken(), '/me');
        res.json({ success: true, user });
    } catch (error) {
        return sendInternalError(req, res, error);
    }
});

// Files discovered by the Buildrs Figma helper (the user's Figma "recent
// files"). Listing never 500s: an empty list must render an install prompt.
router.get('/files', authenticateToken, async (req, res) => {
    try {
        const integration = await Integration.findOne({
            userId: req.userId,
            provider: 'figma',
            isActive: true,
        });

        if (!integration) {
            return res.json({ success: true, connected: false, files: [], helperSyncedAt: null });
        }

        const files = readSavedFigmaFiles(integration);
        return res.json({
            success: true,
            connected: true,
            files,
            helperSyncedAt: integration.metadata?.get?.('helperSyncedAt') || null,
            message: files.length
                ? undefined
                : 'Install the Buildrs Figma helper to bring your designs in automatically.',
        });
    } catch (error) {
        console.error('Figma file listing error:', error.message);
        return res.json({
            success: true,
            connected: true,
            files: [],
            helperSyncedAt: null,
            message: 'Could not read your synced Figma files. Open the Buildrs Figma helper and sync again.',
        });
    }
});

// The browser helper posts the user's recent Figma files here. The payload is
// untrusted: keys are validated, names/thumbnails are trimmed, and the whole
// list is capped. Re-syncing replaces the previous snapshot.
router.post('/files/sync', authenticateToken, async (req, res) => {
    try {
        // The helper already read Figma with the user's own session, so syncing
        // must not depend on the OAuth token being fresh. Only the stored
        // integration record is needed here.
        const integration = await Integration.findOne({
            userId: req.userId,
            provider: 'figma',
            isActive: true,
        });
        if (!integration) {
            return res.status(400).json({ success: false, message: 'Connect Figma first.' });
        }
        const incoming = req.body?.files;
        if (!Array.isArray(incoming)) {
            return res.status(400).json({
                success: false,
                message: 'Send the files list from the Buildrs Figma helper.',
            });
        }

        const seen = new Set();
        const files = [];
        for (const raw of incoming) {
            const file = sanitizeSyncedFile(raw);
            if (!file || seen.has(file.key)) continue;
            seen.add(file.key);
            files.push(file);
            if (files.length >= MAX_SYNCED_FILES) break;
        }

        const syncedAt = new Date().toISOString();
        if (!integration.metadata) integration.metadata = new Map();
        integration.metadata.set('figmaFiles', files);
        integration.metadata.set('helperSyncedAt', syncedAt);
        if (typeof integration.markModified === 'function') integration.markModified('metadata');
        await integration.save();

        return res.json({ success: true, files, syncedAt });
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
        return res.status(404).json({ success: false, message: 'That Figma file was not found. It may have been deleted or moved.' });
    }
    if (status === 403) {
        return res.status(403).json({
            success: false,
            message: 'Figma denied access to that file. Your OAuth token may have expired — disconnect and reconnect Figma from the integrations page, then try again.',
        });
    }
    if (status === 401) {
        return res.status(401).json({
            success: false,
            message: 'Your Figma session expired. Please reconnect Figma from the integrations page.',
        });
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
            file = await figmaAPI(integration.getFigmaToken(), `/files/${encodeURIComponent(fileKey)}?depth=2`);
        } catch (error) {
            if (figmaAccessError(res, error)) return;
            throw error;
        }

        const pages = listPagesAndFrames(file.document);
        pages.forEach((page) => page.frames.forEach((frame) => { frame.thumbnailUrl = null; }));
        if (req.query.thumbnails !== '0') {
            const frameIds = pages.flatMap((page) => page.frames.map((frame) => frame.id)).slice(0, 50);
            try {
                const images = await getNodeImageUrls(integration.getFigmaToken(), fileKey, frameIds, { scale: 0.5 });
                pages.forEach((page) => page.frames.forEach((frame) => {
                    frame.thumbnailUrl = images[frame.id] || null;
                }));
            } catch (error) {
                // Thumbnails are cosmetic; the frame list is still usable.
                console.warn('Figma frame thumbnails unavailable:', error.message);
            }
        }

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
        });
    } catch (error) {
        if (error.message === 'Figma not connected') {
            return res.status(400).json({ success: false, message: 'Connect Figma first.' });
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
        
        const file = await figmaAPI(integration.getFigmaToken(), `/files/${fileKey}?geometry=${geometry}`);
        res.json({ success: true, file });
    } catch (error) {
        return sendInternalError(req, res, error);
    }
});

// ===== FOLDER LIBRARY (folders:read) =====
//
// Linked teams/folders are stored on the integration as `figmaSources`; their
// folder trees are read live (cached briefly: folder endpoints are Tier 2).

const LIBRARY_CACHE_TTL_MS = 2 * 60 * 1000;
const libraryCache = new Map();

function readFigmaSources(integration) {
    const sources = integration?.metadata?.get?.('figmaSources');
    return Array.isArray(sources)
        ? sources.filter((source) => source && ['team', 'folder'].includes(source.type) && source.id)
        : [];
}

async function writeFigmaSources(integration, sources) {
    if (!integration.metadata) integration.metadata = new Map();
    integration.metadata.set('figmaSources', sources.slice(0, 20));
    if (typeof integration.markModified === 'function') integration.markModified('metadata');
    await integration.save();
}

function libraryCacheKey(userId, source) {
    return `${userId}:${source.type}:${source.id}`;
}

async function loadSourceLibrary(userId, accessToken, source, { refresh = false } = {}) {
    const key = libraryCacheKey(userId, source);
    const cached = libraryCache.get(key);
    if (!refresh && cached && Date.now() - cached.at < LIBRARY_CACHE_TTL_MS) return cached.data;
    const data = await fetchSourceLibrary(accessToken, source);
    libraryCache.set(key, { at: Date.now(), data });
    if (libraryCache.size > 500) libraryCache.delete(libraryCache.keys().next().value);
    return data;
}

// Every linked team/folder with its folder tree and files, plus files added
// individually (link or plugin).
router.get('/library', authenticateToken, async (req, res) => {
    try {
        const integration = await Integration.findOne({ userId: req.userId, provider: 'figma', isActive: true });
        if (!integration) return res.json({ success: true, connected: false, sources: [], linkedFiles: [] });

        const active = await getFigmaIntegration(req.userId);
        const refresh = req.query.refresh === '1';
        const sources = await Promise.all(readFigmaSources(integration).map(async (source) => {
            try {
                const library = await loadSourceLibrary(req.userId, active.getFigmaToken(), source, { refresh });
                return { ...library, addedAt: source.addedAt || null };
            } catch (error) {
                const described = describeFigmaError(error);
                return { type: source.type, id: source.id, name: source.name, addedAt: source.addedAt || null, folders: [], files: [], fileCount: 0, error: described.message, errorCode: described.code };
            }
        }));

        return res.json({
            success: true,
            connected: true,
            needsReconnect: !(integration.scopes || []).includes('folders:read'),
            sources,
            linkedFiles: readSavedFigmaFiles(integration),
        });
    } catch (error) {
        if (/Figma (not connected|token expired)/.test(error.message)) {
            return res.json({ success: true, connected: false, sources: [], linkedFiles: [], message: error.message });
        }
        return sendInternalError(req, res, error);
    }
});

// Link a team (or a single folder) by pasting its Figma link.
router.post('/library/sources', authenticateToken, async (req, res) => {
    try {
        const integration = await getFigmaIntegration(req.userId);
        const parsed = parseFigmaSourceUrl(req.body?.url);
        if (!parsed) {
            return res.status(400).json({
                success: false,
                message: 'Paste a Figma team or folder link, e.g. https://www.figma.com/files/team/123456789/My-Team',
            });
        }

        let library;
        try {
            library = await loadSourceLibrary(req.userId, integration.getFigmaToken(), parsed, { refresh: true });
        } catch (error) {
            const described = describeFigmaError(error);
            return res.status(described.status).json({ success: false, code: described.code, message: described.message });
        }

        const existing = readFigmaSources(integration).filter((source) => !(source.type === parsed.type && source.id === parsed.id));
        await writeFigmaSources(integration, [
            { type: parsed.type, id: parsed.id, name: library.name, addedAt: new Date().toISOString() },
            ...existing,
        ]);
        return res.json({ success: true, source: library });
    } catch (error) {
        if (error.message === 'Figma not connected') {
            return res.status(400).json({ success: false, message: 'Connect Figma first.' });
        }
        return sendInternalError(req, res, error);
    }
});

router.delete('/library/sources/:type/:id', authenticateToken, async (req, res) => {
    try {
        const integration = await Integration.findOne({ userId: req.userId, provider: 'figma', isActive: true });
        if (!integration) return res.json({ success: true });
        const { type, id } = req.params;
        await writeFigmaSources(integration, readFigmaSources(integration).filter((source) => !(source.type === type && source.id === id)));
        libraryCache.delete(libraryCacheKey(req.userId, { type, id }));
        return res.json({ success: true });
    } catch (error) {
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

// Get file nodes
router.get('/files/:fileKey/nodes', authenticateToken, async (req, res) => {
    try {
        const integration = await getFigmaIntegration(req.userId);
        const { fileKey } = req.params;
        const { ids } = req.query; // Comma-separated node IDs
        
        const nodes = await figmaAPI(integration.getFigmaToken(), `/files/${fileKey}/nodes?ids=${ids}`);
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
        
        const images = await figmaAPI(integration.getFigmaToken(), `/images/${fileKey}?ids=${ids}&scale=${scale}&format=${format}`);
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
        
        const versions = await figmaAPI(integration.getFigmaToken(), `/files/${fileKey}/versions`);
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
        
        const comments = await figmaAPI(integration.getFigmaToken(), `/files/${fileKey}/comments`);
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
        
        const comment = await figmaAPI(integration.getFigmaToken(), `/files/${fileKey}/comments`, 'POST', { message, client_meta });
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
        
        const projects = await figmaAPI(integration.getFigmaToken(), `/teams/${teamId}/projects`);
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
        
        const files = await figmaAPI(integration.getFigmaToken(), `/projects/${projectId}/files`);
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
        
        const component = await figmaAPI(integration.getFigmaToken(), `/components/${key}`);
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
        
        const componentSet = await figmaAPI(integration.getFigmaToken(), `/component_sets/${key}`);
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
        
        const style = await figmaAPI(integration.getFigmaToken(), `/styles/${key}`);
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
                providerEmail: meResponse.data.email,
                providerUserId: String(meResponse.data.id || ''),
                providerUsername: meResponse.data.handle || '',
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
                : null,
            hasPat: integration ? Boolean(integration.personalAccessToken) : false,
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

// Save a Figma Personal Access Token. PATs have full read access with no
// scope restrictions, bypassing OAuth scope issues entirely.
router.post('/personal-access-token', authenticateToken, async (req, res) => {
    try {
        const { token } = req.body;
        if (!token || typeof token !== 'string') {
            return res.status(400).json({ success: false, message: 'Personal access token is required.' });
        }

        const integration = await Integration.findOne({ userId: req.userId, provider: 'figma' });
        if (!integration) {
            return res.status(400).json({ success: false, message: 'Connect Figma first.' });
        }

        integration.personalAccessToken = token.trim();
        if (typeof integration.markModified === 'function') integration.markModified('personalAccessToken');
        await integration.save();

        // Auto-discover teams/folders using the PAT so designs appear immediately
        try {
            const teamsResponse = await axios.get('https://api.figma.com/v1/teams', {
                headers: { Authorization: `Bearer ${token.trim()}` },
                timeout: 15000
            });

            const teams = teamsResponse.data?.teams || [];
            const sources = [];
            for (const team of teams) {
                try {
                    const teamFolders = await axios.get(
                        'https://api.figma.com/v1/teams/' + encodeURIComponent(team.id) + '/folders',
                        { headers: { Authorization: `Bearer ${token.trim()}` }, timeout: 15000 }
                    );
                    const folderRoots = (teamFolders.data?.folders || []).map((folder) => ({
                        id: String(folder.id),
                        name: folder.name || 'Untitled folder',
                        parentId: null,
                        depth: 1
                    }));

                    if (folderRoots.length > 0) {
                        const library = await fetchSourceLibrary(token.trim(), {
                            type: 'team',
                            id: team.id,
                            name: team.name || 'Figma team'
                        });

                        if (library && library.folders) {
                            sources.push({
                                type: 'team',
                                id: team.id,
                                name: library.name || team.name || 'Figma team',
                                folders: library.folders,
                                fileCount: library.fileCount || 0,
                                addedAt: new Date().toISOString()
                            });
                        }
                    }
                } catch (teamErr) {
                    console.error('Failed to fetch team ' + team.id + ' folders:', teamErr.message);
                }
            }

            if (sources.length > 0) {
                const existing = readFigmaSources(integration).filter((source) => !sources.some((s) => s.type === source.type && s.id === source.id));
                await writeFigmaSources(integration, [...sources, ...existing]);
            }
        } catch (discoveryErr) {
            console.error('Figma PAT auto-discovery error:', discoveryErr.message);
        }

        return res.json({ success: true, message: 'Personal access token saved.' });
    } catch (error) {
        return sendInternalError(req, res, error);
    }
});

module.exports = router;
// Exposed for unit tests (route parsing is pure and has no Express deps).
module.exports.parseFigmaFileKey = parseFigmaFileKey;
