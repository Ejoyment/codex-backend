/**
 * Render a Figma node tree into a compact, exact design spec for AI coding.
 *
 * The output is an indented outline (one node per line) that keeps the values
 * an implementation needs to match a design: dimensions, auto-layout, sizing,
 * fills, strokes, radii, effects, opacity, and text content + typography.
 * Pure: no network or database access, so it is safe to unit test.
 */

const DEFAULT_MAX_DEPTH = 10;
const DEFAULT_MAX_CHARS = 24000;
const DEFAULT_MAX_CHILDREN = 60;

// Figma URLs encode node ids as `1-2`; the API expects `1:2`. Instance ids
// (`I1:2;3:4`) are passed through unchanged.
function normalizeNodeId(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    let decoded = raw;
    try {
        decoded = decodeURIComponent(raw);
    } catch {
        decoded = raw;
    }
    if (/^\d+-\d+$/.test(decoded)) return decoded.replace('-', ':');
    if (/^I?\d+[:-]\d+(?:;\d+[:-]\d+)*$/.test(decoded)) return decoded;
    return null;
}

const FIGMA_FILE_URL_RE = /^https?:\/\/(?:www\.)?figma\.com\/(?:file|design|board|proto|slides)\/([A-Za-z0-9]+)/i;
const FIGMA_FILE_KEY_RE = /^[A-Za-z0-9]{10,}$/;

// Parse a figma.com file/design link (optionally with `node-id`) or a raw key.
function parseFigmaUrl(input) {
    const raw = String(input || '').trim();
    if (!raw) return null;
    const match = raw.match(FIGMA_FILE_URL_RE);
    if (match) {
        let nodeId = null;
        try {
            nodeId = normalizeNodeId(new URL(raw).searchParams.get('node-id'));
        } catch {
            nodeId = null;
        }
        return { fileKey: match[1], nodeId };
    }
    if (/figma\.com/i.test(raw)) return null;
    return FIGMA_FILE_KEY_RE.test(raw) ? { fileKey: raw, nodeId: null } : null;
}

function round(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    return Math.round(value * 100) / 100;
}

function toHex(color, opacity = 1) {
    if (!color) return null;
    const channel = (v) => Math.round(Math.max(0, Math.min(1, v || 0)) * 255);
    const hex = `#${[color.r, color.g, color.b].map((v) => channel(v).toString(16).padStart(2, '0')).join('')}`;
    const alpha = (color.a ?? 1) * (opacity ?? 1);
    return alpha < 1 ? `${hex} @${round(alpha)}` : hex;
}

function describePaint(paint) {
    if (!paint || paint.visible === false) return null;
    if (paint.type === 'SOLID') return toHex(paint.color, paint.opacity);
    if (paint.type && paint.type.startsWith('GRADIENT_')) {
        const stops = (paint.gradientStops || [])
            .map((stop) => `${toHex(stop.color)} ${Math.round((stop.position || 0) * 100)}%`)
            .join(', ');
        return `${paint.type.replace('GRADIENT_', '').toLowerCase()}-gradient(${stops})`;
    }
    if (paint.type === 'IMAGE') return `image(${paint.scaleMode || 'FILL'})`;
    return paint.type ? paint.type.toLowerCase() : null;
}

function describePaints(paints) {
    if (!Array.isArray(paints)) return null;
    const described = paints.map(describePaint).filter(Boolean);
    return described.length ? described.join(' + ') : null;
}

function describeEffects(effects) {
    if (!Array.isArray(effects)) return null;
    const described = effects
        .filter((effect) => effect && effect.visible !== false)
        .map((effect) => {
            if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
                const inset = effect.type === 'INNER_SHADOW' ? 'inset ' : '';
                return `${inset}shadow(${round(effect.offset?.x) || 0}px ${round(effect.offset?.y) || 0}px ${round(effect.radius) || 0}px ${round(effect.spread) || 0}px ${toHex(effect.color)})`;
            }
            if (effect.type === 'LAYER_BLUR' || effect.type === 'BACKGROUND_BLUR') {
                return `${effect.type === 'BACKGROUND_BLUR' ? 'backdrop-' : ''}blur(${round(effect.radius) || 0}px)`;
            }
            return null;
        })
        .filter(Boolean);
    return described.length ? described.join(', ') : null;
}

function describeRadius(node) {
    if (Array.isArray(node.rectangleCornerRadii) && node.rectangleCornerRadii.some((v) => v)) {
        return node.rectangleCornerRadii.map((v) => round(v) || 0).join('/');
    }
    if (node.cornerRadius) return String(round(node.cornerRadius));
    return null;
}

function describeLayout(node) {
    if (!node.layoutMode || node.layoutMode === 'NONE') return null;
    const parts = [node.layoutMode === 'HORIZONTAL' ? 'row' : 'column'];
    if (node.layoutWrap === 'WRAP') parts.push('wrap');
    if (node.itemSpacing) parts.push(`gap ${round(node.itemSpacing)}`);
    const padding = [node.paddingTop, node.paddingRight, node.paddingBottom, node.paddingLeft].map((v) => round(v) || 0);
    if (padding.some(Boolean)) parts.push(`padding ${padding.join(' ')}`);
    if (node.primaryAxisAlignItems) parts.push(`main ${node.primaryAxisAlignItems.toLowerCase()}`);
    if (node.counterAxisAlignItems) parts.push(`cross ${node.counterAxisAlignItems.toLowerCase()}`);
    return parts.join(', ');
}

function describeSizing(node) {
    const parts = [];
    if (node.layoutSizingHorizontal) parts.push(`w:${node.layoutSizingHorizontal.toLowerCase()}`);
    if (node.layoutSizingVertical) parts.push(`h:${node.layoutSizingVertical.toLowerCase()}`);
    if (node.layoutPositioning === 'ABSOLUTE') parts.push('absolute');
    if (node.minWidth) parts.push(`min-w ${round(node.minWidth)}`);
    if (node.maxWidth) parts.push(`max-w ${round(node.maxWidth)}`);
    return parts.length ? parts.join(' ') : null;
}

function describeText(node) {
    if (node.type !== 'TEXT') return [];
    const style = node.style || {};
    const typography = [
        style.fontFamily,
        style.fontWeight ? String(style.fontWeight) : null,
        style.fontSize ? `${round(style.fontSize)}px` : null,
        style.lineHeightPx ? `lh ${round(style.lineHeightPx)}px` : null,
        style.letterSpacing ? `ls ${round(style.letterSpacing)}px` : null,
        style.textAlignHorizontal ? `align ${style.textAlignHorizontal.toLowerCase()}` : null,
        style.textCase && style.textCase !== 'ORIGINAL' ? style.textCase.toLowerCase() : null,
        style.textDecoration && style.textDecoration !== 'NONE' ? style.textDecoration.toLowerCase() : null,
        style.italic ? 'italic' : null,
    ].filter(Boolean).join(' ');
    const characters = String(node.characters || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    return [typography ? `font ${typography}` : null, characters ? `text "${characters}"` : null].filter(Boolean);
}

function describeNode(node, origin) {
    const box = node.absoluteBoundingBox;
    const parts = [`${node.type || 'NODE'} "${node.name || ''}"`, `id=${node.id}`];
    if (box) {
        const x = origin ? round(box.x - origin.x) : round(box.x);
        const y = origin ? round(box.y - origin.y) : round(box.y);
        parts.push(`${round(box.width)}x${round(box.height)} @${x},${y}`);
    }
    const details = [
        describeLayout(node) ? `layout(${describeLayout(node)})` : null,
        describeSizing(node) ? `sizing(${describeSizing(node)})` : null,
        describePaints(node.fills) ? `fill ${describePaints(node.fills)}` : null,
        describePaints(node.strokes) && node.strokeWeight
            ? `stroke ${round(node.strokeWeight)}px ${describePaints(node.strokes)}${node.strokeAlign ? ` ${node.strokeAlign.toLowerCase()}` : ''}`
            : null,
        describeRadius(node) ? `radius ${describeRadius(node)}` : null,
        describeEffects(node.effects) ? `effects ${describeEffects(node.effects)}` : null,
        typeof node.opacity === 'number' && node.opacity < 1 ? `opacity ${round(node.opacity)}` : null,
        node.clipsContent ? 'clips' : null,
        node.componentId ? `instance-of ${node.componentId}` : null,
        ...describeText(node),
    ].filter(Boolean);
    return [...parts, ...details].join(' | ');
}

function renderDesignSpec(rootNode, options = {}) {
    if (!rootNode) return '';
    const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
    const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
    const maxChildren = options.maxChildren ?? DEFAULT_MAX_CHILDREN;
    const origin = rootNode.absoluteBoundingBox || null;
    const lines = [];
    let length = 0;
    let truncated = false;

    function visit(node, depth) {
        if (truncated || !node || node.visible === false) return;
        const line = `${'  '.repeat(depth)}- ${describeNode(node, origin)}`;
        if (length + line.length + 1 > maxChars) {
            truncated = true;
            return;
        }
        lines.push(line);
        length += line.length + 1;

        const children = Array.isArray(node.children) ? node.children : [];
        if (!children.length) return;
        if (depth >= maxDepth) {
            lines.push(`${'  '.repeat(depth + 1)}- … ${children.length} nested layer(s) omitted (depth limit)`);
            return;
        }
        children.slice(0, maxChildren).forEach((child) => visit(child, depth + 1));
        if (children.length > maxChildren) {
            lines.push(`${'  '.repeat(depth + 1)}- … ${children.length - maxChildren} more layer(s) omitted`);
        }
    }

    visit(rootNode, 0);
    if (truncated) lines.push('- … design spec truncated (size limit); prioritise the layers above');
    return lines.join('\n');
}

// Pages and their top-level frames from a `/v1/files/:key?depth=2` response.
function listPagesAndFrames(document) {
    const frameTypes = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'SECTION', 'INSTANCE', 'GROUP']);
    return (document?.children || [])
        .filter((page) => page && page.type === 'CANVAS')
        .map((page) => ({
            id: page.id,
            name: page.name || 'Untitled page',
            frames: (page.children || [])
                .filter((node) => node && frameTypes.has(node.type) && node.visible !== false)
                .map((node) => ({
                    id: node.id,
                    name: node.name || 'Untitled frame',
                    type: node.type,
                    width: round(node.absoluteBoundingBox?.width),
                    height: round(node.absoluteBoundingBox?.height),
                })),
        }));
}

module.exports = {
    normalizeNodeId,
    parseFigmaUrl,
    renderDesignSpec,
    listPagesAndFrames,
    toHex,
};
