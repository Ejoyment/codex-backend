/**
 * Buildrs Figma Helper - background service worker.
 *
 * Figma has no public API that lists the files a user can open, so this
 * extension reads the user's own Figma "recent files" list from a signed-in
 * www.figma.com tab (same-origin fetch, their cookies) and posts only file
 * keys, names, thumbnails and modified dates to Buildrs. The user's Figma
 * session never leaves the browser, and the Buildrs JWT is only used to call
 * the Buildrs sync endpoint.
 */
const DEFAULTS = {
  apiBase: 'https://codex-backend-7utu.onrender.com',
  frontendBase: 'https://buildrshq.dev',
};

const SYNC_ALARM = 'buildrs-figma-sync';
const SYNC_INTERVAL_MINUTES = 15;
const FIGMA_RECENT_FILES_URL = 'https://www.figma.com/api/recent_files?org_id=null';
const MAX_FILES = 200;

function normalizeBase(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return '';
    return `${url.origin}${url.pathname.replace(/\/+$/, '').replace(/\/api$/i, '')}`.replace(/\/+$/, '');
  } catch (error) {
    return '';
  }
}

async function getSettings() {
  const stored = await chrome.storage.local.get([
    'apiBase',
    'frontendBase',
    'authToken',
    'helperSyncedAt',
    'lastSyncError',
    'fileCount',
  ]);
  return {
    apiBase: normalizeBase(stored.apiBase) || DEFAULTS.apiBase,
    frontendBase: normalizeBase(stored.frontendBase) || DEFAULTS.frontendBase,
    authToken: stored.authToken || null,
    helperSyncedAt: stored.helperSyncedAt || null,
    lastSyncError: stored.lastSyncError || null,
    fileCount: Number(stored.fileCount) || 0,
  };
}

async function recordError(message) {
  await chrome.storage.local.set({ lastSyncError: String(message || 'Sync failed') });
  return { ok: false, error: String(message || 'Sync failed') };
}

function waitForTabComplete(tabId, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (tab.status === 'complete') {
          resolve(tab);
          return;
        }
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error('Figma took too long to load. Open figma.com, then try again.'));
          return;
        }
        setTimeout(check, 500);
      });
    };
    check();
  });
}

async function getFigmaTab() {
  const tabs = await chrome.tabs.query({ url: ['https://www.figma.com/*'] });
  if (tabs.length) {
    return { tab: tabs.find((tab) => tab.active) || tabs[0], created: false };
  }
  const tab = await chrome.tabs.create({ url: 'https://www.figma.com/files/', active: false });
  return { tab, created: true };
}

// Runs inside the figma.com tab. Same-origin fetch means the request carries
// the user's existing Figma cookies; nothing is copied out of the page.
async function fetchRecentFilesInPage(url) {
  const headers = { accept: 'application/json', 'x-csrf-bypass': 'yes' };
  const tsid = document.cookie.match(/(?:^|;\s*)tsid=([^;]+)/);
  if (tsid) headers.tsid = decodeURIComponent(tsid[1]);

  let response = await fetch(url, { credentials: 'include', headers });
  let text = await response.text();
  if (!response.ok) {
    response = await fetch(url, { credentials: 'include' });
    text = await response.text();
  }

  let json = null;
  try {
    json = JSON.parse(text);
  } catch (error) {
    json = null;
  }
  return {
    ok: response.ok,
    status: response.status,
    json,
    sample: text.slice(0, 300),
  };
}

function mapRecentFiles(payload) {
  const list = payload?.meta?.recent_files || payload?.recent_files || payload?.files;
  if (!Array.isArray(list)) {
    throw new Error('Figma did not return your recent files. Open figma.com, make sure you are signed in, then try again.');
  }

  const seen = new Set();
  const files = [];
  for (const item of list) {
    const key = String(item?.key || item?.file_key || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    files.push({
      key,
      name: item?.name || item?.file_name || 'Untitled file',
      thumbnail_url: item?.thumbnail_url || item?.thumbnailUrl || null,
      last_modified: item?.last_modified || item?.lastModified || null,
    });
    if (files.length >= MAX_FILES) break;
  }
  return files;
}

async function readFigmaRecentFiles() {
  const { tab, created } = await getFigmaTab();
  if (!tab?.id) throw new Error('Could not open Figma in this browser.');

  try {
    await waitForTabComplete(tab.id);
    let injection;
    try {
      [injection] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: fetchRecentFilesInPage,
        args: [FIGMA_RECENT_FILES_URL],
      });
    } catch (error) {
      throw new Error('Could not read Figma. Open figma.com in a tab, sign in, then try again.');
    }

    const result = injection?.result;
    if (!result) throw new Error('Could not read Figma. Open figma.com in a tab, sign in, then try again.');
    if (!result.ok) {
      if (result.status === 401 || result.status === 403) {
        throw new Error('Figma needs you to sign in. Open figma.com, sign in, then sync again.');
      }
      throw new Error(`Figma returned ${result.status}. Open figma.com once, then try again.`);
    }
    return mapRecentFiles(result.json);
  } finally {
    if (created && tab.id) {
      chrome.tabs.remove(tab.id, () => void chrome.runtime.lastError);
    }
  }
}

let activeSync = null;

async function doSync() {
  const settings = await getSettings();
  if (!settings.authToken) {
    return recordError('Open Buildrs and sign in, then click Sync now.');
  }

  let files;
  try {
    files = await readFigmaRecentFiles();
  } catch (error) {
    return recordError(error.message);
  }

  let response;
  try {
    response = await fetch(`${settings.apiBase}/api/figma/files/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.authToken}`,
      },
      body: JSON.stringify({ files }),
    });
  } catch (error) {
    return recordError(`Could not reach Buildrs at ${settings.apiBase}.`);
  }

  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    await chrome.storage.local.remove('authToken');
    return recordError('Buildrs session expired. Open Buildrs and sign in again.');
  }
  if (!response.ok || !data.success) {
    return recordError(data.message || `Buildrs sync failed (${response.status}).`);
  }

  const syncedAt = data.syncedAt || new Date().toISOString();
  const count = Array.isArray(data.files) ? data.files.length : files.length;
  await chrome.storage.local.set({
    helperSyncedAt: syncedAt,
    lastSyncError: null,
    fileCount: count,
  });
  return { ok: true, count, syncedAt };
}

function syncNow() {
  if (activeSync) return activeSync;
  activeSync = doSync().finally(() => { activeSync = null; });
  return activeSync;
}

async function handleAuth(message) {
  const token = typeof message.authToken === 'string' && message.authToken ? message.authToken : null;
  const apiBase = normalizeBase(message.apiBase);
  const updates = { authToken: token };
  if (apiBase) updates.apiBase = apiBase;
  await chrome.storage.local.set(updates);
  return token ? { ok: true } : { ok: false, error: 'not_signed_in' };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;

  if (message.type === 'BUILDRS_AUTH') {
    handleAuth(message).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === 'FIGMA_SYNC') {
    syncNow().then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === 'STATUS') {
    getSettings().then((settings) => sendResponse({
      ok: true,
      linked: Boolean(settings.authToken),
      apiBase: settings.apiBase,
      frontendBase: settings.frontendBase,
      helperSyncedAt: settings.helperSyncedAt,
      lastSyncError: settings.lastSyncError,
      fileCount: settings.fileCount,
    })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_INTERVAL_MINUTES });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_INTERVAL_MINUTES });
  syncNow();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) syncNow();
});
