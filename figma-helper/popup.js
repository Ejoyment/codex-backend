const statusLine = document.getElementById('status-line');
const fileCount = document.getElementById('file-count');
const lastSync = document.getElementById('last-sync');
const errorBox = document.getElementById('error');
const syncButton = document.getElementById('sync');
const openButton = document.getElementById('open-figma');
const optionsButton = document.getElementById('options');

function formatLastSync(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`;
  return date.toLocaleDateString();
}

function send(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      void chrome.runtime.lastError;
      resolve(response || {});
    });
  });
}

async function render() {
  const status = await send({ type: 'STATUS' });
  const linked = Boolean(status.linked);
  statusLine.textContent = linked ? 'Buildrs account linked' : 'Not linked — sign in to Buildrs';
  fileCount.textContent = String(status.fileCount || 0);
  lastSync.textContent = formatLastSync(status.helperSyncedAt);

  if (status.lastSyncError) {
    errorBox.textContent = status.lastSyncError;
    errorBox.hidden = false;
  } else {
    errorBox.hidden = true;
  }
}

syncButton.addEventListener('click', async () => {
  syncButton.disabled = true;
  syncButton.textContent = 'Syncing…';
  errorBox.hidden = true;

  const result = await send({ type: 'FIGMA_SYNC' });
  syncButton.disabled = false;
  syncButton.textContent = 'Sync now';

  if (!result.ok) {
    errorBox.textContent = result.error || 'Sync failed. Open figma.com and try again.';
    errorBox.hidden = false;
  }
  await render();
});

openButton.addEventListener('click', async () => {
  const status = await send({ type: 'STATUS' });
  const base = String(status.frontendBase || 'https://buildrshq.dev').replace(/\/+$/, '');
  chrome.tabs.create({ url: `${base}/figma` });
});

optionsButton.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

render();
