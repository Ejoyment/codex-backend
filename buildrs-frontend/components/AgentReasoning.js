import { useState } from 'react';
import { Brain, CheckCircle2, ChevronDown, Loader2, Sparkles, Wrench, XCircle } from 'lucide-react';
import { progressLabel } from '../lib/agentProgress';

function formatClock(at) {
  if (!at) return '';
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function stepTone(step) {
  if (step.type === 'done' || step.type === 'result') {
    return step.success === false ? 'is-error' : 'is-success';
  }
  return 'is-active';
}

function stepDetail(step) {
  const parts = [];
  if (step.result?.message) parts.push(String(step.result.message));
  if (step.result?.error) parts.push(String(step.result.error));
  if (step.summary?.stopReason) parts.push(String(step.summary.stopReason));
  return parts.join('\n');
}

function StepRow({ step, active }) {
  const [open, setOpen] = useState(false);
  const detail = stepDetail(step);
  const tone = stepTone(step);
  const Icon = tone === 'is-active' ? Loader2 : tone === 'is-success' ? CheckCircle2 : XCircle;

  return (
    <li className={`ail-reason ${tone}`}>
      <span className="ail-reason-marker">
        <Icon className={`w-3.5 h-3.5 ${tone === 'is-active' && active ? 'animate-spin' : ''}`} />
      </span>
      <div className="ail-reason-body">
        <p className="ail-reason-label">{progressLabel(step)}</p>
        <div className="ail-reason-meta">
          {step.iteration > 0 && <span>Step {step.iteration}</span>}
          {step.tool && (
            <span className="ail-reason-tool">
              <Wrench className="w-3 h-3" />{step.tool}
            </span>
          )}
          {step.phase && <span>{step.phase}</span>}
          <span className="ail-reason-time">{formatClock(step.at)}</span>
          {detail && (
            <button
              type="button"
              className="ail-reason-toggle"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
            >
              {open ? 'Hide detail' : 'Detail'}
              <ChevronDown className={`w-3 h-3 ${open ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
        {detail && open && <pre className="ail-reason-detail">{detail}</pre>}
      </div>
    </li>
  );
}

/** Step-by-step list shared by the Reasoning tab and the chat thinking bubble. */
export function ReasoningPanel({ steps = [], emptyText = 'Agent decisions will appear here as the run starts.' }) {
  if (!steps.length) {
    return (
      <div className="ail-reason-empty">
        <Brain className="w-5 h-5" />
        <p>{emptyText}</p>
      </div>
    );
  }

  return (
    <ol className="ail-reason-list">
      {steps.map((step, index) => (
        <StepRow key={step.id || `${step.type}-${index}`} step={step} active={index === steps.length - 1} />
      ))}
    </ol>
  );
}

/** Inline reasoning message rendered between the user and assistant bubbles. */
export function ThinkingBubble({ message }) {
  const { intent, steps = [], at, done, failed } = message;
  const latest = steps.length ? steps[steps.length - 1] : null;

  return (
    <div className="ail-msg-row">
      <div className="ail-bubble ail-bubble-ai ail-thinking-bubble">
        <div className="ail-msg-head">
          <Brain className="w-3.5 h-3.5 ail-thinking-icon" />
          <span className="ail-msg-who">{done ? (failed ? 'Reasoning stopped' : 'Reasoning') : 'Thinking'}</span>
          <span className="ail-thinking-time">{formatClock(at)}</span>
        </div>
        <p className="ail-thinking-intent">{intent || 'Planning the change…'}</p>
        {steps.length > 0 && <ReasoningPanel steps={steps} />}
        {!done && (
          <span className="ail-thinking-progress" role="status">
            <span />{latest ? progressLabel(latest) : 'Waiting for the first event…'}
          </span>
        )}
      </div>
    </div>
  );
}

const SUMMARY_ROWS = [
  { key: 'goal', label: 'Goal' },
  { key: 'finalThought', label: 'Outcome' },
  { key: 'stopReason', label: 'Stopped because' },
];

/** Goal / outcome / stop reason taken from the run summary object. */
export function ReasoningSummary({ summary, success = true }) {
  if (!summary || typeof summary !== 'object') return null;
  const rows = SUMMARY_ROWS
    .map((row) => ({ ...row, value: typeof summary[row.key] === 'string' ? summary[row.key].trim() : '' }))
    .filter((row) => row.value);
  if (!rows.length) return null;

  return (
    <div className={`ail-summary ${success ? '' : 'is-error'}`.trim()}>
      <div className="ail-summary-head">
        <Sparkles className="w-3.5 h-3.5" />
        Reasoning summary
      </div>
      <dl>
        {rows.map((row) => (
          <div key={row.key}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
