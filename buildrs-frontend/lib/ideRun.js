// Run engine client: start a run and stream its SSE events (status/output/result).
import { apiFetch, API_BASE_URL } from './api';

// Run engine language ids (utils/ideRunner.js MANIFEST) plus their aliases.
// The backend also accepts language:'auto' and detects from extension/shebang,
// so unknown file types are never blocked here — we ask the server to figure
// it out instead of refusing to run (requirement: any file type must be tryable).
const LANG_IDS = new Set([
  'javascript', 'typescript', 'python', 'c', 'cpp', 'java', 'go', 'rust',
  'ruby', 'php', 'bash', 'shell', 'perl', 'r', 'csharp', 'dart', 'swift',
  'elixir', 'powershell', 'sql', 'lua', 'groovy',
  'kotlin', 'scala', 'haskell', 'julia',
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'rb', 'sh', 'pl', 'cs',
  'ps1', 'ex', 'exs', 'pwsh', 'rs',
  'kt', 'kts', 'sc', 'hs', 'lhs', 'jl',
]);

// Extension → run engine language id.
const EXT_TO_LANG = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', pyw: 'python',
  c: 'c', h: 'c',
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', csx: 'cpp',
  java: 'java', go: 'go', rs: 'rust', rb: 'ruby', php: 'php',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  pl: 'perl', r: 'r', cs: 'csharp', dart: 'dart', swift: 'swift',
  ex: 'elixir', exs: 'elixir', ps1: 'powershell',
  sql: 'sql', lua: 'lua', groovy: 'groovy',
  kt: 'kotlin', kts: 'kotlin',
  scala: 'scala', sc: 'scala',
  hs: 'haskell', lhs: 'haskell',
  jl: 'julia',
};

export function runLanguageFor(file) {
  const name = file?.name || '';
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  const lang = String(file?.language || '').toLowerCase();

  if (lang && LANG_IDS.has(lang)) return { language: lang };
  if (ext && EXT_TO_LANG[ext]) return { language: EXT_TO_LANG[ext] };
  if (ext && LANG_IDS.has(ext)) return { language: ext };
  if (lang && EXT_TO_LANG[lang]) return { language: EXT_TO_LANG[lang] };

  // Unknown type: let the backend detect from extension/shebang/entry file.
  return { language: 'auto' };
}

export async function startRun(payload) {
  return apiFetch('/api/ide/run', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Subscribe to a run's SSE stream.
 * onEvent(event, data) receives: status | output | result | end
 * Returns { done, abort } — done resolves when the stream closes.
 */
export function streamRun(runId, onEvent) {
  const controller = new AbortController();
  const done = (async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
    const res = await fetch(`${API_BASE_URL}/api/ide/run/${runId}/stream`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Accept: 'text/event-stream',
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(res.status === 404 ? 'Run not found' : `Run stream failed (${res.status})`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done: streamDone } = await reader.read();
      if (streamDone) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        let event = 'message';
        let data = '';
        for (const line of frame.split('\n')) {
          if (line.startsWith(':')) continue; // heartbeat comment
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data += line.slice(5).trim();
        }
        if (!data) continue;
        try {
          onEvent(event, JSON.parse(data));
        } catch (_) { /* ignore malformed frame */ }
      }
    }
  })();
  return {
    done,
    abort: () => controller.abort(),
  };
}
