#!/usr/bin/env node

/**
 * Batch migration script: converts frontend/*.html into buildrs-frontend/pages/*.js
 * 
 * This script:
 * 1. Reads each HTML file from frontend/
 * 2. Extracts inline CSS and moves it to a per-page CSS module comment
 * 3. Extracts inline JS and moves it to a per-page JS comment
 * 4. Generates a Next.js page component with proper imports
 * 5. Creates routing-compatible filenames (sign_in.html -> sign_in.js)
 */

const fs = require('fs');
const path = require('path');

const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend');
const PAGES_DIR = path.join(__dirname, '..', 'pages');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

if (!fs.existsSync(FRONTEND_DIR)) {
  console.error('frontend/ directory not found');
  process.exit(1);
}

if (!fs.existsSync(PAGES_DIR)) {
  fs.mkdirSync(PAGES_DIR, { recursive: true });
}

if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

const htmlFiles = fs.readdirSync(FRONTEND_DIR).filter((f) => f.endsWith('.html'));

let migrated = 0;
let skipped = 0;

for (const file of htmlFiles) {
  const htmlPath = path.join(FRONTEND_DIR, file);
  const pageName = file.replace(/\.html$/, '');
  const pagePath = path.join(PAGES_DIR, `${pageName}.js`);

  if (fs.existsSync(pagePath)) {
    skipped++;
    continue;
  }

  const html = fs.readFileSync(htmlPath, 'utf8');
  
  // Extract title
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  const title = titleMatch ? titleMatch[1] : 'BuildrsHQ';

  // Extract inline CSS
  const styleMatches = html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g);
  const inlineCss = [];
  for (const match of styleMatches) {
    inlineCss.push(match[1].trim());
  }
  const cssComment = inlineCss.length > 0 ? `\n/*\n * Inline CSS from ${file}:\n * ${inlineCss.join('\n * ')}\n */\n` : '';

  // Extract inline JS
  const scriptMatches = html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g);
  const inlineJs = [];
  for (const match of scriptMatches) {
    const src = match[0].match(/src="([^"]+)"/);
    if (!src) {
      inlineJs.push(match[1].trim());
    }
  }
  const jsComment = inlineJs.length > 0 ? `\n/*\n * Inline JS from ${file}:\n * ${inlineJs.join('\n * ')}\n */\n` : '';

  // Build Next.js page component
  const pageComponent = `import Head from 'next/head';
import ModernHeader from '../components/ModernHeader';
${cssComment}import '../styles/globals.css';

export default function ${capitalize(pageName)}() {
  return (
    <>
      <Head>
        <title>${title}</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <ModernHeader
        navigation={[
          { href: '/features', label: 'Features' },
          { href: '/pricing', label: 'Pricing' },
          { href: '/blog', label: 'Blog' },
        ]}
        ctaButtons={[
          { href: '/sign_in', label: 'Sign In' },
          { href: '/signup', label: 'Start Free Trial', primary: true },
        ]}
      />

      <main className="min-h-screen bg-navy">
        {/* Content migrated from ${file} */}
      </main>
    </>
  );
}

${jsComment}
`;

  fs.writeFileSync(pagePath, pageComponent);
  migrated++;
}

function copyDir(src, dst) {
  if (!fs.existsSync(dst)) {
    fs.mkdirSync(dst, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, dstPath);
    } else {
      if (!fs.existsSync(dstPath)) {
        fs.copyFileSync(srcPath, dstPath);
      }
    }
  }
}

// Copy static assets to public/
const assets = fs.readdirSync(FRONTEND_DIR).filter((f) => !f.endsWith('.html') && !f.endsWith('.js') && !f.endsWith('.css'));
for (const asset of assets) {
  const src = path.join(FRONTEND_DIR, asset);
  const dst = path.join(PUBLIC_DIR, asset);
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    copyDir(src, dst);
  } else if (!fs.existsSync(dst)) {
    fs.copyFileSync(src, dst);
  }
}

// Copy CSS files
const cssDir = path.join(FRONTEND_DIR, 'css');
if (fs.existsSync(cssDir)) {
  copyDir(cssDir, path.join(PUBLIC_DIR, 'css'));
}

// Copy font files
const fontsDir = path.join(FRONTEND_DIR, 'fonts');
if (fs.existsSync(fontsDir)) {
  copyDir(fontsDir, path.join(PUBLIC_DIR, 'fonts'));
}

console.log(`Migration complete: ${migrated} pages created, ${skipped} skipped`);
console.log(`Static assets copied to buildrs-frontend/public/`);

function capitalize(str) {
  return str
    .replace(/[-_](.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (_, c) => c.toUpperCase());
}
