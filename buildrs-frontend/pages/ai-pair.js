import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch, SOCKET_URL, isDemoTourActive } from '../lib/api';
import {
  Bot,
  Send,
  Plus,
  ChevronRight,
  Code,
  AlertCircle,
  Loader2,
  MessageSquare,
  Sparkles,
  X,
  Copy,
  Check,
  GitBranch,
  ChevronDown,
  Search,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Activity,
  ShieldCheck,
  Workflow,
  Terminal,
  FileDiff,
} from 'lucide-react';
import { getTierLimits, normalizeTier } from '../lib/tier';
import { useRouter } from 'next/router';
import { io } from 'socket.io-client';
import { useCurrentCompany } from '../hooks/useCurrentCompany';

const LANGUAGES = ['JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Rust', 'C++', 'Ruby', 'PHP'];
const AI_MODEL_PREFERENCE_KEY = 'buildrs-ai-model-preference';

const ACTION_TINTS = {
  create: { bg: 'rgba(3,186,3,0.12)', text: '#03ba03' },
  delete: { bg: 'rgba(236,20,20,0.12)', text: '#ec1414' },
  edit: { bg: 'rgba(229, 184, 74, 0.12)', text: '#e5b84a' },
};

function getAiLimitForTier(tier) {
  const limits = getTierLimits(tier);
  const v = limits.maxAiMessagesPerDay;
  return v === -1 ? Infinity : v;
}

function formatTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function parseUnifiedDiff(patch) {
  if (typeof patch !== 'string' || !patch.trim()) return [];

  let oldLine = 0;
  let newLine = 0;
  return patch.split('\n').flatMap((line, index) => {
    const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      return [{ type: 'hunk', text: line, key: `hunk-${index}` }];
    }
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('Index:') || /^=+$/.test(line) || line.startsWith('\\ No newline')) {
      return [];
    }
    if (line.startsWith('+')) {
      return [{ type: 'added', oldLine: '', newLine: newLine++, text: line.slice(1), key: `line-${index}` }];
    }
    if (line.startsWith('-')) {
      return [{ type: 'removed', oldLine: oldLine++, newLine: '', text: line.slice(1), key: `line-${index}` }];
    }
    if (line.startsWith(' ')) {
      return [{ type: 'context', oldLine: oldLine++, newLine: newLine++, text: line.slice(1), key: `line-${index}` }];
    }
    return [];
  });
}

function getDiffCounts(patch) {
  if (typeof patch !== 'string') return { insertions: 0, deletions: 0 };
  return patch.split('\n').reduce((counts, line) => {
    if (line.startsWith('+++') || line.startsWith('---')) return counts;
    if (line.startsWith('+')) counts.insertions += 1;
    else if (line.startsWith('-')) counts.deletions += 1;
    return counts;
  }, { insertions: 0, deletions: 0 });
}

function AgentFileDiff({ file, index }) {
  const rows = parseUnifiedDiff(file.diff);
  const counts = getDiffCounts(file.diff);
  const action = file.action || 'edit';
  const actionTint = ACTION_TINTS[action] || ACTION_TINTS.edit;

  return (
    <details className="ail-agent-diff-file" open={index === 0}>
      <summary>
        <FileDiff />
        <code>{file.path || file.filePath || `Changed file ${index + 1}`}</code>
        <span className="ail-agent-diff-action" style={{ color: actionTint.text, background: actionTint.bg }}>{action}</span>
        <span className="ail-agent-diff-counts"><span>+{counts.insertions}</span><span>-{counts.deletions}</span></span>
        <ChevronDown className="ail-agent-diff-chevron" />
      </summary>
      {rows.length ? (
        <div className="ail-agent-diff-code" role="table" aria-label={`Diff for ${file.path || file.filePath || 'changed file'}`}>
          {rows.map((row) => row.type === 'hunk' ? (
            <div className="ail-agent-diff-hunk" role="row" key={row.key}>{row.text}</div>
          ) : (
            <div className={`ail-agent-diff-line is-${row.type}`} role="row" key={row.key}>
              <span className="ail-agent-diff-line-number">{row.oldLine}</span>
              <span className="ail-agent-diff-line-number">{row.newLine}</span>
              <span className="ail-agent-diff-line-marker" aria-hidden="true">{row.type === 'added' ? '+' : row.type === 'removed' ? '−' : ' '}</span>
              <code>{row.text || ' '}</code>
            </div>
          ))}
        </div>
      ) : (
        <p className="ail-agent-diff-unavailable">A line-by-line patch is not available for this file.</p>
      )}
    </details>
  );
}

function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }).catch(() => { });
  };

  return (
    <div className="ail-code">
      <div className="ail-code-head">
        <span className="ail-code-lang">{lang ? lang.toUpperCase() : 'CODE'}</span>
        <button type="button" className="ail-code-copy" onClick={handleCopy}>
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        </button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}

function renderCodeBlocks(text, keyPrefix = '') {
  if (!text) return text;
  const displayText = typeof text === 'string' ? text : String(text);
  const parts = displayText.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const lines = part.slice(3, -3);
      const firstNewline = lines.indexOf('\n');
      const lang = firstNewline > -1 ? lines.slice(0, firstNewline).trim() : '';
      const code = firstNewline > -1 ? lines.slice(firstNewline + 1) : lines;
      return <CodeBlock key={`${keyPrefix}${i}`} lang={lang} code={code} />;
    }
    return <span key={`${keyPrefix}${i}`}>{part}</span>;
  });
}

function formatAgentSummary(summary, success, error) {
  if (typeof summary === 'string' && summary.trim()) return summary;
  if (summary && typeof summary === 'object') {
    if (typeof summary.finalThought === 'string' && summary.finalThought.trim()) {
      const details = [summary.finalThought];
      if (!success && summary.stopReason && !summary.finalThought.includes(summary.stopReason)) {
        details.push(summary.stopReason);
      }
      if (!success && error && !details.some((detail) => detail.includes(error))) {
        details.push(error);
      }
      return details.join('\n\n');
    }
  }
  if (error) return `The agent could not complete the request: ${error}`;
  if (summary?.stopReason) return `The agent stopped before completing the request: ${summary.stopReason}`;
  if (typeof summary?.goal === 'string' && summary.goal.trim()) return summary.goal;
  return success ? 'Task complete.' : 'Agent finished with issues.';
}

function getAgentProgressLabel(step) {
  if (step.type === 'done') {
    return step.success ? 'Task complete' : step.summary?.stopReason || 'Task stopped';
  }
  const tool = step.action?.tool || step.tool;
  const labels = {
    list_files: 'Inspecting repository files',
    get_repository_status: 'Checking repository status',
    read_file: 'Reading a source file',
    search_code: 'Searching project code',
    analyze_code: 'Analyzing source code',
    run_tests: 'Running tests',
    execute_code: 'Running code in the sandbox',
    create_file: 'Creating a file',
    update_file: 'Updating a file',
    create_multiple_files: 'Creating project files',
    delete_file: 'Deleting a file',
  };
  if (step.type === 'result') {
    const actionLabel = labels[tool] || 'Step';
    return step.result?.success
      ? `${actionLabel} complete`
      : `${actionLabel} needs attention${step.result?.message ? `: ${String(step.result.message).slice(0, 120)}` : ''}`;
  }
  return labels[tool] || step.message || 'Working on the requested task';
}

function AgentOperationsPanel({ session, agentMode, onToggleMode, loading, steps, messages, remaining, aiLimit }) {
  const completedStep = [...steps].reverse().find((step) => step.type === 'done');
  const runStatus = loading
    ? 'Running'
    : completedStep
      ? (completedStep.success ? 'Complete' : 'Needs attention')
      : agentMode
        ? 'Ready to run'
        : 'Pairing mode';
  const stepCount = steps.reduce((count, step) => Math.max(count, Number(step.iteration) || 0), 0);
  const iterationLimit = steps.reduce((count, step) => Math.max(count, Number(step.maxIterations) || 0), 0);
  const activity = steps
    .filter((step) => ['iteration', 'result', 'done'].includes(step.type))
    .slice(-6)
    .reverse();

  return (
    <aside className="ail-ops" aria-label="Agent operations">
      <div className="ail-ops-head">
        <div>
          <p className="ail-eyebrow">Workspace controls</p>
          <h2><Activity className="h-4 w-4" /> Agent operations</h2>
        </div>
        <span className={`ail-live-pill ${loading ? 'is-running' : ''}`}>
          <span />{runStatus}
        </span>
      </div>

      <section className={`ail-mode-card ${agentMode ? 'is-agent' : ''}`}>
        <div className="ail-mode-card-top">
          <span className="ail-mode-icon">{agentMode ? <Workflow className="h-4 w-4" /> : <Bot className="h-4 w-4" />}</span>
          <div>
            <strong>{agentMode ? 'Autonomous agent' : 'Pair assistant'}</strong>
            <p>{agentMode ? 'Plans, uses tools, and reports verified outcomes.' : 'Conversational help with no autonomous tool loop.'}</p>
          </div>
        </div>
        <button
          type="button"
          className={`ail-mode-toggle ${agentMode ? 'is-on' : ''}`}
          onClick={onToggleMode}
          disabled={loading}
          aria-pressed={agentMode}
        >
          <span>{agentMode ? 'Agent mode enabled' : 'Enable agent mode'}</span>
          <span className="ail-toggle-track"><span /></span>
        </button>
      </section>

      <section className="ail-ops-section">
        <div className="ail-ops-section-title"><GitBranch className="h-3.5 w-3.5" /><span>Execution context</span></div>
        <dl className="ail-context-list">
          <div><dt>Repository</dt><dd title={session?.repositoryName || session?.repoName || ''}>{session?.repositoryName || session?.repoName || 'No session selected'}</dd></div>
          <div><dt>Branch</dt><dd title={session?.branch || ''}>{session?.branch || 'Default branch'}</dd></div>
          <div><dt>Language</dt><dd>{session?.language || '—'}</dd></div>
          <div><dt>Messages</dt><dd>{messages.length}</dd></div>
          <div><dt>Usage</dt><dd>{aiLimit === Infinity ? 'Unlimited' : `${remaining}/${aiLimit} today`}</dd></div>
        </dl>
      </section>

      <section className="ail-ops-section ail-activity-section">
        <div className="ail-ops-section-title"><Terminal className="h-3.5 w-3.5" /><span>Live activity</span><span className="ail-activity-count">{stepCount ? `${stepCount}${iterationLimit ? ` / ${iterationLimit}` : ''} steps` : '—'}</span></div>
        {activity.length ? (
          <ol className="ail-activity-list">
            {activity.map((step, index) => {
              const isDone = step.type === 'done';
              const isResult = step.type === 'result';
              const succeeded = isDone ? step.success : step.result?.success;
              return (
                <li key={`${step.iteration || step.type}-${index}`} className={isDone || isResult ? (succeeded ? 'is-success' : 'is-error') : 'is-active'}>
                  <span className="ail-activity-marker">{isDone || isResult ? (succeeded ? <CheckCircle2 /> : <XCircle />) : <span />}</span>
                  <span className="ail-activity-copy">
                    <strong>{getAgentProgressLabel(step)}</strong>
                    {step.iteration > 0 && <small>Step {step.iteration}</small>}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="ail-activity-empty">
            <span className="ail-activity-pulse" />
            <p>{loading ? 'Waiting for the first agent event…' : 'Agent activity will appear here when a run starts.'}</p>
          </div>
        )}
      </section>

      <section className="ail-safety-card">
        <ShieldCheck className="h-4 w-4" />
        <div><strong>Review stays with you</strong><p>Connected GitHub content is read-only. Workspace edits are not pushed; review changes before applying them.</p></div>
      </section>
    </aside>
  );
}

function AgentRunsPanel({ sessions, selected, loading, error, followUp, setFollowUp, setError, onSelect, onAction, actionId, onDelegate }) {
  const [detailTab, setDetailTab] = useState('terminal');
  const reviewable = selected && ['awaiting_review', 'awaiting_approval'].includes(selected.status);
  const hasAppliedChanges = Boolean((selected?.filesChanged || []).length || selected?.diffSummary?.filesChanged > 0);
  const validation = selected?.validationResult;
  const statusColor = selected?.status === 'failed' ? '#ec1414' : reviewable ? '#e5b84a' : ['running', 'in_progress'].includes(selected?.status) ? '#12dce5' : '#9aaeba';
  const activeCount = sessions.filter((session) => ['running', 'in_progress'].includes(session.status)).length;
  const reviewCount = sessions.filter((session) => ['awaiting_review', 'awaiting_approval'].includes(session.status)).length;
  const rawProgress = Number(selected?.progress);
  const progressPercent = Number.isFinite(rawProgress) ? Math.min(100, Math.max(0, rawProgress <= 1 ? rawProgress * 100 : rawProgress)) : null;
  const isAgentRunning = ['running', 'in_progress'].includes(selected?.status);
  const isAgentComplete = ['complete', 'completed', 'done'].includes(selected?.status);
  const startedAt = selected?.startedAt || selected?.createdAt;
  const finishedAt = selected?.completedAt || (isAgentRunning ? new Date() : selected?.updatedAt);
  const durationMs = startedAt && finishedAt ? Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime()) : null;
  const durationLabel = durationMs === null ? '—' : `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`;
  const passingSpecs = validation?.specs?.filter((spec) => spec.passed).length;

  return (
    <div className="ail-content ail-agent-dashboard">
      {error && <div className="std-alert std-alert-error mb-3"><AlertCircle className="w-4 h-4" /><span className="flex-1">{error}</span><button type="button" onClick={() => setError(null)}><X className="w-4 h-4" /></button></div>}
      <div className="ail-agent-frame">
        <aside className="ail-agent-sessions">
          <div className="ail-agent-sessions-heading">
            <div><h2>Agent Sessions</h2><p>{activeCount} active · {reviewCount} awaiting review</p></div>
          </div>
          <div className="ail-agent-session-list">
            {sessions.length ? sessions.map((session) => {
              const sessionStatusColor = session.status === 'failed' ? '#ec1414' : ['awaiting_review', 'awaiting_approval'].includes(session.status) ? '#8a38f5' : ['running', 'in_progress'].includes(session.status) ? '#12dce5' : '#03ba03';
              return (
                <button key={session._id} type="button" onClick={() => onSelect(session)} className={`ail-agent-session ${selected?._id === session._id ? 'is-selected' : ''}`}>
                  <span className="ail-agent-session-dot" style={{ background: sessionStatusColor }} />
                  <span className="ail-agent-session-copy">
                    <strong>{session.taskTitle || 'Agent run'}</strong>
                    <span className="ail-agent-branch">{session.branch || session.model || 'No branch'}</span>
                    <span className="ail-agent-session-meta">
                      <span className="ail-agent-status" style={{ color: sessionStatusColor, borderColor: `${sessionStatusColor}55` }}>{session.status?.replaceAll('_', ' ') || 'unknown'}</span>
                      <span>{session.createdAt ? formatTime(session.createdAt) : '—'}</span>
                    </span>
                  </span>
                </button>
              );
            }) : <div className="ail-agent-list-empty">{loading ? 'Loading agent sessions…' : 'No agent sessions yet. Delegate a task to get started.'}</div>}
          </div>
        </aside>

        <section className="ail-agent-detail">
          {!selected ? (
            <div className="ail-agent-empty">
              <Bot />
              <strong>Select an agent session</strong>
              <span>Execution progress, terminal logs, and validation will appear here.</span>
              <button type="button" className="btn-workspace btn-primary" onClick={onDelegate}>Delegate Task</button>
            </div>
          ) : <>
            <header className="ail-agent-run-header">
              <div className="ail-agent-run-title">
                <span className="ail-agent-session-dot" style={{ background: statusColor }} />
                <div><h2>{selected.taskTitle || 'Agent session'}</h2><p>{selected.branch || 'No branch selected'}</p></div>
                <span className="ail-agent-status ail-agent-running" style={{ color: statusColor }}>{selected.status?.replaceAll('_', ' ')}{progressPercent !== null ? ` · ${Math.round(progressPercent)}%` : ''}</span>
              </div>
              <div className="ail-agent-run-meta">
                <span><small>Duration</small><strong>{durationLabel}</strong></span>
                <span><small>Files changed</small><strong>{selected.filesChanged?.length || selected.diffSummary?.filesChanged || 0}</strong></span>
                <span><small>Tests</small><strong>{typeof passingSpecs === 'number' ? `${passingSpecs} passed` : '—'}</strong></span>
                <span><small>Started</small><strong>{startedAt ? new Date(startedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—'}</strong></span>
                <span><small>Model</small><strong>{selected.model || 'Default model'}</strong></span>
              </div>
              <div className={`ail-agent-progress ${isAgentRunning && progressPercent === null ? 'is-indeterminate' : ''}`} aria-hidden="true"><span style={{ width: isAgentComplete ? '100%' : `${progressPercent ?? (isAgentRunning ? 40 : 0)}%` }} /></div>
            </header>

            <div className="ail-agent-tabs" role="tablist" aria-label="Agent session details">
              <button type="button" role="tab" aria-selected={detailTab === 'terminal'} className={detailTab === 'terminal' ? 'is-active' : ''} onClick={() => setDetailTab('terminal')}><Terminal />Terminal</button>
              <button type="button" role="tab" aria-selected={detailTab === 'diff'} className={detailTab === 'diff' ? 'is-active' : ''} onClick={() => setDetailTab('diff')}><Code />Diff</button>
              <button type="button" role="tab" aria-selected={detailTab === 'validation'} className={detailTab === 'validation' ? 'is-active' : ''} onClick={() => setDetailTab('validation')}><ShieldCheck />Validation</button>
            </div>

            <div className="ail-agent-tab-panel" role="tabpanel">
              {detailTab === 'terminal' && (
                <div className="ail-agent-terminal">
                  {(selected.terminalLog || []).length ? selected.terminalLog.map((line, index) => (
                    <p key={`${line.timestamp}-${index}`} className={`ail-agent-log ail-agent-log-${String(line.type || 'log').replace(/[^a-z0-9-]/gi, '-')}`}>
                      <time>{line.timestamp ? new Date(line.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '—'}</time>
                      <span className="ail-agent-log-marker">›</span>
                      <span>{line.message}</span>
                    </p>
                  )) : (
                    <div className="ail-agent-terminal-empty">
                      <p>{selected.summary || selected.plan || 'No execution events recorded yet.'}</p>
                    </div>
                  )}
                  {isAgentRunning && <span className="ail-agent-terminal-cursor" />}
                </div>
              )}
              {detailTab === 'diff' && (
                <div className="ail-agent-diff">
                  {(selected.filesChanged || []).length ? (
                    <>
                      <div className="ail-agent-diff-summary">
                        <strong>{selected.filesChanged.length} {selected.filesChanged.length === 1 ? 'file' : 'files'} changed</strong>
                        <span>+{selected.diffSummary?.insertions ?? selected.filesChanged.reduce((total, file) => total + getDiffCounts(file.diff).insertions, 0)} additions</span>
                        <span>−{selected.diffSummary?.deletions ?? selected.filesChanged.reduce((total, file) => total + getDiffCounts(file.diff).deletions, 0)} deletions</span>
                      </div>
                      <div className="ail-agent-diff-files">
                        {selected.filesChanged.map((file, index) => (
                          <AgentFileDiff key={file.path || file.filePath || index} file={file} index={index} />
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="ail-agent-diff-empty">
                      <FileDiff />
                      <strong>No file diff is available</strong>
                      <span>{selected.status === 'failed' ? 'This run failed before producing reviewable file changes.' : 'Line-by-line changes will appear here after the agent proposes file edits.'}</span>
                    </div>
                  )}
                </div>
              )}
              {detailTab === 'validation' && (
                <div className="ail-agent-validation">
                  {validation?.specs?.length ? validation.specs.map((spec, index) => (
                    <section key={spec.specId || index}>
                      <header><strong>{spec.title || `Spec ${index + 1}`}</strong><span style={{ color: spec.passed ? '#03ba03' : '#e5b84a' }}>{spec.passed ? 'requirements passing' : 'review needed'}</span></header>
                      {(spec.requirements || []).map((requirement, requirementIndex) => (
                        <p key={requirement.id || requirementIndex}><span style={{ color: requirement.status === 'pass' ? '#03ba03' : requirement.status === 'fail' ? '#ec1414' : '#e5b84a' }}>{requirement.status}</span><span>{requirement.id}: {requirement.text} <small>{requirement.evidence}</small></span></p>
                      ))}
                      {spec.verificationCommand && <p className="ail-agent-validation-command">Command pending: {spec.verificationCommand.command}</p>}
                    </section>
                  )) : <p>{validation?.command?.reason || 'No automated validation result is attached.'}</p>}
                </div>
              )}
            </div>

            {(reviewable || selected.status === 'failed') && <footer className="ail-agent-run-footer">
              {['awaiting_review', 'awaiting_approval', 'failed'].includes(selected.status) && <form className="ail-agent-followup" onSubmit={(event) => { event.preventDefault(); if (followUp.trim()) onAction('tweak', selected, { instruction: followUp.trim() }); }}>
                <input className="ws-input min-w-0 flex-1" value={followUp} onChange={(event) => setFollowUp(event.target.value)} placeholder="Add a follow-up instruction" />
                <button type="submit" className="btn-workspace btn-secondary" disabled={!followUp.trim() || Boolean(actionId)}><Send className="h-4 w-4" /><span className="hidden sm:inline">Continue</span></button>
              </form>}
              <div><span>Agent work always waits for a human decision.</span><div className="ail-agent-review-actions">
                {reviewable && <><button type="button" className="btn-workspace btn-secondary" onClick={() => { const reason = window.prompt('Reason for rejecting this run?') || ''; onAction('reject', selected, { reason }); }} disabled={Boolean(actionId)}><XCircle className="h-4 w-4" />Reject &amp; Rollback</button><button type="button" className="btn-workspace btn-primary" onClick={() => onAction('approve', selected)} disabled={Boolean(actionId)} title={hasAppliedChanges ? 'Approve and merge the branch' : 'Accept this plan and close the task'}><CheckCircle2 className="h-4 w-4" />{hasAppliedChanges ? 'Approve & Merge' : 'Accept Plan'}</button></>}
                {actionId === selected._id && <Loader2 className="h-4 w-4 animate-spin text-[#12dce5]" />}
              </div></div>
              {reviewable && !hasAppliedChanges && <p className="ail-agent-review-note">This run returned a plan but no file changes. Accept the plan, continue with a follow-up instruction, or delegate the task again.</p>}
            </footer>}
          </>}
        </section>
      </div>
    </div>
  );
}

function ChangeBlock({ change }) {
  const tint = ACTION_TINTS[change.action] || ACTION_TINTS.edit;
  return (
    <div className="ail-change">
      <div className="ail-change-head">
        <Code className="w-3.5 h-3.5 flex-shrink-0" style={{ color: tint.text }} />
        <span className="ail-change-path">{change.path}</span>
        <span className="pill ml-auto flex-shrink-0" style={{ background: tint.bg, color: tint.text }}>
          {change.action}
        </span>
      </div>
      {change.content && (
        <pre><code>{change.content}</code></pre>
      )}
    </div>
  );
}

export default function AiPair() {
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);
  const router = useRouter();
  const tier = normalizeTier(subscription?.tier);
  const aiLimit = getAiLimitForTier(tier);
  const aiEnabled = getTierLimits(tier).features.aiPair || aiLimit > 0;

  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [error, setError] = useState(null);
  const [showNewSession, setShowNewSession] = useState(false);
  const [repos, setRepos] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState('');
  const [selectedLang, setSelectedLang] = useState('JavaScript');
  const [creatingSession, setCreatingSession] = useState(false);
  const [remaining, setRemaining] = useState(aiLimit);
  const [agentMode, setAgentMode] = useState(false);
  const [agentSteps, setAgentSteps] = useState([]);
  const [activeView, setActiveView] = useState('runs');
  const [agentSessions, setAgentSessions] = useState([]);
  const [selectedExecution, setSelectedExecution] = useState(null);
  const [loadingAgentSessions, setLoadingAgentSessions] = useState(false);
  const [aiProviders, setAiProviders] = useState([]);
  const [selectedAiModel, setSelectedAiModel] = useState(null);
  const selectedModelIsLocal = ['ollama', 'lm-studio'].includes(selectedAiModel?.provider);
  const effectiveAiLimit = selectedModelIsLocal ? Infinity : aiLimit;
  const [draftAiModel, setDraftAiModel] = useState(null);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [loadingAiProviders, setLoadingAiProviders] = useState(false);
  const [agentActionId, setAgentActionId] = useState('');
  const [followUp, setFollowUp] = useState('');
  const agentSocketRef = useRef(null);
  const selectedExecutionIdRef = useRef(null);
  const agentSessionsRequestRef = useRef(0);
  const chatSessionRequestRef = useRef(0);
  const chatSendRequestRef = useRef(0);
  const { selectedCompany, hasCompany } = useCurrentCompany();
  const messagesEndRef = useRef(null);

  useEffect(() => {
    setRemaining(effectiveAiLimit);
  }, [effectiveAiLimit]);

  useEffect(() => {
    fetchSessions();
    try {
      const savedPreference = localStorage.getItem(AI_MODEL_PREFERENCE_KEY);
      if (savedPreference) {
        const parsed = JSON.parse(savedPreference);
        if (parsed && parsed.model && parsed.provider && parsed.model === parsed.provider) {
          localStorage.removeItem(AI_MODEL_PREFERENCE_KEY);
          setSelectedAiModel(null);
        } else {
          setSelectedAiModel(parsed);
        }
      }
    } catch (err) {
      localStorage.removeItem(AI_MODEL_PREFERENCE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    if (router.query.executionId) {
      setActiveView('runs');
      selectedExecutionIdRef.current = String(router.query.executionId);
      fetchAgentSessions(router.query.executionId);
      return;
    }
    setActiveView(router.query.view === 'chat' ? 'chat' : 'runs');
  }, [router.isReady, router.query.executionId, router.query.view]);

  useEffect(() => {
    if (activeView !== 'runs') return undefined;
    fetchAgentSessions();
    const id = setInterval(() => fetchAgentSessions(undefined, { noCache: true }), 5000);
    return () => clearInterval(id);
  }, [activeView, selectedExecution?._id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
    if (!token || isDemoTourActive()) return;
    const socketUrl = SOCKET_URL;
    const sock = io(`${socketUrl}/collab`, { auth: { token }, transports: ['websocket', 'polling'] });
    agentSocketRef.current = sock;
    sock.on('connect', () => sock.emit('agent:join'));
    sock.on('agent:progress', (p) => {
      if (p && p.type) {
        const progress = {
          type: p.type,
          iteration: p.iteration,
          maxIterations: p.maxIterations,
          message: p.message,
          action: p.action,
          result: p.result,
          success: p.success,
          summary: p.summary,
        };
        setAgentSteps((prev) => [...prev.slice(-19), progress]);
      }
    });
    return () => {
      sock.emit('agent:leave');
      sock.disconnect();
      agentSocketRef.current = null;
    };
  }, [activeSession]);

  function resetAgentRun() {
    setAgentSteps([]);
  }

  function toggleAgentMode() {
    setAgentMode((mode) => !mode);
    resetAgentRun();
  }

  async function fetchSessions() {
    setLoadingSessions(true);
    try {
      const data = await apiFetch('/api/ai-pair/sessions');
      if (data.success) setSessions(data.sessions || []);
    } catch (err) {
      setError('Failed to load sessions');
    } finally {
      setLoadingSessions(false);
    }
  }

  async function fetchAgentSessions(preferredId, options = {}) {
    const requestId = ++agentSessionsRequestRef.current;
    setLoadingAgentSessions(true);
    try {
      const data = await apiFetch('/api/v1/agent/sessions', options);
      const loadedSessions = data.sessions || [];
      if (requestId !== agentSessionsRequestRef.current) return;
      setAgentSessions(loadedSessions);
      const targetId = preferredId || selectedExecutionIdRef.current;
      const selected = targetId
        ? loadedSessions.find((item) => item._id === String(targetId))
        : loadedSessions[0];
      if (selected) {
        selectedExecutionIdRef.current = selected._id;
        setSelectedExecution(selected);
      } else if (!targetId) {
        selectedExecutionIdRef.current = null;
        setSelectedExecution(null);
      }
    } catch (err) {
      if (requestId === agentSessionsRequestRef.current) setError(err.message || 'Failed to load agent runs');
    } finally {
      if (requestId === agentSessionsRequestRef.current) setLoadingAgentSessions(false);
    }
  }

  function selectAgentExecution(execution) {
    selectedExecutionIdRef.current = execution?._id || null;
    setSelectedExecution(execution || null);
    const query = { ...router.query };
    if (execution?._id) query.executionId = execution._id;
    else delete query.executionId;
    router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
  }

  async function fetchAiProviders(force = false) {
    setLoadingAiProviders(true);
    try {
      const data = await apiFetch('/api/ai-pair/providers', force ? { forceRefresh: true } : undefined);
      if (!data.success) throw new Error(data.message || 'Could not load AI models');
      setAiProviders(data.providers || []);
      const saved = selectedAiModel || (() => {
        try {
          return JSON.parse(localStorage.getItem(AI_MODEL_PREFERENCE_KEY) || 'null');
        } catch {
          return null;
        }
      })();
      const savedIsValid = Boolean(saved?.provider && saved?.model && saved.model !== saved.provider);
      const available = savedIsValid && (data.providers || []).some((provider) =>
        provider.key === saved?.provider &&
        (provider.type === 'cloud' ? provider.model === saved?.model : provider.models?.includes(saved?.model))
      );
      const defaultProvider = (data.providers || []).find((provider) => provider.key === data.defaultProvider);
      const defaultModel = defaultProvider?.type === 'cloud'
        ? defaultProvider.model
        : defaultProvider?.models?.[0];
      setDraftAiModel(available ? saved : defaultProvider && defaultModel
        ? { provider: defaultProvider.key, model: defaultModel }
        : null);
    } catch (err) {
      setError(err.message || 'Could not load AI models');
    } finally {
      setLoadingAiProviders(false);
    }
  }

  function openModelPicker() {
    setError(null);
    setShowModelPicker(true);
    fetchAiProviders();
  }

  function saveAiModel() {
    if (!draftAiModel) return;
    setSelectedAiModel(draftAiModel);
    localStorage.setItem(AI_MODEL_PREFERENCE_KEY, JSON.stringify(draftAiModel));
    setShowModelPicker(false);
  }

  async function submitAgentAction(action, execution, extra = {}) {
    setAgentActionId(execution._id);
    setError(null);
    try {
      const result = await apiFetch(`/api/v1/agent/${action}`, {
        method: 'POST',
        body: JSON.stringify({ executionId: execution._id, taskId: execution.taskId, ...extra }),
      });
      if (result.execution) setSelectedExecution(result.execution);
      if (action === 'tweak') setFollowUp('');
      await fetchAgentSessions(execution._id);
    } catch (err) {
      setError(err.message || `Could not ${action} this agent run`);
    } finally {
      setAgentActionId('');
    }
  }

  async function fetchRepos() {
    try {
      const data = await apiFetch('/api/ai-pair/repos');
      if (data.success) setRepos(data.repositories || data.repos || []);
    } catch (err) {
      setError('Failed to load repositories');
    }
  }

  async function handleCreateSession() {
    if (!selectedRepo) return;
    chatSessionRequestRef.current += 1;
    chatSendRequestRef.current += 1;
    setLoading(false);
    setCreatingSession(true);
    setError(null);
    try {
      const repo = repos.find((r) =>
        typeof r === 'string' ? r === selectedRepo : (r.fullName || r.name) === selectedRepo
      );
      const repoName = typeof repo === 'object' && repo ? repo.name : selectedRepo;
      const data = await apiFetch('/api/ai-pair/session', {
        method: 'POST',
        body: JSON.stringify({
          repositoryId: String((typeof repo === 'object' && repo && repo.id) || selectedRepo),
          repositoryName: repoName,
          repositoryOwner: (typeof repo === 'object' && repo && repo.owner) || '',
          branch: (typeof repo === 'object' && repo && repo.defaultBranch) || 'main',
          sessionName: `${repoName} · ${selectedLang}`,
          language: selectedLang,
        }),
      });
      if (data.success && data.session) {
        const sess = data.session;
        setSessions((prev) => [sess, ...prev]);
        setActiveSession(sess);
        setMessages([]);
        setRemaining(effectiveAiLimit);
        setShowNewSession(false);
      } else {
        setError(data.message || 'Failed to create session');
      }
    } catch (err) {
      setError(err.message || 'Failed to create session');
    } finally {
      setCreatingSession(false);
    }
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!input.trim() || !activeSession || loading) return;

    const requestId = ++chatSendRequestRef.current;
    const sessionRequestId = chatSessionRequestRef.current;
    const userMsg = { role: 'user', content: input, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    const currentInput = input;
    setInput('');
    setLoading(true);
    setError(null);
    if (agentMode) resetAgentRun();

    try {
      const data = await apiFetch('/api/ai-pair/chat', {
        method: 'POST',
        timeoutMs: agentMode ? 1800000 : 120000,
        body: JSON.stringify({
          sessionId: activeSession._id,
          message: currentInput,
          useAgentLoop: agentMode,
          provider: selectedAiModel?.provider,
          model: selectedAiModel?.model,
          companyId: selectedCompany?._id || undefined,
          codeContext: {
            workspace: { id: selectedCompany?._id, name: selectedCompany?.name },
            language: activeSession.language,
            files: [],
          },
        }),
      });
      if (
        requestId !== chatSendRequestRef.current ||
        sessionRequestId !== chatSessionRequestRef.current
      ) return;
      if (data.success) {
        if (data.agentMode && data.result) {
          const result = data.result;
          const steps = (result.iterations || []).map((it) => ({
            step: it.iteration,
            tool: it.reasoning?.action?.tool || it.action?.tool || '',
            success: it.result?.success,
          }));
          setAgentSteps((prev) => [
            ...prev,
            { type: 'done', status: 'done', success: result.success !== false, summary: result.summary },
          ]);
          const summaryText = formatAgentSummary(result.summary, result.success, result.error);
          const aiMsg = {
            role: 'assistant',
            content: summaryText,
            agentSummary: result.summary,
            agentSteps: steps,
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, aiMsg]);
        } else {
          const aiMsg = {
            role: 'assistant',
            content: (data.message && data.message.content) || 'No response.',
            codeChanges: data.actions && data.actions.length ? data.actions : [],
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, aiMsg]);
        }
        if (typeof data.aiLimit === 'number') {
          setRemaining(data.aiLimit);
        } else {
          setRemaining((r) => Math.max(0, r - 1));
        }
      }
    } catch (err) {
      if (
        requestId === chatSendRequestRef.current &&
        sessionRequestId === chatSessionRequestRef.current
      ) setError(err.message || 'Failed to send message');
    } finally {
      if (requestId === chatSendRequestRef.current) setLoading(false);
    }
  }

  function openNewSessionModal() {
    setShowNewSession(true);
    setSelectedRepo('');
    setSelectedLang('JavaScript');
    setError(null);
    fetchRepos();
  }

  function selectSession(sess) {
    chatSessionRequestRef.current += 1;
    chatSendRequestRef.current += 1;
    setActiveSession(sess);
    setMessages([]);
    setLoading(false);
    setRemaining(effectiveAiLimit);
    setError(null);
    const requestId = ++chatSessionRequestRef.current;
    apiFetch(`/api/ai-pair/session/${sess._id}`)
      .then((data) => {
        if (requestId !== chatSessionRequestRef.current) return;
        if (!data.success) throw new Error(data.message || 'Could not load conversation');
        setActiveSession(data.session || sess);
        setMessages((data.messages || []).map((message) => ({
          role: message.role,
          content: message.content,
          timestamp: message.createdAt,
          codeChanges: message.metadata?.codeChanges || [],
        })));
      })
      .catch((err) => {
        if (requestId === chatSessionRequestRef.current) setError(err.message || 'Could not load conversation');
      });
  }

  return (
    <AuthGuard>
      <Head>
        <title>AI Agent - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="workspace-container ail-agent-page">
        <Sidebar
          user={user}
          subscription={subscription}
          headerBranch={selectedExecution?.branch || 'Feature/auth-flow-redesign'}
        />
        <main className="workspace-main">
          <header className="workspace-header dash-header">
            <div>
              <p className="dash-crumb">
                BUILD <span className="sep">/</span> AI AGENT
              </p>
              <h1 className="dash-title">AI Agent</h1>
              <div className="dash-statusline">Let AI agents do the work for you</div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="ail-model-button"
                onClick={openModelPicker}
                title="Choose a configured cloud or connected BYOM model"
              >
                {selectedAiModel ? `${selectedAiModel.provider} · ${selectedAiModel.model}` : 'Change AI Model'}
              </button>
              <button type="button" onClick={() => router.push('/tasks')} className="btn-workspace btn-primary">
                <Sparkles className="w-4 h-4" />
                <span>Delegate Task</span>
              </button>
            </div>
          </header>

          {showModelPicker && (
            <div className="ail-model-backdrop" role="presentation" onMouseDown={(event) => {
              if (event.target === event.currentTarget) setShowModelPicker(false);
            }}>
              <section className="ail-model-dialog" role="dialog" aria-modal="true" aria-labelledby="ail-model-title">
                <header>
                  <div><p className="ail-eyebrow">Model preferences</p><h2 id="ail-model-title">Choose an AI model</h2></div>
                  <button type="button" onClick={() => setShowModelPicker(false)} aria-label="Close model picker"><X /></button>
                </header>
                {loadingAiProviders ? (
                  <div className="ail-model-loading"><Loader2 className="animate-spin" /> Checking configured and connected models…</div>
                ) : aiProviders.length ? (
                  <>
                    <label htmlFor="ail-model-select">Available models</label>
                    <select
                      id="ail-model-select"
                      value={draftAiModel ? JSON.stringify(draftAiModel) : ''}
                      onChange={(event) => setDraftAiModel(event.target.value ? JSON.parse(event.target.value) : null)}
                    >
                      {aiProviders.flatMap((provider) => {
                        const models = provider.type === 'cloud' ? [provider.model] : provider.models || [];
                        return models.map((model) => (
                          <option key={`${provider.key}:${model}`} value={JSON.stringify({ provider: provider.key, model })}>
                            {provider.name} · {model}
                          </option>
                        ));
                      })}
                    </select>
                    <p>Local BYOM options are listed only when Ollama or LM Studio is connected and has a model loaded.</p>
                  </>
                ) : (
                  <div className="ail-model-empty">
                    <AlertCircle />
                    <strong>No AI models are available</strong>
                    <span>Configure a cloud provider or connect Ollama/LM Studio with a loaded model, then refresh.</span>
                  </div>
                )}
                <footer>
                  <button type="button" className="btn-workspace btn-secondary" onClick={() => fetchAiProviders(true)} disabled={loadingAiProviders}>Refresh models</button>
                  <button type="button" className="btn-workspace btn-secondary" onClick={() => setShowModelPicker(false)}>Cancel</button>
                  <button type="button" className="btn-workspace btn-primary" onClick={saveAiModel} disabled={loadingAiProviders || !draftAiModel}>Use model</button>
                </footer>
              </section>
            </div>
          )}

          {activeView === 'runs' && <div className="workspace-content ail-workspace-content">
            <AgentRunsPanel
              sessions={agentSessions}
              selected={selectedExecution}
              loading={loadingAgentSessions}
              error={error}
              followUp={followUp}
              setFollowUp={setFollowUp}
              setError={setError}
              onSelect={selectAgentExecution}
              onAction={(action, execution, extra) => submitAgentAction(action, execution, extra)}
              actionId={agentActionId}
              onDelegate={() => router.push('/tasks')}
            />
          </div>}
          {activeView === 'chat' && (
              <div className="ail-content">
                <div className="ail-shell">
                  {/* Session rail */}
                  <aside className="ail-rail">
                    <div className="ail-rail-head">
                      <span className="ail-rail-title">
                        <MessageSquare className="w-4 h-4" style={{ color: '#12dce5' }} />
                        Sessions
                      </span>
                      <button type="button" className="ail-new" onClick={openNewSessionModal} title="New session">
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      {loadingSessions ? (
                        <div className="dash-empty">
                          <div className="dash-empty-ico">
                            <Loader2 className="w-5 h-5 animate-spin" />
                          </div>
                          <p className="dash-empty-title">Loading sessions...</p>
                        </div>
                      ) : sessions.length === 0 ? (
                        <div className="dash-empty">
                          <div className="dash-empty-ico">
                            <Sparkles className="w-5 h-5" />
                          </div>
                          <p className="dash-empty-title">No sessions yet</p>
                          <p className="dash-empty-sub">Start a pairing session to begin.</p>
                        </div>
                      ) : (
                        sessions.map((sess) => {
                          const isActive = activeSession?._id === sess._id;
                          return (
                            <button
                              key={sess._id}
                              type="button"
                              onClick={() => selectSession(sess)}
                              className={`ail-session ${isActive ? 'is-active' : ''}`}
                            >
                              <span className="ail-sess-ico">
                                <Sparkles className="w-4 h-4" />
                              </span>
                              <span className="ail-sess-main">
                                <span className="ail-sess-top">
                                  <span className="ail-sess-name">{sess.repositoryName || sess.repoName || 'Session'}</span>
                                </span>
                                <span className="ail-sess-meta">
                                  <span className="ail-sess-lang">{sess.language || '—'}</span>
                                  <span
                                    className="ail-sess-status"
                                    style={
                                      sess.status === 'active'
                                        ? { background: 'rgba(3,186,3,0.12)', color: '#03ba03' }
                                        : { background: 'rgba(255,255,255,0.05)', color: '#9aaeba' }
                                    }
                                  >
                                    {sess.status}
                                  </span>
                                </span>
                                <span className="ail-sess-time">{formatTime(sess.createdAt)}</span>
                              </span>
                              <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: isActive ? '#12dce5' : '#3a4657' }} />
                            </button>
                          );
                        })
                      )}
                    </div>
                  </aside>

                  <div className="ail-main-layout">
                    {/* Conversation */}
                    <div className="ail-conv">
                      <div className="ail-conv-toolbar">
                        <div className="ail-conv-identity">
                          <span className="ail-conv-avatar"><Bot className="h-4 w-4" /></span>
                          <div><strong>{activeSession?.repositoryName || activeSession?.repoName || 'AI Pair workspace'}</strong><span>{activeSession ? `${activeSession.language || 'Code'} · ${agentMode ? 'Agent workflow' : 'Pairing'}` : 'Create or select a session to begin'}</span></div>
                        </div>
                        <div className={`ail-connection-state ${activeSession ? 'is-connected' : ''}`}><span />{activeSession ? 'Session ready' : 'Not connected'}</div>
                      </div>
                      {error && (
                        <div className="std-alert std-alert-error mx-4 mt-4">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          <p className="flex-1">{error}</p>
                          <button type="button" onClick={() => setError(null)} className="text-[#ec8f8f] hover:text-white">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}

                      <div className="ail-scroll">
                        {!activeSession ? (
                          <div className="ail-empty">
                            <div className="src-empty-ico">
                              <Bot className="w-7 h-7" />
                            </div>
                            <p className="dash-empty-title" style={{ fontSize: '1rem', marginBottom: '0.35rem' }}>
                              AI Pair Programming
                            </p>
                            <p className="dash-empty-sub" style={{ maxWidth: '26rem', lineHeight: '1.5', marginBottom: '1.5rem' }}>
                              Get real-time coding assistance from AI. Start a new session to begin pairing.
                            </p>
                            <button
                              type="button"
                              onClick={openNewSessionModal}
                              className="btn-workspace btn-primary"
                            >
                              <Plus className="w-4 h-4" />
                              Start New Session
                            </button>
                          </div>
                        ) : (
                          <>
                            {messages.map((msg, i) => (
                              msg.role === 'user' ? (
                                <div key={i} className="ail-msg-row is-user">
                                  <div className="ail-bubble ail-bubble-user">
                                    <div className="ail-msg-head">
                                      <span className="ail-msg-who">You</span>
                                    </div>
                                    <span>{msg.content}</span>
                                    {msg.codeChanges && msg.codeChanges.length > 0 && (
                                      msg.codeChanges.map((change, ci) => <ChangeBlock key={`u${i}-${ci}`} change={change} />)
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div key={i} className="ail-msg-row">
                                  <div className="ail-bubble ail-bubble-ai">
                                    <div className="ail-msg-head">
                                      <Bot className="w-3.5 h-3.5" style={{ color: '#12dce5' }} />
                                      <span className="ail-msg-who">AI</span>
                                    </div>
                                    {renderCodeBlocks(msg.content, `a${i}`)}
                                    {msg.agentSteps && msg.agentSteps.length > 0 && (
                                      <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                        {msg.agentSteps.map((s, si) => (
                                          <div key={si} style={{ fontSize: '0.75rem', color: '#a9b7c4', display: 'flex', gap: '0.4rem' }}>
                                            <span className="mkt-mono" style={{ color: s.success === false ? '#ec1414' : '#12dce5' }}>
                                              {s.success === false ? '✕' : '✓'}
                                            </span>
                                            <span>Step {s.step}: {s.tool || 'Agent action'} {s.success === false ? 'needs attention' : 'completed'}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {msg.codeChanges && msg.codeChanges.length > 0 && (
                                      msg.codeChanges.map((change, ci) => <ChangeBlock key={`${i}-${ci}`} change={change} />)
                                    )}
                                  </div>
                                </div>
                              )
                            ))}
                            {loading && (
                              <>
                                {agentMode && agentSteps.length > 0 ? (
                                  <div className="ail-msg-row">
                                    <div className="ail-bubble ail-bubble-ai" style={{ width: '100%' }}>
                                      <div className="ail-msg-head">
                                        <Bot className="w-3.5 h-3.5" style={{ color: '#12dce5' }} />
                                        <span className="ail-msg-who">Agent working...</span>
                                      </div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
                                        {agentSteps.filter((s) => ['thinking', 'iteration', 'result', 'done'].includes(s.type)).map((s, idx) => {
                                          const isCompleteEvent = s.type === 'result' || s.type === 'done';
                                          const succeeded = s.type === 'done' ? s.success : s.result?.success;
                                          const ProgressIcon = isCompleteEvent
                                            ? (succeeded ? CheckCircle2 : XCircle)
                                            : Loader2;
                                          return (
                                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: isCompleteEvent && !succeeded ? '#ec1414' : '#c8ccd4' }}>
                                              <ProgressIcon className={`w-3 h-3 ${!isCompleteEvent ? 'animate-spin' : ''}`} style={{ color: isCompleteEvent ? (succeeded ? '#03ba03' : '#ec1414') : '#12dce5' }} />
                                              <span className="mkt-mono">
                                                {s.iteration ? `step ${s.iteration} · ` : ''}{getAgentProgressLabel(s)}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="ail-msg-row">
                                    <div className="ail-thinking ail-typing">
                                      <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#12dce5' }} />
                                      <span className="ail-msg-who">{agentMode ? 'Agent thinking...' : 'Thinking...'}</span>
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                            <div ref={messagesEndRef} />
                          </>
                        )}
                      </div>

                      {activeSession && (
                        <form onSubmit={handleSend} className="ail-composer">
                          <div className="ail-composer-mode">
                            <span className={`ail-composer-mode-indicator ${agentMode ? 'is-agent' : ''}`} />
                            <span>{agentMode ? 'Autonomous agent enabled' : 'Pair assistant enabled'}</span>
                            <span className="ail-composer-mode-hint">{agentMode ? 'Progress and tool activity appear in Agent operations.' : 'Enable agent mode for multi-step repository tasks.'}</span>
                          </div>
                          <div className="ail-field">
                            <textarea
                              value={input}
                              onChange={(e) => setInput(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
                              placeholder="Ask AI anything about your code..."
                              rows={1}
                              disabled={loading || remaining <= 0}
                            />
                            <button
                              type="submit"
                              disabled={!input.trim() || loading || remaining <= 0}
                              className="btn-workspace btn-primary"
                              title="Send"
                              style={{ minHeight: '46px' }}
                            >
                              <Send className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="ail-composer-note">
                            {remaining <= 0 ? (
                              <>
                                <AlertCircle className="w-3 h-3 ail-limit" />
                                <span className="ail-limit">Message limit reached for this session</span>
                              </>
                            ) : (
                              <span>Enter to send · Shift+Enter for newline</span>
                            )}
                            <span className="ml-auto">
                              {effectiveAiLimit === Infinity ? 'Unlimited messages' : `${remaining}/${effectiveAiLimit} messages today`}
                            </span>
                          </div>
                        </form>
                      )}
                    </div>
                    <AgentOperationsPanel
                      session={activeSession}
                      agentMode={agentMode}
                      onToggleMode={toggleAgentMode}
                      loading={loading}
                      steps={agentSteps}
                      messages={messages}
                      remaining={remaining}
                      aiLimit={effectiveAiLimit}
                    />
                  </div>
                </div>
              </div>
            )}
        </main>
      </div>

      {showNewSession && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="ws-modal w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.09)]">
              <div className="flex items-center gap-2.5">
                <span className="card-ico">
                  <Sparkles className="w-4 h-4" />
                </span>
                <h2 className="ws-modal-title">New Session</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowNewSession(false)}
                className="text-muted hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {error && (
                <div className="std-alert std-alert-error">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <p className="flex-1">{error}</p>
                </div>
              )}
              <div>
                <label className="ws-label">Repository</label>
                <select
                  value={selectedRepo}
                  onChange={(e) => setSelectedRepo(e.target.value)}
                  className="ws-select"
                >
                  <option value="">Select a repository...</option>
                  {repos.map((repo) => (
                    <option key={repo.fullName || repo.name || repo} value={repo.fullName || repo.name || repo}>
                      {repo.fullName || repo.name || repo}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="ws-label">Language</label>
                <div className="flex flex-wrap gap-2">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => setSelectedLang(lang)}
                      className={`ail-lang-chip ${selectedLang === lang ? 'is-active' : ''}`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleCreateSession}
                disabled={!selectedRepo || creatingSession}
                className="btn-workspace btn-primary w-full justify-center mt-2"
              >
                {creatingSession ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <MessageSquare className="w-4 h-4" />
                    Start Session
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}