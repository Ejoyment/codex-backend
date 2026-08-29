import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/router';
import { authApi } from '../lib/api';
import useAuthStore from '../store/authStore';

export default function SignUp() {
  const router = useRouter();
  const [step, setStep] = useState('form');
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [plan, setPlan] = useState('team');
  const [error, setError] = useState('');
  const setAuth = useAuthStore((s) => s.setAuth);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await authApi.signup(fullName, email, password);
      if (result.success) {
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
    }
  };

  if (step === 'verify') {
    return (
      <>
        <Head>
          <title>Verify your email - BuildrsHQ</title>
          <link rel="icon" href="/buildrs.png" />
          <style>{`
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Space Grotesk', sans-serif; background: #0a1628; min-height: 100vh; color: #f8fafc; }
            .verify-page { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 48px; }
            .verify-card { width: 100%; max-width: 420px; text-align: center; animation: fadeUp 0.5s ease-out; }
            .verify-icon {
              width: 80px; height: 80px; border-radius: 16px; display: flex; align-items: center; justify-content: center;
              margin: 0 auto 32px; background: rgba(34,211,238,0.12); border: 1px solid rgba(34,211,238,0.25);
            }
            .verify-title { font-size: 30px; font-weight: 800; margin-bottom: 12px; color: #f8fafc; }
            .verify-text { font-size: 14px; color: #94a3b8; margin-bottom: 8px; }
            .verify-email { font-family: 'Space Grotesk', monospace; font-size: 16px; color: #22d3ee; margin-bottom: 32px; }
            .btn-gradient {
              width: 100%; padding: 14px; background: linear-gradient(135deg, #3b82f6, #8b5cf6); border: none; border-radius: 8px;
              color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center;
              justify-content: center; gap: 8px; text-decoration: none; transition: all 0.2s;
            }
            .btn-gradient:hover { opacity: 0.9; transform: translateY(-1px); }
            .verify-footer { margin-top: 24px; font-size: 13px; color: #64748b; }
            .verify-footer button {
              background: none; border: none; color: #94a3b8; text-decoration: underline; cursor: pointer; font-size: 13px;
            }
            @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
          `}</style>
        </Head>
        <div className="verify-page">
          <div className="verify-card">
            <div className="verify-icon">
              <svg width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" style={{ color: '#22d3ee' }}>
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>
            <h2 className="verify-title">Check your email</h2>
            <p className="verify-text">We sent a verification link to</p>
            <p className="verify-email">{email}</p>
            <Link to="/verify-email" className="btn-gradient">Open verification page →</Link>
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
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Space Grotesk', sans-serif; background: #0a1628; min-height: 100vh; color: #f8fafc; }

          .signup-page { display: flex; min-height: 100vh; }

          .left-panel {
            display: none; width: 50%; flex-direction: column; justify-content: space-between; padding: 56px;
            position: relative; overflow: hidden; background: #0f172a; border-right: 1px solid #1e293b;
          }
          @media (min-width: 1024px) { .left-panel { display: flex; } }

          .left-bg {
            position: absolute; inset: 0;
            background-image: url('/IMG-20260131-WA0114.jpg');
            background-size: cover; background-position: center; background-repeat: no-repeat;
            z-index: 0;
          }
          .left-overlay {
            position: absolute; inset: 0;
            background: rgba(8, 12, 24, 0.55);
            z-index: 1;
          }
          .left-panel .orb {
            position: absolute;
            z-index: 5;
          }
          .left-panel .left-logo,
          .left-panel .quote,
          .left-panel .feature-list {
            position: relative;
            z-index: 10;
          }
          .orb { position: absolute; border-radius: 50%; pointer-events: none; filter: blur(100px); }
          .orb-blue { background: radial-gradient(circle, rgba(59,130,246,0.35), transparent 70%); }
          .orb-cyan { background: radial-gradient(circle, rgba(34,211,238,0.25), transparent 70%); }

          .left-logo {
            position: relative; z-index: 10; display: flex; align-items: center; gap: 12px;
            text-decoration: none; color: #f8fafc;
          }
          .left-logo img { width: 32px; height: 32px; object-fit: contain; transition: transform 0.3s; }
          .left-logo:hover img { transform: scale(1.1); }
          .logo-text { font-weight: 700; font-size: 16px; letter-spacing: -0.3px; }
          .logo-text span { color: #22d3ee; }

          .quote { position: relative; z-index: 10; }
          .quote-text { font-size: 22px; font-weight: 600; line-height: 1.4; color: #f8fafc; margin-bottom: 24px; }
          .quote-author { display: flex; align-items: center; gap: 12px; }
          .quote-avatar {
            width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
            font-size: 14px; font-weight: 700; background: linear-gradient(135deg, #3b82f6, #22d3ee); color: #000;
          }
          .quote-name { font-size: 14px; font-weight: 600; color: #f8fafc; }
          .quote-role { font-size: 12px; color: #64748b; }

          .feature-list { position: relative; z-index: 10; display: flex; flex-direction: column; gap: 12px; }
          .feature-item { display: flex; align-items: center; gap: 12px; font-size: 14px; color: #94a3b8; }
          .feature-check {
            width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
            background: rgba(34,211,238,0.15); border: 1px solid rgba(34,211,238,0.3); flex-shrink: 0;
          }
          .feature-check svg { color: #22d3ee; }

          .right-panel {
            flex: 1; display: flex; align-items: center; justify-content: center; padding: 48px; background: #0a1628;
          }
          .form-wrapper { width: 100%; max-width: 400px; animation: fadeUp 0.5s ease-out; }
          .mobile-logo {
            display: flex; align-items: center; gap: 12px; margin-bottom: 40px; text-decoration: none; color: #f8fafc;
          }
          .mobile-logo img { width: 32px; height: 32px; object-fit: contain; }
          .mobile-logo .logo-text { font-weight: 700; font-size: 16px; }
          .mobile-logo .logo-text span { color: #22d3ee; }
          @media (min-width: 1024px) { .mobile-logo { display: none; } }

          .form-header { margin-bottom: 32px; }
          .form-header h1 { font-size: 30px; font-weight: 800; margin-bottom: 8px; color: #f8fafc; }
          .form-header p { font-size: 14px; color: #94a3b8; }
          .form-header a { color: #22d3ee; text-decoration: none; font-weight: 600; }
          .form-header a:hover { text-decoration: underline; }

          .social-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 24px; }
          .btn-ghost {
            width: 100%; padding: 12px; background: transparent; border: 1px solid #1e293b; border-radius: 8px;
            color: #e2e8f0; font-size: 14px; font-weight: 500; cursor: pointer; display: flex; align-items: center;
            justify-content: center; gap: 8px; transition: all 0.2s;
          }
          .btn-ghost:hover { background: rgba(255,255,255,0.05); border-color: #334155; }

          .divider { position: relative; text-align: center; margin: 24px 0; }
          .divider::before {
            content: ''; position: absolute; top: 50%; left: 0; right: 0; height: 1px; background: #1e293b;
          }
          .divider span {
            position: relative; background: #0a1628; padding: 0 16px; font-size: 12px; color: #64748b;
            font-family: 'Space Grotesk', monospace;
          }

          .form-group { margin-bottom: 20px; }
          .form-label { display: block; font-size: 12px; font-weight: 500; color: #64748b; margin-bottom: 8px; font-family: 'Space Grotesk', monospace; }
          .input-base {
            width: 100%; padding: 12px 16px; background: transparent; border: 1px solid #1e293b; border-radius: 8px;
            color: #f8fafc; font-size: 14px; outline: none; transition: border-color 0.2s, box-shadow 0.2s;
          }
          .input-base:focus { border-color: #22d3ee; box-shadow: 0 0 0 3px rgba(34,211,238,0.1); }
          .input-base::placeholder { color: #475569; }

          .plan-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
          .plan-btn {
            padding: 16px; background: transparent; border: 1px solid #1e293b; border-radius: 12px; cursor: pointer;
            text-align: left; transition: all 0.2s; color: #f8fafc;
          }
          .plan-btn:hover { border-color: #334155; }
          .plan-btn.active { background: rgba(59,130,246,0.12); border-color: #3b82f6; }
          .plan-name { font-size: 14px; font-weight: 600; margin-bottom: 2px; }
          .plan-sub { font-size: 12px; color: #64748b; }
          .plan-btn.active .plan-sub { color: #22d3ee; }

          .btn-gradient {
            width: 100%; padding: 14px; background: linear-gradient(135deg, #3b82f6, #8b5cf6); border: none; border-radius: 8px;
            color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center;
            justify-content: center; gap: 8px; transition: all 0.2s; margin-top: 8px;
          }
          .btn-gradient:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
          .btn-gradient:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

          .terms-text { margin-top: 24px; font-size: 12px; color: #64748b; text-align: center; }
          .terms-text a { color: #94a3b8; text-decoration: underline; }

          @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </Head>

      <div className="signup-page">
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
            <blockquote className="quote-text">
              "The AI pair programmer catches real bugs before they hit review. It's like having a senior engineer available 24/7."
            </blockquote>
            <div className="quote-author">
              <div className="quote-avatar">NK</div>
              <div>
                <div className="quote-name">Nadia K.</div>
                <div className="quote-role">Staff Engineer, Cloudflare</div>
              </div>
            </div>
          </div>

          <div className="feature-list">
            {['AI pair programmer (Groq-powered)', 'Real-time multi-cursor editing', 'GitHub, Slack, Discord integrations', 'Free forever on Starter plan'].map(f => (
              <div key={f} className="feature-item">
                <div className="feature-check">
                  <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24" style={{ color: '#22d3ee' }}>
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
              <h1>Create your account</h1>
              <p>
                Already have one?{' '}
                <Link href="/sign_in">Sign in</Link>
              </p>
            </div>

            <div className="social-grid">
              <button type="button" className="btn-ghost" onClick={() => window.location.href = authApi.google()}>
                <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Google
              </button>
              <button type="button" className="btn-ghost" onClick={() => window.location.href = authApi.facebook()}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                Facebook
              </button>
            </div>

            <div className="divider">
              <span>or continue with email</span>
            </div>

            <form onSubmit={handleSubmit}>
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
                  required
                />
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
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="password" className="form-label">PASSWORD</label>
                <input
                  id="password"
                  type="password"
                  className="input-base"
                  placeholder="Min. 12 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
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

              <button type="submit" className="btn-gradient" disabled={loading}>
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full" style={{ animation: 'spin 1s linear infinite' }} />
                ) : (
                  <>Create account →</>
                )}
              </button>
            </form>

            <p className="terms-text">
              By signing up, you agree to our{' '}
              <Link href="/terms" className="terms-text" style={{ color: '#94a3b8', textDecoration: 'underline' }}>Terms</Link> and{' '}
              <Link href="/privacy" className="terms-text" style={{ color: '#94a3b8', textDecoration: 'underline' }}>Privacy Policy</Link>.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
