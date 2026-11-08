const DEFAULTS = {
  apiBase: 'https://codex-backend-7utu.onrender.com',
  frontendBase: 'https://buildrshq.dev',
};

const apiInput = document.getElementById('api-base');
const frontendInput = document.getElementById('frontend-base');
const saveButton = document.getElementById('save');
const syncButton = document.getElementById('sync');
const message = document.getElementById('message');
const errorBox = document.getElementById('error');

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

function showMessage(text) {
  errorBox.hidden = true;
  message.textContent = text;
  message.hidden = false;
  setTimeout(() => { message.hidden = true; }, 4000);
}

function showError(text) {
  message.hidden = true;
  errorBox.textContent = text;
  errorBox.hidden = false;
}

async function load() {
  const stored = await chrome.storage.local.get(['apiBase', 'frontendBase']);
  apiInput.value = stored.apiBase || DEFAULTS.apiBase;
  frontendInput.value = stored.frontendBase || DEFAULTS.frontendBase;
}

async function ensureApiPermission(apiBase) {
  const origin = `${new URL(apiBase).origin}/*`;
  const hasPermission = await chrome.permissions.contains({ origins: [origin] });
  if (hasPermission) return true;
  return chrome.permissions.request({ origins: [origin] });
}

saveButton.addEventListener('click', async () => {
  const apiBase = normalizeBase(apiInput.value);
  const frontendBase = normalizeBase(frontendInput.value);
  if (!apiBase) return showError('Enter a valid Buildrs API URL (https://…).');
  if (!frontendBase) return showError('Enter a valid Buildrs web app URL (https://…).');

  try {
    const granted = await ensureApiPermission(apiBase);
    if (!granted) return showError('Chrome did not grant access to that API URL.');
  } catch (error) {
    return showError('Chrome did not grant access to that API URL.');
  }

  await chrome.storage.local.set({ apiBase, frontendBase });
  showMessage('Settings saved.');
});

syncButton.addEventListener('click', async () => {
  syncButton.disabled = true;
  syncButton.textContent = 'Syncing…';
  const result = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'FIGMA_SYNC' }, (response) => {
      void chrome.runtime.lastError;
      resolve(response || {});
    });
  });
  syncButton.disabled = false;
  syncButton.textContent = 'Sync now';

  if (result.ok) {
    showMessage(`Synced ${result.count || 0} design${result.count === 1 ? '' : 's'}.`);
  } else {
    showError(result.error || 'Sync failed. Open figma.com and try again.');
  }
});

load();
