import Link from 'next/link';
import { CheckSquare, CheckCircle2, Users, Github, Figma, Clock, MessageSquare, ExternalLink } from 'lucide-react';

const ICON_STYLES = {
  task: { bg: '#1e3a5f', color: '#3b82f6', Icon: CheckSquare },
  completed: { bg: '#0f3d2e', color: '#10b981', Icon: CheckCircle2 },
  team: { bg: '#2a1f4d', color: '#8b5cf6', Icon: Users },
  integration: { bg: '#3d2f0f', color: '#f59e0b', Icon: Clock },
  github: { bg: '#111827', color: '#e2e8f0', Icon: Github },
  discord: { bg: '#1e2247', color: '#5865F2', Icon: Users },
  figma: { bg: '#3d1f1a', color: '#f24e1e', Icon: Figma },
  slack: { bg: '#3d2f0f', color: '#e01e5a', Icon: Users },
};

function groupByDate(items) {
  const groups = [];
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const buckets = {
    Today: [],
    Yesterday: [],
    'This Week': [],
    Older: [],
  };

  for (const item of items) {
    const date = new Date(item.timestamp);
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (day.getTime() === today.getTime()) buckets.Today.push(item);
    else if (day.getTime() === yesterday.getTime()) buckets.Yesterday.push(item);
    else if (date >= weekAgo) buckets.ThisWeek.push(item);
    else buckets.Older.push(item);
  }

  for (const [label, entries] of Object.entries(buckets)) {
    if (entries.length > 0) groups.push({ label, items: entries });
  }

  return groups;
}

function ActionButton({ href, label, onClick }) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="text-[11px] text-blue-400 hover:text-blue-300 font-medium inline-flex items-center gap-1"
      >
        {label}
        <ExternalLink className="w-3 h-3" />
      </button>
    );
  }

  if (href) {
    return (
      <Link
        href={href}
        className="text-[11px] text-blue-400 hover:text-blue-300 font-medium inline-flex items-center gap-1"
      >
        {label}
        <ExternalLink className="w-3 h-3" />
      </Link>
    );
  }

  return null;
}

export default function ActivityFeed({ activity }) {
  if (activity === null) {
    return <p className="text-muted text-sm">Loading activity...</p>;
  }

  if (activity.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Clock className="w-12 h-12 mx-auto mb-4 text-gray-600" />
        <p className="text-sm font-medium text-gray-400 mb-1">No recent activity</p>
        <p className="text-xs text-gray-500">Connect integrations to see your activity here</p>
        <Link
          href="/settings#integrations"
          className="inline-block mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm no-underline"
        >
          Connect Integrations
        </Link>
      </div>
    );
  }

  const grouped = groupByDate(activity);

  return (
    <div className="flex flex-col gap-4">
      {grouped.map((group) => (
        <div key={group.label} className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{group.label}</p>
          {group.items.map((item, idx) => {
            const style = ICON_STYLES[item.icon] || ICON_STYLES[item.type] || ICON_STYLES.integration;
            const { Icon } = style;
            return (
              <div
                key={`${item.title}-${idx}`}
                className="flex gap-3 p-3 rounded-lg transition hover:bg-white/5"
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: style.bg, color: style.color }}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-sm mb-0.5 text-white truncate">{item.title}</div>
                    {item.actionLabel && (
                      <ActionButton href={item.href} label={item.actionLabel} onClick={item.onClick} />
                    )}
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    {item.description} - {item.relativeTime}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
