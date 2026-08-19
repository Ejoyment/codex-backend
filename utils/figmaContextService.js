const axios = require('axios');
const DesignToken = require('../models/DesignToken');

async function getFigmaIntegration(userId) {
    const Integration = require('../models/Integration');
    const integration = await Integration.findOne({ userId, provider: 'figma', isActive: true });
    if (!integration) throw new Error('Figma not connected');
    return integration;
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
            data
        });
        return response.data;
    } catch (error) {
        console.error('Figma API error:', error.response?.data || error.message);
        throw error;
    }
}

function extractColorTokens(node, tokens = []) {
    if (!node) return tokens;
    
    if (node.fills) {
        node.fills.forEach(fill => {
            if (fill.type === 'SOLID' && fill.color) {
                const r = Math.round((fill.color.r || 0) * 255);
                const g = Math.round((fill.color.g || 0) * 255);
                const b = Math.round((fill.color.b || 0) * 255);
                const a = fill.color.a ?? 1;
                tokens.push({
                    tokenType: 'color',
                    name: node.name || `color_${tokens.length + 1}`,
                    value: { r, g, b, a, hex: `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}` },
                    mode: fill.visibleMode || 'default'
                });
            }
        });
    }
    
    if (node.effects) {
        node.effects.forEach(effect => {
            if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
                tokens.push({
                    tokenType: 'shadow',
                    name: node.name || `shadow_${tokens.length + 1}`,
                    value: {
                        type: effect.type,
                        color: effect.color ? { r: effect.color.r, g: effect.color.g, b: effect.color.b, a: effect.color.a } : null,
                        offset: effect.offset,
                        radius: effect.radius,
                        spread: effect.spread
                    },
                    mode: 'default'
                });
            }
        });
    }
    
    if (node.cornerRadius !== undefined) {
        tokens.push({
            tokenType: 'borderRadius',
            name: node.name || `radius_${tokens.length + 1}`,
            value: node.cornerRadius,
            mode: 'default'
        });
    }
    
    if (node.children) {
        node.children.forEach(child => extractColorTokens(child, tokens));
    }
    
    return tokens;
}

function extractTypographyTokens(node, tokens = []) {
    if (!node) return tokens;
    
    if (node.style && node.style.fontSize) {
        tokens.push({
            tokenType: 'typography',
            name: node.name || `text_${tokens.length + 1}`,
            value: {
                fontFamily: node.style.fontFamily,
                fontSize: node.style.fontSize,
                fontWeight: node.style.fontWeight,
                lineHeight: node.style.lineHeight,
                letterSpacing: node.style.letterSpacing,
                textAlign: node.style.textAlignHorizontal
            },
            mode: 'default'
        });
    }
    
    if (node.children) {
        node.children.forEach(child => extractTypographyTokens(child, tokens));
    }
    
    return tokens;
}

function extractSpacingTokens(node, tokens = []) {
    if (!node) return tokens;
    
    if (node.absoluteBoundingBox && node.absoluteRenderBounds) {
        tokens.push({
            tokenType: 'spacing',
            name: node.name || `spacing_${tokens.length + 1}`,
            value: {
                width: node.absoluteBoundingBox.width,
                height: node.absoluteBoundingBox.height,
                padding: node.padding || null
            },
            mode: 'default'
        });
    }
    
    if (node.children) {
        node.children.forEach(child => extractSpacingTokens(child, tokens));
    }
    
    return tokens;
}

async function ingestDesignTokens(userId, fileKey, nodeId = null) {
    const integration = await getFigmaIntegration(userId);
    const file = await figmaAPI(integration.accessToken, `/files/${fileKey}?geometry=paths`);
    
    if (!file.document) {
        throw new Error('Invalid Figma file response');
    }
    
    const targetNode = nodeId 
        ? file.document.children?.find(n => n.id === nodeId) || file.document
        : file.document;
    
    const colorTokens = extractColorTokens(targetNode);
    const typographyTokens = extractTypographyTokens(targetNode);
    const spacingTokens = extractSpacingTokens(targetNode);
    
    const allTokens = [...colorTokens, ...typographyTokens, ...spacingTokens];
    
    const savedTokens = [];
    for (const token of allTokens) {
        const existing = await DesignToken.findOne({
            userId,
            figmaFileId: fileKey,
            name: token.name,
            tokenType: token.tokenType
        });
        
        if (existing) {
            existing.value = token.value;
            existing.mode = token.mode;
            await existing.save();
            savedTokens.push(existing);
        } else {
            const created = await DesignToken.create({
                userId,
                figmaFileId: fileKey,
                figmaFileKey: fileKey,
                figmaNodeId: nodeId,
                ...token
            });
            savedTokens.push(created);
        }
    }
    
    return savedTokens;
}

async function getDesignTokensForAI(userId, fileKey, contextType = 'codegen') {
    const tokens = await DesignToken.find({
        userId,
        figmaFileId: fileKey
    }).sort({ tokenType: 1, usageCount: -1 });
    
    const grouped = {
        colors: tokens.filter(t => t.tokenType === 'color'),
        typography: tokens.filter(t => t.tokenType === 'typography'),
        spacing: tokens.filter(t => t.tokenType === 'spacing'),
        shadows: tokens.filter(t => t.tokenType === 'shadow'),
        borderRadius: tokens.filter(t => t.tokenType === 'borderRadius'),
        components: tokens.filter(t => t.tokenType === 'component'),
        variables: tokens.filter(t => t.tokenType === 'variable')
    };
    
    if (contextType === 'codegen') {
        return {
            designSystem: {
                colors: grouped.colors.map(t => ({ name: t.name, value: t.value })),
                typography: grouped.typography.map(t => ({ name: t.name, value: t.value })),
                spacing: grouped.spacing.map(t => ({ name: t.name, value: t.value })),
                shadows: grouped.shadows.map(t => ({ name: t.name, value: t.value })),
                borderRadius: grouped.borderRadius.map(t => ({ name: t.name, value: t.value }))
            },
            tokenCount: tokens.length
        };
    }
    
    return grouped;
}

async function recordTokenUsage(userId, fileKey, tokenName) {
    const token = await DesignToken.findOne({ userId, figmaFileId: fileKey, name: tokenName });
    if (token) {
        token.usageCount += 1;
        token.lastUsedAt = new Date();
        await token.save();
    }
}

/**
 * Walk a Figma node tree and produce a lightweight component/layout summary
 * suitable for AI code generation.  Each entry contains the node name, type,
 * bounding box, and any fills / typography / border-radius that can be
 * extracted inline.
 */
function summarizeNodeTree(node, depth = 0, maxDepth = 5) {
    if (!node || depth > maxDepth) return null;

    const summary = {
        id: node.id || null,
        name: node.name || null,
        type: node.type || null,
        depth
    };

    if (node.absoluteBoundingBox) {
        summary.boundingBox = {
            x: Math.round(node.absoluteBoundingBox.x || 0),
            y: Math.round(node.absoluteBoundingBox.y || 0),
            width: Math.round(node.absoluteBoundingBox.width || 0),
            height: Math.round(node.absoluteBoundingBox.height || 0)
        };
    }

    // Inline fills (solid colors only for brevity)
    if (Array.isArray(node.fills)) {
        const solidFills = node.fills.filter(f => f && f.type === 'SOLID' && f.color);
        if (solidFills.length > 0) {
            summary.fills = solidFills.map(f => {
                const c = f.color;
                const r = Math.round((c.r || 0) * 255);
                const g = Math.round((c.g || 0) * 255);
                const b = Math.round((c.b || 0) * 255);
                return { hex: `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`, opacity: c.a ?? 1 };
            });
        }
    }

    // Inline typography
    if (node.style && (node.style.fontSize || node.style.fontFamily)) {
        summary.typography = {
            fontFamily: node.style.fontFamily || null,
            fontSize: node.style.fontSize || null,
            fontWeight: node.style.fontWeight || null,
            lineHeight: node.style.lineHeight || null,
            letterSpacing: node.style.letterSpacing || null,
            textAlign: node.style.textAlignHorizontal || null
        };
    }

    // Border radius
    if (node.cornerRadius !== undefined && node.cornerRadius !== null) {
        summary.borderRadius = node.cornerRadius;
    }

    // Layout hints
    if (node.layoutMode) {
        summary.layout = {
            mode: node.layoutMode,
            gap: node.itemSpacing || null,
            padding: {
                top: node.paddingTop || null,
                right: node.paddingRight || null,
                bottom: node.paddingBottom || null,
                left: node.paddingLeft || null
            }
        };
    }

    // Component metadata
    if (node.componentId || node.componentKey) {
        summary.component = {
            id: node.componentId || null,
            key: node.componentKey || null,
            name: node.componentName || null
        };
    }

    // Recurse into children
    if (Array.isArray(node.children) && node.children.length > 0) {
        summary.children = node.children
            .map(child => summarizeNodeTree(child, depth + 1, maxDepth))
            .filter(Boolean);
    }

    return summary;
}

/**
 * Build a comprehensive, unified design context for a Figma file (optionally
 * scoped to a single node).  This combines:
 *   • The live Figma node tree (summarised for AI consumption)
 *   • All previously-ingested design tokens from the database
 *   • A flattened "design system" block optimised for code generation
 *
 * @param {string} userId   - Authenticated user ID
 * @param {string} fileKey  - Figma file key
 * @param {string|null} nodeId - Optional Figma node ID to scope the context
 * @param {string} contextType - 'codegen' (default) or 'audit'
 * @returns {Promise<object>} Unified design context
 */
async function getDesignContext(userId, fileKey, nodeId = null, contextType = 'codegen') {
    const integration = await getFigmaIntegration(userId);

    // 1. Fetch the live Figma file/node structure
    const endpoint = nodeId
        ? `/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`
        : `/files/${fileKey}?geometry=paths`;
    const fileData = await figmaAPI(integration.accessToken, endpoint);

    // Normalise: the /nodes endpoint returns { nodes: { [id]: { document } } }
    // while the /files endpoint returns { document, components, styles, ... }
    let rootNode = null;
    let fileMeta = {};

    if (fileData.nodes && nodeId) {
        const nodeEntry = fileData.nodes[nodeId];
        rootNode = nodeEntry?.document || null;
        fileMeta = {
            name: fileData.name || null,
            lastModified: fileData.lastModified || null,
            version: fileData.version || null
        };
    } else if (fileData.document) {
        rootNode = nodeId
            ? (fileData.document.children?.find(c => c.id === nodeId) || fileData.document)
            : fileData.document;
        fileMeta = {
            name: fileData.name || null,
            lastModified: fileData.lastModified || null,
            version: fileData.version || null,
            editorType: fileData.editorType || null
        };
    }

    // 2. Retrieve stored design tokens
    const tokensResult = await getDesignTokensForAI(userId, fileKey, contextType);

    // 3. Summarise the node tree for AI consumption
    const nodeTree = rootNode ? summarizeNodeTree(rootNode) : null;

    // 4. Build a flat component list (top-level components / instances)
    const components = [];
    function collectComponents(node) {
        if (!node) return;
        if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET' || node.type === 'INSTANCE') {
            components.push({
                id: node.id,
                name: node.name,
                type: node.type,
                componentKey: node.componentKey || node.componentId || null
            });
        }
        if (Array.isArray(node.children)) {
            node.children.forEach(collectComponents);
        }
    }
    if (rootNode) collectComponents(rootNode);

    // 5. Assemble the unified context
    const context = {
        fileKey,
        nodeId: nodeId || null,
        file: fileMeta,
        fetchedAt: new Date().toISOString(),
        nodeTree,
        designSystem: tokensResult.designSystem || tokensResult,
        tokenCount: tokensResult.tokenCount || 0,
        components,
        componentCount: components.length
    };

    // For 'audit' context type, include the raw grouped tokens as well
    if (contextType === 'audit') {
        context.rawTokens = tokensResult;
    }

    return context;
}

module.exports = {
    getFigmaIntegration,
    figmaAPI,
    ingestDesignTokens,
    getDesignTokensForAI,
    getDesignContext,
    recordTokenUsage,
    extractColorTokens,
    extractTypographyTokens,
    extractSpacingTokens,
    summarizeNodeTree
};
