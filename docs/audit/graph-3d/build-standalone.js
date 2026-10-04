// Builds standalone.html: library + graph.json + calls.json all inlined,
// so it opens straight from file:// with ZERO network. Usage: node build-standalone.js
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const esc = (s) => s.replace(/</g, '\\u003c');

const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const g = esc(fs.readFileSync(path.join(DIR, 'graph.json'), 'utf8'));
const c = esc(fs.readFileSync(path.join(DIR, 'calls.json'), 'utf8'));
// Inline the vendored libraries too: standalone.html then needs zero network.
const libRaw = fs.readFileSync(path.join(DIR, 'vendor/3d-force-graph.min.js'), 'utf8');
const lib = libRaw.replace(/<\/script/gi, '<\\/script');
const libTag = `<script>${lib}</script>`;
const lib2Raw = fs.readFileSync(path.join(DIR, 'vendor/force-graph.min.js'), 'utf8');
const lib2 = lib2Raw.replace(/<\/script/gi, '<\\/script');
const lib2Tag = `<script>${lib2}</script>`;

const inject = `<script>window.__GRAPH_DATA__=${g};window.__CALLS_DATA__=${c};</script>`;
// Insert before the main inline script so data is present when it runs.
let final = html;
// Swap the external vendor/CDN tags for the inlined library (fully offline).
final = final.replace(/<script src="vendor\/3d-force-graph\.min\.js"><\/script>/, () => libTag);
final = final.replace(/<script src="vendor\/force-graph\.min\.js"><\/script>/, () => lib2Tag);
final = final.replace(/<script>if \(typeof ForceGraph3D[\s\S]*?<\/script>/, '');
final = final.replace(/<script>if \(typeof ForceGraph ===[\s\S]*?<\/script>/, '');
const marker = '\n<script>\nconst webglOK';
if (final.includes(marker)) {
  final = final.replace(marker, '\n' + inject + marker);
} else {
  throw new Error('main script marker not found');
}
fs.writeFileSync(path.join(DIR, 'standalone.html'), final);
console.log('wrote standalone.html', (final.length / 1024).toFixed(0) + 'KB');
