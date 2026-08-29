import Link from 'next/link';
import { CheckSquare, CheckCircle2, Users, Github, Figma, Clock } from 'lucide-react';

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

  return (
    <div className="flex flex-col gap-2">
      {activity.map((item, idx) => {
        const style = ICON_STYLES[item.icon] || ICON_STYLES[item.type] || ICON_STYLES.integration;
        const { Icon } = style;
        return (
          <div
            key={idx}
            className="flex gap-4 p-3 rounded-lg transition hover:bg-white/5"
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: style.bg, color: style.color }}
            >
              <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm mb-0.5 text-white">{item.title}</div>
              <div className="text-xs text-gray-400 truncate">
                {item.description} - {item.relativeTime}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
