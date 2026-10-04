// Extracts the real dependency graph of codex-backend + buildrs-frontend.
// Nodes = files (with module group + defined functions). Edges = static
// require/import resolution + express router mounts + socket namespaces.
// Usage: node extract-graph.js  →  writes graph.json next to this script.
const fs = require('fs');
const path = require('path');

const ROOT = '/home/hiro/Documents/dev/codex/codex-backend';
const DIRS = ['routes', 'models', 'utils', 'middleware', 'config', 'server', 'scripts',
  'buildrs-frontend/pages', 'buildrs-frontend/components', 'buildrs-frontend/lib',
  'buildrs-frontend/hooks', 'buildrs-frontend/store'];

const SKIP = new Set(['node_modules', '.next', '.git']);
const nodes = new Map(); // relpath -> node
const edges = [];

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(js|jsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

function moduleOf(rel) {
  const top = rel.split('/')[0];
  if (top === 'buildrs-frontend') return 'fe:' + rel.split('/')[1];
  return top;
}

function definedFunctions(src) {
  const fns = new Set();
  const res = [
    /^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm,
    /^\s*const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/gm,
    /^\s*const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function/gm,
    /router\.(get|post|put|patch|delete|use)\(\s*['"`]([^'"`]+)['"`]/g,
    /([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?\(/g,
  ];
  // routes: capture METHOD path
  let m;
  const routeRe = /router\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g;
  while ((m = routeRe.exec(src))) fns.add(m[1].toUpperCase() + ' ' + m[2]);
  const fnRe = /^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm;
  let count = 0;
  while ((m = fnRe.exec(src)) && count++ < 40) fns.add(m[1] + '()');
  const arrowRe = /^\s*(?:export\s+)?const\s+([A-Z][A-Za-z0-9_$]*)\s*=/gm;
  while ((m = arrowRe.exec(src)) && count++ < 60) fns.add(m[1]);
  return [...fns].slice(0, 60);
}

function resolveImport(fromFile, raw) {
  if (!raw.startsWith('.')) return null; // external pkg or alias
  const base = path.resolve(path.dirname(fromFile), raw);
  const cands = [base, base + '.js', base + '.jsx', path.join(base, 'index.js'), path.join(base, 'index.jsx')];
  for (const c of cands) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return path.relative(ROOT, c);
  }
  return null;
}

const files = [];
for (const d of DIRS) {
  const full = path.join(ROOT, d);
  if (fs.existsSync(full)) files.push(...walk(full));
}

for (const f of files) {
  const rel = path.relative(ROOT, f);
  let src = '';
  try { src = fs.readFileSync(f, 'utf8'); } catch { continue; }
  nodes.set(rel, { id: rel, label: path.basename(rel), module: moduleOf(rel), functions: definedFunctions(src), lines: src.split('\n').length });
}

// edges from require()/import
const reqRe = /(?:require\(\s*['"`]([^'"`]+)['"`]\s*\)|from\s+['"`]([^'"`]+)['"`])/g;
for (const [rel, node] of nodes) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  let m;
  const seen = new Set();
  while ((m = reqRe.exec(src))) {
    const raw = m[1] || m[2];
    const target = resolveImport(path.join(ROOT, rel), raw);
    if (target && nodes.has(target) && target !== rel && !seen.has(target)) {
      seen.add(target);
      edges.push({ source: rel, target, kind: 'import' });
    }
  }
}

// express mounts: app.use('/api/x', name) where name required from a file
try {
  const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const varFile = {}; // varName -> relpath
  const reqTop = /const\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*['"`](\.[^'"`]+)['"`]\s*\)/g;
  let m;
  while ((m = reqTop.exec(srv))) {
    const t = resolveImport(path.join(ROOT, 'server.js'), m[2]);
    if (t && nodes.has(t)) varFile[m[1]] = t;
  }
  const useRe = /app\.use\(\s*['"`]([^'"`]+)['"`]\s*,\s*([A-Za-z_$][\w$]*)/g;
  while ((m = useRe.exec(srv))) {
    if (varFile[m[2]]) edges.push({ source: 'server.js', target: varFile[m[2]], kind: 'mount:' + m[1] });
  }
  if (!nodes.has('server.js')) {
    nodes.set('server.js', { id: 'server.js', label: 'server.js', module: 'root', functions: definedFunctions(srv), lines: srv.split('\n').length });
  }
} catch (e) { console.error('server.js mount parse:', e.message); }

const out = { nodes: [...nodes.values()], links: edges };
fs.writeFileSync(path.join(__dirname, 'graph.json'), JSON.stringify(out));
console.log(`nodes=${out.nodes.length} links=${out.links.length}`);
const byKind = {};
for (const e of edges) byKind[e.kind.split(':')[0]] = (byKind[e.kind.split(':')[0]] || 0) + 1;
console.log('kinds:', JSON.stringify(byKind));
