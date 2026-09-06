import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch } from '../lib/api';
import { Plus, X, Send, ChevronDown, ChevronRight, MessageSquare, Loader2 } from 'lucide-react';

const STATUS_TINTS = {
  open: { bg: 'rgba(47,214,230,0.12)', text: '#2fd6e6' },
  'in-progress': { bg: 'rgba(229,184,74,0.12)', text: '#e5b84a' },
  resolved: { bg: 'rgba(52,211,153,0.12)', text: '#34d399' },
  closed: { bg: 'rgba(154,161,174,0.1)', text: '#9aa1ae' },
};

const PRIORITY_TINTS = {
  low: '#9aa1ae',
  medium: '#2fd6e6',
  high: '#e5b84a',
  urgent: '#f87171',
};

function CreateTicketModal({ onClose, onCreated }) {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await apiFetch('/api/support/tickets', {
        method: 'POST',
        body: JSON.stringify({ subject: subject.trim(), description: description.trim(), priority }),
      });
      if (result.success !== false) {
        onCreated?.(result.ticket);
        onClose();
      } else {
        setError(result.message || 'Failed to create ticket');
      }
    } catch (err) {
      setError(err.message || 'Failed to create ticket');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] p-4" onClick={onClose}>
      <div className="ws-modal p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <span className="card-ico">
              <MessageSquare className="w-4 h-4" />
            </span>
            <h3 className="ws-modal-title">New Support Ticket</h3>
          </div>
          <button type="button" onClick={onClose} className="text-[#565d6b] hover:text-[#eceef1]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && <div className="std-alert std-alert-error mb-4">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="ws-label">Subject *</label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="ws-input"
              placeholder="Brief summary of your issue"
            />
          </div>

          <div className="mb-4">
            <label className="ws-label">Description *</label>
            <textarea
              required
              rows="5"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="ws-input resize-none"
              placeholder="Describe your issue in detail..."
            />
          </div>

          <div className="mb-6">
            <label className="ws-label">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="ws-select"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={submitting || !subject.trim() || !description.trim()}
            className="btn-workspace btn-primary w-full justify-center"
          >
            {submitting ? 'Creating...' : 'Create Ticket'}
          </button>
        </form>
      </div>
    </div>
  );
}

function TicketCard({ ticket, onReply }) {
  const [expanded, setExpanded] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const statusTint = STATUS_TINTS[ticket.status] || STATUS_TINTS.open;
  const priorityColor = PRIORITY_TINTS[ticket.priority] || '#9aa1ae';

  const handleSendReply = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await onReply(ticket._id, reply.trim());
      setReply('');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendReply();
    }
  };

  return (
    <div className="sup-card">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="sup-head-toggle"
      >
        <span className="sup-chev">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="sup-subject-row">
            <span className="sup-subject">{ticket.subject}</span>
            <span className="pill flex-shrink-0" style={{ background: statusTint.bg, color: statusTint.text }}>
              {ticket.status}
            </span>
          </div>
          <div className="sup-meta-row">
            <span className="sup-prio" style={{ color: priorityColor }}>{ticket.priority}</span>
            <span>{ticket.messages?.length || 0} message{(ticket.messages?.length || 0) !== 1 && 's'}</span>
            <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="sup-body">
          {ticket.description && (
            <p className="sup-desc">{ticket.description}</p>
          )}

          <div className="sup-thread">
            {ticket.messages?.length > 0 ? (
              ticket.messages.map((msg, i) => {
                const isUser = msg.sender === 'user' || msg.sender === 'customer';
                return (
                  <div key={msg._id || i} className={`sup-bubble ${isUser ? 'is-user' : 'is-support'}`}>
                    <div className="sup-bubble-head">
                      <b>{isUser ? 'You' : 'Support'}</b>
                      {msg.createdAt && (
                        <span>{new Date(msg.createdAt).toLocaleString()}</span>
                      )}
                    </div>
                    <p className="sup-bubble-text">{msg.content || msg.text}</p>
                  </div>
                );
              })
            ) : (
              <p className="sup-thread-empty">No messages yet.</p>
            )}
          </div>

          {ticket.status !== 'closed' && (
            <div className="sup-composer">
              <input
                type="text"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a reply..."
                className="ws-input flex-1"
              />
              <button
                type="button"
                onClick={handleSendReply}
                disabled={sending || !reply.trim()}
                className="btn-workspace btn-primary text-xs flex items-center gap-2"
              >
                <Send className="w-3 h-3" />
                {sending ? 'Sending...' : 'Send'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Support() {
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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

  const loadTickets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const userId = user?._id || user?.id;
      const result = await apiFetch(`/api/support/tickets?userId=${userId}`);
      if (result.success !== false) {
        setTickets(result.tickets || []);
      }
    } catch (err) {
      setError(err.message || 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const handleTicketCreated = (ticket) => {
    setTickets((prev) => [ticket, ...prev]);
  };

  const handleReply = async (ticketId, content) => {
    const result = await apiFetch(`/api/support/tickets/${ticketId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    if (result.success !== false && result.message) {
      setTickets((prev) =>
        prev.map((t) =>
          t._id === ticketId
            ? { ...t, messages: [...(t.messages || []), result.message] }
            : t
        )
      );
    }
  };

  const openCount = tickets.filter((t) => t.status === 'open' || t.status === 'in-progress').length;

  return (
    <AuthGuard>
      <Head>
        <title>Support - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="workspace-container">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main">
          <header className="workspace-header dash-header">
            <div>
              <p className="dash-crumb">
                BuildrsHQ <span className="sep">/</span> Support
              </p>
              <h1 className="dash-title">Support</h1>
              <div className="dash-statusline">
                <span className="status-indicator status-online" />
                <span>
                  {tickets.length ? `${openCount} open · ${tickets.length} total` : 'Help center'}
                </span>
                <span className="dash-clock">· {clock || '—:——:——'}</span>
              </div>
            </div>
            <button
              type="button"
              className="btn-workspace btn-primary"
              onClick={() => setShowCreateModal(true)}
            >
              <Plus className="w-4 h-4" />
              <span>New Ticket</span>
            </button>
          </header>

          <div className="workspace-content">
            {loading && (
              <div className="dash-empty" style={{ paddingTop: '4rem' }}>
                <div className="dash-empty-ico">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
                <p className="dash-empty-title">Loading tickets...</p>
              </div>
            )}

            {!loading && error && (
              <div className="std-alert std-alert-error flex items-center justify-between flex-wrap gap-2">
                <span>{error}</span>
                <button type="button" onClick={loadTickets} className="sup-retry">
                  Retry
                </button>
              </div>
            )}

            {!loading && !error && tickets.length === 0 && (
              <div className="workspace-card">
                <div className="workspace-card-body flex flex-col items-center justify-center py-16 text-center">
                  <div className="dash-empty-ico">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <p className="dash-empty-title" style={{ fontSize: '1.05rem', marginBottom: '0.4rem' }}>
                    No support tickets
                  </p>
                  <p className="dash-empty-sub" style={{ maxWidth: '26rem', lineHeight: '1.5', marginBottom: '1.5rem' }}>
                    Create a ticket and we&apos;ll get back to you as soon as possible.
                  </p>
                  <button
                    type="button"
                    className="btn-workspace btn-primary"
                    onClick={() => setShowCreateModal(true)}
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create Your First Ticket</span>
                  </button>
                </div>
              </div>
            )}

            {!loading && !error && tickets.length > 0 && (
              <div className="sup-list">
                {tickets.map((ticket) => (
                  <TicketCard key={ticket._id} ticket={ticket} onReply={handleReply} />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {showCreateModal && (
        <CreateTicketModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleTicketCreated}
        />
      )}
    </AuthGuard>
  );
}