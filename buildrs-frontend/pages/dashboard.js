import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Sidebar from '../components/Sidebar';
import NotificationBell from '../components/NotificationBell';
import AuthGuard from '../components/AuthGuard';
import TrialBanner from '../components/TrialBanner';
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
  AlertTriangle,
  Layers,
  GitBranch,
  Terminal,
  FileCode,
  FolderKanban,
  Play,
  Users,
  ShieldCheck,
  ExternalLink,
  Server,
} from 'lucide-react';

function formatGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);
  const {
    stats,
    trial,
    projects,
    tasks,
    loadStats,
    loadProjects,
    loadTasks,
    loading,
  } = useDashboard();

  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('Terminal');
  const [dashState, setDashState] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    // Load custom dashboard state from API or fallback
    const fetchDashState = async () => {
      try {
        const res = await fetch('/api/dashboard/data', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        const json = await res.json();
        if (json.success && json.data?.dashboardState) {
          setDashState(json.data.dashboardState);
        }
      } catch (e) {
        console.error('Failed to load dashState', e);
      }
    };
    fetchDashState();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadStats(), loadProjects(), loadTasks()]);
    try {
      const res = await fetch('/api/dashboard/data', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const json = await res.json();
      if (json.success && json.data?.dashboardState) {
        setDashState(json.data.dashboardState);
      }
    } catch (e) {}
    setRefreshing(false);
  };

  const hasProjects = projects && projects.length > 0;
  const hasTasks = tasks && tasks.length > 0;
  const isPopulated = hasProjects || hasTasks || (stats && stats.activeProjects > 0) || dashState;

  // Fallback defaults if empty or loaded
  const wsName = dashState?.workspaceName || (projects?.[0]?.name || 'buildr-web');
  const wsStatus = dashState?.workspaceStatus || 'Healthy';
  const activeBranch = dashState?.activeBranch || 'Main';
  const openTasksNum = stats?.pendingTasks ?? dashState?.openTasksCount ?? 7;
  const agentsRunningNum = dashState?.agentsRunningCount ?? 2;
  const validationPct = dashState?.validationPercent ?? 94;

  const needsAttentionList = dashState?.needsAttention || [
    { id: '1', type: 'ai_agent', title: 'Implement OAuth callback and session refresh', subtitle: 'auth/session-hardening • 6 files changed • Validation passed', badge: 'AI AGENT • AWAITING APPROVAL' },
    { id: '2', type: 'validation', title: 'Checkout contract violates payment isolation spec', subtitle: 'SPEC-042 • services/billing/checkout.ts • 4m ago', badge: 'VALIDATION • 2 FAILURES' },
    { id: '3', type: 'deployment', title: 'Preview build is waiting for environment approval', subtitle: 'feat/command-menu • Vercel Preview • 12m ago', badge: 'DEPLOYMENT • ACTION REQUIRED' }
  ];

  const activeDev = dashState?.activeDevelopment || {
    title: 'Atlas is implementing',
    taskCode: 'CMD-128',
    taskTitle: 'Global command menu',
    progressPercent: 68,
    stepText: 'Step 4 of 6 • Running tests',
    status: 'RUNNING',
    terminalLog: '$ pnpm test command-menu\\nRUN v2.1.3 /workspace/buildr-web\\n✓ src/components/CommandMenu.test.tsx (8)\\n✓ src/hooks/useCommands.test.ts (4)\\n● Checking TypeScript contracts...'
  };

  const sprintsData = dashState?.sprints || {
    inProgressCount: 4,
    inReviewCount: 3,
    completedCount: 12,
    items: [
      { id: '1', code: 'CMD-128', title: 'Global command menu', status: 'in_progress', assignee: 'AT' },
      { id: '2', code: 'AUTH-89', title: 'OAuth session hardening', status: 'review', assignee: 'MK' },
      { id: '3', code: 'UI-214', title: 'Billing plan comparison', status: 'in_progress', assignee: 'JS' }
    ]
  };

  const debugRoomsList = dashState?.debugRooms || [
    { id: '1', title: 'Debug Room: Auth callback', participants: ['JP', 'PK'], status: 'LIVE' }
  ];

  return (
    <AuthGuard>
      <Head>
        <title>Dashboard - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="workspace-container bg-[#0b0f17] text-white min-h-screen flex">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main flex-1 flex flex-col min-w-0">
          {/* Top Bar matching image */}
          <header className="h-16 px-6 border-b border-white/10 flex items-center justify-between bg-[#0b0f17]/80 backdrop-blur sticky top-0 z-30">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-[#161b26] border border-white/10 px-3 py-1.5 rounded-lg text-sm text-zinc-200 cursor-pointer hover:border-white/20 transition">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                <span className="font-medium">Feature/auth-flow-redesign</span>
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              </div>
              <div className="hidden lg:flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-xs bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-full border border-emerald-500/20 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> IC Passing
                </span>
                <span className="flex items-center gap-1.5 text-xs bg-cyan-500/10 text-cyan-400 px-2.5 py-1 rounded-full border border-cyan-500/20 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" /> Staging Live
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="relative hidden md:block w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search specs, diff, agents"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#161b26] border border-white/10 rounded-lg pl-9 pr-4 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition"
                />
              </div>

              <div className="relative">
                <NotificationBell look="header" />
              </div>

              <div className="flex items-center gap-3 pl-2 border-l border-white/10">
                <img
                  className="w-9 h-9 rounded-full object-cover border border-cyan-500/40"
                  src={getAvatarUrl(user, user?.fullName || user?.name || 'Daniel Uche')}
                  alt={user?.fullName || 'Daniel Uche'}
                />
              </div>
            </div>
          </header>

          <div className="workspace-content p-8 max-w-7xl mx-auto w-full space-y-6">
            <TrialBanner trial={trial} />

            {/* Header Greeting section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
              <div>
                <p className="text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-1">DEVELOPMENT COMMAND CENTER</p>
                <h1 className="text-3xl font-bold tracking-tight text-white">
                  {formatGreeting()}, {user?.fullName?.split(' ')[0] || user?.name?.split(' ')[0] || 'Daniel'}.
                </h1>
                <p className="text-sm text-zinc-400 mt-1">
                  Your workspace is moving. {openTasksNum} items need your attention.
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

            {isPopulated ? (
              <>
                {/* Project Overview Card */}
                <div className="bg-[#111622] border border-white/10 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-white/10">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                        <FolderKanban className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2.5">
                          <h2 className="text-lg font-bold text-white">{wsName}</h2>
                          <span className="flex items-center gap-1 text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> {wsStatus}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          buildrshq/{wsName} • React + TypeScript • Updated 8m ago
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
                      <div className="text-2xl font-bold text-white">{openTasksNum}</div>
                      <div className="text-xs text-zinc-400 mt-0.5">Open tasks</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-white">{agentsRunningNum}</div>
                      <div className="text-xs text-zinc-400 mt-0.5">Agents running</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-white">{validationPct}%</div>
                      <div className="text-xs text-zinc-400 mt-0.5">Validation</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-white">{activeBranch}</div>
                      <div className="text-xs text-zinc-400 mt-0.5">Active branch</div>
                    </div>
                  </div>
                </div>

                {/* Needs Your Attention Section */}
                <div className="bg-[#111622] border border-white/10 rounded-2xl p-6 shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                      <h3 className="font-bold text-white text-base">Needs your attention</h3>
                      <span className="bg-amber-400/10 text-amber-400 px-2 py-0.5 rounded-full text-xs font-bold border border-amber-400/20">
                        {needsAttentionList.length}
                      </span>
                    </div>
                    <button type="button" className="text-xs text-zinc-400 hover:text-white font-medium flex items-center gap-1 transition" onClick={() => router.push('/tasks')}>
                      View all <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
                    </button>
                  </div>
                  <p className="text-xs text-zinc-400 mb-4">Decisions blocking the development workflow</p>

                  <div className="space-y-3">
                    {needsAttentionList.map((item, idx) => (
                      <div key={item.id || idx} className="bg-[#161b26] border border-white/5 hover:border-white/15 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition">
                        <div className="flex items-start gap-3.5">
                          <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${item.type === 'validation' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : item.type === 'deployment' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'}`}>
                            {item.type === 'validation' ? <AlertTriangle className="w-4 h-4" /> : item.type === 'deployment' ? <Layers className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded bg-white/5 text-zinc-300 border border-white/10">
                                {item.badge}
                              </span>
                            </div>
                            <h4 className="font-semibold text-white text-sm mt-1">{item.title}</h4>
                            <p className="text-xs text-zinc-400 mt-0.5">{item.subtitle}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="bg-[#1f2636] hover:bg-cyan-500 hover:text-slate-950 border border-white/10 text-white px-4 py-2 rounded-lg text-xs font-semibold transition shrink-0 self-end md:self-auto"
                          onClick={() => router.push(item.type === 'validation' ? '/ci-cd' : '/ai-pair')}
                        >
                          {item.type === 'validation' ? 'Inspect failures →' : item.type === 'deployment' ? 'Review deploy →' : 'Review changes →'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Active Development */}
                <div className="bg-[#111622] border border-white/10 rounded-2xl p-6 shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-5 h-5 text-cyan-400" />
                      <h3 className="font-bold text-white text-base">Active Development</h3>
                    </div>
                    <span className="flex items-center gap-1.5 text-xs bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-full border border-emerald-500/20 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
                    </span>
                  </div>

                  <div className="bg-[#161b26] border border-white/10 rounded-xl p-5 mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="text-xs text-cyan-400 font-semibold">{activeDev.taskCode}</div>
                        <h4 className="text-white font-bold text-base mt-0.5">{activeDev.taskTitle}</h4>
                      </div>
                      <span className="text-xs font-bold bg-cyan-500/10 text-cyan-400 px-2.5 py-1 rounded border border-cyan-500/20">
                        {activeDev.status}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-400 mb-3">{activeDev.stepText}</div>

                    {/* Progress bar */}
                    <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden mb-4">
                      <div className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-full rounded-full transition-all duration-500" style={{ width: `${activeDev.progressPercent}%` }} />
                    </div>

                    <div className="flex items-center gap-4 text-xs text-zinc-400">
                      <span className="flex items-center gap-1 text-zinc-300">
                        <span className="w-2 h-2 rounded-full bg-cyan-400" /> agent/{activeDev.taskCode.toLowerCase()}
                      </span>
                      <span>•</span>
                      <span>4 files</span>
                      <span>•</span>
                      <span>12 checks</span>
                    </div>
                  </div>

                  {/* Tabs: Terminal / Diff / Validation */}
                  <div className="flex items-center gap-2 border-b border-white/10 pb-3 mb-4">
                    {['Terminal', 'Diff', 'Validation'].map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${activeTab === tab ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  <div className="bg-[#0b0f17] border border-white/10 rounded-xl p-4 font-mono text-xs text-zinc-300 overflow-x-auto shadow-inner">
                    {activeTab === 'Terminal' && (
                      <div className="space-y-1">
                        <div className="text-zinc-500">$ pnpm test command-menu</div>
                        <div className="text-zinc-400">RUN v2.1.3 /workspace/buildr-web</div>
                        <div className="text-emerald-400">✓ src/components/CommandMenu.test.tsx (8)</div>
                        <div className="text-emerald-400">✓ src/hooks/useCommands.test.ts (4)</div>
                        <div className="text-cyan-400 animate-pulse">● Checking TypeScript contracts...</div>
                      </div>
                    )}
                    {activeTab === 'Diff' && (
                      <div className="space-y-1">
                        <div className="text-emerald-400">+ export function useCommands() &#123;</div>
                        <div className="text-emerald-400">+   const [query, setQuery] = useState('');</div>
                        <div className="text-rose-400">-   // TODO: implement command search</div>
                        <div className="text-emerald-400">+   return &#123; query, setQuery, results: [] &#125;;</div>
                        <div className="text-emerald-400">+ &#125;</div>
                      </div>
                    )}
                    {activeTab === 'Validation' && (
                      <div className="space-y-1">
                        <div className="text-emerald-400">✓ ESLint passed (0 errors, 0 warnings)</div>
                        <div className="text-emerald-400">✓ TypeScript type-check passed</div>
                        <div className="text-emerald-400">✓ Security scan: 0 vulnerabilities found</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Grid: Current Sprint & Recent Activity */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Current Sprint (2 cols) */}
                  <div className="lg:col-span-2 bg-[#111622] border border-white/10 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-white text-base">Current Sprint</h3>
                        <button type="button" className="text-xs text-cyan-400 hover:underline font-medium" onClick={() => router.push('/tasks')}>
                          Open Task Board →
                        </button>
                      </div>

                      <div className="flex items-center gap-3 mb-6">
                        <div className="bg-[#161b26] border border-cyan-500/40 px-4 py-2 rounded-xl text-xs font-semibold text-cyan-400 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-cyan-400" /> {sprintsData.inProgressCount} In progress
                        </div>
                        <div className="bg-[#161b26] border border-amber-500/40 px-4 py-2 rounded-xl text-xs font-semibold text-amber-400 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-400" /> {sprintsData.inReviewCount} In review
                        </div>
                        <div className="bg-[#161b26] border border-emerald-500/40 px-4 py-2 rounded-xl text-xs font-semibold text-emerald-400 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" /> {sprintsData.completedCount} Completed
                        </div>
                      </div>

                      <div className="space-y-3">
                        {sprintsData.items.map((task) => (
                          <div key={task.id || task.code} className="bg-[#161b26] border border-white/5 hover:border-white/15 rounded-xl p-3.5 flex items-center justify-between transition">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold font-mono text-zinc-400">{task.code}</span>
                              <span className="text-sm font-medium text-white">{task.title}</span>
                            </div>
                            <div className="flex items-center gap-3">
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
                    </div>
                  </div>

                  {/* Recent Activity (1 col) */}
                  <div className="bg-[#111622] border border-white/10 rounded-2xl p-6 shadow-xl">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-white text-base">Recent activity</h3>
                      <button type="button" className="text-xs text-zinc-400 hover:text-white" onClick={() => router.push('/source-code')}>
                        View all
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0 mt-0.5">
                          <GitBranch className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-white">PR #248 opened</p>
                          <p className="text-[11px] text-zinc-400">feat/global-command-menu • 6m</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-white">Validation passed</p>
                          <p className="text-[11px] text-zinc-400">SPEC-031 • 12 checks • 14m</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0 mt-0.5">
                          <FileCode className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-white">Figma reference updated</p>
                          <p className="text-[11px] text-zinc-400">Command Menu / v4 • 31m</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                          <Users className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-white">Debug Room ended</p>
                          <p className="text-[11px] text-zinc-400">Session with Jamie • 46m</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Grid: Ship Readiness & Debug Room */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Ship Readiness */}
                  <div className="bg-[#111622] border border-white/10 rounded-2xl p-6 shadow-xl">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-white text-base">Ship Readiness</h3>
                      <span className="text-cyan-400 font-bold text-sm">94%</span>
                    </div>
                    <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden mb-6">
                      <div className="bg-cyan-400 h-full rounded-full" style={{ width: '94%' }} />
                    </div>

                    <div className="space-y-3 mb-6">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 text-zinc-300">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Tests
                        </span>
                        <span className="text-emerald-400 font-medium">142 passed</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 text-zinc-300">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Specifications
                        </span>
                        <span className="text-emerald-400 font-medium">18 compliant</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 text-zinc-300">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Security scan
                        </span>
                        <span className="text-emerald-400 font-medium">No issues</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 text-zinc-300">
                          <AlertTriangle className="w-4 h-4 text-amber-400" /> Pull request
                        </span>
                        <span className="text-amber-400 font-medium">1 review needed</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="w-full bg-[#161b26] hover:bg-cyan-500 hover:text-slate-950 border border-white/10 text-white py-2.5 rounded-xl text-sm font-semibold transition shadow"
                      onClick={() => router.push('/ci-cd')}
                    >
                      Prepare deployment
                    </button>
                  </div>

                  {/* Debug Room */}
                  <div className="bg-[#111622] border border-white/10 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                          <h3 className="font-bold text-white text-base">Debug Room: Auth callback</h3>
                        </div>
                        <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">LIVE</span>
                      </div>
                      <p className="text-xs text-zinc-400 mb-6">Jamie and Priya are debugging on fix/oauth-callback</p>
                    </div>

                    <div className="space-y-3">
                      {debugRoomsList.map((room) => (
                        <div key={room.id} className="bg-[#161b26] border border-white/5 rounded-xl p-4 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex -space-x-2">
                              {room.participants.map((p, idx) => (
                                <span key={idx} className="w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-300 font-bold text-xs flex items-center justify-center border border-cyan-500/40">
                                  {p}
                                </span>
                              ))}
                            </div>
                            <span className="text-xs text-zinc-300">Active session</span>
                          </div>
                          <button
                            type="button"
                            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5"
                            onClick={() => router.push('/meeting-room')}
                          >
                            Join room →
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Grid: Recent Code Activities & Workspace Connections */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Recent Code Activities */}
                  <div className="bg-[#111622] border border-white/10 rounded-2xl p-6 shadow-xl">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-white text-base">Recent Code Activities</h3>
                      <button type="button" className="text-xs text-zinc-400 hover:text-white" onClick={() => router.push('/source-code')}>
                        View Repo
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0 mt-0.5">
                            <GitBranch className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-white">feat: add cart persistence layer</p>
                            <p className="text-[11px] text-zinc-400">Alex Kim committed to feature/checkout-flow</p>
                          </div>
                        </div>
                        <span className="text-[11px] text-zinc-500 shrink-0">2m</span>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0 mt-0.5">
                            <GitBranch className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-white">PR #84 merged into development</p>
                            <p className="text-[11px] text-zinc-400">Maya Patel • 6 commits</p>
                          </div>
                        </div>
                        <span className="text-[11px] text-zinc-500 shrink-0">1h</span>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                            <FileCode className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-white">refactor: normalize product schema</p>
                            <p className="text-[11px] text-zinc-400">Buildrs Agent Committed</p>
                          </div>
                        </div>
                        <span className="text-[11px] text-zinc-500 shrink-0">2h</span>
                      </div>
                    </div>
                  </div>

                  {/* Workspace Connections */}
                  <div className="bg-[#111622] border border-white/10 rounded-2xl p-6 shadow-xl">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-white text-base">Workspace Connections</h3>
                      <button type="button" className="text-xs text-cyan-400 hover:underline" onClick={() => router.push('/integrations')}>
                        Manage
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between bg-[#161b26] border border-white/5 rounded-xl p-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                            <GitBranch className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-white">feat: add cart persistence layer</p>
                            <p className="text-[11px] text-zinc-400">GitHub synched 4 minutes ago</p>
                          </div>
                        </div>
                        <span className="text-[11px] text-zinc-500 shrink-0">2m</span>
                      </div>
                      <div className="flex items-center justify-between bg-[#161b26] border border-white/5 rounded-xl p-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                            <Server className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-white">3 MCP servers online</p>
                            <p className="text-[11px] text-zinc-400">32 tools available to agents</p>
                          </div>
                        </div>
                        <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded text-[10px] font-bold">1 issue</span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              /* Empty State matching Overview empty state.png */
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
                    <span>•</span>
                    <span>No diff available</span>
                    <span>•</span>
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
                    <div>
                      <h3 className="font-bold text-white text-base mb-4">Recent activity</h3>
                    </div>
                    <div className="bg-[#161b26] border border-white/5 rounded-xl p-12 my-auto">
                      <h4 className="font-bold text-white text-sm mb-1">No recent activities</h4>
                      <p className="text-xs text-zinc-400">All recent activities will be shown here</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
