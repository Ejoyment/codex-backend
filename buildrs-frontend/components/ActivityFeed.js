import Link from 'next/link';
import { CheckSquare, CheckCircle2, Users, Github, Figma, Clock, MessageSquare, ExternalLink } from 'lucide-react';

const ICON_STYLES = {
  task: { bg: 'rgba(47,214,230,0.12)', color: '#2fd6e6', Icon: CheckSquare },
  completed: { bg: 'rgba(52,211,153,0.12)', color: '#34d399', Icon: CheckCircle2 },
  team: { bg: 'rgba(167,139,250,0.12)', color: '#a78bfa', Icon: Users },
  integration: { bg: 'rgba(229,184,74,0.12)', color: '#e5b84a', Icon: Clock },
  github: { bg: 'rgba(255,255,255,0.06)', color: '#e2e8f0', Icon: Github },
  discord: { bg: 'rgba(88,101,242,0.15)', color: '#8492f6', Icon: Users },
  figma: { bg: 'rgba(242,78,30,0.12)', color: '#f4684e', Icon: Figma },
  slack: { bg: 'rgba(224,30,90,0.12)', color: '#f0507e', Icon: Users },
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
  const classes = 'insight-action';
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {label}
        <ExternalLink className="w-3 h-3" />
      </button>
    );
  }

  if (href) {
    return (
      <Link href={href} className={classes}>
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
      <div className="dash-empty">
        <div className="dash-empty-ico">
          <Clock className="w-5 h-5" />
        </div>
        <p className="dash-empty-title">No recent activity</p>
        <p className="dash-empty-sub">Connect integrations to see your activity here</p>
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
    <div>
      {grouped.map((group) => (
        <div key={group.label}>
          <div className="feed-group-label">{group.label}</div>
          {group.items.map((item, idx) => {
            const style = ICON_STYLES[item.icon] || ICON_STYLES[item.type] || ICON_STYLES.integration;
            const { Icon } = style;
            return (
              <div key={`${item.title}-${idx}`} className="feed-row">
                <div className="feed-ico" style={{ background: style.bg, color: style.color }}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-sm mb-0.5 text-white truncate">{item.title}</div>
                    {item.actionLabel && (
                      <ActionButton href={item.href} label={item.actionLabel} onClick={item.onClick} />
                    )}
                  </div>
                  <div className="feed-meta truncate">
                    {item.description} <span className="feed-time">— {item.relativeTime}</span>
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