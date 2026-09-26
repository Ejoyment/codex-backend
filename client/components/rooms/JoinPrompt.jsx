// Phase 3 — JoinPrompt: host consent dialog showing exactly what will be shared.
export default function JoinPrompt({ roomMeta, onApprove, onDeny }) {
  const shared = roomMeta?.willShare || [
    'Live terminal output (host-owned stream)',
    'Last parsed stack trace',
    'Open file names + cursor positions (contents via collaborative sync)',
    'Current git branch + diff (capped)',
    'Only environment variables you explicitly share, one at a time',
  ];
  return (
    <div role="dialog" aria-modal="true" aria-label="Debug room join request" className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" data-testid="join-prompt">
      <div className="bg-navy-light border border-gray-700 rounded-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold mb-1">Join debug room?</h2>
        <p className="text-sm text-gray-400 mb-4">
          <span className="text-gray-200 font-medium">{roomMeta?.guestName || 'A teammate'}</span> wants to view your workspace.
          Exactly what will be shared:
        </p>
        <ul className="text-sm text-gray-300 list-disc pl-5 mb-4 space-y-1">
          {shared.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <p className="text-xs text-amber-300/90 mb-4">
          Guests are read-only by default. Secrets (keys, tokens, passwords) are never shared unless you share one variable at a time.
        </p>
        <div className="flex gap-3">
          <button type="button" onClick={onDeny} className="flex-1 px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm">Deny</button>
          <button type="button" onClick={onApprove} className="flex-1 px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm font-semibold">Allow (read-only)</button>
        </div>
      </div>
    </div>
  );
}
