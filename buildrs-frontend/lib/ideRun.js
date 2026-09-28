// Run engine client: start a run and stream its SSE events (status/output/result).
import { apiFetch, API_BASE_URL } from './api';

// Languages the Run engine accepts, keyed by what detectLanguage() produces
// plus common extensions. Kept in sync with utils/ideRunner.js MANIFEST.
const RUNNABLE = new Set([
  'javascript', 'typescript', 'python', 'c', 'cpp', 'java', 'go', 'rust',
  'ruby', 'php', 'bash', 'shell', 'perl', 'r', 'csharp', 'dart', 'swift',
  'elixir', 'powershell', 'sql', 'lua', 'groovy',
  // extension spellings
  'js', 'jsx', 'ts', 'tsx', 'py', 'rs', 'rb', 'sh', 'pl', 'cs', 'ps1', 'ex',
]);

export function runLanguageFor(file) {
  const name = file?.name || '';
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  const lang = String(file?.language || '').toLowerCase();
  const candidates = [lang, ext];
  for (const c of candidates) {
    if (c && RUNNABLE.has(c)) return { language: c };
  }
  const shown = lang || ext || 'text';
  return {
    error: `No run configuration for '${shown}' files`,
  };
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
