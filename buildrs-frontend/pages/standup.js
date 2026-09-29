import { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch, projectApi, companyApi, normalizeCompanies } from '../lib/api';
import {
  Send,
  Clock,
  CheckCircle2,
  AlertCircle,
  Check,
  ListChecks,
  Building2,
  MessageSquare,
  ListTodo,
  History,
  Sparkles,
} from 'lucide-react';

/**
 * Standups arrive in two shapes: server documents (createdAt, `user`,
 * `channel`, populated `relatedTasks`) and locally cached ones (timestamp,
 * `author`, `channelId`, task ids). Rendering the server shape directly is what
 * produced "Invalid Date" in the history, so normalize both into one shape.
 */
function normalizeStandup(raw) {
  if (!raw) return null;
  const user = typeof raw.user === 'object' && raw.user ? raw.user : null;
  const author = raw.author || user?.fullName || user?.name || 'Someone';
  const timestamp = raw.timestamp || raw.createdAt || raw.updatedAt || null;
  const relatedTasks = (raw.relatedTasks || [])
    .map((t) => (typeof t === 'object' && t ? { id: String(t._id || t.id), title: t.title } : { id: String(t), title: '' }))
    .filter((t) => t.id);

  return {
    _id: String(raw._id || raw.id || `${timestamp || 'local'}-${author}`),
    timestamp,
    author,
    channelId: raw.channelId || (raw.channel ? String(raw.channel) : ''),
    channelName: raw.channelName || '',
    companyId: raw.companyId || (raw.company ? String(raw.company) : ''),
    yesterday: raw.yesterday || '',
    today: raw.today || '',
    blockers: raw.blockers || '',
    relatedTasks,
  };
}

/** Dedupe a locally cached copy against its server twin, preferring the server record. */
function dedupeStandups(items) {
  const byKey = new Map();
  for (const item of items) {
    const s = normalizeStandup(item);
    if (!s) continue;
    const ms = s.timestamp ? new Date(s.timestamp).getTime() : NaN;
    const key = isFinite(ms) ? `${Math.floor(ms / 1000)}|${s.author}` : `local|${s._id}`;
    const existing = byKey.get(key);
    if (!existing || (s.timestamp && !existing.timestamp)) byKey.set(key, s);
  }
  return [...byKey.values()].sort(
    (a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
  );
}

function groupStandups(items) {
  const groups = [];
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const buckets = { Today: [], Yesterday: [], 'This Week': [], Earlier: [] };
  for (const item of items) {
    const parsed = new Date(item.timestamp);
    if (isNaN(parsed.getTime())) {
      buckets.Earlier.push(item);
      continue;
    }
    const date = parsed;
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (day.getTime() === today.getTime()) buckets.Today.push(item);
    else if (day.getTime() === yesterday.getTime()) buckets.Yesterday.push(item);
    else if (date >= weekAgo) buckets['This Week'].push(item);
    else buckets.Earlier.push(item);
  }
  for (const [label, entries] of Object.entries(buckets)) {
    if (entries.length > 0) groups.push({ label, items: entries });
  }
  return groups;
}

function initials(name) {
  return (name || 'U')
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const TASK_META_STYLE = {
  pending: 'Pending',
  'in-progress': 'In progress',
  in_review: 'In review',
  completed: 'Done',
};

export default function Standup() {
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);

  const [generating, setGenerating] = useState(false);
  const [yesterday, setYesterday] = useState('');
  const [today, setToday] = useState('');
  const [blockers, setBlockers] = useState('');
  const [tasks, setTasks] = useState([]);
  const [selectedTasks, setSelectedTasks] = useState([]);
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState('');
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [pastStandups, setPastStandups] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () => {
      setClock(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    async function loadData() {
      try {
        const [tasksRes, companiesRes] = await Promise.all([
          projectApi.listTasks(),
          companyApi.getMyCompanies(),
        ]);

        let normalizedCompanies = [];
        if (tasksRes.success) {
          const normalizedTasks = (tasksRes.tasks || []).map((task) => ({
            ...task,
            id: task.id || task._id,
            _id: task._id || task.id,
          }));
          setTasks(normalizedTasks);
        }
        if (companiesRes.success) {
          normalizedCompanies = normalizeCompanies(companiesRes.companies);
          setCompanies(normalizedCompanies);
          if (normalizedCompanies.length > 0) setSelectedCompany(normalizedCompanies[0]._id);
        }

        const stored = JSON.parse(localStorage.getItem('pastStandups') || '[]');

        if (normalizedCompanies.length === 0) {
          setPastStandups(dedupeStandups(stored));
        } else {
          try {
            const res = await apiFetch(`/api/standup?companyId=${normalizedCompanies[0]._id}&limit=50`);
            const serverStandups = res.success ? res.standups : [];
            // The server is the source of truth; the cache only fills in
            // standups that were saved while offline.
            setPastStandups(dedupeStandups([...serverStandups, ...stored]));
          } catch (err) {
            console.error('Failed to load server standups:', err);
            setPastStandups(dedupeStandups(stored));
          }
        }
      } catch (err) {
        setError(err.message || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  useEffect(() => {
    if (!selectedCompany) return;
    async function loadChannels() {
      try {
        const res = await apiFetch(`/api/messaging/channels?companyId=${selectedCompany}`);
        if (res.success) setChannels(res.channels || []);
      } catch {
        setChannels([]);
      }
    }
    loadChannels();
  }, [selectedCompany]);

  function toggleTask(taskId) {
    const normalizedId = taskId || '';
    setSelectedTasks((prev) =>
      prev.includes(normalizedId) ? prev.filter((id) => id !== normalizedId) : [...prev, normalizedId]
    );
  }

  const todayCount = useMemo(
    () =>
      pastStandups.filter((s) => {
        const d = new Date(s.timestamp);
        return !isNaN(d.getTime()) && d.toDateString() === new Date().toDateString();
      }).length,
    [pastStandups]
  );

  const groupedStandups = useMemo(() => groupStandups(pastStandups), [pastStandups]);

  // Submitting requires an anchored task, a delivery channel, and some content.
  const canSubmit =
    Boolean(selectedCompany) &&
    selectedTasks.length > 0 &&
    Boolean(selectedChannel) &&
    Boolean(yesterday.trim() || today.trim() || blockers.trim());

  const submitBlockedReason = !selectedCompany
    ? 'Choose a workspace'
    : selectedTasks.length === 0
      ? 'Select at least one related task'
      : !selectedChannel
        ? 'Select a channel to post to'
        : !yesterday.trim() && !today.trim() && !blockers.trim()
          ? 'Fill in at least one field'
          : null;

  async function handleAutoGenerate() {
    if (!selectedCompany) return;
    setGenerating(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch('/api/standup/generate', {
        method: 'POST',
        body: JSON.stringify({ companyId: selectedCompany }),
      });
      if (res.success && res.draft) {
        const draft = res.draft.trim();
        const parse = (label) => {
          const i = draft.indexOf(label);
          if (i === -1) return '';
          const rest = draft.slice(i + label.length);
          const nxt = rest.search(/Yesterday:|Today:|Blockers:/);
          const seg = nxt === -1 ? rest : rest.slice(0, nxt);
          return seg.replace(/^[\s:*-]*/, '').replace(/[\s*#-]+$/, '').trim();
        };
        const y = parse('Yesterday:') || parse('**Yesterday**');
        const t = parse('Today:') || parse('**Today**');
        const b = parse('Blockers:') || parse('**Blockers**');
        setYesterday(y);
        setToday(t);
        setBlockers(b);
        if (!y && !t && !b) {
          setYesterday(draft);
        }
        setSuccess('Draft generated — review and edit before submitting.');
      } else {
        setError((res && res.message) || 'Could not auto-generate. Fill in manually.');
      }
    } catch (err) {
      setError(err.message || 'Failed to auto-generate standup');
    } finally {
      setGenerating(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedCompany) {
      setError('Choose a workspace first');
      return;
    }
    // A standup must reference the work it reports on.
    if (selectedTasks.length === 0) {
      setError('Select at least one related task');
      return;
    }
    // "Post To" is a real destination; the API will not store an undeliverable standup.
    if (!selectedChannel) {
      setError('Select a channel to post the standup to');
      return;
    }
    if (!yesterday.trim() && !today.trim() && !blockers.trim()) {
      setError('Please fill in at least one field');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await apiFetch('/api/standup', {
        method: 'POST',
        body: JSON.stringify({
          companyId: selectedCompany,
          channelId: selectedChannel,
          yesterday: yesterday.trim(),
          today: today.trim(),
          blockers: blockers.trim(),
          relatedTasks: selectedTasks,
        }),
      });

      const channelName = channels.find((ch) => ch._id === selectedChannel)?.name || 'the channel';
      const created = normalizeStandup({
        ...res.standup,
        timestamp: res.standup?.createdAt || new Date().toISOString(),
        channelId: res.channelId || selectedChannel,
        channelName,
        companyId: selectedCompany,
        author: res.standup?.user?.fullName || user?.fullName || user?.name || 'You',
      });

      const updated = dedupeStandups([created, ...pastStandups]);
      setPastStandups(updated);
      localStorage.setItem('pastStandups', JSON.stringify(updated));

      setYesterday('');
      setToday('');
      setBlockers('');
      setSelectedTasks([]);
      setSelectedChannel('');

      if (res.delivered === false) {
        setError(res.message || 'Standup saved, but posting to the channel failed.');
      } else {
        setSuccess(`Standup posted to #${channelName}`);
      }
    } catch (err) {
      setError(err?.message || 'Failed to submit standup');
    } finally {
      setSubmitting(false);
    }
  }

  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <AuthGuard>
      <Head>
        <title>Standup - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="workspace-container">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main">
          <header className="workspace-header dash-header">
            <div>
              <p className="dash-crumb">
                BuildrsHQ <span className="sep">/</span> Standup
              </p>
              <h1 className="dash-title">Daily Standup</h1>
              <div className="dash-statusline">
                <span className="status-indicator status-online" />
                <span>Sync your progress</span>
                <span className="dash-clock">· {clock || '—:——:——'}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="dash-pill">
                <span className="dot" />
{todayLabel}
              </span>
            </div>
          </header>

          <div className="workspace-content">
            <div className="std-content">
              {error && (
                <div className="std-alert std-alert-error">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              {success && (
                <div className="std-alert std-alert-success">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <p>{success}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  <div className="lg:col-span-2 space-y-5">
                    <div className="std-comp">
                      <div className="std-block">
                        <div className="std-block-head">
                          <span className="std-block-ico std-ico-y">
                            <Clock className="w-4 h-4" />
                          </span>
                          <div>
                            <p className="std-block-title">What did you do yesterday?</p>
                            <p className="std-block-hint">Accomplishments · work completed</p>
                          </div>
                          <span className="std-count">{yesterday.length}/1000</span>
                        </div>
                        <textarea
                          className="std-textarea"
                          rows={4}
                          maxLength={1000}
                          placeholder="Describe what you accomplished yesterday..."
                          value={yesterday}
                          onChange={(e) => setYesterday(e.target.value)}
                        />
                      </div>

                      <div className="std-block">
                        <div className="std-block-head">
                          <span className="std-block-ico std-ico-t">
                            <ListChecks className="w-4 h-4" />
                          </span>
                          <div>
                            <p className="std-block-title">What are you working on today?</p>
                            <p className="std-block-hint">Plan · focus for the day</p>
                          </div>
                          <span className="std-count">{today.length}/1000</span>
                        </div>
                        <textarea
                          className="std-textarea"
                          rows={4}
                          maxLength={1000}
                          placeholder="Describe your plan for today..."
                          value={today}
                          onChange={(e) => setToday(e.target.value)}
                        />
                      </div>

                      <div className="std-block">
                        <div className="std-block-head">
                          <span className="std-block-ico std-ico-b">
                            <AlertCircle className="w-4 h-4" />
                          </span>
                          <div>
                            <p className="std-block-title">Any blockers?</p>
                            <p className="std-block-hint">Impediments · help requested</p>
                          </div>
                          <span className="std-count">{blockers.length}/1000</span>
                        </div>
                        <textarea
                          className="std-textarea"
                          rows={3}
                          maxLength={1000}
                          placeholder="Anything slowing you down or blocking progress?"
                          value={blockers}
                          onChange={(e) => setBlockers(e.target.value)}
                        />
                      </div>

                      <div className="std-submit-bar">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className="std-note">
                            <span className="std-kbd">⌘</span><span className="std-kbd">↵</span>&nbsp; to submit
                          </span>
                          {submitBlockedReason && (
                            <span className="text-xs text-muted">{submitBlockedReason}</span>
                          )}
                          <button
                            type="button"
                            onClick={handleAutoGenerate}
                            disabled={generating}
                            className="btn-workspace btn-secondary text-xs inline-flex items-center gap-1"
                            title="Let AI draft your standup from recent tasks and meetings"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            {generating ? 'Generating...' : 'Auto-generate'}
                          </button>
                        </div>
                        <button
                          type="submit"
                          disabled={submitting || !canSubmit}
                          className="btn-workspace btn-primary"
                          title={submitBlockedReason || 'Submit standup'}
                        >
                          <Send className="w-4 h-4" />
                          {submitting ? 'Submitting...' : 'Submit Standup'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div className="workspace-card">
                      <div className="workspace-card-header flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="card-ico">
                            <ListTodo className="w-4 h-4" />
                          </span>
                          <h2 className="workspace-card-title">Related Tasks</h2>
                        </div>
                        <span className="badge-count">{selectedTasks.length} selected</span>
                      </div>
                      <div className="workspace-card-body">
                        {loading ? (
                          <p className="text-sm text-muted">Loading tasks...</p>
                        ) : tasks.length === 0 ? (
                          <div className="dash-empty">
                            <div className="dash-empty-ico">
                              <ListTodo className="w-5 h-5" />
                            </div>
                            <p className="dash-empty-title">No tasks found</p>
                            <p className="dash-empty-sub">Create tasks to link them to your standup.</p>
                          </div>
                        ) : (
                          <div className="std-task-list">
                            {tasks.map((task) => {
                              const taskId = task.id || task._id;
                              const checked = selectedTasks.includes(taskId);
                              return (
                                <div
                                  key={taskId}
                                  className={`std-task-row ${checked ? 'is-checked' : ''}`}
                                  onClick={() => toggleTask(taskId)}
                                >
                                  <span className="std-check">
                                    <Check className="w-3 h-3" />
                                  </span>
                                  <div className="std-task-main">
                                    <p className="std-task-title">{task.title}</p>
                                    <p className="std-task-meta">
                                      {TASK_META_STYLE[task.status] || task.status}
                                      {task.priority ? ` · ${task.priority}` : ''}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="workspace-card">
                      <div className="workspace-card-header flex items-center gap-2.5">
                        <span className="card-ico">
                          <MessageSquare className="w-4 h-4" />
                        </span>
                        <h2 className="workspace-card-title">Post To</h2>
                      </div>
                      <div className="workspace-card-body space-y-4">
                        <div>
                          <label className="ws-label">Company</label>
                          <select
                            className="ws-select"
                            value={selectedCompany}
                            onChange={(e) => setSelectedCompany(e.target.value)}
                          >
                            {companies.length === 0 && <option value="">No companies</option>}
                            {companies.map((c) => (
                              <option key={c._id} value={c._id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="ws-label">Channel</label>
                          <select
                            className="ws-select"
                            value={selectedChannel}
                            onChange={(e) => setSelectedChannel(e.target.value)}
                          >
                            <option value="">Select a channel</option>
                            {channels.map((ch) => (
                              <option key={ch._id} value={ch._id}>
                                {ch.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </form>

              {/* Metrics strip */}
              <section className="dash-section mt-8">
                <div className="dash-section-head">
                  <div className="dash-eyebrow">
                    <span className="dot" />
                    <b>Rhythm</b> · your standup practice
                  </div>
                </div>
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                  <div className="dash-kpi dash-kpi-blue dash-kpi-link" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                    <div className="dash-kpi-head">
                      <span className="dash-kpi-eyebrow">Standups Logged</span>
                      <span className="dash-kpi-ico"><History className="w-4 h-4" /></span>
                    </div>
                    <div className="dash-kpi-value">{pastStandups.length}</div>
                    <div className="dash-kpi-meta-row">
                      <span className="dash-kpi-meta">{todayCount} today</span>
                    </div>
                  </div>
                  <div className="dash-kpi dash-kpi-green dash-kpi-link" onClick={() => { window.location.href = '/tasks'; }}>
                    <div className="dash-kpi-head">
                      <span className="dash-kpi-eyebrow">Tasks Available</span>
                      <span className="dash-kpi-ico"><ListTodo className="w-4 h-4" /></span>
                    </div>
                    <div className="dash-kpi-value">{tasks.length}</div>
                    <div className="dash-kpi-meta-row">
                      <span className="dash-kpi-meta">{selectedTasks.length} linked to this standup</span>
                    </div>
                  </div>
                  <div className="dash-kpi dash-kpi-orange dash-kpi-link" onClick={() => { window.location.href = '/teams'; }}>
                    <div className="dash-kpi-head">
                      <span className="dash-kpi-eyebrow">Workspaces</span>
                      <span className="dash-kpi-ico"><Building2 className="w-4 h-4" /></span>
                    </div>
                    <div className="dash-kpi-value">{companies.length}</div>
                    <div className="dash-kpi-meta-row">
                      <span className="dash-kpi-meta">where you post</span>
                    </div>
                  </div>
                  <div className="dash-kpi dash-kpi-purple dash-kpi-link" onClick={() => { window.location.href = '/settings#integrations'; }}>
                    <div className="dash-kpi-head">
                      <span className="dash-kpi-eyebrow">Channels</span>
                      <span className="dash-kpi-ico"><MessageSquare className="w-4 h-4" /></span>
                    </div>
                    <div className="dash-kpi-value">{channels.length}</div>
                    <div className="dash-kpi-meta-row">
                      <span className="dash-kpi-meta">connected for delivery</span>
                    </div>
                  </div>
                </div>
              </section>

              {/* History */}
              <section className="dash-section">
                <div className="dash-section-head">
                  <div className="dash-eyebrow">
                    <span className="dot" />
                    <b>History</b> · past standups
                  </div>
                  <span className="badge-count">{pastStandups.length} total</span>
                </div>

                {pastStandups.length === 0 ? (
                  <div className="workspace-card">
                    <div className="workspace-card-body">
                      <div className="dash-empty">
                        <div className="dash-empty-ico">
                          <History className="w-5 h-5" />
                        </div>
                        <p className="dash-empty-title">No standups logged yet</p>
                        <p className="dash-empty-sub">Submit your first daily standup above to build the habit.</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="std-timeline">
                    {groupedStandups.map((group) => (
                      <div key={group.label}>
                        <div className="feed-group-label">{group.label}</div>
                        {group.items.map((s, idx) => {
                          const channelName =
                            s.channelName || channels.find((ch) => ch._id === s.channelId)?.name;
                          const parsedDate = new Date(s.timestamp);
                          const timeLabel = isNaN(parsedDate.getTime())
                            ? 'Unknown time'
                            : parsedDate.toLocaleString(undefined, {
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true,
                              });
                          return (
                            <div key={`${s._id}-${idx}`} className="std-entry">
                              <div className="std-entry-head">
                                <div className="std-entry-host">
                                  <span className="std-avatar">{initials(s.author)}</span>
                                  <div className="min-w-0">
                                    <p className="std-entry-name">{s.author}</p>
                                    <p className="std-entry-time">{timeLabel}</p>
                                  </div>
                                </div>
                                {(s.channelId || s.companyId) && (
                                  <span className="std-chip">
                                    <MessageSquare className="w-3 h-3" />
                                    {channelName || 'Workspace'}
                                  </span>
                                )}
                              </div>
                              <div className="space-y-3">
                                {s.yesterday && (
                                  <div className="std-section">
                                    <span className="std-line-label std-line-y">Yesterday</span>
                                    <p className="std-line-body">{s.yesterday}</p>
                                  </div>
                                )}
                                {s.today && (
                                  <div className="std-section">
                                    <span className="std-line-label std-line-t">Today</span>
                                    <p className="std-line-body">{s.today}</p>
                                  </div>
                                )}
                                {s.blockers && (
                                  <div className="std-section">
                                    <span className="std-line-label std-line-b">Blockers</span>
                                    <p className="std-line-body">{s.blockers}</p>
                                  </div>
                                )}
                                {s.relatedTasks?.length > 0 && (
                                  <div className="std-section">
                                    <div className="flex flex-wrap gap-1.5">
                                      {s.relatedTasks.map((t) => {
                                        // normalizeStandup always yields { id, title };
                                        // older cached entries may only have the id.
                                        const title =
                                          t.title || tasks.find((task) => String(task.id || task._id) === t.id)?.title;
                                        return (
                                          <span key={t.id} className="std-chip">
                                            {title || 'Task'}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}