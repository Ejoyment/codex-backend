// Phase 3 — ControlRequestToast: non-blocking toast for host to grant/revoke control.
export default function ControlRequestToast({ request, onGrant, onDeny, onDismiss }) {
  if (!request) return null;
  return (
    <div role="alert" aria-live="polite" className="fixed bottom-4 right-4 z-50 bg-navy-light border border-gray-600 rounded-lg p-4 max-w-sm shadow-xl" data-testid="control-request-toast">
      <p className="text-sm mb-1">
        <span className="font-semibold">{request.userName || request.userId}</span> requests control
      </p>
      <p className="text-xs text-gray-400 mb-3">Granting lets them type in the shared terminal. You can revoke instantly.</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => onGrant?.(request)} className="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 font-semibold">Grant control</button>
        <button type="button" onClick={() => onDeny?.(request)} className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600">Deny</button>
        <button type="button" onClick={() => onDismiss?.(request)} aria-label="Dismiss" className="text-xs px-2 py-1.5 text-gray-400 hover:text-white">✕</button>
      </div>
    </div>
  );
}
