import { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Sidebar from './Sidebar';
import AuthGuard from './AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch, projectApi } from '../lib/api';
import useDeploymentRealtime, { applyDeploymentPatch } from '../lib/useDeploymentRealtime';
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  OctagonAlert,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  Copy,
  Check,
  X,
  Info,
  Trash2,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Small helpers (mirrors the data the /api/deployments API returns)  */
/* ------------------------------------------------------------------ */

const TERMINAL = ['success', 'failed', 'stopped'];

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function timeAgo(date) {
  if (!date) return '—';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return '—';
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return secs ? `${mins}m ${secs}s` : `${mins}m`;
}

function getDuration(d) {
  const steps = d?.steps || [];
  const started = steps.find((s) => s.startedAt);
  const finished = [...steps].reverse().find((s) => s.finishedAt);
  if (started && finished) {
    const ms = new Date(finished.finishedAt).getTime() - new Date(started.startedAt).getTime();
    if (ms > 0) return ms;
  }
  if (['success', 'failed', 'stopped'].includes(d?.status) && d?.createdAt && d?.updatedAt) {
    return new Date(d.updatedAt).getTime() - new Date(d.createdAt).getTime();
  }
  return 0;
}

function statusMeta(status) {
  if (status === 'success') return { label: 'Ready', cls: 'deploy-status-ready' };
  if (status === 'failed' || status === 'stopped') return { label: 'Failed', cls: 'deploy-status-failed' };
  return { label: 'Building', cls: 'deploy-status-building' };
}

function envFor(d) {
  const raw = String(d?.metadata?.environment || d?.environment || d?.subdomain || '').toLowerCase();
  if (/preview|staging|stage|dev/.test(raw)) return 'Preview';
  return 'Production';
}

function branchFor(d) {
  return d?.branch || d?.metadata?.branch || d?.repo?.defaultBranch || 'Main';
}

function commitFor(d) {
  return d?.commit || d?.metadata?.commit || (d?._id ? String(d._id).slice(0, 7) : '—');
}

function projectIdFor(d) {
  if (d?.projectId && typeof d.projectId === 'object') return d.projectId._id ? String(d.projectId._id) : null;
  return d?.projectKey || (d?.projectId ? String(d.projectId) : null);
}

function projectNameFor(d) {
  return d?.projectName || d?.projectId?.name || d?.repoFullName || d?.subdomain || 'Deployment';
}

function initialsFor(d) {
  const name = projectNameFor(d);
  const parts = String(name).split(/[-_\s]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return String(name).slice(0, 2).toUpperCase() || 'BU';
}

function urlFor(d) {
  return d?.deployedUrl || (d?.subdomain ? `https://${d.subdomain}.buildrshq.dev` : '');
}

function frameworkLabelForProject(p) {
  const techs = Array.isArray(p?.technologies) ? p.technologies : [];
  const found = techs.find((t) => /vite|next|react|node|vue|angular|svelte/i.test(String(t)));
  if (found) return /vite/i.test(found) ? 'Vite' : /node/i.test(found) ? 'Node.js' : found;
  if (p?.template) return p.template;
  return 'Node.js';
}

function runtimeLabel(runtime) {
  const map = {
    node: 'Node.js', python: 'Python', go: 'Go', ruby: 'Ruby', php: 'PHP', rust: 'Rust',
    java: 'Java', dotnet: '.NET', elixir: 'Elixir', swift: 'Swift', dart: 'Dart', static: 'Static',
    docker: 'Docker', compose: 'Compose', unknown: 'Node.js',
  };
  return map[runtime] || 'Node.js';
}

/* ================================================================== */
/* Deployment page — Figma "Deployment" section (TN...NP1 / 718:67538) */
/* Screens: list · details-overview · details-build-logs · create x3  */
/* ================================================================== */

export default function DeploymentPage() {
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);
  const router = useRouter();

  const [deployments, setDeployments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailTab, setDetailTab] = useState('overview');
  const [logTab, setLogTab] = useState('build');
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const logRef = useRef(null);

  /* ---- create-wizard state ---- */
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [branch, setBranch] = useState('main');
  const [environment, setEnvironment] = useState('Production');
  const [subdomain, setSubdomain] = useState('');
  const [framework, setFramework] = useState('Vite');
  const [rootDir, setRootDir] = useState('./');
  const [buildCommand, setBuildCommand] = useState('pnpm build');
  const [outputDir, setOutputDir] = useState('dist');
  const [envVars, setEnvVars] = useState([]);
  const [deploying, setDeploying] = useState(false);
  const [wizardError, setWizardError] = useState(null);

  const loadDeployments = useCallback(async (options = {}) => {
    try {
      const data = await apiFetch('/api/deployments', options);
      if (data?.deployments) setDeployments(data.deployments);
      setError(null);
    } catch (err) {
      setError(err?.data?.message || err?.message || 'Failed to load deployments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDeployments(); }, [loadDeployments]);

  // Instant status/steps/logs from the server. Polling below stays as a
  // fallback for missed events and older backends.
  useDeploymentRealtime(useCallback((update) => {
    const id = String(update.deploymentId);
    if (update.deployment) {
      // Never copy log payloads into list rows.
      const summary = { ...update.deployment };
      delete summary.buildLogs;
      delete summary.runtimeLogs;
      setDeployments((prev) => prev.map((d) => (String(d._id) === id ? { ...d, ...summary } : d)));
    }
    setDetail((prev) => (prev && String(prev._id) === id ? applyDeploymentPatch(prev, update) : prev));
  }, []));

  // Keep the list fresh while anything is still building/deploying.
  const anyInFlight = deployments.some((d) => !TERMINAL.includes(d.status));
  useEffect(() => {
    if (!anyInFlight) return undefined;
    const id = setInterval(() => loadDeployments({ noCache: true }), 5000);
    return () => clearInterval(id);
  }, [anyInFlight, loadDeployments]);

  const fetchDetail = useCallback(async (id) => {
    if (!id) return null;
    try {
      const data = await apiFetch(`/api/deployments/${id}`);
      if (data?.deployment) {
        setDetail((prev) => {
          // Realtime log chunks can be ahead of the debounced DB flush; never
          // let a poll truncate output that already reached the screen.
          if (prev && (prev.buildLogs || '').length > (data.deployment.buildLogs || '').length) {
            return { ...data.deployment, buildLogs: prev.buildLogs, runtimeLogs: prev.runtimeLogs };
          }
          return data.deployment;
        });
        setDeployments((prev) => prev.map((d) => (d._id === id
          ? { ...d, status: data.deployment.status, deployedUrl: data.deployment.deployedUrl }
          : d)));
        return data.deployment;
      }
    } catch (err) {
      setError(err?.data?.message || err?.message || 'Failed to load deployment details');
    }
    return null;
  }, []);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return undefined; }
    let cancelled = false;
    let timer = null;
    const tick = async () => {
      const d = await fetchDetail(selectedId);
      if (cancelled || !d || TERMINAL.includes(d.status)) return;
      timer = setTimeout(tick, 2000);
    };
    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [selectedId, fetchDetail]);

  // Deep-link support: /deploy?deployment=<id>
  useEffect(() => {
    if (router.isReady && typeof router.query.deployment === 'string') setSelectedId(router.query.deployment);
  }, [router.isReady, router.query.deployment]);

  const selectedProject = projects.find((p) => String(p._id || p.id) === String(selectedProjectId)) || null;

  const openCreate = async () => {
    setWizardOpen(true);
    setWizardStep(1);
    setWizardError(null);
    if (projects.length) return;
    setProjectsLoading(true);
    try {
      const data = await projectApi.list();
      const list = data.projects || [];
      setProjects(list);
      if (list.length && !selectedProjectId) {
        const first = list[0];
        setSelectedProjectId(String(first._id || first.id));
        setSubdomain(slugify(first.name));
        setBranch(first.defaultBranch || 'main');
        setFramework(frameworkLabelForProject(first));
      }
    } catch (err) {
      setWizardError(err?.data?.message || err?.message || 'Failed to load projects');
    } finally {
      setProjectsLoading(false);
    }
  };

  const selectProject = (p) => {
    setSelectedProjectId(String(p._id || p.id));
    setSubdomain(slugify(p.name));
    setBranch(p.defaultBranch || 'main');
    setFramework(frameworkLabelForProject(p));
    setWizardError(null);
  };

  const kpis = (() => {
    const servers = new Set(deployments.map((d) => d.subdomain).filter(Boolean)).size;
    const projKeys = new Set(deployments.map((d) => projectIdFor(d)).filter(Boolean)).size;
    const terminal = deployments.filter((d) => ['success', 'failed'].includes(d.status));
    const success = terminal.filter((d) => d.status === 'success').length;
    const successRate = terminal.length ? `${((success / terminal.length) * 100).toFixed(1)}%` : '—';
    const durations = deployments.map(getDuration).filter((n) => n > 0);
    const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    const incidents = deployments.filter((d) => d.status === 'failed').length;
    return [
      { label: 'Configured Servers', value: servers || 0, sub: `Across ${projKeys || 0} Projects` },
      { label: 'Success Rate', value: successRate, sub: 'In Last 30 Days', green: true },
      { label: 'Average Built Time', value: formatDuration(avg), sub: durations.length ? `${durations.length} builds measured` : 'No builds yet' },
      { label: 'Active Incidents', value: incidents, sub: incidents ? 'Need attention' : 'All Systems Normal', green: incidents === 0 },
    ];
  })();

  const filtered = deployments.filter((d) => {
    const meta = statusMeta(d.status);
    if (filter === 'ready' && meta.label !== 'Ready') return false;
    if (filter === 'building' && meta.label !== 'Building') return false;
    if (filter === 'failed' && meta.label !== 'Failed') return false;
    if (!search.trim()) return true;
    const hay = [projectNameFor(d), d.subdomain, d.repoFullName, branchFor(d), commitFor(d)]
      .filter(Boolean).join(' ').toLowerCase();
    return hay.includes(search.trim().toLowerCase());
  });

  const openDetail = (d) => {
    setSelectedId(d._id);
    setDetailTab('overview');
    setDetail(d);
    router.replace({ pathname: router.pathname, query: { ...router.query, deployment: d._id } }, undefined, { shallow: true }).catch(() => {});
  };

  const closeDetail = () => {
    setSelectedId(null);
    setDetail(null);
    const rest = { ...router.query };
    delete rest.deployment;
    router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true }).catch(() => {});
  };

  const copyUrl = async (url) => {
    try { await navigator.clipboard.writeText(url); } catch { /* clipboard unavailable */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const redeploy = async (d) => {
    const pid = projectIdFor(d);
    if (!pid) {
      setError('This deployment is not linked to a project, so it cannot be redeployed from here. Open it in the Editor to redeploy.');
      return;
    }
    setError(null);
    try {
      const data = await apiFetch('/api/deployments', {
        method: 'POST',
        body: JSON.stringify({
          projectId: pid,
          subdomain: d.subdomain,
          companyId: d.workspaceId || undefined,
          source: 'project',
          ...(d.branch ? { branch: d.branch } : {}),
          ...(d.environment ? { environment: d.environment } : {}),
        }),
      });
      if (data?.deployment) {
        setDeployments((prev) => [data.deployment, ...prev.filter((x) => x._id !== data.deployment._id)]);
        setDetail(data.deployment);
      }
    } catch (err) {
      setError(err?.data?.error || err?.data?.message || err?.message || 'Redeploy failed');
    }
  };

  const stopDeployment = async (d) => {
    if (!window.confirm(`Stop ${d.subdomain}.buildrshq.dev? This tears down the running container.`)) return;
    try {
      await apiFetch(`/api/deployments/${d._id}`, { method: 'DELETE' });
      setDeployments((prev) => prev.map((x) => (x._id === d._id ? { ...x, status: 'stopped', deployedUrl: null } : x)));
      if (detail?._id === d._id) setDetail({ ...detail, status: 'stopped' });
    } catch (err) {
      setError(err?.data?.message || err?.data?.error || err?.message || 'Failed to stop deployment');
    }
  };

  const submitDeploy = async () => {
    if (!selectedProject) { setWizardError('Select a repository to deploy.'); return; }
    const sub = slugify(subdomain);
    if (sub.length < 2) { setWizardError('Subdomain must be at least 2 characters.'); return; }
    setDeploying(true);
    setWizardError(null);
    try {
      const cleanEnv = envVars
        .map((e) => ({ key: String(e.key || '').trim(), value: e.value || '', secret: Boolean(e.secret) }))
        .filter((e) => e.key);
      const data = await apiFetch('/api/deployments', {
        method: 'POST',
        body: JSON.stringify({
          projectId: selectedProject._id || selectedProject.id,
          companyId: selectedProject.workspaceId || undefined,
          subdomain: sub,
          source: 'project',
          branch,
          environment,
          framework,
          buildCommand,
          rootDirectory: rootDir,
          outputDirectory: outputDir,
          env: cleanEnv.length ? cleanEnv : undefined,
        }),
      });
      if (data?.deployment) {
        setWizardOpen(false);
        await loadDeployments();
        setTimeout(() => openDetail(data.deployment), 300);
      }
    } catch (err) {
      setWizardError(err?.data?.error || err?.data?.message || err?.message || 'Deploy failed');
    } finally {
      setDeploying(false);
    }
  };

  const detailDuration = detail ? getDuration(detail) : 0;
  const detailSteps = detail?.steps || [];
  const stepsDone = detailSteps.filter((s) => s.status === 'done').length;
  const logText = logTab === 'build' ? (detail?.buildLogs || '') : (detail?.runtimeLogs || '');
  const logLines = logText ? logText.split('\n') : [];

  useEffect(() => {
    const el = logRef.current;
    if (el && autoScroll) el.scrollTop = el.scrollHeight;
  }, [logText, logTab, autoScroll]);

  return (
    <AuthGuard>
      <Head>
        <title>Deployment - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="workspace-container">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main">
          <div className="workspace-content">
            <div className="deploy-page">
              {error && <p className="deploy-banner-error">{error}</p>}

              {!selectedId ? (
                <>
                  {/* ---------- LIST (Figma 718:69712) ---------- */}
                  <header className="deploy-head">
                    <div className="deploy-head-text">
                      <p className="deploy-crumb">Ship / Deployment</p>
                      <h1 className="deploy-title">Deployment</h1>
                      <p className="deploy-subtitle">
                        Move validated code through preview, staging, and production with branch and build context intact
                      </p>
                    </div>
                    <button type="button" className="deploy-btn-primary" onClick={openCreate}>
                      <Plus className="w-4 h-4" /> New Deployment
                    </button>
                  </header>

                  <section className="deploy-kpis">
                    {kpis.map((k) => (
                      <div key={k.label} className="deploy-kpi">
                        <span className="deploy-kpi-label">{k.label}</span>
                        <span className={`deploy-kpi-value ${k.green ? 'deploy-kpi-green' : ''}`}>{k.value}</span>
                        <span className="deploy-kpi-sub">{k.sub}</span>
                      </div>
                    ))}
                  </section>

                  <section className="deploy-recent">
                    <div className="deploy-recent-head">
                      <div>
                        <h2 className="deploy-recent-title">Recent deployments</h2>
                        <p className="deploy-recent-sub">Latest releases across your project</p>
                      </div>
                      <div className="deploy-recent-controls">
                        <div className="deploy-search">
                          <Search className="w-4 h-4" />
                          <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search projects or branches"
                          />
                        </div>
                        <div className="deploy-filters">
                          {[['all', 'All'], ['ready', 'Ready'], ['building', 'Building'], ['failed', 'Failed']].map(([key, label]) => (
                            <button
                              key={key} type="button"
                              className={`deploy-filter ${filter === key ? 'active' : ''}`}
                              onClick={() => setFilter(key)}
                            >{label}</button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {loading ? (
                      <div className="deploy-card deploy-empty"><Loader2 className="w-5 h-5 animate-spin" /> Loading deployments…</div>
                    ) : filtered.length === 0 ? (
                      <div className="deploy-card deploy-empty">
                        <Rocket className="w-8 h-8" />
                        <p>{deployments.length ? 'No deployments match your search.' : 'No deployments yet. Create your first deployment to ship your project.'}</p>
                        <button type="button" className="deploy-btn-primary" onClick={openCreate}>
                          <Plus className="w-4 h-4" /> New Deployment
                        </button>
                      </div>
                    ) : (
                      <div className="deploy-rows">
                        {filtered.map((d) => {
                          const meta = statusMeta(d.status);
                          return (
                            <div key={d._id} className="deploy-row">
                              <div className="deploy-row-main">
                                <span className="deploy-avatar">{initialsFor(d)}</span>
                                <div className="deploy-row-text">
                                  <span className="deploy-row-name">{projectNameFor(d)}</span>
                                  <span className="deploy-row-desc">{d.repoFullName || d.subdomain || 'Workspace project'}</span>
                                </div>
                              </div>
                              <div className="deploy-row-env">
                                <span className="deploy-row-env-label">{envFor(d)}</span>
                                <span className={`deploy-pill ${meta.cls}`}>
                                  <span className="deploy-pill-dot" />{meta.label}
                                </span>
                              </div>
                              <div className="deploy-row-branch">
                                <span className="deploy-row-branch-name">{branchFor(d)}</span>
                                <span className="deploy-row-meta">
                                  <span className="deploy-mono">{commitFor(d)}</span>
                                  <span>{timeAgo(d.createdAt)}</span>
                                </span>
                              </div>
                              <div className="deploy-row-actions">
                                <button type="button" className="deploy-btn-outline" onClick={() => openDetail(d)}>View</button>
                                {!TERMINAL.includes(d.status) && (
                                  <button type="button" className="deploy-icon-btn" title="Stop deployment" onClick={() => stopDeployment(d)}>
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </>
              ) : (
                <>
                  {/* ---------- DETAILS (Figma 718:70004 / 718:70171) ---------- */}
                  {detail ? (
                    <>
                      <header className="deploy-detail-head">
                        <button type="button" className="deploy-back" onClick={closeDetail} aria-label="Back to deployments">
                          <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div className="deploy-detail-title">
                          <div className="deploy-detail-name-row">
                            <h1 className="deploy-title deploy-title-sm">{projectNameFor(detail)}</h1>
                            <span className={`deploy-pill ${statusMeta(detail.status).cls}`}>
                              <span className="deploy-pill-dot" />{statusMeta(detail.status).label}
                            </span>
                          </div>
                          <p className="deploy-subtitle">{detail.repoFullName || 'Customer facing dashboard and agent workspace'}</p>
                          {urlFor(detail) && (
                            <button type="button" className="deploy-url" onClick={() => copyUrl(urlFor(detail))}>
                              <span>{urlFor(detail).replace(/^https?:\/\//, '')}</span>
                              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                        <div className="deploy-detail-actions">
                          <button type="button" className="deploy-btn-outline deploy-btn-lg" onClick={() => redeploy(detail)}>
                            <RefreshCw className="w-4 h-4" /> Redeploy
                          </button>
                          <a
                            className="deploy-btn-primary deploy-btn-lg"
                            href={urlFor(detail) || '#'}
                            target="_blank" rel="noreferrer"
                            style={{ textDecoration: 'none' }}
                          >
                            Visit Deployment <ExternalLink className="w-4 h-4" />
                          </a>
                          {!TERMINAL.includes(detail.status) && (
                            <button type="button" className="deploy-btn-outline deploy-btn-lg deploy-btn-danger" onClick={() => stopDeployment(detail)}>
                              Stop
                            </button>
                          )}
                        </div>
                      </header>

                      <div className="deploy-tabs">
                        <button type="button" className={`deploy-tab ${detailTab === 'overview' ? 'active' : ''}`} onClick={() => setDetailTab('overview')}>
                          Overview
                        </button>
                        <button type="button" className={`deploy-tab ${detailTab === 'logs' ? 'active' : ''}`} onClick={() => setDetailTab('logs')}>
                          Build Logs
                        </button>
                      </div>

                      {detailTab === 'overview' ? (
                        <>
                          <section className="deploy-card">
                            <h2 className="deploy-card-title">Deployment Summary</h2>
                            <div className="deploy-summary-grid">
                              <SummaryField label="Review Status" value={envFor(detail)} />
                              <SummaryField label="Created" value={`${timeAgo(detail.createdAt)}${detail.createdBy ? ` by ${detail.createdBy}` : ''}`} />
                              <SummaryField label="Build Duration" value={formatDuration(detailDuration)} />
                              <SummaryField label="Branch" value={branchFor(detail)} />
                              <SummaryField label="Commit" value={commitFor(detail)} />
                              <SummaryField label="Region" value={detail.region || detail.metadata?.region || 'iad1'} />
                            </div>
                            {detail.errorMessage && (
                              <div className="deploy-failure">
                                <OctagonAlert className="w-4 h-4" />
                                <span>{detail.errorMessage}</span>
                              </div>
                            )}
                            {detail.selfHeal?.status && detail.selfHeal.status !== 'succeeded' && (
                              <div className="deploy-failure deploy-failure-warn">
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                <span>
                                  Self-heal {detail.selfHeal.status}
                                  {detail.selfHeal.summary ? ` — ${detail.selfHeal.summary}` : ''}
                                  {detail.selfHeal.progress ? ` · ${detail.selfHeal.progress}` : ''}
                                </span>
                              </div>
                            )}
                          </section>

                          <div className="deploy-grid-2">
                            <section className="deploy-card">
                              <div className="deploy-card-head-row">
                                <h2 className="deploy-card-title">Domains</h2>
                                <span className="deploy-pill deploy-status-ready"><span className="deploy-pill-dot" />SSL Active</span>
                              </div>
                              {urlFor(detail) ? (
                                <a className="deploy-domain-link" href={urlFor(detail)} target="_blank" rel="noreferrer">
                                  <span className="deploy-pill-dot deploy-dot-live" />
                                  {urlFor(detail)}
                                  <span className="deploy-domain-note">Primary domain</span>
                                </a>
                              ) : <p className="deploy-muted">No domain assigned yet.</p>}
                            </section>

                            <section className="deploy-card">
                              <div className="deploy-card-head-row">
                                <h2 className="deploy-card-title">Source</h2>
                                <span className="deploy-pill deploy-status-ready"><span className="deploy-pill-dot" />SSL Active</span>
                              </div>
                              <div className="deploy-source">
                                <span className="deploy-avatar deploy-avatar-sm">SC</span>
                                <div>
                                  <p className="deploy-source-name">{detail.repoFullName || projectNameFor(detail)}</p>
                                  <p className="deploy-muted">{commitFor(detail)} on {branchFor(detail).toLowerCase()}</p>
                                </div>
                              </div>
                            </section>
                          </div>

                          <section className="deploy-card">
                            <h2 className="deploy-card-title">Performance</h2>
                            <PerfBar label="Build time" value={formatDuration(detailDuration)} pct={Math.min((detailDuration / 180000) * 100, 100)} />
                            <PerfBar
                              label="Build log size"
                              value={`${((detail.buildLogs?.length || 0) / 1024).toFixed(0)} KB`}
                              pct={Math.min(((detail.buildLogs?.length || 0) / 524288) * 100, 100)}
                            />
                            <PerfBar
                              label="Pipeline steps"
                              value={`${stepsDone}/${detailSteps.length || 0} done`}
                              pct={detailSteps.length ? (stepsDone / detailSteps.length) * 100 : 0}
                            />
                          </section>

                          <section className="deploy-card">
                            <h2 className="deploy-card-title">Runtime</h2>
                            <div className="deploy-summary-grid">
                              <SummaryField label="Framework" value={detail.framework || runtimeLabel(detail.runtime)} />
                              <SummaryField label="Node Version" value={detail.metadata?.nodeVersion || '22.x'} />
                              <SummaryField label="Deployment ID" value={detail._id ? `dep_${String(detail._id).slice(0, 8)}` : '—'} />
                              <SummaryField label="Build Command" value={detail.buildCommand || '—'} />
                              <SummaryField label="Root Directory" value={detail.rootDirectory || '—'} />
                              <SummaryField label="Output Directory" value={detail.outputDirectory || '—'} />
                            </div>
                          </section>
                        </>
                      ) : (
                        <section className="deploy-card">
                          <div className="deploy-card-head-row">
                            <h2 className="deploy-card-title">Deployment Summary</h2>
                            <div className="deploy-log-controls">
                              <div className="deploy-filters">
                                <button type="button" className={`deploy-filter ${logTab === 'build' ? 'active' : ''}`} onClick={() => { setLogTab('build'); setAutoScroll(true); }}>Build log</button>
                                <button type="button" className={`deploy-filter ${logTab === 'runtime' ? 'active' : ''}`} onClick={() => { setLogTab('runtime'); setAutoScroll(true); }}>Runtime</button>
                              </div>
                              {!TERMINAL.includes(detail.status) && (
                                <span className="deploy-live"><RefreshCw className="w-3.5 h-3.5 animate-spin" /> live</span>
                              )}
                              <button type="button" className="deploy-icon-btn" title="Copy logs" onClick={() => copyUrl(logText)}>
                                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>
                          <div
                            ref={logRef}
                            className="deploy-log"
                            onScroll={() => {
                              const el = logRef.current;
                              if (el) setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
                            }}
                          >
                            {logLines.length === 0 && (
                              <p className="deploy-muted">
                                {!TERMINAL.includes(detail.status) ? 'Waiting for build output…' : 'No log output captured for this deployment.'}
                              </p>
                            )}
                            {logLines.map((line, i) => (
                              <div key={i} className={`deploy-log-line ${logLineClass(line)}`}>
                                <span>{line || ' '}</span>
                              </div>
                            ))}
                          </div>
                        </section>
                      )}
                    </>
                  ) : (
                    <div className="deploy-card deploy-empty"><Loader2 className="w-5 h-5 animate-spin" /> Loading deployment…</div>
                  )}
                </>
              )}

              {/* ---------- CREATE (Figma 718:70479 / 718:70841 / 718:71193) ---------- */}
              {wizardOpen && (
                <div className="deploy-modal-backdrop" onClick={() => setWizardOpen(false)}>
                  <div className="deploy-modal" onClick={(e) => e.stopPropagation()}>
                    <div className="deploy-modal-head">
                      <div>
                        <h2 className="deploy-modal-title">Create Deployment</h2>
                        <p className="deploy-modal-sub">
                          {wizardStep === 1 && 'Select a repository'}
                          {wizardStep === 2 && 'Configure build'}
                          {wizardStep === 3 && 'Review and Deploy'}
                        </p>
                      </div>
                      <button type="button" className="deploy-modal-x" onClick={() => setWizardOpen(false)} aria-label="Close">
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="deploy-modal-step">
                      Step {wizardStep} of 3 · <b>{wizardStep === 1 ? 'Source' : wizardStep === 2 ? 'Build Settings' : 'Confirmation'}</b>
                    </div>
                    <div className="deploy-modal-progress">
                      <span style={{ width: `${(wizardStep / 3) * 100}%` }} />
                    </div>

                    <div className="deploy-modal-body">
                      {wizardStep === 1 && (
                        <>
                          {projectsLoading ? (
                            <p className="deploy-muted"><Loader2 className="w-4 h-4 animate-spin" /> Loading repositories…</p>
                          ) : projects.length === 0 ? (
                            <p className="deploy-muted">No projects found. Create a project in the Editor first, then deploy it from here.</p>
                          ) : (
                            <div className="deploy-source-list">
                              {projects.map((p) => {
                                const id = String(p._id || p.id);
                                const active = id === selectedProjectId;
                                return (
                                  <button key={id} type="button" className={`deploy-source-card ${active ? 'active' : ''}`} onClick={() => selectProject(p)}>
                                    <span className="deploy-avatar">{initialsFor({ subdomain: p.name, repoFullName: p.githubRepoName || p.name })}</span>
                                    <span className="deploy-source-text">
                                      <span className="deploy-source-name">{p.name}</span>
                                      <span className="deploy-muted">{p.description || p.githubRepoName || 'Workspace project'}</span>
                                    </span>
                                    <span className="deploy-source-fw">{frameworkLabelForProject(p)}</span>
                                    <span className={`deploy-radio ${active ? 'checked' : ''}`} />
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          <label className="deploy-label" htmlFor="deploy-branch">Branch</label>
                          <select id="deploy-branch" className="deploy-input" value={branch} onChange={(e) => setBranch(e.target.value)}>
                            <option value="main">main</option>
                            <option value="master">master</option>
                            <option value="develop">develop</option>
                            <option value="staging">staging</option>
                          </select>

                          <label className="deploy-label">Environment</label>
                          <div className="deploy-env-toggle">
                            {['Production', 'Preview'].map((env) => (
                              <button
                                key={env} type="button"
                                className={`deploy-env-btn ${environment === env ? 'active' : ''}`}
                                onClick={() => setEnvironment(env)}
                              >{env}</button>
                            ))}
                          </div>

                          <label className="deploy-label" htmlFor="deploy-subdomain">Subdomain</label>
                          <div className="deploy-subdomain-row">
                            <input
                              id="deploy-subdomain" type="text" className="deploy-input"
                              value={subdomain} onChange={(e) => setSubdomain(slugify(e.target.value))}
                              placeholder="my-app"
                            />
                            <span className="deploy-subdomain-suffix">.buildrshq.dev</span>
                          </div>
                        </>
                      )}

                      {wizardStep === 2 && (
                        <>
                          <div className="deploy-form-grid">
                            <div>
                              <label className="deploy-label" htmlFor="deploy-fw">Framework Preset</label>
                              <select id="deploy-fw" className="deploy-input" value={framework} onChange={(e) => setFramework(e.target.value)}>
                                <option>Vite</option><option>Next.js</option><option>React</option><option>Node.js</option>
                                <option>Static</option><option>Docker</option>
                              </select>
                            </div>
                            <div>
                              <label className="deploy-label" htmlFor="deploy-root">Root Directory</label>
                              <input id="deploy-root" type="text" className="deploy-input" value={rootDir} onChange={(e) => setRootDir(e.target.value)} />
                            </div>
                            <div>
                              <label className="deploy-label" htmlFor="deploy-build">Build Command</label>
                              <select id="deploy-build" className="deploy-input" value={buildCommand} onChange={(e) => setBuildCommand(e.target.value)}>
                                <option>pnpm build</option><option>npm run build</option><option>yarn build</option><option>npm run dev</option>
                              </select>
                            </div>
                            <div>
                              <label className="deploy-label" htmlFor="deploy-out">Output Directory</label>
                              <input id="deploy-out" type="text" className="deploy-input" value={outputDir} onChange={(e) => setOutputDir(e.target.value)} />
                            </div>
                          </div>

                          <label className="deploy-label">Environmental Variations</label>
                          <div className="deploy-env-card">
                            <div>
                              <p className="deploy-env-count">{envVars.filter((e) => e.key.trim()).length} variables configured</p>
                              <p className="deploy-muted">Encrypted and scoped to {environment.toLowerCase()}</p>
                            </div>
                            <button
                              type="button" className="deploy-btn-outline"
                              onClick={() => setEnvVars((prev) => [...prev, { key: '', value: '', secret: false }])}
                            >Add Variable</button>
                          </div>
                          {envVars.map((e, i) => (
                            <div key={i} className="deploy-env-row">
                              <input type="text" className="deploy-input" placeholder="KEY" value={e.key}
                                onChange={(ev) => setEnvVars((prev) => prev.map((x, j) => (j === i ? { ...x, key: ev.target.value } : x)))} />
                              <input type="text" className="deploy-input" placeholder="value" value={e.value}
                                onChange={(ev) => setEnvVars((prev) => prev.map((x, j) => (j === i ? { ...x, value: ev.target.value } : x)))} />
                              <label className="deploy-env-secret">
                                <input type="checkbox" checked={Boolean(e.secret)}
                                  onChange={(ev) => setEnvVars((prev) => prev.map((x, j) => (j === i ? { ...x, secret: ev.target.checked } : x)))} />
                                Secret
                              </label>
                              <button type="button" className="deploy-icon-btn" aria-label="Remove variable"
                                onClick={() => setEnvVars((prev) => prev.filter((_, j) => j !== i))}>
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}

                          <div className="deploy-detected">
                            <p className="deploy-detected-title">Build settings detected</p>
                            <p>BuildrsHQ analyzed your repository and prefilled the recommended settings for {framework.toLowerCase()}</p>
                          </div>
                        </>
                      )}

                      {wizardStep === 3 && selectedProject && (
                        <>
                          <div className="deploy-confirm-card">
                            <div className="deploy-confirm-head">
                              <span className="deploy-avatar">{initialsFor({ subdomain: selectedProject.name })}</span>
                              <div>
                                <p className="deploy-source-name">{selectedProject.name}</p>
                                <p className="deploy-muted">{branch}</p>
                              </div>
                              <span className="deploy-env-chip">{environment}</span>
                            </div>
                            <div className="deploy-summary-grid">
                              <SummaryField label="Framework" value={framework} />
                              <SummaryField label="Created" value="iad1 · Washington, D.C" />
                              <SummaryField label="Branch" value={branch} />
                              <SummaryField label="Root Directory" value={rootDir} />
                              <SummaryField label="Build Command" value={buildCommand} />
                              <SummaryField label="Output Directory" value={outputDir} />
                              <SummaryField label="Environment Variables" value={`${envVars.filter((e) => e.key.trim()).length} encrypted variables`} />
                              <SummaryField label="Commit" value="latest" />
                              <SummaryField label="URL" value={`${slugify(subdomain) || 'your-app'}.buildrshq.dev`} />
                            </div>
                          </div>
                          <div className="deploy-info-banner">
                            <Info className="w-4 h-4" />
                            <span>This deployment will start immediately. You can monitor build progress and logs from the deployment details page.</span>
                          </div>
                        </>
                      )}

                      {wizardError && <p className="deploy-banner-error">{wizardError}</p>}
                    </div>

                    <div className="deploy-modal-foot">
                      <button type="button" className="deploy-btn-outline" onClick={() => setWizardOpen(false)}>Cancel</button>
                      {wizardStep > 1 && (
                        <button type="button" className="deploy-btn-outline" onClick={() => setWizardStep((s) => s - 1)}>Back</button>
                      )}
                      {wizardStep < 3 ? (
                        <button
                          type="button" className="deploy-btn-primary"
                          disabled={wizardStep === 1 && !selectedProject}
                          onClick={() => setWizardStep((s) => s + 1)}
                        >Next</button>
                      ) : (
                        <button type="button" className="deploy-btn-primary" disabled={deploying} onClick={submitDeploy}>
                          {deploying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                          {deploying ? 'Deploying…' : 'Deploy Now'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}

function SummaryField({ label, value }) {
  return (
    <div className="deploy-summary-field">
      <span className="deploy-muted">{label}</span>
      <span className="deploy-summary-value">{value}</span>
    </div>
  );
}

function PerfBar({ label, value, pct }) {
  return (
    <div className="deploy-perf-row">
      <span className="deploy-perf-label">{label}</span>
      <div className="deploy-perf-track"><span style={{ width: `${pct}%` }} /></div>
      <span className="deploy-perf-value">{value}</span>
    </div>
  );
}

function logLineClass(line) {
  const t = String(line);
  if (/error|fail|exception|traceback/i.test(t)) return 'deploy-log-err';
  if (/warn|existing|deprecat/i.test(t)) return 'deploy-log-warn';
  if (/^\s*\+|created|modified|passed|success|listening|ready/i.test(t)) return 'deploy-log-ok';
  if (/^\s*~|changed/i.test(t)) return 'deploy-log-cyan';
  if (/running|building|install|deploying|verifying/i.test(t)) return 'deploy-log-blue';
  return '';
}
