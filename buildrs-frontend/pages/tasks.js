import { Fragment, useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch, projectApi } from '../lib/api';
import CreateTaskWizard from '../components/CreateTaskWizard';
import {
  Plus,
  X,
  ChevronRight,
  Loader2,
  Inbox,
  RotateCw,
  ListTodo,
  Activity,
  Eye,
  CheckCircle2,
  Bot,
  GitBranch,
  ExternalLink,
  Link2,
} from 'lucide-react';
import { useCurrentCompany } from '../hooks/useCurrentCompany';

const STATUS_OPTIONS = ['backlog', 'in_progress', 'in_review', 'blocked', 'done'];
const STATUS_LABELS = { backlog: 'Backlog', in_progress: 'In Progress', in_review: 'In Review', blocked: 'Blocked', done: 'Done' };
const STATUS_TINTS = {
  backlog: { bg: 'rgba(154, 161, 174, 0.1)', text: '#9aa1ae', dot: '#6b7280' },
  in_progress: { bg: 'rgba(47, 214, 230, 0.1)', text: '#2fd6e6', dot: '#2fd6e6' },
  in_review: { bg: 'rgba(229, 184, 74, 0.1)', text: '#e5b84a', dot: '#e5b84a' },
  blocked: { bg: 'rgba(248, 113, 113, 0.1)', text: '#f87171', dot: '#f87171' },
  done: { bg: 'rgba(52, 211, 153, 0.12)', text: '#34d399', dot: '#34d399' },
};
const PRIORITY_TINTS = {
  low: { bg: 'rgba(154, 161, 174, 0.1)', text: '#9aa1ae' },
  medium: { bg: 'rgba(47, 214, 230, 0.1)', text: '#2fd6e6' },
  high: { bg: 'rgba(229, 184, 74, 0.1)', text: '#e5b84a' },
  critical: { bg: 'rgba(248, 113, 113, 0.1)', text: '#f87171' },
  urgent: { bg: 'rgba(248, 113, 113, 0.1)', text: '#f87171' },
};
const PRIORITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical', urgent: 'Critical' };
const TABS = [
  { key: 'all', label: 'All Tasks' },
  { key: 'backlog', label: 'Backlog' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'in_review', label: 'In Review' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'done', label: 'Done' },
];

const TAB_DOTS = {
  all: '#565d6b',
  backlog: '#6b7280',
  in_progress: '#2fd6e6',
  in_review: '#e5b84a',
  blocked: '#f87171',
  done: '#34d399',
};

function normalizeTask(task) {
  const status = { pending: 'backlog', 'in-progress': 'in_progress', completed: 'done' }[task.status] || task.status || 'backlog';
  return { ...task, id: task.id || task._id, status, specIds: (task.specIds || []).map((spec) => String(spec?._id || spec)) };
}

export default function Tasks() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);
  const { selectedCompany } = useCurrentCompany();

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [showWizard, setShowWizard] = useState(false);
  const [cyclingId, setCyclingId] = useState(null);
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [specs, setSpecs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState('');
  const [contextSavingId, setContextSavingId] = useState(null);
  const [delegatingId, setDelegatingId] = useState(null);
  const [actionError, setActionError] = useState('');
  const [clock, setClock] = useState('');
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
    const tick = () => {
      setClock(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch('/api/projects/tasks');
      if (data.success === false) throw new Error(data.message || 'Failed to load tasks');
      setTasks((data.tasks || []).map(normalizeTask));
    } catch (err) {
      setError(err.message || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  useEffect(() => {
    if (router.isReady && router.query.action === 'new') {
      setShowWizard(true);
    }
  }, [router.isReady, router.query.action]);

  useEffect(() => {
    let active = true;
    setProjectsLoading(true);
    // Specs are project-level, so the picker is driven by the projects this
    // user can reach — not by a workspace. Solo users still get their specs.
    (async () => {
      try {
        const { projects = [] } = await projectApi.list();
        if (!active) return;
        setProjects(projects);
        setProjectsError('');
        const lists = await Promise.all(
          projects.map(async (project) => {
            try {
              const data = await apiFetch(`/api/v1/specs/project/${project.id || project._id}`);
              const projectId = String(project.id || project._id);
              return (data.specs || []).map((spec) => ({ ...spec, projectId }));
            } catch {
              return [];
            }
          })
        );
        if (!active) return;
        const seen = new Set();
        setSpecs(
          lists.flat().filter((spec) => {
            const key = String(spec._id);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
        );
      } catch (loadError) {
        if (active) {
          setSpecs([]);
          setProjectsError(loadError.message || 'Could not load projects. You can still create an unlinked task.');
        }
      } finally {
        if (active) setProjectsLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const filteredTasks = activeTab === 'all' ? tasks : tasks.filter((t) => t.status === activeTab);

  const cycleStatus = async (task) => {
    const idx = STATUS_OPTIONS.indexOf(task.status);
    const nextStatus = STATUS_OPTIONS[(idx + 1) % STATUS_OPTIONS.length];
    try {
      setCyclingId(task.id);
      const data = await apiFetch(`/api/projects/tasks/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus }),
      });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? normalizeTask({ ...t, ...data.task }) : t)));
    } catch (err) {
      console.error('Failed to update task status:', err);
    } finally {
      setCyclingId(null);
    }
  };

  const saveTaskContext = async (task, patch) => {
    setContextSavingId(task.id);
    setActionError('');
    try {
      const data = await apiFetch(`/api/projects/tasks/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...patch, companyId: selectedCompany?._id }),
      });
      setTasks((current) => current.map((item) => item.id === task.id ? normalizeTask({ ...item, ...data.task }) : item));
    } catch (error) {
      setActionError(error.message || 'Could not update task context');
    } finally {
      setContextSavingId(null);
    }
  };

  const delegateTask = async (task) => {
    if (!selectedCompany?._id) {
      setActionError('Join a workspace before delegating a task.');
      return;
    }
    const unresolvedBlockers = (task.blockedBy || []).some((blockerId) => {
      const blocker = tasks.find((item) => item.id === String(blockerId?._id || blockerId));
      return blocker && blocker.status !== 'done';
    });
    if (unresolvedBlockers) {
      setActionError('Resolve blocking tasks before delegating this task.');
      return;
    }
    setDelegatingId(task.id);
    setActionError('');
    try {
      const result = await apiFetch('/api/v1/agent/delegate', {
        method: 'POST',
        body: JSON.stringify({ taskId: task.id, workspaceId: selectedCompany._id, specIds: task.specIds || [] }),
      });
      if (result.success) await loadTasks();
    } catch (error) {
      setActionError(error.message || 'Could not delegate this task');
    } finally {
      setDelegatingId(null);
    }
  };

  const handleTaskCreated = (task) => {
    setTasks((previous) => [normalizeTask(task), ...previous]);
    setShowWizard(false);
  };

  const formatDate = (d) => {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const tabCount = (tab) => {
    if (tab === 'all') return tasks.length;
    return tasks.filter((t) => t.status === tab).length;
  };

  const pct = (count) => (tasks.length ? Math.round((count / tasks.length) * 100) : 0);

  const kpis = [
    { key: 'all', label: 'Total Tasks', value: tasks.length, sub: `${pct(tasks.length)}% of workload`, color: 'blue', Icon: ListTodo },
    { key: 'in_progress', label: 'In Progress', value: tabCount('in_progress'), sub: `${pct(tabCount('in_progress'))}% of work`, color: 'green', Icon: Activity },
    { key: 'in_review', label: 'In Review', value: tabCount('in_review'), sub: `${pct(tabCount('in_review'))}% awaiting feedback`, color: 'orange', Icon: Eye },
    { key: 'done', label: 'Done', value: tabCount('done'), sub: `${pct(tabCount('done'))}% shipped`, color: 'purple', Icon: CheckCircle2 },
  ];

  if (!hasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0b0f17] text-white">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <AuthGuard>
      <Head>
        <title>Tasks - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="workspace-container">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main">
          {showWizard ? (
            <CreateTaskWizard
              onClose={() => setShowWizard(false)}
              onCreated={handleTaskCreated}
              companyId={selectedCompany?._id || selectedCompany?.id}
              projects={projects}
              projectsLoading={projectsLoading}
              specs={specs}
              projectsError={projectsError}
              defaultProjectId={typeof router.query.projectId === 'string' ? router.query.projectId : ''}
            />
          ) : (
            <>
          <header className="workspace-header dash-header">
            <div>
              <p className="dash-crumb">
                BuildrsHQ <span className="sep">/</span> Tasks
              </p>
              <h1 className="dash-title">Task Board</h1>
              <div className="dash-statusline">
                <span className="status-indicator status-online" />
                <span>{tasks.length} tasks tracked</span>
                <span className="dash-clock">· {clock || '—:——:——'}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="dash-pill hidden md:inline-flex">
                <span className="dot" />
                {activeTab === 'all' ? 'All Tasks' : STATUS_LABELS[activeTab]}
              </span>
              <button
                type="button"
                className="btn-workspace btn-secondary"
                title="Refresh tasks"
                onClick={loadTasks}
                disabled={loading}
              >
                <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button type="button" className="btn-workspace btn-primary" onClick={() => setShowWizard(true)}>
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New Task</span>
              </button>
            </div>
          </header>

          <div className="workspace-content">
            <div className="tsk-content">
              {actionError && <div className="std-alert std-alert-error mb-5">{actionError}<button type="button" className="ml-auto" onClick={() => setActionError('')}><X className="w-4 h-4" /></button></div>}
              {error && (
                <div className="std-alert std-alert-error mb-6">
                  <Loader2 className="w-4 h-4 flex-shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              {/* KPI strip */}
              <section className="dash-section">
                <div className="dash-section-head">
                  <div className="dash-eyebrow">
                    <span className="dot" />
                    <b>Workload</b> · tap a metric to filter
                  </div>
                </div>
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                  {kpis.map((kpi) => (
                    <div
                      key={kpi.key}
                      className={`dash-kpi dash-kpi-${kpi.color} dash-kpi-link ${activeTab === kpi.key ? 'tsk-kpi-active' : ''}`}
                      onClick={() => setActiveTab(kpi.key)}
                      style={activeTab === kpi.key ? { borderColor: 'rgba(47,214,230,0.5)' } : undefined}
                    >
                      <div className="dash-kpi-head">
                        <span className="dash-kpi-eyebrow">{kpi.label}</span>
                        <span className="dash-kpi-ico"><kpi.Icon className="w-4 h-4" /></span>
                      </div>
                      <div className="dash-kpi-value">{kpi.value}</div>
                      <div className="dash-kpi-meta-row">
                        <span className="dash-kpi-meta">{kpi.sub}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Filter rail */}
              <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
                <div className="tsk-tabs">
                  {TABS.map((tab) => {
                    const isActive = activeTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        className={`tsk-tab ${isActive ? 'is-active' : ''}`}
                        onClick={() => setActiveTab(tab.key)}
                      >
                        {tab.key !== 'all' && (
                          <span className="tsk-tab-dot" style={{ background: TAB_DOTS[tab.key] }} />
                        )}
                        {tab.label}
                        <span className="tsk-tab-count">{tabCount(tab.key)}</span>
                      </button>
                    );
                  })}
                </div>
                <span className="std-note">{filteredTasks.length} shown · click status dot to cycle</span>
              </div>

              {/* Board */}
              {loading ? (
                <div className="workspace-card">
                  <div className="workspace-card-body">
                    <div className="dash-empty">
                      <div className="dash-empty-ico">
                        <Loader2 className="w-5 h-5 animate-spin" />
                      </div>
                      <p className="dash-empty-title">Loading tasks...</p>
                    </div>
                  </div>
                </div>
              ) : filteredTasks.length === 0 ? (
                <div className="workspace-card">
                  <div className="workspace-card-body">
                    <div className="dash-empty">
                      <div className="dash-empty-ico">
                        <Inbox className="w-5 h-5" />
                      </div>
                      <p className="dash-empty-title">No tasks found</p>
                      <p className="dash-empty-sub">
                        {activeTab === 'all' ? 'Create your first task to get started.' : `No ${STATUS_LABELS[activeTab]?.toLowerCase()} tasks.`}
                      </p>
                      {activeTab === 'all' && (
                        <button
                          type="button"
                          className="btn-workspace btn-primary mt-4"
                          onClick={() => setShowWizard(true)}
                        >
                          <Plus className="w-4 h-4" /> New Task
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="tsk-list">
                  {filteredTasks.map((task) => {
                      const statusTint = STATUS_TINTS[task.status] || STATUS_TINTS.backlog;
                    const priorityTint = PRIORITY_TINTS[task.priority] || PRIORITY_TINTS.medium;
                    return (
                      <Fragment key={task.id}>
                      <div className="tsk-row">
                        <button
                          type="button"
                          className="flex items-center justify-center flex-shrink-0 w-5 h-5 rounded-full border-0 bg-transparent cursor-pointer p-0"
                          onClick={() => cycleStatus(task)}
                          disabled={cyclingId === task.id}
                          title={`Status: ${STATUS_LABELS[task.status] || task.status}. Click to cycle.`}
                        >
                          {cyclingId === task.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" style={{ color: statusTint.dot }} />
                          ) : (
                            <span
                              className="tsk-dot"
                              style={{
                                background: statusTint.dot,
                                boxShadow: `0 0 0 3px ${statusTint.bg}`,
                              }}
                            />
                          )}
                        </button>

                        <div className="tsk-main">
                          <div className="tsk-title-row">
                            <p className="tsk-title">{task.title}</p>
                            {task.agentSessionId && <span className="tsk-type">Agent session</span>}
                          </div>
                          {task.description && <p className="tsk-desc">{task.description}</p>}
                        </div>

                        <div className="tsk-side">
                          {task.priority && (
                            <span className="pill" style={{ background: priorityTint.bg, color: priorityTint.text }}>
                              {PRIORITY_LABELS[task.priority] || task.priority}
                            </span>
                          )}
                          <span className="pill" style={{ background: statusTint.bg, color: statusTint.text }}>
                            {STATUS_LABELS[task.status] || task.status}
                          </span>
                          <button type="button" className="btn-workspace btn-secondary" title="Task context and delegation" onClick={() => setExpandedTaskId((current) => current === task.id ? null : task.id)}><Link2 className="w-4 h-4" /></button>
                          <span className="tsk-date">{formatDate(task.createdAt)}</span>
                          <ChevronRight className="tsk-chevron" />
                        </div>
                      </div>
                      {expandedTaskId === task.id && <div className="border-b border-white/10 bg-white/[0.02] px-4 py-4 sm:px-6">
                        <div className="grid gap-6 lg:grid-cols-2">
                          <section>
                            <h3 className="mb-2 text-xs font-semibold uppercase text-[#9aa1ae]">Context</h3>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <label className="text-xs text-[#9aa1ae]">Figma node or frame ID
                                <input className="ws-input mt-1" value={task.figmaNodeId || ''} onChange={(event) => setTasks((current) => current.map((item) => item.id === task.id ? { ...item, figmaNodeId: event.target.value } : item))} onBlur={(event) => saveTaskContext(task, { figmaNodeId: event.target.value, specIds: task.specIds || [] })} placeholder="Optional frame ID" />
                              </label>
                              <label className="text-xs text-[#9aa1ae]">Blocked by
                                <select className="ws-select mt-1 min-h-10" multiple value={(task.blockedBy || []).map((id) => String(id?._id || id))} onChange={(event) => {
                                  const blockedBy = [...event.target.selectedOptions].map((option) => option.value);
                                  setTasks((current) => current.map((item) => item.id === task.id ? { ...item, blockedBy } : item));
                                  saveTaskContext(task, { blockedBy, specIds: task.specIds || [] });
                                }}>{tasks.filter((item) => item.id !== task.id).map((item) => <option key={item.id} value={item.id}>{item.title} · {STATUS_LABELS[item.status]}</option>)}</select>
                              </label>
                            </div>
                            <div className="mt-4">
                              <p className="mb-2 text-xs text-[#9aa1ae]">Attached specs <span className="text-[#727987]">(validation contracts)</span></p>
                              {specs.length ? <div className="grid gap-2 sm:grid-cols-2">{specs.map((spec) => <label key={spec._id} className="flex items-start gap-2 text-sm text-[#c6cad2]">
                                <input type="checkbox" checked={(task.specIds || []).includes(String(spec._id))} onChange={(event) => {
                                  const specIds = event.target.checked ? [...new Set([...(task.specIds || []), String(spec._id)])] : (task.specIds || []).filter((id) => id !== String(spec._id));
                                  const nextTask = { ...task, specIds };
                                  setTasks((current) => current.map((item) => item.id === task.id ? nextTask : item));
                                  saveTaskContext(nextTask, { specIds });
                                }} />
                                <span>{spec.title}<span className="block text-xs text-[#727987]">{spec.status || 'unvalidated'}</span></span>
                              </label>)}</div> : <p className="text-xs text-[#727987]">Create a spec in Specs to add executable validation.</p>}
                            </div>
                          </section>
                          <section>
                            <h3 className="mb-2 text-xs font-semibold uppercase text-[#9aa1ae]">Execution</h3>
                            {task.branch && <p className="mb-2 flex items-center gap-2 text-sm text-[#c6cad2]"><GitBranch className="w-4 h-4 text-[#2fd6e6]" /><code>{task.branch}</code></p>}
                            {task.agentSessionId && <p className="mb-3 text-xs text-[#9aa1ae]">Session {String(task.agentSessionId)} · {task.agentExecution?.status || 'active'}</p>}
                            {task.pullRequestId && <p className="mb-3 text-sm text-[#c6cad2]">Pull request: {task.pullRequestId}</p>}
                            <div className="flex flex-wrap gap-2">
                              <button type="button" className="btn-workspace btn-primary" onClick={() => delegateTask(task)} disabled={delegatingId === task.id || Boolean(task.agentSessionId) || task.status === 'blocked' || !selectedCompany?._id || contextSavingId === task.id}>
                                {delegatingId === task.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}{delegatingId === task.id ? 'Delegating' : 'Delegate to AI Agent'}
                              </button>
                              {task.agentSessionId && <button type="button" className="btn-workspace btn-secondary" onClick={() => window.location.assign(`/ai-pair?executionId=${task.agentSessionId}`)}><ExternalLink className="w-4 h-4" /> Open session</button>}
                              {contextSavingId === task.id && <span className="self-center text-xs text-[#9aa1ae]">Saving context</span>}
                            </div>
                            {!(task.specIds || []).length && <p className="mt-3 text-xs text-[#e5b84a]">Attach a spec to give this run an explicit contract and automated checks.</p>}
                          </section>
                        </div>
                      </div>}
                      </Fragment>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
            </>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}