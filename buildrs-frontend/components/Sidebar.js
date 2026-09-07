import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CheckSquare,
  Users,
  CalendarClock,
  FileCode2,
  Sparkles,
  Database,
  MessageSquare,
  Plug2,
  Settings,
  LifeBuoy,
  Video,
} from 'lucide-react';
import { getAvatarUrl } from '../lib/utils';

const NAV_SECTIONS = [
  {
    label: 'Workspace',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/tasks', label: 'Tasks', icon: CheckSquare },
      { href: '/teams', label: 'Teams', icon: Users },
      { href: '/meetings', label: 'Meetings', icon: CalendarClock },
      { href: '/standup', label: 'Standup', icon: Video },
    ],
  },
  {
    label: 'Code & AI',
    items: [
      { href: '/editor', label: 'Editor', icon: FileCode2 },
      { href: '/source-code', label: 'Source', icon: Database },
      { href: '/ai-pair', label: 'AI Pair', icon: Sparkles },
      { href: '/team-memory', label: 'Team Memory', icon: Database },
    ],
  },
  {
    label: 'Connect',
    items: [
      { href: '/messaging', label: 'Messaging', icon: MessageSquare },
      { href: '/integrations', label: 'Integrations', icon: Plug2 },
    ],
  },
  {
    label: 'Manage',
    items: [
      { href: '/settings', label: 'Settings', icon: Settings },
      { href: '/support', label: 'Support', icon: LifeBuoy },
    ],
  },
];

const TIER_LABELS = {
  freebie: 'Free',
  starter: 'Free',
  professional: 'Pro',
  enterprise: 'Enterprise',
};

export default function Sidebar({ user, subscription }) {
  const pathname = usePathname();

  return (
    <aside className="workspace-sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-content">
          <div className="sidebar-icon">
            <img src="/buildrs.png" alt="BuildrsHQ" className="w-full h-full object-contain" />
          </div>
          <span className="sidebar-logo-text">BuildrsHQ</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <div className="sidebar-nav-section">{section.label}</div>
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                  >
                    <Icon className="sidebar-nav-icon" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="sidebar-user">
        <div className="sidebar-user-info">
          <img
            id="sidebarAvatar"
            className="sidebar-user-avatar"
            src={getAvatarUrl(user, user?.fullName || user?.name || 'User')}
            alt={user?.fullName || 'User'}
          />
          <div className="sidebar-user-details">
            <div id="sidebarName" className="sidebar-user-name">
              {user?.fullName || user?.name || 'Loading...'}
            </div>
            <div id="sidebarRole" className="sidebar-user-role">
              {user?.role?.join(', ') || 'Member'}
            </div>
          </div>
        </div>
        <div id="subscriptionBadge" className="sidebar-badge">
          <span>{TIER_LABELS[subscription?.tier] || TIER_LABELS[user?.subscription?.tier] || 'Free'}</span>
        </div>
      </div>
    </aside>
  );
}