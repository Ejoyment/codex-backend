// Design parity analysis for the Live Design-Code Split View.
// Compares a Figma frame/node against the values actually present in source code
// and produces a 0-100 parity score with per-property diffs.

const HEX_RE = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
const RGB_RE = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/g;

function clamp(n) { return Math.max(0, Math.min(255, Math.round(n))); }

function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(v => clamp(v).toString(16).padStart(2, '0')).join('');
}

function normalizeHex(hex) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    return '#' + h.toLowerCase();
}

function colorDistance(a, b) {
    a = normalizeHex(a); b = normalizeHex(b);
    const ra = parseInt(a.slice(1, 3), 16), ga = parseInt(a.slice(3, 5), 16), ba = parseInt(a.slice(5, 7), 16);
    const rb = parseInt(b.slice(1, 3), 16), gb = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
    return Math.sqrt((ra - rb) ** 2 + (ga - gb) ** 2 + (ba - bb) ** 2);
}

// Pull design-relevant values out of source code with lightweight heuristics.
function extractCodeDesignValues(code, language = 'plaintext') {
    const values = { colors: [], width: null, height: null, fontSize: null, fontWeight: null, fontFamily: null, borderRadius: null, padding: null };

    if (!code) return values;

    let m;
    HEX_RE.lastIndex = 0;
    while ((m = HEX_RE.exec(code)) !== null) values.colors.push(normalizeHex(m[1]));
    RGB_RE.lastIndex = 0;
    while ((m = RGB_RE.exec(code)) !== null) values.colors.push(rgbToHex(+m[1], +m[2], +m[3]));

    const firstNumber = (re) => {
        const mm = code.match(re);
        return mm ? parseFloat(mm[1]) : null;
    };

    values.width = firstNumber(/width\s*[:=]\s*['"]?(\d+(?:\.\d+)?)p?x?/i)
        ?? firstNumber(/width:\s*(\d+(?:\.\d+)?)/i);
    values.height = firstNumber(/height\s*[:=]\s*['"]?(\d+(?:\.\d+)?)p?x?/i)
        ?? firstNumber(/height:\s*(\d+(?:\.\d+)?)/i);
    values.fontSize = firstNumber(/font-?size\s*[:=]\s*['"]?(\d+(?:\.\d+)?)/i);
    values.borderRadius = firstNumber(/border-?radius\s*[:=]\s*['"]?(\d+(?:\.\d+)?)/i);
    values.padding = firstNumber(/padding\s*[:=]\s*['"]?(\d+(?:\.\d+)?)/i);

    const weightMatch = code.match(/font-?weight\s*[:=]\s*['"]?(\d{3}|bold|normal)/i);
    if (weightMatch) {
        const w = weightMatch[1].toLowerCase();
        values.fontWeight = w === 'bold' ? 700 : w === 'normal' ? 400 : parseInt(w, 10);
    }

    const famMatch = code.match(/font-?family\s*[:=]\s*['"]?([^'";\n,}]+)/i);
    if (famMatch) values.fontFamily = famMatch[1].trim().split(',')[0].trim();

    return values;
}

// Normalize a Figma node into the same shape as the code-extracted values.
function parseFigmaNode(node) {
    const values = { colors: [], width: null, height: null, fontSize: null, fontWeight: null, fontFamily: null, borderRadius: null, padding: null, name: node?.name || null };

    const doc = node && node.document ? node.document : node;
    if (doc && doc.absoluteBoundingBox) {
        values.width = Math.round(doc.absoluteBoundingBox.width);
        values.height = Math.round(doc.absoluteBoundingBox.height);
    }

    const fills = doc && doc.fills;
    if (Array.isArray(fills)) {
        fills.filter(f => f && f.type === 'SOLID' && f.color).forEach(f => {
            const c = f.color;
            values.colors.push(rgbToHex((c.r || 0) * 255, (c.g || 0) * 255, (c.b || 0) * 255));
        });
    }

    const style = doc && doc.style;
    if (style) {
        if (style.fontSize) values.fontSize = Math.round(style.fontSize);
        if (style.fontWeight) values.fontWeight = Math.round(style.fontWeight);
        if (style.fontFamily) values.fontFamily = style.fontFamily;
        if (style.cornerRadius != null) values.borderRadius = Math.round(style.cornerRadius);
    }

    return values;
}

function compare(prop, figmaValue, codeValue, tolerance = 0) {
    if (figmaValue == null && codeValue == null) return null;
    if (figmaValue == null) return { status: 'missing', figmaValue, codeValue };
    if (codeValue == null) return { status: 'missing', figmaValue, codeValue };

    if (prop === 'colors') {
        // Match if any code color is within tolerance of any figma color.
        const match = figmaValue.some(fc =>
            codeValue.some(cc => colorDistance(fc, cc) <= (tolerance || 24))
        );
        return { status: match ? 'matched' : 'mismatch', figmaValue, codeValue };
    }

    if (typeof figmaValue === 'number' && typeof codeValue === 'number') {
        const diff = Math.abs(figmaValue - codeValue);
        const within = diff <= Math.max(tolerance, figmaValue * 0.05);
        return { status: within ? 'matched' : 'mismatch', figmaValue, codeValue, tolerance };
    }

    const status = String(figmaValue).toLowerCase() === String(codeValue).toLowerCase() ? 'matched' : 'mismatch';
    return { status, figmaValue, codeValue };
}

function computeParity(figmaValues, codeValues) {
    const checks = [
        { key: 'width', label: 'Width', tolerance: 2 },
        { key: 'height', label: 'Height', tolerance: 2 },
        { key: 'colors', label: 'Primary color', tolerance: 24 },
        { key: 'fontSize', label: 'Font size', tolerance: 1 },
        { key: 'fontWeight', label: 'Font weight', tolerance: 0 },
        { key: 'borderRadius', label: 'Border radius', tolerance: 2 },
        { key: 'padding', label: 'Padding', tolerance: 4 }
    ];

    const items = [];
    let matched = 0;
    let total = 0;

    checks.forEach(({ key, label, tolerance }) => {
        const fv = figmaValues[key];
        const cv = codeValues[key];
        if (fv == null && cv == null) return; // not comparable, skip
        const result = compare(key, fv, cv, tolerance);
        if (!result) return;
        total += 1;
        if (result.status === 'matched') matched += 1;
        items.push({
            key,
            label,
            figmaValue: result.figmaValue,
            codeValue: result.codeValue,
            status: result.status,
            tolerance: result.tolerance || tolerance
        });
    });

    const score = total === 0 ? 0 : Math.round((matched / total) * 100);
    return { score, items, total, matched };
}

module.exports = {
    extractCodeDesignValues,
    parseFigmaNode,
    computeParity,
    rgbToHex,
    normalizeHex,
    colorDistance
};
