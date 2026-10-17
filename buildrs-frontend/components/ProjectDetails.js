import { useEffect, useState } from 'react';
import {
  ArrowLeft, Bot, CheckCircle2, Clock, FileText,
  Folder, GitBranch, Github, Loader2, Plus, RefreshCw, Rocket
} from 'lucide-react';
import { projectApi } from '../lib/api';

const DONE_STATUSES = ['done', 'completed'];
const IN_PROGRESS_STATUSES = ['in_progress', 'in-progress', 'running'];
const REVIEW_STATUSES = ['in_review', 'review'];

function formatRelativeTime(value) {
  if (!value) return '';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function getTaskStatus(task) {
  const status = String(task.status || 'backlog').toLowerCase();
  if (DONE_STATUSES.includes(status)) return 'Completed';
  if (IN_PROGRESS_STATUSES.includes(status)) return 'In progress';
  if (REVIEW_STATUSES.includes(status)) return 'In review';
  if (status === 'blocked') return 'Blocked';
  return 'Open';
}

export default function ProjectDetails({ projectId, onBack, onCreateTask }) {
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    projectApi.get(projectId)
      .then((response) => {
        if (!response.success || !response.project) {
          throw new Error(response.message || 'Could not load this project.');
        }
        if (!active) return;
        setProject(response.project);
        setTasks(Array.isArray(response.tasks) ? response.tasks : []);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Could not load this project.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [projectId, retryCount]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-3 bg-[#0b0f17] text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin text-cyan-400" /> Loading project...
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center bg-[#0b0f17] px-6 text-center">
        <p role="alert" className="text-sm text-rose-400">{error || 'Project not found.'}</p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onBack} className="rounded-lg border border-white/10 px-4 py-2 text-xs text-white hover:bg-white/5">
            Back to projects
          </button>
          <button type="button" onClick={() => setRetryCount((count) => count + 1)} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-xs text-white hover:bg-white/5">
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      </div>
    );
  }

  const technologies = Array.isArray(project.technologies) && project.technologies.length
    ? project.technologies
    : (Array.isArray(project.tags) ? project.tags : []);
  const completedTasks = tasks.filter((task) => DONE_STATUSES.includes(String(task.status || '').toLowerCase())).length;
  const inProgressTasks = tasks.filter((task) => IN_PROGRESS_STATUSES.includes(String(task.status || '').toLowerCase())).length;
  const reviewTasks = tasks.filter((task) => REVIEW_STATUSES.includes(String(task.status || '').toLowerCase())).length;
  const openTasks = tasks.length - completedTasks;
  const progress = tasks.length
    ? Math.round((completedTasks / tasks.length) * 100)
    : Math.min(100, Math.max(0, Number(project.progress) || 0));
  const updatedLabel = formatRelativeTime(project.updatedAt);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#0b0f17] p-6 text-white">
      <div className="mb-6">
        <div className="mb-5 flex items-center gap-3">
          <button type="button" onClick={onBack} aria-label="Back to projects" className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/5 hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400">Work / Projects</p>
            <h1 className="text-xl font-bold tracking-tight text-white">{project.name}</h1>
          </div>
        </div>

        <section className="rounded-2xl border border-white/[0.07] bg-[#0d1119] p-5">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-500/20 bg-cyan-500/10 text-cyan-400">
                  <Folder className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-xl font-bold text-white">{project.name}</h2>
                    <span className={`h-2 w-2 shrink-0 rounded-full ${project.status === 'active' ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
                  </div>
                  <p className="mt-1 text-xs capitalize text-zinc-500">{project.status || 'active'} · {project.priority || 'medium'} priority</p>
                </div>
              </div>
              <p className="mt-4 max-w-3xl text-sm leading-relaxed text-zinc-400">{project.description || 'No project description provided.'}</p>
            </div>

            <div className="flex shrink-0 flex-col gap-3 md:items-end">
              <div className="flex items-center gap-2">
                {project.githubRepoUrl && (
                  <a href={project.githubRepoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-[#161b26] px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/5">
                    <Github className="h-3.5 w-3.5" /> Open repository
                  </a>
                )}
                <button type="button" onClick={onCreateTask} className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-400">
                  <Plus className="h-3.5 w-3.5" /> Create task
                </button>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                <span className="inline-flex items-center gap-1"><GitBranch className="h-3 w-3" /> {project.defaultBranch || 'main'}</span>
                {project.visibility && <span className="rounded border border-white/10 px-1.5 py-0.5 capitalize">{project.visibility}</span>}
                {updatedLabel && <span>{updatedLabel}</span>}
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: 'Total tasks', value: tasks.length, detail: `${openTasks} open` },
          { label: 'In progress', value: inProgressTasks, detail: 'Tasks being worked on' },
          { label: 'In review', value: reviewTasks, detail: 'Waiting for review' },
          { label: 'Completed', value: completedTasks, detail: `${progress}% project progress` },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-white/[0.07] bg-[#0d1119] p-4">
            <p className="text-xs text-zinc-500">{item.label}</p>
            <p className="mt-2 text-2xl font-bold text-white">{item.value}</p>
            <p className="mt-1 text-[10px] text-zinc-500">{item.detail}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-white/[0.07] bg-[#0d1119] p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">Project tasks</h2>
                <p className="mt-1 text-[11px] text-zinc-500">Tasks linked to {project.name}</p>
              </div>
              <button type="button" onClick={onCreateTask} className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-400 hover:text-cyan-300">
                <Plus className="h-3.5 w-3.5" /> Add task
              </button>
            </div>
            {tasks.length === 0 ? (
              <div className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-white/5 bg-white/[0.02] px-4 text-center">
                <CheckCircle2 className="mb-2 h-5 w-5 text-zinc-600" />
                <p className="text-xs font-medium text-white">No tasks yet</p>
                <p className="mt-1 text-[10px] text-zinc-500">Create a task to start tracking work on this project.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {tasks.map((task) => (
                  <article key={task.id || task._id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <h3 className="truncate text-xs font-medium text-white">{task.title}</h3>
                      {task.description && <p className="mt-1 line-clamp-2 text-[10px] text-zinc-500">{task.description}</p>}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="rounded-md bg-white/5 px-2 py-1 text-[9px] capitalize text-zinc-300">{getTaskStatus(task)}</span>
                      <span className="text-[9px] capitalize text-zinc-500">{task.priority || 'medium'} priority</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-[#0d1119] p-5">
            <div className="mb-4 flex items-center gap-2">
              <FileText className="h-4 w-4 text-cyan-400" />
              <h2 className="text-base font-semibold text-white">Project configuration</h2>
            </div>
            <p className="mb-4 text-xs leading-relaxed text-zinc-400">{project.description || 'No project description provided.'}</p>
            <div className="flex flex-wrap gap-2">
              {technologies.length ? technologies.map((technology) => (
                <span key={technology} className="rounded-md border border-cyan-500/10 bg-[#101722] px-2.5 py-1 text-[10px] text-cyan-300">{technology}</span>
              )) : <span className="text-[10px] text-zinc-500">No technology stack configured.</span>}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg bg-[#161b26] p-3">
                <p className="text-[10px] text-zinc-500">Source</p>
                <p className="mt-1 capitalize text-white">{project.sourceType || (project.githubRepoUrl ? 'github' : 'scratch')}</p>
              </div>
              <div className="rounded-lg bg-[#161b26] p-3">
                <p className="text-[10px] text-zinc-500">Template</p>
                <p className="mt-1 text-white">{project.template || 'None'}</p>
              </div>
              <div className="rounded-lg bg-[#161b26] p-3">
                <p className="text-[10px] text-zinc-500">Figma context</p>
                <p className="mt-1 text-white">{project.intelligence?.figma ? 'Enabled' : 'Disabled'}</p>
              </div>
              <div className="rounded-lg bg-[#161b26] p-3">
                <p className="text-[10px] text-zinc-500">Starter specification</p>
                <p className="mt-1 text-white">{project.intelligence?.starterSpec ? 'Enabled' : 'Disabled'}</p>
              </div>
              <div className="rounded-lg bg-[#161b26] p-3">
                <p className="text-[10px] text-zinc-500">AI agents</p>
                <p className="mt-1 text-white">{project.intelligence?.aiAgents ? 'Enabled' : 'Disabled'}</p>
              </div>
              <div className="rounded-lg bg-[#161b26] p-3">
                <p className="text-[10px] text-zinc-500">Members</p>
                <p className="mt-1 text-white">{project.members?.length || 0}</p>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-white/[0.07] bg-[#0d1119] p-5">
            <h2 className="text-sm font-semibold text-white">Project health</h2>
            <div className="mt-4">
              <div className="mb-2 flex justify-between text-xs">
                <span className="text-zinc-400">Completion</span>
                <span className="font-semibold text-cyan-400">{progress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                <div className="h-full rounded-full bg-cyan-400" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-white/5 bg-[#161b26] p-3">
                <p className="text-[9px] text-zinc-500">Branch</p>
                <p className="mt-1 flex items-center gap-1 text-xs text-white"><GitBranch className="h-3 w-3 text-cyan-400" />{project.defaultBranch || 'main'}</p>
              </div>
              <div className="rounded-lg border border-white/5 bg-[#161b26] p-3">
                <p className="text-[9px] text-zinc-500">Updated</p>
                <p className="mt-1 flex items-center gap-1 text-xs text-white"><Clock className="h-3 w-3 text-cyan-400" />{updatedLabel || 'Unknown'}</p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-[#0d1119] p-5">
            <div className="mb-3 flex items-center gap-2">
              <Bot className="h-4 w-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-white">AI agents</h2>
            </div>
            <p className="text-xs text-zinc-400">
              {project.intelligence?.aiAgents
                ? 'AI agent support is enabled for this project. No project agent runs are available yet.'
                : 'AI agent support is disabled for this project.'}
            </p>
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-[#0d1119] p-5">
            <div className="mb-3 flex items-center gap-2">
              <Rocket className="h-4 w-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-white">Deployments</h2>
            </div>
            <p className="text-xs text-zinc-400">No deployment information is available for this project yet.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
