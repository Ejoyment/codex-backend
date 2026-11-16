import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  FileCode2,
  GitMerge,
  Loader2,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Terminal,
  Wrench,
  X,
} from 'lucide-react';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { useCurrentCompany } from '../hooks/useCurrentCompany';
import { agentApi, apiFetch } from '../lib/api';
import { useCachedData } from '../hooks/useCachedData';
import s from '../styles/AiAgents.module.css';

const MODEL_PREFERENCE_KEY = 'buildrs-ai-model-preference';

const STATUS_META = {
  queued: { label: 'Queued', tone: 'neutral' },
  idle: { label: 'Idle', tone: 'neutral' },
  running: { label: 'Running', tone: 'running' },
  awaiting_review: { label: 'Awaiting review', tone: 'review' },
  awaiting_approval: { label: 'Awaiting review', tone: 'review' },
  approving: { label: 'Merging', tone: 'review' },
  approved: { label: 'Merged', tone: 'merged' },
  completed: { label: 'Merged', tone: 'merged' },
  rejected: { label: 'Rejected', tone: 'rejected' },
  cancelled: { label: 'Stopped', tone: 'rejected' },
  failed: { label: 'Failed', tone: 'rejected' },
};

const TONE_CLASS = {
  running: s.statusRunning,
  review: s.statusReview,
  merged: s.statusMerged,
  rejected: s.statusRejected,
  neutral: s.statusNeutral,
};

const REVIEWABLE = ['awaiting_review', 'awaiting_approval'];

function statusMeta(status) {
  return STATUS_META[status] || { label: status || 'Unknown', tone: 'neutral' };
}

function formatDuration(start, end) {
  if (!start) return '—';
  const from = new Date(start).getTime();
  const to = end ? new Date(end).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((to - from) / 1000));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m ${seconds % 60}s`;
}

function formatClock(value) {
  if (!value) return '--:--:--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--:--';
  return date.toLocaleTimeString([], { hour12: false });
}

function formatWhen(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function endOf(execution) {
  return execution?.completedAt || execution?.approvedAt || execution?.rejectedAt || null;
}

function progressOf(execution) {
  const meta = execution?.metadata || {};
  const raw = meta.progress ?? meta.percent ?? meta.completion;
  const value = Number(raw);
  if (Number.isFinite(value)) return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
  const status = execution?.status;
  if (['awaiting_review', 'awaiting_approval', 'approved', 'completed', 'rejected', 'failed'].includes(status)) return 100;
  return null;
}

function filesOf(execution) {
  const byPath = new Map();
  for (const change of execution?.proposedChanges || []) {
    if (!change?.path) continue;
    byPath.set(change.path, {
      path: change.path,
      action: change.action || 'modified',
      content: change.content || '',
      diff: '',
    });
  }
  for (const file of execution?.filesChanged || []) {
    if (!file?.path) continue;
    const current = byPath.get(file.path) || { path: file.path, action: 'modified', content: '', diff: '' };
    byPath.set(file.path, {
      ...current,
      action: file.action || current.action,
      diff: file.diff || current.diff,
    });
  }
  return [...byPath.values()];
}

function normalizeAction(action) {
  const value = String(action || '').toLowerCase();
  if (['created', 'added', 'add', 'new'].includes(value)) return 'created';
  if (['deleted', 'removed', 'delete'].includes(value)) return 'deleted';
  return 'modified';
}

function splitUnifiedDiff(diff) {
  const original = [];
  const working = [];
  for (const line of String(diff || '').split('\n')) {
    if (
      line.startsWith('@@') ||
      line.startsWith('---') ||
      line.startsWith('+++') ||
      line.startsWith('diff ') ||
      line.startsWith('index ') ||
      line.startsWith('new file') ||
      line.startsWith('deleted file')
    ) {
      continue;
    }
    if (line.startsWith('+')) working.push(line.slice(1));
    else if (line.startsWith('-')) original.push(line.slice(1));
    else if (line.startsWith(' ')) {
      original.push(line.slice(1));
      working.push(line.slice(1));
    } else {
      original.push(line);
      working.push(line);
    }
  }
  return { original, working };
}

function terminalRows(execution) {
  // terminalLog is the richer stream; logs is the older plain twin. Prefer it
  // when present so worker messages are not printed twice.
  const source = execution?.terminalLog?.length
    ? execution.terminalLog.map((entry) => ({ timestamp: entry?.timestamp, type: entry?.type, message: entry?.message || '' }))
    : (execution?.logs || []).map((entry) => ({ timestamp: entry?.timestamp, type: 'log', message: entry?.message || '' }));
  return source
    .filter((entry) => Boolean(entry.message))
    .sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
}

function terminalTone(type) {
  const value = String(type || '').toLowerCase();
  if (value.includes('error') || value.includes('fail')) return s.terminalError;
  if (value.includes('valid') || value.includes('warn') || value.includes('check')) return s.terminalWarn;
  if (value.includes('creat') || value.includes('success') || value.includes('start') || value.includes('batch')) return s.terminalSuccess;
  return '';
}

function canonicalCheckStatus(value) {
  const status = String(value || '').toLowerCase();
  if (status === 'passed' || status === 'pass' || status === 'success') return 'passed';
  if (status === 'failed' || status === 'fail' || status === 'error') return 'failed';
  if (status === 'running') return 'running';
  return 'not_evaluated';
}

function validationRows(result) {
  if (!result) return [];
  const rows = [];
  if (Array.isArray(result.checks)) {
    for (const check of result.checks) {
      const passed = check?.passed ?? check?.ok;
      const status = passed === true ? 'passed' : passed === false ? 'failed' : canonicalCheckStatus(check?.status);
      rows.push({
        label: check?.label || check?.name || 'Check',
        detail: check?.detail || check?.message || '',
        status,
      });
    }
  }
  if (Array.isArray(result.errors)) {
    for (const error of result.errors.slice(0, 8)) {
      rows.push({
        label: error?.file || error?.path || 'Validation error',
        detail: error?.message || String(error),
        status: 'failed',
      });
    }
  }
  if (result.command) {
    rows.push({
      label: 'Command validation',
      detail: result.command.reason || result.command.command || '',
      status: canonicalCheckStatus(result.command.status),
    });
  }
  if (Array.isArray(result.specs)) {
    for (const spec of result.specs) {
      if (spec?.success === false) {
        rows.push({
          label: `Spec: ${spec?.title || 'Specification'}`,
          detail: spec?.error || 'Verification could not run.',
          status: 'not_evaluated',
        });
        continue;
      }
      const requirements = Array.isArray(spec?.requirements) ? spec.requirements : [];
      const legacy = Array.isArray(spec?.results) ? spec.results : [];
      const statuses = requirements.length
        ? requirements.map((item) => canonicalCheckStatus(item?.status))
        : legacy.map((item) => (item?.passed === true ? 'passed' : item?.passed === false ? 'failed' : canonicalCheckStatus(item?.status)));
      const passedCount = statuses.filter((status) => status === 'passed').length;
      const failedCount = statuses.filter((status) => status === 'failed').length;
      const notEvaluatedCount = statuses.filter((status) => status === 'not_evaluated').length;
      const verdict = spec?.verdict || (failedCount ? 'fail' : notEvaluatedCount ? 'not_evaluated' : statuses.length ? 'pass' : 'not_evaluated');
      const status = verdict === 'fail' ? 'failed' : verdict === 'pass' ? 'passed' : 'not_evaluated';
      rows.push({
        label: `Spec: ${spec?.title || spec?.name || spec?.specTitle || 'Specification'}`,
        detail: statuses.length
          ? `${passedCount} passed · ${failedCount} failed · ${notEvaluatedCount} not evaluated`
          : spec?.reason || 'No executable requirements',
        status,
      });
    }
  }
  return rows;
}

function ResultPill({ status }) {
  const value = canonicalCheckStatus(status);
  const label = value === 'passed'
    ? 'Passed'
    : value === 'failed'
      ? 'Failed'
      : value === 'running'
        ? 'Running'
        : 'Not evaluated';
  const className = label === 'Passed'
    ? s.statusMerged
    : label === 'Failed'
      ? s.statusRejected
      : label === 'Running'
        ? s.statusRunning
        : s.statusNeutral;
  return <span className={`${s.statusPill} ${className}`}>{label}</span>;
}

function CodeColumn({ title, lines, tone }) {
  return (
    <div>
      <p className={s.diffColumnLabel}>{title}</p>
      <div className={s.codeBox}>
        {lines && lines.length ? (
          lines.map((line, index) => (
            <div
              key={`${index}-${line}`}
              className={`${s.codeLine} ${tone === 'added' ? s.lineAdded : tone === 'removed' ? s.lineRemoved : ''}`}
            >
              <span className={s.lineNumber}>{index + 1}</span>
              <span>{line || ' '}</span>
            </div>
          ))
        ) : (
          <div className={s.codeEmpty}>No previous version to display</div>
        )}
      </div>
    </div>
  );
}

function SessionRow({ execution, onOpen }) {
  const meta = statusMeta(execution.status);
  const progress = progressOf(execution);
  const running = ['queued', 'running', 'approving'].includes(execution.status);
  return (
    <button type="button" className={s.sessionRow} onClick={() => onOpen(execution._id)}>
      <div>
        <p className={s.sessionName}>{execution.taskTitle || 'Untitled session'}</p>
        <p className={s.sessionBranch}>{execution.branch || 'Branch pending'}</p>
      </div>
      <div>
        <span className={`${s.statusPill} ${TONE_CLASS[meta.tone]}`}>{meta.label}</span>
      </div>
      <div className={s.progressWrap}>
        <span className={s.progressText}>{progress === null ? '—' : `${progress}%`}</span>
        <span className={s.progressTrack}>
          {progress === null ? (
            <span className={s.progressIndeterminate} />
          ) : (
            <span
              className={`${s.progressFill} ${running ? s.progressFillRunning : ''} ${meta.tone === 'merged' ? s.progressFillMerged : ''}`}
              style={{ width: `${progress}%` }}
            />
          )}
        </span>
      </div>
      <span className={s.muted}>{formatDuration(execution.startedAt || execution.createdAt, endOf(execution))}</span>
      <ChevronRight size={16} className={s.chevron} />
    </button>
  );
}

function ModelPicker({ current, onClose, onSave }) {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(current);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await apiFetch('/api/ai-pair/providers');
        if (!active) return;
        setProviders(data.providers || []);
      } catch (err) {
        if (active) setError(err.message || 'Could not load AI models');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return (
    <div className={s.pickerBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={s.picker} role="dialog" aria-modal="true" aria-label="Change AI model">
        <div className={s.panelHead} style={{ padding: 0 }}>
          <div>
            <h2 className={s.pickerTitle}>Change AI Model</h2>
            <p className={s.pickerSub}>The model is used for new sessions and retained runs.</p>
          </div>
          <button type="button" className={s.button} onClick={onClose} aria-label="Close model picker" style={{ height: 34, padding: '0 10px' }}>
            <X size={15} />
          </button>
        </div>
        {error && <p className={s.alert}>{error}</p>}
        {loading ? (
          <div className={s.stateBlock}><Loader2 size={22} className={s.spinner} /></div>
        ) : (
          providers.map((provider) => {
            const models = provider.type === 'cloud' ? [provider.model] : provider.models || [];
            return (
              <div key={provider.key} className={s.providerGroup}>
                <p className={s.providerName}>{provider.name || provider.key}</p>
                {models.filter(Boolean).map((model) => {
                  const selected = draft?.provider === provider.key && draft?.model === model;
                  return (
                    <button
                      key={`${provider.key}-${model}`}
                      type="button"
                      className={`${s.modelOption} ${selected ? s.modelOptionActive : ''}`}
                      onClick={() => setDraft({ provider: provider.key, model })}
                    >
                      <span style={{ flex: 1 }}>{model}</span>
                      {selected && <CheckCircle2 size={15} color="#12dce5" />}
                    </button>
                  );
                })}
              </div>
            );
          })
        )}
        {!loading && !error && !providers.length && <p className={s.muted}>No AI providers are configured.</p>}
        <div className={s.formActions}>
          <button type="button" className={s.button} onClick={onClose}>Cancel</button>
          <button type="button" className={s.buttonPrimary} disabled={!draft} onClick={() => draft && onSave(draft)}>Use model</button>
        </div>
      </div>
    </div>
  );
}

function StartSession({ initialTitle, model, company, onBack, onStarted, onOpenModelPicker }) {
  const [name, setName] = useState(initialTitle || '');
  const [prompt, setPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Give the session a name so you can find it later.');
      return;
    }
    if (!prompt.trim()) {
      setError('Describe what you want the agent to build or fix.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        taskTitle: name.trim(),
        summary: prompt.trim(),
      };
      if (model?.provider && model?.model) {
        payload.provider = model.provider;
        payload.model = model.model;
      }
      if (company?._id) payload.workspaceId = company._id;
      const data = await agentApi.delegate(payload);
      const execution = data.execution || {};
      await onStarted(execution._id || execution.id);
    } catch (err) {
      setError(err.message || 'The session could not be started.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button type="button" className={s.backLink} onClick={onBack}>
        <ArrowLeft size={18} /> Back to overview
      </button>
      <h1 className={s.detailTitle}>Start your first Session</h1>
      <p className={s.subtitle}>Give your agent a clear task. You can review every change before merging.</p>

      <form className={s.formCard} onSubmit={submit}>
        <h2 className={s.formTitle}>Session details</h2>
        <p className={s.formSub}>The agent works on a new branch. Nothing is merged without your approval.</p>
        {error && <p className={s.alert}>{error}</p>}

        <label className={s.field}>
          <span className={s.fieldLabel}>Session name</span>
          <input
            className={s.input}
            value={name}
            maxLength={150}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Add API rate limiting"
            autoFocus
          />
          <p className={s.counter}>{name.length}/150</p>
        </label>

        <label className={s.field}>
          <span className={s.fieldLabel}>What do you want to build or fix?</span>
          <textarea
            className={s.textarea}
            value={prompt}
            maxLength={4000}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe the goal, expected behavior, and any requirements..."
          />
          <p className={s.counter}>{prompt.length}/4000</p>
        </label>

        <div className={s.fieldRow}>
          <div className={s.field}>
            <span className={s.fieldLabel}>Repository</span>
            <div className={s.input} style={{ color: '#9ab0ba' }}>
              {company?.name || 'Personal workspace'}
            </div>
            <p className={s.hint}>The agent reads the codebase in this workspace.</p>
          </div>
          <div className={s.field}>
            <span className={s.fieldLabel}>Base branch</span>
            <div className={s.input} style={{ color: '#9ab0ba' }}>main</div>
            <p className={s.hint}>Sessions start from main and never merge on their own.</p>
          </div>
        </div>

        <div className={s.field}>
          <span className={s.fieldLabel}>AI Model</span>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className={s.input} style={{ flex: 1, minWidth: 220, color: '#dcebf1' }}>
              {model ? model.model : 'Provider default'}
            </div>
            <button type="button" className={`${s.button} ${s.buttonSmall}`} onClick={onOpenModelPicker}>
              <Settings2 size={14} /> Change
            </button>
          </div>
        </div>

        <div className={s.formActions}>
          <button type="button" className={s.button} onClick={onBack} disabled={submitting}>Cancel</button>
          <button type="submit" className={s.buttonPrimary} disabled={submitting}>
            {submitting ? <Loader2 size={16} className={s.spinner} /> : null}
            {submitting ? 'Starting…' : 'Begin Session'}
          </button>
        </div>
      </form>
    </>
  );
}

function SessionDetail({ execution, tab, onTab, onBack, onTweak, onRefresh, onNewSession, busy, notice, error, onApprove, onReject, onCancel }) {
  const [selectedPath, setSelectedPath] = useState('');
  const [confirmReject, setConfirmReject] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const meta = statusMeta(execution.status);
  const reviewable = REVIEWABLE.includes(execution.status);
  const running = ['queued', 'running', 'approving'].includes(execution.status);
  // Stop is not offered while a merge is in flight (`approving`): cancelling
  // then would race the branch cleanup against the merge.
  const stoppable = ['queued', 'running'].includes(execution.status);
  const merged = ['approved', 'completed'].includes(execution.status);
  const rejected = execution.status === 'rejected';
  const cancelled = execution.status === 'cancelled';
  const files = useMemo(() => filesOf(execution), [execution]);
  const selectedFile = files.find((file) => file.path === selectedPath) || files[0] || null;
  const logs = useMemo(() => terminalRows(execution), [execution]);
  const checks = useMemo(() => validationRows(execution.validationResult), [execution.validationResult]);
  const failedChecks = checks.filter((check) => String(check.status).toLowerCase() === 'failed').length;
  const passedChecks = checks.filter((check) => ['passed', 'success'].includes(String(check.status).toLowerCase())).length;
  const notEvaluatedChecks = checks.filter((check) => String(check.status).toLowerCase() === 'not_evaluated').length;
  const validationLabel = running
    ? 'In progress'
    : failedChecks
      ? 'Blocked'
      : !checks.length
        ? 'Pending'
        : notEvaluatedChecks
          ? 'Needs evaluation'
          : 'All checks passed';
  const progress = progressOf(execution);

  useEffect(() => {
    if (files.length && !files.some((file) => file.path === selectedPath)) {
      setSelectedPath(files[0].path);
    }
  }, [execution._id, files, selectedPath]);

  const diffData = useMemo(() => {
    if (!selectedFile) return { original: null, working: [] };
    if (selectedFile.diff) return splitUnifiedDiff(selectedFile.diff);
    if (selectedFile.content) {
      return {
        original: normalizeAction(selectedFile.action) === 'created' ? null : null,
        working: selectedFile.content.split('\n'),
      };
    }
    return { original: null, working: [] };
  }, [selectedFile]);

  const fileCount = files.length || execution.diffSummary?.filesChanged || 0;

  return (
    <>
      <button type="button" className={s.backLink} onClick={onBack}>
        <ArrowLeft size={18} /> Back to sessions
      </button>

      <div className={s.detailHead}>
        <div>
          <h1 className={s.detailTitle}>{execution.taskTitle || 'Untitled session'}</h1>
          <p className={s.detailSub}>
            {execution.taskId ? `${String(execution.taskId).slice(-8).toUpperCase()} · ` : ''}
            {execution.branch || 'Branch pending'}
          </p>
        </div>
        <div className={s.detailActions}>
          {reviewable && (
            <>
              <button type="button" className={s.buttonPrimary} onClick={onApprove} disabled={busy}>
                {busy ? <Loader2 size={16} className={s.spinner} /> : <GitMerge size={16} />}
                Approve &amp; Merge
              </button>
              <button type="button" className={s.button} onClick={onTweak} disabled={busy}>
                <Wrench size={15} /> Tweak
              </button>
              <button type="button" className={s.buttonDanger} onClick={() => setConfirmReject(true)} disabled={busy}>
                Reject
              </button>
            </>
          )}
          {stoppable && (
            <button type="button" className={s.buttonDanger} onClick={() => setConfirmCancel(true)} disabled={busy}>
              <X size={15} /> Stop Session
            </button>
          )}
          {!reviewable && (merged || rejected || cancelled) && (
            <button type="button" className={s.buttonPrimary} onClick={onNewSession}>
              <Sparkles size={15} /> Start New Session
            </button>
          )}
          {!reviewable && !merged && !rejected && !cancelled && (
            <button type="button" className={s.button} onClick={onRefresh} disabled={busy}>
              <RefreshCw size={15} /> Refresh
            </button>
          )}
        </div>
      </div>

      {confirmCancel && (
        <div className={`${s.alertInfo} ${s.savedNote}`} style={{ marginTop: 18 }}>
          <strong style={{ display: 'block', marginBottom: 8 }}>Stop this session?</strong>
          Work in progress is discarded and the agent branch is cleaned up. This cannot be undone.
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button type="button" className={s.button} onClick={() => setConfirmCancel(false)} disabled={busy}>Keep running</button>
            <button
              type="button"
              className={s.buttonDanger}
              disabled={busy}
              onClick={async () => {
                setConfirmCancel(false);
                await onCancel();
              }}
            >
              Stop session
            </button>
          </div>
        </div>
      )}

      {cancelled && (
        <div className={`${s.alertInfo} ${s.savedNote}`} style={{ marginTop: 18 }}>
          <strong style={{ display: 'block', marginBottom: 4 }}>Session stopped</strong>
          The agent is no longer working on this session.
        </div>
      )}

      {confirmReject && (
        <div className={`${s.alertInfo} ${s.savedNote}`} style={{ marginTop: 18 }}>
          <strong style={{ display: 'block', marginBottom: 8 }}>Reject this session?</strong>
          The agent branch is discarded and the task is rolled back. This cannot be undone.
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button type="button" className={s.button} onClick={() => setConfirmReject(false)} disabled={busy}>Cancel</button>
            <button
              type="button"
              className={s.buttonDanger}
              disabled={busy}
              onClick={async () => {
                setConfirmReject(false);
                await onReject();
              }}
            >
              Reject session
            </button>
          </div>
        </div>
      )}

      {notice && <p className={s.alertSuccess}>{notice}</p>}
      {error && <p className={s.alert}>{error}</p>}

      <div className={s.metaStrip}>
        <div>
          <p className={s.metaStripLabel}>Status</p>
          <p className={s.metaStripValue} style={{ color: meta.tone === 'running' ? '#e5b84a' : meta.tone === 'review' ? '#12dce5' : meta.tone === 'merged' ? '#30d158' : meta.tone === 'rejected' ? '#ff8189' : '#e8f3f7' }}>
            {meta.label}
          </p>
        </div>
        <div>
          <p className={s.metaStripLabel}>Model</p>
          <p className={s.metaStripValue}>{execution.model || '—'}</p>
        </div>
        <div>
          <p className={s.metaStripLabel}>Duration</p>
          <p className={s.metaStripValue}>{formatDuration(execution.startedAt || execution.createdAt, endOf(execution))}</p>
        </div>
        <div>
          <p className={s.metaStripLabel}>Files changed</p>
          <p className={s.metaStripValue}>{fileCount}</p>
        </div>
        <div>
          <p className={s.metaStripLabel}>Progress</p>
          <div className={s.progressWrap}>
            <span className={s.metaStripValue} style={{ minWidth: 42 }}>
              {progress === null ? (cancelled ? '—' : 'In progress') : `${progress}%`}
            </span>
            {!(cancelled && progress === null) && (
              <span className={s.progressTrack}>
                {progress === null ? (
                  <span className={s.progressIndeterminate} />
                ) : (
                  <span
                    className={`${s.progressFill} ${running ? s.progressFillRunning : ''} ${meta.tone === 'merged' ? s.progressFillMerged : ''}`}
                    style={{ width: `${progress}%` }}
                  />
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      {rejected && (
        <>
          <div className={s.rejectedBanner}>
            <h2>Session Rejected</h2>
            <p>These changes were not merged. Your main branch is unchanged.</p>
            <p>The session remains available for reference.</p>
          </div>
          <section className={s.panelFlat}>
            <h2 className={s.terminalTitle} style={{ fontSize: 22, marginBottom: 12 }}>What happens next</h2>
            {[
              ['Changes rolled back', 'The proposed changes were discarded and the agent branch cleaned up.'],
              ['Session closed', 'The agent is no longer working on this session.'],
              ['Start again when ready', 'Create a new session with updated instructions or a different approach.'],
            ].map(([title, text]) => (
              <div key={title} className={s.nextRow}>
                <p className={s.nextTitle}>{title}</p>
                <p className={s.nextText}>{text}</p>
              </div>
            ))}
          </section>
        </>
      )}

      {!rejected && (
      <>
      <div className={s.tabs} role="tablist" aria-label="Session views">
        <button type="button" role="tab" aria-selected={tab === 'terminal'} className={`${s.tab} ${tab === 'terminal' ? s.tabActive : ''}`} onClick={() => onTab('terminal')}>
          Terminal
        </button>
        <button type="button" role="tab" aria-selected={tab === 'diff'} className={`${s.tab} ${tab === 'diff' ? s.tabActive : ''}`} onClick={() => onTab('diff')}>
          Diff {fileCount ? fileCount : ''}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'validation'} className={`${s.tab} ${tab === 'validation' ? s.tabActive : ''}`} onClick={() => onTab('validation')}>
          Validation
        </button>
      </div>

      {tab === 'terminal' && (
        <section className={s.panelFlat}>
          <div className={s.terminalHead}>
            <h2 className={s.terminalTitle}>Session output</h2>
            {running && <span className={s.liveBadge}>Live</span>}
          </div>
          <div className={s.terminalList}>
            {logs.length ? (
              logs.map((entry, index) => (
                <div key={`${entry.timestamp}-${index}`} className={s.terminalRow}>
                  <span className={s.terminalTime}>{formatClock(entry.timestamp)}</span>
                  <span className={`${s.terminalMessage} ${terminalTone(entry.type)}`}>{entry.message}</span>
                </div>
              ))
            ) : (
              <p className={s.muted} style={{ padding: '10px 2px' }}>
                {running
                  ? 'No output yet. The agent logs progress here as it runs.'
                  : 'No terminal output was recorded for this session.'}
              </p>
            )}
          </div>
          <div className={s.terminalFooter}>
            <span className={`${s.statusPill} ${TONE_CLASS[meta.tone]}`}>{meta.label}</span>
            <span>
              {reviewable
                ? 'Review the changes, then approve, tweak, or reject.'
                : execution.status === 'running'
                  ? 'The agent is working. Stop the session if you no longer need it.'
                  : cancelled
                    ? 'Session stopped by user. Start a new session to try again.'
                    : meta.label === 'Merged'
                      ? 'Changes were merged into the base branch.'
                      : execution.status === 'failed'
                        ? 'The run failed. Check the output above and start a new session.'
                        : 'No further action is available for this session.'}
            </span>
          </div>
        </section>
      )}

      {tab === 'diff' && (
        <section className={s.panelFlat}>
          {files.length ? (
            <div className={s.diffLayout}>
              <div>
                <h2 className={s.terminalTitle}>Changed files</h2>
                <p className={s.muted} style={{ marginBottom: 12 }}>{fileCount} file{fileCount === 1 ? '' : 's'}{running ? ' · updating live' : ''}</p>
                <div className={s.fileList}>
                  {files.map((file) => {
                    const action = normalizeAction(file.action);
                    return (
                      <button
                        key={file.path}
                        type="button"
                        className={`${s.fileItem} ${selectedFile?.path === file.path ? s.fileItemActive : ''}`}
                        onClick={() => setSelectedPath(file.path)}
                      >
                        <span className={s.fileName}>{file.path.split('/').pop()}</span>
                        <span className={s.fileMeta}>
                          <span>{file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : 'root'}</span>
                          <span className={action === 'created' ? s.actionCreated : action === 'deleted' ? s.actionDeleted : s.actionModified}>
                            {action}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className={s.diffPane}>
                {selectedFile ? (
                  <>
                    <div className={s.diffHead}>
                      <p className={s.diffPath}>{selectedFile.path}</p>
                      <span className={`${s.statusPill} ${normalizeAction(selectedFile.action) === 'created' ? s.statusMerged : normalizeAction(selectedFile.action) === 'deleted' ? s.statusRejected : s.statusRunning}`}>
                        {normalizeAction(selectedFile.action)}
                      </span>
                    </div>
                    <div className={s.diffColumns}>
                      <CodeColumn
                        title="Original"
                        lines={normalizeAction(selectedFile.action) === 'created' ? null : diffData.original}
                        tone="removed"
                      />
                      <CodeColumn title={cancelled ? 'Discarded changes' : 'Working changes'} lines={diffData.working} tone="added" />
                    </div>
                    <div className={s.diffFooter}>
                      <span>
                        {merged
                          ? 'Changes are archived. This session is complete.'
                          : cancelled
                            ? 'Session stopped. These changes were discarded.'
                            : running
                              ? 'Changes update while the agent is running.'
                              : 'Final changes for review.'}
                      </span>
                      <span className={s.readOnly}>Read-only</span>
                    </div>
                  </>
                ) : (
                  <div className={s.stateBlock}>Select a file to inspect its changes.</div>
                )}
              </div>
            </div>
          ) : (
            <div className={s.stateBlock}>
              <FileCode2 size={26} />
              <div>
                <p style={{ margin: 0, color: '#dcebf1', fontWeight: 600 }}>
                  {running ? 'Agent is still writing code…' : 'No file changes to review'}
                </p>
                <p style={{ margin: '6px 0 0' }}>
                  {running ? 'Diff will appear as files are written.' : 'This session produced a plan or finished without edits.'}
                </p>
              </div>
            </div>
          )}
        </section>
      )}

      {tab === 'validation' && (
        <section className={s.panelFlat}>
          <div className={s.terminalHead}>
            <div>
              <h2 className={s.terminalTitle}>Validation results</h2>
              <p className={s.muted}>Approval blocks only on failed blocking checks. Not-evaluated checks are neutral and never count as failures.</p>
            </div>
            <span className={`${s.statusPill} ${running ? s.statusRunning : failedChecks ? s.statusRejected : checks.length && !notEvaluatedChecks ? s.statusMerged : s.statusNeutral}`}>
              {validationLabel}
            </span>
          </div>
          {merged && (
            <div className={s.mergedBanner}>
              <CheckCircle2 size={18} />
              <div>
                <strong>Session merged successfully</strong>
                <span>Changes are now in {execution.baseBranch || 'main'}. No further action is needed.</span>
              </div>
            </div>
          )}
          <div className={s.validationGrid}>
            <div className={s.validationTile}>
              <p className={s.validationTileLabel}>Checks passed</p>
              <p className={s.validationTileValue} style={{ color: '#12dce5' }}>{checks.length ? `${passedChecks}/${checks.length}` : '—'}</p>
            </div>
            <div className={s.validationTile}>
              <p className={s.validationTileLabel}>Failed</p>
              <p className={s.validationTileValue} style={{ color: failedChecks ? '#ff8189' : '#9ab0ba' }}>{failedChecks}</p>
            </div>
            <div className={s.validationTile}>
              <p className={s.validationTileLabel}>Not evaluated</p>
              <p className={s.validationTileValue} style={{ color: notEvaluatedChecks ? '#e5b84a' : '#9ab0ba' }}>{notEvaluatedChecks}</p>
            </div>
            <div className={s.validationTile}>
              <p className={s.validationTileLabel}>Ran at</p>
              <p className={s.validationTileValue} style={{ fontSize: 12 }}>{formatWhen(execution.validationResult?.ranAt)}</p>
            </div>
          </div>
          {checks.length ? (
            <div className={s.checkList}>
              <div className={s.checkHead}><span>Checks</span><span>Result</span></div>
              {checks.map((check, index) => (
                <div key={`${check.label}-${index}`} className={s.checkRow}>
                  <div>
                    <p className={s.checkLabel}>{check.label}</p>
                    {check.detail && <p className={s.checkDetail}>{check.detail}</p>}
                  </div>
                  <ResultPill status={check.status} />
                </div>
              ))}
            </div>
          ) : (
            <div className={s.stateBlock}>
              <AlertCircle size={24} />
              <div>
                <p style={{ margin: 0, color: '#dcebf1', fontWeight: 600 }}>
                  {running ? 'Validation runs after execution completes' : 'No validation results yet'}
                </p>
                <p style={{ margin: '6px 0 0' }}>
                  {running ? 'Review changes once the agent finishes. Approval blocks only on failed blocking checks.' : 'Start a validated session or add a spec to this workspace.'}
                </p>
              </div>
            </div>
          )}
        </section>
      )}
      </>
      )}
    </>
  );
}

function TweakSession({ execution, onBack, onSubmit, busy, error }) {
  const [instruction, setInstruction] = useState('');
  const reviewable = REVIEWABLE.includes(execution.status);
  const meta = statusMeta(execution.status);

  return (
    <>
      <button type="button" className={s.backLink} onClick={onBack}>
        <ArrowLeft size={18} /> Back to Review
      </button>
      <h1 className={s.detailTitle}>Tweak</h1>
      <p className={s.subtitle}>Make changes to agent result</p>

      <div className={s.tweakHeader}>
        <div className={s.tweakTitleRow}>
          <div>
            <h2 className={s.tweakName}>{execution.taskTitle || 'Untitled session'}</h2>
            <p className={s.branchText}>{execution.branch || 'Branch pending'}</p>
          </div>
          <span className={`${s.statusPill} ${TONE_CLASS[meta.tone]}`}>{meta.label}</span>
        </div>
      </div>

      <div className={s.formCard}>
        <h2 className={s.formTitle}>Request a tweak</h2>
        <p className={s.formSub}>Tell the agent what to change before you approve this session.</p>

        {reviewable ? (
          <div className={s.savedNote}>
            Your current changes are saved on {execution.branch || 'the agent branch'}.
            <span>The agent will update this branch and run validation again.</span>
          </div>
        ) : (
          <p className={s.alertInfo}>
            This session is {meta.label.toLowerCase()}. Tweaks can only be requested while it is awaiting review.
          </p>
        )}

        {error && <p className={s.alert}>{error}</p>}

        <label className={s.field}>
          <span className={s.fieldLabel}>What should the agent adjust?</span>
          <textarea
            className={s.textarea}
            value={instruction}
            maxLength={2000}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder="Describe the changes you want, including any requirements or edge cases..."
            disabled={!reviewable || busy}
          />
          <p className={s.hint}>Be specific so the agent can make a focused update.</p>
        </label>

        <div className={s.formActions}>
          <button type="button" className={s.button} onClick={onBack} disabled={busy}>Cancel</button>
          <button
            type="button"
            className={s.buttonPrimary}
            disabled={!reviewable || busy || !instruction.trim()}
            onClick={() => onSubmit(instruction.trim())}
          >
            {busy ? <Loader2 size={16} className={s.spinner} /> : null}
            {busy ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </div>
    </>
  );
}

function AiAgentsPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const subscription = useAuthStore((state) => state.subscription);
  const { selectedCompany } = useCurrentCompany();
  const userId = user?._id || user?.id || user?.userId || null;

  const view = router.query.view;
  const sessionId = router.query.session;

  const [tab, setTab] = useState('terminal');
  const activeTab = ['terminal', 'diff', 'validation'].includes(tab) ? tab : 'terminal';

  const {
    data: sessions,
    loading: loadingSessions,
    refresh: refreshSessions,
  } = useCachedData(userId, 'ai-sessions', async () => {
    const data = await agentApi.sessions();
    return { success: true, data: Array.isArray(data.sessions) ? data.sessions : [] };
  }, { refreshOnVisibility: true, intervalMs: 15000 });

  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [model, setModel] = useState(null);
  const [showModelPicker, setShowModelPicker] = useState(false);

  useEffect(() => {
    const running = sessions.some((session) => ['queued', 'running', 'approving'].includes(session.status));
    const interval = setInterval(() => refreshSessions(), running ? 4000 : 15000);
    return () => clearInterval(interval);
  }, [refreshSessions, sessions]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(MODEL_PREFERENCE_KEY) || 'null');
      if (saved?.provider && saved?.model) setModel(saved);
    } catch {
      // ignore malformed preference
    }
  }, []);

  // Deep links such as /ai-agents?session=ID&tab=diff must open that tab, not
  // silently fall back to Terminal.
  useEffect(() => {
    const queryTab = router.query.tab;
    if (typeof queryTab === 'string' && ['terminal', 'diff', 'validation'].includes(queryTab)) {
      setTab(queryTab);
    }
  }, [router.query.tab]);

  const session = useMemo(
    () => sessions.find((item) => String(item._id) === String(sessionId)) || null,
    [sessions, sessionId]
  );

  const stats = useMemo(() => {
    const active = sessions.filter((item) => ['queued', 'running', 'approving'].includes(item.status)).length;
    const awaiting = sessions.filter((item) => REVIEWABLE.includes(item.status)).length;
    const merged = sessions.filter((item) => ['approved', 'completed'].includes(item.status)).length;
    return { total: sessions.length, active, awaiting, merged };
  }, [sessions]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return sessions;
    return sessions.filter((item) =>
      `${item.taskTitle || ''} ${item.branch || ''}`.toLowerCase().includes(needle)
    );
  }, [sessions, search]);

  const openSession = useCallback((id, nextTab) => {
    setActionError('');
    setNotice('');
    setTab(nextTab || 'terminal');
    router.push({ pathname: '/ai-agents', query: { session: id, ...(nextTab ? { tab: nextTab } : {}) } });
  }, [router]);

  const approve = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    setActionError('');
    setNotice('');
    try {
      await agentApi.approve(session._id, session.taskId);
      setNotice('Session approved and merged.');
      await refreshSessions();
    } catch (err) {
      setActionError(err.message || 'The session could not be approved.');
    } finally {
      setBusy(false);
    }
  }, [session, refreshSessions]);

  const reject = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    setActionError('');
    setNotice('');
    try {
      await agentApi.reject(session._id, session.taskId);
      setNotice('Session rejected and the task rolled back.');
      await refreshSessions();
    } catch (err) {
      setActionError(err.message || 'The session could not be rejected.');
    } finally {
      setBusy(false);
    }
  }, [session, refreshSessions]);

  const cancelRun = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    setActionError('');
    setNotice('');
    try {
      await agentApi.cancel(session._id);
      await refreshSessions();
    } catch (err) {
      setActionError(err.message || 'The session could not be stopped.');
    } finally {
      setBusy(false);
    }
  }, [session, refreshSessions]);

  const submitTweak = useCallback(async (instruction) => {
    if (!session) return;
    setBusy(true);
    setActionError('');
    try {
      await agentApi.tweak(session._id, session.taskId, instruction);
      setNotice('Tweak submitted. The agent will update this branch.');
      await refreshSessions();
      router.push({ pathname: '/ai-agents', query: { session: session._id } });
    } catch (err) {
      setActionError(err.message || 'The tweak could not be submitted.');
    } finally {
      setBusy(false);
    }
  }, [session, refreshSessions, router]);

  const saveModel = useCallback((next) => {
    setModel(next);
    try {
      localStorage.setItem(MODEL_PREFERENCE_KEY, JSON.stringify(next));
    } catch {
      // preference is optional
    }
    setShowModelPicker(false);
  }, []);

  const currentModelLabel = model?.model || 'Provider default';

  const body = (() => {
    if (view === 'start') {
      return (
        <StartSession
          initialTitle={typeof router.query.title === 'string' ? router.query.title : ''}
          model={model}
          company={selectedCompany}
          onBack={() => router.push('/ai-agents')}
          onStarted={async (id) => {
            setActionError('');
            await refreshSessions();
            if (id) router.replace({ pathname: '/ai-agents', query: { session: id } });
          }}
          onOpenModelPicker={() => setShowModelPicker(true)}
        />
      );
    }

    if (sessionId) {
      if (!session && loadingSessions) {
        return <div className={s.stateBlock}><Loader2 size={22} className={s.spinner} /> Loading session…</div>;
      }
      if (!session) {
        return (
          <>
            <button type="button" className={s.backLink} onClick={() => router.push('/ai-agents')}>
              <ArrowLeft size={18} /> Back to sessions
            </button>
            <div className={s.stateBlock}>
              <AlertCircle size={24} />
              <div>
                <p style={{ margin: 0, color: '#dcebf1', fontWeight: 600 }}>Session not found</p>
                <p style={{ margin: '6px 0 0' }}>It may belong to another workspace or no longer exist.</p>
              </div>
            </div>
            {loadError && <p className={s.alert}>{loadError}</p>}
          </>
        );
      }
      if (view === 'tweak') {
        return (
          <TweakSession
            execution={session}
            onBack={() => router.push({ pathname: '/ai-agents', query: { session: session._id } })}
            onSubmit={submitTweak}
            busy={busy}
            error={actionError}
          />
        );
      }
      return (
        <SessionDetail
          execution={session}
          tab={activeTab}
          onTab={(next) => {
            setTab(next);
            router.replace({ pathname: '/ai-agents', query: { session: session._id, tab: next } }, undefined, { shallow: true });
          }}
          onBack={() => router.push('/ai-agents')}
          onTweak={() => router.push({ pathname: '/ai-agents', query: { session: session._id, view: 'tweak' } })}
          onRefresh={() => refreshSessions()}
          onNewSession={() => router.push('/ai-agents?view=start')}
          busy={busy}
          notice={notice}
          error={actionError}
          onApprove={approve}
          onReject={reject}
          onCancel={cancelRun}
        />
      );
    }

    if (loadingSessions && !sessions.length) {
      return <div className={s.stateBlock}><Loader2 size={22} className={s.spinner} /> Loading sessions…</div>;
    }

    return (
      <>
        <div className={s.headRow}>
          <div>
            <p className={s.breadcrumb}>Build / AI Agent</p>
            <h1 className={s.title}>AI Agent Overview</h1>
            <p className={s.subtitle}>Monitor your agent, track work, and manage sessions.</p>
          </div>
          <div className={s.headActions}>
            <button type="button" className={s.button} onClick={() => setShowModelPicker(true)}>
              Change AI Model
            </button>
            <button type="button" className={s.buttonPrimary} onClick={() => router.push('/ai-agents?view=start')}>
              <Sparkles size={16} /> Start new session
            </button>
          </div>
        </div>

        {loadError && <p className={s.alert}>{loadError}</p>}
        {actionError && !sessionId && <p className={s.alert}>{actionError}</p>}

        {sessions.length > 0 && (
          <>
            <div className={s.statsGrid}>
              <div className={s.statCard}>
                <p className={s.statLabel}>Total sessions</p>
                <p className={s.statValue}>{stats.total}</p>
                <p className={s.statHint}>Across this workspace</p>
              </div>
              <div className={s.statCard}>
                <p className={s.statLabel}>Active now</p>
                <p className={s.statValue} style={{ color: '#e5b84a' }}>{stats.active}</p>
                <p className={s.statHint}>Currently running</p>
              </div>
              <div className={s.statCard}>
                <p className={s.statLabel}>Awaiting review</p>
                <p className={s.statValue} style={{ color: '#12dce5' }}>{stats.awaiting}</p>
                <p className={s.statHint}>Ready for your feedback</p>
              </div>
              <div className={s.statCard}>
                <p className={s.statLabel}>Merged sessions</p>
                <p className={s.statValue} style={{ color: '#30d158' }}>{stats.merged}</p>
                <p className={s.statHint}>Successfully completed</p>
              </div>
            </div>

            <div className={s.twoCol}>
              <div className={s.panel}>
                <div className={s.panelHead}>
                  <h2 className={s.panelTitle}>Agent details</h2>
                  <span className={`${s.statusPill} ${s.statusMerged}`}>Active</span>
                </div>
                <div className={s.panelBody}>
                  <p className={s.agentName}>Your development teammate</p>
                  <p className={s.muted}>Implements tasks, runs tests, and prepares changes for review.</p>
                  <div className={s.metaRow}>
                    <div>
                      <p className={s.metaLabel}>Repository</p>
                      <p className={s.metaValue}>{selectedCompany?.name || 'Personal workspace'}</p>
                    </div>
                    <div>
                      <p className={s.metaLabel}>Workspace context</p>
                      <p className={s.metaValue}>
                        {sessions.length} session{sessions.length === 1 ? '' : 's'} ·{' '}
                        {sessions.reduce((total, item) => total + (filesOf(item).length || 0), 0)} files changed
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className={s.panel}>
                <div className={s.panelHead}>
                  <p className={s.metaLabel} style={{ margin: 0 }}>Current AI model</p>
                </div>
                <div className={s.panelBody}>
                  <p className={s.modelName}>{currentModelLabel}</p>
                  <p className={s.modelNote}>Used for new agent sessions.</p>
                  <div className={s.modelFooter}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <Settings2 size={14} /> Code implementation &amp; validation
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className={s.sectionHead}>
              <div>
                <h2 className={s.sectionTitle}>AI Agent Sessions</h2>
                <p className={s.sectionCount}>{sessions.length} session{sessions.length === 1 ? '' : 's'}</p>
              </div>
              <label className={s.searchBox}>
                <Search size={15} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search session" aria-label="Search sessions" />
              </label>
            </div>

            <div className={s.sessionTable}>
              <div className={s.sessionTableHead}>
                <span>Session / Branch</span>
                <span>Status</span>
                <span>Progress</span>
                <span>Duration</span>
                <span />
              </div>
              {filtered.length ? (
                filtered.map((item) => (
                  <SessionRow key={item._id} execution={item} onOpen={openSession} />
                ))
              ) : (
                <div className={s.stateBlock}>No sessions match “{search}”.</div>
              )}
            </div>
          </>
        )}

        {!sessions.length && (
          <>
            <div className={s.panel} style={{ marginTop: 26 }}>
              <div className={s.panelBody} style={{ display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <p className={s.metaLabel}>Current AI model</p>
                  <p className={s.modelName} style={{ margin: '2px 0 0' }}>{currentModelLabel}</p>
                </div>
                <div>
                  <p className={s.metaLabel}>Connected repository</p>
                  <p className={s.metaValue} style={{ margin: 0 }}>{selectedCompany?.name || 'Personal workspace'}</p>
                </div>
                <span className={`${s.statusPill} ${s.statusMerged}`}>Ready for your first task</span>
              </div>
            </div>

            <div className={s.sectionHead}>
              <div>
                <h2 className={s.sectionTitle}>AI Agent Sessions</h2>
                <p className={s.sectionCount}>Your work will appear here once you start a session.</p>
              </div>
            </div>

            <div className={s.emptyCard}>
              <div className={s.emptyIcon}><Terminal size={26} /></div>
              <h2 className={s.emptyTitle}>Your first task starts here</h2>
              <p className={s.emptyText}>
                Describe what you want to build or fix. Your agent will plan the work, make changes,
                and run checks—all in a session you can follow.
              </p>
              <button type="button" className={s.buttonPrimary} onClick={() => router.push('/ai-agents?view=start')}>
                Start first session
              </button>
              <p className={s.examplesLabel}>Not sure where to start? Try a task like:</p>
              <div className={s.examples}>
                {[
                  { title: 'Fix a bug', text: 'Describe an issue to investigate' },
                  { title: 'Build a feature', text: 'Turn a clear request into changes' },
                  { title: 'Refactor a module', text: 'Improve existing structure' },
                ].map((example) => (
                  <button
                    key={example.title}
                    type="button"
                    className={s.exampleCard}
                    onClick={() => router.push({ pathname: '/ai-agents', query: { view: 'start', title: example.title } })}
                  >
                    <p className={s.exampleTitle}>{example.title}</p>
                    <p className={s.exampleText}>{example.text}</p>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </>
    );
  })();

  return (
    <AuthGuard>
      <Head><title>AI Agent - BuildrsHQ</title><link rel="icon" href="/buildrs.png" /></Head>
      <div className="workspace-container">
        <Sidebar user={user} subscription={subscription} />
        <main className={`workspace-main ${s.page}`}>{body}</main>
      </div>
      {showModelPicker && (
        <ModelPicker current={model} onClose={() => setShowModelPicker(false)} onSave={saveModel} />
      )}
    </AuthGuard>
  );
}

export default AiAgentsPage;
