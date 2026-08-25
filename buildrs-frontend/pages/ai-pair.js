import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { useState, useEffect, useRef } from 'react';

export default function AiPair() {
  const user = useAuthStore((s) => s.user);
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  const startSession = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai-pair/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('authToken')}` },
        body: JSON.stringify({ title: 'New Session' }),
      });
      const data = await res.json();
      if (data.sessionId) setSessionId(data.sessionId);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const send = async (e) => {
    e.preventDefault();
    if (!input.trim() || !sessionId) return;
    const userMessage = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/ai-pair/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('authToken')}` },
        body: JSON.stringify({ sessionId, message: input }),
      });
      const data = await res.json();
      if (data.reply) setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  return (
    <AuthGuard>
      <>
        <Head>
          <title>AI Pair - BuildrsHQ</title>
          <link rel="icon" href="/buildrs.png" />
        </Head>
        <div className="min-h-screen bg-navy flex">
          <Sidebar user={user} subscription={null} />
          <main className="workspace-main flex-1 ml-64">
            <header className="workspace-header">
              <div className="flex items-center gap-6">
                <h1 className="text-xl font-bold">AI Pair</h1>
                {!sessionId && (
                  <button type="button" onClick={startSession} disabled={loading} className="cta-button px-4 py-2 rounded-lg text-white font-medium disabled:opacity-50">
                    {loading ? 'Starting...' : 'New Session'}
                  </button>
                )}
              </div>
            </header>
            <div className="p-6">
              <div className="bg-navy-light rounded-lg border border-gray-700 flex flex-col" style={{ height: 'calc(100vh - 140px)' }}>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {!sessionId && <p className="text-gray-400 text-center mt-10">Start a new session to begin pairing with AI.</p>}
                  {messages.map((m, i) => (
                    <div key={i} className={`chat-message flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] rounded-lg p-3 ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-navy-dark border border-gray-700 text-gray-200'}`}>
                        <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                      </div>
                    </div>
                  ))}
                  {loading && <div className="text-gray-400 text-sm">AI is typing...</div>}
                  <div ref={bottomRef} />
                </div>
                {sessionId && (
                  <form onSubmit={send} className="p-4 border-t border-gray-700 flex gap-3">
                    <input value={input} onChange={(e) => setInput(e.target.value)} className="flex-1 px-4 py-2 bg-navy border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-accent" placeholder="Ask AI anything..." />
                    <button type="submit" className="cta-button px-4 py-2 rounded-lg text-white font-medium">Send</button>
                  </form>
                )}
              </div>
            </div>
          </main>
        </div>
      </>
    </AuthGuard>
  );
}
