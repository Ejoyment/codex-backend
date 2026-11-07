// Send to Buildrs — Figma plugin main thread.
//
// Runs in Figma's sandbox: it reads the open file and the current selection
// and hands them to the UI iframe (ui.html), which talks to the Buildrs API.

var TOKEN_KEY = 'buildrsPluginToken';
var FILE_KEY_DATA = 'buildrsFileKey';
// Per-user fallback (document name → file key) for files the user can only
// view, where writing plugin data to the document is not allowed.
var FILE_LINKS_KEY = 'buildrsFileLinks';
var userFileLinks = {};

figma.showUI(__html__, { width: 360, height: 540, themeColors: true });

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
  // figma.fileKey is only exposed to private plugins. Community plugins use
  // the key the user linked once: stored on the document when they can edit
  // it, otherwise in their own client storage.
  return figma.fileKey
    || figma.root.getPluginData(FILE_KEY_DATA)
    || userFileLinks[figma.root.name]
    || null;
}

function saveFileKey(key) {
  var value = key ? String(key) : '';
  try {
    figma.root.setPluginData(FILE_KEY_DATA, value);
  } catch (error) {
    // View-only file or Dev Mode: the document can't be written.
  }
  if (value) userFileLinks[figma.root.name] = value;
  else delete userFileLinks[figma.root.name];
  return figma.clientStorage.setAsync(FILE_LINKS_KEY, userFileLinks);
}

function postState() {
  figma.ui.postMessage({
    type: 'state',
    fileKey: fileKey(),
    fileName: figma.root.name,
    selection: describeSelection(),
  });
}

Promise.all([
  figma.clientStorage.getAsync(TOKEN_KEY),
  figma.clientStorage.getAsync(FILE_LINKS_KEY),
]).then(function (values) {
  userFileLinks = values[1] && typeof values[1] === 'object' ? values[1] : {};
  figma.ui.postMessage({ type: 'token', token: values[0] || null });
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
    saveFileKey(message.fileKey).then(postState, postState);
  } else if (message.type === 'clear-file-key') {
    saveFileKey('').then(postState, postState);
  } else if (message.type === 'notify') {
    figma.notify(String(message.text || ''), { error: Boolean(message.error) });
  } else if (message.type === 'open-url') {
    if (message.url) figma.openExternal(message.url);
  } else if (message.type === 'close') {
    figma.closePlugin();
  }
};
