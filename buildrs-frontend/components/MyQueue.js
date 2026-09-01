import { useRouter } from 'next/router';
import { Inbox, AlertCircle, Loader2 } from 'lucide-react';

const STATUS_STYLES = {
  pending: { bg: '#1f2937', text: '#9ca3af', label: 'Pending' },
  in_progress: { bg: '#1e3a5f', text: '#3b82f6', label: 'In Progress' },
  in_review: { bg: '#3d2f0f', text: '#f59e0b', label: 'In Review' },
  completed: { bg: '#0f3d2e', text: '#10b981', label: 'Completed' },
};

const PRIORITY_STYLES = {
  low: { bg: '#111827', text: '#9ca3af' },
  medium: { bg: '#1e3a5f', text: '#3b82f6' },
  high: { bg: '#3d2f0f', text: '#f59e0b' },
  urgent: { bg: '#3d1f1a', text: '#ef4444' },
};

export default function MyQueue({ tasks = [] }) {
  const router = useRouter();
  const queue = tasks.filter((task) => task.status !== 'completed').slice(0, 5);

  if (queue.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Inbox className="w-10 h-10 mx-auto mb-3 text-gray-600" />
        <p className="text-sm font-medium text-gray-400">Queue clear</p>
        <p className="text-xs text-gray-500">No pending or in-progress tasks right now.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {queue.map((task) => {
        const status = STATUS_STYLES[task.status] || STATUS_STYLES.pending;
        const priority = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium;
        const dueLabel = task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
        const isOverdue = dueLabel && new Date(task.dueDate) < new Date() && task.status !== 'completed';

        return (
          <div
            key={task.id}
            className="flex items-center gap-3 p-3 rounded-lg border border-gray-700 hover:border-gray-500 transition cursor-pointer"
            onClick={() => router.push('/tasks')}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-medium text-white truncate">{task.title}</p>
                {isOverdue && <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="px-2 py-0.5 rounded" style={{ background: status.bg, color: status.text }}>
                  {status.label}
                </span>
                <span className="px-2 py-0.5 rounded" style={{ background: priority.bg, color: priority.text }}>
                  {task.priority}
                </span>
                {dueLabel && (
                  <span className={`text-gray-400 ${isOverdue ? 'text-red-400' : ''}`}>
                    Due {dueLabel}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
