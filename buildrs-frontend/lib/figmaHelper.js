/**
 * Bridge to the Buildrs Figma Helper (browser extension).
 *
 * The helper reads Figma with the user's own signed-in figma.com session, so
 * the web app can list files, open frames and hand a frame to codegen/agents
 * without any Figma OAuth scope.
 *
 * Requests go: page → content script (window.postMessage) → background
 * service worker → figma.com tab. Replies echo `requestId`; older helper
 * builds that don't echo it are matched by response type instead.
 */

const PING_TIMEOUT_MS = 1200;
const FILE_TIMEOUT_MS = 60000;
const NODE_TIMEOUT_MS = 60000;
const SYNC_TIMEOUT_MS = 120000;
const AVAILABLE_CACHE_MS = 30000;

const pending = new Map();
let listenerAttached = false;
let availability = null;

function pageOrigin() {
  return typeof window === 'undefined' ? '' : window.location.origin;
}

function newRequestId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch (error) {
    // Fall through.
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function ensureListener() {
  if (listenerAttached || typeof window === 'undefined') return;
  listenerAttached = true;
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data || {};
    if (data.source !== 'buildrs-helper' || typeof data.type !== 'string') return;

    let entry = null;
    let matchedId = null;
    if (data.requestId && pending.has(data.requestId)) {
      matchedId = data.requestId;
      entry = pending.get(matchedId);
    } else if (!data.requestId) {
      // Compatibility with helper builds that predate request ids.
      for (const [id, candidate] of pending) {
        if (candidate.expect === data.type) {
          matchedId = id;
          entry = candidate;
          break;
        }
      }
    }
    if (!entry) return;
    pending.delete(matchedId);
    clearTimeout(entry.timer);
    entry.resolve(data);
  });
}

function request(type, payload, expect, timeoutMs) {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('The Figma helper only runs in the browser.'));
  }
  ensureListener();
  const requestId = newRequestId();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error('The Buildrs Figma Helper did not respond. Install or reload it, and keep a signed-in figma.com tab open.'));
    }, timeoutMs);
    pending.set(requestId, { resolve, timer, expect });
    window.postMessage({ source: 'buildrs-web', type, requestId, ...payload }, pageOrigin());
  });
}

// The content script marks the page as soon as it runs, so most checks are
// synchronous and don't cost a round trip.
export function helperInstalled() {
  if (typeof document === 'undefined') return false;
  return document.documentElement.hasAttribute('data-buildrs-figma-helper');
}

export async function helperAvailable({ force = false } = {}) {
  if (helperInstalled()) return true;
  if (!force && availability && Date.now() - availability.at < AVAILABLE_CACHE_MS) {
    return availability.value;
  }
  let value = false;
  try {
    const reply = await request('FIGMA_PING_REQUEST', {}, 'FIGMA_PONG', PING_TIMEOUT_MS);
    value = Boolean(reply?.ok);
  } catch (error) {
    value = false;
  }
  availability = { at: Date.now(), value };
  return value;
}

export async function helperGetFile(fileKey) {
  const reply = await request('FIGMA_GET_FILE_REQUEST', { fileKey }, 'FIGMA_GET_FILE_RESULT', FILE_TIMEOUT_MS);
  if (!reply?.ok) throw new Error(reply?.error || 'Could not read that file from your Figma tab.');
  const pages = Array.isArray(reply.data?.pages) ? reply.data.pages : [];
  if (!pages.length) throw new Error('Figma returned no pages for that file.');
  return {
    success: true,
    source: 'helper',
    file: { key: fileKey, name: reply.data?.name || fileKey },
    pages,
  };
}

export async function helperGetNode(fileKey, nodeId) {
  const reply = await request('FIGMA_GET_NODE_REQUEST', { fileKey, nodeId }, 'FIGMA_GET_NODE_RESULT', NODE_TIMEOUT_MS);
  if (!reply?.ok || !reply.data?.node) {
    throw new Error(reply?.error || 'Could not read that frame from your Figma tab.');
  }
  return reply.data;
}

export async function helperSync() {
  const reply = await request('FIGMA_SYNC_REQUEST', {}, 'FIGMA_SYNC_RESULT', SYNC_TIMEOUT_MS);
  if (!reply?.ok) throw new Error(reply?.error || 'Figma sync failed.');
  return reply;
}

export const figmaHelper = {
  installed: helperInstalled,
  available: helperAvailable,
  getFile: helperGetFile,
  getNode: helperGetNode,
  sync: helperSync,
};

export default figmaHelper;
