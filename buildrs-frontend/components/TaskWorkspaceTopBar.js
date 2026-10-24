import NotificationBell from './NotificationBell';
import { getAvatarUrl } from '../lib/utils';
import { ChevronDown, Search } from 'lucide-react';

export default function TaskWorkspaceTopBar({ user, selectedCompany, onWorkspaceClick }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/10 bg-[#0b0f17]/80 px-6 backdrop-blur">
      <button
        type="button"
        onClick={onWorkspaceClick}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-[#161b26] px-3 py-1.5 text-sm text-zinc-200 transition hover:border-white/20"
        aria-label="Open workspace"
      >
        <span className="h-2 w-2 rounded-full bg-cyan-400" />
        <span className="max-w-[220px] truncate font-medium">{selectedCompany?.name || 'main'}</span>
        <ChevronDown className="h-4 w-4 text-zinc-400" />
      </button>

      <div className="flex items-center gap-4">
        <div className="hidden items-center gap-2 lg:flex">
          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
            CI Passing
          </span>
          <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-400">
            Staging Live
          </span>
        </div>

        <label className="relative hidden w-72 md:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            aria-label="Search tasks"
            placeholder="Search tasks, projects"
            className="w-full rounded-full border border-white/10 bg-[#161b26] py-1.5 pl-9 pr-4 text-sm text-white placeholder-zinc-500 transition focus:border-cyan-500 focus:outline-none"
          />
        </label>

        <NotificationBell look="header" />
        <img
          className="h-9 w-9 rounded-full border border-cyan-500/40 object-cover"
          src={getAvatarUrl(user, user?.fullName || user?.name || 'User')}
          alt={user?.fullName || user?.name || 'User'}
        />
      </div>
    </header>
  );
}
