import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch } from '../lib/api';
import { Plus, X, Send, ChevronDown, ChevronRight, MessageSquare } from 'lucide-react';

const STATUS_STYLES = {
  open: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  'in-progress': 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  resolved: 'bg-green-500/20 text-green-400 border border-green-500/30',
  closed: 'bg-gray-500/20 text-gray-400 border border-gray-500/30',
};

const PRIORITY_STYLES = {
  low: 'text-gray-400',
  medium: 'text-yellow-400',
  high: 'text-orange-400',
  urgent: 'text-red-400',
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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-8 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-slate-900">New Support Ticket</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Subject *</label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-blue-500"
              placeholder="Brief summary of your issue"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Description *</label>
            <textarea
              required
              rows="5"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-blue-500 resize-none"
              placeholder="Describe your issue in detail..."
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-blue-500"
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
            className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
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
    <div className="bg-navy-light rounded-lg border border-gray-700 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-white/5 transition-colors"
      >
        <span className="text-gray-400 shrink-0">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <span className="font-medium text-white truncate">{ticket.subject}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[ticket.status] || STATUS_STYLES.open}`}>
              {ticket.status}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span className={PRIORITY_STYLES[ticket.priority] || ''}>{ticket.priority}</span>
            <span>{ticket.messages?.length || 0} messages</span>
            <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-700 px-5 py-4">
          {ticket.description && (
            <p className="text-sm text-gray-300 mb-4 whitespace-pre-wrap">{ticket.description}</p>
          )}

          <div className="space-y-3 max-h-80 overflow-y-auto mb-4">
            {ticket.messages?.length > 0 ? (
              ticket.messages.map((msg, i) => (
                <div
                  key={msg._id || i}
                  className={`p-3 rounded-lg text-sm ${msg.sender === 'user' || msg.sender === 'customer' ? 'bg-blue-500/10 ml-8' : 'bg-gray-700/50 mr-8'}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-gray-400">
                      {msg.sender === 'user' || msg.sender === 'customer' ? 'You' : 'Support'}
                    </span>
                    {msg.createdAt && (
                      <span className="text-xs text-gray-500">{new Date(msg.createdAt).toLocaleString()}</span>
                    )}
                  </div>
                  <p className="text-gray-200 whitespace-pre-wrap">{msg.content || msg.text}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 text-center py-2">No messages yet.</p>
            )}
          </div>

          {ticket.status !== 'closed' && (
            <div className="flex gap-2">
              <input
                type="text"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a reply..."
                className="flex-1 px-4 py-2 bg-navy border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-accent"
              />
              <button
                type="button"
                onClick={handleSendReply}
                disabled={sending || !reply.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
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

  return (
    <AuthGuard>
      <Head>
        <title>Support - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="min-h-screen bg-navy flex">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main flex-1 ml-64">
          <header className="workspace-header">
            <h1 className="text-xl font-bold">Support</h1>
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
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
              </div>
            )}

            {!loading && error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">
                {error}
                <button
                  type="button"
                  onClick={loadTickets}
                  className="ml-3 underline hover:text-red-300"
                >
                  Retry
                </button>
              </div>
            )}

            {!loading && !error && tickets.length === 0 && (
              <div className="text-center py-20">
                <MessageSquare className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-400 mb-2">No support tickets</h3>
                <p className="text-sm text-gray-500 mb-6">
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
            )}

            {!loading && !error && tickets.length > 0 && (
              <div className="space-y-3">
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
