import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, Box, GitBranch, FileText, Layout, Calendar, Folder,
  Link as LinkIcon, Check, Loader2
} from 'lucide-react';
import { projectApi } from '../lib/api';

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
  { value: 'urgent', label: 'Urgent' },
];

export default function CreateTaskWizard({ onClose, onCreated, companyId, projects = [], projectsLoading = false, specs = [], projectsError = '', defaultProjectId = '' }) {
  const [task, setTask] = useState({
    title: '',
    description: '',
    priority: 'medium',
    taskType: 'local',
    dueDate: '',
    projectId: defaultProjectId,
    specIds: [],
    figmaNodeId: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (defaultProjectId) {
      setTask((current) => ({ ...current, projectId: defaultProjectId }));
    }
  }, [defaultProjectId]);

  const updateTask = (field, value) => {
    setTask((current) => ({ ...current, [field]: value }));
  };
  const selectedProject = projects.find((project) => String(project._id || project.id) === task.projectId);
  const projectSpecs = task.projectId
    ? specs.filter((spec) => String(spec.projectId?._id || spec.projectId || spec.project?._id || spec.project) === task.projectId)
    : [];

  const toggleSpec = (specId) => {
    setTask((current) => ({
      ...current,
      specIds: current.specIds.includes(specId)
        ? current.specIds.filter((id) => id !== specId)
        : [...current.specIds, specId],
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const title = task.title.trim();
    if (!title) {
      setError('Enter a task title before creating the task.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const result = await projectApi.createTask({
        title,
        description: task.description.trim(),
        priority: task.priority,
        taskType: task.taskType,
        dueDate: task.dueDate || null,
        projectId: task.projectId || null,
        companyId: companyId || null,
        specIds: task.specIds,
        figmaNodeId: task.figmaNodeId.trim() || null,
      });
      if (result.success === false || !result.task) {
        throw new Error(result.message || 'The task could not be created.');
      }
      onCreated?.(result.task);
    } catch (submitError) {
      setError(submitError.message || 'The task could not be created. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f17] text-white flex flex-col p-6 overflow-x-hidden">

      {/* Header */}
      <div className="mb-8">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-400">
          WORK / TASKS / NEW
        </p>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} disabled={submitting} className="p-1.5 rounded-lg hover:bg-white/5 transition text-zinc-400 hover:text-white disabled:opacity-50">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-2xl font-bold tracking-tight text-white">Add new task</h1>
            {selectedProject && (
              <div className="hidden md:flex items-center gap-2">
                <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-[#161b26] px-2.5 py-1 text-[11px] font-medium text-zinc-300">
                  <Box className="h-3 w-3 text-cyan-400" /> {selectedProject.name}
                </span>
                {selectedProject.defaultBranch && (
                  <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-[#161b26] px-2.5 py-1 text-[11px] font-medium text-zinc-300">
                    <GitBranch className="h-3 w-3 text-cyan-400" /> {selectedProject.defaultBranch}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <p className="mt-1 ml-9 text-xs text-zinc-500">
          Capture the work, choose a project, and attach useful context.
        </p>
      </div>

      {/* Main Content Layout */}
      <div className="flex flex-col lg:flex-row gap-6 max-w-7xl mx-auto w-full">

        {/* Left Column: Main Form */}
        <div className="flex-1 space-y-6">

          {/* Task Brief Section */}
          <section className="rounded-2xl border border-white/[0.07] bg-[#0d1119] p-6">
            <h2 className="text-lg font-semibold text-white">Task brief</h2>
            <p className="text-xs text-zinc-500 mb-6">Give the team enough context to start moving.</p>

            <div className="space-y-5">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-white">Task title *</label>
                <input
                  type="text"
                  maxLength={120}
                  value={task.title}
                  onChange={(event) => updateTask('title', event.target.value)}
                  placeholder="e.g. Harden OAuth refresh token rotation"
                  required
                  className="w-full rounded-lg border border-white/10 bg-[#161b26] px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none transition-colors"
                />
                <div className="mt-1.5 flex justify-between text-[10px] text-zinc-500">
                  <span>Keep it actionable and specific.</span>
                  <span>{task.title.length} / 120</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-medium text-white">Description</label>
                  <span className="text-[10px] text-zinc-500">Markdown supported</span>
                </div>
                <textarea
                  rows="5"
                  value={task.description}
                  onChange={(event) => updateTask('description', event.target.value)}
                  placeholder="Add implementation notes, acceptance criteria, or useful context..."
                  className="w-full rounded-lg border border-white/10 bg-[#161b26] px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none resize-none transition-colors"
                />
                <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
                  <span>Include implementation notes or acceptance criteria.</span>
                  <span>{task.description.length} characters</span>
                </div>
              </div>
            </div>
          </section>

          {/* Planning Details Section */}
          <section className="rounded-2xl border border-white/[0.07] bg-[#0d1119] p-6">
            <h2 className="text-lg font-semibold text-white">Planning details</h2>
            <p className="text-xs text-zinc-500 mb-6">Choose a priority, source type, project, and due date. New tasks start in Backlog.</p>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <label htmlFor="task-priority" className="mb-1.5 block text-xs font-medium text-white">Priority</label>
                <select
                  id="task-priority"
                  value={task.priority}
                  onChange={(event) => updateTask('priority', event.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#161b26] px-3 py-2.5 text-sm text-white focus:border-cyan-500 focus:outline-none"
                >
                  {PRIORITIES.map((priority) => <option key={priority.value} value={priority.value}>{priority.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="task-type" className="mb-1.5 block text-xs font-medium text-white">Task type</label>
                <select
                  id="task-type"
                  value={task.taskType}
                  onChange={(event) => updateTask('taskType', event.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#161b26] px-3 py-2.5 text-sm text-white focus:border-cyan-500 focus:outline-none"
                >
                  <option value="local">Local BuildrsHQ</option>
                  <option value="github">GitHub Issue</option>
                  <option value="gitlab">GitLab Issue</option>
                </select>
              </div>
              <div>
                <label htmlFor="task-project" className="mb-1.5 block text-xs font-medium text-white">Project</label>
                <div className="relative">
                  <Folder className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-400" />
                  <select
                    id="task-project"
                    value={task.projectId}
                    onChange={(event) => {
                      updateTask('projectId', event.target.value);
                      updateTask('specIds', []);
                    }}
                    className="w-full rounded-lg border border-white/10 bg-[#161b26] py-2.5 pl-9 pr-3 text-sm text-white focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="">No project</option>
                    {projects.map((project) => {
                      const id = String(project._id || project.id);
                      return <option key={id} value={id}>{project.name || 'Untitled project'}</option>;
                    })}
                  </select>
                </div>
                {projectsError ? (
                  <p role="alert" className="mt-1 text-[10px] text-rose-300">{projectsError}</p>
                ) : projectsLoading ? (
                  <p className="mt-1 text-[10px] text-zinc-500">Loading projects…</p>
                ) : projects.length === 0 && (
                  <p className="mt-1 text-[10px] text-zinc-500">No projects available. You can create a task without linking a project.</p>
                )}
              </div>
              <div>
                <label htmlFor="task-due-date" className="mb-1.5 block text-xs font-medium text-white">Due date</label>
                <div className="relative">
                  <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <input
                    id="task-due-date"
                    type="date"
                    value={task.dueDate}
                    onChange={(event) => updateTask('dueDate', event.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-[#161b26] py-2.5 pl-9 pr-3 text-sm text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Connect Context Section */}
          <section className="rounded-2xl border border-white/[0.07] bg-[#0d1119] p-6">
            <h2 className="text-lg font-semibold text-white">Connect context</h2>
            <p className="text-xs text-zinc-500 mb-6">Attach a project specification or Figma node. These selections are sent with the new task.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Specification */}
              <div className="rounded-xl border border-white/10 bg-[#161b26] p-4 flex flex-col justify-between">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-white">Specification</h3>
                    <p className="text-[10px] text-zinc-500">Architecture and acceptance rules</p>
                  </div>
                </div>
                {!task.projectId ? (
                  <p className="rounded-lg border border-white/10 bg-[#0b0f17] px-3 py-2 text-xs text-zinc-500">Select a project to see its specifications.</p>
                ) : projectSpecs.length === 0 ? (
                  <p className="rounded-lg border border-white/10 bg-[#0b0f17] px-3 py-2 text-xs text-zinc-500">No specifications are available for this project.</p>
                ) : (
                  <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-white/10 bg-[#0b0f17] p-3">
                    {projectSpecs.map((spec) => {
                      const id = String(spec._id || spec.id);
                      return (
                        <label key={id} className="flex cursor-pointer items-start gap-2 text-xs text-zinc-300">
                          <input
                            type="checkbox"
                            checked={task.specIds.includes(id)}
                            onChange={() => toggleSpec(id)}
                            className="mt-0.5 accent-cyan-400"
                          />
                          <span>{spec.title || 'Untitled specification'}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Figma Design */}
              <div className="rounded-xl border border-white/10 bg-[#161b26] p-4 flex flex-col justify-between">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
                    <Layout className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-white">Figma design</h3>
                    <p className="text-[10px] text-zinc-500">Design file or selected frame</p>
                  </div>
                </div>
                <input
                  type="text"
                  value={task.figmaNodeId}
                  onChange={(event) => updateTask('figmaNodeId', event.target.value)}
                  placeholder="Figma node ID (optional)"
                  aria-label="Figma node ID"
                  className="w-full rounded-lg border border-white/10 bg-[#0b0f17] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>
          </section>

          {/* Bottom Actions */}
          {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</p>}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-white/10 px-5 py-2.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !task.title.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-6 py-2.5 text-xs font-bold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? 'Creating task...' : 'Create task'}
            </button>
          </div>
        </div>

        {/* Right Column: Sidebar Widgets */}
        <div className="w-full lg:w-[320px] space-y-4 shrink-0">

          {/* Ready to Create */}
          <div className="rounded-2xl border border-white/[0.07] bg-[#0d1119] p-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-white">Ready to create</h3>
              <span className="text-xs font-bold text-cyan-400">{[
                Boolean(task.title.trim()),
                Boolean(task.priority),
                Boolean(task.taskType),
                Boolean(task.projectId),
                Boolean(task.dueDate),
                Boolean(task.description.trim()),
              ].filter(Boolean).length} / 6</span>
            </div>
            <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden mb-5">
              <div
                className="bg-cyan-400 h-full rounded-full transition-all"
                style={{ width: `${([
                  Boolean(task.title.trim()),
                  Boolean(task.priority),
                  Boolean(task.taskType),
                  Boolean(task.projectId),
                  Boolean(task.dueDate),
                  Boolean(task.description.trim()),
                ].filter(Boolean).length / 6) * 100}%` }}
              />
            </div>

            <div className="space-y-3">
              {[
                { label: 'Task title added', checked: Boolean(task.title.trim()) },
                { label: 'Priority selected', checked: Boolean(task.priority) },
                { label: 'Task type selected', checked: Boolean(task.taskType) },
                { label: 'Project selected (optional)', checked: Boolean(task.projectId) },
                { label: 'Description added (optional)', checked: Boolean(task.description.trim()) },
                { label: 'Due date selected (optional)', checked: Boolean(task.dueDate) },
              ].map((item, idx) => (
                <div key={idx} className="flex items-center gap-2.5">
                  <div className={`flex h-4 w-4 items-center justify-center rounded border ${item.checked ? 'border-cyan-500 bg-cyan-500/10' : 'border-zinc-600 bg-[#161b26]'
                    }`}>
                    {item.checked && <Check className="h-3 w-3 text-cyan-400" strokeWidth={3} />}
                  </div>
                  <span className={`text-xs ${item.checked ? 'text-zinc-300' : 'text-zinc-500'}`}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Linked Development Context */}
          <div className="rounded-2xl border border-white/[0.07] bg-[#0d1119] p-5">
            <div className="flex items-center gap-2 mb-4">
              <LinkIcon className="h-4 w-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-white">Linked development context</h3>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#161b26] px-3 py-2 mb-3">
              {selectedProject?.defaultBranch ? (
                <>
                  <GitBranch className="h-3.5 w-3.5 text-cyan-400" />
                  <span className="truncate text-xs font-medium text-white">{selectedProject.defaultBranch}</span>
                </>
              ) : (
                <span className="text-xs text-zinc-500">
                  {selectedProject ? 'No default branch set' : 'Select a project to link its context'}
                </span>
              )}
            </div>

            <p className="text-[10px] text-zinc-500 leading-relaxed">
              Select a project, specifications, and optional Figma node above to attach context to the task.
            </p>
          </div>

        </div>
      </div>

    </div>
  );
}