import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch } from '../lib/api';
import { useCurrentCompany, NoWorkspaceEmptyState } from '../hooks/useCurrentCompany';
import { getTierLimits, normalizeTier } from '../lib/tier';
import { getAvatarUrl } from '../lib/utils';
import { MessageSquare, Plus, Send, Hash, X, Building2, Loader2, ArrowUpRight } from 'lucide-react';

export default function Messaging() {
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);
  const router = useRouter();
  const { hasCompany, loading: companyLoading, companies: hookCompanies } = useCurrentCompany();
  const tierLimits = getTierLimits(normalizeTier(subscription?.tier));
  const canUseChat = tierLimits.features.teamChat;

  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDesc, setNewChannelDesc] = useState('');
  // The API stores public/private/direct/announcement; 'group' was the old
  // value here and never passed schema validation, so every create 500'd.
  const [newChannelType, setNewChannelType] = useState('public');
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [createChannelError, setCreateChannelError] = useState('');
  const [sendError, setSendError] = useState('');
  const [clock, setClock] = useState('');
  // Both the channel list and channel creation are scoped to the caller's
  // current company; resolve it once instead of re-fetching on every action.
  const [companyId, setCompanyId] = useState('');
  const [companyResolved, setCompanyResolved] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (companyId) {
      loadChannels(companyId);
    } else if (companyResolved) {
      setLoadingChannels(false);
      setChannels([]);
    }
  }, [companyId, companyResolved]);

  useEffect(() => {
    if (selectedChannel) {
      loadMessages(selectedChannel._id);
    }
  }, [selectedChannel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const tick = () => {
      setClock(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const companies = await apiFetch('/api/company/my-companies');
        const id = companies.companies?.[0]?._id || '';
        if (!cancelled) {
          setCompanyId(id);
          setCompanyResolved(true);
        }
      } catch (err) {
        console.error('Failed to resolve company:', err);
        if (!cancelled) setCompanyResolved(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function loadChannels(company) {
    try {
      setLoadingChannels(true);
      const data = await apiFetch(`/api/messaging/channels?companyId=${company}`);
      setChannels(data.channels || []);
    } catch (err) {
      console.error('Failed to load channels:', err);
      setChannels([]);
    } finally {
      setLoadingChannels(false);
    }
  }

  async function loadMessages(channelId) {
    try {
      setLoadingMessages(true);
      const data = await apiFetch(`/api/messaging/messages?channelId=${channelId}&limit=50`);
      setMessages(data.messages || []);
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  }

  // Announcement channels are read-only for everyone but channel admins.
  const isReadOnlyChannel =
    selectedChannel?.type === 'announcement' &&
    !(selectedChannel.members || []).some(
      (m) => String(m.user?._id || m.user) === String(user?._id || user?.id) && m.role === 'admin'
    );

  async function handleSendMessage(e) {
    e.preventDefault();
    if (!newMessage.trim() || !selectedChannel) return;
    if (isReadOnlyChannel) {
      setSendError('Only channel admins can post in announcement channels.');
      return;
    }
    try {
      setSendError('');
      const data = await apiFetch('/api/messaging/messages', {
        method: 'POST',
        body: JSON.stringify({
          content: newMessage.trim(),
          channelId: selectedChannel._id,
          companyId,
        }),
      });
      setMessages((prev) => [...prev, data.message]);
      setNewMessage('');
    } catch (err) {
      console.error('Failed to send message:', err);
      setSendError(err?.message || 'Could not send message.');
    }
  }

  async function handleCreateChannel(e) {
    e.preventDefault();
    if (!newChannelName.trim() || creatingChannel) return;
    if (!companyId) {
      setCreateChannelError('No workspace found. Create or join a workspace first.');
      return;
    }
    try {
      setCreatingChannel(true);
      setCreateChannelError('');
      const data = await apiFetch('/api/messaging/channels', {
        method: 'POST',
        body: JSON.stringify({
          name: newChannelName.trim(),
          description: newChannelDesc.trim(),
          companyId,
          type: newChannelType,
        }),
      });
      setChannels((prev) => [...prev, data.channel]);
      setShowCreateModal(false);
      setNewChannelName('');
      setNewChannelDesc('');
      setNewChannelType('public');
    } catch (err) {
      console.error('Failed to create channel:', err);
      // Surface it: previously the failure was console-only, so the modal sat
      // there looking like the button did nothing.
      setCreateChannelError(err?.message || 'Could not create channel.');
    } finally {
      setCreatingChannel(false);
    }
  }

  function formatTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function senderName(msg) {
    if (typeof msg.sender === 'object') {
      return msg.sender.fullName || msg.sender.name || 'Unknown';
    }
    return 'Unknown';
  }

  function senderAvatar(msg) {
    if (typeof msg.sender === 'object') {
      return getAvatarUrl(msg.sender, msg.sender?.fullName || msg.sender?.name || 'U');
    }
    return `https://ui-avatars.com/api/?name=U&background=3b82f6&color=fff&size=32`;
  }

  return (
    <AuthGuard>
      <Head>
        <title>Messaging - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="workspace-container">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main">
          <header className="workspace-header dash-header">
            <div>
              <p className="dash-crumb">
                BuildrsHQ <span className="sep">/</span> Messaging
              </p>
              <h1 className="dash-title">Team Messaging</h1>
              <div className="dash-statusline">
                <span className="status-indicator status-online" />
                <span>{selectedChannel ? `#${selectedChannel.name}` : 'Channels'}</span>
                <span className="dash-clock">· {clock || '—:——:——'}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="dash-pill hidden md:inline-flex">
                <Hash className="w-3 h-3" style={{ color: '#2fd6e6' }} />
                {channels.length} channel{channels.length === 1 ? '' : 's'}
              </span>
              <button type="button" className="btn-workspace btn-primary" onClick={() => setShowCreateModal(true)}>
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New Channel</span>
              </button>
            </div>
          </header>

          <div className="workspace-content">
            {companyLoading ? (
              <div className="dash-empty" style={{ paddingTop: '4rem' }}>
                <div className="dash-empty-ico">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
                <p className="dash-empty-title">Loading workspace...</p>
              </div>
            ) : !hasCompany ? (
              <NoWorkspaceEmptyState onCreateClick={() => router.push('/teams')} />
            ) : !canUseChat ? (
              <div className="dash-empty" style={{ paddingTop: '4rem' }}>
                <div className="dash-empty-ico" style={{ background: 'rgba(229,184,74,0.1)', borderColor: 'rgba(229,184,74,0.2)' }}>
                  <MessageSquare className="w-5 h-5" style={{ color: '#e5b84a' }} />
                </div>
                <p className="dash-empty-title" style={{ fontSize: '1.05rem', marginBottom: '0.4rem' }}>
                  Team Chat requires a paid plan
                </p>
                <p className="dash-empty-sub" style={{ maxWidth: '26rem', lineHeight: '1.5', marginBottom: '1.5rem' }}>
                  Upgrade to unlock messaging, channels, and team chat for your workspace.
                </p>
                <button onClick={() => router.push('/pricing')} className="btn-workspace btn-primary">
                  Upgrade to Pro
                  <ArrowUpRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="msg-shell">
                {/* Channel rail */}
                <aside className="msg-rail">
                  <div className="msg-rail-head">
                    <span className="msg-rail-title">
                      <Hash className="w-4 h-4" style={{ color: '#2fd6e6' }} />
                      Channels
                    </span>
                    <span className="badge-count">{channels.length}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                    {loadingChannels && (
                      <div className="dash-empty">
                        <div className="dash-empty-ico">
                          <Loader2 className="w-5 h-5 animate-spin" />
                        </div>
                        <p className="dash-empty-title">Loading channels...</p>
                      </div>
                    )}
                    {!loadingChannels && channels.length === 0 && (
                      <div className="dash-empty">
                        <div className="dash-empty-ico">
                          <Hash className="w-5 h-5" />
                        </div>
                        <p className="dash-empty-title">No channels yet</p>
                        <p className="dash-empty-sub">Create one to start chatting.</p>
                      </div>
                    )}
                    {channels.map((ch) => (
                      <button
                        key={ch._id}
                        type="button"
                        onClick={() => setSelectedChannel(ch)}
                        className={`msg-channel ${selectedChannel?._id === ch._id ? 'is-active' : ''}`}
                      >
                        <span className="msg-chan-hash">
                          <Hash className="w-3.5 h-3.5" />
                        </span>
                        <span className="msg-chan-main">
                          <span className="msg-chan-name">{ch.name}</span>
                          {ch.description && <span className="msg-chan-desc">{ch.description}</span>}
                        </span>
                        <span className="msg-chan-type">{ch.type || 'group'}</span>
                      </button>
                    ))}
                  </div>
                </aside>

                {/* Conversation */}
                <div className="msg-conv">
                  {!selectedChannel ? (
                    <div className="ail-empty">
                      <div className="src-empty-ico">
                        <MessageSquare className="w-7 h-7" />
                      </div>
                      <p className="dash-empty-title" style={{ fontSize: '1rem', marginBottom: '0.35rem' }}>
                        Team Messaging
                      </p>
                      <p className="dash-empty-sub" style={{ maxWidth: '26rem', lineHeight: '1.5' }}>
                        Select a channel to start messaging.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Channel header */}
                      <div className="msg-conv-head">
                        <span className="msg-chan-hash">
                          <Hash className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="msg-conv-title">{selectedChannel.name}</p>
                          {selectedChannel.description && (
                            <p className="msg-conv-desc">{selectedChannel.description}</p>
                          )}
                        </div>
                      </div>

                      {/* Messages */}
                      <div className="msg-scroll">
                        {loadingMessages && (
                          <div className="text-center text-[#565d6b] py-8 text-sm">Loading messages...</div>
                        )}
                        {!loadingMessages && messages.length === 0 && (
                          <div className="dash-empty" style={{ paddingTop: '3rem' }}>
                            <div className="dash-empty-ico">
                              <MessageSquare className="w-5 h-5" />
                            </div>
                            <p className="dash-empty-title">No messages yet</p>
                            <p className="dash-empty-sub">Start the conversation!</p>
                          </div>
                        )}
                        {messages.map((msg) => (
                          <div key={msg._id} className="msg-row">
                            <img src={senderAvatar(msg)} alt={senderName(msg)} className="msg-avatar" />
                            <div className="msg-body">
                              <div className="msg-headline">
                                <span className="msg-name">{senderName(msg)}</span>
                                <span className="msg-time">{formatTime(msg.createdAt)}</span>
                              </div>
                              <p className="msg-content">{msg.content}</p>
                            </div>
                          </div>
                        ))}
                        <div ref={messagesEndRef} />
                      </div>

                      {/* Composer */}
                      <form onSubmit={handleSendMessage} className="msg-composer">
                        {isReadOnlyChannel && (
                          <p className="text-xs mb-2" style={{ color: '#e5b84a' }}>
                            Announcement channel — only admins can post.
                          </p>
                        )}
                        {sendError && (
                          <p role="alert" className="text-xs mb-2" style={{ color: '#f87171' }}>
                            {sendError}
                          </p>
                        )}
                        <div className="msg-field">
                          <input
                            type="text"
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            placeholder={
                              isReadOnlyChannel
                                ? 'Read-only channel'
                                : `Message #${selectedChannel.name}...`
                            }
                            disabled={isReadOnlyChannel}
                          />
                          <button
                            type="submit"
                            disabled={!newMessage.trim() || isReadOnlyChannel}
                            className="btn-workspace btn-primary"
                            title="Send"
                            style={{ minHeight: '46px' }}
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        </div>
                      </form>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Create Channel Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="ws-modal w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.09)]">
              <div className="flex items-center gap-2.5">
                <span className="card-ico">
                  <Hash className="w-4 h-4" />
                </span>
                <h2 className="ws-modal-title">Create Channel</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(true);
                  setCreateChannelError('');
                }}
                className="text-muted hover:text-white"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateChannel} className="p-5 space-y-4">
              <div>
                <label className="ws-label">Name</label>
                <input
                  type="text"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  placeholder="e.g. general"
                  className="ws-input"
                  autoFocus
                />
              </div>
              <div>
                <label className="ws-label">Description</label>
                <input
                  type="text"
                  value={newChannelDesc}
                  onChange={(e) => setNewChannelDesc(e.target.value)}
                  placeholder="What's this channel about?"
                  className="ws-input"
                />
              </div>
              <div>
                <label className="ws-label">Type</label>
                <select
                  value={newChannelType}
                  onChange={(e) => setNewChannelType(e.target.value)}
                  className="ws-select"
                >
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                  <option value="announcement">Announcement</option>
                </select>
                <p className="text-muted text-xs mt-1.5">
                  {newChannelType === 'announcement'
                    ? 'Everyone in the workspace can read it; only channel admins can post.'
                    : newChannelType === 'private'
                      ? 'Only invited members can see and post in this channel.'
                      : 'Everyone in the workspace can see and post.'}
                </p>
              </div>
              {createChannelError && (
                <p role="alert" className="text-xs" style={{ color: '#f87171' }}>
                  {createChannelError}
                </p>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setCreateChannelError('');
                  }}
                  className="btn-workspace btn-secondary flex-1"
                  disabled={creatingChannel}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newChannelName.trim() || creatingChannel}
                  className="btn-workspace btn-primary flex-1"
                >
                  {creatingChannel ? 'Creating…' : 'Create Channel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}