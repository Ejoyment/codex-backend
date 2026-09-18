import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch, companyApi, normalizeCompanies } from '../lib/api';
import {
  Rocket,
  Plus,
  Trash2,
  Play,
  X,
  Loader2,
  Github,
  CheckCircle2,
  XCircle,
  Clock,
  FileCode2,
} from 'lucide-react';

const STAGE_PRESETS = [
  { name: 'Install', command: 'npm install', icon: '📦' },
  { name: 'Test', command: 'npm test', icon: '🧪' },
  { name: 'Build', command: 'npm run build', icon: '🔨' },
  { name: 'Deploy', command: 'bash scripts/deploy.sh', icon: '🚀' },
  { name: 'Lint', command: 'npm run lint', icon: '📐' },
];

function statusChip(status) {
  if (status === 'success') return { label: 'Success', cls: 'status-chip-ok', icon: CheckCircle2 };
  if (status === 'failed') return { label: 'Failed', cls: 'status-chip-err', icon: XCircle };
  if (status === 'running' || status === 'in_progress') return { label: 'Running', cls: 'status-chip-run', icon: Loader2 };
  return { label: 'Pending', cls: 'status-chip-pend', icon: Clock };
}

const ICON_CHOICES = ['📦', '🧪', '🔨', '🚀', '📐', '🔍', '🖼️'];

export default function CiCd() {
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);

  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [pipelines, setPipelines] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formError, setFormError] = useState(null);
  const [name, setName] = useState('');
  const [repoOwner, setRepoOwner] = useState('');
  const [repoName, setRepoName] = useState('');
  const [branch, setBranch] = useState('main');
  const [stages, setStages] = useState([{ name: 'Install', command: 'npm install', icon: '📦' }]);
  const [runningId, setRunningId] = useState(null);

  const loadPipelines = useCallback(async () => {
    if (!selectedCompany) {
      setPipelines([]);
      setRuns([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [pRes, rRes] = await Promise.all([
        apiFetch(`/api/pipelines/company/${selectedCompany}`),
        apiFetch(`/api/pipelines/company/${selectedCompany}/runs?limit=10`),
      ]);
      setPipelines(pRes.pipelines || []);
      setRuns(rRes.runs || []);
    } catch (err) {
      setError(err.message || 'Failed to load pipelines');
    } finally {
      setLoading(false);
    }
  }, [selectedCompany]);

  useEffect(() => {
    (async () => {
      try {
        const res = await companyApi.getMyCompanies();
        if (res.success) {
          const comps = normalizeCompanies(res.companies);
          setCompanies(comps);
          if (comps.length > 0) setSelectedCompany(comps[0]._id);
        }
      } catch (err) {
        setError(err.message || 'Failed to load workspaces');
      }
    })();
  }, []);

  useEffect(() => {
    loadPipelines();
  }, [loadPipelines]);

  function openCreate() {
    setEditing(null);
    setName('');
    setRepoOwner('');
    setRepoName('');
    setBranch('main');
    setStages([{ name: 'Install', command: 'npm install', icon: '📦' }]);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(p) {
    setEditing(p);
    setName(p.name || '');
    setRepoOwner(p.repo?.owner || '');
    setRepoName(p.repo?.repo || '');
    setBranch(p.repo?.branch || 'main');
    setStages((p.stages || []).map((s) => ({ name: s.name, command: s.command, icon: s.icon || '📦' })));
    setFormError(null);
    setModalOpen(true);
  }

  function addStage() {
    setStages((prev) => [...prev, { name: `Step ${prev.length + 1}`, command: '', icon: '📦' }]);
  }
  function removeStage(idx) {
    setStages((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateStage(idx, key, val) {
    setStages((prev) => prev.map((s, i) => (i === idx ? { ...s, [key]: val } : s)));
  }

  async function savePipeline(e) {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Pipeline name is required');
      return;
    }
    const cleanStages = stages.filter((s) => s.name.trim() || s.command.trim()).map((s) => ({
      name: s.name.trim() || `Step ${s.icon}`,
      command: s.command.trim() || 'echo "noop"',
      icon: s.icon || '📦',
    }));
    if (cleanStages.length === 0) {
      setFormError('Add at least one stage');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        companyId: selectedCompany,
        name: name.trim(),
        repo: { owner: repoOwner.trim(), repo: repoName.trim(), branch: branch.trim() || 'main' },
        stages: cleanStages,
      };
      const res = editing
        ? await apiFetch(`/api/pipelines/${editing._id}`, { method: 'PUT', body: JSON.stringify(payload) })
        : await apiFetch('/api/pipelines', { method: 'POST', body: JSON.stringify(payload) });
      if (!res.success) throw new Error(res.message || 'Save failed');
      setModalOpen(false);
      loadPipelines();
    } catch (err) {
      setFormError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function runPipeline(p) {
    setRunningId(p._id);
    setError(null);
    try {
      const res = await apiFetch(`/api/pipelines/${p._id}/run`, { method: 'POST' });
      if (!res.success) throw new Error(res.message || 'Run failed');
      setTimeout(loadPipelines, 800);
      setTimeout(loadPipelines, 3000);
    } catch (err) {
      setError(err.message || 'Failed to trigger run');
    } finally {
      setRunningId(null);
    }
  }

  async function deletePipeline(p) {
    if (!confirm(`Delete pipeline "${p.name}"? This also removes its run history.`)) return;
    try {
      await apiFetch(`/api/pipelines/${p._id}`, { method: 'DELETE' });
      loadPipelines();
    } catch (err) {
      setError(err.message || 'Delete failed');
    }
  }

  function yamlPreview() {
    const lines = [
      '# buildrs.yml — generated by BuildrsHQ CI/CD builder',
      `name: ${name.trim() || 'unnamed-pipeline'}`,
      'on:',
      '  push:',
      `    branches: [${branch.trim() || 'main'}]`,
      '  manual: {}',
      '',
      'jobs:',
      '  build:',
      '    runs-on: ubuntu-latest',
      '    steps:',
    ];
    stages.filter((s) => s.name.trim() || s.command.trim()).forEach((s) => {
      lines.push(`      - name: ${s.name.trim()}`);
      lines.push(`        run: ${s.command.trim() || 'echo noop'}`);
    });
    return lines.join('\n');
  }

  return (
    <AuthGuard>
      <Head>
        <title>CI/CD Pipelines - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="workspace-container">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main">
          <header className="workspace-header dash-header">
            <div className="flex items-center gap-3">
              <span className="hb-icon">
                <Rocket className="w-5 h-5" />
              </span>
              <div>
                <h1 className="workspace-title">CI/CD Pipelines</h1>
                <p className="text-xs text-muted">
                  Build, test and deploy your projects with repeatable pipelines
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <select className="ws-select" style={{ width: 'auto' }} value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)}>
                <option value="">Select workspace</option>
                {companies.map((c) => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
              <button type="button" className="btn-workspace btn-primary" onClick={openCreate} disabled={!selectedCompany}>
                <Plus className="w-4 h-4" /> New Pipeline
              </button>
            </div>
          </header>

          <div className="workspace-body space-y-5">
            {error && <p className="text-sm text-[#f87171]">{error}</p>}
            {loading ? (
              <p className="text-sm text-muted">Loading pipelines...</p>
            ) : (
              <>
                <div>
                  <h2 className="workspace-card-title mb-2" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="card-ico"><Rocket className="w-4 h-4" /></span> Pipelines
                  </h2>
                  {pipelines.length === 0 ? (
                    <div className="workspace-card">
                      <div className="workspace-card-body text-center py-10">
                        <Rocket className="w-8 h-8 mx-auto mb-2" style={{ color: '#3c3c3c' }} />
                        <p className="text-sm text-muted">
                          No pipelines yet. Create one to define your Continuous Integration workflow.
                        </p>
                        {!selectedCompany && <p className="text-xs text-muted mt-1">Select a workspace first.</p>}
                      </div>
                    </div>
                  ) : (
                    <div className="pipeline-grid">
                      {pipelines.map((p) => (
                        <div key={p._id} className="workspace-card pipeline-card">
                          <div className="workspace-card-header">
                            <div className="flex items-center gap-2.5">
                              <span className="card-ico"><FileCode2 className="w-4 h-4" /></span>
                              <div>
                                <h3 className="text-sm font-semibold text-white">{p.name}</h3>
                                <p className="text-xs text-muted">{p.stages.length} stages</p>
                              </div>
                            </div>
                            {(p.repo?.owner && p.repo?.repo) && (
                              <div className="text-xs text-muted flex items-center gap-1">
                                <Github className="w-3 h-3" />
                                {p.repo.owner}/{p.repo.repo} · {p.repo.branch || 'main'}
                              </div>
                            )}
                          </div>
                          <div className="workspace-card-body">
                            <div className="pipeline-stages">
                              {p.stages.map((s, i) => (
                                <div key={i} className="pipeline-stage">
                                  {s.icon && <span>{s.icon}</span>}
                                  <span className="pipeline-stage-name">{s.name}</span>
                                </div>
                              ))}
                            </div>
                            <div className="pipeline-actions">
                              {p.lastStatus && (
                                <span className={`status-chip ${statusChip(p.lastStatus).cls} inline-flex items-center gap-1`}>
                                  {(() => { const C = statusChip(p.lastStatus).icon; return <C className="w-3 h-3" />; })()}
                                  {statusChip(p.lastStatus).label}
                                </span>
                              )}
                              <button type="button" className="btn-workspace btn-primary" style={{ fontSize: '0.72rem', padding: '0.3rem 0.6rem' }} onClick={() => runPipeline(p)} disabled={runningId === p._id || !p.enabled}>
                                {runningId === p._id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                                Run
                              </button>
                              <button type="button" className="btn-workspace btn-secondary" style={{ fontSize: '0.72rem', padding: '0.3rem 0.6rem' }} onClick={() => openEdit(p)}>Edit</button>
                              <button type="button" className="btn-workspace btn-secondary" style={{ fontSize: '0.72rem', padding: '0.3rem 0.6rem', color: '#f87171' }} onClick={() => deletePipeline(p)}><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h2 className="workspace-card-title mb-2" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="card-ico"><Clock className="w-4 h-4" /></span> Recent Runs
                  </h2>
                  <div className="workspace-card">
                    <div className="workspace-card-body">
                      {runs.length === 0 ? (
                        <p className="text-sm text-muted">No runs yet. Trigger a pipeline to see run history here.</p>
                      ) : (
                        <div className="space-y-2">
                          {runs.map((r) => (
                            <div key={r._id} className="pipeline-run-row">
                              <div className={`status-chip ${statusChip(r.status).cls}`}>
                                {statusChip(r.status).label}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-white font-medium truncate">{r.pipeline?.name || 'Pipeline'}</p>
                                <p className="text-xs text-muted">
                                  {r.triggeredBy?.fullName || 'Unknown'} · {r.stageResults?.length || 0} stage(s)
                                  {r.durationMs ? ` · ${(r.durationMs / 1000).toFixed(1)}s` : ''}
                                </p>
                              </div>
                              <p className="text-xs text-muted">
                                {r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="ws-modal w-full max-w-2xl" style={{ display: 'flex', flexDirection: 'column', maxHeight: '88vh' }}>
            <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.09)]">
              <div className="flex items-center gap-2.5">
                <span className="card-ico"><Rocket className="w-4 h-4" /></span>
                <h2 className="ws-modal-title">{editing ? 'Edit Pipeline' : 'New Pipeline'}</h2>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} className="text-muted hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={savePipeline} className="p-5 space-y-4" style={{ overflow: 'auto', flex: 1 }}>
              <div>
                <label className="ws-label">Pipeline Name *</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="ws-input" placeholder="e.g. deploy-production" required />
              </div>
              <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr auto' }}>
                <div>
                  <label className="ws-label">Repo owner</label>
                  <input type="text" value={repoOwner} onChange={(e) => setRepoOwner(e.target.value)} className="ws-input" placeholder="octocat" />
                </div>
                <div>
                  <label className="ws-label">Repo name</label>
                  <input type="text" value={repoName} onChange={(e) => setRepoName(e.target.value)} className="ws-input" placeholder="hello-world" />
                </div>
                <div style={{ width: 90 }}>
                  <label className="ws-label">Branch</label>
                  <input type="text" value={branch} onChange={(e) => setBranch(e.target.value)} className="ws-input" placeholder="main" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="ws-label">Stages</label>
                  <div className="flex items-center gap-2">
                    {STAGE_PRESETS.map((pre) => (
                      <button key={pre.name} type="button" className="btn-workspace btn-secondary" style={{ fontSize: '0.68rem', padding: '0.15rem 0.5rem' }} onClick={() => setStages((prev) => [...prev, { ...pre }])}>
                        {pre.icon} {pre.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2 mt-2">
                  {stages.map((s, idx) => (
                    <div key={idx} className="pipeline-edit-row">
                      <select className="ws-select" style={{ width: 52 }} value={s.icon} onChange={(e) => updateStage(idx, 'icon', e.target.value)}>
                        {ICON_CHOICES.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
                      </select>
                      <input type="text" value={s.name} className="ws-input" placeholder="Stage name" onChange={(e) => updateStage(idx, 'name', e.target.value)} />
                      <input type="text" value={s.command} className="ws-input" placeholder="command, e.g. npm test" onChange={(e) => updateStage(idx, 'command', e.target.value)} />
                      <button type="button" className="btn-workspace btn-secondary" onClick={() => removeStage(idx)} style={{ color: '#f87171' }}><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                  <button type="button" className="btn-workspace btn-secondary" onClick={addStage}>
                    <Plus className="w-3.5 h-3.5" /> Add Stage
                  </button>
                </div>
              </div>

              <div>
                <label className="ws-label">buildrs.yml preview</label>
                <pre className="ws-yaml">{yamlPreview()}</pre>
              </div>

              {formError && <p className="text-xs text-[#f87171]">{formError}</p>}

              <div className="flex justify-end gap-3">
                <button type="button" className="btn-workspace btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-workspace btn-primary" disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                  {saving ? 'Saving...' : 'Save Pipeline'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}