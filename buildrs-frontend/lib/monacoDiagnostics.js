// Diagnostics helpers: normalize Monaco markers for the Problems panel and
// apply compiler/run diagnostics back onto the model as markers.

export function normalizeMarkers(monaco, model) {
  if (!monaco || !model) return [];
  let markers = [];
  try {
    markers = monaco.editor.getModelMarkers({ resource: model.uri }) || [];
  } catch (_) {
    return [];
  }
  const sev = monaco.MarkerSeverity;
  return markers
    .map((m) => ({
      severity: m.severity === sev.Error ? 'error' : m.severity === sev.Warning ? 'warning' : 'info',
      line: m.startLineNumber,
      column: m.startColumn,
      endLine: m.endLineNumber,
      endColumn: m.endColumn,
      message: m.message,
      source: m.source || '',
      code: typeof m.code === 'object' ? String(m.code?.value || '') : String(m.code || ''),
      owner: m.owner || '',
      file: null, // model-scoped markers belong to the active file
    }))
    .sort((a, b) => a.line - b.line || a.column - b.column);
}

export function countProblems(list) {
  const counts = { error: 0, warning: 0, info: 0 };
  (list || []).forEach((p) => {
    if (p.severity === 'error') counts.error += 1;
    else if (p.severity === 'warning') counts.warning += 1;
    else counts.info += 1;
  });
  return counts;
}

// Map run/compiler diagnostics (from POST /api/ide/run) onto the active
// model so they show as squiggles + in the Problems panel. Clears previous
// 'ide-run' markers when called with an empty list.
export function setRunProblems(monaco, model, problems) {
  if (!monaco || !model) return;
  const sev = monaco.MarkerSeverity;
  const markers = (problems || [])
    .filter((p) => p && p.message)
    .map((p) => ({
      severity: p.severity === 'warning' ? sev.Warning : p.severity === 'info' ? sev.Info : sev.Error,
      message: p.message,
      startLineNumber: Math.max(1, p.line || 1),
      startColumn: Math.max(1, p.column || 1),
      endLineNumber: Math.max(1, p.endLine || p.line || 1),
      endColumn: Math.max(1, p.endColumn || (p.column ? p.column + 1 : 1)),
      source: p.file ? `${p.file} (run)` : 'run',
    }));
  monaco.editor.setModelMarkers(model, 'ide-run', markers);
}

export default { normalizeMarkers, countProblems, setRunProblems };
