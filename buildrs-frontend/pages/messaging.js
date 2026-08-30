import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch } from '../lib/api';
import { useCurrentCompany, NoWorkspaceEmptyState } from '../hooks/useCurrentCompany';
import { getTierLimits, normalizeTier } from '../lib/tier';
import { MessageSquare, Plus, Send, Hash, X } from 'lucide-react';

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
  const [newChannelType, setNewChannelType] = useState('group');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadChannels();
  }, []);

  useEffect(() => {
    if (selectedChannel) {
      loadMessages(selectedChannel._id);
    }
  }, [selectedChannel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadChannels() {
    try {
      setLoadingChannels(true);
      const companies = await apiFetch('/api/company/my-companies');
      const companyId = companies.companies?.[0]?._id;
      if (!companyId) return;
      const data = await apiFetch(`/api/messaging/channels?companyId=${companyId}`);
      setChannels(data.channels || []);
    } catch (err) {
      console.error('Failed to load channels:', err);
    } finally {
      setLoadingChannels(false);
    }
  }

  async function loadMessages(channelId) {
    try {
      setLoadingMessages(true);
      const data = await apiFetch(`/api/messaging/channels/${channelId}/messages?limit=50`);
      setMessages(data.messages || []);
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  }

  async function handleSendMessage(e) {
    e.preventDefault();
    if (!newMessage.trim() || !selectedChannel) return;
    try {
      const data = await apiFetch(`/api/messaging/channels/${selectedChannel._id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: newMessage.trim() }),
      });
      setMessages((prev) => [...prev, data.message]);
      setNewMessage('');
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  }

  async function handleCreateChannel(e) {
    e.preventDefault();
    if (!newChannelName.trim()) return;
    try {
      const companies = await apiFetch('/api/company/my-companies');
      const companyId = companies.companies?.[0]?._id;
      if (!companyId) return;
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
      setNewChannelType('group');
    } catch (err) {
      console.error('Failed to create channel:', err);
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
      const pic = msg.sender.profilePicture || msg.sender.profilePhoto;
      if (pic) return pic;
      const name = msg.sender.fullName || msg.sender.name || 'U';
      return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=3b82f6&color=fff&size=32`;
    }
    return `https://ui-avatars.com/api/?name=U&background=3b82f6&color=fff&size=32`;
  }

  return (
    <AuthGuard>
      <Head>
        <title>Messaging - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="min-h-screen bg-navy flex">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main flex-1 ml-64">
          <header className="workspace-header">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold">Messaging</h1>
            </div>
            <button type="button" className="cta-button" onClick={() => setShowCreateModal(true)}>
              <Plus className="w-4 h-4" />
              <span>New Channel</span>
            </button>
          </header>

          <div className="workspace-content">
            {companyLoading ? (
              <div className="flex items-center justify-center py-20 text-gray-400">Loading workspace...</div>
            ) : !hasCompany ? (
              <NoWorkspaceEmptyState onCreateClick={() => router.push('/teams')} />
            ) : !canUseChat ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <MessageSquare className="w-12 h-12 text-gray-600 mb-4" />
                <h3 className="text-lg font-semibold text-white mb-1">Team Chat requires Professional</h3>
                <p className="text-sm text-gray-400 mb-6 max-w-sm">Upgrade to unlock messaging, channels, and team chat.</p>
                <button type="button" onClick={() => router.push('/pricing')} className="cta-button px-6 py-3 rounded-lg">Upgrade to Professional</button>
              </div>
            ) : (
              <div className="bg-navy-light rounded-lg border border-gray-700 h-[calc(100vh-140px)] flex">
              {/* Channel List */}
              <div className="w-72 border-r border-gray-700 flex flex-col">
                <div className="p-4 border-b border-gray-700">
                  <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Channels</h2>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {loadingChannels && (
                    <div className="text-center text-gray-500 py-8 text-sm">Loading channels...</div>
                  )}
                  {!loadingChannels && channels.length === 0 && (
                    <div className="text-center text-gray-500 py-8 text-sm">No channels yet</div>
                  )}
                  {channels.map((ch) => (
                    <button
                      key={ch._id}
                      type="button"
                      onClick={() => setSelectedChannel(ch)}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                        selectedChannel?._id === ch._id
                          ? 'bg-blue-600/20 border border-blue-500/30'
                          : 'hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <Hash className="w-4 h-4 text-gray-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-200 truncate">{ch.name}</div>
                        {ch.description && (
                          <div className="text-xs text-gray-500 truncate">{ch.description}</div>
                        )}
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/50 text-gray-400 shrink-0">
                        {ch.type || 'group'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Message Panel */}
              <div className="flex-1 flex flex-col">
                {!selectedChannel ? (
                  <div className="flex-1 flex items-center justify-center text-gray-400">
                    <div className="text-center">
                      <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>Select a channel to start messaging</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Channel Header */}
                    <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-3">
                      <Hash className="w-5 h-5 text-gray-400" />
                      <div>
                        <h3 className="text-sm font-semibold text-gray-200">{selectedChannel.name}</h3>
                        {selectedChannel.description && (
                          <p className="text-xs text-gray-500">{selectedChannel.description}</p>
                        )}
                      </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                      {loadingMessages && (
                        <div className="text-center text-gray-500 py-8 text-sm">Loading messages...</div>
                      )}
                      {!loadingMessages && messages.length === 0 && (
                        <div className="text-center text-gray-500 py-8 text-sm">No messages yet. Start the conversation!</div>
                      )}
                      {messages.map((msg) => (
                        <div key={msg._id} className="flex gap-3">
                          <img
                            src={senderAvatar(msg)}
                            alt={senderName(msg)}
                            className="w-8 h-8 rounded-full shrink-0 mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                              <span className="text-sm font-medium text-gray-200">{senderName(msg)}</span>
                              <span className="text-xs text-gray-500">{formatTime(msg.createdAt)}</span>
                            </div>
                            <p className="text-sm text-gray-300 mt-0.5 whitespace-pre-wrap break-words">{msg.content}</p>
                          </div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>

                    {/* Message Input */}
                    <form onSubmit={handleSendMessage} className="px-4 py-3 border-t border-gray-700 flex gap-3">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder={`Message #${selectedChannel.name}...`}
                        className="flex-1 bg-navy border border-gray-700 rounded-lg px-4 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                      />
                      <button
                        type="submit"
                        disabled={!newMessage.trim()}
                        className="cta-button disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </form>
                  </>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Create Channel Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-navy-light border border-gray-700 rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-200">Create Channel</h2>
              <button type="button" onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateChannel} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Name</label>
                <input
                  type="text"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  placeholder="e.g. general"
                  className="w-full bg-navy border border-gray-700 rounded-lg px-4 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Description</label>
                <input
                  type="text"
                  value={newChannelDesc}
                  onChange={(e) => setNewChannelDesc(e.target.value)}
                  placeholder="What's this channel about?"
                  className="w-full bg-navy border border-gray-700 rounded-lg px-4 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Type</label>
                <select
                  value={newChannelType}
                  onChange={(e) => setNewChannelType(e.target.value)}
                  className="w-full bg-navy border border-gray-700 rounded-lg px-4 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="group">Group</option>
                  <option value="direct">Direct</option>
                  <option value="announcement">Announcement</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="cta-button flex-1 bg-gray-700 hover:bg-gray-600">
                  Cancel
                </button>
                <button type="submit" disabled={!newChannelName.trim()} className="cta-button flex-1 disabled:opacity-40">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}
