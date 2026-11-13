/**
 * Runs on Buildrs pages. Reads the signed-in user's Buildrs JWT from
 * localStorage (the same token the web app already uses) and hands it to the
 * extension background so the helper can call the sync endpoint. It also
 * relays "sync now", file and frame requests from the Figma page.
 *
 * Every reply echoes the request's `requestId` (when the page sends one) so
 * concurrent requests — e.g. opening a frame while the code panel reads
 * another — cannot resolve each other.
 */
(function buildrsFigmaContentScript() {
  let authReady = Promise.resolve();

  // Lets the Buildrs page detect the helper synchronously, without a round
  // trip through the service worker.
  try {
    document.documentElement.setAttribute('data-buildrs-figma-helper', '1');
    document.documentElement.setAttribute('data-buildrs-figma-helper-version', chrome.runtime.getManifest().version);
  } catch (error) {
    // The marker is an optimisation; the ping still works without it.
  }

  function post(type, payload) {
    window.postMessage({ source: 'buildrs-helper', type, ...payload }, window.location.origin);
  }

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
      try {
        chrome.runtime.sendMessage({ type: 'BUILDRS_AUTH', authToken, apiBase }, () => {
          void chrome.runtime.lastError;
          resolve();
        });
      } catch (error) {
        resolve();
      }
    });
    return authReady;
  }

  function relay(request, resultType, extra = {}) {
    const { requestId } = request;
    try {
      chrome.runtime.sendMessage(request, (response) => {
        if (chrome.runtime.lastError) {
          post(resultType, {
            requestId,
            ok: false,
            error: 'Extension context invalidated. Refresh this Buildrs page and try again.',
            ...extra,
          });
          return;
        }
        post(resultType, {
          requestId,
          ok: Boolean(response?.ok),
          error: response?.error || null,
          ...(response?.data !== undefined ? { data: response.data || null } : {}),
          ...(response?.count !== undefined ? { count: Number(response.count) || 0 } : {}),
        });
      });
    } catch (error) {
      post(resultType, {
        requestId,
        ok: false,
        error: 'Extension context invalidated. Refresh this Buildrs page and try again.',
        ...extra,
      });
    }
  }

  function requestSync(request) {
    authReady.then(() => relay({ type: 'FIGMA_SYNC' }, 'FIGMA_SYNC_RESULT', { count: 0 }));
  }

  function requestGetFile(request) {
    relay({ type: 'FIGMA_GET_FILE', fileKey: request.fileKey }, 'FIGMA_GET_FILE_RESULT', { data: null });
  }

  function requestGetNode(request) {
    relay(
      { type: 'FIGMA_GET_NODE', fileKey: request.fileKey, nodeId: request.nodeId },
      'FIGMA_GET_NODE_RESULT',
      { data: null }
    );
  }

  sendAuth();
  window.addEventListener('focus', sendAuth);
  window.addEventListener('storage', sendAuth);

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data || {};
    if (data.source !== 'buildrs-web') return;

    if (data.type === 'FIGMA_PING_REQUEST') {
      post('FIGMA_PONG', { requestId: data.requestId || null, ok: true });
      return;
    }
    if (data.type === 'FIGMA_SYNC_REQUEST') {
      requestSync(data);
      return;
    }
    if (data.type === 'FIGMA_GET_FILE_REQUEST') {
      requestGetFile(data);
      return;
    }
    if (data.type === 'FIGMA_GET_NODE_REQUEST') {
      requestGetNode(data);
    }
  });
})();
