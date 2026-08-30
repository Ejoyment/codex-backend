import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch } from '../lib/api';
import { NoWorkspaceEmptyState } from '../hooks/useCurrentCompany';
import { Plus, X, BookOpen, ChevronDown } from 'lucide-react';

const CATEGORIES = [
  { value: 'architecture', label: 'Architecture', color: 'bg-blue-500' },
  { value: 'naming', label: 'Naming', color: 'bg-purple-500' },
  { value: 'error-handling', label: 'Error Handling', color: 'bg-red-500' },
  { value: 'state-management', label: 'State Management', color: 'bg-green-500' },
  { value: 'api-design', label: 'API Design', color: 'bg-orange-500' },
  { value: 'testing', label: 'Testing', color: 'bg-teal-500' },
  { value: 'security', label: 'Security', color: 'bg-yellow-500' },
  { value: 'deployment', label: 'Deployment', color: 'bg-pink-500' },
  { value: 'custom', label: 'Custom', color: 'bg-gray-500' },
];

const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.value, c]));

const PRIORITY_BADGES = {
  low: 'bg-gray-600 text-gray-200',
  medium: 'bg-blue-600 text-blue-100',
  high: 'bg-orange-600 text-orange-100',
  urgent: 'bg-red-600 text-red-100',
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

  const loadCompanies = useCallback(async () => {
    try {
      const res = await apiFetch('/api/company/my-companies');
      if (res.success && res.companies?.length) {
        setCompanies(res.companies);
        setSelectedCompany((prev) => prev || res.companies[0]);
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

  return (
    <AuthGuard>
      <Head>
        <title>Team Memory - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="min-h-screen bg-navy flex">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main ml-64">
          <header className="workspace-header">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold">Team Memory</h1>
              <span className="text-sm text-gray-400">Team knowledge base &amp; conventions</span>
            </div>
            <div className="flex items-center gap-3">
              {companies.length > 1 && (
                <div className="relative">
                  <select
                    value={selectedCompany?._id || ''}
                    onChange={(e) => {
                      const co = companies.find((c) => c._id === e.target.value);
                      if (co) setSelectedCompany(co);
                    }}
                    className="appearance-none bg-navy-light border border-gray-700 rounded-lg px-3 py-2 pr-8 text-sm text-gray-200 cursor-pointer"
                  >
                    {companies.map((co) => (
                      <option key={co._id} value={co._id}>
                        {co.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              )}
              <button
                type="button"
                className="cta-button flex items-center gap-2"
                onClick={() => setShowModal(true)}
              >
                <Plus className="w-4 h-4" />
                Add Convention
              </button>
            </div>
          </header>

          <div className="workspace-content p-6">
            {!loading && companies.length === 0 ? (
              <NoWorkspaceEmptyState onCreateClick={() => router.push('/teams')} />
            ) : loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="workspace-card animate-pulse">
                    <div className="h-4 bg-gray-700 rounded w-1/3 mb-3" />
                    <div className="h-3 bg-gray-700 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-gray-700 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : conventions.length === 0 ? (
              <div className="workspace-card flex flex-col items-center justify-center py-16 text-center">
                <BookOpen className="w-12 h-12 text-gray-500 mb-4" />
                <h3 className="text-lg font-semibold text-gray-300 mb-2">No conventions yet</h3>
                <p className="text-gray-500 text-sm mb-6 max-w-sm">
                  Start building your team&apos;s knowledge base by adding coding conventions and
                  best practices.
                </p>
                <button
                  type="button"
                  className="cta-button flex items-center gap-2"
                  onClick={() => setShowModal(true)}
                >
                  <Plus className="w-4 h-4" />
                  Add First Convention
                </button>
              </div>
            ) : (
              <div className="space-y-8">
                {CATEGORIES.filter((cat) => grouped[cat.value]?.length).map((cat) => (
                  <section key={cat.value}>
                    <div className="flex items-center gap-3 mb-4">
                      <span className={`${cat.color} w-2.5 h-2.5 rounded-full inline-block`} />
                      <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
                        {cat.label}
                      </h2>
                      <span className="text-xs text-gray-500">
                        {grouped[cat.value].length} rule{grouped[cat.value].length !== 1 && 's'}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {grouped[cat.value].map((conv) => (
                        <ConventionCard key={conv._id} convention={conv} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
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
  const priorityClass = PRIORITY_BADGES[convention.priority] || PRIORITY_BADGES.medium;

  return (
    <div className="workspace-card">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="text-sm font-semibold text-gray-100 leading-snug">
            {convention.rule}
          </h3>
          <span className={`${priorityClass} text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap`}>
            {convention.priority}
          </span>
        </div>

        {convention.description && (
          <p className="text-xs text-gray-400 mb-3 leading-relaxed">{convention.description}</p>
        )}

        {convention.examples?.length > 0 && (
          <div className="mt-2">
            <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Examples</span>
            <ul className="mt-1 space-y-1">
              {convention.examples.map((ex, i) => (
                <li
                  key={i}
                  className="text-xs text-gray-400 bg-navy rounded px-2 py-1 font-mono"
                >
                  {ex}
                </li>
              ))}
            </ul>
          </div>
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

      const res = await apiFetch(`/api/ai-context/team-conventions/${companyId}`, {
        method: 'POST',
        body: JSON.stringify({
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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl p-8 max-w-lg w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-slate-900">Add Convention</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Category</label>
              <select
                value={form.category}
                onChange={(e) => update('category', e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => update('priority', e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Rule *</label>
            <input
              type="text"
              required
              value={form.rule}
              onChange={(e) => update('rule', e.target.value)}
              placeholder="e.g. Use functional components over class components"
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="Explain the convention and why it matters..."
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 resize-y"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Examples <span className="text-slate-400 font-normal">(one per line)</span>
            </label>
            <textarea
              rows={3}
              value={form.examples}
              onChange={(e) => update('examples', e.target.value)}
              placeholder="const useAuth = () => useStore(...)&#10;export default function MyComponent() {}"
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 font-mono resize-y"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Tech Stack</label>
            <input
              type="text"
              value={form.techStack}
              onChange={(e) => update('techStack', e.target.value)}
              placeholder="e.g. React, TypeScript, Next.js"
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900"
            />
          </div>

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-700 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="cta-button disabled:opacity-60"
            >
              {submitting ? 'Adding...' : 'Add Convention'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
