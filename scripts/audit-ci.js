/**
 * CI security-audit gate with a scoped exception list.
 *
 * Replaces `npm audit --audit-level=high` so a single unfixable advisory
 * can't permanently red the build while still failing on everything else.
 *
 * ACCEPTED (does NOT fail the build):
 * - GHSA-86w9-cpqp-85rv (node-forge RSA PKCS#1 v1.5 verify, via
 *   flutterwave-node-v3): "No fix available" — installed 1.4.0 IS the latest
 *   published version and flutterwave-node-v3@latest still pins node-forge.
 *   The dep is live (routes/flutterwave-billing.js + checkout provider), so
 *   removal is not an option. Planned end-state: replace the SDK with direct
 *   Flutterwave REST calls (see docs/audit/recommendations.md). Revisit this
 *   exception when that rewrite lands or an upstream fix is published.
 *
 * Everything else at high/critical severity fails the build.
 *
 * Usage: node scripts/audit-ci.js
 */
const { execFileSync } = require('child_process');

const ACCEPTED = new Set([
  'GHSA-86W9-CPQP-85RV', // compare upper-cased (advisory IDs are case-insensitive)
]);

function runAudit() {
  try {
    execFileSync('npm', ['audit', '--json', '--omit=dev'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { vulnerabilities: {} }; // exit 0 = clean
  } catch (e) {
    const out = (e.stdout || '').toString();
    try {
      return JSON.parse(out);
    } catch {
      console.error('Could not parse `npm audit --json` output; failing closed.');
      console.error(out.slice(0, 2000));
      process.exit(1);
    }
  }
}

const report = runAudit();
const vulns = report.vulnerabilities || {};

// Collect advisory IDs for an entry, following string `via` references to the
// named entries (npm lists dependents like flutterwave-node-v3 as vulnerable
// with via: ["node-forge"] and no advisory URL of their own).
function advisoryIds(name, seen = new Set()) {
  if (seen.has(name)) return [];
  seen.add(name);
  const v = vulns[name];
  if (!v) return [];
  const ids = [];
  try {
    for (const via of v.via || []) {
      if (via && typeof via === 'object' && via.url) {
        const m = via.url.match(/GHSA-[a-z0-9-]+/i);
        if (m) ids.push(m[0].toUpperCase());
      } else if (typeof via === 'string') {
        ids.push(...advisoryIds(via, seen));
      }
    }
  } catch { /* ignore malformed entries */ }
  return ids;
}

const blocking = [];

for (const [name, v] of Object.entries(vulns)) {
  const sev = (v.severity || '').toLowerCase();
  if (sev !== 'high' && sev !== 'critical') continue;
  const ids = advisoryIds(name);
  const accepted = ids.length > 0 && ids.every((id) => ACCEPTED.has(id));
  if (accepted) {
    console.log(` - accepted (tracked exception): ${name} [${ids.join(', ')}]`);
  } else {
    blocking.push({ name, severity: v.severity, ids, range: v.range });
  }
}

if (blocking.length > 0) {
  console.error('\nBLOCKING vulnerabilities (high/critical, no exception):');
  for (const b of blocking) {
    console.error(` - ${b.name} [${b.severity}] ${(b.ids || []).join(', ')} ${b.range || ''}`);
  }
  process.exit(1);
}

console.log('audit-ci: no blocking vulnerabilities.');
