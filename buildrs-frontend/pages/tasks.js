import { useState, useEffect, useCallback } from 'react';
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
  RotateCw,
  Bot,
  CheckCircle2,
  GitBranch,
  ExternalLink,
  FileText,
  MoreHorizontal,
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

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [showWizard, setShowWizard] = useState(false);
  const [createdTask, setCreatedTask] = useState(null);
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
          const result = await apiFetch(`/api/v1/agent/status/${taskId}`);
          if (!result.execution) return null;
          const execution = result.execution;
          const lastFailure = [...(execution.terminalLog || [])].reverse()
            .find((entry) => entry.type === 'error')?.message;
          return {
            taskId,
            status: execution.status === 'awaiting_review' ? 'awaiting_approval' : execution.status,
            error: execution.status === 'failed'
              ? (execution.summary || lastFailure || 'The agent stopped without a detailed error.')
              : '',
          };
        } catch (statusError) {
          console.error(`Could not refresh agent status for task ${taskId}:`, statusError.message);
          return null;
        }
      }));
      if (!active) return;
      const byTaskId = new Map(updates.filter(Boolean).map((update) => [update.taskId, update]));
      if (byTaskId.size) {
        setTasks((current) => current.map((task) => {
          const update = byTaskId.get(task.id);
          return update ? {
            ...task,
            agentExecution: { ...task.agentExecution, status: update.status, error: update.error },
          } : task;
        }));
      }
    };
    refreshAgentStatuses();
    const intervalId = setInterval(refreshAgentStatuses, 5000);
    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [activeAgentTaskIds]);

  useEffect(() => {
    if (router.isReady && router.query.action === 'new') {
      setShowWizard(true);
    }
  }, [router.isReady, router.query.action]);

  useEffect(() => {
    if (!createdTask) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setCreatedTask(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [createdTask]);

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
      let modelPreference = null;
      try {
        modelPreference = JSON.parse(window.localStorage.getItem('buildrs-ai-model-preference') || 'null');
        // Older builds could persist the provider key in the model slot
        // (e.g. {provider:'groq', model:'groq'}), which the API rejects.
        // Treat that as "use the provider default".
        if (modelPreference?.model && modelPreference.model === modelPreference.provider) {
          modelPreference = null;
          window.localStorage.removeItem('buildrs-ai-model-preference');
        }
      } catch {
        window.localStorage.removeItem('buildrs-ai-model-preference');
      }
      const result = await apiFetch('/api/v1/agent/delegate', {
        method: 'POST',
        timeoutMs: 300000,
        body: JSON.stringify({
          taskId: task.id,
          workspaceId: selectedCompany._id,
          specIds: task.specIds || [],
          provider: modelPreference?.provider,
          model: modelPreference?.model,
        }),
      });
      if (result.success) await loadTasks();
    } catch (error) {
      setActionError(error.message || 'Could not delegate this task');
    } finally {
      setDelegatingId(null);
    }
  };

  const handleTaskCreated = (task) => {
    const normalizedTask = normalizeTask(task);
    setTasks((previous) => [normalizedTask, ...previous]);
    setCreatedTask(normalizedTask);
    setShowWizard(false);
  };

  const tabCount = (tab) => {
    if (tab === 'all') return tasks.length;
    return tasks.filter((t) => t.status === tab).length;
  };

  const pct = (count) => (tasks.length ? Math.round((count / tasks.length) * 100) : 0);

  const agentTaskCount = tasks.filter((task) => task.agentSessionId).length;
  const kpis = [
    { key: 'total', filter: 'all', label: 'Total tasks', value: tasks.length, sub: 'Across all columns', badge: 'Live' },
    { key: 'in-progress', filter: 'in_progress', label: 'In progress', value: tabCount('in_progress'), sub: `${pct(tabCount('in_progress'))}% of total`, badge: 'Active' },
    { key: 'agent-coverage', filter: 'all', label: 'Agent coverage', value: `${pct(agentTaskCount)}%`, sub: `${agentTaskCount} of ${tasks.length} tasks`, badge: `${agentTaskCount} agents` },
    { key: 'completion', filter: 'done', label: 'Completion rate', value: `${pct(tabCount('done'))}%`, sub: `${tabCount('done')} of ${tasks.length} done`, badge: 'Healthy' },
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

      <div className="workspace-container tsk-workspace-shell">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main">
          {showWizard ? (
            <>
              <CreateTaskWizard
                onClose={() => setShowWizard(false)}
                onCreated={handleTaskCreated}
                companyId={selectedCompany?._id || selectedCompany?.id}
                user={user}
                projects={projects}
                projectsLoading={projectsLoading}
                specs={specs}
                projectsError={projectsError}
                defaultProjectId={typeof router.query.projectId === 'string' ? router.query.projectId : ''}
              />
            </>
          ) : (
            <>
              <header className="workspace-header dash-header tsk-page-header">
                <div>
                  <p className="dash-crumb"><span>WORK</span><span className="sep">/</span> TASKS</p>
                  <h1 className="dash-title">Tasks</h1>
                  <div className="tsk-header-subtitle">
                    <span>Plan, delegate, and ship connected engineering work.</span>
                    {selectedCompany?.name && <span className="tsk-workspace-chip">{selectedCompany.name}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="btn-workspace btn-secondary tsk-refresh-button"
                    title="Refresh tasks"
                    onClick={loadTasks}
                    disabled={loading}
                  >
                    <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                  <button type="button" className="btn-workspace btn-primary" onClick={() => setShowWizard(true)}>
                    <Plus className="w-4 h-4" />
                    <span>New Task</span>
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

                  <section className="tsk-kpis" aria-label="Task metrics">
                      {kpis.map((kpi) => (
                        <button
                          type="button"
                          key={kpi.key}
                          className={`tsk-kpi ${activeTab === kpi.filter ? 'tsk-kpi-active' : ''}`}
                          onClick={() => setActiveTab(kpi.filter)}
                          aria-pressed={activeTab === kpi.filter}
                        >
                          <div className="tsk-kpi-top">
                            <span>{kpi.label}</span>
                            <span className={`tsk-kpi-badge ${kpi.badge === 'Healthy' || kpi.badge === 'Live' ? 'is-good' : ''}`}>{kpi.badge}</span>
                          </div>
                          <div className="tsk-kpi-bottom">
                            <strong>{kpi.value}</strong>
                            <span>{kpi.sub}</span>
                          </div>
                        </button>
                      ))}
                  </section>

                  <div className="tsk-board-toolbar">
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
                    <div className="tsk-board-summary">
                      <span><b>{filteredTasks.length}</b> {filteredTasks.length === 1 ? 'task' : 'tasks'}</span>
                      <span className="tsk-summary-separator" />
                      <span><Bot className="w-3.5 h-3.5" /> {agentTaskCount} agent runs</span>
                      <span className="tsk-summary-updated">Updated {clock || 'just now'}</span>
                    </div>
                  </div>

                  {loading ? (
                    <div className="tsk-board-state">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Loading tasks...</span>
                    </div>
                  ) : (
                    <div className="tsk-board">
                      {STATUS_OPTIONS.filter((status) => activeTab === 'all' || status === activeTab).map((status) => {
                        const laneTasks = filteredTasks.filter((task) => task.status === status);
                        const statusTint = STATUS_TINTS[status];
                        const laneTitle = status === 'backlog' ? 'To Do' : status === 'in_review' ? 'Review' : STATUS_LABELS[status];
                        return (
                          <section className={`tsk-lane tsk-lane-${status}`} key={status}>
                            <header className="tsk-lane-heading">
                              <span className="tsk-lane-dot" style={{ background: statusTint.dot }} />
                              <h2>{laneTitle}</h2>
                              <span className="tsk-lane-count">{laneTasks.length}</span>
                            </header>
                            <div className="tsk-lane-cards">
                              {laneTasks.length ? laneTasks.map((task) => {
                                const priorityTint = PRIORITY_TINTS[task.priority] || PRIORITY_TINTS.medium;
                                const projectId = String(task.projectId?._id || task.projectId || task.project?._id || task.project || '');
                                const projectName = task.project?.name || task.projectName || projects.find((project) => String(project.id || project._id) === projectId)?.name || 'No project';
                                const linkedSpec = specs.find((spec) => (task.specIds || []).includes(String(spec._id)));
                                const assignee = typeof task.assignee === 'string' ? task.assignee : task.assignee?.fullName || task.assignee?.name;
                                const taskShortId = String(task.id).slice(-4).toUpperCase();
                                const isExpanded = expandedTaskId === task.id;
                                const agentActive = agentIsActive(task);
                                return (
                                  <article
                                    className={`tsk-card ${isExpanded ? 'is-expanded' : ''}`}
                                    key={task.id}
                                    role="link"
                                    tabIndex={0}
                                    aria-label={`View details for ${task.title}`}
                                    onClick={() => router.push(`/tasks/${task.id}`)}
                                    onKeyDown={(event) => {
                                      if (event.target !== event.currentTarget) return;
                                      if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        router.push(`/tasks/${task.id}`);
                                      }
                                    }}
                                  >
                                    <div className="tsk-card-top">
                                      <span className="tsk-card-id">T-{taskShortId}</span>
                                      <div className="tsk-card-actions">
                                        {task.priority && <span className="tsk-priority" style={{ background: priorityTint.bg, color: priorityTint.text }}>• {PRIORITY_LABELS[task.priority] || task.priority}</span>}
                                        <button
                                          type="button"
                                          className="tsk-card-status"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            cycleStatus(task);
                                          }}
                                          disabled={cyclingId === task.id}
                                          title={`Status: ${STATUS_LABELS[task.status] || task.status}. Click to cycle.`}
                                          aria-label={`Change status for ${task.title}`}
                                        >
                                          {cyclingId === task.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span style={{ background: statusTint.dot }} />}
                                        </button>
                                        <button type="button" className="tsk-card-menu" title="Task context and delegation" aria-label={`${isExpanded ? 'Close' : 'Open'} task details for ${task.title}`} aria-expanded={isExpanded} onClick={(event) => {
                                          event.stopPropagation();
                                          setExpandedTaskId((current) => current === task.id ? null : task.id);
                                        }}>
                                          <MoreHorizontal className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </div>
                                    <h3 className="tsk-card-title">{task.title}</h3>
                                    {task.description && <p className="tsk-card-description">{task.description}</p>}
                                    <div className="tsk-card-tags">
                                      <span>{projectName}</span>
                                      {task.status && <span>{STATUS_LABELS[task.status] || task.status}</span>}
                                    </div>
                                    <div className="tsk-card-meta">
                                      <div><FileText className="w-3.5 h-3.5" /><span>Spec · {linkedSpec?.title || ((task.specIds || []).length ? `${task.specIds.length} attached` : 'No spec linked')}</span><ChevronRight className="w-3 h-3" /></div>
                                      <div><GitBranch className="w-3.5 h-3.5" /><span>Figma · {task.figmaNodeId || 'No frame linked'}</span><ChevronRight className="w-3 h-3" /></div>
                                    </div>
                                    <div className="tsk-card-footer">
                                      <span className="tsk-assignee"><span className="tsk-assignee-avatar">{(assignee || (task.agentSessionId ? 'AI' : '?')).slice(0, 1).toUpperCase()}</span>{assignee || (task.agentSessionId ? 'AI Agent' : 'Unassigned')}</span>
                                      <span className={`tsk-agent-state ${agentActive ? 'is-running' : ''}`}>{task.agentSessionId ? task.agentExecution?.status || (agentActive ? 'Agent running' : 'Agent idle') : 'Ready for agent'}</span>
                                    </div>
                                    {task.agentExecution?.status === 'failed' && <p className="tsk-create-error-note" role="alert">Agent failed: {task.agentExecution.error || 'Open task details for execution diagnostics.'}</p>}
                                    {isExpanded && <div className="tsk-card-details" onClick={(event) => event.stopPropagation()}>
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
                                            <button type="button" className="btn-workspace btn-primary" onClick={() => delegateTask(task)} disabled={delegatingId === task.id || agentActive || task.status === 'blocked' || !selectedCompany?._id || contextSavingId === task.id} title={agentActive ? 'This task already has an active agent session' : undefined}>
                                              {delegatingId === task.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
                                              {delegatingId === task.id
                                                ? 'Delegating'
                                                : agentActive
                                                  ? 'Agent assigned'
                                                  : task.agentSessionId
                                                    ? 'Retry agent'
                                                    : 'Delegate to AI Agent'}
                                            </button>
                                            {task.agentSessionId && <button type="button" className="btn-workspace btn-secondary" onClick={() => window.location.assign(`/ai-pair?executionId=${task.agentSessionId}`)}><ExternalLink className="w-4 h-4" /> Open session</button>}
                                            {contextSavingId === task.id && <span className="self-center text-xs text-[#9aa1ae]">Saving context</span>}
                                          </div>
                                          {!(task.specIds || []).length && <p className="mt-3 text-xs text-[#e5b84a]">Attach a spec to give this run an explicit contract and automated checks.</p>}
                                        </section>
                                      </div>
                                    </div>}
                                  </article>
                                );
                              }) : <div className="tsk-lane-empty">No {laneTitle.toLowerCase()} tasks</div>}
                            </div>
                          </section>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
          {createdTask && (
            <div
              className="tsk-created-overlay"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setCreatedTask(null);
              }}
            >
              <section className="tsk-created-modal" role="dialog" aria-modal="true" aria-labelledby="tsk-created-title">
                <header className="tsk-created-modal-header">
                  <span className="tsk-created-success-icon"><CheckCircle2 className="w-5 h-5" /></span>
                  <h2 id="tsk-created-title">Task created successfully</h2>
                  <button type="button" onClick={() => setCreatedTask(null)} aria-label="Close task confirmation"><X className="w-4 h-4" /></button>
                </header>
                <div className="tsk-created-modal-body">
                  <p className="tsk-created-eyebrow">TASK DETAILS</p>
                  <dl>
                    <div><dt>Task title</dt><dd>{createdTask.title}</dd></div>
                    <div><dt>Description</dt><dd title={createdTask.description || ''}>{createdTask.description || 'No description'}</dd></div>
                    <div><dt>Status</dt><dd>{createdTask.status === 'backlog' ? 'To do' : STATUS_LABELS[createdTask.status] || createdTask.status || 'To do'}</dd></div>
                    <div><dt>Priority</dt><dd>{PRIORITY_LABELS[createdTask.priority] || createdTask.priority || 'Medium'}</dd></div>
                    <div><dt>Assigned</dt><dd>{createdTask.assigneeName || createdTask.assignee?.fullName || createdTask.assignee?.name || 'Unassigned'}</dd></div>
                    <div><dt>Due date</dt><dd>{formatCreatedDate(createdTask.dueDate)}</dd></div>
                    <div><dt>Project</dt><dd>{projects.find((project) => String(project.id || project._id) === String(createdTask.projectId?._id || createdTask.projectId || ''))?.name || createdTask.project?.name || 'No project'}</dd></div>
                    <div><dt>Labels</dt><dd className="tsk-created-labels">{createdTask.labels?.length ? createdTask.labels.map((label, index) => <span className={`tsk-label-chip label-${index % 3}`} key={`${label}-${index}`}>{label}</span>) : 'None'}</dd></div>
                  </dl>
                  {createdTask.delegationError && <p className="tsk-created-delegation-error">{createdTask.delegationError}</p>}
                </div>
                <footer className="tsk-created-modal-actions">
                  <button type="button" className="tsk-create-cancel" onClick={() => setCreatedTask(null)}>Done</button>
                  <button type="button" className="tsk-create-submit" onClick={() => router.push(`/tasks/${createdTask.id}`)}>View Task</button>
                </footer>
              </section>
            </div>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}