import { useState, useEffect } from 'react';
import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch, companyApi, normalizeCompanies } from '../lib/api';
import { ShieldCheck, History, User, Filter } from 'lucide-react';

const CATEGORY_LABELS = {
  auth: 'Auth',
  team: 'Team',
  billing: 'Billing',
  deployment: 'Deployment',
  code: 'Code',
  git: 'Git',
  ai: 'AI',
  integration: 'Integration',
  system: 'System',
};

function initials(name) {
  return (name || 'U')
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
}

export default function AuditLogs() {
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);

  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('');
  const [error, setError] = useState(null);

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
    if (!selectedCompany) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const q = new URLSearchParams({ limit: '200' });
        if (category) q.set('category', category);
        const res = await apiFetch(`/api/audit-logs/company/${selectedCompany}?${q}`);
        if (res.success) {
          setLogs(res.logs || []);
          setTotal(res.total || 0);
        } else {
          setError(res.message || 'Failed to load audit logs');
        }
      } catch (err) {
        setError(err.message || 'Failed to load audit logs');
        setLogs([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedCompany, category]);

  return (
    <AuthGuard>
      <Head>
        <title>Audit Log - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="workspace-container">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main">
          <header className="workspace-header dash-header">
            <div className="flex items-center gap-3">
              <span className="hb-icon">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <div>
                <h1 className="workspace-title">Audit Log</h1>
                <p className="text-xs text-muted">
                  Security and activity trail across your workspace
                </p>
              </div>
            </div>
          </header>

          <div className="workspace-body">
            <div className="space-y-5">
              <div className="workspace-card">
                <div className="workspace-card-header">
                  <div className="flex items-center gap-2.5">
                    <span className="card-ico">
                      <History className="w-4 h-4" />
                    </span>
                    <h2 className="workspace-card-title">Activity</h2>
                    <span className="badge-count">{total} event{total !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      className="ws-select"
                      style={{ width: 'auto' }}
                      value={selectedCompany}
                      onChange={(e) => setSelectedCompany(e.target.value)}
                    >
                      <option value="">Select workspace</option>
                      {companies.map((c) => (
                        <option key={c._id} value={c._id}>{c.name}</option>
                      ))}
                    </select>
                    <select
                      className="ws-select"
                      style={{ width: 'auto' }}
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      <option value="">All categories</option>
                      {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="workspace-card-body">
                  {!selectedCompany ? (
                    <p className="text-sm text-muted">Select a workspace to view its audit log.</p>
                  ) : loading ? (
                    <p className="text-sm text-muted">Loading events...</p>
                  ) : error ? (
                    <p className="text-sm text-[#f87171]">{error}</p>
                  ) : logs.length === 0 ? (
                    <div className="text-center py-10">
                      <Filter className="w-8 h-8 mx-auto mb-2" style={{ color: '#3c3c3c' }} />
                      <p className="text-sm text-muted">
                        No activity yet. Events are recorded for deployments, file changes, git operations, invites and AI actions.
                      </p>
                    </div>
                  ) : (
                    <div className="audit-table">
                      {logs.map((log, i) => (
                        <div key={log._id || i} className="audit-row">
                          <div className="audit-avatar">
                            {log.actor?.profilePicture ? (
                              <img src={log.actor.profilePicture} alt="" className="rounded-full w-8 h-8 object-cover" />
                            ) : (
                              <span className="audit-avatar-initials">{initials(log.actor?.fullName || log.email)}</span>
                            )}
                          </div>
                          <div className="audit-main">
                            <div className="audit-title">
                              <span className="audit-event">{log.event}</span>
                              <span className="badge-count">
                                {CATEGORY_LABELS[log.category] || log.category}
                              </span>
                            </div>
                            <div className="audit-meta">
                              {log.target ? <span className="audit-target">{log.target}</span> : null}
                              <span className="audit-actor">
                                <User className="w-3 h-3 inline align-text-bottom mr-0.5" />
                                {log.actor?.fullName || log.email || 'Unknown'}
                              </span>
                            </div>
                          </div>
                          <div className="audit-time">{formatTime(log.createdAt)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}