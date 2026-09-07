import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch } from '../lib/api';
import {
  Bot,
  Send,
  Plus,
  ChevronRight,
  Code,
  AlertCircle,
  Loader2,
  MessageSquare,
  Sparkles,
  X,
  Copy,
  Check,
} from 'lucide-react';
import { getTierLimits, normalizeTier } from '../lib/tier';
import { useRouter } from 'next/router';
import { io } from 'socket.io-client';
import { useCurrentCompany } from '../hooks/useCurrentCompany';

const LANGUAGES = ['JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Rust', 'C++', 'Ruby', 'PHP'];

const ACTION_TINTS = {
  create: { bg: 'rgba(52, 211, 153, 0.12)', text: '#34d399' },
  delete: { bg: 'rgba(248, 113, 113, 0.12)', text: '#f87171' },
  edit: { bg: 'rgba(229, 184, 74, 0.12)', text: '#e5b84a' },
};

function getAiLimitForTier(tier) {
  const limits = getTierLimits(tier);
  const v = limits.maxAiMessagesPerDay;
  return v === -1 ? Infinity : v;
}

function formatTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }).catch(() => {});
  };

  return (
    <div className="ail-code">
      <div className="ail-code-head">
        <span className="ail-code-lang">{lang ? lang.toUpperCase() : 'CODE'}</span>
        <button type="button" className="ail-code-copy" onClick={handleCopy}>
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        </button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}

function renderCodeBlocks(text, keyPrefix = '') {
  if (!text) return text;
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const lines = part.slice(3, -3);
      const firstNewline = lines.indexOf('\n');
      const lang = firstNewline > -1 ? lines.slice(0, firstNewline).trim() : '';
      const code = firstNewline > -1 ? lines.slice(firstNewline + 1) : lines;
      return <CodeBlock key={`${keyPrefix}${i}`} lang={lang} code={code} />;
    }
    return <span key={`${keyPrefix}${i}`}>{part}</span>;
  });
}

function ChangeBlock({ change }) {
  const tint = ACTION_TINTS[change.action] || ACTION_TINTS.edit;
  return (
    <div className="ail-change">
      <div className="ail-change-head">
        <Code className="w-3.5 h-3.5 flex-shrink-0" style={{ color: tint.text }} />
        <span className="ail-change-path">{change.path}</span>
        <span className="pill ml-auto flex-shrink-0" style={{ background: tint.bg, color: tint.text }}>
          {change.action}
        </span>
      </div>
      {change.content && (
        <pre><code>{change.content}</code></pre>
      )}
    </div>
  );
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
  const [clock, setClock] = useState('');
  const [agentMode, setAgentMode] = useState(false);
  const [agentSteps, setAgentSteps] = useState([]);
  const agentSocketRef = useRef(null);
  const { selectedCompany, hasCompany } = useCurrentCompany();
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

  useEffect(() => {
    const tick = () => {
      setClock(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
    if (!token) return;
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000';
    const sock = io(`${socketUrl}/collab`, { auth: { token }, transports: ['websocket', 'polling'] });
    agentSocketRef.current = sock;
    sock.on('connect', () => sock.emit('agent:join'));
    sock.on('agent:progress', (p) => {
      if (p && p.type) {
        setAgentSteps((prev) => [...prev, p]);
      }
    });
    return () => {
      sock.emit('agent:leave');
      sock.disconnect();
      agentSocketRef.current = null;
    };
  }, [activeSession]);

  function resetAgentRun() {
    setAgentSteps([]);
  }

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
    if (agentMode) resetAgentRun();

    try {
      const data = await apiFetch('/api/ai-pair/chat', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: activeSession._id,
          message: currentInput,
          useAgentLoop: agentMode,
          companyId: selectedCompany?._id || undefined,
          codeContext: {
            workspace: { id: selectedCompany?._id, name: selectedCompany?.name },
            language: activeSession.language,
            files: [],
          },
        }),
      });
      if (data.success) {
        if (data.agentMode && data.result) {
          const result = data.result;
          const steps = (result.iterations || []).map((it) => ({
            step: it.iteration,
            thought: it.reasoning?.thought || it.thought || '',
            tool: it.reasoning?.action?.tool || it.action?.tool || '',
            success: it.result?.success,
          }));
          setAgentSteps((prev) => [
            ...prev,
            { type: 'done', status: 'done', success: result.success !== false, summary: result.summary },
          ]);
          const aiMsg = {
            role: 'assistant',
            content: result.summary || (result.success ? 'Task complete.' : 'Agent finished with issues.'),
            agentSummary: result.summary,
            agentSteps: steps,
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, aiMsg]);
        } else {
          const aiMsg = {
            role: 'assistant',
            content: (data.message && data.message.content) || 'No response.',
            codeChanges: data.actions && data.actions.length ? data.actions : [],
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, aiMsg]);
        }
        if (typeof data.aiLimit === 'number') {
          setRemaining(data.aiLimit);
        } else {
          setRemaining((r) => Math.max(0, r - 1));
        }
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

      <div className="workspace-container">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main">
          <header className="workspace-header dash-header">
            <div>
              <p className="dash-crumb">
                BuildrsHQ <span className="sep">/</span> AI Pair
              </p>
              <h1 className="dash-title">AI Pair Programming</h1>
              <div className="dash-statusline">
                <span className="status-indicator status-online" />
                <span>{activeSession ? `${activeSession.repoName} · ${activeSession.language}` : 'No active session'}</span>
                <span className="dash-clock">· {clock || '—:——:——'}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="dash-pill hidden md:inline-flex">
                <span className="dot" style={{ background: remaining <= 0 ? '#f87171' : '#2fd6e6' }} />
                {aiLimit === Infinity ? `${remaining} messages` : `${remaining}/${aiLimit} today`}
              </span>
              {tier === 'freebie' && (
                <button
                  type="button"
                  onClick={() => router.push('/pricing')}
                  className="dash-action"
                >
                  Upgrade to Professional
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={openNewSessionModal}
                className="btn-workspace btn-primary"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New Session</span>
              </button>
            </div>
          </header>

          <div className="workspace-content">
            <div className="ail-content">
              <div className="ail-shell">
                {/* Session rail */}
                <aside className="ail-rail">
                  <div className="ail-rail-head">
                    <span className="ail-rail-title">
                      <MessageSquare className="w-4 h-4" style={{ color: '#2fd6e6' }} />
                      Sessions
                    </span>
                    <button type="button" className="ail-new" onClick={openNewSessionModal} title="New session">
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {loadingSessions ? (
                      <div className="dash-empty">
                        <div className="dash-empty-ico">
                          <Loader2 className="w-5 h-5 animate-spin" />
                        </div>
                        <p className="dash-empty-title">Loading sessions...</p>
                      </div>
                    ) : sessions.length === 0 ? (
                      <div className="dash-empty">
                        <div className="dash-empty-ico">
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <p className="dash-empty-title">No sessions yet</p>
                        <p className="dash-empty-sub">Start a pairing session to begin.</p>
                      </div>
                    ) : (
                      sessions.map((sess) => {
                        const isActive = activeSession?._id === sess._id;
                        return (
                          <button
                            key={sess._id}
                            type="button"
                            onClick={() => selectSession(sess)}
                            className={`ail-session ${isActive ? 'is-active' : ''}`}
                          >
                            <span className="ail-sess-ico">
                              <Sparkles className="w-4 h-4" />
                            </span>
                            <span className="ail-sess-main">
                              <span className="ail-sess-top">
                                <span className="ail-sess-name">{sess.repoName}</span>
                              </span>
                              <span className="ail-sess-meta">
                                <span className="ail-sess-lang">{sess.language}</span>
                                <span
                                  className="ail-sess-status"
                                  style={
                                    sess.status === 'active'
                                      ? { background: 'rgba(52,211,153,0.12)', color: '#34d399' }
                                      : { background: 'rgba(255,255,255,0.05)', color: '#9aa1ae' }
                                  }
                                >
                                  {sess.status}
                                </span>
                              </span>
                              <span className="ail-sess-time">{formatTime(sess.createdAt)}</span>
                            </span>
                            <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: isActive ? '#2fd6e6' : '#3a4050' }} />
                          </button>
                        );
                      })
                    )}
                  </div>
                </aside>

                {/* Conversation */}
                <div className="ail-conv">
                  {error && (
                    <div className="std-alert std-alert-error mx-4 mt-4">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <p className="flex-1">{error}</p>
                      <button type="button" onClick={() => setError(null)} className="text-[#fca5a5] hover:text-white">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  <div className="ail-scroll">
                    {!activeSession ? (
                      <div className="ail-empty">
                        <div className="src-empty-ico">
                          <Bot className="w-7 h-7" />
                        </div>
                        <p className="dash-empty-title" style={{ fontSize: '1rem', marginBottom: '0.35rem' }}>
                          AI Pair Programming
                        </p>
                        <p className="dash-empty-sub" style={{ maxWidth: '26rem', lineHeight: '1.5', marginBottom: '1.5rem' }}>
                          Get real-time coding assistance from AI. Start a new session to begin pairing.
                        </p>
                        <button
                          type="button"
                          onClick={openNewSessionModal}
                          className="btn-workspace btn-primary"
                        >
                          <Plus className="w-4 h-4" />
                          Start New Session
                        </button>
                      </div>
                    ) : (
                      <>
                        {messages.map((msg, i) => (
                          msg.role === 'user' ? (
                            <div key={i} className="ail-msg-row is-user">
                              <div className="ail-bubble ail-bubble-user">
                                <div className="ail-msg-head">
                                  <span className="ail-msg-who">You</span>
                                </div>
                                <span>{msg.content}</span>
                                {msg.codeChanges && msg.codeChanges.length > 0 && (
                                  msg.codeChanges.map((change, ci) => <ChangeBlock key={`u${i}-${ci}`} change={change} />)
                                )}
                              </div>
                            </div>
                          ) : (
                            <div key={i} className="ail-msg-row">
                              <div className="ail-bubble ail-bubble-ai">
                                <div className="ail-msg-head">
                                  <Bot className="w-3.5 h-3.5" style={{ color: '#2fd6e6' }} />
                                  <span className="ail-msg-who">AI</span>
                                </div>
                                {renderCodeBlocks(msg.content, `a${i}`)}
                                {msg.agentSteps && msg.agentSteps.length > 0 && (
                                  <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    {msg.agentSteps.map((s, si) => (
                                      <div key={si} style={{ fontSize: '0.75rem', color: '#a8adba', display: 'flex', gap: '0.4rem' }}>
                                        <span className="mkt-mono" style={{ color: s.success === false ? '#f87171' : '#2fd6e6' }}>
                                          {s.success === false ? '✕' : '✓'}
                                        </span>
                                        <span>step {s.step}: {s.tool} — {String(s.thought).slice(0, 80)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {msg.codeChanges && msg.codeChanges.length > 0 && (
                                  msg.codeChanges.map((change, ci) => <ChangeBlock key={`${i}-${ci}`} change={change} />)
                                )}
                              </div>
                            </div>
                          )
                        ))}
                        {loading && (
                          <>
                            {agentMode && agentSteps.length > 0 ? (
                              <div className="ail-msg-row">
                                <div className="ail-bubble ail-bubble-ai" style={{ width: '100%' }}>
                                  <div className="ail-msg-head">
                                    <Bot className="w-3.5 h-3.5" style={{ color: '#2fd6e6' }} />
                                    <span className="ail-msg-who">Agent working...</span>
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
                                    {agentSteps.filter((s) => s.type === 'iteration' || s.type === 'result').map((s, idx) => (
                                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: s.status === 'error' ? '#f87171' : '#c8ccd4' }}>
                                        <Loader2 className="w-3 h-3 animate-spin" style={{ color: '#2fd6e6' }} />
                                        <span className="mkt-mono">
                                          step {s.iteration}
                                          {s.thought ? ` · ${String(s.thought).slice(0, 90)}` : ''}
                                          {s.action?.tool ? ` · ${s.action.tool}` : ''}
                                          {s.type === 'result' ? ` → ${s.result?.message || 'done'}` : ''}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="ail-msg-row">
                                <div className="ail-thinking ail-typing">
                                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#2fd6e6' }} />
                                  <span className="ail-msg-who">{agentMode ? 'Agent thinking...' : 'Thinking...'}</span>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                        <div ref={messagesEndRef} />
                      </>
                    )}
                  </div>

                  {activeSession && (
                    <form onSubmit={handleSend} className="ail-composer">
                      <div className="ail-composer-mode" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', fontSize: '0.78rem' }}>
                        <button
                          type="button"
                          onClick={() => { setAgentMode((m) => !m); resetAgentRun(); }}
                          className="btn-workspace btn-secondary text-xs inline-flex items-center gap-1.5"
                          style={{ borderColor: agentMode ? 'rgba(47,214,230,0.5)' : undefined, color: agentMode ? '#2fd6e6' : undefined }}
                          title="Let the agent autonomously read files, write code, and run steps"
                        >
                          <Sparkles className="w-3 h-3" />
                          {agentMode ? 'Agent Mode: ON' : 'Agent Mode: OFF'}
                        </button>
                        {agentMode && (
                          <span style={{ color: '#a8adba' }}>Autonomous — the agent may create/edit files and run code.</span>
                        )}
                      </div>
                      <div className="ail-field">
                        <textarea
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
                          placeholder="Ask AI anything about your code..."
                          rows={1}
                          disabled={loading || remaining <= 0}
                        />
                        <button
                          type="submit"
                          disabled={!input.trim() || loading || remaining <= 0}
                          className="btn-workspace btn-primary"
                          title="Send"
                          style={{ minHeight: '46px' }}
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="ail-composer-note">
                        {remaining <= 0 ? (
                          <>
                            <AlertCircle className="w-3 h-3 ail-limit" />
                            <span className="ail-limit">Message limit reached for this session</span>
                          </>
                        ) : (
                          <span>Enter to send · Shift+Enter for newline</span>
                        )}
                        <span className="ml-auto">
                          {aiLimit === Infinity ? `${remaining} remaining` : `${remaining}/${aiLimit} messages today`}
                        </span>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {showNewSession && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="ws-modal w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.09)]">
              <div className="flex items-center gap-2.5">
                <span className="card-ico">
                  <Sparkles className="w-4 h-4" />
                </span>
                <h2 className="ws-modal-title">New Session</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowNewSession(false)}
                className="text-muted hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="ws-label">Repository</label>
                <select
                  value={selectedRepo}
                  onChange={(e) => setSelectedRepo(e.target.value)}
                  className="ws-select"
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
                <label className="ws-label">Language</label>
                <div className="flex flex-wrap gap-2">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => setSelectedLang(lang)}
                      className={`ail-lang-chip ${selectedLang === lang ? 'is-active' : ''}`}
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
                className="btn-workspace btn-primary w-full justify-center mt-2"
              >
                {creatingSession ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <MessageSquare className="w-4 h-4" />
                    Start Session
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}