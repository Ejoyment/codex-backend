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
  GitBranch,
  CheckCircle2,
  XCircle,
  Clock3,
  RefreshCw,
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

function AgentRunsPanel({ sessions, selected, loading, error, followUp, setFollowUp, setError, onSelect, onRefresh, onAction, actionId }) {
  const reviewable = selected && ['awaiting_review', 'awaiting_approval'].includes(selected.status);
  const hasAppliedChanges = Boolean((selected?.filesChanged || []).length || selected?.diffSummary?.filesChanged > 0);
  const validation = selected?.validationResult;
  const statusColor = selected?.status === 'failed' ? '#f87171' : reviewable ? '#e5b84a' : selected?.status === 'running' ? '#2fd6e6' : '#9aa1ae';

  return (
    <div className="ail-content">
      {error && <div className="std-alert std-alert-error mb-4"><AlertCircle className="w-4 h-4" /><span className="flex-1">{error}</span><button type="button" onClick={() => setError(null)}><X className="w-4 h-4" /></button></div>}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div><h2 className="text-sm font-semibold text-white">Task agent sessions</h2><p className="mt-1 text-xs text-[#9aa1ae]">Execution logs, frozen inputs, validation, and human review</p></div>
        <button type="button" className="btn-workspace btn-secondary" onClick={onRefresh} disabled={loading} title="Refresh sessions"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>
      <div className="grid min-h-[560px] overflow-hidden border border-white/10 lg:grid-cols-[290px_minmax(0,1fr)]">
        <aside className="border-b border-white/10 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><span className="text-xs font-semibold uppercase text-[#9aa1ae]">Runs</span><span className="text-xs text-[#727987]">{sessions.length}</span></div>
          <div className="max-h-[680px] overflow-y-auto">
            {sessions.length ? sessions.map((session) => <button key={session._id} type="button" onClick={() => onSelect(session)} className={`block w-full border-b border-white/5 px-4 py-3 text-left hover:bg-white/5 ${selected?._id === session._id ? 'bg-white/5' : ''}`}>
              <span className="block truncate text-sm font-medium text-white">{session.taskTitle || 'Agent run'}</span>
              <span className="mt-1 flex items-center justify-between gap-2 text-xs"><span className="truncate text-[#9aa1ae]">{session.branch || session.model || 'No branch'}</span><span style={{ color: ['awaiting_review', 'awaiting_approval'].includes(session.status) ? '#e5b84a' : session.status === 'failed' ? '#f87171' : '#9aa1ae' }}>{session.status}</span></span>
              <span className="mt-1 block text-[11px] text-[#727987]">{session.createdAt ? new Date(session.createdAt).toLocaleString() : ''}</span>
            </button>) : <div className="px-4 py-10 text-center text-xs text-[#727987]">{loading ? 'Loading agent runs...' : 'No task agent runs yet'}</div>}
          </div>
        </aside>
        <section className="flex min-w-0 flex-col">
          {!selected ? <div className="flex flex-1 flex-col items-center justify-center p-8 text-center"><Bot className="mb-3 h-8 w-8 text-[#2fd6e6]" /><p className="text-sm font-semibold text-white">Select an agent run</p><p className="mt-1 max-w-sm text-xs text-[#9aa1ae]">Delegate a task from Tasks to inspect execution and review it here.</p></div> : <>
            <header className="border-b border-white/10 px-4 py-4 sm:px-6">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase text-[#9aa1ae]">{selected.taskId ? 'Task execution' : 'Agent session'}</p><h2 className="mt-1 text-lg font-semibold text-white">{selected.taskTitle}</h2></div><span className="inline-flex items-center gap-2 text-xs" style={{ color: statusColor }}><span className="h-2 w-2 rounded-full" style={{ background: statusColor }} />{selected.status}</span></div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#9aa1ae]">
                <span className="inline-flex items-center gap-1.5"><GitBranch className="h-3.5 w-3.5 text-[#2fd6e6]" />{selected.branch || 'No branch'}</span>
                <span>{selected.model || 'Default model'}</span>
                <span>{selected.contextSnapshot?.specs?.length || 0} frozen specs</span>
                {selected.retryCount > 0 && <span>Correction attempts: {selected.retryCount}</span>}
              </div>
            </header>
            <div className="grid flex-1 gap-5 overflow-y-auto p-4 sm:p-6 xl:grid-cols-2">
              <div className="space-y-5">
                <section><h3 className="mb-2 text-xs font-semibold uppercase text-[#9aa1ae]">Plan</h3><pre className="max-h-60 overflow-auto whitespace-pre-wrap border border-white/10 bg-black/20 p-3 text-xs leading-relaxed text-[#c6cad2]">{selected.plan || 'The worker did not return a separate plan.'}</pre></section>
                <section><h3 className="mb-2 text-xs font-semibold uppercase text-[#9aa1ae]">Agent output</h3><pre className="max-h-[420px] overflow-auto whitespace-pre-wrap border border-white/10 bg-black/20 p-3 text-xs leading-relaxed text-[#c6cad2]">{selected.summary || 'Waiting for worker output...'}</pre></section>
              </div>
              <div className="space-y-5">
                <section><h3 className="mb-2 text-xs font-semibold uppercase text-[#9aa1ae]">Terminal log</h3><div className="max-h-60 overflow-auto border border-white/10 bg-[#08080b] p-3 font-mono text-[11px] leading-relaxed">
                  {(selected.terminalLog || []).length ? selected.terminalLog.map((line, index) => <p key={`${line.timestamp}-${index}`} className="mb-1 text-[#c6cad2]"><span className="mr-2 text-[#727987]">{line.timestamp ? new Date(line.timestamp).toLocaleTimeString() : '—'}</span><span className="mr-2 text-[#2fd6e6]">{line.type || 'log'}</span>{line.message}</p>) : <p className="text-[#727987]">No execution events recorded.</p>}
                </div></section>
                <section><h3 className="mb-2 text-xs font-semibold uppercase text-[#9aa1ae]">Validation</h3>
                  {validation?.specs?.length ? <div className="space-y-3">{validation.specs.map((spec, index) => <div key={spec.specId || index} className="border border-white/10 p-3"><div className="mb-2 flex items-center justify-between gap-2 text-xs"><span className="font-medium text-white">{spec.title || `Spec ${index + 1}`}</span><span style={{ color: spec.passed ? '#34d399' : '#e5b84a' }}>{spec.passed ? 'requirements passing' : 'review needed'}</span></div>{(spec.requirements || []).map((requirement, requirementIndex) => <p key={requirement.id || requirementIndex} className="mb-1 flex gap-2 text-xs text-[#c6cad2]"><span style={{ color: requirement.status === 'pass' ? '#34d399' : requirement.status === 'fail' ? '#f87171' : '#e5b84a' }}>{requirement.status}</span><span>{requirement.id}: {requirement.text} <span className="text-[#727987]">{requirement.evidence}</span></span></p>)}{spec.verificationCommand && <p className="mt-2 text-xs text-[#e5b84a]">Command pending: {spec.verificationCommand.command}</p>}</div>)}</div> : <p className="border border-white/10 p-3 text-xs text-[#9aa1ae]">{validation?.command?.reason || 'No automated validation result is attached.'}</p>}
                </section>
                {selected.contextSnapshot?.specs?.length > 0 && <section><h3 className="mb-2 text-xs font-semibold uppercase text-[#9aa1ae]">Frozen spec context</h3><div className="flex flex-wrap gap-2">{selected.contextSnapshot.specs.map((spec) => <span key={spec._id} className="border border-white/10 px-2 py-1 text-xs text-[#c6cad2]">{spec.title}</span>)}</div></section>}
              </div>
            </div>
            <footer className="border-t border-white/10 p-4 sm:px-6">
              {['awaiting_review', 'awaiting_approval', 'failed'].includes(selected.status) && <form className="mb-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); if (followUp.trim()) onAction('tweak', selected, { instruction: followUp.trim() }); }}>
                <input className="ws-input min-w-0 flex-1" value={followUp} onChange={(event) => setFollowUp(event.target.value)} placeholder="Add a follow-up instruction" />
                <button type="submit" className="btn-workspace btn-secondary" disabled={!followUp.trim() || Boolean(actionId)}><Send className="h-4 w-4" /><span className="hidden sm:inline">Continue</span></button>
              </form>}
              <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-[#727987]">Agent work always waits for a human decision.</span><div className="flex gap-2">
                {reviewable && <><button type="button" className="btn-workspace btn-secondary" onClick={() => { const reason = window.prompt('Reason for rejecting this run?') || ''; onAction('reject', selected, { reason }); }} disabled={Boolean(actionId)}><XCircle className="h-4 w-4" />Reject &amp; Rollback</button><button type="button" className="btn-workspace btn-primary" onClick={() => onAction('approve', selected)} disabled={Boolean(actionId) || !hasAppliedChanges} title={!hasAppliedChanges ? 'The agent has not applied file changes to its branch' : 'Approve and merge the branch'}><CheckCircle2 className="h-4 w-4" />Approve &amp; Merge</button></>}
                {actionId === selected._id && <Loader2 className="h-4 w-4 animate-spin text-[#2fd6e6]" />}
              </div></div>
              {reviewable && !hasAppliedChanges && <p className="mt-3 text-xs text-[#e5b84a]">This worker has returned a plan and response, but has not written files to the branch. Merge stays disabled until branch edits are supported.</p>}
            </footer>
          </>}
        </section>
      </div>
    </div>
  );
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
  const [activeView, setActiveView] = useState('chat');
  const [agentSessions, setAgentSessions] = useState([]);
  const [selectedExecution, setSelectedExecution] = useState(null);
  const [loadingAgentSessions, setLoadingAgentSessions] = useState(false);
  const [agentActionId, setAgentActionId] = useState('');
  const [followUp, setFollowUp] = useState('');
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
    if (!router.isReady || !router.query.executionId) return;
    setActiveView('runs');
    fetchAgentSessions(router.query.executionId);
  }, [router.isReady, router.query.executionId]);

  useEffect(() => {
    if (activeView !== 'runs') return undefined;
    fetchAgentSessions();
    const id = setInterval(() => fetchAgentSessions(), 5000);
    return () => clearInterval(id);
  }, [activeView]);

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
      if (data.success) setSessions(data.sessions || []);
    } catch (err) {
      setError('Failed to load sessions');
    } finally {
      setLoadingSessions(false);
    }
  }

  async function fetchAgentSessions(preferredId) {
    setLoadingAgentSessions(true);
    try {
      const data = await apiFetch('/api/v1/agent/sessions');
      const loadedSessions = data.sessions || [];
      setAgentSessions(loadedSessions);
      const targetId = preferredId || router.query.executionId || selectedExecution?._id;
      if (targetId) setSelectedExecution(loadedSessions.find((item) => item._id === targetId) || null);
      else if (selectedExecution) setSelectedExecution(loadedSessions.find((item) => item._id === selectedExecution._id) || null);
    } catch (err) {
      setError(err.message || 'Failed to load agent runs');
    } finally {
      setLoadingAgentSessions(false);
    }
  }

  async function submitAgentAction(action, execution, extra = {}) {
    setAgentActionId(execution._id);
    setError(null);
    try {
      const result = await apiFetch(`/api/v1/agent/${action}`, {
        method: 'POST',
        body: JSON.stringify({ executionId: execution._id, taskId: execution.taskId, ...extra }),
      });
      if (result.execution) setSelectedExecution(result.execution);
      if (action === 'tweak') setFollowUp('');
      await fetchAgentSessions(execution._id);
    } catch (err) {
      setError(err.message || `Could not ${action} this agent run`);
    } finally {
      setAgentActionId('');
    }
  }

  async function fetchRepos() {
    try {
      const data = await apiFetch('/api/ai-pair/repos');
      if (data.success) setRepos(data.repositories || data.repos || []);
    } catch (err) {
      setError('Failed to load repositories');
    }
  }

  async function handleCreateSession() {
    if (!selectedRepo) return;
    setCreatingSession(true);
    setError(null);
    try {
      const repo = repos.find((r) =>
        typeof r === 'string' ? r === selectedRepo : (r.fullName || r.name) === selectedRepo
      );
      const repoName = typeof repo === 'object' && repo ? repo.name : selectedRepo;
      const data = await apiFetch('/api/ai-pair/session', {
        method: 'POST',
        body: JSON.stringify({
          repositoryId: String((typeof repo === 'object' && repo && repo.id) || selectedRepo),
          repositoryName: repoName,
          repositoryOwner: (typeof repo === 'object' && repo && repo.owner) || '',
          branch: (typeof repo === 'object' && repo && repo.defaultBranch) || 'main',
          sessionName: `${repoName} · ${selectedLang}`,
          language: selectedLang,
        }),
      });
      if (data.success && data.session) {
        const sess = data.session;
        setSessions((prev) => [sess, ...prev]);
        setActiveSession(sess);
        setMessages([]);
        setRemaining(aiLimit);
        setShowNewSession(false);
      } else {
        setError(data.message || 'Failed to create session');
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
    setError(null);
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
                <span>{activeSession ? `${activeSession.repositoryName || activeSession.repoName || 'Session'}${activeSession.language ? ` · ${activeSession.language}` : ''}` : 'No active session'}</span>
                <span className="dash-clock">· {clock || '—:——:——'}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="dash-pill hidden md:inline-flex">
                <span className="dot" style={{ background: remaining <= 0 ? '#f87171' : '#2fd6e6' }} />
                {aiLimit === Infinity ? `${remaining} messages` : `${remaining}/${aiLimit} today`}
              </span>
              {tier === 'developer' && (
                <button
                  type="button"
                  onClick={() => router.push('/pricing')}
                  className="dash-action"
                >
                  Upgrade to Pro
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
            <div className="mb-5 flex border-b border-white/10" role="tablist" aria-label="AI workspace mode">
              <button type="button" role="tab" aria-selected={activeView === 'chat'} onClick={() => setActiveView('chat')} className={`border-b-2 px-4 py-2 text-sm ${activeView === 'chat' ? 'border-[#2fd6e6] text-white' : 'border-transparent text-[#9aa1ae]'}`}>Pair chat</button>
              <button type="button" role="tab" aria-selected={activeView === 'runs'} onClick={() => setActiveView('runs')} className={`border-b-2 px-4 py-2 text-sm ${activeView === 'runs' ? 'border-[#2fd6e6] text-white' : 'border-transparent text-[#9aa1ae]'}`}>Agent runs</button>
            </div>
            {activeView === 'runs' ? (
              <AgentRunsPanel
                sessions={agentSessions}
                selected={selectedExecution}
                loading={loadingAgentSessions}
                error={error}
                followUp={followUp}
                setFollowUp={setFollowUp}
                setError={setError}
                onSelect={setSelectedExecution}
                onRefresh={() => fetchAgentSessions()}
                onAction={(action, execution, extra) => submitAgentAction(action, execution, extra)}
                actionId={agentActionId}
              />
            ) : (
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
                                <span className="ail-sess-name">{sess.repositoryName || sess.repoName || 'Session'}</span>
                              </span>
                              <span className="ail-sess-meta">
                                <span className="ail-sess-lang">{sess.language || '—'}</span>
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
            )}
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
              {error && (
                <div className="std-alert std-alert-error">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <p className="flex-1">{error}</p>
                </div>
              )}
              <div>
                <label className="ws-label">Repository</label>
                <select
                  value={selectedRepo}
                  onChange={(e) => setSelectedRepo(e.target.value)}
                  className="ws-select"
                >
                  <option value="">Select a repository...</option>
                  {repos.map((repo) => (
                    <option key={repo.fullName || repo.name || repo} value={repo.fullName || repo.name || repo}>
                      {repo.fullName || repo.name || repo}
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