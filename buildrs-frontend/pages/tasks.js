import { useCallback, useEffect, useState, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch, projectApi } from '../lib/api';
import CreateTaskWizard from '../components/CreateTaskWizard';
import FigmaFramePicker from '../components/figma/FigmaFramePicker';
import {
  Plus,
  X,
  ChevronRight,
  Loader2,
  RotateCw,
  Bot,
  CheckCircle2,
  GitBranch,
  ExternalLink,
  FileText,
  MoreHorizontal,
} from 'lucide-react';
import { useCurrentCompany } from '../hooks/useCurrentCompany';
import { useCachedData } from '../hooks/useCachedData';

const STATUS_OPTIONS = ['backlog', 'in_progress', 'in_review', 'blocked', 'done'];
const STATUS_LABELS = { backlog: 'Backlog', in_progress: 'In Progress', in_review: 'In Review', blocked: 'Blocked', done: 'Done' };
const STATUS_TINTS = {
  backlog: { bg: 'rgba(154,174,186,0.1)', text: '#9aaeba', dot: '#748194' },
  in_progress: { bg: 'rgba(18,220,229,0.1)', text: '#12dce5', dot: '#12dce5' },
  in_review: { bg: 'rgba(229, 184, 74, 0.1)', text: '#e5b84a', dot: '#e5b84a' },
  blocked: { bg: 'rgba(236,20,20,0.1)', text: '#ec1414', dot: '#ec1414' },
  done: { bg: 'rgba(3,186,3,0.12)', text: '#03ba03', dot: '#03ba03' },
};
const PRIORITY_TINTS = {
  low: { bg: 'rgba(154,174,186,0.1)', text: '#9aaeba' },
  medium: { bg: 'rgba(18,220,229,0.1)', text: '#12dce5' },
  high: { bg: 'rgba(229, 184, 74, 0.1)', text: '#e5b84a' },
  critical: { bg: 'rgba(236,20,20,0.1)', text: '#ec1414' },
  urgent: { bg: 'rgba(236,20,20,0.1)', text: '#ec1414' },
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
  all: '#59687a',
  backlog: '#748194',
  in_progress: '#12dce5',
  in_review: '#e5b84a',
  blocked: '#ec1414',
  done: '#03ba03',
};

function formatCreatedDate(value) {
  if (!value) return 'Not set';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not set' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function normalizeTask(task) {
  const status = { pending: 'backlog', 'in-progress': 'in_progress', completed: 'done' }[task.status] || task.status || 'backlog';
  return { ...task, id: task.id || task._id, status, specIds: (task.specIds || []).map((spec) => String(spec?._id || spec)) };
}

// Keep the last session id for logs, but let a failed/rejected run be retried.
const AGENT_TERMINAL_STATUSES = new Set(['failed', 'rejected', 'completed', 'approved']);

function agentIsActive(task) {
  if (!task?.agentSessionId) return false;
  return !AGENT_TERMINAL_STATUSES.has(task.agentExecution?.status);
}

export default function Tasks() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);
  const { selectedCompany } = useCurrentCompany();
  const userId = user?._id || user?.id || user?.userId || null;

  const [showWizard, setShowWizard] = useState(false);
  const [createdTask, setCreatedTask] = useState(null);
  const [cyclingId, setCyclingId] = useState(null);
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [specs, setSpecs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [contextSavingId, setContextSavingId] = useState(null);
  const [delegatingId, setDelegatingId] = useState(null);
  const [actionError, setActionError] = useState('');
  const [clock, setClock] = useState('');
  const [hasHydrated, setHasHydrated] = useState(false);

  const {
    data: tasks,
    loading: loadingTasks,
    refresh: refreshTasks,
  } = useCachedData(userId, 'tasks', async () => {
    const data = await apiFetch('/api/projects/tasks', { noCache: true });
    if (data.success === false) throw new Error(data.message || 'Failed to load tasks');
    return (data.tasks || []).map(normalizeTask);
  }, { refreshOnVisibility: true, intervalMs: 30000 });

  const {
    data: specsData,
    loading: loadingSpecs,
    refresh: refreshSpecs,
  } = useCachedData(userId, 'specs', async () => {
    const data = await apiFetch('/api/specs', { noCache: true });
    if (data.success === false) throw new Error(data.message || 'Failed to load specs');
    return data.specs || [];
  }, { refreshOnVisibility: true, intervalMs: 30000 });

  const {
    data: projectsData,
    loading: loadingProjects,
    refresh: refreshProjects,
  } = useCachedData(userId, 'projects', async () => {
    const data = await projectApi.list({ noCache: true });
    if (!data.success || !Array.isArray(data.projects)) throw new Error(data.message || 'Could not load projects');
    return data.projects;
  }, { refreshOnVisibility: true, intervalMs: 30000 });

  useEffect(() => {
    setHasHydrated(true);
    const tick = () => {
      setClock(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const activeAgentTaskIds = tasks
    .filter((task) => task.agentSessionId && ['queued', 'running'].includes(task.agentExecution?.status))
    .map((task) => task.id)
    .join(',');

  useEffect(() => {
    if (!activeAgentTaskIds) return undefined;
    let active = true;
    const refreshAgentStatuses = async () => {
      const taskIds = activeAgentTaskIds.split(',');
      const updates = await Promise.all(taskIds.map(async (taskId) => {
        try {
          const data = await apiFetch(`/api/projects/tasks/${taskId}`, { noCache: true });
          return data.success ? data.task : null;
        } catch {
          return null;
        }
      }));
      if (!active) return;
      updates.forEach((updatedTask) => {
        if (!updatedTask) return;
        setTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? { ...t, ...updatedTask } : t)));
      });
    };
    refreshAgentStatuses();
    const interval = setInterval(refreshAgentStatuses, 15000);
    return () => { active = false; clearInterval(interval); };
  }, [activeAgentTaskIds]);

  const filteredTasks = activeTab === 'all' ? tasks : tasks.filter((t) => t.status === activeTab);

  const handleTaskAction = async (taskId, action) => {
    setDelegatingId(taskId);
    try {
      const data = await apiFetch(`/api/projects/tasks/${taskId}/${action}`, { method: 'POST', noCache: true });
      if (data.success === false) throw new Error(data.message || `Failed to ${action} task`);
      setDelegatingId(null);
      refreshTasks();
      refreshSpecs();
    } catch (err) {
      setDelegatingId(null);
      setActionError(err.message || `Failed to ${action} task`);
    }
  };

  const handleSaveContext = async (taskId, context) => {
    setContextSavingId(taskId);
    try {
      const data = await apiFetch(`/api/projects/tasks/${taskId}/context`, {
        method: 'POST',
        body: JSON.stringify({ context }),
        noCache: true,
      });
      if (data.success === false) throw new Error(data.message || 'Failed to save context');
      setContextSavingId(null);
      refreshTasks();
    } catch (err) {
      setContextSavingId(null);
      setActionError(err.message || 'Failed to save context');
    }
  };

  const handleCreateTask = async (formData) => {
    setShowWizard(false);
    try {
      const data = await apiFetch('/api/projects/tasks', {
        method: 'POST',
        body: JSON.stringify(formData),
        noCache: true,
      });
      if (data.success === false) throw new Error(data.message || 'Failed to create task');
      setCreatedTask(data.task);
      refreshTasks();
      refreshSpecs();
      refreshProjects();
    } catch (err) {
      setActionError(err.message || 'Failed to create task');
    }
  };

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
        <title>Tasks - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>
      <div className="min-h-screen bg-[#0e141d] text-white">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main">
          <div className="p-6">
            <h1 className="text-2xl font-bold text-white mb-6">Tasks</h1>

            {actionError && (
              <div className="mb-4 p-3 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
                {actionError}
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-2">
                <ButtonPlus onClick={() => setShowWizard(true)}>New Task</ButtonPlus>
              </div>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
              {TABS.map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${isActive
                      ? 'bg-cyan-400 text-slate-950'
                      : 'bg-[#161f2e] border border-white/10 text-zinc-400 hover:bg-white/5'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: TAB_DOTS[tab.key] }} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse border border-white/5">
                <thead>
                  <tr>
                    <th className="pb-3 text-[10px] font-semibold text-zinc-500 uppercase border-b border-white/5">Task</th>
                    <th className="pb-3 text-[10px] font-semibold text-zinc-500 uppercase border-b border-white/5">Status</th>
                    <th className="pb-3 text-[10px] font-semibold text-zinc-500 uppercase border-b border-white/5">Priority</th>
                    <th className="pb-3 text-[10px] font-semibold text-zinc-500 uppercase border-b border-white/5">Updated</th>
                    <th className="pb-3 text-[10px] font-semibold text-zinc-500 uppercase border-b border-white/5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingTasks ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-zinc-400">Loading tasks…</td>
                    </tr>
                  ) : filteredTasks.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-zinc-500">No tasks found</td>
                    </tr>
                  ) : (
                    filteredTasks.map((task) => (
                      <tr key={task.id} className="border-b border-white/5 hover:bg-white/5">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${STATUS_TINTS[task.status]?.dot || '#9aaeba'}`} />
                            <span className="text-sm text-white truncate">{task.title}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-medium ${STATUS_TINTS[task.status]?.bg || 'bg-zinc-800'} ${STATUS_TINTS[task.status]?.text || 'text-zinc-400'}`}>
                            {STATUS_LABELS[task.status] || task.status}
                          </span>
                        </td>
                        <td className="p-3 text-[10px] text-zinc-400">{PRIORITY_LABELS[task.priority || 'medium']}</td>
                        <td className="p-3 text-[10px] text-zinc-400">{formatCreatedDate(task.createdAt)}</td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            {task.status !== 'done' && (
                              <button
                                onClick={() => handleTaskAction(task.id, 'approve')}
                                className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 text-xs hover:bg-emerald-500/20"
                                disabled={delegatingId === task.id}
                              >
                                Approve
                              </button>
                            )}
                            {task.status !== 'rejected' && task.status !== 'done' && (
                              <button
                                onClick={() => handleTaskAction(task.id, 'reject')}
                                className="px-2 py-1 rounded bg-rose-500/10 text-rose-400 text-xs hover:bg-rose-500/20"
                                disabled={delegatingId === task.id}
                              >
                                Reject
                              </button>
                            )}
                            <button
                              onClick={() => handleTaskAction(task.id, 'tweak')}
                              className="px-2 py-1 rounded bg-cyan-500/10 text-cyan-400 text-xs hover:bg-cyan-500/20"
                              disabled={delegatingId === task.id}
                            >
                              Tweak
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {showWizard && (
              <CreateTaskWizard
                onClose={() => setShowWizard(false)}
                onCreated={handleCreateTask}
              />
            )}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}

function ButtonPlus({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-400 text-slate-950 text-xs font-bold shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-300"
    >
      <Plus size={14} /> {children}
    </button>
  );
}
