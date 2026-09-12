import Head from 'next/head';
import Link from 'next/link';
import { useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { authApi } from '../lib/api';
import useAuthStore from '../store/authStore';
import { rateLimit, resetRateLimit, validate, createSubmitGuard } from '../lib/security';
import useToastStore from '../store/toastStore';

const submitGuard = createSubmitGuard();

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [rateLimited, setRateLimited] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const toast = useToastStore();

  const validateField = useCallback((name, value) => {
    const rules = name === 'email' ? ['required', 'email'] : ['required', 'minLength:8'];
    const result = validate(value, rules);
    setFieldErrors(prev => {
      if (result.valid) { const n = { ...prev }; delete n[name]; return n; }
      return { ...prev, [name]: result.errors[0] };
    });
    return result.valid;
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!submitGuard.acquire()) return;

    const emailValid = validateField('email', email);
    const passValid = validateField('password', password);
    if (!emailValid || !passValid) { submitGuard.release(); return; }

    const rl = rateLimit('signin', { maxAttempts: 5, windowMs: 300000 });
    if (!rl.allowed) {
      setRateLimited(true);
      setError(`Too many attempts. Try again in ${rl.retryAfter}s`);
      submitGuard.release();
      return;
    }

    setLoading(true);
    try {
      const result = await authApi.signin(email, password);
      if (result.success && result.token) {
        resetRateLimit('signin');
        setAuth(result.token, result.user);
        if (result.user?.onboardingCompleted) {
          router.push('/dashboard');
        } else {
          router.push('/onboarding');
        }
      } else if (result.requiresVerification) {
        toast.info(result.message || 'Please verify your email. Sending code...');
        sessionStorage.setItem('userEmail', result.email || email);
        try {
          const otpResult = await authApi.sendOTP(result.email || email);
          if (otpResult.success) {
            toast.success('Verification code sent');
            router.push('/verify-email');
          } else {
            toast.error(otpResult.message || 'Error sending verification code');
            setError(otpResult.message || 'Error sending verification code');
          }
        } catch (otpErr) {
          toast.error(otpErr.message || 'Error sending verification code');
          setError(otpErr.message || 'Error sending verification code');
        }
      } else {
        setError(result.message || 'Sign in failed');
      }
    } catch (err) {
      if (err.status === 401) {
        setError('Invalid email or password');
      } else if (err.data?.message) {
        setError(err.data.message);
      } else {
        setError(err.message || 'Network error. Please check if the server is running.');
      }
    } finally {
      setLoading(false);
      submitGuard.release();
    }
  };

  return (
    <>
      <Head>
        <title>Sign In - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="signin-page auth-page">
        <div className="left-panel">
          <div className="left-bg" />
          <div className="left-overlay" />
          <div className="orb orb-blue" style={{ width: '600px', height: '600px', top: '-200px', left: '-200px', opacity: 0.35 }} />
          <div className="orb orb-cyan" style={{ width: '500px', height: '500px', bottom: '-100px', right: '-100px', opacity: 0.25 }} />

          <Link href="/" className="left-logo">
            <img src="/buildrs.png" alt="BuildrsHQ" />
            <div className="logo-text">
              Buildrs<span>HQ</span>
            </div>
          </Link>

          <div>
            <div className="auth-eyebrow" style={{ marginBottom: 24 }}>
              <span className="dot" />
              Live network
            </div>
            <div className="stats-grid">
              {[
                { label: 'PRs merged today', value: '247', color: '#2fd6e6' },
                { label: 'AI reviews', value: '1,834', color: '#34d399' },
                { label: 'Active sessions', value: '3,291', color: '#e5b84a' },
                { label: 'Avg AI latency', value: '94ms', color: '#2fd6e6' },
              ].map((s, i) => (
                <div key={s.label} className="stat-card" style={{ animation: 'authFadeUp 0.5s ease-out forwards', opacity: 0, animationDelay: `${i * 100}ms` }}>
                  <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
                  <div className="stat-label">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="live-indicator">
              <div className="ping-dot" />
              <span>Live platform metrics · Updated every 30s</span>
            </div>
          </div>

          <div className="testimonial">
            <p>"BuildrsHQ is the only platform that actually understands what we're building — not just what we type."</p>
            <div className="testimonial-author">
              <div className="testimonial-avatar">ET</div>
              <div>
                <div className="testimonial-name">Ejoymene Tamaraupere David</div>
                <div className="testimonial-role">CEO, Founder, CODEX INC ENTERPRISE - BUILDRSHQ </div>
              </div>
            </div>
          </div>
        </div>

        <div className="right-panel">
          <div className="form-wrapper">
            <Link href="/" className="mobile-logo">
              <img src="/buildrs.png" alt="BuildrsHQ" />
              <div className="logo-text">
                Buildrs<span>HQ</span>
              </div>
            </Link>

            <div className="form-header">
              <div className="auth-eyebrow">
                <span className="dot" />
                BuildrsHQ account
              </div>
              <h1>Welcome back</h1>
              <p>
                Don&apos;t have an account?{' '}
                <Link href="/signup">Sign up free</Link>
              </p>
            </div>

            <div className="social-grid" style={{ gridTemplateColumns: '1fr' }}>
              <button type="button" className="btn-ghost" onClick={() => window.location.href = authApi.google()}>
                <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Continue with Google
              </button>
            </div>

            <div className="divider">
              <span>or continue with email</span>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              {error && (
                <div className="mb-4 p-3 rounded" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.5)', color: '#fca5a5', fontSize: '14px' }}>
                  {error}
                </div>
              )}
              <div className="form-group">
                <label htmlFor="email" className="form-label">EMAIL</label>
                <input
                  id="email"
                  type="email"
                  className="input-base"
                  placeholder="alex@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => validateField('email', email)}
                  autoComplete="email"
                  maxLength={254}
                  required
                />
                {fieldErrors.email && <p style={{ color: '#fca5a5', fontSize: '12px', marginTop: '4px' }}>{fieldErrors.email}</p>}
              </div>
              <div className="form-group">
                <div className="password-row">
                  <label htmlFor="password" className="form-label">PASSWORD</label>
                  <Link href="#" className="forgot-password">Forgot password?</Link>
                </div>
                <input
                  id="password"
                  type="password"
                  className="input-base"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => validateField('password', password)}
                  autoComplete="current-password"
                  maxLength={128}
                  required
                />
                {fieldErrors.password && <p style={{ color: '#fca5a5', fontSize: '12px', marginTop: '4px' }}>{fieldErrors.password}</p>}
              </div>
              <button type="submit" className="btn-gradient" disabled={loading || rateLimited}>
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full" style={{ animation: 'spin 1s linear infinite' }} />
                ) : (
                  <>Sign in →</>
                )}
              </button>
            </form>

            <Link href="/setup-support-agent" className="support-link">
              Support agent? Sign in here →
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}