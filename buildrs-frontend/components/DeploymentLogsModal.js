import { useCallback, useEffect, useRef, useState } from 'react';
import {
  X, CheckCircle2, Circle, Loader2, XCircle, ExternalLink,
  AlertTriangle, ServerCrash, RefreshCw,
} from 'lucide-react';
import { apiFetch } from '../lib/api';

const POLL_MS = 2000;
const TERMINAL = ['success', 'failed', 'stopped'];
const STAGE_LABELS = {
  validation: 'File validation',
  prepare: 'Preparing files',
  build: 'Building image',
  deploy: 'Starting container',
  start: 'App failed to start',
  verify: 'Health check',
  platform: 'BuildrsHQ infrastructure',
};

function failureBlurb(deployment) {
  const stage = deployment.failureStage;
  if (deployment.fault === 'user') {
    switch (stage) {
      case 'validation':
        return 'A file in your project was rejected before we could build it. See the message below for the exact rule that failed.';
      case 'prepare':
        return 'We could not read your source files (repository or project fetch failed). Check the repository connection.';
      case 'build':
        return "Your build failed — your code, dependencies, or Dockerfile produced an error. That's not a BuildrsHQ problem: fix the error shown in the build log below.";
      case 'start':
      case 'verify':
        return 'Your app built fine but crashed or exited right after starting. See the runtime logs below for the crash output.';
      default:
        return 'The deployment failed because of something in your project. See the logs below.';
    }
  }
  if (deployment.fault === 'platform') {
    return 'This failure happened inside BuildrsHQ infrastructure — not your code. Please retry; if it keeps happening, contact support.';
  }
  return 'The deployment failed. See the logs below for details.';
}

function stepDuration(step) {
  if (!step.startedAt) return null;
  const end = step.finishedAt ? new Date(step.finishedAt).getTime() : Date.now();
  const secs = (end - new Date(step.startedAt).getTime()) / 1000;
  if (secs < 0) return null;
  return secs < 60 ? `${secs.toFixed(1)}s` : `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`;
}

function StepTimeline({ steps }) {
  if (!steps || !steps.length) return null;
  return (
    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', padding: '0.6rem 0.9rem' }}>
      {steps.map((s, i) => {
        const icon = s.status === 'running'
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : s.status === 'done'
            ? <CheckCircle2 className="w-3.5 h-3.5" />
            : s.status === 'failed'
              ? <XCircle className="w-3.5 h-3.5" />
              : <Circle className="w-3.5 h-3.5" />;
        const color = s.status === 'running' ? '#e5b84a'
          : s.status === 'done' ? '#28c840'
            : s.status === 'failed' ? '#f87171' : '#6e6e6e';
        const dur = stepDuration(s);
        return (
          <span
            key={s.name}
            title={s.detail || undefined}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
              padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.7rem',
              color, background: `${color}1f`, border: `1px solid ${color}44`,
              maxWidth: '14rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            {icon}
            <span style={{ textTransform: 'capitalize' }}>{s.name}</span>
            {dur && <span style={{ color: '#8c8c8c' }}>{dur}</span>}
            {i < steps.length - 1 && <span style={{ color: '#4a4a4a', marginLeft: '0.15rem' }}>→</span>}
          </span>
        );
      })}
    </div>
  );
}

export function DeploymentLogsModal({ deploymentId, onClose, onUpdate }) {
  const [deployment, setDeployment] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const [tab, setTab] = useState('build');
  const [autoScroll, setAutoScroll] = useState(true);
  const logRef = useRef(null);
  const statusRef = useRef(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const fetchDetail = useCallback(async () => {
    if (!deploymentId) return false;
    try {
      const data = await apiFetch(`/api/deployments/${deploymentId}`);
      if (data?.deployment) {
        statusRef.current = data.deployment.status;
        setDeployment(data.deployment);
        setFetchError(null);
        onUpdateRef.current?.(data.deployment);
      }
      return true;
    } catch (err) {
      setFetchError(err.message || 'Failed to load deployment');
      return false;
    }
  }, [deploymentId]);

  // Poll while the deploy is in flight; stop once it reaches a terminal state
  // or after repeated fetch failures (e.g. deleted deployment).
  useEffect(() => {
    let cancelled = false;
    let timer = null;
    let consecutiveErrors = 0;
    const tick = async () => {
      const ok = await fetchDetail();
      consecutiveErrors = ok ? 0 : consecutiveErrors + 1;
      if (cancelled || TERMINAL.includes(statusRef.current) || consecutiveErrors >= 5) return;
      timer = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [fetchDetail]);

  // Auto-scroll the log view while new output arrives (if pinned to bottom).
  const logText = tab === 'build' ? (deployment?.buildLogs || '') : (deployment?.runtimeLogs || '');
  useEffect(() => {
    const el = logRef.current;
    if (el && autoScroll) el.scrollTop = el.scrollHeight;
  }, [logText, tab, autoScroll]);

  const onLogScroll = () => {
    const el = logRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(nearBottom);
  };

  if (!deploymentId) return null;

  const status = deployment?.status || 'pending';
  const isOpen = deployment?.status === 'success' && deployment?.deployedUrl;
  const isFailed = status === 'failed';
  const inFlight = !TERMINAL.includes(status);
  const runningStep = (deployment?.steps || []).find(s => s.status === 'running');

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-navy-light border border-gray-700 rounded-xl w-full max-w-3xl shadow-2xl flex flex-col"
        style={{ maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.9rem 1.1rem', borderBottom: '1px solid #2a2f3a' }}>
          <span
            className="pill pill-mono"
            style={
              status === 'success' ? { background: 'rgba(52,211,153,0.12)', color: '#7bd197' } :
              status === 'failed' ? { background: 'rgba(248,113,113,0.12)', color: '#f87171' } :
              inFlight ? { background: 'rgba(229,184,74,0.12)', color: '#e5b84a' } :
              { background: 'rgba(255,255,255,0.06)', color: '#8c8c8c' }
            }
          >
            {status}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ color: '#d4d4d4', fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {deployment?.subdomain ? `${deployment.subdomain}.buildrshq.dev` : 'Deployment'}
            </div>
            <div style={{ color: '#6e6e6e', fontSize: '0.68rem' }}>
              {deployment?.runtime && deployment.runtime !== 'unknown' ? deployment.runtime : ''}
              {deployment?.metadata?.contextDir ? ` · context ${deployment.metadata.contextDir}` : ''}
              {inFlight && runningStep ? ` · ${runningStep.name} running…` : ''}
            </div>
          </div>
          {isOpen && (
            <a href={deployment.deployedUrl} target="_blank" rel="noreferrer" className="btn-workspace btn-secondary" style={{ textDecoration: 'none' }}>
              <ExternalLink className="w-3.5 h-3.5" /> Open app
            </a>
          )}
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Attribution banner */}
        {isFailed && deployment && (
          <div
            style={{
              display: 'flex', gap: '0.6rem', alignItems: 'flex-start',
              padding: '0.7rem 1.1rem',
              background: deployment.fault === 'platform' ? 'rgba(229,184,74,0.08)' : 'rgba(248,113,113,0.08)',
              borderBottom: '1px solid #2a2f3a',
            }}
          >
            {deployment.fault === 'platform'
              ? <ServerCrash className="w-4 h-4" style={{ color: '#e5b84a', flexShrink: 0, marginTop: 2 }} />
              : <AlertTriangle className="w-4 h-4" style={{ color: '#f87171', flexShrink: 0, marginTop: 2 }} />}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: deployment.fault === 'platform' ? '#e5b84a' : '#f87171' }}>
                {deployment.fault === 'platform'
                  ? 'BuildrsHQ infrastructure issue — not your code'
                  : `Your deployment failed in: ${STAGE_LABELS[deployment.failureStage] || deployment.failureStage || 'unknown stage'}`}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#a0a0a0', marginTop: 2 }}>{failureBlurb(deployment)}</div>
              {deployment.errorMessage && (
                <details style={{ marginTop: 6 }}>
                  <summary style={{ fontSize: '0.7rem', color: '#8c8c8c', cursor: 'pointer' }}>Error message</summary>
                  <pre style={{
                    marginTop: 6, fontSize: '0.68rem', color: '#e09292', whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word', maxHeight: '9rem', overflow: 'auto', background: '#0d1117',
                    padding: '0.5rem', borderRadius: 6,
                  }}>{deployment.errorMessage}</pre>
                </details>
              )}
            </div>
          </div>
        )}

        {/* Step timeline */}
        <StepTimeline steps={deployment?.steps} />

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.4rem', padding: '0 0.9rem 0.5rem' }}>
          {[['build', 'Build log'], ['runtime', 'Runtime logs']].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => { setTab(key); setAutoScroll(true); }}
              style={{
                padding: '0.3rem 0.8rem', fontSize: '0.72rem', borderRadius: 6, border: '1px solid',
                borderColor: tab === key ? '#2fd6e6' : '#2a2f3a',
                background: tab === key ? 'rgba(47,214,230,0.08)' : 'transparent',
                color: tab === key ? '#2fd6e6' : '#8c8c8c',
                cursor: 'pointer',
              }}
            >
              {label}
              {key === 'runtime' && deployment?.runtimeLogs ? ' ●' : ''}
            </button>
          ))}
          {inFlight && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto', fontSize: '0.7rem', color: '#6e6e6e' }}>
              <RefreshCw className="w-3 h-3 animate-spin" /> live
            </span>
          )}
        </div>

        {/* Log body */}
        <div style={{ flex: 1, minHeight: '14rem', padding: '0 0.9rem 0.9rem', display: 'flex' }}>
          <div ref={logRef} onScroll={onLogScroll} style={{
            flex: 1, background: '#0d1117', border: '1px solid #2a2f3a', borderRadius: 8,
            padding: '0.7rem 0.85rem', overflow: 'auto', maxHeight: '46vh',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: '0.7rem', lineHeight: 1.55, color: '#c9d1d9', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {!deployment && (fetchError ? `Error: ${fetchError}` : 'Loading deployment…')}
            {deployment && !logText && tab === 'build' && (
              inFlight ? 'Waiting for build output…' : 'No build output was captured for this deployment.'
            )}
            {deployment && !logText && tab === 'runtime' && (
              status === 'success'
                ? 'No runtime output yet — the app may still be starting up, or it logs nothing to stdout.'
                : 'No runtime logs — the container never started.'
            )}
            {logText}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DeploymentLogsModal;
