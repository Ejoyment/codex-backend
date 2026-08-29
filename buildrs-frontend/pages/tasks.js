import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch } from '../lib/api';
import { Plus, X, ChevronRight, Loader2, Inbox, RotateCw } from 'lucide-react';

const STATUS_OPTIONS = ['pending', 'in_progress', 'in_review', 'completed'];
const STATUS_LABELS = { pending: 'Pending', in_progress: 'In Progress', in_review: 'In Review', completed: 'Completed' };
const STATUS_COLORS = {
  pending: 'bg-gray-500/20 text-gray-400',
  in_progress: 'bg-blue-500/20 text-blue-400',
  in_review: 'bg-yellow-500/20 text-yellow-400',
  completed: 'bg-green-500/20 text-green-400',
};
const PRIORITY_COLORS = {
  low: 'bg-gray-500/20 text-gray-400',
  medium: 'bg-blue-500/20 text-blue-400',
  high: 'bg-yellow-500/20 text-yellow-400',
  urgent: 'bg-red-500/20 text-red-400',
};
const PRIORITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };
const TASK_TYPES = ['feature', 'bug', 'improvement', 'task', 'epic'];
const TASK_TYPE_LABELS = { feature: 'Feature', bug: 'Bug', improvement: 'Improvement', task: 'Task', epic: 'Epic' };
const TABS = ['all', 'pending', 'in_progress', 'in_review', 'completed'];

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

  return (
    <AuthGuard>
      <Head>
        <title>Tasks - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="min-h-screen bg-navy flex">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main ml-64">
          <header className="workspace-header">
            <div className="flex items-center gap-6">
              <h1 className="text-xl font-bold">Tasks</h1>
              <span className="text-sm text-muted">{tasks.length} total</span>
            </div>
            <div className="flex items-center gap-4">
              <button type="button" className="btn-workspace btn-secondary" onClick={loadTasks} title="Refresh">
                <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                className="cta-button px-4 py-2 rounded-lg text-white font-medium inline-flex items-center gap-2"
                onClick={() => setShowModal(true)}
              >
                <Plus className="w-4 h-4" /> New Task
              </button>
            </div>
          </header>

          <div className="workspace-content">
            <div className="flex gap-2 mb-6 overflow-x-auto">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    activeTab === tab
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : 'bg-navy-light text-gray-400 border border-gray-700 hover:text-white hover:border-gray-500'
                  }`}
                  onClick={() => setActiveTab(tab)}
                >
                  {STATUS_LABELS[tab] || 'All'}
                  <span className="ml-1.5 text-xs opacity-60">({tabCount(tab)})</span>
                </button>
              ))}
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6 text-red-400 text-sm">
                {error}
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                <span className="ml-3 text-gray-400">Loading tasks...</span>
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <Inbox className="w-12 h-12 mb-4 opacity-40" />
                <p className="text-lg font-medium mb-1">No tasks found</p>
                <p className="text-sm opacity-60">
                  {activeTab === 'all' ? 'Create your first task to get started.' : `No ${STATUS_LABELS[activeTab]?.toLowerCase()} tasks.`}
                </p>
                {activeTab === 'all' && (
                  <button
                    type="button"
                    className="cta-button px-4 py-2 rounded-lg text-white font-medium inline-flex items-center gap-2 mt-4"
                    onClick={() => setShowModal(true)}
                  >
                    <Plus className="w-4 h-4" /> New Task
                  </button>
                )}
              </div>
            ) : (
              <div className="bg-navy-light rounded-lg border border-gray-700 divide-y divide-gray-700">
                {filteredTasks.map((task) => (
                  <div key={task.id} className="p-4 flex items-center gap-4 group hover:bg-navy-lighter/50 transition-colors">
                    <button
                      type="button"
                      className="flex-shrink-0"
                      onClick={() => cycleStatus(task)}
                      disabled={cyclingId === task.id}
                      title={`Status: ${STATUS_LABELS[task.status] || task.status}. Click to cycle.`}
                    >
                      {cyclingId === task.id ? (
                        <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                      ) : (
                        <span className={`inline-block w-3 h-3 rounded-full ${
                          task.status === 'completed' ? 'bg-green-400' : task.status === 'in_progress' ? 'bg-blue-400' : task.status === 'in_review' ? 'bg-yellow-400' : 'bg-gray-400'
                        }`} />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-white truncate">{task.title}</p>
                        {task.taskType && (
                          <span className="text-xs px-2 py-0.5 rounded bg-white/5 text-gray-400">
                            {TASK_TYPE_LABELS[task.taskType] || task.taskType}
                          </span>
                        )}
                      </div>
                      {task.description && (
                        <p className="text-sm text-gray-400 truncate max-w-lg">{task.description}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      {task.priority && (
                        <span className={`text-xs px-2.5 py-1 rounded-full ${PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium}`}>
                          {PRIORITY_LABELS[task.priority] || task.priority}
                        </span>
                      )}
                      <span className={`text-xs px-2.5 py-1 rounded-full ${STATUS_COLORS[task.status] || STATUS_COLORS.pending}`}>
                        {STATUS_LABELS[task.status] || task.status}
                      </span>
                      <span className="text-xs text-gray-500 w-20 text-right">
                        {formatDate(task.createdAt)}
                      </span>
                      <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => !creating && setShowModal(false)} />
          <div className="relative bg-navy-light border border-gray-700 rounded-xl w-full max-w-lg mx-4 shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-700">
              <h2 className="text-lg font-bold text-white">Create Task</h2>
              <button
                type="button"
                className="text-gray-400 hover:text-white transition-colors"
                onClick={() => !creating && setShowModal(false)}
                disabled={creating}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={createTask} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Title</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 bg-navy border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="Enter task title"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Description</label>
                <textarea
                  className="w-full px-3 py-2 bg-navy border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                  rows={3}
                  placeholder="Optional description"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Priority</label>
                  <select
                    className="w-full px-3 py-2 bg-navy border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                    value={form.priority}
                    onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                  >
                    {Object.entries(PRIORITY_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Type</label>
                  <select
                    className="w-full px-3 py-2 bg-navy border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
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
                  className="btn-workspace btn-secondary px-4 py-2 rounded-lg text-sm"
                  onClick={() => setShowModal(false)}
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="cta-button px-4 py-2 rounded-lg text-white font-medium text-sm inline-flex items-center gap-2"
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
