import Link from 'next/link';
import NotificationBell from './NotificationBell';
import { GitBranch, Search, ChevronDown } from 'lucide-react';
import { getAvatarUrl } from '../lib/utils';

export default function WorkspaceGlobalHeader({
  user,
  branch = 'main',
  onWorkspaceClick,
  ciStatus = { label: 'CI Passing', tone: 'ok' },
  deployStatus = { label: 'Staging Live', tone: 'ok' },
  searchContent,
}) {
  const displayName = user?.fullName || user?.name || user?.email || 'User';
  const initials = displayName
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="workspace-global-header ail-global-header">
      <div className="ail-global-brand">
        <img src="/buildrs.png" alt="" />
        <strong>Buildrs<span>HQ</span></strong>
      </div>
      <div className="ail-global-tools">
        <button type="button" className="ail-branch-selector" onClick={onWorkspaceClick} disabled={!onWorkspaceClick} aria-label="Current branch">
          <GitBranch />
          <span>{branch}</span>
          <ChevronDown />
        </button>
        {ciStatus && <span className={`ail-global-chip is-ci ${ciStatus.tone === 'error' ? 'is-error' : ciStatus.tone === 'warn' ? 'is-warning' : ''}`}><i />{ciStatus.label}</span>}
        {deployStatus && <span className={`ail-global-chip is-staging ${deployStatus.tone === 'error' ? 'is-error' : deployStatus.tone === 'warn' ? 'is-warning' : ''}`}><i />{deployStatus.label}</span>}
        {searchContent || (
          <label className="ail-global-search">
            <Search />
            <input type="search" placeholder="Search specs, diff, agents" aria-label="Search specs, diff, agents" />
          </label>
        )}
        <NotificationBell placement="down" look="header" />
        <Link href="/profile" className="ail-global-avatar" title="Open profile" aria-label={`Open profile for ${displayName}`}>
          <img src={getAvatarUrl(user, displayName)} alt="" />
          {!user && (initials || 'US')}
        </Link>
      </div>
    </header>
  );
}
