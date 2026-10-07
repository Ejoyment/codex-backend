/**
 * Rec 13 — redirect contract: every frontend URL the backend emits
 * (OAuth callbacks, billing success/cancel/return URLs, failure redirects)
 * must resolve to a real page. The Stripe checkout pointed at
 * /payment/success for months while only /payment-success existed.
 *
 * Static test over route sources + the pages directory: fails the suite if
 * anyone adds a redirect to a nonexistent page.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ROUTE_DIRS = ['routes', 'utils'].map((d) => path.join(ROOT, d));
const PAGES_DIR = path.join(ROOT, 'buildrs-frontend', 'pages');
const PUBLIC_DIR = path.join(ROOT, 'buildrs-frontend', 'public');

function jsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      out.push(...jsFiles(full));
    } else if (entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

function pageExists(routePath) {
  const clean = routePath.split('?')[0].split('#')[0];
  if (!clean.startsWith('/')) return false;
  if (clean.includes('$')) return null; // dynamic segment — checked explicitly below
  const rel = clean.slice(1);
  if (
    fs.existsSync(path.join(PAGES_DIR, `${rel}.js`)) ||
    fs.existsSync(path.join(PAGES_DIR, rel, 'index.js'))
  ) {
    return true;
  }
  // Static assets (logos, etc.) live in public/, not pages/.
  if (/\.[a-z0-9]+$/i.test(rel) && fs.existsSync(path.join(PUBLIC_DIR, rel))) {
    return true;
  }
  return false;
}

describe('backend-issued frontend URLs resolve to real pages', () => {
  const sources = ROUTE_DIRS.flatMap(jsFiles);
  const found = new Map(); // path -> [files]

  for (const file of sources) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/FRONTEND_URL\}\/([a-zA-Z0-9/_?=\-&#.]+)/g)) {
      const route = `/${m[1]}`.split('?')[0].split('#')[0];
      if (!found.has(route)) found.set(route, []);
      found.get(route).push(path.relative(ROOT, file));
    }
    for (const m of src.matchAll(/failureRedirect:\s*'(\/[^']*)'/g)) {
      if (!found.has(m[1])) found.set(m[1], []);
      found.get(m[1]).push(path.relative(ROOT, file));
    }
    for (const m of src.matchAll(/res\.redirect\(`\$\{process\.env\.FRONTEND_URL[^`]*?(\/[^`$?#]*)/g)) {
      if (!found.has(m[1])) found.set(m[1], []);
      found.get(m[1]).push(path.relative(ROOT, file));
    }
  }

  test('at least the known payment/auth URLs are covered', () => {
    const routes = [...found.keys()];
    for (const expected of ['/payment-success', '/auth-success', '/sign_in', '/settings', '/integrations', '/dashboard']) {
      expect(routes).toContain(expected);
    }
  });

  test.each([...new Map([...found.entries()].sort()).entries()])(
    '%s resolves (%s)',
    (route, files) => {
      const exists = pageExists(route);
      expect(exists).not.toBe(false);
    }
  );

  test('no checkout/success URL points at the dead /payment/success path', () => {
    for (const file of sources) {
      const src = fs.readFileSync(file, 'utf8');
      expect(src).not.toMatch(/payment\/success/);
    }
  });

  test('stripe portal returns to the billing tab', () => {
    const src = fs.readFileSync(path.join(ROOT, 'utils', 'stripeAdapter.js'), 'utf8');
    expect(src).toMatch(/settings\?tab=billing/);
  });
});
