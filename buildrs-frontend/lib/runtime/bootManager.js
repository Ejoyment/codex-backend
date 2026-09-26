/**
 * Phase 3 — bootManager: detect device/connection capability and pick
 * Tier 1 (in-browser WebContainer) or Tier 2 (cloud container fallback).
 *
 * Tier 2 triggers (any one):
 *  - deviceMemory <= 4 GB (when reported)
 *  - hardwareConcurrency <= 4
 *  - saveData on, or effectiveType 2g/slow-2g
 *  - explicit ?runtime=tier2 override / forced cloud flag
 */

const TIERS = { BROWSER: 'tier1', CLOUD: 'tier2' };

function detectCapabilities(nav = typeof navigator !== 'undefined' ? navigator : {}) {
  const deviceMemory = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null;
  const hardwareConcurrency = typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null;
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection || {};
  return {
    deviceMemory,
    hardwareConcurrency,
    effectiveType: conn.effectiveType || null,
    downlink: typeof conn.downlink === 'number' ? conn.downlink : null,
    rtt: typeof conn.rtt === 'number' ? conn.rtt : null,
    saveData: !!conn.saveData,
  };
}

function pickTier(caps = {}, opts = {}) {
  const reasons = [];
  if (opts.forceTier === TIERS.CLOUD || opts.forceCloud) {
    return { tier: TIERS.CLOUD, reasons: ['forced-cloud-runtime'] };
  }
  if (opts.forceTier === TIERS.BROWSER) {
    return { tier: TIERS.BROWSER, reasons: ['forced-browser-runtime'] };
  }
  if (caps.deviceMemory != null && caps.deviceMemory <= 4) {
    reasons.push(`low-device-memory (${caps.deviceMemory}GB)`);
  }
  if (caps.hardwareConcurrency != null && caps.hardwareConcurrency <= 4) {
    reasons.push(`low-cpu-cores (${caps.hardwareConcurrency})`);
  }
  if (caps.saveData) reasons.push('save-data on');
  if (caps.effectiveType && ['slow-2g', '2g'].includes(caps.effectiveType)) {
    reasons.push(`slow-connection (${caps.effectiveType})`);
  }
  if (caps.downlink != null && caps.downlink < 1.5) {
    reasons.push(`low-downlink (${caps.downlink}Mbps)`);
  }
  if (reasons.length > 0) return { tier: TIERS.CLOUD, reasons };
  return { tier: TIERS.BROWSER, reasons: ['capable-device'] };
}

function decideRuntime(opts = {}, nav) {
  const caps = detectCapabilities(nav);
  // URL override (?runtime=tier2) for testing / simulated slow clients.
  try {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search);
      const r = q.get('runtime');
      if (r === 'tier2') return { tier: TIERS.CLOUD, reasons: ['url-override'], caps };
      if (r === 'tier1') return { tier: TIERS.BROWSER, reasons: ['url-override'], caps };
    }
  } catch {}
  const { tier, reasons } = pickTier(caps, opts);
  return { tier, reasons, caps };
}

// Lazy-load heavy modules — never at initial bundle. Package names match
// the app's installed deps (see buildrs-frontend/package.json + useXterm.js).
function loadMonaco() {
  return import('@monaco-editor/react');
}
function loadXterm() {
  return Promise.all([
    import('xterm'),
    import('@xterm/addon-fit'),
  ]).then(([{ Terminal }, { FitAddon }]) => ({ Terminal, FitAddon }));
}
function loadSandboxRuntime() {
  return import('@webcontainer/api');
}

// Pre-warm runtime on workspace open, not on first run.
let _prewarmed = false;
function prewarmRuntime() {
  if (_prewarmed || typeof window === 'undefined') return Promise.resolve(false);
  _prewarmed = true;
  return new Promise((resolve) => {
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
    idle(async () => {
      try {
        // Warm module graph only; booting the container still happens on demand.
        await Promise.allSettled([import('xterm')]);
        resolve(true);
      } catch {
        resolve(false);
      }
    });
  });
}

function degradedStateFor({ tier, caps }) {
  if (tier === TIERS.CLOUD) {
    return { label: 'Cloud runtime', reason: 'Low-spec device or slow connection routed to cloud container fallback.' };
  }
  if (caps?.saveData || (caps?.downlink != null && caps.downlink < 1.5)) {
    return { label: 'Audio-only', reason: 'Low bandwidth: terminal mirror delayed, audio-only mode.' };
  }
  return null;
}

// Dual export: CommonJS (jest/node) + ESM-friendly named access via bundler interop.
module.exports = { TIERS, detectCapabilities, pickTier, decideRuntime, loadMonaco, loadXterm, loadSandboxRuntime, prewarmRuntime, degradedStateFor };
