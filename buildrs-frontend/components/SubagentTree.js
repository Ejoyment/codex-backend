import { useMemo, useState } from 'react';
import {
  ChevronDown,
  Eye,
  FlaskConical,
  Search,
  Users,
  Workflow,
  Wrench,
} from 'lucide-react';
import {
  formatSubagentDuration,
  subagentProgress,
  subagentRoleMeta,
  subagentStatusMeta,
  summarizeSubagents,
} from '../lib/subagents';

const ROLE_ICONS = {
  coordinator: Workflow,
  researcher: Search,
  coder: Wrench,
  reviewer: Eye,
  tester: FlaskConical,
};

function StatusDot({ status }) {
  const meta = subagentStatusMeta(status);
  return <span className={`ail-subagent-dot is-${meta.tone}`} aria-hidden="true" />;
}

function WorkerRow({ worker }) {
  const [open, setOpen] = useState(false);
  const Icon = ROLE_ICONS[worker.role] || Users;
  const role = subagentRoleMeta(worker.role);
  const meta = subagentStatusMeta(worker.status);
  const duration = formatSubagentDuration(worker);
  const detail = worker.error || worker.output;
  const progress = subagentProgress(worker);

  return (
    <li className={`ail-subagent is-${meta.tone}`}>
      <span className="ail-subagent-role">
        <Icon className="w-3.5 h-3.5" />
      </span>
      <div className="ail-subagent-body">
        <div className="ail-subagent-head">
          <strong>{role.label}</strong>
          <span className="ail-subagent-status">
            <StatusDot status={worker.status} />{meta.label}
          </span>
        </div>
        <p className="ail-subagent-task">{worker.task || worker.message || role.blurb}</p>
        {worker.status === 'running' && (
          <div
            className="ail-subagent-bar"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
        )}
        {(duration || detail) && (
          <div className="ail-subagent-meta">
            {duration && <span>{duration}</span>}
            {detail && (
            <button
              type="button"
              className="ail-subagent-expand"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
            >
                {open ? 'Hide output' : 'Output'}
                <ChevronDown className={`w-3 h-3 ${open ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
        )}
        {detail && open && (
          <pre className={`ail-subagent-output ${worker.error ? 'is-error' : ''}`.trim()}>{detail}</pre>
        )}
      </div>
    </li>
  );
}

/**
 * Coordinator (the parent run) plus its spawned subagents.
 *
 * `run` is `{ coordinator: { task, status }, workers }`; workers are normalized
 * by lib/subagents from API records and live socket events.
 */
export function SubagentTree({ run, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const workers = run?.workers || [];
  const summary = useMemo(() => summarizeSubagents(workers), [workers]);

  if (!run) return null;

  const { counts } = summary;
  const parts = [`${summary.total} worker${summary.total === 1 ? '' : 's'}`];
  if (counts.complete) parts.push(`${counts.complete} done`);
  if (counts.running) parts.push(`${counts.running} running`);
  if (counts.failed) parts.push(`${counts.failed} failed`);
  if (counts.idle) parts.push(`${counts.idle} queued`);

  const coordinatorStatus = subagentStatusMeta(run.coordinator?.status || 'idle');

  return (
    <div className={`ail-subagents ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="ail-subagents-head"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className={`ail-subagents-icon ${counts.running ? 'is-active' : ''}`}>
          <Workflow className="w-3.5 h-3.5" />
        </span>
        <span className="ail-subagents-title">
          <strong>Subagents</strong>
          <small>{summary.total ? parts.join(' · ') : 'None spawned'}</small>
        </span>
        <ChevronDown className={`ail-subagents-chevron ${open ? 'rotate-180' : ''}`} />
      </button>

      <div className="ail-subagents-progress" aria-hidden="true">
        <span style={{ width: `${summary.progress}%` }} />
      </div>

      {open && (
        <>
          <div className="ail-subagent-coordinator">
            <span className="ail-subagent-role is-coordinator">
              <Workflow className="w-3.5 h-3.5" />
            </span>
            <div className="ail-subagent-body">
              <div className="ail-subagent-head">
                <strong>{subagentRoleMeta('coordinator').label}</strong>
                <span className="ail-subagent-status">
                  <StatusDot status={run.coordinator?.status || 'idle'} />
                  {coordinatorStatus.label}
                </span>
              </div>
              <p className="ail-subagent-task">{run.coordinator?.task || 'No active run.'}</p>
            </div>
          </div>

          {workers.length ? (
            <ol className="ail-subagent-list">
              {workers.map((worker) => <WorkerRow key={worker.id} worker={worker} />)}
            </ol>
          ) : (
            <p className="ail-subagents-empty">
              No subagents have been spawned for this run. The agent works alone when a task is
              small enough to keep in one context.
            </p>
          )}
        </>
      )}
    </div>
  );
}
