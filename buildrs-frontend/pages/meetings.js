import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch } from '../lib/api';
import { Video, Plus, Clock, Calendar, Users, X, ChevronRight } from 'lucide-react';

const STATUS_COLORS = {
  scheduled: 'bg-blue-500/20 text-blue-400',
  ongoing: 'bg-green-500/20 text-green-400',
  completed: 'bg-gray-500/20 text-gray-400',
  cancelled: 'bg-red-500/20 text-red-400',
};

function formatScheduledAt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();

  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  if (isToday) return `Today • ${time}`;
  if (isTomorrow) return `Tomorrow • ${time}`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ` • ${time}`;
}

function MeetingCard({ meeting, onJoin }) {
  const isUpcoming = meeting.status === 'scheduled' || meeting.status === 'ongoing';

  return (
    <div className="workspace-card">
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-white truncate">{meeting.title}</h3>
            {meeting.description && (
              <p className="text-sm text-gray-400 mt-1 line-clamp-2">{meeting.description}</p>
            )}
          </div>
          <span className={`text-xs px-3 py-1 rounded-full whitespace-nowrap ml-3 ${STATUS_COLORS[meeting.status] || STATUS_COLORS.scheduled}`}>
            {meeting.status || 'scheduled'}
          </span>
        </div>

        <div className="flex items-center gap-4 text-sm text-gray-400 mb-3">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            <span>{formatScheduledAt(meeting.scheduledAt)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>{meeting.duration || 30} min</span>
          </div>
          {meeting.participants && meeting.participants.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              <span>{meeting.participants.length} participant{meeting.participants.length !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>

        {meeting.host && (
          <p className="text-xs text-gray-500 mb-3">Host: {meeting.host}</p>
        )}

        {isUpcoming && (
          <button
            type="button"
            onClick={() => onJoin(meeting)}
            className="cta-button px-4 py-2 rounded-lg text-white font-medium text-sm inline-flex items-center gap-2"
          >
            <Video className="w-4 h-4" />
            Join Meeting
            <ChevronRight className="w-4 h-4" />
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
      <div
        className="bg-navy-light rounded-xl border border-gray-700 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Schedule Meeting</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Title</label>
            <input
              type="text"
              name="title"
              value={form.title}
              onChange={handleChange}
              placeholder="e.g. Sprint Review"
              className="w-full bg-navy border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={3}
              placeholder="Meeting agenda..."
              className="w-full bg-navy border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Date &amp; Time</label>
            <input
              type="datetime-local"
              name="scheduledAt"
              value={form.scheduledAt}
              onChange={handleChange}
              className="w-full bg-navy border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Duration (minutes)</label>
            <select
              name="duration"
              value={form.duration}
              onChange={handleChange}
              className="w-full bg-navy border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>1 hour</option>
              <option value={90}>1.5 hours</option>
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-workspace btn-secondary flex-1 py-2 rounded-lg text-sm font-medium">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="cta-button flex-1 py-2 rounded-lg text-white font-medium text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Schedule
                </>
              )}
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

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await apiFetch('/api/company/my-companies');
      const list = res.companies || [];
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

  return (
    <AuthGuard>
      <Head>
        <title>Meetings - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="workspace-container">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main">
          <header className="workspace-header">
            <div className="flex items-center gap-6">
              <h1 className="text-xl font-bold">Meetings</h1>
              {companies.length > 1 && (
                <select
                  value={selectedCompany?._id || ''}
                  onChange={(e) => {
                    const company = companies.find((c) => c._id === e.target.value);
                    setSelectedCompany(company || null);
                  }}
                  className="bg-navy border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  {companies.map((c) => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                className="cta-button px-4 py-2 rounded-lg text-white font-medium inline-flex items-center gap-2"
                onClick={() => setShowCreateModal(true)}
                disabled={!selectedCompany}
              >
                <Plus className="w-4 h-4" />
                <span>Schedule Meeting</span>
              </button>
            </div>
          </header>

          <div className="workspace-content">
            {!selectedCompany ? (
              <div className="workspace-card">
                <div className="p-12 text-center">
                  <Video className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">No Company Found</h3>
                  <p className="text-gray-400 text-sm">
                    Create or join a company to start scheduling meetings.
                  </p>
                </div>
              </div>
            ) : loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="workspace-card animate-pulse">
                    <div className="p-4">
                      <div className="h-5 bg-gray-700 rounded w-2/3 mb-3" />
                      <div className="h-3 bg-gray-700 rounded w-1/2 mb-2" />
                      <div className="h-3 bg-gray-700 rounded w-1/3 mb-4" />
                      <div className="h-8 bg-gray-700 rounded w-28" />
                    </div>
                  </div>
                ))}
              </div>
            ) : meetings.length === 0 ? (
              <div className="workspace-card">
                <div className="p-12 text-center">
                  <Video className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">No Meetings Yet</h3>
                  <p className="text-gray-400 text-sm mb-4">
                    Schedule your first meeting to get started.
                  </p>
                  <button
                    type="button"
                    className="cta-button px-4 py-2 rounded-lg text-white font-medium text-sm inline-flex items-center gap-2"
                    onClick={() => setShowCreateModal(true)}
                  >
                    <Plus className="w-4 h-4" />
                    Schedule Meeting
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-gray-400">{meetings.length} meeting{meetings.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {meetings.map((meeting) => (
                    <MeetingCard key={meeting._id} meeting={meeting} onJoin={handleJoin} />
                  ))}
                </div>
              </>
            )}
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
