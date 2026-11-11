import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch } from '../lib/api';
import {
  AlertCircle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock,
  ExternalLink,
  GitBranch,
  GitMerge,
  Github,
  GitPullRequest,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';

const REPO_STORAGE_KEY = 'buildrs:git-repo';
const PR_FILTERS = [
  { id: 'open', label: 'Open' },
  { id: 'merged', label: 'Merged' },
  { id: 'all', label: 'All' },
];

function timeAgo(value) {
  if (!value) return 'never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'never';
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function taskKey(task) {
  const raw = String(task?.taskKey || task?.id || task?._id || '');
  return raw ? `T-${raw.replace(/[^a-zA-Z0-9]/g, '').slice(-3).toUpperCase()}` : 'TASK';
}

function labelStyle(color) {
  if (!color) return undefined;
  return {
    color: `#${color}`,
    borderColor: `#${color}55`,
    background: `#${color}18`,
  };
}

function ChecksBadge({ checks }) {
  const state = checks?.state || 'none';
  const label = state === 'success'
    ? `${checks.passing || 1} passing`
    : state === 'pending'
      ? `${checks.pending || 1} running`
      : state === 'failure'
        ? `${checks.failing || 1} failing`
        : 'No checks';
  const Icon = state === 'success'
    ? CheckCircle2
    : state === 'pending'
      ? Loader2
      : state === 'failure'
        ? XCircle
        : CircleDot;

  return (
    <span className={`gitpr-check is-${state}`}>
      <Icon className={`gitpr-check-icon ${state === 'pending' ? 'animate-spin' : ''}`} />
      {label}
    </span>
  );
}

function PullRequestCard({ pr, task }) {
  const stateIcon = pr.state === 'merged'
    ? <GitMerge className="gitpr-pr-state-icon" />
    : <GitPullRequest className="gitpr-pr-state-icon" />;
  return (
    <article className={`gitpr-pr-card is-${pr.state}`}>
      <div className="gitpr-pr-main">
        <div className="gitpr-pr-top">
          <span className={`gitpr-pr-state is-${pr.state}`}>{stateIcon}</span>
          <div className="gitpr-pr-heading">
            <div className="gitpr-pr-title-row">
              <h2>{pr.title}</h2>
              {pr.draft && <span className="gitpr-draft">Draft</span>}
              {(pr.labels || []).map((label) => (
                <span key={label.name} className="gitpr-label" style={labelStyle(label.color)}>
                  {label.name}
                </span>
              ))}
            </div>
            <p className="gitpr-pr-branch">
              <span>#{pr.number}</span>
              <code>{pr.head}</code>
              <ArrowRight className="gitpr-inline-icon" />
              <code>{pr.base}</code>
            </p>
          </div>
        </div>
        <div className="gitpr-pr-meta">
          <span className="gitpr-stat is-add">+{pr.additions || 0}</span>
          <span className="gitpr-stat is-del">-{pr.deletions || 0}</span>
          <span className="gitpr-stat">{pr.changedFiles || 0} files</span>
          <ChecksBadge checks={pr.checks} />
          <span className="gitpr-updated"><Clock className="gitpr-inline-icon" /> {timeAgo(pr.updatedAt)}</span>
          {task && (
            <span className="gitpr-linked-task">
              Linked: {taskKey(task)}
            </span>
          )}
          {pr.user && (
            <span className="gitpr-pr-user">
              {pr.userAvatar ? <img src={pr.userAvatar} alt="" /> : <span className="gitpr-avatar-fallback">{pr.user[0]}</span>}
              {pr.user}
            </span>
          )}
        </div>
      </div>
      <div className="gitpr-pr-side">
        <a className="gitpr-review-btn" href={pr.url} target="_blank" rel="noreferrer">
          {pr.state === 'open' ? 'Review' : 'View'}
          <ExternalLink className="gitpr-inline-icon" />
        </a>
      </div>
    </article>
  );
}

function BranchCard({ branch, onCheckout, onCreatePr }) {
  const canCreatePr = !branch.defaultBranch && branch.status !== 'stale';
  return (
    <article className="gitpr-branch-card">
      <div className="gitpr-branch-main">
        <div className="gitpr-branch-head">
          <GitBranch className="gitpr-branch-icon" />
          <h2 className="gitpr-branch-name">{branch.name}</h2>
          <span className={`gitpr-branch-status is-${branch.status}`}>
            {branch.status === 'protected' ? <ShieldCheck className="gitpr-inline-icon" /> : <span className="gitpr-status-dot" />}
            {branch.status}
          </span>
          {branch.defaultBranch && <span className="gitpr-default-badge">default</span>}
        </div>
        <p className="gitpr-branch-author-line">
          {branch.lastCommit?.authorAvatar
            ? <img src={branch.lastCommit.authorAvatar} alt="" />
            : <span className="gitpr-avatar-fallback">{(branch.lastCommit?.authorLogin || branch.lastCommit?.authorName || '?')[0]}</span>}
          {branch.lastCommit?.authorLogin || branch.lastCommit?.authorName || 'Unknown'}
        </p>
        <div className="gitpr-branch-meta">
          <span className="gitpr-branch-delta is-ahead"><ArrowUp className="gitpr-inline-icon" /> {branch.ahead} ahead</span>
          {branch.behind > 0 && (
            <span className="gitpr-branch-delta is-behind"><ArrowDown className="gitpr-inline-icon" /> {branch.behind} behind</span>
          )}
          <span className="gitpr-updated"><Clock className="gitpr-inline-icon" /> {timeAgo(branch.lastCommit?.date)}</span>
        </div>
      </div>
      <div className="gitpr-branch-actions">
        <button type="button" className="gitpr-checkout-btn" onClick={() => onCheckout(branch.name)}>
          Checkout
        </button>
        {canCreatePr && (
          <button type="button" className="gitpr-btn is-primary" onClick={() => onCreatePr(branch.name)}>
            Create PR
          </button>
        )}
      </div>
    </article>
  );
}

function PullRequestModal({ repo, branches, initialHead, onClose, onCreated }) {
  const defaultBase = repo?.defaultBranch || 'main';
  const [head, setHead] = useState(initialHead || defaultBase);
  const [base, setBase] = useState(defaultBase);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const branchNames = useMemo(() => {
    const names = new Set((branches || []).map((branch) => branch.name));
    names.add(defaultBase);
    if (initialHead) names.add(initialHead);
    return Array.from(names);
  }, [branches, defaultBase, initialHead]);

  async function submit(event) {
    event.preventDefault();
    if (!repo) return;
    setBusy(true);
    setError(null);
    try {
      const data = await apiFetch('/api/github-advanced/pull-request', {
        method: 'POST',
        body: JSON.stringify({
          owner: repo.owner,
          repo: repo.name,
          title: title.trim(),
          body: body.trim(),
          head,
          base,
        }),
      });
      if (!data.pullRequest) throw new Error(data.message || 'Could not create pull request');
      onCreated(data.pullRequest);
    } catch (err) {
      setError(err.message || 'Could not create pull request');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gitpr-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <form className="gitpr-modal" onSubmit={submit}>
        <div className="gitpr-modal-head">
          <div>
            <p className="gitpr-modal-kicker">NEW PULL REQUEST</p>
            <h2>Open a pull request</h2>
            <p className="gitpr-modal-repo">{repo?.fullName}</p>
          </div>
          <button type="button" className="gitpr-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {error && <div className="gitpr-form-error"><AlertCircle className="gitpr-inline-icon" /> {error}</div>}

        <label className="gitpr-field">
          <span>Title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Short, descriptive title"
            required
            maxLength={200}
          />
        </label>
        <label className="gitpr-field">
          <span>Description</span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="What changed, and why?"
            rows={4}
          />
        </label>
        <div className="gitpr-field-grid">
          <label className="gitpr-field">
            <span>Head branch</span>
            <select value={head} onChange={(event) => setHead(event.target.value)}>
              {branchNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="gitpr-field">
            <span>Base branch</span>
            <select value={base} onChange={(event) => setBase(event.target.value)}>
              {branchNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        </div>
        <div className="gitpr-modal-actions">
          <button type="button" className="gitpr-btn is-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="gitpr-btn is-primary" disabled={busy || !title.trim() || head === base}>
            {busy ? <Loader2 className="gitpr-inline-icon animate-spin" /> : <GitPullRequest className="gitpr-inline-icon" />}
            {busy ? 'Creating…' : 'Create pull request'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function GitAndPullRequests() {
  const user = useAuthStore((state) => state.user);
  const subscription = useAuthStore((state) => state.subscription);
  const requestIdRef = useRef(0);

  const [repos, setRepos] = useState([]);
  const [projects, setProjects] = useState([]);
  const [activeRepoFullName, setActiveRepoFullName] = useState('');
  const [githubConnected, setGithubConnected] = useState(true);
  const [reposLoading, setReposLoading] = useState(true);
  const [repoError, setRepoError] = useState(null);

  const [branches, setBranches] = useState([]);
  const [totalBranches, setTotalBranches] = useState(0);
  const [pullRequests, setPullRequests] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('main');
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  const [tab, setTab] = useState('pulls');
  const [prFilter, setPrFilter] = useState('open');
  const [modalHead, setModalHead] = useState(null);
  const [toast, setToast] = useState(null);

  const activeRepo = useMemo(
    () => repos.find((repo) => repo.fullName === activeRepoFullName) || null,
    [repos, activeRepoFullName],
  );

  const loadRepos = useCallback(async (force = false) => {
    setReposLoading(true);
    setRepoError(null);
    try {
      const data = await apiFetch('/api/github/repos?per_page=100&sort=updated', force ? { forceRefresh: true } : undefined);
      if (!data?.success) throw new Error(data?.message || 'Could not load repositories');
      const list = data.repositories || [];
      setGithubConnected(data.connected !== false);
      setRepos(list);

      if (list.length > 0) {
        const fromQuery = typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('repo')
          : null;
        const stored = typeof window !== 'undefined' ? localStorage.getItem(REPO_STORAGE_KEY) : null;
        const next = list.find((repo) => repo.fullName === fromQuery)
          || list.find((repo) => repo.fullName === stored)
          || list[0];
        setActiveRepoFullName((current) => (
          current && list.some((repo) => repo.fullName === current) ? current : next.fullName
        ));
      }
    } catch (error) {
      setRepoError(error.message || 'Could not load repositories');
    } finally {
      setReposLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRepos();
  }, [loadRepos]);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/projects')
      .then((data) => {
        if (!cancelled && data?.success) setProjects(data.projects || []);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      });
    return () => { cancelled = true; };
  }, []);

  const activeProject = useMemo(() => {
    if (!activeRepo) return null;
    const fullName = activeRepo.fullName.toLowerCase();
    const repoName = activeRepo.name.toLowerCase();
    return projects.find((project) => {
      const name = String(project.githubRepoName || '').toLowerCase();
      const url = String(project.githubRepoUrl || '').toLowerCase();
      return url.includes(fullName) || name === fullName || name === repoName;
    }) || null;
  }, [projects, activeRepo]);

  useEffect(() => {
    if (!activeRepo) return;
    setSelectedBranch(activeRepo.defaultBranch || 'main');
    if (typeof window !== 'undefined') localStorage.setItem(REPO_STORAGE_KEY, activeRepo.fullName);
  }, [activeRepo]);

  const loadRepoData = useCallback(async (repo, { forceRefresh = false } = {}) => {
    if (!repo) return;
    const fresh = forceRefresh ? { forceRefresh: true } : {};
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const owner = encodeURIComponent(repo.owner);
    const name = encodeURIComponent(repo.name);
    const defaultBranch = repo.defaultBranch || 'main';

    setDataLoading(true);
    setDataError(null);

    const [branchResult, pullResult, taskResult] = await Promise.allSettled([
      apiFetch(
        `/api/github/repos/${owner}/${name}/branches?summary=1&limit=40&defaultBranch=${encodeURIComponent(defaultBranch)}`,
        { timeoutMs: 60000, ...fresh },
      ),
      apiFetch(
        `/api/github/repos/${owner}/${name}/pulls?state=all&per_page=30&checks=1&sort=updated`,
        { timeoutMs: 60000, ...fresh },
      ),
      apiFetch('/api/projects/tasks', forceRefresh ? { forceRefresh: true } : undefined),
    ]);

    if (requestIdRef.current !== requestId) return;

    const failures = [];
    let nextDefaultBranch = defaultBranch;

    if (branchResult.status === 'fulfilled' && branchResult.value?.success) {
      const list = branchResult.value.branches || [];
      setBranches(list);
      setTotalBranches(branchResult.value.totalBranches || list.length);
      nextDefaultBranch = branchResult.value.defaultBranch || defaultBranch;
      setSelectedBranch((current) => (
        list.some((branch) => branch.name === current) ? current : nextDefaultBranch
      ));
    } else {
      setBranches([]);
      failures.push(branchResult.status === 'rejected' ? branchResult.reason : new Error('Could not load branches'));
    }

    if (pullResult.status === 'fulfilled' && pullResult.value?.success) {
      setPullRequests(pullResult.value.pullRequests || []);
    } else {
      setPullRequests([]);
      failures.push(pullResult.status === 'rejected' ? pullResult.reason : new Error('Could not load pull requests'));
    }

    if (taskResult.status === 'fulfilled' && taskResult.value?.success) {
      setTasks(taskResult.value.tasks || []);
    } else {
      setTasks([]);
    }

    if (failures.length > 0) {
      setDataError(failures[0].message || 'Could not load repository activity');
    }
    setLastSyncedAt(Date.now());
    setDataLoading(false);
  }, []);

  useEffect(() => {
    if (!activeRepo) return;
    loadRepoData(activeRepo);
  }, [activeRepo, loadRepoData]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(timer);
  }, [toast]);

  const taskByPullNumber = useMemo(() => {
    const map = new Map();
    (tasks || []).forEach((task) => {
      if (!task) return;
      if (task.pullRequestId) map.set(String(task.pullRequestId), task);
      if (task.pullRequestNumber) map.set(String(task.pullRequestNumber), task);
    });
    return map;
  }, [tasks]);

  const taskByBranch = useMemo(() => {
    const map = new Map();
    (tasks || []).forEach((task) => {
      if (task?.branch) map.set(task.branch, task);
    });
    return map;
  }, [tasks]);

  const taskForPullRequest = (pr) => (
    taskByPullNumber.get(String(pr.number)) || taskByBranch.get(pr.head) || null
  );

  const openCount = useMemo(
    () => pullRequests.filter((pr) => pr.state === 'open').length,
    [pullRequests],
  );
  const mergedCount = useMemo(
    () => pullRequests.filter((pr) => pr.state === 'merged').length,
    [pullRequests],
  );
  const filteredPullRequests = useMemo(() => {
    if (prFilter === 'open') return pullRequests.filter((pr) => pr.state === 'open');
    if (prFilter === 'merged') return pullRequests.filter((pr) => pr.state === 'merged');
    return pullRequests;
  }, [pullRequests, prFilter]);

  const branchNames = useMemo(() => branches.map((branch) => branch.name), [branches]);

  const defaultHeadBranch = () => {
    const defaultBranch = activeRepo?.defaultBranch || 'main';
    if (selectedBranch && selectedBranch !== defaultBranch) return selectedBranch;
    const candidate = branches.find((branch) => !branch.defaultBranch && branch.status !== 'stale')
      || branches.find((branch) => !branch.defaultBranch);
    return candidate?.name || selectedBranch || defaultBranch;
  };

  const handleBranchSelect = (branchName) => {
    if (!branchName) return;
    setSelectedBranch(branchName);
    setToast(`Now tracking ${branchName}. Use the editor to check out this branch locally.`);
  };

  const handleCheckout = async (branchName) => {
    setSelectedBranch(branchName);
    if (!activeProject?.workspaceId) {
      setToast(`${branchName} selected. Link this repo to a project to check it out locally.`);
      return;
    }
    try {
      const data = await apiFetch('/api/git/checkout', {
        method: 'POST',
        body: JSON.stringify({
          workspaceId: activeProject.workspaceId,
          projectId: activeProject.id,
          branchName,
        }),
        timeoutMs: 30000,
      });
      if (data?.success === false) throw new Error(data.error || 'Branch checkout failed');
      setToast(`Checked out ${branchName}`);
    } catch (error) {
      setToast(`Could not check out ${branchName}: ${error.message}`);
    }
  };

  const handlePrCreated = (pullRequest) => {
    setModalHead(null);
    setToast(`Pull request #${pullRequest.number} created`);
    if (pullRequest.html_url || pullRequest.url) {
      window.open(pullRequest.html_url || pullRequest.url, '_blank', 'noopener');
    }
    if (activeRepo) loadRepoData(activeRepo, { forceRefresh: true });
  };

  const connectedEmpty = !reposLoading && githubConnected && repos.length === 0 && !repoError;
  const showData = !reposLoading && !repoError && repos.length > 0;

  return (
    <AuthGuard>
      <Head>
        <title>Git &amp; PRs - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="workspace-container">
        <Sidebar
          user={user}
          subscription={subscription}
          headerBranch={activeRepo?.defaultBranch || 'main'}
          availableBranches={branchNames}
          selectedBranch={selectedBranch}
          onBranchSelect={handleBranchSelect}
        />

        <main className="workspace-main">
          <header className="workspace-header dash-header gitpr-header">
            <div className="gitpr-header-copy">
              <p className="dash-crumb">
                BuildrsHQ <span className="sep">/</span> Ship <span className="sep">/</span> Git &amp; PRs
              </p>
              <div className="gitpr-title-row">
                <h1 className="dash-title">GitHub &amp; Pull Request</h1>
              </div>
              <p className="gitpr-subtitle">
                Unified view of your repositories and pull request activities
                {lastSyncedAt ? ` · synced ${timeAgo(lastSyncedAt)}` : ''}
              </p>
            </div>

            <div className="gitpr-header-actions">
              {repos.length > 0 && (
                <label className="gitpr-repo-select">
                  <Github className="gitpr-inline-icon" />
                  <select
                    value={activeRepoFullName}
                    onChange={(event) => setActiveRepoFullName(event.target.value)}
                    aria-label="Select repository"
                  >
                    {repos.map((repo) => (
                      <option key={repo.fullName} value={repo.fullName}>{repo.fullName}</option>
                    ))}
                  </select>
                  <ChevronDown className="gitpr-select-chevron" />
                </label>
              )}
              <button
                type="button"
                className="gitpr-new-pr"
                disabled={!activeRepo || !selectedBranch || dataLoading}
                onClick={() => setModalHead(defaultHeadBranch())}
              >
                <Plus className="gitpr-inline-icon" />
                New Pull Request
              </button>
            </div>
          </header>

          <div className="workspace-content">
            <div className="gitpr-page">
              {reposLoading ? (
                <div className="gitpr-state-card">
                  <div className="gitpr-state-icon"><Loader2 className="animate-spin" /></div>
                  <h2>Loading repositories</h2>
                  <p>Checking your connected GitHub account.</p>
                </div>
              ) : repoError ? (
                <div className="gitpr-state-card is-error">
                  <div className="gitpr-state-icon"><AlertCircle /></div>
                  <h2>Could not load repositories</h2>
                  <p>{repoError}</p>
                  <button type="button" className="gitpr-btn is-primary" onClick={() => loadRepos(true)}>
                    <RefreshCw className="gitpr-inline-icon" /> Retry
                  </button>
                </div>
              ) : !githubConnected ? (
                <div className="gitpr-state-card">
                  <div className="gitpr-state-icon"><Github /></div>
                  <h2>Connect GitHub to see pull requests</h2>
                  <p>Link your account to browse branches, review pull requests, and open new ones.</p>
                  <a className="gitpr-btn is-primary" href="/integrations">Connect GitHub</a>
                </div>
              ) : connectedEmpty ? (
                <div className="gitpr-state-card">
                  <div className="gitpr-state-icon"><GitPullRequest /></div>
                  <h2>No repositories found</h2>
                  <p>Create a repository on GitHub or grant access to an existing one.</p>
                  <a className="gitpr-btn is-primary" href="https://github.com/new" target="_blank" rel="noreferrer">
                    Create repository <ExternalLink className="gitpr-inline-icon" />
                  </a>
                </div>
              ) : showData && (
                <>
                  <div className="gitpr-toolbar">
                    <div className="gitpr-tabs" role="tablist" aria-label="Git views">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={tab === 'pulls'}
                        className={`gitpr-tab ${tab === 'pulls' ? 'is-active' : ''}`}
                        onClick={() => setTab('pulls')}
                      >
                        <GitPullRequest className="gitpr-inline-icon" />
                        Pull Requests
                        <span className="gitpr-tab-count">{openCount}</span>
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={tab === 'branches'}
                        className={`gitpr-tab ${tab === 'branches' ? 'is-active' : ''}`}
                        onClick={() => setTab('branches')}
                      >
                        <GitBranch className="gitpr-inline-icon" />
                        Branches
                        <span className="gitpr-tab-count">{totalBranches || branches.length}</span>
                      </button>
                    </div>
                    <div className="gitpr-toolbar-right">
                      <span className="gitpr-toolbar-note">
                        {activeRepo?.private ? 'Private repository' : 'Public repository'}
                      </span>
                      <button
                        type="button"
                        className="gitpr-icon-btn"
                        onClick={() => activeRepo && loadRepoData(activeRepo, { forceRefresh: true })}
                        disabled={dataLoading}
                        aria-label="Refresh repository activity"
                      >
                        <RefreshCw className={`gitpr-inline-icon ${dataLoading ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {dataError && (
                    <div className="gitpr-inline-error">
                      <AlertCircle className="gitpr-inline-icon" />
                      <span>{dataError}</span>
                      <button type="button" onClick={() => activeRepo && loadRepoData(activeRepo, { forceRefresh: true })}>Retry</button>
                    </div>
                  )}

                  {tab === 'pulls' ? (
                    <section className="gitpr-section" aria-label="Pull requests">
                      <div className="gitpr-filter-row">
                        <div className="gitpr-segmented" role="group" aria-label="Filter pull requests">
                          {PR_FILTERS.map((filter) => (
                            <button
                              key={filter.id}
                              type="button"
                              className={`gitpr-filter ${prFilter === filter.id ? 'is-active' : ''}`}
                              onClick={() => setPrFilter(filter.id)}
                            >
                              {filter.label}
                            </button>
                          ))}
                        </div>
                        <span className="gitpr-section-note">
                          {filteredPullRequests.length} of {pullRequests.length} loaded
                        </span>
                      </div>

                      {dataLoading && pullRequests.length === 0 ? (
                        <div className="gitpr-pr-list">
                          {[1, 2, 3].map((item) => <div key={item} className="gitpr-skeleton-card" />)}
                        </div>
                      ) : filteredPullRequests.length > 0 ? (
                        <div className="gitpr-pr-list">
                          {filteredPullRequests.map((pr) => (
                            <PullRequestCard
                              key={`${pr.number}-${pr.headSha || pr.updatedAt}`}
                              pr={pr}
                              task={taskForPullRequest(pr)}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="gitpr-empty">
                          <GitPullRequest className="gitpr-empty-icon" />
                          <h3>No {prFilter === 'all' ? '' : prFilter} pull requests</h3>
                          <p>Open a pull request from a feature branch to see it here.</p>
                          {prFilter !== 'all' && (
                            <button type="button" className="gitpr-btn is-ghost" onClick={() => setPrFilter('all')}>
                              Show all pull requests
                            </button>
                          )}
                        </div>
                      )}
                    </section>
                  ) : (
                    <section className="gitpr-section" aria-label="Branches">
                      <div className="gitpr-filter-row">
                        <div>
                          <h2 className="gitpr-section-title">Repository branches</h2>
                          <p className="gitpr-section-sub">
                            {branches.length < totalBranches
                              ? `Showing ${branches.length} of ${totalBranches} branches`
                              : `${branches.length} branch${branches.length === 1 ? '' : 'es'} loaded`}
                          </p>
                        </div>
                        <span className="gitpr-section-note">Ahead / behind vs default branch</span>
                      </div>

                      {dataLoading && branches.length === 0 ? (
                        <div className="gitpr-branch-grid">
                          {[1, 2, 3, 4].map((item) => <div key={item} className="gitpr-skeleton-card is-branch" />)}
                        </div>
                      ) : branches.length > 0 ? (
                        <div className="gitpr-branch-grid">
                          {branches.map((branch) => (
                            <BranchCard
                              key={branch.name}
                              branch={branch}
                              onCheckout={handleCheckout}
                              onCreatePr={(head) => setModalHead(head)}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="gitpr-empty">
                          <GitBranch className="gitpr-empty-icon" />
                          <h3>No branches found</h3>
                          <p>Push a branch to GitHub to see it here.</p>
                        </div>
                      )}
                    </section>
                  )}
                </>
              )}
            </div>
          </div>
        </main>

        {modalHead && activeRepo && (
          <PullRequestModal
            repo={activeRepo}
            branches={branches}
            initialHead={modalHead}
            onClose={() => setModalHead(null)}
            onCreated={handlePrCreated}
          />
        )}

        {toast && (
          <div className="gitpr-toast" role="status">
            <CheckCircle2 className="gitpr-inline-icon" />
            {toast}
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
