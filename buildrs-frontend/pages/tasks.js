import { Fragment, useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch } from '../lib/api';
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
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);
  const { selectedCompany } = useCurrentCompany();

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium' });
  const [cyclingId, setCyclingId] = useState(null);
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [specs, setSpecs] = useState([]);
  const [contextSavingId, setContextSavingId] = useState(null);
  const [delegatingId, setDelegatingId] = useState(null);
  const [actionError, setActionError] = useState('');
  const [clock, setClock] = useState('');

  useEffect(() => {
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
      setTasks((data.tasks || []).map(normalizeTask));
    } catch (err) {
      setError(err.message || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  useEffect(() => {
    if (!selectedCompany?._id) {
      setSpecs([]);
      return;
    }
    apiFetch(`/api/v1/specs/workspace/${selectedCompany._id}`)
      .then((data) => setSpecs(data.specs || []))
      .catch(() => setSpecs([]));
  }, [selectedCompany?._id]);

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

  const createTask = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    try {
      setCreating(true);
      const data = await apiFetch('/api/projects/tasks', {
        method: 'POST',
        body: JSON.stringify({ ...form, companyId: selectedCompany?._id }),
      });
      setTasks((prev) => [normalizeTask(data.task), ...prev]);
      setForm({ title: '', description: '', priority: 'medium' });
      setShowModal(false);
    } catch (err) {
      console.error('Failed to create task:', err);
    } finally {
      setCreating(false);
    }
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

  return (
    <AuthGuard>
      <Head>
        <title>Tasks - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="workspace-container">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main">
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
              <button type="button" className="btn-workspace btn-primary" onClick={() => setShowModal(true)}>
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
                          onClick={() => setShowModal(true)}
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
        </main>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => !creating && setShowModal(false)} />
          <div className="relative ws-modal w-full max-w-lg mx-4">
            <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.09)]">
              <div className="flex items-center gap-2.5">
                <span className="card-ico">
                  <Plus className="w-4 h-4" />
                </span>
                <h2 className="ws-modal-title">Create Task</h2>
              </div>
              <button
                type="button"
                className="text-muted hover:text-white transition-colors"
                onClick={() => !creating && setShowModal(false)}
                disabled={creating}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={createTask} className="p-5 space-y-4">
              <div>
                <label className="ws-label">Title</label>
                <input
                  type="text"
                  className="ws-input"
                  placeholder="Enter task title"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="ws-label">Description</label>
                <textarea
                  className="ws-textarea"
                  rows={3}
                  placeholder="Optional description"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="ws-label">Priority</label>
                  <select
                    className="ws-select"
                    value={form.priority}
                    onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                  >
                    {Object.entries({ critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' }).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  className="btn-workspace btn-secondary"
                  onClick={() => setShowModal(false)}
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-workspace btn-primary"
                  disabled={creating || !form.title.trim()}
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {creating ? 'Creating...' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}