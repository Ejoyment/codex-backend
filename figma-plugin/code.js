// Send to Buildrs — Figma plugin main thread.
//
// Runs in Figma's sandbox: it reads the open file and the current selection
// and hands them to the UI iframe (ui.html), which talks to the Buildrs API.

var TOKEN_KEY = 'buildrsPluginToken';
var FILE_KEY_DATA = 'buildrsFileKey';

figma.showUI(__html__, { width: 360, height: 520, themeColors: true });

function pageOf(node) {
  var current = node;
  while (current && current.type !== 'PAGE') current = current.parent;
  return current;
}

function describeSelection() {
  return figma.currentPage.selection.slice(0, 25).map(function (node) {
    var page = pageOf(node) || figma.currentPage;
    return {
      id: node.id,
      name: node.name,
      type: node.type,
      width: 'width' in node ? Math.round(node.width) : null,
      height: 'height' in node ? Math.round(node.height) : null,
      pageId: page.id,
      pageName: page.name,
    };
  });
}

function fileKey() {
  // figma.fileKey is only exposed to private/development plugins; otherwise
  // fall back to the key the user linked once for this document.
  return figma.fileKey || figma.root.getPluginData(FILE_KEY_DATA) || null;
}

function postState() {
  figma.ui.postMessage({
    type: 'state',
    fileKey: fileKey(),
    fileName: figma.root.name,
    selection: describeSelection(),
  });
}

figma.clientStorage.getAsync(TOKEN_KEY).then(function (token) {
  figma.ui.postMessage({ type: 'token', token: token || null });
  postState();
});

figma.on('selectionchange', postState);
figma.on('currentpagechange', postState);

figma.ui.onmessage = function (message) {
  if (!message || !message.type) return;

  if (message.type === 'save-token') {
    figma.clientStorage.setAsync(TOKEN_KEY, message.token || '').then(function () {
      figma.ui.postMessage({ type: 'token', token: message.token || null });
    });
  } else if (message.type === 'clear-token') {
    figma.clientStorage.deleteAsync(TOKEN_KEY).then(function () {
      figma.ui.postMessage({ type: 'token', token: null });
    });
  } else if (message.type === 'save-file-key') {
    if (message.fileKey) figma.root.setPluginData(FILE_KEY_DATA, String(message.fileKey));
    postState();
  } else if (message.type === 'notify') {
    figma.notify(String(message.text || ''), { error: Boolean(message.error) });
  } else if (message.type === 'open-url') {
    if (message.url) figma.openExternal(message.url);
  } else if (message.type === 'close') {
    figma.closePlugin();
  }
};
