import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Sidebar from '../components/Sidebar';
import NotificationBell from '../components/NotificationBell';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { getAvatarUrl } from '../lib/utils';
import CreateProjectWizard from '../components/CreateProjectWizard';
import ProjectDetails from '../components/ProjectDetails';
import { projectApi } from '../lib/api';
import { ChevronDown, Folder, GitBranch, RefreshCw, Search } from 'lucide-react';

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

export default function Projects() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const subscription = useAuthStore((state) => state.subscription);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectsError, setProjectsError] = useState('');
  const activeProjectCount = projects.filter((project) => project.status === 'active').length;
  const completedProjectCount = projects.filter((project) => project.status === 'completed').length;
  const averageProgress = projects.length
    ? Math.round(projects.reduce((total, project) => total + (Number(project.progress) || 0), 0) / projects.length)
    : 0;

  const loadProjects = useCallback(async () => {
    setLoadingProjects(true);
    setProjectsError('');
    try {
      const response = await projectApi.list();
      if (!response.success || !Array.isArray(response.projects)) {
        throw new Error(response.message || 'Could not load projects.');
      }
      setProjects(response.projects);
    } catch (error) {
      setProjectsError(error.message || 'Could not load projects. Please try again.');
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    setHasHydrated(true);
    loadProjects();
  }, [loadProjects]);

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
        <title>Projects - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="workspace-container min-h-screen bg-[#0b0f17] text-white">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main min-w-0">
          {selectedProjectId ? (
            <ProjectDetails
              projectId={selectedProjectId}
              onBack={() => setSelectedProjectId(null)}
              onCreateTask={() => router.push({ pathname: '/tasks', query: { action: 'new', projectId: selectedProjectId } })}
            />
          ) : isCreatingProject ? (
            <CreateProjectWizard
              onClose={() => setIsCreatingProject(false)}
              onCreated={() => router.push('/dashboard')}
            />
          ) : (
            <>
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/10 bg-[#0b0f17]/80 px-6 backdrop-blur">
            <button
              type="button"
              className="flex items-center gap-2 rounded-full border border-white/10 bg-[#161b26] px-3 py-1.5 text-sm text-zinc-200 transition hover:border-white/20"
            >
              <span className="h-2 w-2 rounded-full bg-cyan-400" />
              <span className="max-w-[220px] truncate font-medium">Feature/auth-flow-redesign</span>
              <ChevronDown className="h-4 w-4 text-zinc-400" />
            </button>

            <div className="flex items-center gap-4">
              <div className="hidden items-center gap-2 lg:flex">
                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
                  CI Passing
                </span>
                <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-400">
                  Staging Live
                </span>
              </div>

              <label className="relative hidden w-72 md:block">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  type="search"
                  aria-label="Search specs, diff, agents"
                  placeholder="Search specs, diff, agents"
                  className="w-full rounded-full border border-white/10 bg-[#161b26] py-1.5 pl-9 pr-4 text-sm text-white placeholder-zinc-500 transition focus:border-cyan-500 focus:outline-none"
                />
              </label>

              <NotificationBell look="header" />
              <img
                className="h-9 w-9 rounded-full border border-cyan-500/40 object-cover"
                src={getAvatarUrl(user, user?.fullName || user?.name || 'User')}
                alt={user?.fullName || user?.name || 'User'}
              />
            </div>
          </header>

          <div className="flex min-h-[calc(100vh-4rem)] flex-col gap-4 p-6">
            <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-400">
                  WORK / PROJECT
                </p>
                <h1 className="text-2xl font-bold tracking-tight text-white">Projects</h1>
                <p className="mt-1 text-xs text-zinc-500">
                  Create and manage product work from one connected workspace
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="rounded-lg border border-cyan-500/50 px-4 py-2 text-xs font-semibold text-white transition hover:bg-cyan-500/10"
                >
                  Import from GitHub
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatingProject(true)}
                  className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-300"
                >
                  New Project
                </button>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Project overview">
              {[
                {
                  label: 'Total Projects',
                  status: projects.length ? 'This workspace' : 'Empty',
                  statusClass: 'bg-cyan-500/10 text-cyan-400',
                  detail: 'Across your workspace',
                  value: loadingProjects || projectsError ? '—' : projects.length,
                },
                { label: 'Active Projects', status: 'In progress', statusClass: 'bg-emerald-500/10 text-emerald-400', detail: 'Currently active', value: loadingProjects || projectsError ? '—' : activeProjectCount },
                { label: 'Completed Projects', status: 'Shipped', statusClass: 'bg-cyan-500/10 text-cyan-400', detail: 'Marked completed', value: loadingProjects || projectsError ? '—' : completedProjectCount },
                { label: 'Average Progress', status: 'Overall', statusClass: 'bg-blue-500/10 text-blue-400', detail: 'Across all projects', value: loadingProjects || projectsError ? '—' : `${averageProgress}%` },
              ].map((stat) => (
                <article
                  key={stat.label}
                  className="rounded-xl border border-white/[0.07] bg-[#0d1119] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-[11px] text-zinc-500">{stat.label}</h2>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${stat.statusClass}`}>
                      {stat.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xl font-semibold leading-none text-white">{stat.value}</p>
                  <p className="mt-2 text-[10px] text-zinc-500">{stat.detail}</p>
                </article>
              ))}
            </section>

            {projectsError ? (
              <section className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-rose-500/20 bg-[#0d1119] px-6 py-12 text-center">
                <p role="alert" className="text-sm text-rose-400">{projectsError}</p>
                <button
                  type="button"
                  onClick={loadProjects}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/5"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Try again
                </button>
              </section>
            ) : loadingProjects ? (
              <section className="flex min-h-[300px] items-center justify-center rounded-2xl border border-white/[0.07] bg-[#0d1119] text-sm text-zinc-400">
                Loading projects...
              </section>
            ) : projects.length === 0 ? (
              <section className="flex min-h-[420px] flex-1 flex-col items-center justify-center rounded-2xl border border-white/[0.07] bg-[#0d1119] px-6 py-12 text-center">
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-400">
                  <Folder className="h-8 w-8" strokeWidth={1.5} />
                </div>
                <h2 className="text-xl font-semibold text-white">No projects yet</h2>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-500">
                  You haven’t added any projects yet. Click the button below to create your first project and start building your workspace.
                </p>
                <button
                  type="button"
                  onClick={() => setIsCreatingProject(true)}
                  className="mt-6 rounded-lg bg-cyan-400 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-300"
                >
                  Create New Project
                </button>
              </section>
            ) : (
              <section className="grid flex-1 grid-cols-1 content-start gap-4 md:grid-cols-2" aria-label="Projects">
                {projects.map((project) => {
                  const progress = Math.min(100, Math.max(0, Number(project.progress) || 0));
                  const technologies = Array.isArray(project.technologies) && project.technologies.length
                    ? project.technologies
                    : (Array.isArray(project.tags) ? project.tags : []);
                  const statusLabel = project.status || 'active';
                  const updatedLabel = formatRelativeTime(project.updatedAt);

                  return (
                    <article
                      key={project.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedProjectId(project.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedProjectId(project.id);
                        }
                      }}
                      aria-label={`Open ${project.name} project details`}
                      className="rounded-xl border border-white/[0.07] bg-[#0d1119] p-4 transition hover:border-cyan-500/30"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-500/15 bg-cyan-500/10 text-cyan-400">
                            <Folder className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h2 className="truncate text-sm font-semibold text-white">{project.name}</h2>
                              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusLabel === 'active' ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
                            </div>
                            <p className="mt-1 truncate text-[10px] text-zinc-500">
                              {project.description || 'No description provided.'}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex min-h-6 flex-wrap gap-1.5">
                        {technologies.length ? technologies.slice(0, 5).map((technology) => (
                          <span key={technology} className="rounded-md border border-cyan-500/10 bg-[#101722] px-2 py-1 text-[9px] text-cyan-300">
                            {technology}
                          </span>
                        )) : (
                          <span className="text-[10px] text-zinc-600">No technology stack added</span>
                        )}
                        {technologies.length > 5 && (
                          <span className="rounded-md border border-white/5 px-2 py-1 text-[9px] text-zinc-400">
                            +{technologies.length - 5}
                          </span>
                        )}
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-1.5">
                        <div className="rounded-md bg-[#101722] px-2.5 py-2">
                          <p className="text-[9px] text-zinc-500">Status</p>
                          <p className="mt-1 truncate text-[10px] font-medium capitalize text-white">{statusLabel}</p>
                        </div>
                        <div className="rounded-md bg-[#101722] px-2.5 py-2">
                          <p className="text-[9px] text-zinc-500">Priority</p>
                          <p className="mt-1 truncate text-[10px] font-medium capitalize text-white">{project.priority || 'medium'}</p>
                        </div>
                        <div className="rounded-md bg-[#101722] px-2.5 py-2">
                          <p className="text-[9px] text-zinc-500">Progress</p>
                          <p className="mt-1 text-[10px] font-medium text-emerald-400">{progress}%</p>
                        </div>
                      </div>

                      <div className="mt-3 h-1 overflow-hidden rounded-full bg-[#252d3a]">
                        <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-teal-400 transition-all" style={{ width: `${progress}%` }} />
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3 text-[9px] text-zinc-500">
                        <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
                          <GitBranch className="h-3 w-3 shrink-0" />
                          {project.defaultBranch || 'main'}
                          {project.githubRepoName && <span className="truncate text-zinc-600">· {project.githubRepoName}</span>}
                        </span>
                        <span className="ml-3 flex shrink-0 items-center gap-2">
                          {project.visibility && <span className="capitalize">{project.visibility}</span>}
                          {updatedLabel && <span>{updatedLabel}</span>}
                        </span>
                      </div>
                    </article>
                  );
                })}
              </section>
            )}
          </div>
            </>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}