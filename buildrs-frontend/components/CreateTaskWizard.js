import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronDown,
  FileText,
  GitBranch,
  Layout,
  Loader2,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';
import { agentApi, projectApi } from '../lib/api';

const STATUS_OPTIONS = [
  { value: 'backlog', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'in_review', label: 'Review' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
  { value: 'urgent', label: 'Urgent' },
];

function getId(value) {
  return String(value?._id || value?.id || value || '');
}

export default function CreateTaskWizard({
  onClose,
  onCreated,
  companyId,
  user,
  projects = [],
  projectsLoading = false,
  specs = [],
  projectsError = '',
  defaultProjectId = '',
}) {
  const [task, setTask] = useState({
    title: '',
    description: '',
    taskType: 'local',
    status: 'backlog',
    priority: 'medium',
    dueDate: '',
    projectId: defaultProjectId,
    specIds: [],
    figmaNodeId: '',
    labels: [],
    labelInput: '',
    assignToMe: true,
    delegateToAgent: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const updateTask = (field, value) => {
    setTask((current) => ({ ...current, [field]: value }));
  };
  const selectedProject = projects.find((project) => getId(project) === task.projectId);
  const projectSpecs = useMemo(
    () => (task.projectId
      ? specs.filter((spec) => String(spec.projectId?._id || spec.projectId || spec.project?._id || spec.project) === task.projectId)
      : []),
    [specs, task.projectId]
  );

  const readinessItems = [
    { label: 'Project selected', done: Boolean(task.projectId), optional: true },
    { label: 'Status and priority set', done: Boolean(task.status && task.priority) },
    { label: 'Assignee selected', done: Boolean(task.assignToMe) },
    { label: 'Task title added', done: Boolean(task.title.trim()) },
    { label: 'Description added', done: Boolean(task.description.trim()), optional: true },
    { label: 'Due date selected', done: Boolean(task.dueDate), optional: true },
  ];
  const readinessCount = readinessItems.filter((item) => item.done).length;
  const readinessPercent = Math.round((readinessCount / readinessItems.length) * 100);
  const userName = user?.fullName || user?.name || 'You';

  const addLabel = (event) => {
    event.preventDefault();
    const label = task.labelInput.trim();
    if (!label || task.labels.some((item) => item.toLowerCase() === label.toLowerCase())) {
      updateTask('labelInput', '');
      return;
    }
    setTask((current) => ({ ...current, labels: [...current.labels, label], labelInput: '' }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const title = task.title.trim();
    if (!title) {
      setError('Enter a task title before creating the task.');
      return;
    }
    if (task.delegateToAgent && !companyId) {
      setError('Join a workspace before delegating this task to an agent.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const result = await projectApi.createTask({
        title,
        description: task.description.trim(),
        taskType: task.taskType,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate || null,
        projectId: task.projectId || null,
        companyId: companyId || null,
        specIds: task.specIds,
        figmaNodeId: task.figmaNodeId.trim() || null,
        labels: task.labels,
        assignToMe: task.assignToMe,
      });
      if (result.success === false || !result.task) {
        throw new Error(result.message || 'The task could not be created.');
      }

      let delegationError = '';
      let delegationResult = null;
      if (task.delegateToAgent) {
        try {
          delegationResult = await agentApi.delegate({
            taskId: getId(result.task),
            workspaceId: companyId,
            specIds: task.specIds,
          });
          if (delegationResult.success === false) {
            throw new Error(delegationResult.message || 'The task was created, but agent delegation failed.');
          }
        } catch (delegateError) {
          delegationError = delegateError.message || 'The task was created, but agent delegation failed.';
        }
      }

      onCreated?.({
        ...result.task,
        id: getId(result.task),
        status: result.task.status || task.status,
        priority: result.task.priority || task.priority,
        dueDate: result.task.dueDate || task.dueDate || null,
        projectId: result.task.projectId || task.projectId || null,
        labels: result.task.labels || task.labels,
        assigneeName: result.task.assigneeName || (task.assignToMe ? userName : ''),
        figmaNodeId: result.task.figmaNodeId || task.figmaNodeId || null,
        specIds: result.task.specIds || task.specIds,
        ...(delegationResult?.success ? {
          status: 'in_progress',
          agentSessionId: delegationResult.execution?._id,
          branch: delegationResult.agentBranch,
          agentExecution: { status: 'running' },
        } : {}),
        delegationError,
      });
    } catch (submitError) {
      setError(submitError.message || 'The task could not be created. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="tsk-create-screen">
      <header className="tsk-create-heading">
        <div className="tsk-create-breadcrumb"><span>WORK</span><b>/</b><span>TASKS</span><b>/</b><span>NEW</span></div>
        <div className="tsk-create-title-row">
          <button type="button" className="tsk-create-back" onClick={onClose} disabled={submitting} aria-label="Back to tasks">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1>Add new task</h1>
            <p>Capture the work, connect the right context, and route it to your team.</p>
          </div>
          {selectedProject && <div className="tsk-create-project-chips">
            <span><Layout className="w-3 h-3" />{selectedProject.name}</span>
            {selectedProject.defaultBranch && <span><GitBranch className="w-3 h-3" />{selectedProject.defaultBranch}</span>}
          </div>}
        </div>
      </header>

      <form className="tsk-create-layout" onSubmit={handleSubmit}>
        <div className="tsk-create-main">
          <section className="tsk-create-panel">
            <header className="tsk-create-panel-heading">
              <div><h2>Task brief</h2><p>Give the team enough context to get moving.</p></div>
            </header>

            <label className="tsk-create-field">
              <span>Task title <b>*</b></span>
              <input
                type="text"
                maxLength={120}
                value={task.title}
                onChange={(event) => updateTask('title', event.target.value)}
                placeholder="e.g. Harden OAuth refresh token rotation"
                required
              />
              <small><span>Keep it actionable and specific.</span><span>{task.title.length} / 120</span></small>
            </label>

            <label className="tsk-create-field tsk-create-description">
              <span>Description</span>
              <textarea
                rows={4}
                value={task.description}
                onChange={(event) => updateTask('description', event.target.value)}
                placeholder="Add implementation notes, acceptance criteria, or useful context..."
              />
              <small><span>Include implementation notes or acceptance criteria.</span><span>{task.description.length} characters</span></small>
            </label>

            <div className="tsk-create-section-title">
              <h3>Planning details</h3>
              <p>Set ownership, timing, and delivery signals.</p>
            </div>

            <div className="tsk-create-fields-grid">
              <label className="tsk-create-field">
                <span>Status <b>*</b></span>
                <span className="tsk-create-select-wrap">
                  <select value={task.status} onChange={(event) => updateTask('status', event.target.value)}>
                    {STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                  </select>
                </span>
              </label>

              <label className="tsk-create-field">
                <span>Priority <b>*</b></span>
                <span className="tsk-create-select-wrap">
                  <select value={task.priority} onChange={(event) => updateTask('priority', event.target.value)}>
                    {PRIORITY_OPTIONS.map((priority) => <option key={priority.value} value={priority.value}>{priority.label}</option>)}
                  </select>
                </span>
              </label>

              <label className="tsk-create-field">
                <span>Assignee</span>
                <span className="tsk-create-select-wrap tsk-create-select-icon">
                  <UserRound className="w-3.5 h-3.5" />
                  <select value={task.assignToMe ? 'me' : ''} onChange={(event) => updateTask('assignToMe', event.target.value === 'me')}>
                    <option value="me">{userName}</option>
                    <option value="">Unassigned</option>
                  </select>
                </span>
              </label>

              <label className="tsk-create-field">
                <span>Due date</span>
                <span className="tsk-create-select-wrap tsk-create-select-icon">
                  <CalendarDays className="w-3.5 h-3.5" />
                  <input type="date" value={task.dueDate} onChange={(event) => updateTask('dueDate', event.target.value)} />
                </span>
              </label>

              <label className="tsk-create-field">
                <span>Project</span>
                <span className="tsk-create-select-wrap tsk-create-select-icon">
                  <Layout className="w-3.5 h-3.5" />
                  <select value={task.projectId} onChange={(event) => setTask((current) => ({ ...current, projectId: event.target.value, specIds: [] }))} disabled={projectsLoading}>
                    <option value="">{projectsLoading ? 'Loading projects...' : 'No project'}</option>
                    {projects.map((project) => <option key={getId(project)} value={getId(project)}>{project.name || 'Untitled project'}</option>)}
                  </select>
                </span>
                {projectsError && <small className="tsk-create-error-note">{projectsError}</small>}
              </label>

              <div className="tsk-create-field">
                <span>Labels</span>
                <div className="tsk-label-input">
                  {task.labels.map((label, index) => <span className={`tsk-label-chip label-${index % 3}`} key={`${label}-${index}`}>{label}<button type="button" onClick={() => updateTask('labels', task.labels.filter((item) => item !== label))} aria-label={`Remove ${label} label`}><X className="w-3 h-3" /></button></span>)}
                  <input value={task.labelInput} onChange={(event) => updateTask('labelInput', event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ',') addLabel(event); }} onBlur={addLabel} placeholder="Add label..." aria-label="Add label" />
                </div>
              </div>
            </div>

            <div className="tsk-create-section-title tsk-create-context-heading">
              <h3>Connect context</h3>
              <p>Attach the source so an assignee or agent has useful context.</p>
            </div>
            <div className="tsk-create-context-grid">
              <div className="tsk-create-context-card">
                <div className="tsk-create-context-title">
                  <span className="is-purple"><FileText className="w-4 h-4" /></span>
                  <div><strong>Specification</strong><small>Architecture and acceptance rules</small></div>
                </div>
                <details className="tsk-spec-picker">
                  <summary>
                    <span>{task.specIds.length ? `${task.specIds.length} specification${task.specIds.length === 1 ? '' : 's'} selected` : 'None'}</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </summary>
                  <div className="tsk-spec-options">
                    {!task.projectId ? <p>Select a project to see its specifications.</p> : projectSpecs.length === 0 ? <p>No specifications are available for this project.</p> : projectSpecs.map((spec) => {
                      const id = getId(spec);
                      return <label key={id}>
                        <input type="checkbox" checked={task.specIds.includes(id)} onChange={(event) => updateTask('specIds', event.target.checked ? [...task.specIds, id] : task.specIds.filter((specId) => specId !== id))} />
                        <span>{spec.title || 'Untitled specification'}</span>
                      </label>;
                    })}
                  </div>
                </details>
              </div>

              <label className="tsk-create-context-card">
                <span className="tsk-create-context-title">
                  <span><Layout className="w-4 h-4" /></span>
                  <span><strong>Figma design</strong><small>Design file or selected frame</small></span>
                </span>
                <input className="tsk-figma-input" value={task.figmaNodeId} onChange={(event) => updateTask('figmaNodeId', event.target.value)} placeholder="Figma node ID (optional)" />
              </label>
            </div>

            <details className="tsk-create-advanced">
              <summary>Advanced options <ChevronDown className="w-3.5 h-3.5" /></summary>
              <label className="tsk-create-field">
                <span>Task type</span>
                <span className="tsk-create-select-wrap">
                  <select value={task.taskType} onChange={(event) => updateTask('taskType', event.target.value)}>
                    <option value="local">Local BuildrsHQ</option>
                    <option value="github">GitHub issue</option>
                    <option value="gitlab">GitLab issue</option>
                  </select>
                </span>
              </label>
            </details>

            {error && <p role="alert" className="tsk-create-error">{error}</p>}

            <footer className="tsk-create-actions">
              <button type="button" className="tsk-create-cancel" onClick={onClose} disabled={submitting}>Cancel</button>
              <button type="submit" className="tsk-create-submit" disabled={submitting || !task.title.trim()}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {submitting ? 'Creating task...' : 'Create task'}
              </button>
            </footer>
          </section>
        </div>

        <aside className="tsk-create-aside">
          <section className="tsk-create-panel tsk-agent-toggle-panel">
            <header className="tsk-create-panel-heading"><div><h2>AI Agent execution</h2><p>Start work immediately after creation.</p></div></header>
            <label className="tsk-agent-toggle">
              <span><strong>Delegate to an agent</strong><small>This agent receives this task along with all context.</small></span>
              <input type="checkbox" checked={task.delegateToAgent} onChange={(event) => updateTask('delegateToAgent', event.target.checked)} />
              <i aria-hidden="true" />
            </label>
            {task.delegateToAgent && !companyId && <p className="tsk-create-error-note">Join a workspace to delegate tasks.</p>}
          </section>

          <section className="tsk-create-panel tsk-readiness-panel">
            <header className="tsk-create-panel-heading tsk-readiness-heading">
              <div><h2>Ready to create</h2></div><b>{readinessCount} / {readinessItems.length}</b>
            </header>
            <div className="tsk-readiness-bar"><span style={{ width: `${readinessPercent}%` }} /></div>
            <ul>{readinessItems.map((item) => <li className={item.done ? 'is-done' : ''} key={item.label}>
              <span>{item.done && <Check className="w-3 h-3" />}</span><span>{item.label}{item.optional && <small> (optional)</small>}</span>
            </li>)}</ul>
          </section>

          <section className="tsk-create-panel tsk-linked-context-panel">
            <header className="tsk-create-panel-heading"><div><h2><GitBranch className="w-3.5 h-3.5" /> Linked development context</h2></div></header>
            <div className="tsk-branch-chip">
              <span className="tsk-branch-indicator" />
              <span>{selectedProject?.defaultBranch || 'Select a project to link its branch'}</span>
            </div>
            <p>Specs, Figma links, and agent runs will be attached after creation.</p>
          </section>
        </aside>
      </form>
    </div>
  );
}
