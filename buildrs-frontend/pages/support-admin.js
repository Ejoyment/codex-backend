import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch } from '../lib/api';
import { MessageSquare, User, RefreshCw, Send } from 'lucide-react';

const STATUS_OPTIONS = ['open', 'in_progress', 'resolved', 'closed'];
const STATUS_COLORS = {
  open: 'bg-yellow-500/20 text-yellow-400',
  in_progress: 'bg-blue-500/20 text-blue-400',
  resolved: 'bg-green-500/20 text-green-400',
  closed: 'bg-gray-500/20 text-gray-400',
};
const PRIORITY_COLORS = {
  low: 'bg-gray-500/20 text-gray-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  high: 'bg-orange-500/20 text-orange-400',
  urgent: 'bg-red-500/20 text-red-400',
};

export default function SupportAdmin() {
  const user = useAuthStore((s) => s.user);
  const [agent, setAgent] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [replyContent, setReplyContent] = useState('');
  const [sending, setSending] = useState(false);

  const loadTickets = useCallback(async () => {
    const token = getAgentToken();
    if (!token) {
      setTickets([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await agentFetch('/api/support/agent/tickets');
      // Backend returns array directly for agent tickets
      const ticketsArray = Array.isArray(data) ? data : data.tickets || [];
      setTickets(ticketsArray);
    } catch (e) {
      console.error('Failed to load tickets', e);
      // Fallback to user tickets endpoint if agent endpoint fails
      try {
        const fallback = await apiFetch('/api/support/tickets');
        const ticketsArray = Array.isArray(fallback) ? fallback : fallback.tickets || [];
        setTickets(ticketsArray);
      } catch (err) {
        setTickets([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('supportAgent') : null;
    if (saved) {
      try {
        setAgent(JSON.parse(saved));
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (agent) loadTickets();
  }, [agent, loadTickets]);

  const getAgentToken = () => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('supportAgentToken');
  };

  const agentFetch = async (path, options = {}) => {
    const token = getAgentToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    };
    const res = await fetch(`https://codex-backend-7utu.onrender.com${path}`, {
      ...options,
      headers,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(data.error || data.message || 'API request failed');
      error.status = res.status;
      error.data = data;
      throw error;
    }
    return data;
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    try {
      const data = await apiFetch('/api/support/agent/login', {
        method: 'POST',
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      setAgent(data.agent);
      localStorage.setItem('supportAgent', JSON.stringify(data.agent));
      if (data.token) {
        localStorage.setItem('supportAgentToken', data.token);
      }
      setShowLogin(false);
      loadTickets();
    } catch (err) {
      setLoginError(err.message || 'Login failed');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      const token = getAgentToken();
      if (token) {
        await agentFetch('/api/support/agent/logout', { method: 'POST' }).catch(() => {});
      }
    } catch {}
    setAgent(null);
    localStorage.removeItem('supportAgent');
    localStorage.removeItem('supportAgentToken');
  };

  const handleStatusChange = async (ticketId, status) => {
    try {
      await agentFetch(`/api/support/agent/tickets/${ticketId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      setTickets((prev) => prev.map((t) => (t.ticketId === ticketId || t._id === ticketId ? { ...t, status } : t)));
    } catch (e) {
      alert('Failed to update status');
    }
  };

  const handleAssign = async (ticketId) => {
    if (!agent) return;
    try {
      await agentFetch(`/api/support/agent/tickets/${ticketId}/assign`, {
        method: 'PUT',
      });
      setTickets((prev) => prev.map((t) => (t.ticketId === ticketId || t._id === ticketId ? { ...t, assignedTo: agent.id, status: 'in-progress' } : t)));
    } catch (e) {
      alert('Failed to assign ticket');
    }
  };

  const handleSendReply = async (ticketId) => {
    if (!replyContent.trim()) return;
    setSending(true);
    try {
      await agentFetch(`/api/support/tickets/${ticketId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: replyContent }),
      });
      setReplyContent('');
      loadTickets();
    } catch (e) {
      // Fallback to user endpoint if agent endpoint fails
      try {
        await apiFetch(`/api/support/tickets/${ticketId}/messages`, {
          method: 'POST',
          body: JSON.stringify({ content: replyContent }),
        });
        setReplyContent('');
        loadTickets();
      } catch (err) {
        alert('Failed to send reply');
      }
    } finally {
      setSending(false);
    }
  };

  const filtered = statusFilter === 'all' ? tickets : tickets.filter((t) => t.status === statusFilter);
  const counts = {
    total: tickets.length,
    open: tickets.filter((t) => t.status === 'open').length,
    in_progress: tickets.filter((t) => t.status === 'in_progress').length,
    resolved: tickets.filter((t) => t.status === 'resolved').length,
  };

  return (
    <AuthGuard>
      <Head>
        <title>Support Admin - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="min-h-screen bg-navy flex">
        <Sidebar user={user} subscription={null} />

        <main className="workspace-main flex-1 ml-64">
          <header className="workspace-header">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold">Support Admin</h1>
              {agent && (
                <span className="text-sm text-gray-400">
                  <User className="w-4 h-4 inline mr-1" />
                  {agent.name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {agent ? (
                <button type="button" className="btn-workspace btn-secondary text-sm" onClick={handleLogout}>
                  Logout
                </button>
              ) : (
                <button type="button" className="cta-button px-4 py-2 rounded-lg text-white text-sm font-medium" onClick={() => setShowLogin(true)}>
                  Agent Login
                </button>
              )}
              <button type="button" className="btn-workspace btn-secondary" onClick={loadTickets} title="Refresh">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </header>

          <div className="p-6">
            {showLogin && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                <div className="bg-navy-light border border-gray-700 rounded-xl p-8 w-full max-w-md">
                  <h2 className="text-lg font-bold mb-4">Agent Login</h2>
                  {loginError && <p className="text-red-400 text-sm mb-4">{loginError}</p>}
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Email</label>
                      <input
                        type="email"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className="w-full px-4 py-2 bg-navy border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-accent"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Password</label>
                      <input
                        type="password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="w-full px-4 py-2 bg-navy border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-accent"
                        required
                      />
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button type="submit" disabled={loginLoading} className="cta-button px-4 py-2 rounded-lg text-white font-medium disabled:opacity-50">
                        {loginLoading ? 'Logging in...' : 'Login'}
                      </button>
                      <button type="button" className="btn-workspace btn-secondary px-4 py-2" onClick={() => setShowLogin(false)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {agent ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="workspace-card">
                    <div className="p-4 text-center">
                      <div className="text-2xl font-bold">{counts.total}</div>
                      <div className="text-sm text-gray-400">Total Tickets</div>
                    </div>
                  </div>
                  <div className="workspace-card">
                    <div className="p-4 text-center">
                      <div className="text-2xl font-bold text-yellow-400">{counts.open}</div>
                      <div className="text-sm text-gray-400">Open</div>
                    </div>
                  </div>
                  <div className="workspace-card">
                    <div className="p-4 text-center">
                      <div className="text-2xl font-bold text-blue-400">{counts.in_progress}</div>
                      <div className="text-sm text-gray-400">In Progress</div>
                    </div>
                  </div>
                  <div className="workspace-card">
                    <div className="p-4 text-center">
                      <div className="text-2xl font-bold text-green-400">{counts.resolved}</div>
                      <div className="text-sm text-gray-400">Resolved</div>
                    </div>
                  </div>
                </div>

                <div className="workspace-card mb-6">
                  <div className="workspace-card-header">
                    <div className="flex gap-2 flex-wrap">
                      {['all', ...STATUS_OPTIONS].map((s) => (
                        <button
                          key={s}
                          type="button"
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                            statusFilter === s
                              ? 'bg-blue-accent text-white'
                              : 'bg-navy text-gray-400 hover:text-white hover:bg-navy-light border border-gray-700'
                          }`}
                          onClick={() => setStatusFilter(s)}
                        >
                          {s === 'all' ? 'All' : s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                          <span className="ml-1 text-xs opacity-60">
                            {s === 'all' ? counts.total : counts[s] || 0}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {loading ? (
                  <div className="text-center py-12 text-gray-400">Loading tickets...</div>
                ) : filtered.length === 0 ? (
                  <div className="workspace-card">
                    <div className="p-12 text-center text-gray-400">
                      <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-30" />
                      <p className="text-lg font-medium mb-1">No tickets found</p>
                      <p className="text-sm">No support tickets match your filter.</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filtered.map((ticket) => {
                      const expanded = expandedId === ticket._id;
                      return (
                        <div key={ticket._id} className="workspace-card">
                          <button
                            type="button"
                            className="w-full text-left p-4 flex items-center gap-4 hover:bg-white/[0.02] transition"
                            onClick={() => setExpandedId(expanded ? null : ticket._id)}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-1">
                                <span className="font-semibold text-white truncate">{ticket.subject}</span>
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[ticket.status] || ''}`}>
                                  {ticket.status?.replace('_', ' ')}
                                </span>
                                {ticket.priority && (
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_COLORS[ticket.priority] || ''}`}>
                                    {ticket.priority}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-400 truncate">{ticket.description}</p>
                              <p className="text-xs text-gray-500 mt-1">
                                {ticket.createdAt ? new Date(ticket.createdAt).toLocaleString() : ''}
                                {ticket.assignedTo && <span className="ml-2">· Assigned: {ticket.assignedTo}</span>}
                              </p>
                            </div>
                          </button>

                          {expanded && (
                            <div className="border-t border-gray-700 p-4 space-y-4">
                              <div className="flex flex-wrap gap-3 items-center">
                                <label className="text-sm text-gray-400">Status:</label>
                                <select
                                  value={ticket.status}
                                  onChange={(e) => handleStatusChange(ticket._id, e.target.value)}
                                  className="bg-navy border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-accent"
                                >
                                  {STATUS_OPTIONS.map((s) => (
                                    <option key={s} value={s}>
                                      {s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  className="btn-workspace btn-secondary text-sm"
                                  onClick={() => handleAssign(ticket._id)}
                                >
                                  Assign to me
                                </button>
                              </div>

                              <div className="space-y-3 max-h-80 overflow-y-auto">
                                {ticket.messages?.length > 0 ? (
                                  ticket.messages.map((msg, i) => (
                                    <div key={i} className="bg-navy rounded-lg p-3 border border-gray-700">
                                      <p className="text-xs text-gray-500 mb-1">
                                        {msg.sender || 'User'} · {msg.createdAt ? new Date(msg.createdAt).toLocaleString() : ''}
                                      </p>
                                      <p className="text-sm text-gray-200">{msg.content}</p>
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-sm text-gray-500 italic">No messages yet.</p>
                                )}
                              </div>

                              <div className="flex gap-2">
                                <input
                                  value={expandedId === ticket._id ? replyContent : ''}
                                  onChange={(e) => {
                                    if (expandedId === ticket._id) setReplyContent(e.target.value);
                                  }}
                                  placeholder="Type a reply..."
                                  className="flex-1 px-4 py-2 bg-navy border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-accent"
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                      e.preventDefault();
                                      handleSendReply(ticket._id);
                                    }
                                  }}
                                />
                                <button
                                  type="button"
                                  disabled={sending || !replyContent.trim()}
                                  className="cta-button px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                                  onClick={() => handleSendReply(ticket._id)}
                                >
                                  <Send className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="workspace-card">
                <div className="p-12 text-center text-gray-400">
                  <User className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p className="text-lg font-medium mb-1">Agent authentication required</p>
                  <p className="text-sm mb-4">Login with your support agent credentials to access the dashboard.</p>
                  <button
                    type="button"
                    className="cta-button px-6 py-2 rounded-lg text-white font-medium"
                    onClick={() => setShowLogin(true)}
                  >
                    Login as Agent
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
