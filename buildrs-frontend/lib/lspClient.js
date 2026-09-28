// LSP REST client for the editor. Providers are registered per-language in
// pages/editor.js; failures degrade silently to Monaco's built-ins.
import { apiFetch } from './api';

export function docUri(filePath) {
  const rel = String(filePath || '').replace(/^\/+/, '');
  return `file:///workspace/${rel.split('/').map(encodeURIComponent).join('/')}`;
}

export const lspApi = {
  start: (language) => apiFetch('/api/lsp/start', {
    method: 'POST',
    body: JSON.stringify({ language }),
  }),
  completions: (payload) => apiFetch('/api/lsp/completions', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  hover: (payload) => apiFetch('/api/lsp/hover', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  definition: (payload) => apiFetch('/api/lsp/definition', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  references: (payload) => apiFetch('/api/lsp/references', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  change: (payload) => apiFetch('/api/lsp/change', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  close: (payload) => apiFetch('/api/lsp/close', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
};

// LSP CompletionItemKind (1-25) → monaco.languages.CompletionItemKind name.
const LSP_KIND_NAMES = [
  'Text', 'Method', 'Function', 'Constructor', 'Field', 'Variable', 'Class',
  'Interface', 'Module', 'Property', 'Unit', 'Value', 'Enum', 'Keyword',
  'Snippet', 'Color', 'File', 'Reference', 'Folder', 'EnumMember', 'Constant',
  'Struct', 'Event', 'Operator', 'TypeParameter',
];

export function lspKindToMonaco(monaco, kind) {
  const name = LSP_KIND_NAMES[(kind || 1) - 1] || 'Text';
  return monaco.languages.CompletionItemKind[name] ?? monaco.languages.CompletionItemKind.Text;
}

export function lspRangeToMonaco(range) {
  if (!range || !range.start) return null;
  return {
    startLineNumber: (range.start.line ?? 0) + 1,
    startColumn: (range.start.character ?? 0) + 1,
    endLineNumber: (range.end?.line ?? range.start.line ?? 0) + 1,
    endColumn: (range.end?.character ?? range.start.character ?? 0) + 1,
  };
}
