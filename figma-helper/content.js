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

  async function fetchFileInPage(fileKey) {
    // Fetch the file directly from figma.com using the page's own Figma
    // session cookies. Content scripts share the page's origin for cookies,
    // so no OAuth token or extension background worker is needed.
    for (const depth of [2, 1, null]) {
      const url = depth
        ? `https://www.figma.com/api/files/${encodeURIComponent(fileKey)}?depth=${depth}`
        : `https://www.figma.com/api/files/${encodeURIComponent(fileKey)}`;

      const headers = { accept: 'application/json', 'x-csrf-bypass': 'yes' };
      const tsid = document.cookie.match(/(?:^|;\s*)tsid=([^;]+)/);
      if (tsid) headers.tsid = decodeURIComponent(tsid[1]);

      let response;
      try {
        response = await fetch(url, { credentials: 'include', headers });
      } catch (error) {
        continue;
      }

      let text;
      try { text = await response.text(); } catch { continue; }

      let json = null;
      try { json = JSON.parse(text); } catch { json = null; }

      if (json && typeof json.status === 'number' && json.status >= 400) {
        return { ok: false, status: json.status, json, sample: text.slice(0, 300) };
      }

      const doc =
        json?.document ||
        json?.file?.document ||
        json?.meta?.document ||
        json?.result?.document ||
        json?.data?.document;

      return {
        ok: response.ok,
        status: response.status,
        json,
        sample: text.slice(0, 300),
        document: doc || null,
      };
    }

    return { ok: false, status: 0, json: null, sample: '', document: null };
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
    fetchFileInPage(fileKey).then((result) => {
      window.postMessage({
        source: 'buildrs-helper',
        type: 'FIGMA_GET_FILE_RESULT',
        ok: Boolean(result.ok),
        data: result?.document ? {
          name: result.json?.name || 'Untitled file',
          lastModified: result.json?.lastModified || null,
          editorType: result.json?.editorType || null,
          pages: extractPagesAndFrames(result.document),
        } : null,
        error: result.ok ? null : `Figma returned ${result.status || 'error'}`,
      }, window.location.origin);
    });
  }

  function extractPagesAndFrames(document) {
    const pages = [];
    if (!document?.children) return pages;

    for (const page of document.children) {
      if (page.type !== 'CANVAS') continue;
      const frames = [];
      if (page.children) {
        for (const node of page.children) {
          if (node.type === 'FRAME' || node.type === 'SECTION' || node.type === 'COMPONENT') {
            frames.push({
              id: node.id,
              name: node.name || 'Untitled frame',
              type: node.type,
              width: node.absoluteBoundingBox?.width || 0,
              height: node.absoluteBoundingBox?.height || 0,
            });
          }
        }
      }
      pages.push({
        id: page.id,
        name: page.name || 'Untitled page',
        frames,
      });
    }
    return pages;
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