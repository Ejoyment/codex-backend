import Head from 'next/head';
import Link from 'next/link';
import { useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { authApi } from '../lib/api';
import useAuthStore from '../store/authStore';
import { rateLimit, resetRateLimit, validate, createSubmitGuard } from '../lib/security';

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
        const confirmVerify = confirm(`${result.message || 'Please verify your email.'}\n\nWould you like to verify your email now?`);
        if (confirmVerify) {
          sessionStorage.setItem('userEmail', result.email || email);
          const otpResult = await authApi.sendOTP(result.email || email);
          if (otpResult.success) {
            router.push('/verify-email');
          } else {
            alert(otpResult.message || 'Error sending verification code');
          }
        } else {
          setError(result.message || 'Please verify your email before signing in.');
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
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Space Grotesk', sans-serif; background: #0a1628; min-height: 100vh; color: #f8fafc; }

          .signin-page { display: flex; min-height: 100vh; }

          .left-panel {
            display: none;
            width: 50%;
            flex-direction: column;
            justify-content: space-between;
            padding: 56px;
            position: relative;
            overflow: hidden;
            background: #0f172a;
            border-right: 1px solid #1e293b;
          }
          @media (min-width: 1024px) {
            .left-panel { display: flex; }
          }

          .left-bg {
            position: absolute;
            inset: 0;
            background-image: url('/IMG-20260131-WA0114.jpg');
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
            z-index: 0;
          }
          .left-overlay {
            position: absolute;
            inset: 0;
            background: rgba(8, 12, 24, 0.55);
            z-index: 1;
          }
          .left-panel .orb {
            position: absolute;
            z-index: 5;
          }
          .left-panel .left-logo,
          .left-panel .stats-grid,
          .left-panel .live-indicator,
          .left-panel .testimonial {
            position: relative;
            z-index: 10;
          }

          .orb {
            position: absolute;
            border-radius: 50%;
            pointer-events: none;
            filter: blur(100px);
          }
          .orb-blue {
            background: radial-gradient(circle, rgba(59,130,246,0.35), transparent 70%);
          }
          .orb-cyan {
            background: radial-gradient(circle, rgba(34,211,238,0.25), transparent 70%);
          }

          .left-logo {
            position: relative;
            z-index: 10;
            display: flex;
            align-items: center;
            gap: 12px;
            text-decoration: none;
            color: #f8fafc;
          }
          .left-logo img {
            width: 32px;
            height: 32px;
            object-fit: contain;
            transition: transform 0.3s;
          }
          .left-logo:hover img {
            transform: scale(1.1);
          }
          .logo-text {
            font-weight: 700;
            font-size: 16px;
            letter-spacing: -0.3px;
          }
          .logo-text span {
            color: #22d3ee;
          }

          .stats-grid {
            position: relative;
            z-index: 10;
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 16px;
            margin-bottom: 40px;
          }
          .stat-card {
            background: rgba(8,17,42,0.8);
            border: 1px solid #1e293b;
            border-radius: 12px;
            padding: 20px;
            backdrop-filter: blur(12px);
          }
          .stat-value {
            font-size: 24px;
            font-weight: 800;
            margin-bottom: 4px;
          }
          .stat-label {
            font-size: 12px;
            color: #64748b;
            font-family: 'Space Grotesk', monospace;
          }

          .live-indicator {
            position: relative;
            z-index: 10;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
            color: #64748b;
            font-family: 'Space Grotesk', monospace;
          }
          .ping-dot {
            position: relative;
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 999px;
            background: #22d3ee;
          }
          .ping-dot::before {
            content: '';
            position: absolute;
            inset: 0;
            border-radius: 999px;
            background: inherit;
            animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
          }

          .testimonial {
            position: relative;
            z-index: 10;
            background: rgba(8,17,42,0.8);
            border: 1px solid #1e293b;
            border-radius: 16px;
            padding: 24px;
            backdrop-filter: blur(12px);
          }
          .testimonial p {
            font-size: 14px;
            line-height: 1.6;
            color: #94a3b8;
            margin-bottom: 20px;
          }
          .testimonial-author {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .testimonial-avatar {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            font-weight: 700;
            background: linear-gradient(135deg, #3b82f6, #22d3ee);
            color: #000;
          }
          .testimonial-name {
            font-size: 14px;
            font-weight: 600;
            color: #f8fafc;
          }
          .testimonial-role {
            font-size: 12px;
            color: #64748b;
          }

          .right-panel {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 48px;
            background: #0a1628;
          }
          .form-wrapper {
            width: 100%;
            max-width: 400px;
            animation: fadeUp 0.5s ease-out;
          }
          .mobile-logo {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 40px;
            text-decoration: none;
            color: #f8fafc;
          }
          .mobile-logo img {
            width: 32px;
            height: 32px;
            object-fit: contain;
          }
          .mobile-logo .logo-text {
            font-weight: 700;
            font-size: 16px;
          }
          .mobile-logo .logo-text span {
            color: #22d3ee;
          }
          @media (min-width: 1024px) {
            .mobile-logo { display: none; }
          }

          .form-header {
            margin-bottom: 32px;
          }
          .form-header h1 {
            font-size: 30px;
            font-weight: 800;
            margin-bottom: 8px;
            color: #f8fafc;
          }
          .form-header p {
            font-size: 14px;
            color: #94a3b8;
          }
          .form-header a {
            color: #22d3ee;
            text-decoration: none;
            font-weight: 600;
          }
          .form-header a:hover {
            text-decoration: underline;
          }

          .social-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            margin-bottom: 24px;
          }
          .btn-ghost {
            width: 100%;
            padding: 12px;
            background: transparent;
            border: 1px solid #1e293b;
            border-radius: 8px;
            color: #e2e8f0;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: all 0.2s;
          }
          .btn-ghost:hover {
            background: rgba(255,255,255,0.05);
            border-color: #334155;
          }

          .divider {
            position: relative;
            text-align: center;
            margin: 24px 0;
          }
          .divider::before {
            content: '';
            position: absolute;
            top: 50%;
            left: 0;
            right: 0;
            height: 1px;
            background: #1e293b;
          }
          .divider span {
            position: relative;
            background: #0a1628;
            padding: 0 16px;
            font-size: 12px;
            color: #64748b;
            font-family: 'Space Grotesk', monospace;
          }

          .form-group {
            margin-bottom: 20px;
          }
          .form-label {
            display: block;
            font-size: 12px;
            font-weight: 500;
            color: #64748b;
            margin-bottom: 8px;
            font-family: 'Space Grotesk', monospace;
          }
          .input-base {
            width: 100%;
            padding: 12px 16px;
            background: transparent;
            border: 1px solid #1e293b;
            border-radius: 8px;
            color: #f8fafc;
            font-size: 14px;
            outline: none;
            transition: border-color 0.2s, box-shadow 0.2s;
          }
          .input-base:focus {
            border-color: #22d3ee;
            box-shadow: 0 0 0 3px rgba(34,211,238,0.1);
          }
          .input-base::placeholder {
            color: #475569;
          }

          .password-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 8px;
          }
          .forgot-password {
            font-size: 12px;
            color: #64748b;
            text-decoration: none;
            transition: color 0.2s;
          }
          .forgot-password:hover {
            color: #22d3ee;
          }

          .btn-gradient {
            width: 100%;
            padding: 14px;
            background: linear-gradient(135deg, #3b82f6, #8b5cf6);
            border: none;
            border-radius: 8px;
            color: #fff;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: all 0.2s;
            margin-top: 8px;
          }
          .btn-gradient:hover:not(:disabled) {
            opacity: 0.9;
            transform: translateY(-1px);
          }
          .btn-gradient:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
          }

          .support-link {
            display: block;
            text-align: center;
            margin-top: 24px;
            font-size: 12px;
            color: #64748b;
            text-decoration: none;
            transition: color 0.2s;
          }
          .support-link:hover {
            color: #94a3b8;
          }

          @keyframes fadeUp {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes ping {
            0% { transform: scale(1); opacity: 1; }
            75%, 100% { transform: scale(2); opacity: 0; }
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </Head>

      <div className="signin-page">
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
            <div className="stats-grid">
              {[
                { label: 'PRs merged today', value: '247', color: '#22d3ee' },
                { label: 'AI reviews', value: '1,834', color: '#60a5fa' },
                { label: 'Active sessions', value: '3,291', color: '#818CF8' },
                { label: 'Avg AI latency', value: '94ms', color: '#34D399' },
              ].map((s, i) => (
                <div key={s.label} className="stat-card" style={{ animation: 'fadeUp 0.5s ease-out forwards', opacity: 0, animationDelay: `${i * 100}ms` }}>
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
