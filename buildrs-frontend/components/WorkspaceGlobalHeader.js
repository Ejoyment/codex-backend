import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import NotificationBell from './NotificationBell';
import BrandLogo from './BrandLogo';
import { GitBranch, Search, ChevronDown, CheckCircle } from 'lucide-react';
import { getAvatarUrl } from '../lib/utils';

export default function WorkspaceGlobalHeader({
  user,
  branch = 'main',
  onWorkspaceClick,
  searchContent,
  onSearch,
  availableBranches = [],
  selectedBranch,
  onBranchSelect,
  branchError,
}) {
  const displayName = user?.fullName || user?.name || user?.email || 'User';
  const initials = displayName
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setBranchMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="workspace-global-header ail-global-header">
      <div className="ail-global-brand">
        <BrandLogo />
      </div>
      <div className="ail-global-tools">
        <div className="ail-branch-wrap" ref={dropdownRef}>
          <button
            type="button"
            className="ail-branch-selector"
            onClick={() => setBranchMenuOpen((open) => !open)}
            disabled={!onWorkspaceClick && availableBranches.length === 0}
            aria-label="Switch branch"
          >
            <GitBranch />
            <span>{selectedBranch || branch}</span>
            <ChevronDown className={branchMenuOpen ? 'rotate-180' : ''} />
          </button>
          {branchMenuOpen && availableBranches.length > 0 && (
            <div className="ail-branch-menu">
              {branchError && <div className="ail-drop-section">{branchError}</div>}
              {availableBranches.map((b) => (
                <button
                  key={b}
                  type="button"
                  className={`ail-drop-item ${b === (selectedBranch || branch) ? 'is-active' : ''}`}
                  onClick={() => {
                    onBranchSelect?.(b);
                    setBranchMenuOpen(false);
                  }}
                >
                  <GitBranch className="w-3.5 h-3.5" />
                  <span>{b}</span>
                  {b === (selectedBranch || branch) && <CheckCircle className="w-3.5 h-3.5 ml-auto" />}
                </button>
              ))}
              {!availableBranches.length && !branchError && (
                <div className="ail-drop-section">No branches available</div>
              )}
            </div>
          )}
        </div>
        {searchContent ? (
          searchContent
        ) : onSearch ? (
          <button
            type="button"
            className="ail-global-search-trigger"
            onClick={onSearch}
            aria-label="Search files and editor commands"
          >
            <Search className="w-4 h-4" />
            <span>Search specs, diff, agents</span>
            <kbd>⌘K</kbd>
          </button>
        ) : (
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
