/**
 * Runs on Buildrs pages. Reads the signed-in user's Buildrs JWT from
 * localStorage (the same token the web app already uses) and hands it to the
 * extension background so the helper can call the sync endpoint. It also
 * relays "sync now" requests from the Figma page and file read requests
 * from the Figma frame browser.
 */
(function buildrsFigmaContentScript() {
  let authReady = Promise.resolve();

  function sendAuth() {
    let authToken = null;
    let apiBase = null;
    try {
      authToken = localStorage.getItem('authToken');
      apiBase = localStorage.getItem('buildrsApiBase');
    } catch (error) {
      // Storage can be blocked; the helper will report "not signed in".
    }

    authReady = new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'BUILDRS_AUTH', authToken, apiBase }, () => {
        // Reading lastError prevents "Unchecked runtime.lastError" noise when
        // the service worker is restarting.
        void chrome.runtime.lastError;
        resolve();
      });
    });
    return authReady;
  }

  function requestSync() {
    authReady.then(() => {
      chrome.runtime.sendMessage({ type: 'FIGMA_SYNC' }, (response) => {
        void chrome.runtime.lastError;
        window.postMessage({
          source: 'buildrs-helper',
          type: 'FIGMA_SYNC_RESULT',
          ok: Boolean(response?.ok),
          error: response?.error || null,
          count: Number(response?.count) || 0,
        }, window.location.origin);
      });
    });
  }

  function requestGetFile(fileKey) {
    chrome.runtime.sendMessage({ type: 'FIGMA_GET_FILE', fileKey }, (response) => {
      void chrome.runtime.lastError;
      window.postMessage({
        source: 'buildrs-helper',
        type: 'FIGMA_GET_FILE_RESULT',
        ok: Boolean(response?.ok),
        data: response?.data || null,
        error: response?.error || null,
      }, window.location.origin);
    });
  }

  sendAuth();
  window.addEventListener('focus', sendAuth);
  window.addEventListener('storage', sendAuth);

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data || {};
    if (data.source === 'buildrs-web' && data.type === 'FIGMA_SYNC_REQUEST') {
      requestSync();
    }
    if (data.source === 'buildrs-web' && data.type === 'FIGMA_GET_FILE_REQUEST') {
      requestGetFile(data.fileKey);
    }
  });
})();