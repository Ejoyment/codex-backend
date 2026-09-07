import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch, normalizeCompanies } from '../lib/api';
import {
  Video,
  Plus,
  Clock,
  Calendar,
  Users,
  X,
  ChevronRight,
  Building2,
  Loader2,
  CalendarRange,
  UserCog,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

const STATUS_TINTS = {
  scheduled: { bg: 'rgba(47, 214, 230, 0.1)', text: '#2fd6e6', dot: '#2fd6e6' },
  ongoing: { bg: 'rgba(52, 211, 153, 0.12)', text: '#34d399', dot: '#34d399' },
  completed: { bg: 'rgba(154, 161, 174, 0.1)', text: '#9aa1ae', dot: '#6b7280' },
  cancelled: { bg: 'rgba(248, 113, 113, 0.1)', text: '#f87171', dot: '#f87171' },
};

function formatScheduledAt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();

  // Show full date + time so today/tomorrow labels don't mislead on schedule shifts
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  if (isToday) return `Today · ${time}`;
  if (isTomorrow) return `Tomorrow · ${time}`;
  return `${date} · ${time}`;
}

function MeetingCard({ meeting, onJoin }) {
  const isJoinable = meeting.status === 'scheduled' || meeting.status === 'ongoing';
  const tint = STATUS_TINTS[meeting.status] || STATUS_TINTS.scheduled;
  const hostName = typeof meeting.host === 'string'
    ? meeting.host
    : meeting.host?.fullName || meeting.host?.email || 'Host';

  return (
    <div className="mtg-card">
      <div className="mtg-card-top">
        <div className="flex-1 min-w-0">
          <div className="mtg-title-row mb-1">
            <h3 className="mtg-title">{meeting.title}</h3>
          </div>
          {meeting.description && (
            <p className="mtg-desc">{meeting.description}</p>
          )}
        </div>
        <span className="pill" style={{ background: tint.bg, color: tint.text }}>
          {meeting.status || 'scheduled'}
        </span>
      </div>

      <div className="mtg-meta">
        <span className="mtg-meta-item">
          <Calendar className="w-3.5 h-3.5" />
          {formatScheduledAt(meeting.scheduledAt)}
        </span>
        <span className="mtg-meta-item">
          <Clock className="w-3.5 h-3.5" />
          {meeting.duration || 30} min
        </span>
        {meeting.participants && meeting.participants.length > 0 && (
          <span className="mtg-meta-item">
            <Users className="w-3.5 h-3.5" />
            {meeting.participants.length} participant{meeting.participants.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <p className="mtg-host">Host — {hostName}</p>

      <div className="mtg-good">
        <div className="mtg-badge-row">
          {meeting.roomId ? (
            <span className="pill-mono pill" style={{ background: 'rgba(255,255,255,0.05)', color: '#9aa1ae' }}>
              room {meeting.roomId}
            </span>
          ) : (
            <span className="tier-badge">no room</span>
          )}
        </div>
        {isJoinable ? (
          <button type="button" onClick={() => onJoin(meeting)} className="join-btn">
            <Video className="w-3.5 h-3.5" />
            Join Meeting
          </button>
        ) : (
          <button type="button" className="mtg-joined">
            {meeting.status === 'cancelled' ? 'Cancelled' : 'Completed'}
          </button>
        )}
      </div>
    </div>
  );
}

function CreateMeetingModal({ onClose, onCreated, companyId }) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    scheduledAt: '',
    duration: 30,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: name === 'duration' ? Number(value) : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required'); return; }
    if (!form.scheduledAt) { setError('Date and time are required'); return; }

    try {
      setSubmitting(true);
      setError('');
      await apiFetch('/api/meetings', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          companyId,
          scheduledAt: new Date(form.scheduledAt).toISOString(),
        }),
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create meeting');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="ws-modal w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.09)]">
          <div className="flex items-center gap-2.5">
            <span className="card-ico">
              <Plus className="w-4 h-4" />
            </span>
            <h2 className="ws-modal-title">Schedule Meeting</h2>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          {error && (
            <div className="std-alert std-alert-error">
              <XCircle className="w-4 h-4 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div>
            <label className="ws-label">Title</label>
            <input
              type="text"
              name="title"
              value={form.title}
              onChange={handleChange}
              placeholder="e.g. Sprint Review"
              className="ws-input"
              autoFocus
            />
          </div>

          <div>
            <label className="ws-label">Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={3}
              placeholder="Meeting agenda..."
              className="ws-textarea"
            />
          </div>

          <div>
            <label className="ws-label">Date &amp; Time</label>
            <input
              type="datetime-local"
              name="scheduledAt"
              value={form.scheduledAt}
              onChange={handleChange}
              className="ws-input"
            />
          </div>

          <div>
            <label className="ws-label">Duration (minutes)</label>
            <select
              name="duration"
              value={form.duration}
              onChange={handleChange}
              className="ws-select"
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>1 hour</option>
              <option value={90}>1.5 hours</option>
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-workspace btn-secondary flex-1">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-workspace btn-primary flex-1"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {submitting ? 'Scheduling...' : 'Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Meetings() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);

  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () => {
      setClock(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await apiFetch('/api/company/my-companies');
      const list = normalizeCompanies(res.companies);
      setCompanies(list);
      if (list.length > 0) setSelectedCompany(list[0]);
      return list;
    } catch (err) {
      console.error('Failed to fetch companies:', err);
      setCompanies([]);
      return [];
    }
  }, []);

  const fetchMeetings = useCallback(async (companyId) => {
    if (!companyId) { setMeetings([]); setLoading(false); return; }
    try {
      setLoading(true);
      const res = await apiFetch(`/api/meetings?companyId=${companyId}`);
      setMeetings(res.meetings || []);
    } catch (err) {
      console.error('Failed to fetch meetings:', err);
      setMeetings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompanies().then((list) => {
      if (list.length > 0) fetchMeetings(list[0]._id);
    });
  }, [fetchCompanies, fetchMeetings]);

  useEffect(() => {
    if (selectedCompany) fetchMeetings(selectedCompany._id);
  }, [selectedCompany, fetchMeetings]);

  const handleJoin = (meeting) => {
    router.push(`/meeting-room?roomId=${meeting.roomId || meeting._id}`);
  };

  const handleMeetingCreated = () => {
    if (selectedCompany) fetchMeetings(selectedCompany._id);
  };

  const liveMeetings = meetings.filter((m) => m.status === 'ongoing').length;
  const scheduledCount = meetings.filter((m) => m.status === 'scheduled').length;
  const completedCount = meetings.filter((m) => m.status === 'completed').length;
  const cancelledCount = meetings.filter((m) => m.status === 'cancelled').length;

  const kpis = [
    { label: 'Total Meetings', value: meetings.length, sub: 'in this workspace', color: 'blue', Icon: CalendarRange },
    { label: 'Upcoming', value: scheduledCount, sub: 'scheduled ahead', color: 'green', Icon: Calendar },
    { label: 'In Progress', value: liveMeetings, sub: 'happening now', color: 'orange', Icon: Video },
    { label: 'Completed', value: completedCount, sub: 'wrapped up', color: 'purple', Icon: CheckCircle2 },
  ];

  return (
    <AuthGuard>
      <Head>
        <title>Meetings - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="workspace-container">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main">
          <header className="workspace-header dash-header">
            <div>
              <p className="dash-crumb">
                BuildrsHQ <span className="sep">/</span> Meetings
              </p>
              <h1 className="dash-title">Meetings</h1>
              <div className="dash-statusline">
                <span className="status-indicator status-online" />
                <span>{loading ? 'Loading...' : `${meetings.length} meetings`}</span>
                <span className="dash-clock">· {clock || '—:——:——'}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {companies.length > 1 && (
                <div className="mtg-scope">
                  <span className="mtg-scope-ico"><Building2 className="w-4 h-4" /></span>
                  <select
                    value={selectedCompany?._id || ''}
                    onChange={(e) => {
                      const company = companies.find((c) => c._id === e.target.value);
                      setSelectedCompany(company || null);
                    }}
                  >
                    {companies.map((c) => (
                      <option key={c._id} value={c._id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <button
                type="button"
                className="btn-workspace btn-primary"
                onClick={() => setShowCreateModal(true)}
                disabled={!selectedCompany}
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Schedule Meeting</span>
              </button>
            </div>
          </header>

          <div className="workspace-content">
            <div className="mtg-content">
              {!selectedCompany ? (
                <div className="workspace-card">
                  <div className="workspace-card-body">
                    <div className="dash-empty">
                      <div className="dash-empty-ico">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <p className="dash-empty-title">No Company Found</p>
                      <p className="dash-empty-sub">
                        Create or join a company to start scheduling meetings.
                      </p>
                    </div>
                  </div>
                </div>
              ) : loading ? (
                <div className="workspace-card">
                  <div className="workspace-card-body">
                    <div className="dash-empty">
                      <div className="dash-empty-ico">
                        <Loader2 className="w-5 h-5 animate-spin" />
                      </div>
                      <p className="dash-empty-title">Loading meetings...</p>
                    </div>
                  </div>
                </div>
              ) : meetings.length === 0 ? (
                <div className="workspace-card">
                  <div className="workspace-card-body">
                    <div className="dash-empty">
                      <div className="dash-empty-ico">
                        <Calendar className="w-5 h-5" />
                      </div>
                      <p className="dash-empty-title">No Meetings Yet</p>
                      <p className="dash-empty-sub">
                        Schedule your first meeting to get started.
                      </p>
                      <button
                        type="button"
                        className="btn-workspace btn-primary mt-4"
                        onClick={() => setShowCreateModal(true)}
                      >
                        <Plus className="w-4 h-4" />
                        Schedule Meeting
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <section className="dash-section">
                    <div className="dash-section-head">
                      <div className="dash-eyebrow">
                        <span className="dot" />
                        <b>Calendar</b> · {selectedCompany.name}
                      </div>
                      <span className="badge-count">{meetings.length} meetings</span>
                    </div>
                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                      {kpis.map((kpi) => (
                        <div key={kpi.label} className={`dash-kpi dash-kpi-${kpi.color} ${kpi.label === 'In Progress' ? 'dash-kpi-link' : ''}`} onClick={kpi.label === 'In Progress' ? () => handleJoin(meetings.find((m) => m.status === 'ongoing')) : undefined}>
                          <div className="dash-kpi-head">
                            <span className="dash-kpi-eyebrow">{kpi.label}</span>
                            <span className="dash-kpi-ico"><kpi.Icon className="w-4 h-4" /></span>
                          </div>
                          <div className="dash-kpi-value">{kpi.value}</div>
                          <div className="dash-kpi-meta-row">
                            <span className="dash-kpi-meta">{kpi.sub}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="dash-section">
                    <div className="dash-section-head">
                      <div className="dash-eyebrow">
                        <span className="dot" />
                        <b>Schedule</b> · upcoming & past
                      </div>
                      <span className="dash-action" onClick={() => setShowCreateModal(true)}>
                        New meeting
                        <Plus className="w-3.5 h-3.5" />
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {meetings.map((meeting) => (
                        <MeetingCard key={meeting._id} meeting={meeting} onJoin={handleJoin} />
                      ))}
                    </div>
                  </section>
                </>
              )}
            </div>
          </div>
        </main>
      </div>

      {showCreateModal && selectedCompany && (
        <CreateMeetingModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleMeetingCreated}
          companyId={selectedCompany._id}
        />
      )}
    </AuthGuard>
  );
}