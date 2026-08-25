import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, CheckSquare, Users, Code, Settings, MessageSquare, Sparkles } from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/teams', label: 'Teams', icon: Users },
  { href: '/source-code', label: 'Source Code', icon: Code },
  { href: '/editor', label: 'Editor', icon: Code },
  { href: '/ai-pair', label: 'AI Pair', icon: Sparkles },
  { href: '/messaging', label: 'Messaging', icon: MessageSquare },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ user, subscription }) {
  const pathname = usePathname();

  return (
    <aside className="workspace-sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-content">
          <div className="sidebar-icon">
            <img src="/buildrs.png" alt="BuildrsHQ" className="w-full h-full object-contain" />
          </div>
          <span className="sidebar-logo-text" style={{ fontSize: '20px' }}>BuildrsHQ</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
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
      </nav>

      <div className="sidebar-user">
        <div className="sidebar-user-info">
          <img
            id="sidebarAvatar"
            className="sidebar-user-avatar"
            src={user?.profilePicture || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.fullName || 'User')}&background=3b82f6&color=fff`}
            alt={user?.fullName || 'User'}
          />
          <div className="sidebar-user-details">
            <div id="sidebarName" className="sidebar-user-name">
              {user?.fullName || 'Loading...'}
            </div>
            <div id="sidebarRole" className="sidebar-user-role">
              {user?.role?.join(', ') || 'Team Member'}
            </div>
          </div>
        </div>
        <div id="subscriptionBadge" className="sidebar-badge">
          <span>{subscription?.plan || 'Free'}</span>
        </div>
      </div>
    </aside>
  );
}
