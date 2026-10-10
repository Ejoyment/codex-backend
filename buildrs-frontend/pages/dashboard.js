import { useState, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Sidebar from '../components/Sidebar';
import NotificationBell from '../components/NotificationBell';
import AuthGuard from '../components/AuthGuard';
import TrialBanner from '../components/TrialBanner';
import DashboardSkeleton from '../components/DashboardSkeleton';
import useAuthStore from '../store/authStore';
import { useDashboard } from '../hooks/useDashboard';
import { getAvatarUrl } from '../lib/utils';
import {
  Plus,
  RotateCw,
  Search,
  ChevronDown,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  CheckSquare,
  AlertTriangle,
  Layers,
  GitBranch,
  Terminal,
  FileCode,
  FolderKanban,
  Play,
  Users,
  Server,
  Radio,
  Rocket,
  Plug2,
  Activity,
} from 'lucide-react';

function formatGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function relativeTime(date) {
  if (!date) return '';
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(date).toLocaleDateString();
}

const TONE_CLASSES = {
  ok: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  warn: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  error: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
};

const ACTIVITY_ICON = {
  code: { Icon: FileCode, cls: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400' },
  git: { Icon: GitBranch, cls: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400' },
  deploy: { Icon: Rocket, cls: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' },
  team: { Icon: Users, cls: 'bg-amber-500/10 border-amber-500/20 text-amber-400' },
  system: { Icon: Activity, cls: 'bg-purple-500/10 border-purple-500/20 text-purple-400' },
};

const CONNECTION_ICON = {
  github: { Icon: GitBranch, cls: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400' },
  mcp: { Icon: Server, cls: 'bg-purple-500/10 border-purple-500/20 text-purple-400' },
  deploy: { Icon: Rocket, cls: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' },
};

export default function Dashboard() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);
  const { trial, overview, projects, tasks, loading, loadStats, loadOverview, loadProjects, loadTasks } = useDashboard();

  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [showDevTabNav, setShowDevTabNav] = useState('Terminal');

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    const matches = [];

    (projects || []).forEach((p) => {
      if (`${p.name} ${p.description || ''}`.toLowerCase().includes(q)) {
        matches.push({ key: `p-${p.name}`, label: p.name, sub: 'Project', href: '/workspace', Icon: FolderKanban });
      }
    });
    (tasks || []).forEach((t = {}) => {
      if (`${t.title || ''} ${t.status || ''}`.toLowerCase().includes(q)) {
        matches.push({ key: `t-${t.id || t._id || t.title}`, label: t.title, sub: `Task · ${t.status || ''}`, href: '/tasks', Icon: CheckSquare });
      }
    });
    (overview?.sprint?.items || []).forEach((s) => {
      if (s.title.toLowerCase().includes(q)) {
        matches.push({ key: `s-${s.id}`, label: s.title, sub: `Sprint · ${s.code}`, href: '/tasks', Icon: CheckSquare });
      }
    });
    (overview?.needsAttention || []).forEach((a) => {
      if (a.title.toLowerCase().includes(q)) {
        matches.push({ key: a.id, label: a.title, sub: 'Needs attention', href: a.href || '/tasks', Icon: AlertTriangle });
      }
    });

    return matches.slice(0, 8);
  }, [searchQuery, projects, tasks, overview]);

  const goToResult = (href) => {
    setSearchOpen(false);
    setSearchQuery('');
    router.push(href);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadStats(), loadOverview(), loadProjects(), loadTasks()]);
    setRefreshing(false);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchResults.length > 0) goToResult(searchResults[0].href);
  };

  const ws = overview?.workspace;
  const isEmpty = !overview || overview.isEmpty;

  const greetingName = user?.fullName?.split(' ')[0] || user?.name?.split(' ')[0] || 'there';
  const openAttentionCount = overview?.needsAttention?.length ?? 0;

  return (
    <AuthGuard>
      <Head>
        <title>Dashboard - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="workspace-container bg-[#0b0f17] text-white min-h-screen flex">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main flex-1 flex flex-col min-w-0">
          {/* Top bar */}
          <header className="h-16 px-6 border-b border-white/10 flex items-center justify-between bg-[#0b0f17]/80 backdrop-blur sticky top-0 z-30">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => router.push('/workspace')}
                className="flex items-center gap-2 bg-[#161b26] border border-white/10 px-3 py-1.5 rounded-lg text-sm text-zinc-200 cursor-pointer hover:border-white/20 transition"
              >
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                <span className="font-medium max-w-[220px] truncate">
                  {ws?.branch || 'main'}
                </span>
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              </button>
              <div className="hidden lg:flex items-center gap-3">
                {overview?.ciStatus && (
                  <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium ${TONE_CLASSES[overview.ciStatus.tone] || TONE_CLASSES.ok}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" /> {overview.ciStatus.label}
                  </span>
                )}
                {overview?.deployStatus && (
                  <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium ${TONE_CLASSES[overview.deployStatus.tone] || TONE_CLASSES.ok}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" /> {overview.deployStatus.label}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <form onSubmit={handleSearch} className="relative hidden md:block w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search tasks, projects"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
                  onFocus={() => setSearchOpen(true)}
                  onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                  className="w-full bg-[#161b26] border border-white/10 rounded-lg pl-9 pr-4 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition"
                />
                {searchOpen && searchQuery.trim().length >= 2 && (
                  <div className="absolute top-full mt-2 left-0 right-0 bg-[#161b26] border border-white/10 rounded-lg shadow-2xl overflow-hidden z-40">
                    {searchResults.length === 0 ? (
                      <div className="px-4 py-3 text-xs text-zinc-500">No matches for “{searchQuery}”</div>
                    ) : (
                      searchResults.map((r) => {
                        const Icon = r.Icon;
                        return (
                          <button
                            key={r.key}
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); goToResult(r.href); }}
                            className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-white/5 transition"
                          >
                            <Icon className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                            <span className="min-w-0 flex-1">
                              <span className="block text-xs font-medium text-white truncate">{r.label}</span>
                              <span className="block text-[10px] text-zinc-500">{r.sub}</span>
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </form>

              <NotificationBell look="header" />

              <div className="flex items-center gap-3 pl-2 border-l border-white/10">
                <img
                  className="w-9 h-9 rounded-full object-cover border border-cyan-500/40"
                  src={getAvatarUrl(user, user?.fullName || user?.name || 'User')}
                  alt={user?.fullName || user?.name || 'User'}
                />
              </div>
            </div>
          </header>

          <div className="workspace-content p-8 max-w-7xl mx-auto w-full space-y-6">
            <TrialBanner trial={trial} />

            {/* Greeting */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
              <div>
                <p className="text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-1">DEVELOPMENT COMMAND CENTER</p>
                <h1 className="text-3xl font-bold tracking-tight text-white">
                  {formatGreeting()}, {greetingName}.
                </h1>
                <p className="text-sm text-zinc-400 mt-1">
                  {loading
                    ? 'Loading your workspace…'
                    : openAttentionCount > 0
                      ? `Your workspace is moving. ${openAttentionCount} item${openAttentionCount === 1 ? '' : 's'} need your attention.`
                      : 'Your workspace is up to date.'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="bg-[#161b26] hover:bg-[#1f2636] border border-white/10 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition"
                  onClick={handleRefresh}
                  disabled={refreshing}
                >
                  <RotateCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
                <button
                  type="button"
                  className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition shadow-lg shadow-cyan-500/20"
                  onClick={() => router.push('/tasks?action=new')}
                >
                  <Plus className="w-4 h-4" />
                  New Project
                </button>
                <button
                  type="button"
                  className="bg-[#161b26] hover:bg-[#1f2636] border border-white/10 text-cyan-400 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition"
                  onClick={() => router.push('/ai-pair')}
                >
                  <Sparkles className="w-4 h-4" />
                  Delegate to AI
                </button>
              </div>
            </div>

            {loading ? (
              <DashboardSkeleton />
            ) : isEmpty ? (
              /* Empty state */
              <div className="space-y-6">
                <div className="bg-[#111622] border border-white/10 rounded-2xl p-10 text-center shadow-xl">
                  <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mx-auto mb-4">
                    <FolderKanban className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">No active projects</h3>
                  <p className="text-xs text-zinc-400 mb-6 max-w-md mx-auto">
                    You haven't created any projects yet. Start building your first workspace.
                  </p>
                  <button
                    type="button"
                    className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-5 py-2.5 rounded-xl text-sm font-bold transition shadow-lg shadow-cyan-500/20 inline-flex items-center gap-2"
                    onClick={() => router.push('/tasks?action=new')}
                  >
                    <Plus className="w-4 h-4" /> Create Project
                  </button>
                </div>

                <div className="bg-[#111622] border border-white/10 rounded-2xl p-10 text-center shadow-xl">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto mb-4">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">No items need attention</h3>
                  <p className="text-xs text-zinc-400">Everything is up to date. Your workspace is healthy and ready for action.</p>
                </div>

                <div className="bg-[#111622] border border-white/10 rounded-2xl p-10 text-center shadow-xl">
                  <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mx-auto mb-4">
                    <Play className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">No active development</h3>
                  <p className="text-xs text-zinc-400 mb-4">There are no running agents or builds currently. Start a task to see activity here.</p>
                  <div className="flex items-center justify-center gap-6 text-xs text-zinc-500 border-t border-white/5 pt-4">
                    <span>No terminal output</span>
                    <span>·</span>
                    <span>No diff available</span>
                    <span>·</span>
                    <span>No validation</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-[#111622] border border-white/10 rounded-2xl p-6 shadow-xl text-center">
                    <h3 className="font-bold text-white text-base mb-4">Current Sprint</h3>
                    <div className="flex items-center justify-center gap-3 mb-6">
                      <span className="bg-[#161b26] border border-white/10 px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-400">0 In progress</span>
                      <span className="bg-[#161b26] border border-white/10 px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-400">0 In review</span>
                      <span className="bg-[#161b26] border border-white/10 px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-400">0 Completed</span>
                    </div>
                    <div className="bg-[#161b26] border border-white/5 rounded-xl p-8">
                      <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mx-auto mb-3">
                        <FolderKanban className="w-5 h-5" />
                      </div>
                      <h4 className="font-bold text-white text-sm mb-1">No tasks in this sprint</h4>
                      <p className="text-xs text-zinc-400 mb-4 max-w-xs mx-auto">Add a task to start tracking progress, or open the task board to plan the next sprint.</p>
                      <button
                        type="button"
                        className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-4 py-2 rounded-lg text-xs font-bold transition inline-flex items-center gap-2"
                        onClick={() => router.push('/tasks')}
                      >
                        <Plus className="w-3.5 h-3.5" /> Add task
                      </button>
                    </div>
                  </div>

                  <div className="bg-[#111622] border border-white/10 rounded-2xl p-6 shadow-xl text-center flex flex-col justify-between">
                    <h3 className="font-bold text-white text-base mb-4">Recent activity</h3>
                    <div className="bg-[#161b26] border border-white/5 rounded-xl p-12 my-auto">
                      <h4 className="font-bold text-white text-sm mb-1">No recent activities</h4>
                      <p className="text-xs text-zinc-400">Recent activities will show up here.</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Workspace overview */}
                <div className="bg-[#111622] border border-white/10 rounded-2xl p-6 shadow-xl">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-white/10">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                        <FolderKanban className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2.5">
                          <h2 className="text-lg font-bold text-white">{ws?.name}</h2>
                          <span className="flex items-center gap-1 text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> {ws?.status}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          {ws?.fullName} · {ws?.branch} {ws?.updatedAt ? `· updated ${relativeTime(ws.updatedAt)}` : ''}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="bg-[#161b26] hover:bg-cyan-500 hover:text-slate-950 border border-white/10 text-white px-5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition self-start lg:self-auto group"
                      onClick={() => router.push('/editor')}
                    >
                      Continue building
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-6">
                    <div>
                      <div className="text-2xl font-bold text-white">{ws?.openTasks ?? 0}</div>
                      <div className="text-xs text-zinc-400 mt-0.5">Open tasks</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-white">{ws?.agentsRunning ?? 0}</div>
                      <div className="text-xs text-zinc-400 mt-0.5">Agents running</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-white">{ws?.validationPercent != null ? `${ws.validationPercent}%` : '—'}</div>
                      <div className="text-xs text-zinc-400 mt-0.5">Validation</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-white">{ws?.branch || 'main'}</div>
                      <div className="text-xs text-zinc-400 mt-0.5">Active branch</div>
                    </div>
                  </div>
                </div>

                {/* Needs your attention */}
                <div className="bg-[#111622] border border-white/10 rounded-2xl p-6 shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${openAttentionCount > 0 ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`} />
                      <h3 className="font-bold text-white text-base">Needs your attention</h3>
                      <span className="bg-amber-400/10 text-amber-400 px-2 py-0.5 rounded-full text-xs font-bold border border-amber-400/20">
                        {openAttentionCount}
                      </span>
                    </div>
                    {openAttentionCount > 0 && (
                      <button type="button" className="text-xs text-zinc-400 hover:text-white font-medium flex items-center gap-1 transition" onClick={() => router.push('/tasks')}>
                        View all <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
                      </button>
                    )}
                  </div>

                  {overview.needsAttention.length === 0 ? (
                    <div className="bg-[#161b26] border border-white/5 rounded-xl p-6 text-center">
                      <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                      <p className="text-sm font-semibold text-white">Nothing needs your attention</p>
                      <p className="text-xs text-zinc-400 mt-0.5">No blockers, failed builds, or approvals are waiting.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {overview.needsAttention.map((item) => {
                        const ic = item.type === 'validation'
                          ? { Icon: AlertTriangle, cls: 'bg-rose-500/10 text-rose-400 border-rose-500/20' }
                          : item.type === 'deployment'
                            ? { Icon: Layers, cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' }
                            : { Icon: Sparkles, cls: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' };
                        const ActionIcon = ic.Icon;
                        return (
                          <div key={item.id} className="bg-[#161b26] border border-white/5 hover:border-white/15 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition">
                            <div className="flex items-start gap-3.5">
                              <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${ic.cls}`}>
                                <ActionIcon className="w-4 h-4" />
                              </div>
                              <div>
                                <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded bg-white/5 text-zinc-300 border border-white/10">
                                  {item.badge}
                                </span>
                                <h4 className="font-semibold text-white text-sm mt-1">{item.title}</h4>
                                <p className="text-xs text-zinc-400 mt-0.5">{item.subtitle}</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="bg-[#1f2636] hover:bg-cyan-500 hover:text-slate-950 border border-white/10 text-white px-4 py-2 rounded-lg text-xs font-semibold transition shrink-0 self-end md:self-auto"
                              onClick={() => router.push(item.href || '/tasks')}
                            >
                              Review →
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Active development */}
                <div className="bg-[#111622] border border-white/10 rounded-2xl p-6 shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-5 h-5 text-cyan-400" />
                      <h3 className="font-bold text-white text-base">Active Development</h3>
                    </div>
                    {overview.activeDevelopment && (
                      <span className="flex items-center gap-1.5 text-xs bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-full border border-emerald-500/20 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
                      </span>
                    )}
                  </div>

                  {!overview.activeDevelopment ? (
                    <div className="bg-[#161b26] border border-white/5 rounded-xl p-8 text-center">
                      <Play className="w-6 h-6 text-cyan-400 mx-auto mb-2" />
                      <p className="text-sm font-semibold text-white">No active development</p>
                      <p className="text-xs text-zinc-400 mt-0.5">There are no running agents or builds right now. Delegate a task to see live progress here.</p>
                    </div>
                  ) : (
                    <>
                      <div className="bg-[#161b26] border border-white/10 rounded-xl p-5 mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <div className="text-xs text-cyan-400 font-semibold">{overview.activeDevelopment.taskCode}</div>
                            <h4 className="text-white font-bold text-base mt-0.5">{overview.activeDevelopment.taskTitle}</h4>
                          </div>
                          <span className="text-xs font-bold bg-cyan-500/10 text-cyan-400 px-2.5 py-1 rounded border border-cyan-500/20">
                            {overview.activeDevelopment.status}
                          </span>
                        </div>
                        <div className="text-xs text-zinc-400 mb-3">{overview.activeDevelopment.stepText}</div>

                        <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden mb-4">
                          <div className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-full rounded-full transition-all duration-500" style={{ width: `${overview.activeDevelopment.progressPercent}%` }} />
                        </div>

                        <div className="flex items-center gap-4 text-xs text-zinc-400">
                          <span className="flex items-center gap-1 text-zinc-300">
                            <span className="w-2 h-2 rounded-full bg-cyan-400" /> {overview.activeDevelopment.branch || 'agent'}
                          </span>
                          <span>·</span>
                          <span>{overview.activeDevelopment.filesChanged} files</span>
                          <span>·</span>
                          <span>{overview.activeDevelopment.checks} checks</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 border-b border-white/10 pb-3 mb-4">
                        {['Terminal', 'Logs'].map((tab) => (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setShowDevTabNav(tab)}
                            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${showDevTabNav === tab ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
                          >
                            {tab}
                          </button>
                        ))}
                      </div>

                      <div className="bg-[#0b0f17] border border-white/10 rounded-xl p-4 font-mono text-xs text-zinc-300 overflow-x-auto shadow-inner whitespace-pre-wrap min-h-[64px]">
                        {overview.activeDevelopment.terminalLog || 'No output captured yet.'}
                      </div>
                    </>
                  )}
                </div>

                {/* Sprint + recent activity */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 bg-[#111622] border border-white/10 rounded-2xl p-6 shadow-xl">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-white text-base">Current Sprint</h3>
                      <button type="button" className="text-xs text-cyan-400 hover:underline font-medium" onClick={() => router.push('/tasks')}>
                        Open Task Board →
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 mb-6">
                      <div className="bg-[#161b26] border border-cyan-500/40 px-4 py-2 rounded-xl text-xs font-semibold text-cyan-400 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-cyan-400" /> {overview.sprint.inProgress} In progress
                      </div>
                      <div className="bg-[#161b26] border border-amber-500/40 px-4 py-2 rounded-xl text-xs font-semibold text-amber-400 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-400" /> {overview.sprint.inReview} In review
                      </div>
                      <div className="bg-[#161b26] border border-emerald-500/40 px-4 py-2 rounded-xl text-xs font-semibold text-emerald-400 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" /> {overview.sprint.completed} Completed
                      </div>
                    </div>

                    {overview.sprint.items.length === 0 ? (
                      <div className="bg-[#161b26] border border-white/5 rounded-xl p-8 text-center">
                        <p className="text-sm font-semibold text-white">No tasks in this sprint</p>
                        <p className="text-xs text-zinc-400 mt-0.5">Add a task to start tracking progress.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {overview.sprint.items.map((task) => (
                          <div key={task.id} className="bg-[#161b26] border border-white/5 hover:border-white/15 rounded-xl p-3.5 flex items-center justify-between transition">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-xs font-bold font-mono text-zinc-400 shrink-0">{task.code}</span>
                              <span className="text-sm font-medium text-white truncate">{task.title}</span>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className={`text-[10px] font-bold px-2.5 py-1 rounded uppercase ${task.status === 'in_progress' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                                {task.status === 'in_progress' ? 'AI running' : 'Review'}
                              </span>
                              <span className="w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-300 font-bold text-xs flex items-center justify-center border border-cyan-500/30">
                                {task.assignee}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-[#111622] border border-white/10 rounded-2xl p-6 shadow-xl">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-white text-base">Recent activity</h3>
                      <button type="button" className="text-xs text-zinc-400 hover:text-white" onClick={() => router.push('/audit')}>
                        View all
                      </button>
                    </div>

                    {overview.recentActivity.length === 0 ? (
                      <div className="bg-[#161b26] border border-white/5 rounded-xl p-6 text-center">
                        <p className="text-sm font-semibold text-white">No recent activities</p>
                        <p className="text-xs text-zinc-400 mt-0.5">Recent activities will show up here.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {overview.recentActivity.map((item) => {
                          const meta = ACTIVITY_ICON[item.type] || ACTIVITY_ICON.system;
                          const Icon = meta.Icon;
                          return (
                            <div key={item.id} className="flex items-start gap-3">
                              <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${meta.cls}`}>
                                <Icon className="w-3.5 h-3.5" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-white truncate">{item.title}</p>
                                <p className="text-[11px] text-zinc-400 truncate">{item.subtitle} · {item.relativeTime}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Ship readiness + debug rooms */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-[#111622] border border-white/10 rounded-2xl p-6 shadow-xl">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-white text-base">Ship Readiness</h3>
                      {overview.shipReadiness.percent != null && (
                        <span className="text-cyan-400 font-bold text-sm">{overview.shipReadiness.percent}%</span>
                      )}
                    </div>

                    {overview.shipReadiness.percent == null ? (
                      <div className="bg-[#161b26] border border-white/5 rounded-xl p-8 text-center">
                        <p className="text-sm font-semibold text-white">Nothing to ship yet</p>
                        <p className="text-xs text-zinc-400 mt-0.5">Ship readiness appears once you have deployments or validations.</p>
                      </div>
                    ) : (
                      <>
                        <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden mb-6">
                          <div className="bg-cyan-400 h-full rounded-full" style={{ width: `${overview.shipReadiness.percent}%` }} />
                        </div>
                        <div className="space-y-3 mb-6">
                          {overview.shipReadiness.checks.map((check) => (
                            <div key={check.label} className="flex items-center justify-between text-xs">
                              <span className="flex items-center gap-2 text-zinc-300">
                                {check.ok
                                  ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                  : <AlertTriangle className="w-4 h-4 text-amber-400" />}
                                {check.label}
                              </span>
                              <span className={check.ok ? 'text-emerald-400 font-medium' : 'text-amber-400 font-medium'}>{check.value}</span>
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="w-full bg-[#161b26] hover:bg-cyan-500 hover:text-slate-950 border border-white/10 text-white py-2.5 rounded-xl text-sm font-semibold transition shadow"
                          onClick={() => router.push('/ci-cd')}
                        >
                          Prepare deployment
                        </button>
                      </>
                    )}
                  </div>

                  <div className="bg-[#111622] border border-white/10 rounded-2xl p-6 shadow-xl">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Radio className="w-5 h-5 text-emerald-400" />
                        <h3 className="font-bold text-white text-base">Debug Rooms</h3>
                      </div>
                      {overview.debugRooms.length > 0 && (
                        <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">LIVE</span>
                      )}
                    </div>

                    {overview.debugRooms.length === 0 ? (
                      <div className="bg-[#161b26] border border-white/5 rounded-xl p-8 text-center">
                        <p className="text-sm font-semibold text-white">No active debug rooms</p>
                        <p className="text-xs text-zinc-400 mt-0.5 mb-4">Start a live session to collaborate with your team in real time.</p>
                        <button
                          type="button"
                          className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-4 py-2 rounded-lg text-xs font-bold transition inline-flex items-center gap-2"
                          onClick={() => router.push('/meeting-room')}
                        >
                          <Plus className="w-3.5 h-3.5" /> Start session
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {overview.debugRooms.map((room) => (
                          <div key={room.id} className="bg-[#161b26] border border-white/5 rounded-xl p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="flex -space-x-2 shrink-0">
                                {room.participants.map((p, idx) => (
                                  <span key={idx} className="w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-300 font-bold text-xs flex items-center justify-center border border-cyan-500/40">
                                    {p}
                                  </span>
                                ))}
                              </div>
                              <span className="text-xs text-zinc-300 truncate">{room.title}</span>
                            </div>
                            <button
                              type="button"
                              className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-4 py-2 rounded-lg text-xs font-bold transition shrink-0"
                              onClick={() => router.push('/meeting-room')}
                            >
                              Join →
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Recent code + connections */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-[#111622] border border-white/10 rounded-2xl p-6 shadow-xl">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-white text-base">Recent Code Activities</h3>
                      <button type="button" className="text-xs text-zinc-400 hover:text-white" onClick={() => router.push('/source-code')}>
                        View Repo
                      </button>
                    </div>

                    {overview.recentActivity.filter((a) => a.type === 'code' || a.type === 'git').length === 0 ? (
                      <div className="bg-[#161b26] border border-white/5 rounded-xl p-8 text-center">
                        <p className="text-sm font-semibold text-white">No code activity yet</p>
                        <p className="text-xs text-zinc-400 mt-0.5">Commits and code changes will appear here.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {overview.recentActivity.filter((a) => a.type === 'code' || a.type === 'git').slice(0, 4).map((item) => (
                          <div key={item.id} className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3 min-w-0">
                              <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0 mt-0.5">
                                <GitBranch className="w-3.5 h-3.5" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-white truncate">{item.title}</p>
                                <p className="text-[11px] text-zinc-400 truncate">{item.subtitle}</p>
                              </div>
                            </div>
                            <span className="text-[11px] text-zinc-500 shrink-0">{item.relativeTime}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-[#111622] border border-white/10 rounded-2xl p-6 shadow-xl">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-white text-base">Workspace Connections</h3>
                      <button type="button" className="text-xs text-cyan-400 hover:underline" onClick={() => router.push('/integrations')}>
                        Manage
                      </button>
                    </div>

                    {overview.connections.length === 0 ? (
                      <div className="bg-[#161b26] border border-white/5 rounded-xl p-8 text-center">
                        <p className="text-sm font-semibold text-white">No connections yet</p>
                        <p className="text-xs text-zinc-400 mt-0.5 mb-4">Connect GitHub, Slack, or an MCP server to enrich your workspace.</p>
                        <button
                          type="button"
                          className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-4 py-2 rounded-lg text-xs font-bold transition inline-flex items-center gap-2"
                          onClick={() => router.push('/integrations')}
                        >
                          <Plug2 className="w-3.5 h-3.5" /> Add connection
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {overview.connections.map((conn) => {
                          const meta = CONNECTION_ICON[conn.provider] || CONNECTION_ICON.deploy;
                          const Icon = meta.Icon;
                          return (
                            <div key={conn.id} className="flex items-center justify-between bg-[#161b26] border border-white/5 rounded-xl p-3.5">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${meta.cls}`}>
                                  <Icon className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-white truncate">{conn.title}</p>
                                  <p className="text-[11px] text-zinc-400 truncate">{conn.subtitle}</p>
                                </div>
                              </div>
                              {conn.status === 'warn' && (
                                <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded text-[10px] font-bold shrink-0">check</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
