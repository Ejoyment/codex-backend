import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch, normalizeCompanies } from '../lib/api';
import { NoWorkspaceEmptyState } from '../hooks/useCurrentCompany';
import { Plus, X, BookOpen, ChevronDown, Loader2, BookMarked, Layers, AlertTriangle } from 'lucide-react';

const CATEGORIES = [
  { value: 'architecture', label: 'Architecture', color: '#60a5fa' },
  { value: 'naming', label: 'Naming', color: '#a78bfa' },
  { value: 'error-handling', label: 'Error Handling', color: '#f87171' },
  { value: 'state-management', label: 'State Management', color: '#34d399' },
  { value: 'api-design', label: 'API Design', color: '#e5b84a' },
  { value: 'testing', label: 'Testing', color: '#2fd6e6' },
  { value: 'security', label: 'Security', color: '#fbbf24' },
  { value: 'deployment', label: 'Deployment', color: '#f472b6' },
  { value: 'custom', label: 'Custom', color: '#9aa1ae' },
];

const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.value, c]));

const PRIORITY_TINTS = {
  low: { bg: 'rgba(154,161,174,0.1)', text: '#9aa1ae' },
  medium: { bg: 'rgba(47,214,230,0.12)', text: '#2fd6e6' },
  high: { bg: 'rgba(229,184,74,0.12)', text: '#e5b84a' },
  urgent: { bg: 'rgba(248,113,113,0.12)', text: '#f87171' },
};

export default function TeamMemory() {
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);
  const router = useRouter();

  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [conventions, setConventions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () => {
      setClock(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const loadCompanies = useCallback(async () => {
    try {
      const res = await apiFetch('/api/company/my-companies');
      const companies = normalizeCompanies(res.companies);
      if (companies.length) {
        setCompanies(companies);
        setSelectedCompany((prev) => prev || companies[0]);
      }
    } catch {
      /* no-op */
    }
  }, []);

  const loadConventions = useCallback(async () => {
    if (!selectedCompany?._id) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/ai-context/team-conventions/${selectedCompany._id}`);
      if (res.success) setConventions(res.conventions || []);
    } catch {
      /* no-op */
    } finally {
      setLoading(false);
    }
  }, [selectedCompany]);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  useEffect(() => {
    loadConventions();
  }, [loadConventions]);

  const grouped = conventions.reduce((acc, c) => {
    (acc[c.category] = acc[c.category] || []).push(c);
    return acc;
  }, {});

  const activeCategories = CATEGORIES.filter((cat) => grouped[cat.value]?.length);
  const urgentCount = conventions.filter((c) => c.priority === 'urgent' || c.priority === 'high').length;

  return (
    <AuthGuard>
      <Head>
        <title>Team Memory - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="workspace-container">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main">
          <header className="workspace-header dash-header">
            <div>
              <p className="dash-crumb">
                BuildrsHQ <span className="sep">/</span> Team Memory
              </p>
              <h1 className="dash-title">Team Memory</h1>
              <div className="dash-statusline">
                <span className="status-indicator status-online" />
                <span>{conventions.length} stored convention{conventions.length === 1 ? '' : 's'}</span>
                <span className="dash-clock">· {clock || '—:——:——'}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {companies.length > 1 && selectedCompany && (
                <div className="mem-select-wrap">
                  <select
                    value={selectedCompany._id}
                    onChange={(e) => {
                      const co = companies.find((c) => c._id === e.target.value);
                      if (co) setSelectedCompany(co);
                    }}
                    className="mem-select"
                  >
                    {companies.map((co) => (
                      <option key={co._id} value={co._id}>
                        {co.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 mem-select-chev" />
                </div>
              )}
              <button type="button" className="btn-workspace btn-primary" onClick={() => setShowModal(true)}>
                <Plus className="w-4 h-4" />
                Add Convention
              </button>
            </div>
          </header>

          <div className="workspace-content">
            {!loading && companies.length === 0 ? (
              <NoWorkspaceEmptyState onCreateClick={() => router.push('/teams')} />
            ) : (
              <>
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-4" style={{ marginBottom: '1.5rem' }}>
                  <div className="dash-kpi dash-kpi-blue" style={{ cursor: 'default' }}>
                    <div className="dash-kpi-head">
                      <span className="dash-kpi-eyebrow">Total rules</span>
                      <span className="dash-kpi-ico"><BookMarked className="w-4 h-4" /></span>
                    </div>
                    <div className="dash-kpi-value">{conventions.length}</div>
                    <div className="dash-kpi-meta-row">
                      <span className="dash-kpi-meta">stored in memory</span>
                    </div>
                  </div>
                  <div className="dash-kpi dash-kpi-purple" style={{ cursor: 'default' }}>
                    <div className="dash-kpi-head">
                      <span className="dash-kpi-eyebrow">Categories covered</span>
                      <span className="dash-kpi-ico"><Layers className="w-4 h-4" /></span>
                    </div>
                    <div className="dash-kpi-value">{activeCategories.length}</div>
                    <div className="dash-kpi-meta-row">
                      <span className="dash-kpi-meta">of {CATEGORIES.length} categories</span>
                    </div>
                  </div>
                  <div className="dash-kpi dash-kpi-green" style={{ cursor: 'default' }}>
                    <div className="dash-kpi-head">
                      <span className="dash-kpi-eyebrow">With examples</span>
                      <span className="dash-kpi-ico"><BookOpen className="w-4 h-4" /></span>
                    </div>
                    <div className="dash-kpi-value">{conventions.filter((c) => c.examples?.length > 0).length}</div>
                    <div className="dash-kpi-meta-row">
                      <span className="dash-kpi-meta">docs with samples</span>
                    </div>
                  </div>
                  <div className="dash-kpi dash-kpi-orange" style={{ cursor: 'default' }}>
                    <div className="dash-kpi-head">
                      <span className="dash-kpi-eyebrow">High / urgent</span>
                      <span className="dash-kpi-ico"><AlertTriangle className="w-4 h-4" /></span>
                    </div>
                    <div className="dash-kpi-value">{urgentCount}</div>
                    <div className="dash-kpi-meta-row">
                      <span className="dash-kpi-meta">needs attention</span>
                    </div>
                  </div>
                </div>

                {loading ? (
                  <div className="dash-empty" style={{ paddingTop: '4rem' }}>
                    <div className="dash-empty-ico">
                      <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                    <p className="dash-empty-title">Loading conventions...</p>
                  </div>
                ) : conventions.length === 0 ? (
                  <div className="workspace-card">
                    <div className="workspace-card-body flex flex-col items-center justify-center py-16 text-center">
                      <div className="dash-empty-ico">
                        <BookOpen className="w-5 h-5" />
                      </div>
                      <p className="dash-empty-title" style={{ fontSize: '1.05rem', marginBottom: '0.4rem' }}>
                        No conventions yet
                      </p>
                      <p className="dash-empty-sub" style={{ maxWidth: '26rem', lineHeight: '1.5', marginBottom: '1.5rem' }}>
                        Start building your team&apos;s knowledge base by adding coding
                        conventions and best practices.
                      </p>
                      <button type="button" className="btn-workspace btn-primary" onClick={() => setShowModal(true)}>
                        <Plus className="w-4 h-4" />
                        Add First Convention
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mem-sections">
                    {activeCategories.map((cat) => (
                      <section key={cat.value}>
                        <div className="mem-section-head">
                          <span className="mem-cat-dot" style={{ background: cat.color }} />
                          <h2 className="mem-cat-name">{cat.label}</h2>
                          <span className="mem-cat-count">
                            {grouped[cat.value].length} rule{grouped[cat.value].length !== 1 && 's'}
                          </span>
                        </div>
                        <div className="mem-grid">
                          {grouped[cat.value].map((conv) => (
                            <ConventionCard key={conv._id} convention={conv} />
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {showModal && selectedCompany && (
        <AddConventionModal
          companyId={selectedCompany._id}
          onClose={() => setShowModal(false)}
          onCreated={(conv) => {
            setConventions((prev) => [conv, ...prev]);
            setShowModal(false);
          }}
        />
      )}
    </AuthGuard>
  );
}

function ConventionCard({ convention }) {
  const cat = CATEGORY_MAP[convention.category] || CATEGORY_MAP.custom;
  const priorityTint = PRIORITY_TINTS[convention.priority] || PRIORITY_TINTS.medium;

  return (
    <div className="mem-card">
      <div className="mem-card-top">
        <h3 className="mem-rule">{convention.rule}</h3>
        <span className="pill flex-shrink-0" style={{ background: priorityTint.bg, color: priorityTint.text }}>
          {convention.priority}
        </span>
      </div>

      {convention.description && (
        <p className="mem-desc">{convention.description}</p>
      )}

      {convention.examples?.length > 0 && (
        <div className="mem-examples">
          <span className="mem-examples-label">Examples</span>
          {convention.examples.slice(0, 3).map((ex, i) => (
            <code key={i} className="mem-example">{ex}</code>
          ))}
        </div>
      )}

      <div className="mem-meta">
        <span className="mem-tag">
          <span className="mem-cat-dot" style={{ background: cat.color, width: 6, height: 6 }} />
          {cat.label}
        </span>
        {convention.techStack && (
          <span className="mem-tag">{convention.techStack}</span>
        )}
      </div>
    </div>
  );
}

function AddConventionModal({ companyId, onClose, onCreated }) {
  const [form, setForm] = useState({
    category: 'architecture',
    rule: '',
    description: '',
    examples: '',
    techStack: '',
    priority: 'medium',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const rule = form.rule.trim();
    if (!rule) return;

    setSubmitting(true);
    setError(null);
    try {
      const examples = form.examples
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await apiFetch('/api/ai-context/team-conventions', {
        method: 'POST',
        body: JSON.stringify({
          companyId,
          category: form.category,
          rule,
          description: form.description.trim(),
          examples,
          techStack: form.techStack.trim(),
          priority: form.priority,
        }),
      });

      if (res.success && res.convention) {
        onCreated(res.convention);
      } else {
        setError(res.message || 'Failed to add convention');
      }
    } catch (err) {
      setError(err.message || 'Failed to add convention. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] p-4" onClick={onClose}>
      <div className="ws-modal p-6 max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <span className="card-ico">
              <BookOpen className="w-4 h-4" />
            </span>
            <h3 className="ws-modal-title">Add Convention</h3>
          </div>
          <button type="button" onClick={onClose} className="text-[#565d6b] hover:text-[#eceef1]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && <div className="std-alert std-alert-error mb-4">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="ws-label">Category</label>
              <select
                value={form.category}
                onChange={(e) => update('category', e.target.value)}
                className="ws-select"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="ws-label">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => update('priority', e.target.value)}
                className="ws-select"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div className="mb-4">
            <label className="ws-label">Rule *</label>
            <input
              type="text"
              required
              value={form.rule}
              onChange={(e) => update('rule', e.target.value)}
              placeholder="e.g. Use functional components over class components"
              className="ws-input"
            />
          </div>

          <div className="mb-4">
            <label className="ws-label">Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="Explain the convention and why it matters..."
              className="ws-input resize-y"
            />
          </div>

          <div className="mb-4">
            <label className="ws-label">
              Examples <span className="text-[#565d6b] font-normal">(one per line)</span>
            </label>
            <textarea
              rows={3}
              value={form.examples}
              onChange={(e) => update('examples', e.target.value)}
              placeholder={'const useAuth = () => useStore(...)\nexport default function MyComponent() {}'}
              className="ws-input resize-y font-mono"
            />
          </div>

          <div className="mb-6">
            <label className="ws-label">Tech Stack</label>
            <input
              type="text"
              value={form.techStack}
              onChange={(e) => update('techStack', e.target.value)}
              placeholder="e.g. React, TypeScript, Next.js"
              className="ws-input"
            />
          </div>

          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="btn-workspace btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-workspace btn-primary">
              {submitting ? 'Adding...' : 'Add Convention'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}