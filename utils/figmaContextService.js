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

module.exports = {
    getFigmaIntegration,
    figmaAPI,
    ingestDesignTokens,
    getDesignTokensForAI,
    recordTokenUsage,
    extractColorTokens,
    extractTypographyTokens,
    extractSpacingTokens
};
