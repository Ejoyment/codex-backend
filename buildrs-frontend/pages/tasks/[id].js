import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  ArrowLeft,
  ArrowUpRight,
  Bot,
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  Code2,
  ExternalLink,
  FileText,
  FolderKanban,
  GitBranch,
  Loader2,
  MessageSquareText,
  Pencil,
  Save,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';
import AuthGuard from '../../components/AuthGuard';
import Sidebar from '../../components/Sidebar';
import TaskWorkspaceTopBar from '../../components/TaskWorkspaceTopBar';
import { useCurrentCompany } from '../../hooks/useCurrentCompany';
import { agentApi, apiFetch, projectApi } from '../../lib/api';
import useAuthStore from '../../store/authStore';

const STATUS_LABELS = {
  backlog: 'To do',
  pending: 'To do',
  in_progress: 'In progress',
  'in-progress': 'In progress',
  in_review: 'Review',
  review: 'Review',
  blocked: 'Blocked',
  done: 'Done',
  completed: 'Done',
};

const PRIORITY_LABELS = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
  urgent: 'Urgent',
};

const REQUIREMENT_STATUS = {
  pass: { label: 'Verified', className: 'is-pass' },
  fail: { label: 'Failed', className: 'is-fail' },
  pending: { label: 'Pending', className: 'is-pending' },
  unknown: { label: 'Not checked', className: 'is-pending' },
};

function taskStatus(task) {
  return STATUS_LABELS[task?.status] || task?.status || 'To do';
}

function formatDate(value, options = { dateStyle: 'medium', timeStyle: 'short' }) {
  if (!value) return 'Not set';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not set' : date.toLocaleString(undefined, options);
}

function getPullRequestUrl(task, project) {
  const storedUrl = task?.pullRequestUrl || task?.pullRequest?.html_url || task?.pullRequestId;
  if (typeof storedUrl === 'string' && /^https?:\/\//i.test(storedUrl)) {
    try {
      const url = new URL(storedUrl);
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
    } catch {
      return '';
    }
  }

  const repositoryUrl = project?.githubRepoUrl;
  const pullRequestNumber = String(task?.pullRequestId || '');
  if (repositoryUrl && /^\d+$/.test(pullRequestNumber)) {
    try {
      const url = new URL(repositoryUrl);
      if (url.protocol === 'https:' && url.hostname === 'github.com') {
        return `${url.origin}${url.pathname.replace(/\/+$/, '')}/pull/${pullRequestNumber}`;
      }
    } catch {
      return '';
    }
  }
  return '';
}

export default function TaskDetails() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const subscription = useAuthStore((state) => state.subscription);
  const { selectedCompany } = useCurrentCompany();
  const taskId = typeof router.query.id === 'string' ? router.query.id : '';
  const [task, setTask] = useState(null);
  const [projects, setProjects] = useState([]);
  const [specs, setSpecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [projectsError, setProjectsError] = useState('');
  const [specsError, setSpecsError] = useState('');
  const [actionError, setActionError] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: '', description: '', status: '', priority: '' });
  const [saving, setSaving] = useState(false);
  const [delegating, setDelegating] = useState(false);
  const loadSequence = useRef(0);

  const loadTask = useCallback(async () => {
    if (!taskId) return;
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError('');
    setProjectsError('');
    try {
      const taskResult = await projectApi.getTask(taskId);
      if (taskResult.success === false || !taskResult.task) {
        throw new Error(taskResult.message || 'Task not found.');
      }
      if (sequence !== loadSequence.current) return;
      setTask({ ...taskResult.task, id: String(taskResult.task.id || taskResult.task._id) });
      try {
        const projectResult = await projectApi.list();
        if (sequence !== loadSequence.current) return;
        setProjects(projectResult.projects || []);
        setProjectsError('');
      } catch (projectError) {
        if (sequence !== loadSequence.current) return;
        setProjects([]);
        setProjectsError(projectError.message || 'Could not load project details.');
      }
    } catch (loadError) {
      if (sequence === loadSequence.current) setError(loadError.message || 'Could not load this task.');
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (router.isReady) loadTask();
  }, [router.isReady, loadTask]);

  useEffect(() => {
    if (!task?.agentSessionId || !['queued', 'running'].includes(task.agentExecution?.status)) return undefined;
    let active = true;
    const refreshExecution = async () => {
      try {
        const result = await agentApi.status(task.id);
        if (!active || result.success === false || !result.execution) return;
        const execution = result.execution;
        const lastFailure = [...(execution.terminalLog || [])].reverse()
          .find((entry) => entry.type === 'error')?.message;
        setTask((current) => current ? ({
          ...current,
          agentExecution: {
            ...current.agentExecution,
            status: execution.status === 'awaiting_review' ? 'awaiting_approval' : execution.status,
            error: execution.status === 'failed' ? (execution.summary || lastFailure || 'The agent stopped without a detailed error.') : '',
            logs: execution.logs || current.agentExecution?.logs || [],
          },
        }) : current);
      } catch (statusError) {
        console.error('Could not refresh delegated agent status:', statusError.message);
      }
    };
    refreshExecution();
    const intervalId = setInterval(refreshExecution, 5000);
    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [task?.agentSessionId, task?.agentExecution?.status, task?.id]);

  useEffect(() => {
    let active = true;
    const projectId = String(task?.projectId?._id || task?.projectId || '');
    if (!projectId) {
      setSpecs([]);
      setSpecsError('');
      return () => { active = false; };
    }

    apiFetch(`/api/v1/specs/project/${projectId}`)
      .then((result) => {
        if (active) {
          setSpecs(result.specs || []);
          setSpecsError('');
        }
      })
      .catch((loadError) => {
        if (active) {
          setSpecs([]);
          setSpecsError(loadError.message || 'Could not load linked specifications.');
        }
      });
    return () => { active = false; };
  }, [task?.projectId]);

  const projectId = String(task?.projectId?._id || task?.projectId || '');
  const project = projects.find((item) => String(item.id || item._id) === projectId);
  const linkedSpecs = useMemo(
    () => specs.filter((spec) => (task?.specIds || []).some((id) => String(id?._id || id) === String(spec._id))),
    [specs, task?.specIds]
  );
  const requirements = useMemo(
    () => linkedSpecs.flatMap((spec) => (spec.requirements || []).map((requirement) => ({ ...requirement, specTitle: spec.title, specKey: spec._id }))),
    [linkedSpecs]
  );
  const passedRequirements = requirements.filter((requirement) => requirement.status === 'pass').length;
  const readiness = requirements.length ? Math.round((passedRequirements / requirements.length) * 100) : 0;
  const pullRequestUrl = getPullRequestUrl(task, project);
  const assigneeName = task?.assigneeName || task?.assignee?.fullName || task?.assignee?.name || '';
  const userName = user?.fullName || user?.name || 'You';
  const activity = useMemo(() => {
    const entries = [];
    if (task?.createdAt) {
      entries.push({
        id: 'created',
        message: 'Task created',
        timestamp: task.createdAt,
        icon: CheckCircle2,
      });
    }
    (task?.agentExecution?.logs || []).forEach((log, index) => {
      entries.push({
        id: `agent-${index}`,
        message: log.message || 'Agent execution update',
        timestamp: log.timestamp || task.updatedAt,
        icon: Bot,
      });
    });
    if (task?.updatedAt && task.updatedAt !== task.createdAt && !(task?.agentExecution?.logs || []).length) {
      entries.push({
        id: 'updated',
        message: 'Task details updated',
        timestamp: task.updatedAt,
        icon: Pencil,
      });
    }
    return entries.sort((left, right) => new Date(right.timestamp || 0) - new Date(left.timestamp || 0));
  }, [task]);

  const beginEdit = () => {
    setDraft({
      title: task.title || '',
      description: task.description || '',
      status: task.status || 'backlog',
      priority: task.priority || 'medium',
    });
    setEditing(true);
    setActionError('');
  };

  const saveChanges = async (event) => {
    event.preventDefault();
    const title = draft.title.trim();
    if (!title) {
      setActionError('Task title is required.');
      return;
    }

    setSaving(true);
    setActionError('');
    try {
      const result = await apiFetch(`/api/projects/tasks/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title,
          description: draft.description,
          status: draft.status,
          priority: draft.priority,
        }),
      });
      if (result.success === false || !result.task) {
        throw new Error(result.message || 'Could not save task changes.');
      }
      setTask((current) => ({ ...current, ...result.task, id: String(result.task.id || result.task._id || current.id) }));
      setEditing(false);
    } catch (saveError) {
      setActionError(saveError.message || 'Could not save task changes.');
    } finally {
      setSaving(false);
    }
  };

  const delegateTask = async () => {
    const workspaceId = selectedCompany?._id || selectedCompany?.id || task?.companyId?._id || task?.companyId;
    if (!workspaceId) {
      setActionError('Join a workspace before delegating this task.');
      return;
    }
    setDelegating(true);
    setActionError('');
    try {
      const { tasks: allTasks = [] } = await projectApi.listTasks();
      const unresolvedBlockers = (task.blockedBy || []).some((blocker) => {
        const blockerId = String(blocker?._id || blocker);
        const linkedTask = allTasks.find((item) => String(item.id || item._id) === blockerId);
        return linkedTask && !['done', 'completed', 'archived'].includes(linkedTask.status);
      });
      if (unresolvedBlockers) {
        setActionError('Resolve blocking tasks from the task board before delegating.');
        return;
      }

      let modelPreference = null;
      try {
        modelPreference = JSON.parse(window.localStorage.getItem('buildrs-ai-model-preference') || 'null');
      } catch {
        window.localStorage.removeItem('buildrs-ai-model-preference');
      }
      const result = await apiFetch('/api/v1/agent/delegate', {
        method: 'POST',
        timeoutMs: 120000,
        body: JSON.stringify({
          taskId: task.id,
          workspaceId,
          specIds: task.specIds || [],
          provider: modelPreference?.provider,
          model: modelPreference?.model,
        }),
      });
      if (result.success === false) throw new Error(result.message || 'Could not delegate this task.');
      await loadTask();
    } catch (delegateError) {
      setActionError(delegateError.message || 'Could not delegate this task.');
    } finally {
      setDelegating(false);
    }
  };

  const handleSaveKeyDown = (event) => {
    if (event.key === 'Escape') setEditing(false);
  };

  return (
    <AuthGuard>
      <Head>
        <title>{task?.title ? `${task.title} - BuildrsHQ` : 'Task Details - BuildrsHQ'}</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>
      <div className="workspace-container tsk-workspace-shell">
        <Sidebar user={user} subscription={subscription} />
        <main className="workspace-main">
          <TaskWorkspaceTopBar
            user={user}
            selectedCompany={selectedCompany}
            onWorkspaceClick={() => router.push('/workspace')}
          />
          <header className="workspace-header tsk-detail-header">
            <div className="tsk-detail-header-title">
              <Link href="/tasks" className="tsk-back-link" aria-label="Back to tasks">
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <h1>Task Details</h1>
            </div>
            <div className="tsk-detail-header-actions">
              <a
                className={`tsk-review-pr ${pullRequestUrl ? '' : 'is-disabled'}`}
                href={pullRequestUrl || undefined}
                target={pullRequestUrl ? '_blank' : undefined}
                rel={pullRequestUrl ? 'noreferrer' : undefined}
                aria-disabled={!pullRequestUrl}
                title={pullRequestUrl ? 'Open the linked pull request' : 'No pull request is linked to this task'}
                onClick={(event) => { if (!pullRequestUrl) event.preventDefault(); }}
              >
                Review PR
                {pullRequestUrl && <ExternalLink className="w-3.5 h-3.5" />}
              </a>
              <button type="button" className="btn-workspace btn-primary" onClick={delegateTask} disabled={delegating || Boolean(task?.agentSessionId) || !task}>
                {delegating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
                {delegating ? 'Delegating' : task?.agentSessionId ? 'Agent assigned' : 'Delegate to AI'}
              </button>
            </div>
          </header>

          <div className="workspace-content tsk-detail-content">
            {actionError && <div className="std-alert std-alert-error tsk-detail-alert">{actionError}<button type="button" className="ml-auto" onClick={() => setActionError('')} aria-label="Dismiss error"><X className="w-4 h-4" /></button></div>}
            {task?.agentExecution?.status === 'failed' && (
              <div className="std-alert std-alert-error tsk-detail-alert" role="alert">
                <Bot className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1">Agent execution failed: {task.agentExecution.error || 'No failure details were saved.'}</span>
                {task.agentSessionId && <Link href={`/ai-pair?executionId=${task.agentSessionId}`} className="text-xs underline">Open run logs</Link>}
              </div>
            )}
            {loading ? (
              <div className="tsk-detail-state"><Loader2 className="w-5 h-5 animate-spin" /> Loading task details...</div>
            ) : error ? (
              <div className="tsk-detail-state is-error">
                <p>{error}</p>
                <button type="button" className="btn-workspace btn-secondary" onClick={loadTask}>Try again</button>
              </div>
            ) : task ? (
              <>
                <div className="tsk-detail-intro">
                  <div className="tsk-detail-breadcrumb">
                    <Link href="/tasks">WORK</Link><span>/</span><Link href="/tasks">TASKS</Link><span>/</span><span>{taskStatus(task).toUpperCase()}</span>
                    <span className={`tsk-detail-status status-${String(task.status || 'backlog').replace(/_/g, '-')}`}>{taskStatus(task)}</span>
                  </div>
                  <div className="tsk-detail-title-row">
                    <div>
                      <h2>{task.title}</h2>
                      <p>Track the scope, linked work, and review progress for this task.</p>
                    </div>
                    <span className={`tsk-priority-pill priority-${task.priority || 'medium'}`}>{PRIORITY_LABELS[task.priority] || task.priority || 'Medium'} priority</span>
                  </div>
                </div>

                <section className={`tsk-readiness ${requirements.length && readiness === 100 ? 'is-ready' : ''}`}>
                  <div className="tsk-readiness-icon">{requirements.length && readiness === 100 ? <Check className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}</div>
                  <div className="tsk-readiness-copy">
                    <strong>{requirements.length ? (readiness === 100 ? 'Ready for review' : 'Review readiness') : 'Task overview'}</strong>
                    <span>{requirements.length ? `${passedRequirements} of ${requirements.length} linked acceptance checks verified.` : 'Review linked specs and implementation details before moving this task forward.'}</span>
                  </div>
                  <div className="tsk-readiness-progress">
                    <span>{requirements.length ? `${readiness}%` : '—'}</span>
                    <div><span style={{ width: `${readiness}%` }} /></div>
                  </div>
                </section>

                {specsError && <div className="std-alert std-alert-error tsk-detail-alert">{specsError}</div>}
                {projectsError && <div className="std-alert std-alert-error tsk-detail-alert">{projectsError}</div>}

                <div className="tsk-detail-grid">
                  <div className="tsk-detail-main-column">
                    <section className="tsk-detail-panel tsk-overview-panel">
                      <header className="tsk-panel-header">
                        <div><h3>Overview</h3><span>Task summary and implementation context</span></div>
                        {!editing && <button type="button" className="tsk-edit-button" onClick={beginEdit}><Pencil className="w-3.5 h-3.5" /> Edit</button>}
                      </header>
                      {editing ? (
                        <form className="tsk-edit-form" onSubmit={saveChanges} onKeyDown={handleSaveKeyDown}>
                          <label>Title<input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} required maxLength={180} /></label>
                          <label>Description<textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} rows={4} /></label>
                          <div className="tsk-edit-fields">
                            <label>Status<select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}>
                              <option value="backlog">To do</option><option value="in_progress">In progress</option><option value="in_review">Review</option><option value="blocked">Blocked</option><option value="done">Done</option>
                            </select></label>
                            <label>Priority<select value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value }))}>
                              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option><option value="urgent">Urgent</option>
                            </select></label>
                          </div>
                          <div className="tsk-edit-actions">
                            <button type="button" className="tsk-edit-cancel" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
                            <button type="submit" className="btn-workspace btn-primary" disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save changes</button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <p className="tsk-overview-description">{task.description || 'No description has been added to this task yet.'}</p>
                          {task.figmaNodeId && <div className="tsk-implementation-note"><Sparkles className="w-3.5 h-3.5" /><span>Figma frame linked: <code>{task.figmaNodeId}</code></span></div>}
                        </>
                      )}
                    </section>

                    <section className="tsk-detail-panel">
                      <header className="tsk-panel-header">
                        <div><h3>Acceptance criteria</h3><span>Requirements from linked specifications</span></div>
                        <span className="tsk-panel-count">{requirements.length ? `${passedRequirements} / ${requirements.length} complete` : 'No checks linked'}</span>
                      </header>
                      {requirements.length ? (
                        <ul className="tsk-requirement-list">
                          {requirements.map((requirement) => {
                            const status = REQUIREMENT_STATUS[requirement.status] || REQUIREMENT_STATUS.unknown;
                            return <li key={`${requirement.specKey}-${requirement.id}`} className={status.className}>
                              <span className="tsk-requirement-icon">{requirement.status === 'pass' ? <Check className="w-3.5 h-3.5" /> : requirement.status === 'fail' ? <X className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}</span>
                              <span className="tsk-requirement-copy"><strong>{requirement.text}</strong><small>{requirement.specTitle} · {requirement.id}</small></span>
                              <span className="tsk-requirement-status">{status.label}</span>
                            </li>;
                          })}
                        </ul>
                      ) : (
                        <div className="tsk-panel-empty">{specsError ? 'Acceptance checks could not be loaded.' : 'Attach a spec with requirements to track acceptance checks here.'}</div>
                      )}
                    </section>

                    <section className="tsk-detail-panel">
                      <header className="tsk-panel-header"><div><h3>Linked work</h3><span>Specifications and code references attached to this task</span></div></header>
                      <div className="tsk-linked-work">
                        {linkedSpecs.map((spec) => <Link className="tsk-linked-card" href={`/workspace/specs/${spec._id}`} key={spec._id}>
                          <span className="tsk-linked-card-icon is-purple"><FileText className="w-4 h-4" /></span>
                          <span className="tsk-linked-card-copy"><b>SPEC</b><strong>{spec.title}</strong><small>{spec.specId || spec.status || 'Specification'}</small></span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>)}
                        {task.figmaNodeId && <div className="tsk-linked-card">
                          <span className="tsk-linked-card-icon is-cyan"><Code2 className="w-4 h-4" /></span>
                          <span className="tsk-linked-card-copy"><b>FIGMA</b><strong>Design frame</strong><small>{task.figmaNodeId}</small></span>
                        </div>}
                        {task.pullRequestId && pullRequestUrl && <a className="tsk-linked-card" href={pullRequestUrl} target="_blank" rel="noreferrer">
                          <span className="tsk-linked-card-icon is-blue"><GitBranch className="w-4 h-4" /></span>
                          <span className="tsk-linked-card-copy"><b>PULL REQUEST</b><strong>Review changes</strong><small>{task.branch || `Pull request ${task.pullRequestId}`}</small></span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </a>}
                        {task.branch && !task.pullRequestId && <div className="tsk-linked-card">
                          <span className="tsk-linked-card-icon is-blue"><GitBranch className="w-4 h-4" /></span>
                          <span className="tsk-linked-card-copy"><b>BRANCH</b><strong>{task.branch}</strong><small>Task branch</small></span>
                        </div>}
                        {!linkedSpecs.length && !task.figmaNodeId && !task.pullRequestId && !task.branch && <div className="tsk-panel-empty">No specifications, designs, or code references linked yet.</div>}
                      </div>
                    </section>

                    <section className="tsk-detail-panel">
                      <header className="tsk-panel-header"><div><h3>Activity</h3><span>Task and agent execution updates</span></div><span className="tsk-panel-count">{activity.length} {activity.length === 1 ? 'event' : 'events'}</span></header>
                      {activity.length ? <div className="tsk-activity-list">
                        {activity.map((entry) => {
                          const Icon = entry.icon;
                          return <div className="tsk-activity-item" key={entry.id}>
                            <span className="tsk-activity-icon"><Icon className="w-3.5 h-3.5" /></span>
                            <div className="tsk-activity-copy"><strong>{entry.message}</strong><span>{entry.id.startsWith('agent-') ? 'Buildrs Agent' : userName}</span></div>
                            <time>{formatDate(entry.timestamp, { dateStyle: 'short', timeStyle: 'short' })}</time>
                          </div>;
                        })}
                      </div> : <div className="tsk-panel-empty">No activity has been recorded for this task yet.</div>}
                    </section>
                  </div>

                  <aside className="tsk-detail-aside">
                    <section className="tsk-detail-panel tsk-task-facts">
                      <header className="tsk-panel-header"><div><h3>Task details</h3></div></header>
                      <dl>
                        <div><dt><CheckCircle2 />Status</dt><dd><span className={`tsk-fact-status status-${String(task.status || 'backlog').replace(/_/g, '-')}`}>{taskStatus(task)}</span></dd></div>
                        <div><dt><Sparkles />Priority</dt><dd className={`priority-text-${task.priority || 'medium'}`}>{PRIORITY_LABELS[task.priority] || task.priority || 'Medium'}</dd></div>
                        <div><dt><UserRound />Assignee</dt><dd>{assigneeName || 'Unassigned'}</dd></div>
                        <div><dt><UserRound />Reviewer</dt><dd>Not assigned</dd></div>
                        <div><dt><CalendarDays />Due date</dt><dd>{formatDate(task.dueDate, { dateStyle: 'medium' })}</dd></div>
                        <div><dt><FolderKanban />Project</dt><dd>{project?.name || 'No project'}</dd></div>
                        <div><dt><GitBranch />Branch</dt><dd className="tsk-fact-branch">{task.branch || 'Not created'}</dd></div>
                      </dl>
                      {!!task.labels?.length && <div className="tsk-label-list">{task.labels.map((label) => <span key={label}>{label}</span>)}</div>}
                    </section>

                    <section className="tsk-detail-panel tsk-review-checks">
                      <header className="tsk-panel-header"><div><h3>Review checks</h3></div></header>
                      <div className="tsk-review-check-row"><span>Acceptance checks</span><b>{passedRequirements} / {requirements.length}</b></div>
                      <div className="tsk-review-check-row"><span>Linked specifications</span><b>{linkedSpecs.length}</b></div>
                      <div className="tsk-review-check-row"><span>Agent execution</span><b className={task.agentSessionId ? 'is-check-active' : ''}>{task.agentSessionId ? task.agentExecution?.status || 'Active' : 'Not started'}</b></div>
                      {requirements.length > 0 && <div className="tsk-review-meter"><span style={{ width: `${readiness}%` }} /></div>}
                    </section>

                    <section className="tsk-detail-panel tsk-participants">
                      <header className="tsk-panel-header"><div><h3>Participants</h3></div><UserRound className="w-4 h-4" /></header>
                      <div className="tsk-participant-row">
                        <span className="tsk-participant-avatar">{(assigneeName || '?').slice(0, 1).toUpperCase()}</span>
                        <span><strong>{assigneeName || 'No assignee'}</strong><small>Assignee</small></span>
                      </div>
                      {task.agentSessionId && <div className="tsk-participant-row">
                        <span className="tsk-participant-avatar is-agent"><Bot className="w-3.5 h-3.5" /></span>
                        <span><strong>Buildrs Agent</strong><small>{task.agentExecution?.status || 'Assigned'}</small></span>
                      </div>}
                      {task.agentSessionId && <Link className="tsk-open-session" href={`/ai-pair?executionId=${task.agentSessionId}`}>Open agent session <ExternalLink className="w-3.5 h-3.5" /></Link>}
                    </section>

                    <section className="tsk-detail-panel tsk-task-timestamps">
                      <div><Clock3 className="w-3.5 h-3.5" /><span>Created</span><time>{formatDate(task.createdAt, { dateStyle: 'medium' })}</time></div>
                      {task.updatedAt && <div><Pencil className="w-3.5 h-3.5" /><span>Updated</span><time>{formatDate(task.updatedAt, { dateStyle: 'medium' })}</time></div>}
                      {task.description && <div><MessageSquareText className="w-3.5 h-3.5" /><span>Description</span><time>Added</time></div>}
                    </section>
                  </aside>
                </div>
              </>
            ) : null}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
