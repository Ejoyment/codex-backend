// Phase 2: function-level call edges via AST (@babel/parser).
// For each file: imported names -> defining file; every CallExpression
// whose callee resolves to an import becomes edge caller -> defining file.
// Usage: node extract-calls.js  →  writes calls.json next to graph.json.
const fs = require('fs');
const path = require('path');
const parser = require('/tmp/opencode/babel/node_modules/@babel/parser');

const ROOT = '/home/hiro/Documents/dev/codex/codex-backend';
const OUT = path.join(ROOT, 'docs/audit/graph-3d/calls.json');
const graph = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/audit/graph-3d/graph.json'), 'utf8'));
const FILES = new Set(graph.nodes.map(n => n.id));

function resolveImport(fromFile, raw) {
  if (!raw || !raw.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), raw);
  for (const c of [base, base + '.js', base + '.jsx', path.join(base, 'index.js')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) {
      const rel = path.relative(ROOT, c);
      if (FILES.has(rel)) return rel;
    }
  }
  return null;
}

function parse(src, file) {
  try {
    return parser.parse(src, {
      sourceType: 'unambiguous', allowImportExportEverywhere: true,
      plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator',
        'objectRestSpread', 'dynamicImport', 'decorators-legacy', 'optionalCatchBinding'],
    });
  } catch (e) { return { __parseError: String(e.message).slice(0, 120), program: { body: [] } }; }
}

// imported local name -> defining file
function importsOf(ast, absFile) {
  const map = {}; // localName -> {file, imported}
  const visit = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'ImportDeclaration') {
      const t = resolveImport(absFile, node.source.value);
      if (t) for (const s of node.specifiers) {
        const local = s.local.name;
        const imported = s.type === 'ImportDefaultSpecifier' ? 'default'
          : s.type === 'ImportNamespaceSpecifier' ? '*' : s.imported.name;
        map[local] = { file: t, imported };
      }
    }
    if (node.type === 'VariableDeclarator' && node.init &&
        node.init.type === 'CallExpression' &&
        node.init.callee.type === 'Identifier' && node.init.callee.name === 'require' &&
        node.init.arguments.length === 1 && node.init.arguments[0].type === 'StringLiteral') {
      const t = resolveImport(absFile, node.init.arguments[0].value);
      if (t) {
        if (node.id.type === 'Identifier') map[node.id.name] = { file: t, imported: '*' };
        else if (node.id.type === 'ObjectPattern') {
          for (const p of node.id.properties) {
            if (p.type === 'ObjectProperty' && p.key.type === 'Identifier')
              map[p.value.type === 'Identifier' ? p.value.name : p.key.name] = { file: t, imported: p.key.name };
          }
        }
      }
    }
    for (const k in node) {
      const v = node[k];
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v.type === 'string') visit(v);
    }
  };
  visit(ast.program || ast);
  return map;
}

function callsOf(ast) {
  const out = []; // {name} for f(), {obj, prop} for o.p()
  const visit = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'CallExpression') {
      const c = node.callee;
      if (c.type === 'Identifier') out.push({ name: c.name });
      else if (c.type === 'MemberExpression' && !c.computed &&
               c.object.type === 'Identifier' && c.property.type === 'Identifier') {
        out.push({ obj: c.object.name, prop: c.property.name });
      }
    }
    for (const k in node) {
      const v = node[k];
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v.type === 'string') visit(v);
    }
  };
  visit(ast.program || ast);
  return out;
}

const edgeCounts = new Map(); // source|target|via -> n
let parseErrors = 0, filesWithCalls = 0;

for (const rel of FILES) {
  const abs = path.join(ROOT, rel);
  let src;
  try { src = fs.readFileSync(abs, 'utf8'); } catch { continue; }
  const ast = parse(src, rel);
  if (ast.__parseError) { parseErrors++; continue; }
  const imp = importsOf(ast, abs);
  if (!Object.keys(imp).length) continue;
  const calls = callsOf(ast);
  let hit = false;
  for (const c of calls) {
    let entry = null, via = null;
    if (c.name && imp[c.name]) { entry = imp[c.name]; via = entry.imported === '*' || entry.imported === 'default' ? c.name + '()' : c.name; }
    else if (c.obj && imp[c.obj]) { entry = imp[c.obj]; via = `${c.obj}.${c.prop}()`; }
    if (entry && entry.file !== rel) {
      hit = true;
      const k = `${rel}|${entry.file}|${via}`;
      edgeCounts.set(k, (edgeCounts.get(k) || 0) + 1);
    }
  }
  if (hit) filesWithCalls++;
}

const links = [...edgeCounts.entries()]
  .map(([k, count]) => { const [source, target, via] = k.split('|'); return { source, target, via, count }; })
  .sort((a, b) => b.count - a.count);

fs.writeFileSync(OUT, JSON.stringify({ links }));
console.log(`call-links=${links.length} files-with-calls=${filesWithCalls} parse-errors=${parseErrors}`);
const top = links.slice(0, 10).map(l => `${l.count}x ${l.source.split('/').pop()} --${l.via}--> ${l.target.split('/').pop()}`);
console.log(top.join('\n'));
