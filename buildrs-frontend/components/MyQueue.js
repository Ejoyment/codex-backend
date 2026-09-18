import { useRouter } from 'next/router';
import { Inbox, AlertCircle, ChevronRight } from 'lucide-react';

const STATUS_STYLES = {
  pending: { bg: 'rgba(154,161,174,0.1)', text: '#9aa1ae', label: 'Pending' },
  in_progress: { bg: 'rgba(47,214,230,0.12)', text: '#2fd6e6', label: 'In Progress' },
  in_review: { bg: 'rgba(229,184,74,0.12)', text: '#e5b84a', label: 'In Review' },
  completed: { bg: 'rgba(52,211,153,0.12)', text: '#34d399', label: 'Completed' },
};

const PRIORITY_STYLES = {
  low: { dot: '#7d8494' },
  medium: { dot: '#2fd6e6' },
  high: { dot: '#e5b84a' },
  urgent: { dot: '#f87171' },
};

export default function MyQueue({ tasks = [] }) {
  const router = useRouter();
  const queue = tasks.filter((task) => task.status !== 'completed').slice(0, 5);

  if (queue.length === 0) {
    return (
      <div className="dash-empty">
        <div className="dash-empty-ico">
          <Inbox className="w-5 h-5" />
        </div>
        <p className="dash-empty-title">Queue clear</p>
        <p className="dash-empty-sub">No pending or in-progress tasks right now.</p>
      </div>
    );
  }

  return (
    <div>
      {queue.map((task) => {
        const status = STATUS_STYLES[task.status] || STATUS_STYLES.pending;
        const priority = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium;
        const dueLabel = task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
        const isOverdue = dueLabel && new Date(task.dueDate) < new Date();

        return (
          <div key={task.id} className="queue-row" onClick={() => router.push('/tasks')}>
            <span className="queue-dot" style={{ background: priority.dot }} />
            <div className="queue-main">
              <div className="flex items-center gap-2">
                <p className="queue-title">{task.title}</p>
                {isOverdue && <AlertCircle className="queue-warn" />}
              </div>
              <div className="queue-meta">
                <span className="pill" style={{ background: status.bg, color: status.text }}>
                  {status.label}
                </span>
                <span className="pill pill-mono" style={{ background: 'rgba(255,255,255,0.05)', color: '#9aa1ae' }}>
                  {task.priority}
                </span>
                {dueLabel && (
                  <span className={`queue-due ${isOverdue ? 'over' : ''}`}>Due {dueLabel}</span>
                )}
              </div>
            </div>
            <ChevronRight className="queue-chevron" />
          </div>
        );
      })}
    </div>
  );
}