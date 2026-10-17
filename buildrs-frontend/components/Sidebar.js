import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { tierDisplayLabel, tierDisplayDetail } from '../lib/tier';
import {
  LayoutDashboard,
  CheckSquare,
  Users,
  FileCode2,
  Sparkles,
  Database,
  Plug2,
  Settings,
  ShieldCheck,
  Rocket,
  Server,
  FolderKanban,
  Edit3,
  FileText,
  Radio,
  Brain,
  LifeBuoy,
} from 'lucide-react';
import { getAvatarUrl } from '../lib/utils';

const NAV_SECTIONS = [
  {
    label: 'WORK',
    items: [
      { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
      { href: '/projects', label: 'Projects', icon: FolderKanban },
      { href: '/tasks', label: 'Tasks', icon: CheckSquare },
    ],
  },
  {
    label: 'BUILD',
    items: [
      { href: '/editor', label: 'Editor', icon: Edit3 },
      { href: '/specs', label: 'Figma', icon: FileCode2 },
      { href: '/ai-pair', label: 'AI Agent', icon: Sparkles },
      { href: '/specs', label: 'Specs', icon: FileText },
      { href: '/mcp', label: 'MCP Server', icon: Server },
    ],
  },
  {
    label: 'COLLABORATE',
    items: [
      { href: '/meeting-room', label: 'Debug Room', icon: Radio },
      { href: '/teams', label: 'Team', icon: Users },
      { href: '/team-memory', label: 'Team Memory', icon: Brain },
    ],
  },
  {
    label: 'SHIP',
    items: [
      { href: '/source-code', label: 'Git & PRs', icon: Database },
      { href: '/ci-cd', label: 'Deploy', icon: Rocket },
    ],
  },
  {
    label: 'MANAGE',
    items: [
      { href: '/billing', label: 'Billing & Plans', icon: Plug2 },
      { href: '/audit', label: 'Audit Report', icon: ShieldCheck },
      { href: '/support-admin', label: 'Support Admin', icon: LifeBuoy },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export default function Sidebar({ user, subscription }) {
  const pathname = usePathname();

  return (
    <aside className="workspace-sidebar">
      <div className="sidebar-logo">
        <Link href="/dashboard" className="sidebar-logo-content no-underline" style={{ textDecoration: 'none' }}>
          <img src="/buildrs.png" alt="BuildrsHQ" className="w-7 h-7 rounded" />
          <span className="sidebar-logo-text text-[17px] font-semibold tracking-tight text-white">
            Buildrs
          </span>
          <span className="mkt-mono text-[10px] uppercase tracking-[0.18em] text-[#686e7c]">· hq</span>
        </Link>
      </div>

      <nav className="sidebar-nav">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-4">
            <div className="sidebar-nav-section text-[10px] tracking-wider text-zinc-500 font-semibold px-3 mb-1.5">{section.label}</div>
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'));
                return (
                  <Link
                    key={item.href + item.label}
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

      <div className="sidebar-user border-t border-white/5 pt-3 mt-auto">
        <div className="sidebar-user-info">
          <img
            id="sidebarAvatar"
            className="sidebar-user-avatar"
            src={getAvatarUrl(user, user?.fullName || user?.name || 'User')}
            alt={user?.fullName || user?.name}
          />
          <div className="sidebar-user-details">
            <div id="sidebarName" className="sidebar-user-name">
              {user?.fullName || user?.name || 'Loading...'}
            </div>
            <div id="sidebarRole" className="sidebar-user-role text-zinc-400 text-xs">
              {Array.isArray(user?.role) ? user.role.join(', ') : (user?.role || 'Member')}
            </div>
          </div>
        </div>
        {tierDisplayLabel(subscription, user?.subscription?.tier) && (
          <div id="subscriptionBadge" className="sidebar-badge mt-2" title={tierDisplayDetail(subscription, user?.subscription?.tier)}>
            <span className="text-[#34d399] bg-[#34d399]/10 px-2 py-0.5 rounded text-[11px] font-medium">{tierDisplayLabel(subscription, user?.subscription?.tier)}</span>
          </div>
        )}
      </div>
    </aside>
  );
}