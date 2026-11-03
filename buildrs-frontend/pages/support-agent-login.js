import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/router';
import { LogIn, Loader2 } from 'lucide-react';
import useToastStore from '../store/toastStore';

const API_BASE = 'https://codex-backend-7utu.onrender.com';

export default function SupportAgentLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const toast = useToastStore();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/support/agent/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.message || 'Login failed');
      if (data.token) localStorage.setItem('supportAgentToken', data.token);
      if (data.agent) localStorage.setItem('supportAgent', JSON.stringify(data.agent));
      toast.success('Logged in');
      router.push('/support-agent-dashboard');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Support Agent Login - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>
      <div className="min-h-screen bg-navy flex items-center justify-center p-6">
        <div className="workspace-card w-full max-w-md p-8">
          <div className="flex items-center gap-2.5 mb-6">
            <span className="card-ico"><LogIn className="w-4 h-4" /></span>
            <h1 className="text-xl font-bold text-white">Support Agent Login</h1>
          </div>
          {error && <div className="std-alert std-alert-error mb-4">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 bg-navy border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-accent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 bg-navy border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-accent"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="cta-button w-full px-4 py-2 rounded-lg text-white font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>
          <p className="text-sm text-gray-400 text-center mt-4">
            No account? <Link href="/support-agent-signup" className="text-blue-accent hover:underline">Sign up</Link>
          </p>
        </div>
      </div>
    </>
  );
}
