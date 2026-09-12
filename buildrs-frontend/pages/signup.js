import Head from 'next/head';
import Link from 'next/link';
import { useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { authApi } from '../lib/api';
import { rateLimit, resetRateLimit, validate, getPasswordStrength, createSubmitGuard } from '../lib/security';

const submitGuard = createSubmitGuard();

export default function SignUp() {
  const router = useRouter();
  const [step, setStep] = useState('form');
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [plan, setPlan] = useState('team');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [rateLimited, setRateLimited] = useState(false);

  const passwordStrength = getPasswordStrength(password);

  const validateField = useCallback((name, value) => {
    const rulesMap = {
      fullName: ['required', 'fullName', 'noScript'],
      email: ['required', 'email'],
      password: ['required', 'password'],
    };
    const result = validate(value, rulesMap[name] || ['required']);
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

    const nameValid = validateField('fullName', fullName);
    const emailValid = validateField('email', email);
    const passValid = validateField('password', password);
    if (!nameValid || !emailValid || !passValid) { submitGuard.release(); return; }

    const rl = rateLimit('signup', { maxAttempts: 3, windowMs: 300000 });
    if (!rl.allowed) {
      setRateLimited(true);
      setError(`Too many attempts. Try again in ${rl.retryAfter}s`);
      submitGuard.release();
      return;
    }

    setLoading(true);
    try {
      const result = await authApi.signup(fullName, email, password);
      if (result.success) {
        resetRateLimit('signup');
        sessionStorage.setItem('userEmail', email);
        sessionStorage.setItem('userName', fullName);
        const otpResult = await authApi.sendOTP(email);
        if (otpResult.success) {
          setStep('verify');
        } else {
          setError(otpResult.message || 'Error sending verification code');
        }
      } else {
        setError(result.message || 'Error creating account');
      }
    } catch (err) {
      setError(err.message || 'Network error. Please check if the server is running.');
    } finally {
      setLoading(false);
      submitGuard.release();
    }
  };

  if (step === 'verify') {
    return (
      <>
        <Head>
          <title>Verify your email - BuildrsHQ</title>
          <link rel="icon" href="/buildrs.png" />
        </Head>
        <div className="verify-page auth-page">
          <div className="verify-card">
            <div className="verify-icon">
              <svg width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>
            <h2 className="verify-title">Check your email</h2>
            <p className="verify-text">We sent a verification link to</p>
            <p className="verify-email">{email}</p>
            <Link href="/verify-email" className="btn-gradient">Open verification page →</Link>
            <div className="verify-footer">
              Didn&apos;t receive it?{' '}
              <button onClick={async () => { await authApi.resendOTP(email); }}>Resend email</button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Create Account - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="signup-page auth-page">
        <div className="left-panel">
          <div className="left-bg" />
          <div className="left-overlay" />
          <div className="orb orb-blue" style={{ width: '600px', height: '600px', top: '-200px', right: '-100px', opacity: 0.3 }} />
          <div className="orb orb-cyan" style={{ width: '500px', height: '500px', bottom: '-100px', left: '-100px', opacity: 0.2 }} />

          <Link href="/" className="left-logo">
            <img src="/buildrs.png" alt="BuildrsHQ" />
            <div className="logo-text">Buildrs<span>HQ</span></div>
          </Link>

          <div className="quote">
            <div className="auth-eyebrow" style={{ marginBottom: 18 }}>
              <span className="dot" />
              What teams are saying
            </div>
            <blockquote className="quote-text">
              "The AI pair programmer catches real bugs before they hit review. It's like having a senior engineer available 24/7."
            </blockquote>
            <div className="quote-author">
              <div className="quote-avatar">BT</div>
              <div>
                <div className="quote-name">Beulah Tobin West</div>
                <div className="quote-role">Co-Founder, BUILDRSHQ</div>
              </div>
            </div>
          </div>

          <div className="feature-list">
            {['AI pair programmer (Groq-powered)', 'Real-time multi-cursor editing', 'GitHub, Slack, Discord integrations', 'Free forever on Starter plan'].map(f => (
              <div key={f} className="feature-item">
                <div className="feature-check">
                  <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                {f}
              </div>
            ))}
          </div>
        </div>

        <div className="right-panel">
          <div className="form-wrapper">
            <Link href="/" className="mobile-logo">
              <img src="/buildrs.png" alt="BuildrsHQ" />
              <div className="logo-text">Buildrs<span>HQ</span></div>
            </Link>

            <div className="form-header">
              <div className="auth-eyebrow">
                <span className="dot" />
                Create account
              </div>
              <h1>Get started</h1>
              <p>
                Already have one?{' '}
                <Link href="/sign_in">Sign in</Link>
              </p>
            </div>

            <div className="social-grid">
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
                <label htmlFor="fullName" className="form-label">FULL NAME</label>
                <input
                  id="fullName"
                  type="text"
                  className="input-base"
                  placeholder="Alex Chen"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  onBlur={() => validateField('fullName', fullName)}
                  autoComplete="name"
                  maxLength={100}
                  required
                />
                {fieldErrors.fullName && <p style={{ color: '#fca5a5', fontSize: '12px', marginTop: '4px' }}>{fieldErrors.fullName}</p>}
              </div>
              <div className="form-group">
                <label htmlFor="email" className="form-label">WORK EMAIL</label>
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
                <label htmlFor="password" className="form-label">PASSWORD</label>
                <input
                  id="password"
                  type="password"
                  className="input-base"
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => validateField('password', password)}
                  autoComplete="new-password"
                  maxLength={128}
                  required
                />
                {password.length > 0 && (
                  <div style={{ marginTop: '6px' }}>
                    <div style={{ display: 'flex', gap: '4px', marginBottom: '2px' }}>
                      {[0,1,2,3,4].map(i => (
                        <div key={i} style={{ flex: 1, height: '3px', borderRadius: '2px', background: i < passwordStrength.score ? passwordStrength.color : '#1d2029' }} />
                      ))}
                    </div>
                    <p style={{ fontSize: '11px', color: '#a8adba' }}>{passwordStrength.label}</p>
                  </div>
                )}
                {fieldErrors.password && <p style={{ color: '#fca5a5', fontSize: '12px', marginTop: '4px' }}>{fieldErrors.password}</p>}
              </div>

              <div className="form-group">
                <label className="form-label">PLAN</label>
                <div className="plan-grid">
                  <button type="button" onClick={() => setPlan('starter')} className={`plan-btn ${plan === 'starter' ? 'active' : ''}`}>
                    <div className="plan-name">Starter</div>
                    <div className="plan-sub">Free forever</div>
                  </button>
                  <button type="button" onClick={() => setPlan('team')} className={`plan-btn ${plan === 'team' ? 'active' : ''}`}>
                    <div className="plan-name">Team</div>
                    <div className="plan-sub">14-day free trial</div>
                  </button>
                </div>
              </div>

              <button type="submit" className="btn-gradient" disabled={loading || rateLimited}>
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full" style={{ animation: 'spin 1s linear infinite' }} />
                ) : (
                  <>Create account →</>
                )}
              </button>
            </form>

            <p className="terms-text">
              By signing up, you agree to our{' '}
              <Link href="/terms" style={{ color: '#a8adba', textDecoration: 'underline' }}>Terms</Link> and{' '}
              <Link href="/privacy" style={{ color: '#a8adba', textDecoration: 'underline' }}>Privacy Policy</Link>.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}