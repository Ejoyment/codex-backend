#!/usr/bin/env node
/**
 * Contrast gate for the Figma palette.
 *
 * Reads the colour tokens from styles/design-tokens.css (the single source of
 * truth) and checks every declared text/UI pairing against WCAG 2.1:
 *   - body text    >= 4.5:1  (1.4.3)
 *   - UI / icons   >= 3.0:1  (1.4.11)
 * Alpha tokens are composited over the surface they are used on, so
 * rgba() values are measured the way they actually render.
 *
 * It also rejects hard-coded palette colours in app source: the point of the
 * token file is that nothing bypasses it.
 *
 * Usage: node scripts/check-contrast.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const TOKENS_FILE = join(ROOT, 'styles', 'design-tokens.css');

const BODY_TEXT = 4.5;
const UI = 3.0;

/** Surface tokens. `blue` is the highlight card, used by body text too. */
const SURFACES = {
  bg: 'bg',
  deep: 'bg-deep',
  alt: 'bg-alt',
  surface: 'surface',
  raised: 'surface-raised',
  blue: 'surface-blue',
};

const UI_SURFACES = ['bg', 'surface', 'raised'];

/**
 * Tokens allowed to carry readable copy, and where. Anything not listed here
 * must not be used as text colour.
 */
const TEXT_TOKENS = {
  text: Object.keys(SURFACES),
  'text-secondary': Object.keys(SURFACES),
  'text-soft': Object.keys(SURFACES),
  'text-alt': Object.keys(SURFACES),
  'text-muted': Object.keys(SURFACES),
  'text-faint': Object.keys(SURFACES),
  accent: Object.keys(SURFACES),
  'accent-bright': Object.keys(SURFACES),
  'accent-soft': Object.keys(SURFACES),
  success: Object.keys(SURFACES),
  'success-light': Object.keys(SURFACES),
  'error-soft': Object.keys(SURFACES),
  warning: Object.keys(SURFACES),
  info: Object.keys(SURFACES),
};

/**
 * Tokens that may paint icons and status indicators. They are allowed to be
 * dimmer than body text but must stay distinguishable from the surface.
 *
 * Hairline borders (border, border-strong, border-soft) are deliberately not
 * listed: they are 1px decorative dividers at 1.2-1.5:1, and raising them to
 * 3:1 would repaint the whole product. Control boundaries are carried by the
 * surface fill plus label instead. Revisit if inputs move to border-only.
 */
const UI_TOKENS = {
  'text-ghost': UI_SURFACES,
  'accent-dim': UI_SURFACES,
  'accent-deep': UI_SURFACES,
  purple: UI_SURFACES,
  'purple-soft': UI_SURFACES,
  'success-deep': UI_SURFACES,
  error: UI_SURFACES,
};

/** Hard-coded colours that must not reappear in app source. */
const BANNED_LITERALS = [
  { pattern: /text-\[#59687a\]/gi, hint: 'use text-figma-text-faint (body) or text-figma-text-ghost (icon)' },
  { pattern: /text-\[#ec1414\]/gi, hint: 'use text-figma-error-soft; #ec1414 is the UI-tier error colour' },
  { pattern: /#2a3446/gi, hint: 'use var(--figma-border-strong)' },
];

const SOURCE_DIRS = ['pages', 'components', 'styles'];
const SOURCE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.css'];
const SOURCE_SKIP = new Set(['.next', 'node_modules']);
/** The token file is where these literals are allowed to live. */
const SOURCE_SKIP_FILES = new Set([TOKENS_FILE]);

function parseTokens(css) {
  const tokens = {};
  const declaration = /--figma-([a-z0-9-]+)\s*:\s*([^;]+);/g;
  let match = declaration.exec(css);
  while (match) {
    const value = match[2].trim();
    if (/^#[0-9a-f]{3,8}$/i.test(value) || /^rgba?\(/i.test(value)) tokens[match[1]] = value;
    match = declaration.exec(css);
  }
  return tokens;
}

function parseColor(value) {
  const hex = value.trim();
  if (hex.startsWith('#')) {
    let digits = hex.slice(1);
    if (digits.length === 3) digits = digits.split('').map((c) => c + c).join('');
    if (digits.length !== 6 && digits.length !== 8) throw new Error(`Unsupported colour: ${value}`);
    const alpha = digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1;
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
      a: alpha,
    };
  }
  const match = /^rgba?\(([^)]+)\)$/i.exec(hex);
  if (!match) throw new Error(`Unsupported colour: ${value}`);
  const parts = match[1].split(/[,/]/).map((part) => part.trim());
  const [r, g, b] = parts.slice(0, 3).map((part) => (part.endsWith('%') ? (parseFloat(part) / 100) * 255 : Number(part)));
  const a = parts.length > 3 ? Number(parts[3]) : 1;
  return { r, g, b, a };
}

/** Flatten a possibly translucent colour onto an opaque surface. */
function composite(color, background) {
  return {
    r: color.r * color.a + background.r * (1 - color.a),
    g: color.g * color.a + background.g * (1 - color.a),
    b: color.b * color.a + background.b * (1 - color.a),
    a: 1,
  };
}

function luminance({ r, g, b }) {
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (SOURCE_SKIP.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, files);
    else if (SOURCE_EXTENSIONS.some((ext) => entry.endsWith(ext))) files.push(path);
  }
  return files;
}

const failures = [];
const tokens = parseTokens(readFileSync(TOKENS_FILE, 'utf8'));
const surfaces = {};
for (const [name, token] of Object.entries(SURFACES)) {
  if (!tokens[token]) {
    failures.push(`missing surface token --figma-${token}`);
    continue;
  }
  surfaces[name] = parseColor(tokens[token]);
}

function checkGroup(label, declarations, minimum) {
  for (const [token, where] of Object.entries(declarations)) {
    if (!tokens[token]) {
      failures.push(`${label}: --figma-${token} is missing from design-tokens.css`);
      continue;
    }
    const colour = parseColor(tokens[token]);
    for (const surface of where) {
      const background = surfaces[surface];
      if (!background) continue;
      const ratio = contrast(composite(colour, background), background);
      const rounded = ratio.toFixed(2);
      if (ratio + 1e-9 < minimum) {
        failures.push(`${label}: --figma-${token} on ${surface} is ${rounded}:1 (needs ${minimum}:1)`);
      }
    }
  }
}

checkGroup('body text', TEXT_TOKENS, BODY_TEXT);
checkGroup('ui', UI_TOKENS, UI);

for (const path of SOURCE_DIRS.flatMap((dir) => walk(join(ROOT, dir)))) {
  if (SOURCE_SKIP_FILES.has(path)) continue;
  const source = readFileSync(path, 'utf8');
  for (const { pattern, hint } of BANNED_LITERALS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(source);
    while (match) {
      const line = source.slice(0, match.index).split('\n').length;
      failures.push(`${relative(ROOT, path)}:${line} uses ${match[0]} — ${hint}`);
      match = pattern.exec(source);
    }
  }
}

if (failures.length) {
  console.error(`Contrast check failed (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`Contrast check passed: ${Object.keys(TEXT_TOKENS).length} text and ${Object.keys(UI_TOKENS).length} UI tokens on ${Object.keys(surfaces).length} surfaces.`);
