import { useState, useMemo, useEffect, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { useDashboard } from '../hooks/useDashboard';
import CreateProjectWizard from '../components/CreateProjectWizard';
import {
  Plus,
  Search,
  ChevronDown,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  CheckSquare,
  AlertTriangle,
  Layers,
  GitBranch,
  Database,
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
  Bell
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
  const dashboardUserId = user?._id || user?.id || user?.userId || null;
  const { overview, projects, tasks, loading, loadStats, loadOverview, loadProjects, loadTasks } = useDashboard(dashboardUserId);

  const [hasHydrated, setHasHydrated] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [showDevTabNav, setShowDevTabNav] = useState('Terminal');
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const openedNewProjectRef = useRef(false);


  useEffect(() => {
    setHasHydrated(true);
  }, []);

  // Onboarding hands off with ?newProject=1 so "Create your first project"
  // lands directly in the existing wizard.
  useEffect(() => {
    if (!router.isReady || openedNewProjectRef.current) return;
    if (router.query.newProject !== '1') return;
    openedNewProjectRef.current = true;
    setIsCreatingProject(true);
    router.replace('/dashboard', undefined, { shallow: true });
  }, [router]);

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

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchResults.length > 0) goToResult(searchResults[0].href);
  };

  const handleProjectCreated = async () => {
    await Promise.all([loadStats(), loadOverview(), loadProjects()]);
    setIsCreatingProject(false);
  };

  const ws = overview?.workspace;
  const isEmpty = !overview || overview.isEmpty;

  const greetingName = user?.fullName?.split(' ')[0] || user?.name?.split(' ')[0] || 'there';
  const openAttentionCount = overview?.needsAttention?.length ?? 0;

  if (!hasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0e141d] text-white">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <AuthGuard>
      <Head>
        <title>Dashboard - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="workspace-container bg-[#0e141d] text-white min-h-screen flex">
        <Sidebar
          user={user}
          subscription={subscription}
          headerBranch={ws?.branch || 'main'}
          onWorkspaceClick={() => router.push('/workspace')}
          searchContent={(
            <form onSubmit={handleSearch} className="ail-global-search">
              <Search className="h-4 w-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Search tasks, projects"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                aria-label="Search tasks and projects"
              />
              {searchOpen && searchQuery.trim().length >= 2 && (
                <div className="absolute top-full mt-2 left-0 right-0 bg-[#182130] border border-white/10 rounded-lg shadow-2xl overflow-hidden z-40">
                  {searchResults.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-zinc-500">No matches for “{searchQuery}”</div>
                  ) : (
                    searchResults.map((result) => {
                      const Icon = result.Icon;
                      return (
                        <button
                          key={result.key}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); goToResult(result.href); }}
                          className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-white/5 transition"
                        >
                          <Icon className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs font-medium text-white truncate">{result.label}</span>
                            <span className="block text-[10px] text-zinc-500">{result.sub}</span>
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </form>
          )}
        />

        <main className="workspace-main flex-1 flex flex-col min-w-0">
          {isCreatingProject ? (
            <CreateProjectWizard
              initialSourceType="scratch"
              onClose={() => setIsCreatingProject(false)}
              onCreated={handleProjectCreated}
            />
          ) : (
            <>
              <div className="workspace-content dashboard-content p-6 w-full space-y-6">
                {/* The trial reminder lives in notifications now, so the
                    dashboard opens straight onto the work itself. */}

                {/* Greeting */}
                {(loading || !isEmpty) && (
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-[#12dce5] font-semibold mb-1">DEVELOPMENT COMMAND CENTER</p>
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
                    <div className="flex flex-wrap items-center gap-3.5">
                      <button
                        type="button"
                        className="ov-btn-primary"
                        onClick={() => setIsCreatingProject(true)}
                      >
                        New Project
                      </button>
                      <button
                        type="button"
                        className="ov-btn-outline"
                        onClick={() => router.push('/ai-pair')}
                      >
                        Delegate to AI
                      </button>
                    </div>
                  </div>
                )}

                {loading ? (
                  <div className="space-y-4" role="status" aria-label="Loading dashboard">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      {[0, 1, 2].map((item) => (
                        <div key={item} className="h-24 animate-pulse rounded-xl border border-white/[0.07] bg-white/[0.03]" />
                      ))}
                    </div>
                    <div className="min-h-64 animate-pulse rounded-xl border border-white/[0.07] bg-[#0d1119] p-5">
                      <div className="mb-5 h-4 w-36 rounded bg-white/[0.06]" />
                      <div className="space-y-3">
                        {[0, 1, 2, 3].map((item) => (
                          <div key={item} className="h-10 rounded-md bg-white/[0.035]" />
                        ))}
                      </div>
                    </div>
                  </div>
                ) : isEmpty ? (
                  /* Empty state */
                  <div className="space-y-4">
                    <section className="flex min-h-[116px] flex-col items-center justify-center rounded-xl border border-white/[0.07] bg-[#0d1119] px-5 py-3 text-center">
                      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-400">
                        <FolderKanban className="h-4 w-4" />
                      </div>
                      <h3 className="text-sm font-semibold text-white">{projects?.length ? 'Your project workspace is ready' : 'No active projects'}</h3>
                      <p className="mt-1 text-[11px] text-zinc-500">
                        {projects?.length
                          ? 'Your workspace is ready. Create a task to start making progress.'
                          : 'You haven’t created any projects yet. Start building your first workspace.'}
                      </p>
                      <button
                        type="button"
                        className="mt-2 rounded-md bg-cyan-500 px-3 py-1.5 text-[11px] font-semibold text-slate-950 transition hover:bg-cyan-400"
                        onClick={() => setIsCreatingProject(true)} // <-- UPDATED HERE
                      >
                        {projects?.length ? 'Create Another Project' : 'Create Project'}
                      </button>
                    </section>

                    <section className="flex min-h-[204px] flex-col items-center justify-center rounded-xl border border-white/[0.07] bg-[#0d1119] px-5 py-6 text-center">
                      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
                        <AlertTriangle className="h-4 w-4" />
                      </div>
                      <h3 className="text-sm font-semibold text-white">No items need attention</h3>
                      <p className="mt-1 text-[11px] text-zinc-500">Everything is up to date. Your workspace is healthy and ready for action.</p>
                    </section>

                    <section className="flex min-h-[206px] flex-col items-center justify-center rounded-xl border border-white/[0.07] bg-[#0d1119] px-5 py-6 text-center">
                      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-400">
                        <Play className="h-4 w-4" />
                      </div>
                      <h3 className="text-sm font-semibold text-white">No active development</h3>
                      <p className="mt-1 text-[11px] text-zinc-500">There are no running agents or builds currently. Start a task to see activity here.</p>
                      <div className="mt-3 flex flex-wrap items-center justify-center gap-4 border-b border-white/5 px-2 pb-2 text-[11px] text-zinc-500">
                        <span className="border-b border-cyan-400 pb-1 text-cyan-400">No terminal output</span>
                        <span>No diff available</span>
                        <span>No validation</span>
                      </div>
                      <div className="mt-4 font-mono text-[10px] leading-relaxed text-zinc-500">
                        <span className="rounded-full bg-cyan-500/10 px-2 py-1 text-cyan-300">● idle</span>
                        <p className="mt-2">No additional output yet.<br />Next step will appear here.</p>
                      </div>
                    </section>

                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                      <section className="rounded-xl border border-white/[0.07] bg-[#0d1119] p-4 lg:col-span-2">
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-white">Current Sprint</h3>
                          <button type="button" className="text-[11px] text-cyan-400 hover:text-cyan-300" onClick={() => router.push('/tasks')}>
                            Open Task Board <ArrowRight className="ml-1 inline h-3 w-3" />
                          </button>
                        </div>
                        <div className="mb-3 grid grid-cols-3 gap-2">
                          <div className="rounded-md border border-cyan-500/50 px-2 py-1.5 text-[10px] text-zinc-400"><strong className="mr-1 text-white">0</strong> In progress</div>
                          <div className="rounded-md border border-amber-500/50 px-2 py-1.5 text-[10px] text-zinc-400"><strong className="mr-1 text-white">0</strong> In review</div>
                          <div className="rounded-md border border-emerald-500/50 px-2 py-1.5 text-[10px] text-zinc-400"><strong className="mr-1 text-white">0</strong> Completed</div>
                        </div>
                        <div className="flex min-h-[82px] flex-col items-center justify-center rounded-md border border-white/5 bg-white/[0.02] px-4 py-2 text-center">
                          <div className="mb-1 flex h-7 w-7 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-400">
                            <FolderKanban className="h-3.5 w-3.5" />
                          </div>
                          <h4 className="text-xs font-semibold text-white">No tasks in this sprint</h4>
                          <p className="mt-1 text-[10px] text-zinc-500">Add a task to start tracking progress, or open the task board to plan the next sprint.</p>
                          <button type="button" className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-cyan-500/60 px-2.5 py-0.5 text-[10px] font-medium text-cyan-400 hover:bg-cyan-500/10" onClick={() => router.push('/tasks')}>
                            <Plus className="h-3 w-3" /> Add task
                          </button>
                        </div>
                      </section>

                      <section className="flex min-h-[168px] flex-col rounded-xl border border-white/[0.07] bg-[#0d1119] p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-white">Recent activity</h3>
                          <button type="button" className="text-[11px] text-cyan-400 hover:text-cyan-300" onClick={() => router.push('/audit')}>View all</button>
                        </div>
                        <div className="flex flex-1 flex-col items-center justify-center text-center">
                          <h4 className="text-xs font-semibold text-white">No recent activities</h4>
                          <p className="mt-1 text-[10px] text-zinc-500">All recent activities will be shown here.</p>
                        </div>
                      </section>
                    </div>

                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <section className="rounded-xl border border-cyan-500/15 bg-[#0d1119] p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="text-sm font-semibold text-white">Recent Terminal Output</h3>
                            <p className="text-[10px] text-zinc-500">No recent activity</p>
                          </div>
                          <Terminal className="h-4 w-4 text-cyan-400" />
                        </div>
                        <div className="mt-3 flex min-h-[88px] flex-col items-center justify-center rounded-lg border border-cyan-500/10 bg-[#0a0d15] px-4 py-3 text-center">
                          <Database className="mb-2 h-6 w-6 text-cyan-400/70" />
                          <p className="text-xs font-medium text-white">No recent activity</p>
                          <p className="mt-1 max-w-xs text-[10px] text-zinc-500">Your project is currently in a quiet state. Run a command or trigger a build to populate this dashboard.</p>
                          <button type="button" className="mt-2 rounded-md bg-[#1a2230] px-3 py-1 text-[10px] font-medium text-cyan-400 hover:bg-[#1d263b]" onClick={() => router.push('/editor')}>Run Build Command</button>
                        </div>
                      </section>

                      <section className="rounded-xl border border-cyan-500/15 bg-[#0d1119] p-4">
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-cyan-500/10 text-cyan-400"><Terminal className="h-3.5 w-3.5" /></div>
                          <div>
                            <h3 className="text-sm font-semibold text-white">Project Workspace</h3>
                            <p className="text-[10px] text-zinc-500">No active debug sessions found.</p>
                          </div>
                        </div>
                        <div className="mt-3 flex min-h-[88px] flex-col items-center justify-center rounded-lg border border-cyan-500/10 bg-[#0a0d15] p-3">
                          <div className="w-full max-w-[180px] rounded-md border border-cyan-500/15 px-3 py-2 font-mono text-[9px] leading-relaxed text-zinc-500">
                            <p><span className="text-cyan-400">$</span> npm debug</p>
                            <p><span className="text-cyan-400">›</span> Waiting for connection...</p>
                          </div>
                          <span className="mt-2 h-1 w-1 rounded-full bg-emerald-400" />
                          <button type="button" className="mt-2 rounded-md bg-[#1a2230] px-3 py-1 text-[10px] font-medium text-cyan-400 hover:bg-[#1d263b]" onClick={() => router.push('/debug-room')}>
                            <Plus className="mr-1 inline h-3 w-3" /> Start New Session
                          </button>
                        </div>
                      </section>
                    </div>

                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <section className="rounded-xl border border-white/[0.07] bg-[#0d1119]">
                        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
                          <h3 className="text-sm font-semibold text-white">Recent Code Activities</h3>
                          <button type="button" className="text-[11px] text-cyan-400 hover:text-cyan-300" onClick={() => router.push('/source-code')}>View Repo</button>
                        </div>
                        <div className="m-3 flex min-h-[92px] flex-col items-center justify-center rounded-md border border-white/5 bg-white/[0.02] px-4 py-3 text-center">
                          <div className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-zinc-400"><FileCode className="h-3.5 w-3.5" /></div>
                          <h4 className="text-[11px] font-semibold text-white">No recent code activities</h4>
                          <p className="mt-1 max-w-[230px] text-[10px] text-zinc-500">Once commits, merges, and refactors happen, they’ll appear here.</p>
                        </div>
                      </section>

                      <section className="rounded-xl border border-white/[0.07] bg-[#0d1119]">
                        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
                          <h3 className="text-sm font-semibold text-white">Workspace Connections</h3>
                          <button type="button" className="text-[11px] text-cyan-400 hover:text-cyan-300" onClick={() => router.push('/integrations')}>Manage</button>
                        </div>
                        <div className="flex min-h-[116px] flex-col items-center justify-center px-4 py-3 text-center">
                          <div className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400"><Plug2 className="h-3.5 w-3.5" /></div>
                          <h4 className="text-[11px] font-semibold text-white">No workspace connections yet</h4>
                          <p className="mt-1 max-w-[220px] text-[10px] text-zinc-500">Connect a repository or service to start seeing sync status and workspace activity here.</p>
                          <button type="button" className="mt-2 rounded-md bg-[#1a2230] px-3 py-1 text-[10px] font-medium text-cyan-400 hover:bg-[#1d263b]" onClick={() => router.push('/integrations')}>Connect a workspace</button>
                        </div>
                      </section>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Workspace overview */}
                    <div className="rounded-xl border border-white/[0.07] bg-[#0d1119] p-4">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                            <Layers className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <h2 className="text-base font-semibold text-white">{ws?.name}</h2>
                              <span className="flex items-center gap-1 text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> {ws?.status}
                              </span>
                            </div>
                            <p className="text-[11px] text-zinc-500 mt-1 flex items-center gap-1.5 flex-wrap">
                              <GitBranch className="h-3 w-3 shrink-0" />
                              <span className="truncate">{ws?.repoFullName || ws?.fullName}</span>
                              {ws?.technologies?.length > 0 && <span>· {ws.technologies.slice(0, 2).join(' + ')}</span>}
                              {ws?.updatedAt ? <span>· Updated {relativeTime(ws.updatedAt)}</span> : null}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="rounded-lg bg-[#1a2230] hover:bg-[#1d263b] border border-white/10 px-4 py-2 text-xs font-semibold text-cyan-400 transition self-start lg:self-center inline-flex items-center gap-2 group shrink-0"
                          onClick={() => router.push('/editor')}
                        >
                          Continue building
                          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mt-4">
                        {[
                          { value: ws?.openTasks ?? 0, label: 'Open tasks' },
                          { value: ws?.agentsRunning ?? 0, label: 'Agents running' },
                          { value: ws?.validationPercent != null ? `${ws.validationPercent}%` : '—', label: 'Validation' },
                          { value: ws?.branch || 'main', label: 'Active branch' },
                        ].map((stat) => (
                          <div key={stat.label} className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3.5 py-2.5">
                            <div className="text-base font-bold text-white leading-none truncate">{stat.value}</div>
                            <div className="text-[10px] text-zinc-500 mt-1.5">{stat.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Needs your attention */}
                    <div className="rounded-xl border border-white/[0.07] bg-[#0d1119] p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${openAttentionCount > 0 ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`} />
                          <h3 className="text-sm font-semibold text-white">Needs your attention</h3>
                          <span className="bg-amber-400/10 text-amber-400 px-2 py-0.5 rounded-full text-[10px] font-bold border border-amber-400/20">
                            {openAttentionCount}
                          </span>
                        </div>
                        {openAttentionCount > 0 && (
                          <button type="button" className="text-[11px] text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1 transition" onClick={() => router.push('/tasks')}>
                            View all <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
                          </button>
                        )}
                      </div>

                      {overview.needsAttention.length === 0 ? (
                        <div className="flex min-h-[100px] flex-col items-center justify-center rounded-md border border-white/5 bg-white/[0.02] px-4 py-3 text-center">
                          <div className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </div>
                          <p className="text-xs font-semibold text-white">Nothing needs your attention</p>
                          <p className="mt-1 text-[10px] text-zinc-500">No blockers, failed builds, or approvals are waiting.</p>
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
                            const actionLabel = item.actionLabel
                              || (item.type === 'validation' ? 'Inspect failures'
                                : item.type === 'deployment' ? 'Review deploy' : 'Review changes');
                            return (
                              <div key={item.id} className="rounded-md border border-white/5 bg-white/[0.02] p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 transition">
                                <div className="flex items-start gap-3">
                                  <div className={`mt-0.5 h-7 w-7 rounded-lg flex items-center justify-center shrink-0 border ${ic.cls}`}>
                                    <ActionIcon className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded bg-white/5 text-zinc-300 border border-white/10">
                                      {item.badge}
                                    </span>
                                    <h4 className="text-xs font-semibold text-white mt-1">{item.title}</h4>
                                    <p className="text-[10px] text-zinc-500 mt-1">{item.subtitle}</p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className="rounded-md bg-[#1a2230] px-3 py-1 text-[10px] font-medium text-cyan-400 hover:bg-[#1d263b] transition shrink-0 self-end md:self-auto"
                                  onClick={() => router.push(item.href || '/tasks')}
                                >
                                  {actionLabel} <span aria-hidden="true">›</span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Active development */}
                    <div className="rounded-xl border border-white/[0.07] bg-[#0d1119] p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Activity className="h-4 w-4 text-cyan-400" />
                          <h3 className="text-sm font-semibold text-white">Active Development</h3>
                        </div>
                        {overview.activeDevelopment && (
                          <span className="flex items-center gap-1 text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
                          </span>
                        )}
                      </div>

                      {!overview.activeDevelopment ? (
                        <div className="flex min-h-[100px] flex-col items-center justify-center rounded-md border border-white/5 bg-white/[0.02] px-4 py-3 text-center">
                          <div className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-400">
                            <Play className="h-3.5 w-3.5" />
                          </div>
                          <p className="text-xs font-semibold text-white">No active development</p>
                          <p className="mt-1 text-[10px] text-zinc-500">There are no running agents or builds right now. Delegate a task to see live progress here.</p>
                        </div>
                      ) : (
                        <>
                          <div className="rounded-md border border-white/5 bg-white/[0.02] p-3 mb-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                                  <Sparkles className="h-3.5 w-3.5" />
                                </div>
                                <div className="min-w-0">
                                  <h4 className="text-xs font-semibold text-white truncate">{overview.activeDevelopment.taskTitle}</h4>
                                  <p className="text-[10px] text-zinc-500 mt-0.5">{overview.activeDevelopment.taskCode}{overview.activeDevelopment.branch ? ` · ${overview.activeDevelopment.branch}` : ''}</p>
                                </div>
                              </div>
                              <span className="text-[10px] font-bold bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded-full border border-cyan-500/20 shrink-0">
                                {overview.activeDevelopment.status}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-zinc-500 mt-3 mb-1.5">
                              <span>{overview.activeDevelopment.stepText}</span>
                              <span className="text-zinc-400 font-medium">{overview.activeDevelopment.progressPercent}%</span>
                            </div>

                            <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden mb-3">
                              <div className="bg-cyan-400 h-full rounded-full transition-all duration-500" style={{ width: `${overview.activeDevelopment.progressPercent}%` }} />
                            </div>

                            <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-400">
                              <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.04] border border-white/5 px-2 py-1">
                                <GitBranch className="h-3 w-3" /> {overview.activeDevelopment.branch || 'agent'}
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.04] border border-white/5 px-2 py-1">
                                <FileCode className="h-3 w-3" /> {overview.activeDevelopment.filesChanged} files
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.04] border border-white/5 px-2 py-1">
                                <CheckCircle2 className="h-3 w-3 text-emerald-400" /> {overview.activeDevelopment.checks} checks
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-5 border-b border-white/5 pb-0 mb-3 text-[11px] text-zinc-500">
                            {['Terminal', 'Diff', 'Validation'].map((tab) => (
                              <button
                                key={tab}
                                type="button"
                                onClick={() => setShowDevTabNav(tab)}
                                className={`pb-2 -mb-px transition ${showDevTabNav === tab ? 'border-b-2 border-cyan-400 text-cyan-400 font-semibold' : 'hover:text-white'}`}
                              >
                                {tab}
                              </button>
                            ))}
                          </div>

                          <div className="rounded-lg bg-[#0a0d15] p-3 font-mono text-[10px] leading-relaxed text-zinc-400 overflow-x-auto whitespace-pre-wrap min-h-[64px]">
                            {showDevTabNav === 'Terminal' && (overview.activeDevelopment.terminalLog || 'No output captured yet.')}
                            {showDevTabNav === 'Diff' && (
                              overview.activeDevelopment.filesChanged > 0
                                ? `${overview.activeDevelopment.filesChanged} file${overview.activeDevelopment.filesChanged === 1 ? '' : 's'} changed on ${overview.activeDevelopment.branch || 'agent'} — open the Editor to review the diff.`
                                : 'No diff available yet.'
                            )}
                            {showDevTabNav === 'Validation' && (
                              overview.activeDevelopment.checks > 0
                                ? `${overview.activeDevelopment.checks} validation check${overview.activeDevelopment.checks === 1 ? '' : 's'} recorded for this run.`
                                : 'No validation results yet.'
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Sprint + recent activity */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                      <div className="lg:col-span-2 rounded-xl border border-white/[0.07] bg-[#0d1119] p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-white">Current Sprint</h3>
                          <button type="button" className="text-[11px] text-cyan-400 hover:text-cyan-300" onClick={() => router.push('/tasks')}>
                            Open Task Board →
                          </button>
                        </div>

                        <div className="mb-3 grid grid-cols-3 gap-2">
                          <div className="rounded-md border border-cyan-500/50 px-2 py-1.5 text-[10px] text-zinc-400"><strong className="mr-1 text-white">{overview.sprint.inProgress}</strong> In progress</div>
                          <div className="rounded-md border border-amber-500/50 px-2 py-1.5 text-[10px] text-zinc-400"><strong className="mr-1 text-white">{overview.sprint.inReview}</strong> In review</div>
                          <div className="rounded-md border border-emerald-500/50 px-2 py-1.5 text-[10px] text-zinc-400"><strong className="mr-1 text-white">{overview.sprint.completed}</strong> Completed</div>
                        </div>

                        {overview.sprint.items.length === 0 ? (
                          <div className="flex min-h-[82px] flex-col items-center justify-center rounded-md border border-white/5 bg-white/[0.02] px-4 py-2 text-center">
                            <div className="mb-1 flex h-7 w-7 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-400">
                              <FolderKanban className="h-3.5 w-3.5" />
                            </div>
                            <p className="text-xs font-semibold text-white">No tasks in this sprint</p>
                            <p className="mt-1 text-[10px] text-zinc-500">Add a task to start tracking progress, or open the task board to plan the next sprint.</p>
                            <button type="button" className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-cyan-500/60 px-2.5 py-0.5 text-[10px] font-medium text-cyan-400 hover:bg-cyan-500/10" onClick={() => router.push('/tasks')}>
                              <Plus className="h-3 w-3" /> Add task
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {overview.sprint.items.map((task) => (
                              <div key={task.id} className="rounded-md border border-white/5 bg-white/[0.02] px-3 py-2 flex items-center justify-between transition">
                                <div className="flex items-center gap-3 min-w-0">
                                  <span className="text-[10px] font-bold font-mono text-zinc-400 shrink-0">{task.code}</span>
                                  <span className="text-xs font-medium text-white truncate">{task.title}</span>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${task.status === 'in_progress' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                                    {task.status === 'in_progress' ? 'AI running' : 'Review'}
                                  </span>
                                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500/20 text-[10px] font-bold text-cyan-300 border border-cyan-500/30">
                                    {task.assignee}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="rounded-xl border border-white/[0.07] bg-[#0d1119] p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-white">Recent activity</h3>
                          <button type="button" className="text-[11px] text-cyan-400 hover:text-cyan-300" onClick={() => router.push('/audit')}>
                            View all
                          </button>
                        </div>

                        {overview.recentActivity.length === 0 ? (
                          <div className="flex min-h-[100px] flex-1 flex-col items-center justify-center text-center">
                            <p className="text-xs font-semibold text-white">No recent activities</p>
                            <p className="mt-1 text-[10px] text-zinc-500">Recent activities will show up here.</p>
                          </div>
                        ) : (
                          <div className="relative space-y-4">
                            <span className="pointer-events-none absolute left-[13px] top-2 bottom-2 w-px bg-white/[0.07]" aria-hidden="true" />
                            {overview.recentActivity.map((item) => {
                              const meta = ACTIVITY_ICON[item.type] || ACTIVITY_ICON.system;
                              const Icon = meta.Icon;
                              return (
                                <div key={item.id} className="relative flex items-start gap-3">
                                  <div className={`relative z-10 w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 bg-[#0d1119] ${meta.cls}`}>
                                    <Icon className="w-3.5 h-3.5" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-white truncate">{item.title}</p>
                                    <p className="text-[10px] text-zinc-500 truncate">{item.subtitle} · {item.relativeTime}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Ship readiness + debug rooms */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <div className="rounded-xl border border-white/[0.07] bg-[#0d1119] p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-white">Ship Readiness</h3>
                          {overview.shipReadiness.percent != null && (
                            <span className="text-cyan-400 font-bold text-[11px]">{overview.shipReadiness.percent}%</span>
                          )}
                        </div>

                        {overview.shipReadiness.percent == null ? (
                          <div className="flex min-h-[100px] flex-col items-center justify-center rounded-md border border-white/5 bg-white/[0.02] px-4 py-3 text-center">
                            <div className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-400">
                              <Database className="h-3.5 w-3.5" />
                            </div>
                            <p className="text-xs font-semibold text-white">Nothing to ship yet</p>
                            <p className="mt-1 text-[10px] text-zinc-500">Ship readiness appears once you have deployments or validations.</p>
                          </div>
                        ) : (
                          <>
                            <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden mb-3">
                              <div className="bg-cyan-400 h-full rounded-full" style={{ width: `${overview.shipReadiness.percent}%` }} />
                            </div>
                            <div className="space-y-3 mb-3">
                              {overview.shipReadiness.checks.map((check) => (
                                <div key={check.label} className="flex items-center justify-between text-[11px]">
                                  <span className="flex items-center gap-2 text-zinc-400">
                                    {check.ok
                                      ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                      : <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                                    {check.label}
                                  </span>
                                  <span className={check.ok ? 'text-emerald-400 font-medium' : 'text-amber-400 font-medium'}>{check.value}</span>
                                </div>
                              ))}
                            </div>
                            <button
                              type="button"
                              className="mt-1 inline-flex w-full items-center justify-center rounded-md bg-[#1a2230] hover:bg-[#1d263b] border border-white/10 px-3 py-2 text-[11px] font-semibold text-cyan-400 transition"
                              onClick={() => router.push('/deploy')}
                            >
                              Prepare deployment
                            </button>
                          </>
                        )}
                      </div>

                      <div className="rounded-xl border border-white/[0.07] bg-[#0d1119] p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                              <Terminal className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-sm font-semibold text-white truncate">
                                {overview.debugRooms[0]?.title || 'Debug Rooms'}
                              </h3>
                              {overview.debugRooms[0]?.participantNames?.length > 0 && (
                                <p className="text-[10px] text-zinc-500 mt-0.5 truncate">
                                  {overview.debugRooms[0].participantNames.join(' and ')} debugging
                                </p>
                              )}
                            </div>
                          </div>
                          {overview.debugRooms.length > 0 && (
                            <span className="flex items-center gap-1 text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 font-medium shrink-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
                            </span>
                          )}
                        </div>

                        {overview.debugRooms.length === 0 ? (
                          <div className="flex min-h-[100px] flex-col items-center justify-center rounded-md border border-white/5 bg-white/[0.02] px-4 py-3 text-center">
                            <div className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                              <Radio className="h-3.5 w-3.5" />
                            </div>
                            <p className="text-xs font-semibold text-white">No active debug rooms</p>
                            <p className="mt-1 text-[10px] text-zinc-500">Start a live session to collaborate with your team in real time.</p>
                            <button
                              type="button"
                              className="mt-2 rounded-md bg-cyan-500 px-3 py-1 text-[10px] font-semibold text-slate-950 transition hover:bg-cyan-400"
                              onClick={() => router.push('/debug-room')}
                            >
                              Start session
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {overview.debugRooms.map((room) => (
                              <div key={room.id} className="rounded-md border border-white/5 bg-white/[0.02] px-3 py-2 flex items-center justify-between">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="flex -space-x-2 shrink-0">
                                    {room.participants.map((p, idx) => (
                                      <span key={idx} className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold border ${idx % 2 === 0 ? 'bg-white/10 text-zinc-200 border-white/20' : 'bg-blue-500/20 text-blue-300 border-blue-500/40'}`}>
                                        {p}
                                      </span>
                                    ))}
                                  </div>
                                  <span className="text-[11px] text-zinc-400 truncate">{room.title}</span>
                                </div>
                                <button
                                  type="button"
                                  className="text-[11px] font-medium text-cyan-400 hover:text-cyan-300 transition shrink-0 inline-flex items-center gap-1"
                                  onClick={() => router.push('/debug-room')}
                                >
                                  Join room <ArrowRight className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Recent code + connections */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <div className="rounded-xl border border-white/[0.07] bg-[#0d1119] p-4">
                        <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
                          <h3 className="text-sm font-semibold text-white">Recent Code Activities</h3>
                          <button type="button" className="text-[11px] text-cyan-400 hover:text-cyan-300" onClick={() => router.push('/source-code')}>
                            View Repo
                          </button>
                        </div>

                        {overview.recentActivity.filter((a) => a.type === 'code' || a.type === 'git').length === 0 ? (
                          <div className="flex min-h-[92px] flex-col items-center justify-center rounded-md border border-white/5 bg-white/[0.02] px-4 py-3 text-center">
                            <div className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-zinc-400">
                              <FileCode className="h-3.5 w-3.5" />
                            </div>
                            <p className="text-[11px] font-semibold text-white">No code activity yet</p>
                            <p className="mt-1 max-w-[230px] text-[10px] text-zinc-500">Commits and code changes will appear here.</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {overview.recentActivity.filter((a) => a.type === 'code' || a.type === 'git').slice(0, 4).map((item) => {
                              const meta = ACTIVITY_ICON[item.type] || ACTIVITY_ICON.code;
                              const Icon = meta.Icon;
                              return (
                              <div key={item.id} className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-3 min-w-0">
                                  <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${meta.cls}`}>
                                    <Icon className="w-3.5 h-3.5" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-white truncate">{item.title}</p>
                                    <p className="text-[10px] text-zinc-500 truncate">{item.subtitle}</p>
                                  </div>
                                </div>
                                <span className="text-[11px] text-zinc-500 shrink-0">{item.relativeTime}</span>
                              </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="rounded-xl border border-white/[0.07] bg-[#0d1119] p-4">
                        <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
                          <h3 className="text-sm font-semibold text-white">Workspace Connections</h3>
                          <button type="button" className="text-[11px] text-cyan-400 hover:text-cyan-300" onClick={() => router.push('/integrations')}>
                            Manage
                          </button>
                        </div>

                        {overview.connections.length === 0 ? (
                          <div className="flex min-h-[116px] flex-col items-center justify-center px-4 py-3 text-center">
                            <div className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
                              <Plug2 className="h-3.5 w-3.5" />
                            </div>
                            <p className="text-[11px] font-semibold text-white">No connections yet</p>
                            <p className="mt-1 max-w-[220px] text-[10px] text-zinc-500">Connect GitHub, Slack, or an MCP server to enrich your workspace.</p>
                            <button
                              type="button"
                              className="mt-2 rounded-md bg-cyan-500 px-3 py-1.5 text-[11px] font-semibold text-slate-950 transition hover:bg-cyan-400 inline-flex items-center gap-1"
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
                                <div key={conn.id} className="flex items-center justify-between rounded-md border border-white/5 bg-white/[0.02] px-3 py-2">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className={`flex h-7 w-7 items-center justify-center rounded-lg border shrink-0 ${meta.cls}`}>
                                      <Icon className="h-3.5 w-3.5" />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-xs font-semibold text-white truncate">{conn.title}</p>
                                      <p className="text-[10px] text-zinc-500 truncate">{conn.subtitle}</p>
                                    </div>
                                  </div>
                                  {conn.status === 'warn' && (
                                    <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0">1 issue</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}