import { useMemo, useState } from 'react';
import {
  ChevronDown,
  Eye,
  Hammer,
  Search,
  ShieldCheck,
  Users,
  Workflow,
} from 'lucide-react';
import {
  formatSubagentDuration,
  summarizeSubagents,
  subagentStatusMeta,
} from '../lib/subagents';

const ROLE_ICONS = {
  coordinator: Workflow,
  scout: Search,
  builder: Hammer,
  verifier: ShieldCheck,
  reviewer: Eye,
};

function StatusDot({ status }) {
  const meta = subagentStatusMeta(status);
  return (
    <span className={`ail-subagent-dot is-${meta.tone}`} aria-hidden="true" />
  );
}

function WorkerRow({ worker }) {
  const Icon = ROLE_ICONS[worker.role] || Users;
  const meta = subagentStatusMeta(worker.status);
  const duration = formatSubagentDuration(worker.durationMs);

  return (
    <li className={`ail-subagent is-${meta.tone}`}>
      <span className="ail-subagent-role">
        <Icon className="w-3.5 h-3.5" />
      </span>
      <div className="ail-subagent-body">
        <div className="ail-subagent-head">
          <strong>{worker.label}</strong>
          <span className="ail-subagent-status">
            <StatusDot status={worker.status} />{meta.label}
          </span>
        </div>
        <p className="ail-subagent-task">{worker.task}</p>
        {worker.status === 'running' && (
          <div className="ail-subagent-bar" role="progressbar" aria-valuenow={worker.progress} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${worker.progress}%` }} />
          </div>
        )}
        <div className="ail-subagent-meta">
          {worker.touchedFiles?.length > 0 && (
            <span className="ail-subagent-files">
              {worker.touchedFiles.length} file{worker.touchedFiles.length === 1 ? '' : 's'}
            </span>
          )}
          {duration && <span>{duration}</span>}
        </div>
      </div>
    </li>
  );
}

/**
 * Coordinator card plus its worker list. Mock data today; the shape matches the
 * planned `agent:subagent` payload so this component does not change when the
 * backend starts sending real runs.
 */
export function SubagentTree({ run, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const summary = useMemo(() => summarizeSubagents(run), [run]);

  if (!run) return null;

  const running = summary.counts.running || 0;
  const done = summary.counts.done || 0;
  const blocked = summary.counts.blocked || 0;
  const active = Boolean(running);
  const parts = [`${summary.total} worker${summary.total === 1 ? '' : 's'}`];
  if (done) parts.push(`${done} done`);
  if (running) parts.push(`${running} running`);
  if (blocked) parts.push(`${blocked} blocked`);

  return (
    <div className={`ail-subagents ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="ail-subagents-head"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className={`ail-subagents-icon ${active ? 'is-active' : ''}`}>
          <Workflow className="w-3.5 h-3.5" />
        </span>
        <span className="ail-subagents-title">
          <strong>Subagents</strong>
          <small>{parts.join(' · ')}</small>
        </span>
        {run.mock && <span className="ail-subagents-badge">Preview</span>}
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
                <strong>{run.coordinator.label}</strong>
                <span className="ail-subagent-status">
                  <StatusDot status={run.coordinator.status} />
                  {subagentStatusMeta(run.coordinator.status).label}
                </span>
              </div>
              <p className="ail-subagent-task">{run.coordinator.task}</p>
            </div>
          </div>
          <ol className="ail-subagent-list">
            {run.workers.map((worker) => <WorkerRow key={worker.id} worker={worker} />)}
          </ol>
          {run.mock && (
            <p className="ail-subagents-note">
              Preview layout — worker activity is not reported by the agent yet.
            </p>
          )}
        </>
      )}
    </div>
  );
}
