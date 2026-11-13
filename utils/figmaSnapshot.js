/**
 * Design snapshots pushed by the Buildrs Figma Helper.
 *
 * The helper runs in the user's browser and reads Figma with their own
 * signed-in session, so Buildrs can work with a frame without calling the
 * Figma REST API (and therefore without any OAuth file scope).
 *
 * Everything here is untrusted input: nodes are rebuilt from a whitelist of
 * fields, capped in depth/children/size, and only then stored.
 */
const FigmaDesignSnapshot = require('../models/FigmaDesignSnapshot');
const { normalizeNodeId, renderDesignSpec } = require('./figmaDesignSpec');

const MAX_NODES = 20000;
const MAX_CHILDREN = 300;
const MAX_DEPTH = 40;
const MAX_STRING = 4000;
const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;

// Fields the design-spec renderer and the AI summaries actually read.
const NODE_FIELDS = [
    'name', 'visible', 'opacity', 'blendMode', 'isMask', 'clipsContent',
    'rotation', 'cornerRadius', 'rectangleCornerRadii', 'cornerSmoothing',
    'absoluteBoundingBox', 'absoluteRenderBounds', 'size',
    'layoutMode', 'layoutWrap', 'itemSpacing', 'counterAxisSpacing',
    'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom',
    'primaryAxisAlignItems', 'counterAxisAlignItems',
    'primaryAxisSizingMode', 'counterAxisSizingMode',
    'layoutSizingHorizontal', 'layoutSizingVertical',
    'layoutGrow', 'layoutAlign', 'layoutPositioning', 'constraints',
    'fills', 'strokes', 'strokeWeight', 'strokeAlign', 'strokeDashes',
    'effects', 'characters', 'style',
    'textAlignHorizontal', 'textAlignVertical', 'lineHeight', 'letterSpacing',
    'componentKey', 'componentId', 'componentProperties', 'isAsset',
];

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function copyJson(value, depth = 0) {
    if (value === null) return null;
    const type = typeof value;
    if (type === 'string') return value.slice(0, MAX_STRING);
    if (type === 'number') return Number.isFinite(value) ? value : null;
    if (type === 'boolean') return value;
    if (type !== 'object') return null;
    if (depth > 8) return null;
    if (Array.isArray(value)) {
        return value.slice(0, 40).map((entry) => copyJson(entry, depth + 1));
    }
    const copy = {};
    for (const key of Object.keys(value)) {
        if (FORBIDDEN_KEYS.has(key)) continue;
        const entry = copyJson(value[key], depth + 1);
        if (entry !== null || value[key] === null) copy[key] = entry;
    }
    return copy;
}

function sanitizeNode(node, state, depth) {
    if (!node || typeof node !== 'object' || state.count >= MAX_NODES) return null;
    const id = typeof node.id === 'string' ? node.id.slice(0, 200) : null;
    const nodeType = typeof node.type === 'string' ? node.type.slice(0, 40) : null;
    if (!id || !nodeType) return null;

    state.count += 1;
    const clean = { id, type: nodeType };
    for (const field of NODE_FIELDS) {
        if (!(field in node)) continue;
        const value = node[field];
        if (typeof value === 'string') clean[field] = value.slice(0, MAX_STRING);
        else if (typeof value === 'number') {
            if (Number.isFinite(value)) clean[field] = value;
        } else if (typeof value === 'boolean') clean[field] = value;
        else if (value && typeof value === 'object') {
            const copied = copyJson(value);
            if (copied !== null) clean[field] = copied;
        }
    }

    if (!clean.name) clean.name = nodeType === 'CANVAS' ? 'Page' : 'Untitled layer';

    if (Array.isArray(node.children) && depth < MAX_DEPTH) {
        const children = [];
        for (const child of node.children.slice(0, MAX_CHILDREN)) {
            const sanitized = sanitizeNode(child, state, depth + 1);
            if (sanitized) children.push(sanitized);
            if (state.count >= MAX_NODES) break;
        }
        if (children.length) clean.children = children;
    }

    return clean;
}

// Rebuild a Figma node from whitelisted fields. Returns null when the payload
// is unusable (no id/type, or larger than the storage limit).
function sanitizeNodePayload(input) {
    const root = input && typeof input === 'object' && input.node && typeof input.node === 'object'
        ? input.node
        : input;
    const clean = sanitizeNode(root, { count: 0 }, 0);
    if (!clean) return null;
    try {
        if (Buffer.byteLength(JSON.stringify(clean)) > MAX_PAYLOAD_BYTES) return null;
    } catch (error) {
        return null;
    }
    return clean;
}

function cleanFileKey(value) {
    const key = String(value || '').trim();
    return /^[A-Za-z0-9_-]{1,128}$/.test(key) ? key : null;
}

function cleanNodeId(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const normalized = normalizeNodeId(raw);
    if (normalized) return normalized;
    return /^[A-Za-z0-9:;._-]{1,200}$/.test(raw) ? raw : null;
}

function badRequest(message) {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
}

/**
 * Store (or replace) the frame a user just read in their browser.
 * Returns the saved snapshot; throws a 400-tagged error for bad input.
 */
async function saveDesignSnapshot(userId, { fileKey, nodeId, nodeName, fileName, node, source = 'helper' } = {}) {
    const cleanKey = cleanFileKey(fileKey);
    if (!cleanKey) throw badRequest('Invalid Figma file key.');
    const cleanId = cleanNodeId(nodeId);
    if (!cleanId) throw badRequest('Invalid Figma frame id.');
    const document = sanitizeNodePayload(node);
    if (!document) throw badRequest('Send the frame data from the Buildrs Figma Helper.');

    const designSpec = renderDesignSpec(document);
    const now = new Date();
    return FigmaDesignSnapshot.findOneAndUpdate(
        { userId, fileKey: cleanKey, nodeId: cleanId },
        {
            $set: {
                userId,
                fileKey: cleanKey,
                nodeId: cleanId,
                fileName: String(fileName || '').trim().slice(0, 200) || null,
                nodeName: String(nodeName || document.name || '').trim().slice(0, 200) || null,
                source: String(source || 'helper').slice(0, 40),
                document,
                designSpec,
                updatedAt: now,
            },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
}

async function readDesignSnapshot(userId, fileKey, nodeId) {
    const cleanKey = cleanFileKey(fileKey);
    const cleanId = cleanNodeId(nodeId);
    if (!cleanKey || !cleanId) return null;
    return FigmaDesignSnapshot.findOne({ userId, fileKey: cleanKey, nodeId: cleanId }).lean();
}

module.exports = {
    sanitizeNodePayload,
    saveDesignSnapshot,
    readDesignSnapshot,
    MAX_NODES,
    MAX_CHILDREN,
    MAX_DEPTH,
};
