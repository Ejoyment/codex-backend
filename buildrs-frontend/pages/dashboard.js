import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import TrialBanner from '../components/TrialBanner';
import StatCard from '../components/StatCard';
import IntegrationsHub from '../components/IntegrationsHub';
import ActivityFeed from '../components/ActivityFeed';
import ProjectsList from '../components/ProjectsList';
import CreateProjectModal from '../components/CreateProjectModal';
import CreateTaskModal from '../components/CreateTaskModal';
import MyQueue from '../components/MyQueue';
import TeamPulse from '../components/TeamPulse';
import UpcomingMeetings from '../components/UpcomingMeetings';
import AIInsights from '../components/AIInsights';
import useAuthStore from '../store/authStore';
import { useDashboard } from '../hooks/useDashboard';
import { getAvatarUrl } from '../lib/utils';
import {
  Bell,
  Plus,
  RotateCw,
  ListTodo,
  Activity,
  CalendarDays,
  Sparkles,
  Users,
  FolderKanban,
  FileCode,
  ArrowRight,
  ChevronRight,
} from 'lucide-react';

function formatGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const TASK_STATUS = [
  { key: 'pending', label: 'Pending', color: '#9aa1ae' },
  { key: 'in_progress', label: 'In progress', color: '#2fd6e6' },
  { key: 'in_review', label: 'In review', color: '#e5b84a' },
  { key: 'completed', label: 'Completed', color: '#34d399' },
];

function DonutChart({ segments, size = 168, thickness = 18 }) {
  const total = segments.reduce((sum, sg) => sum + sg.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const center = size / 2;
  let offset = 0;

  return (
    <div className="dash-donut-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={center} cy={center} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={thickness} />
        {total > 0 &&
          segments.map((sg) => {
            if (sg.value <= 0) return null;
            const dash = (sg.value / total) * c;
            const el = (
              <circle
                key={sg.key}
                cx={center}
                cy={center}
                r={r}
                fill="none"
                stroke={sg.color}
                strokeWidth={thickness}
                strokeDasharray={`${Math.max(dash - 2, 0.5)} ${Math.max(c - dash + 2, 0.5)}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${center} ${center})`}
              />
            );
            offset += dash;
            return el;
          })}
      </svg>
      <div className="dash-donut-center">
        <span className="dash-donut-value">{total}</span>
        <span className="dash-donut-label">Total tasks</span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);
  const {
    stats,
    trial,
    integrations,
    activity,
    projects,
    tasks,
    companies,
    meetings,
    loadStats,
    loadProjects,
    loadTasks,
    loadMeetings,
    loading,
  } = useDashboard();

  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () => {
      setClock(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadStats(), loadProjects(), loadTasks(), loadMeetings()]);
    setRefreshing(false);
  };

  const taskList = tasks || [];
  const statusCounts = Object.fromEntries(TASK_STATUS.map((s) => [s.key, 0]));
  taskList.forEach((t) => {
    if (statusCounts[t.status] !== undefined) statusCounts[t.status] += 1;
  });
  const donutSegments = TASK_STATUS.map((s) => ({ ...s, value: statusCounts[s.key] }));
  const openTasks = taskList.length - statusCounts.completed;
  const workspaceLabel = subscription?.plan || subscription?.name || companies?.[0]?.name || 'Personal workspace';

  const quickActions = [
    { label: 'Create task', hint: 'new work item', icon: ListTodo, run: () => setShowTaskModal(true) },
    { label: 'Invite team', hint: 'add members', icon: Users, run: () => router.push('/teams?action=invite') },
    { label: 'Open code', hint: 'source & repos', icon: FileCode, run: () => router.push('/source-code') },
    { label: 'AI pair chat', hint: 'pair with AI', icon: Sparkles, run: () => router.push('/ai-pair') },
  ];

  return (
    <AuthGuard>
      <Head>
        <title>Dashboard - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="workspace-container">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main">
          <header className="workspace-header dash-header">
            <div>
              <p className="dash-crumb">
                BuildrsHQ <span className="sep">/</span> Overview
              </p>
              <h1 className="dash-title">
                {formatGreeting()}, {user?.fullName?.split(' ')[0] || user?.name?.split(' ')[0] || 'there'}
              </h1>
              <div className="dash-statusline">
                <span className="status-indicator status-online" />
                <span>All systems operational</span>
                <span className="dash-clock">· {clock || '—:——:——'}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="dash-pill hidden md:inline-flex">
                <span className="dot" />
                {workspaceLabel}
              </span>
              <button
                type="button"
                className="btn-workspace btn-secondary"
                title="Refresh dashboard"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <RotateCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <button type="button" className="btn-workspace btn-secondary" title="Notifications">
                <Bell className="w-4 h-4" />
              </button>
              <button
                type="button"
                className="btn-workspace btn-primary"
                onClick={() => setShowProjectModal(true)}
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New Project</span>
              </button>
              <img
                className="avatar"
                src={getAvatarUrl(user, user?.fullName || user?.name || 'User')}
                alt={user?.fullName || 'User'}
              />
            </div>
          </header>

          <div className="workspace-content">
            <div className="dash-content">
              <TrialBanner trial={trial} />

              {/* KPI overview */}
              <section className="dash-section">
                <div className="dash-section-head">
                  <div className="dash-eyebrow">
                    <span className="dot" />
                    <b>Overview</b> · last 24 hours
                  </div>
                  <button type="button" className="dash-action" onClick={handleRefresh} disabled={refreshing}>
                    Refresh metrics
                    <RotateCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                  <StatCard
                    value={stats?.activeProjects ?? 0}
                    label="Active Projects"
                    color="blue"
                    subtext={`${stats?.localProjects ?? 0} local · ${stats?.githubProjects ?? 0} github · ${stats?.teamProjects ?? 0} team`}
                    onClick={() => router.push('/workspace')}
                  />
                  <StatCard
                    value={stats?.totalCompleted ?? 0}
                    label="Tasks Completed"
                    color="green"
                    subtext="shipped to date"
                    onClick={() => router.push('/tasks')}
                  />
                  <StatCard
                    value={stats?.pendingTasks ?? 0}
                    label="Tasks in Flight"
                    color="orange"
                    subtext={stats?.pendingTasks ? 'needs attention' : 'all clear'}
                    onClick={() => router.push('/tasks')}
                  />
                  <StatCard
                    value={stats?.teamMembers ?? 0}
                    label="Team Members"
                    color="purple"
                    subtext="across your org"
                    onClick={() => router.push('/teams')}
                  />
                </div>
              </section>

              {/* Workplan */}
              <section className="dash-section">
                <div className="dash-section-head">
                  <div className="dash-eyebrow">
                    <span className="dot" />
                    <b>Workplan</b> · focus & task distribution
                  </div>
                  <button type="button" className="dash-action" onClick={() => router.push('/tasks')}>
                    Open tasks
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  <div className="workspace-card">
                    <div className="workspace-card-header flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="card-ico">
                          <ListTodo className="w-4 h-4" />
                        </span>
                        <h2 className="workspace-card-title">My Queue</h2>
                      </div>
                      <span className="badge-count">{Math.max(openTasks, 0)} open</span>
                    </div>
                    <div className="workspace-card-body">
                      <MyQueue tasks={taskList} />
                    </div>
                  </div>

                  <div className="workspace-card">
                    <div className="workspace-card-header flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="card-ico">
                          <Activity className="w-4 h-4" />
                        </span>
                        <h2 className="workspace-card-title">Throughput</h2>
                      </div>
                      <span className="badge-count">{taskList.length} total</span>
                    </div>
                    <div className="workspace-card-body">
                      <DonutChart segments={donutSegments} />
                      <div className="dash-legend">
                        {TASK_STATUS.map((s) => {
                          const count = statusCounts[s.key];
                          const pct = taskList.length ? Math.round((count / taskList.length) * 100) : 0;
                          return (
                            <div key={s.key} className="dash-legend-row">
                              <span className="dash-legend-key" style={{ background: s.color }} />
                              <span className="dash-legend-label">{s.label}</span>
                              <span className="dash-legend-bar">
                                <span className="dash-legend-bar-fill" style={{ width: `${pct}%`, background: s.color }} />
                              </span>
                              <span className="dash-legend-count">{count} · {pct}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="workspace-card">
                    <div className="workspace-card-header flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="card-ico">
                          <CalendarDays className="w-4 h-4" />
                        </span>
                        <h2 className="workspace-card-title">Upcoming</h2>
                      </div>
                      <button type="button" className="dash-action" onClick={() => router.push('/meetings')}>
                        All
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="workspace-card-body">
                      <UpcomingMeetings meetings={meetings || []} />
                    </div>
                  </div>
                </div>
              </section>

              {/* Signals */}
              <section className="dash-section">
                <div className="dash-section-head">
                  <div className="dash-eyebrow">
                    <span className="dot" />
                    <b>Signals</b> · activity & intelligence
                  </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  <div className="workspace-card lg:col-span-2">
                    <div className="workspace-card-header flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="card-ico">
                          <Activity className="w-4 h-4" />
                        </span>
                        <h2 className="workspace-card-title">Recent Activity</h2>
                      </div>
                      <span className="badge-count">{activity?.length ?? 0} events</span>
                    </div>
                    <div className="workspace-card-body">
                      <ActivityFeed activity={activity} />
                    </div>
                  </div>

                  <div className="workspace-card">
                    <div className="workspace-card-header flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="card-ico">
                          <Sparkles className="w-4 h-4" />
                        </span>
                        <h2 className="workspace-card-title">AI Insights</h2>
                      </div>
                    </div>
                    <div className="workspace-card-body">
                      <AIInsights
                        stats={stats || {}}
                        tasks={taskList}
                        projects={projects || []}
                        meetings={meetings || []}
                        integrations={integrations || []}
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* Delivery */}
              <section className="dash-section">
                <div className="dash-section-head">
                  <div className="dash-eyebrow">
                    <span className="dot" />
                    <b>Delivery</b> · projects & team
                  </div>
                  <button type="button" className="dash-action" onClick={() => router.push('/teams')}>
                    Manage teams
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  <div className="workspace-card lg:col-span-2">
                    <div className="workspace-card-header flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="card-ico">
                          <FolderKanban className="w-4 h-4" />
                        </span>
                        <h2 className="workspace-card-title">Recent Projects</h2>
                      </div>
                      <button type="button" className="dash-action" onClick={() => router.push('/workspace')}>
                        View all
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="workspace-card-body">
                      <ProjectsList projects={projects} onViewAll={() => setShowProjectModal(true)} />
                    </div>
                  </div>

                  <div className="workspace-card">
                    <div className="workspace-card-header flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="card-ico">
                          <Users className="w-4 h-4" />
                        </span>
                        <h2 className="workspace-card-title">Team Pulse</h2>
                      </div>
                    </div>
                    <div className="workspace-card-body">
                      <TeamPulse companies={companies || []} />
                    </div>
                  </div>
                </div>
              </section>

              {/* Systems & tools */}
              <section className="dash-section">
                <div className="dash-section-head">
                  <div className="dash-eyebrow">
                    <span className="dot" />
                    <b>Systems</b> · integrations & shortcuts
                  </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  <div className="workspace-card lg:col-span-2">
                    <div className="workspace-card-header flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="card-ico">
                          <Activity className="w-4 h-4" />
                        </span>
                        <h2 className="workspace-card-title">Integrations Hub</h2>
                      </div>
                      <button type="button" className="dash-action" onClick={() => router.push('/integrations')}>
                        Manage
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="workspace-card-body">
                      <IntegrationsHub integrations={integrations} />
                    </div>
                  </div>

                  <div className="workspace-card">
                    <div className="workspace-card-header flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="card-ico">
                          <Plus className="w-4 h-4" />
                        </span>
                        <h2 className="workspace-card-title">Quick Actions</h2>
                      </div>
                    </div>
                    <div className="workspace-card-body">
                      <div className="qa-grid">
                        {quickActions.map(({ label, hint, icon: Icon, run }) => (
                          <button key={label} type="button" className="qa-tile" onClick={run}>
                            <span className="qa-tile-ico">
                              <Icon className="w-4 h-4" />
                            </span>
                            <span className="qa-tile-label">{label}</span>
                            <span className="qa-tile-hint">{hint}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </main>
      </div>

      {showProjectModal && (
        <CreateProjectModal
          onClose={() => setShowProjectModal(false)}
          onCreated={async () => {
            await Promise.all([loadProjects(), loadStats()]);
          }}
        />
      )}

      {showTaskModal && (
        <CreateTaskModal
          onClose={() => setShowTaskModal(false)}
          onCreated={async () => {
            await Promise.all([loadStats(), loadTasks()]);
          }}
        />
      )}
    </AuthGuard>
  );
}