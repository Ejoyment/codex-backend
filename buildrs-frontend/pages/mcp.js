import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch, companyApi, normalizeCompanies } from '../lib/api';
import {
  Server,
  Plus,
  Trash2,
  X,
  Loader2,
  PlugZap,
  CheckCircle2,
  XCircle,
  Pencil,
} from 'lucide-react';

const TRANSPORTS = ['sse', 'streamable-http', 'stdio'];

export default function McpPage() {
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);

  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [probingId, setProbingId] = useState(null);
  const [clock, setClock] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [transport, setTransport] = useState('sse');
  const [serverUrl, setServerUrl] = useState('');
  const [command, setCommand] = useState('');
  const [headers, setHeaders] = useState('');
  const [enabled, setEnabled] = useState(true);

  const load = useCallback(async () => {
    if (!selectedCompany) {
      setServers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/mcp/company/${selectedCompany}`);
      setServers(res.servers || []);
    } catch (err) {
      setError(err.message || 'Failed to load MCP servers');
    } finally {
      setLoading(false);
    }
  }, [selectedCompany]);

  useEffect(() => {
    const tick = () => {
      setClock(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

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
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setName('');
    setTransport('sse');
    setServerUrl('');
    setCommand('');
    setHeaders('');
    setEnabled(true);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(s) {
    setEditing(s);
    setName(s.name || '');
    setTransport(s.transport || 'sse');
    setServerUrl(s.serverUrl || '');
    setCommand(s.command || '');
    setHeaders(s.headers ? JSON.stringify(s.headers, null, 2) : '');
    setEnabled(s.enabled !== false);
    setFormError(null);
    setModalOpen(true);
  }

  async function save(e) {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Server name is required');
      return;
    }
    if (transport !== 'stdio' && !serverUrl.trim()) {
      setFormError('A server URL is required for this transport');
      return;
    }
    if (transport === 'stdio' && !command.trim()) {
      setFormError('A start command is required for stdio servers');
      return;
    }
    let parsedHeaders = {};
    if (headers.trim()) {
      try {
        parsedHeaders = JSON.parse(headers);
      } catch {
        setFormError('Headers must be valid JSON, e.g. {"Authorization": "Bearer xyz"}');
        return;
      }
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        companyId: selectedCompany,
        name: name.trim(),
        transport,
        serverUrl: serverUrl.trim(),
        command: command.trim(),
        headers: parsedHeaders,
        enabled,
      };
      const res = editing
        ? await apiFetch(`/api/mcp/${editing._id}`, { method: 'PUT', body: JSON.stringify(payload) })
        : await apiFetch('/api/mcp', { method: 'POST', body: JSON.stringify(payload) });
      if (!res.success) throw new Error(res.message || 'Save failed');
      setModalOpen(false);
      load();
    } catch (err) {
      setFormError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function probe(s) {
    setProbingId(s._id);
    try {
      const res = await apiFetch(`/api/mcp/${s._id}/probe`, { method: 'POST' });
      load();
      if (!res.success && res.message) {
        setError(res.message);
      }
    } catch (err) {
      setError(err.message || 'Probe failed');
    } finally {
      setProbingId(null);
    }
  }

  async function remove(s) {
    if (!confirm(`Remove MCP server "${s.name}"?`)) return;
    try {
      await apiFetch(`/api/mcp/${s._id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err.message || 'Remove failed');
    }
  }

  function statusMeta(s) {
    if (s.lastStatus === 'connected') return { label: 'Connected', cls: 'status-chip-ok', icon: CheckCircle2 };
    if (s.lastStatus === 'unreachable') return { label: 'Unreachable', cls: 'status-chip-err', icon: XCircle };
    return { label: 'Not probed', cls: 'status-chip-pend', icon: Server };
  }

  const kpis = [
    { key: 'servers', label: 'Servers', value: servers.length, sub: 'configured', color: 'blue', Icon: Server },
    { key: 'connected', label: 'Connected', value: servers.filter((server) => server.lastStatus === 'connected').length, sub: 'healthy links', color: 'green', Icon: CheckCircle2 },
    { key: 'tools', label: 'Tools', value: servers.reduce((sum, server) => sum + (server.tools?.length || 0), 0), sub: 'available tools', color: 'purple', Icon: PlugZap },
    { key: 'enabled', label: 'Enabled', value: servers.filter((server) => server.enabled !== false).length, sub: 'active integrations', color: 'orange', Icon: Server },
  ];

  return (
    <AuthGuard>
      <Head>
        <title>MCP Servers - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="workspace-container">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main">
          <header className="workspace-header dash-header">
            <div>
              <p className="dash-crumb">
                BuildrsHQ <span className="sep">/</span> Integrations
              </p>
              <h1 className="dash-title">MCP Servers</h1>
              <div className="dash-statusline">
                <span className="status-indicator status-online" />
                <span>{servers.length} server{servers.length === 1 ? '' : 's'} connected</span>
                <span className="dash-clock">· {clock || '—:——:——'}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="dash-pill hidden md:inline-flex">
                <span className="dot" />
                {companies.find((c) => c._id === selectedCompany)?.name || 'Select workspace'}
              </span>
              <select className="ws-select" style={{ width: 'auto', minWidth: 170 }} value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)}>
                <option value="">Select workspace</option>
                {companies.map((c) => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
              <button type="button" className="btn-workspace btn-primary" onClick={openCreate} disabled={!selectedCompany}>
                <Plus className="w-4 h-4" /> Add Server
              </button>
            </div>
          </header>

          <div className="workspace-content">
            <div className="dash-content">
              {error && <p className="text-sm text-[#f87171] mb-4">{error}</p>}

              <section className="dash-section">
                <div className="dash-section-head">
                  <div className="dash-eyebrow">
                    <span className="dot" />
                    <b>Overview</b> · integration health
                  </div>
                </div>
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                  {kpis.map((kpi) => {
                    const Icon = kpi.Icon;
                    return (
                      <div key={kpi.key} className={`dash-kpi dash-kpi-${kpi.color}`}>
                        <div className="dash-kpi-head">
                          <span className="dash-kpi-eyebrow">{kpi.label}</span>
                          <span className="dash-kpi-ico"><Icon className="w-4 h-4" /></span>
                        </div>
                        <div className="dash-kpi-value">{kpi.value}</div>
                        <div className="dash-kpi-meta-row">
                          <span className="dash-kpi-meta">{kpi.sub}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {loading ? (
                <div className="workspace-card">
                  <div className="workspace-card-body">
                    <p className="text-sm text-muted">Loading MCP servers...</p>
                  </div>
                </div>
              ) : servers.length === 0 ? (
                <div className="workspace-card">
                  <div className="workspace-card-body text-center py-10">
                    <Server className="w-8 h-8 mx-auto mb-2" style={{ color: '#3c3c3c' }} />
                    <p className="text-sm text-muted">
                      No MCP servers configured. Add one to export its tools to the AI coding agent.
                    </p>
                    {!selectedCompany && <p className="text-xs text-muted mt-1">Select a workspace first.</p>}
                  </div>
                </div>
              ) : (
                <section className="dash-section">
                  <div className="dash-section-head">
                    <div className="dash-eyebrow">
                      <span className="dot" />
                      <b>Servers</b> · connected tools
                    </div>
                  </div>
                  <div className="pipeline-grid">
                    {servers.map((s) => {
                      const meta = statusMeta(s);
                      const Icon = meta.icon;
                      return (
                        <div key={s._id} className="workspace-card">
                          <div className="workspace-card-header">
                            <div className="flex items-center gap-2.5">
                              <span className="card-ico"><Server className="w-4 h-4" /></span>
                              <div>
                                <h3 className="text-sm font-semibold text-white">{s.name}</h3>
                                <p className="text-xs text-muted">{s.transport}{s.serverUrl ? ' · ' + s.serverUrl : ''}</p>
                              </div>
                            </div>
                            <span className={`status-chip ${meta.cls} inline-flex items-center gap-1`}>
                              <Icon className="w-3 h-3" /> {meta.label}
                            </span>
                          </div>
                          <div className="workspace-card-body">
                            <p className="text-xs text-muted mb-1">
                              {s.tools?.length ? `${s.tools.length} tool(s) discovered` : 'No tools discovered yet'}
                            </p>
                            <div className="pipeline-stages">
                              {(s.tools || []).slice(0, 6).map((t, i) => (
                                <span key={i} className="pipeline-stage"><PlugZap className="w-3 h-3" /> {t.name}</span>
                              ))}
                              {(s.tools || []).length > 6 && (
                                <span className="pipeline-stage">+{(s.tools || []).length - 6} more</span>
                              )}
                            </div>
                            {s.lastError && <p className="text-xs text-[#f87171] mt-1">{s.lastError}</p>}
                            <div className="pipeline-actions">
                              <button type="button" className="btn-workspace btn-primary" style={{ fontSize: '0.72rem', padding: '0.3rem 0.6rem' }} onClick={() => probe(s)} disabled={probingId === s._id}>
                                {probingId === s._id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlugZap className="w-3.5 h-3.5" />}
                                Probe
                              </button>
                              <button type="button" className="btn-workspace btn-secondary" style={{ fontSize: '0.72rem', padding: '0.3rem 0.6rem' }} onClick={() => openEdit(s)}><Pencil className="w-3.5 h-3.5" /> Edit</button>
                              <button type="button" className="btn-workspace btn-secondary" style={{ fontSize: '0.72rem', padding: '0.3rem 0.6rem', color: '#f87171' }} onClick={() => remove(s)}><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          </div>
        </main>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="ws-modal w-full max-w-xl">
            <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.09)]">
              <div className="flex items-center gap-2.5">
                <span className="card-ico"><Server className="w-4 h-4" /></span>
                <h2 className="ws-modal-title">{editing ? 'Edit MCP Server' : 'Add MCP Server'}</h2>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} className="text-muted hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={save} className="p-5 space-y-4">
              <div>
                <label className="ws-label">Server Name *</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="ws-input" placeholder="e.g. Linear MCP" required />
              </div>
              <div>
                <label className="ws-label">Transport</label>
                <select className="ws-select" value={transport} onChange={(e) => setTransport(e.target.value)}>
                  {TRANSPORTS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {transport !== 'stdio' ? (
                <div>
                  <label className="ws-label">Server URL *</label>
                  <input type="text" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} className="ws-input" placeholder={`https://mcp.example.com/${transport === 'streamable-http' ? 'mcp' : 'sse'}`} />
                </div>
              ) : (
                <>
                  <div>
                    <label className="ws-label">Start command *</label>
                    <input type="text" value={command} onChange={(e) => setCommand(e.target.value)} className="ws-input" placeholder="npx -y @modelcontextprotocol/server-... " />
                  </div>
                </>
              )}
              <div>
                <label className="ws-label">Headers (JSON)</label>
                <textarea value={headers} onChange={(e) => setHeaders(e.target.value)} className="ws-input" rows={3} placeholder='{"Authorization": "Bearer sk-..."}' />
              </div>
              <label className="flex items-center gap-2 text-sm text-muted" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                Enabled (available when the AI agent runs)
              </label>
              {formError && <p className="text-xs text-[#f87171]">{formError}</p>}
              <div className="flex justify-end gap-3">
                <button type="button" className="btn-workspace btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-workspace btn-primary" disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Server className="w-4 h-4" />}
                  {saving ? 'Saving...' : 'Save Server'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}