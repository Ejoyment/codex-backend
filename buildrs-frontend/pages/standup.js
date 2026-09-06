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
} from 'lucide-react';

function groupStandups(items) {
  const groups = [];
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const buckets = { Today: [], Yesterday: [], 'This Week': [], Earlier: [] };
  for (const item of items) {
    const date = new Date(item.timestamp);
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
  in_progress: 'In progress',
  in_review: 'In review',
  completed: 'Done',
};

export default function Standup() {
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);

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

        if (tasksRes.success) setTasks(tasksRes.tasks || []);
        if (companiesRes.success) {
          const comps = normalizeCompanies(companiesRes.companies);
          setCompanies(comps);
          if (comps.length > 0) setSelectedCompany(comps[0]._id);
        }

        const stored = JSON.parse(localStorage.getItem('pastStandups') || '[]');
        setPastStandups(stored);
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
    setSelectedTasks((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
    );
  }

  const todayCount = useMemo(
    () => pastStandups.filter((s) => new Date(s.timestamp).toDateString() === new Date().toDateString()).length,
    [pastStandups]
  );

  const groupedStandups = useMemo(() => groupStandups(pastStandups), [pastStandups]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!yesterday.trim() && !today.trim() && !blockers.trim()) {
      setError('Please fill in at least one field');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const standup = {
        _id: Date.now().toString(),
        yesterday: yesterday.trim(),
        today: today.trim(),
        blockers: blockers.trim(),
        relatedTasks: selectedTasks,
        channelId: selectedChannel,
        companyId: selectedCompany,
        timestamp: new Date().toISOString(),
        author: user?.fullName || user?.name || 'User',
      };

      await apiFetch('/api/standup', {
        method: 'POST',
        body: JSON.stringify(standup),
      }).catch(() => {});

      const updated = [standup, ...pastStandups];
      setPastStandups(updated);
      localStorage.setItem('pastStandups', JSON.stringify(updated));

      setYesterday('');
      setToday('');
      setBlockers('');
      setSelectedTasks([]);
      setSelectedChannel('');
      setSuccess('Standup submitted successfully!');
    } catch (err) {
      setError(err.message || 'Failed to submit standup');
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
                        <span className="std-note">
                          Submit with <span className="std-kbd">⌘</span><span className="std-kbd">↵</span>
                        </span>
                        <button
                          type="submit"
                          disabled={submitting}
                          className="btn-workspace btn-primary"
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
                              const checked = selectedTasks.includes(task._id);
                              return (
                                <div
                                  key={task._id}
                                  className={`std-task-row ${checked ? 'is-checked' : ''}`}
                                  onClick={() => toggleTask(task._id)}
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
                        {group.items.map((s) => {
                          const channelName = channels.find((ch) => ch._id === s.channelId)?.name;
                          return (
                            <div key={s._id} className="std-entry">
                              <div className="std-entry-head">
                                <div className="std-entry-host">
                                  <span className="std-avatar">{initials(s.author)}</span>
                                  <div className="min-w-0">
                                    <p className="std-entry-name">{s.author}</p>
                                    <p className="std-entry-time">
                                      {new Date(s.timestamp).toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })}
                                    </p>
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
                                      {s.relatedTasks.map((taskId) => {
                                        const task = tasks.find((t) => t._id === taskId);
                                        return (
                                          <span key={taskId} className="std-chip">
                                            {task?.title || 'Task'}
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