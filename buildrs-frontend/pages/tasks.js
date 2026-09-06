import { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';

const STATUS_OPTIONS = ['pending', 'in_progress', 'in_review', 'completed'];
const STATUS_LABELS = { pending: 'Pending', in_progress: 'In Progress', in_review: 'In Review', completed: 'Completed' };
const STATUS_TINTS = {
  pending: { bg: 'rgba(154, 161, 174, 0.1)', text: '#9aa1ae', dot: '#6b7280' },
  in_progress: { bg: 'rgba(47, 214, 230, 0.1)', text: '#2fd6e6', dot: '#2fd6e6' },
  in_review: { bg: 'rgba(229, 184, 74, 0.1)', text: '#e5b84a', dot: '#e5b84a' },
  completed: { bg: 'rgba(52, 211, 153, 0.12)', text: '#34d399', dot: '#34d399' },
};
const PRIORITY_TINTS = {
  low: { bg: 'rgba(154, 161, 174, 0.1)', text: '#9aa1ae' },
  medium: { bg: 'rgba(47, 214, 230, 0.1)', text: '#2fd6e6' },
  high: { bg: 'rgba(229, 184, 74, 0.1)', text: '#e5b84a' },
  urgent: { bg: 'rgba(248, 113, 113, 0.1)', text: '#f87171' },
};
const PRIORITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };
const TASK_TYPES = ['feature', 'bug', 'improvement', 'task', 'epic'];
const TASK_TYPE_LABELS = { feature: 'Feature', bug: 'Bug', improvement: 'Improvement', task: 'Task', epic: 'Epic' };
const TABS = [
  { key: 'all', label: 'All Tasks' },
  { key: 'pending', label: 'Pending' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'in_review', label: 'In Review' },
  { key: 'completed', label: 'Completed' },
];

const TAB_DOTS = {
  all: '#565d6b',
  pending: '#6b7280',
  in_progress: '#2fd6e6',
  in_review: '#e5b84a',
  completed: '#34d399',
};

export default function Tasks() {
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', taskType: 'task' });
  const [cyclingId, setCyclingId] = useState(null);
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
      setTasks(data.tasks || []);
    } catch (err) {
      setError(err.message || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

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
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...data.task } : t)));
    } catch (err) {
      console.error('Failed to update task status:', err);
    } finally {
      setCyclingId(null);
    }
  };

  const createTask = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    try {
      setCreating(true);
      const data = await apiFetch('/api/projects/tasks', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setTasks((prev) => [data.task, ...prev]);
      setForm({ title: '', description: '', priority: 'medium', taskType: 'task' });
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
    { key: 'completed', label: 'Completed', value: tabCount('completed'), sub: `${pct(tabCount('completed'))}% shipped`, color: 'purple', Icon: CheckCircle2 },
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
                    const statusTint = STATUS_TINTS[task.status] || STATUS_TINTS.pending;
                    const priorityTint = PRIORITY_TINTS[task.priority] || PRIORITY_TINTS.medium;
                    return (
                      <div key={task.id} className="tsk-row">
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
                            {task.taskType && (
                              <span className="tsk-type">{TASK_TYPE_LABELS[task.taskType] || task.taskType}</span>
                            )}
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
                          <span className="tsk-date">{formatDate(task.createdAt)}</span>
                          <ChevronRight className="tsk-chevron" />
                        </div>
                      </div>
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
                    {Object.entries(PRIORITY_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="ws-label">Type</label>
                  <select
                    className="ws-select"
                    value={form.taskType}
                    onChange={(e) => setForm((f) => ({ ...f, taskType: e.target.value }))}
                  >
                    {TASK_TYPES.map((val) => (
                      <option key={val} value={val}>{TASK_TYPE_LABELS[val]}</option>
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