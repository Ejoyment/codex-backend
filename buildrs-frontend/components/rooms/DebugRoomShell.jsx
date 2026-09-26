import { useEffect, useRef, useState } from 'react';

// Phase 3 — DebugRoomShell: shared terminal + stack trace panel + file tabs + participant strip.
// Ambient, non-blocking: an active room session never blocks the user's own editing.

export default function DebugRoomShell({ room, role = 'viewer', socket, terminalChunks = [], stackTrace = null, openFiles = [], participants = [], degraded = null, onRequestControl, onClose }) {
  const [activeFile, setActiveFile] = useState(openFiles?.[0]?.path || null);
  const termRef = useRef(null);

  useEffect(() => {
    setActiveFile((prev) => prev || openFiles?.[0]?.path || null);
  }, [openFiles]);

  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [terminalChunks]);

  const readOnly = role !== 'host' && role !== 'controller';

  return (
    <div className="debug-room-shell" data-testid="debug-room-shell" aria-label="Debug room">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold">Debug Room</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300" title="Your permission in this room">
            {role}
          </span>
          {degraded && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300" title={degraded.reason || 'Degraded'}>
              {degraded.label || 'Degraded'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {readOnly && onRequestControl && (
            <button type="button" className="text-xs px-3 py-1 rounded bg-gray-700 hover:bg-gray-600" onClick={onRequestControl}>
              Request control
            </button>
          )}
          {onClose && (
            <button type="button" className="text-xs px-3 py-1 rounded bg-red-600/80 hover:bg-red-600" onClick={onClose}>
              Leave
            </button>
          )}
        </div>
      </div>

      {/* Participant strip — ambient presence, never blocks editing */}
      <div className="flex items-center gap-2 px-4 py-1.5 overflow-x-auto" aria-label="Participants">
        {(participants || []).map((p) => (
          <span key={String(p.userId || p.id)} className="flex items-center gap-1 text-xs text-gray-300" title={`${p.name || p.userId} (${p.role || 'viewer'})`}>
            <span className="w-2 h-2 rounded-full" style={{ background: p.color || '#3b82f6' }} />
            {p.name || String(p.userId).slice(0, 6)}
            {p.speaking && <span aria-label="speaking">🔊</span>}
            {p.muted && <span aria-label="muted">🔇</span>}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 border-t border-gray-700">
        {/* Shared terminal (host-owned ordered stream mirror) */}
        <div className="p-3 border-b lg:border-b-0 lg:border-r border-gray-700">
          <h3 className="text-xs font-semibold text-gray-400 mb-2">Shared terminal {readOnly && '(read-only)'}</h3>
          <div ref={termRef} className="bg-black rounded p-2 h-64 overflow-y-auto font-mono text-xs text-green-300" data-testid="room-terminal">
            {(terminalChunks || []).map((c) => (
              <span key={c.seq}>{c.chunk}</span>
            ))}
          </div>
        </div>

        {/* Stack trace panel */}
        <div className="p-3">
          <h3 className="text-xs font-semibold text-gray-400 mb-2">Stack trace</h3>
          <pre className="bg-navy-light rounded p-2 h-32 overflow-auto text-xs text-red-300" data-testid="room-stack">
            {stackTrace ? (Array.isArray(stackTrace) ? stackTrace.join('\n') : stackTrace) : 'No stack trace shared.'}
          </pre>

          {/* File tabs — contents sync via Yjs; cursors shown ambiently */}
          <h3 className="text-xs font-semibold text-gray-400 mt-3 mb-2">Open files</h3>
          <div className="flex gap-1 flex-wrap" role="tablist" aria-label="Shared files">
            {(openFiles || []).map((f) => (
              <button
                key={f.path}
                role="tab"
                aria-selected={activeFile === f.path}
                type="button"
                onClick={() => setActiveFile(f.path)}
                className={`text-xs px-2 py-1 rounded ${activeFile === f.path ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
              >
                {f.path.split('/').pop()}
              </button>
            ))}
            {(openFiles || []).length === 0 && <span className="text-xs text-gray-500">No files shared.</span>}
          </div>
          {activeFile && (
            <p className="text-xs text-gray-500 mt-1">Viewing: {activeFile} (edits stay in your own editor)</p>
          )}
        </div>
      </div>
    </div>
  );
}
