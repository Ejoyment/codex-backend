import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch } from '../lib/api';
import { Bot, Send, Plus, ChevronRight, Code, AlertCircle, Loader2, MessageSquare } from 'lucide-react';
import { getTierLimits, normalizeTier } from '../lib/tier';
import { useRouter } from 'next/router';

const LANGUAGES = ['JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Rust', 'C++', 'Ruby', 'PHP'];

function getAiLimitForTier(tier) {
  const limits = getTierLimits(tier);
  const v = limits.maxAiMessagesPerDay;
  return v === -1 ? Infinity : v;
}

function formatTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function renderCodeBlocks(text) {
  if (!text) return text;
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const lines = part.slice(3, -3);
      const firstNewline = lines.indexOf('\n');
      const lang = firstNewline > -1 ? lines.slice(0, firstNewline).trim() : '';
      const code = firstNewline > -1 ? lines.slice(firstNewline + 1) : lines;
      return (
        <div key={i} className="my-2 rounded-lg overflow-hidden border border-gray-700">
          {lang && (
            <div className="px-3 py-1 bg-gray-800 text-xs text-gray-400 border-b border-gray-700 font-mono">
              {lang}
            </div>
          )}
          <pre className="p-3 bg-gray-900 overflow-x-auto">
            <code className="text-sm text-gray-200 font-mono">{code}</code>
          </pre>
        </div>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function AiPair() {
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);
  const router = useRouter();
  const tier = normalizeTier(subscription?.tier);
  const aiLimit = getAiLimitForTier(tier);
  const aiEnabled = getTierLimits(tier).features.aiPair || aiLimit > 0;

  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [error, setError] = useState(null);
  const [showNewSession, setShowNewSession] = useState(false);
  const [repos, setRepos] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState('');
  const [selectedLang, setSelectedLang] = useState('JavaScript');
  const [creatingSession, setCreatingSession] = useState(false);
  const [remaining, setRemaining] = useState(aiLimit);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    setRemaining(aiLimit);
  }, [aiLimit]);

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function fetchSessions() {
    setLoadingSessions(true);
    try {
      const data = await apiFetch('/api/ai-pair/sessions');
      if (data.success) setSessions(data.sessions);
    } catch (err) {
      setError('Failed to load sessions');
    } finally {
      setLoadingSessions(false);
    }
  }

  async function fetchRepos() {
    try {
      const data = await apiFetch('/api/ai-pair/repos');
      if (data.success) setRepos(data.repos);
    } catch (err) {
      setError('Failed to load repositories');
    }
  }

  async function handleCreateSession() {
    if (!selectedRepo) return;
    setCreatingSession(true);
    setError(null);
    try {
      const data = await apiFetch('/api/ai-pair/session', {
        method: 'POST',
        body: JSON.stringify({ repoName: selectedRepo, language: selectedLang }),
      });
      if (data.success) {
        const sess = data.session;
        setSessions((prev) => [sess, ...prev]);
        setActiveSession(sess);
        setMessages([]);
        setRemaining(aiLimit);
        setShowNewSession(false);
      }
    } catch (err) {
      setError(err.message || 'Failed to create session');
    } finally {
      setCreatingSession(false);
    }
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!input.trim() || !activeSession || loading) return;

    const userMsg = { role: 'user', content: input, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    const currentInput = input;
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const data = await apiFetch('/api/ai-pair/message', {
        method: 'POST',
        body: JSON.stringify({ sessionId: activeSession._id, message: currentInput }),
      });
      if (data.success) {
        const aiMsg = {
          role: 'assistant',
          content: data.response.message,
          codeChanges: data.response.codeChanges,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, aiMsg]);
        setRemaining((r) => Math.max(0, r - 1));
      }
    } catch (err) {
      setError(err.message || 'Failed to send message');
    } finally {
      setLoading(false);
    }
  }

  function openNewSessionModal() {
    setShowNewSession(true);
    setSelectedRepo('');
    setSelectedLang('JavaScript');
    fetchRepos();
  }

  function selectSession(sess) {
    setActiveSession(sess);
    setMessages([]);
    setRemaining(aiLimit);
    setError(null);
  }

  return (
    <AuthGuard>
      <Head>
        <title>AI Pair Programming - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="min-h-screen bg-navy flex">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main ml-64 flex flex-col h-screen">
          <header className="workspace-header flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-blue-400" />
                <h1 className="text-xl font-bold">AI Pair Programming</h1>
              </div>
              <span className="text-xs text-gray-400 bg-navy-light px-2 py-1 rounded border border-gray-700">
                {aiLimit === Infinity ? `${remaining} messages` : `${remaining}/${aiLimit} messages/day`}
                {tier === 'freebie' && ' · Free tier'}
              </span>
              {tier === 'freebie' && (
                <button
                  type="button"
                  onClick={() => router.push('/pricing')}
                  className="text-xs text-yellow-400 hover:text-yellow-300 underline"
                >
                  Upgrade to Professional
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              {activeSession && (
                <span className="text-sm text-gray-400">
                  {activeSession.repoName} &middot; {activeSession.language}
                </span>
              )}
              <button
                type="button"
                onClick={openNewSessionModal}
                className="cta-button px-4 py-2 rounded-lg text-white font-medium text-sm"
              >
                <Plus className="w-4 h-4 inline mr-1" />
                New Session
              </button>
            </div>
          </header>

          <div className="flex flex-1 overflow-hidden">
            <div className="w-72 border-r border-gray-700 flex flex-col overflow-hidden">
              <div className="p-3 border-b border-gray-700">
                <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Sessions</h2>
              </div>
              <div className="flex-1 overflow-y-auto">
                {loadingSessions ? (
                  <div className="p-4 text-center">
                    <Loader2 className="w-5 h-5 text-gray-400 animate-spin mx-auto" />
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 text-sm">
                    No sessions yet
                  </div>
                ) : (
                  sessions.map((sess) => (
                    <button
                      key={sess._id}
                      type="button"
                      onClick={() => selectSession(sess)}
                      className={`w-full text-left px-3 py-3 border-b border-gray-800 hover:bg-navy-light transition-colors ${
                        activeSession?._id === sess._id ? 'bg-navy-light border-l-2 border-l-blue-500' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-white truncate font-medium">{sess.repoName}</span>
                        <ChevronRight className="w-3 h-3 text-gray-500 flex-shrink-0" />
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400">{sess.language}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          sess.status === 'active' ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-gray-400'
                        }`}>
                          {sess.status}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">{formatTime(sess.createdAt)}</div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden">
              {error && (
                <div className="mx-4 mt-3 p-3 bg-red-900/30 border border-red-700 rounded-lg flex items-center gap-2 text-red-300 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                  <button type="button" onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">&times;</button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {!activeSession && !showNewSession ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <Bot className="w-16 h-16 text-gray-600 mb-4" />
                    <h2 className="text-lg font-semibold text-gray-300 mb-2">AI Pair Programming</h2>
                    <p className="text-gray-500 text-sm max-w-md mb-6">
                      Get real-time coding assistance from AI. Start a new session to begin pairing.
                    </p>
                    <button
                      type="button"
                      onClick={openNewSessionModal}
                      className="cta-button px-6 py-3 rounded-lg text-white font-medium"
                    >
                      <Plus className="w-4 h-4 inline mr-2" />
                      Start New Session
                    </button>
                  </div>
                ) : (
                  <>
                    {messages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] rounded-xl px-4 py-3 ${
                          msg.role === 'user'
                            ? 'bg-blue-600 text-white'
                            : 'bg-navy-light border border-gray-700 text-gray-200'
                        }`}>
                          <div className="flex items-center gap-2 mb-1">
                            {msg.role === 'assistant' && <Bot className="w-3.5 h-3.5 text-blue-400" />}
                            <span className="text-xs font-medium opacity-70">
                              {msg.role === 'user' ? 'You' : 'AI'}
                            </span>
                          </div>
                          <div className="text-sm whitespace-pre-wrap leading-relaxed">
                            {msg.role === 'assistant' ? renderCodeBlocks(msg.content) : msg.content}
                          </div>
                          {msg.codeChanges && msg.codeChanges.length > 0 && (
                            <div className="mt-3 space-y-2">
                              {msg.codeChanges.map((change, ci) => (
                                <div key={ci} className="rounded-lg overflow-hidden border border-gray-700">
                                  <div className="px-3 py-1.5 bg-gray-800 flex items-center gap-2">
                                    <Code className="w-3 h-3 text-green-400" />
                                    <span className="text-xs text-gray-300 font-mono">{change.path}</span>
                                    <span className={`text-xs px-1.5 py-0.5 rounded ml-auto ${
                                      change.action === 'create' ? 'bg-green-900 text-green-300'
                                        : change.action === 'delete' ? 'bg-red-900 text-red-300'
                                          : 'bg-yellow-900 text-yellow-300'
                                    }`}>
                                      {change.action}
                                    </span>
                                  </div>
                                  {change.content && (
                                    <pre className="p-3 bg-gray-900 overflow-x-auto">
                                      <code className="text-xs text-gray-200 font-mono">{change.content}</code>
                                    </pre>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {loading && (
                      <div className="flex justify-start">
                        <div className="bg-navy-light border border-gray-700 rounded-xl px-4 py-3">
                          <div className="flex items-center gap-2 text-gray-400 text-sm">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Thinking...</span>
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {activeSession && (
                <form onSubmit={handleSend} className="p-4 border-t border-gray-700">
                  <div className="flex gap-3 items-end">
                    <div className="flex-1 relative">
                      <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
                        placeholder="Ask AI anything about your code..."
                        rows={1}
                        className="w-full px-4 py-3 bg-navy-light border border-gray-600 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
                        style={{ minHeight: '44px', maxHeight: '120px' }}
                        disabled={loading || remaining <= 0}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={!input.trim() || loading || remaining <= 0}
                      className="cta-button px-4 py-3 rounded-xl text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                  {remaining <= 0 && (
                    <p className="text-xs text-yellow-500 mt-2 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Message limit reached for this session
                    </p>
                  )}
                </form>
              )}
            </div>
          </div>
        </main>
      </div>

      {showNewSession && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-navy-light border border-gray-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">New Session</h2>
              <button
                type="button"
                onClick={() => setShowNewSession(false)}
                className="text-gray-400 hover:text-white"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-2 font-medium">Repository</label>
                <select
                  value={selectedRepo}
                  onChange={(e) => setSelectedRepo(e.target.value)}
                  className="w-full px-3 py-2.5 bg-navy border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select a repository...</option>
                  {repos.map((repo) => (
                    <option key={repo.name || repo} value={repo.name || repo}>
                      {repo.name || repo}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-2 font-medium">Language</label>
                <div className="flex flex-wrap gap-2">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => setSelectedLang(lang)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        selectedLang === lang
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-navy border-gray-600 text-gray-400 hover:border-gray-500'
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleCreateSession}
                disabled={!selectedRepo || creatingSession}
                className="w-full cta-button px-4 py-3 rounded-xl text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed mt-4"
              >
                {creatingSession ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    Start Session
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}
