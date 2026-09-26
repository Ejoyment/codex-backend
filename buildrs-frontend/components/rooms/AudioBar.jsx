// Phase 3 — AudioBar: mute/deafen/speaking indicators (ambient, non-blocking).
export default function AudioBar({ muted = false, deafened = false, speaking = false, lowBandwidth = false, onToggleMute, onToggleDeafen }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-navy-light border border-gray-700" aria-label="Audio controls" data-testid="audio-bar">
      <span
        className={`w-2.5 h-2.5 rounded-full ${speaking && !muted ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`}
        title={speaking ? 'Speaking' : 'Silent'}
        aria-label={speaking ? 'speaking' : 'silent'}
      />
      <button type="button" onClick={onToggleMute} aria-pressed={muted} title={muted ? 'Unmute' : 'Mute'} className="text-sm px-2 py-1 rounded bg-gray-700 hover:bg-gray-600">
        {muted ? '🔇 Unmute' : '🎙️ Mute'}
      </button>
      <button type="button" onClick={onToggleDeafen} aria-pressed={deafened} title={deafened ? 'Undeafen' : 'Deafen'} className="text-sm px-2 py-1 rounded bg-gray-700 hover:bg-gray-600">
        {deafened ? '🔈 Undeafen' : '🔕 Deafen'}
      </button>
      {lowBandwidth && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300" title="Low bandwidth: audio-only mode">
          Audio-only
        </span>
      )}
    </div>
  );
}
