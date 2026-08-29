import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/router';
import { authApi } from '../lib/api';
import useAuthStore from '../store/authStore';

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const setAuth = useAuthStore((s) => s.setAuth);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await authApi.signin(email, password);
      if (result.success && result.token) {
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
        }
      } else {
        setError(result.message || 'Sign in failed');
      }
    } catch (err) {
      setError(err.message || 'Network error. Please check if the server is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Sign In - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Space Grotesk', sans-serif; }
          body { background: #0a1628; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; overflow-x: hidden; }
          .cube { position: fixed; width: 100px; height: 100px; animation: float 20s infinite ease-in-out; opacity: 0.08; z-index: 0; pointer-events: none; }
          .cube-1 { top: 10%; left: 5%; animation-delay: 0s; background: linear-gradient(135deg, #3b82f6, #10b981); border-radius: 25px; transform: rotate(45deg); }
          .cube-2 { top: 60%; right: 8%; animation-delay: 7s; background: linear-gradient(135deg, #10b981, #8b5cf6); border-radius: 25px; transform: rotate(25deg); }
          .cube-3 { bottom: 15%; left: 12%; animation-delay: 14s; background: linear-gradient(135deg, #8b5cf6, #3b82f6); border-radius: 25px; transform: rotate(65deg); }
          @keyframes float { 0%, 100% { transform: translateY(0) rotate(45deg); } 50% { transform: translateY(-60px) rotate(225deg); } }
          .container { position: relative; z-index: 1; width: 100%; max-width: 480px; }
          .header { text-align: center; margin-bottom: 40px; }
          .logo { display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 32px; }
          .logo-icon { width: 56px; height: 56px; background: transparent; border-radius: 16px; display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 24px rgba(59, 130, 246, 0.3); }
          .logo-icon img { width: 42px; height: 42px; }
          .logo-text { text-align: left; }
          .company-name { font-size: 24px; font-weight: 700; color: #fff; letter-spacing: -0.5px; }
          .company-subtitle { font-size: 11px; font-weight: 500; color: #64748b; letter-spacing: 2px; }
          .form-container { background: #1a2332; border: 1px solid #2d3748; border-radius: 24px; padding: 48px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3); }
          .form-header h1 { font-size: 32px; font-weight: 700; color: #fff; margin-bottom: 8px; }
          .form-header p { color: #94a3b8; font-size: 16px; margin-bottom: 32px; }
          .form-group { margin-bottom: 24px; }
          .form-group label { display: block; color: #e2e8f0; font-size: 14px; font-weight: 500; margin-bottom: 8px; }
          .input-container { position: relative; }
          .input-icon { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); width: 20px; height: 20px; color: #64748b; }
          input { width: 100%; padding: 14px 16px 14px 48px; background: #0a1628; border: 1px solid #334155; border-radius: 12px; color: #fff; font-size: 15px; transition: all 0.3s; }
          input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
          input::placeholder { color: #475569; }
          .toggle-password { position: absolute; right: 16px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; padding: 4px; }
          .toggle-password svg { width: 20px; height: 20px; color: #64748b; }
          .form-options { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
          .remember-me { display: flex; align-items: center; gap: 8px; }
          .remember-me input[type="checkbox"] { width: 18px; height: 18px; padding: 0; cursor: pointer; }
          .remember-me label { color: #cbd5e1; font-size: 14px; cursor: pointer; margin: 0; }
          .forgot-password { color: #3b82f6; text-decoration: none; font-size: 14px; font-weight: 500; transition: color 0.3s; }
          .forgot-password:hover { color: #60a5fa; }
          .signin-btn { width: 100%; padding: 16px; background: linear-gradient(135deg, #3b82f6, #8b5cf6); border: none; border-radius: 12px; color: #fff; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.3s; box-shadow: 0 4px 16px rgba(59, 130, 246, 0.3); }
          .signin-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(59, 130, 246, 0.4); }
          .signin-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
          .register-link { text-align: center; margin-top: 24px; color: #94a3b8; font-size: 14px; }
          .register-link a { color: #3b82f6; text-decoration: none; font-weight: 600; margin-left: 4px; }
          .register-link a:hover { color: #60a5fa; }
          .divider { display: flex; align-items: center; margin: 32px 0; color: #64748b; font-size: 14px; }
          .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: #334155; }
          .divider span { padding: 0 16px; }
          .social-login { display: flex; gap: 12px; }
          .social-btn { flex: 1; padding: 12px; background: #0a1628; border: 1px solid #334155; border-radius: 12px; color: #e2e8f0; font-size: 14px; font-weight: 500; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.3s; }
          .social-btn:hover { background: #1a2332; border-color: #475569; }
          .social-icon { width: 20px; height: 20px; }
          @media (max-width: 640px) { .form-container { padding: 32px 24px; } .form-header h1 { font-size: 28px; } }
        `}</style>
      </Head>

      <div className="min-h-screen flex flex-col">
        <div className="cube cube-1" />
        <div className="cube cube-2" />
        <div className="cube cube-3" />

        <div className="container">
          <div className="header">
            <div className="logo">
              <div className="logo-icon">
                <img src="/buildrs.png" alt="Logo" />
              </div>
              <div className="logo-text">
                <div className="company-name">BuildrsHQ</div>
                <div className="company-subtitle">PROFESSIONAL PLATFORM</div>
              </div>
            </div>
          </div>

          <div className="form-container">
            <div className="form-header">
              <h1>Welcome Back</h1>
              <p>Sign in to your account to continue</p>
            </div>

            <form onSubmit={handleSubmit}>
              {error && <div className="mb-4 p-3 rounded bg-red-500/10 border border-red-500 text-red-400 text-sm">{error}</div>}
              <div className="form-group">
                <label htmlFor="email">Email Address</label>
                <div className="input-container">
                  <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" required />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="password">Password</label>
                <div className="input-container">
                  <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><circle cx="12" cy="16" r="1"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  <input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••" required />
                  <button type="button" className="toggle-password" onClick={() => setShowPassword((v) => !v)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  </button>
                </div>
              </div>

              <div className="form-options">
                <div className="remember-me">
                  <input type="checkbox" id="remember" />
                  <label htmlFor="remember">Remember me</label>
                </div>
                <a href="#" className="forgot-password">Forgot Password?</a>
              </div>

              <button type="submit" className="signin-btn" disabled={loading}>{loading ? 'Signing In...' : 'Sign In'}</button>
            </form>

            <div className="register-link">Don&apos;t have an account? <Link href="/signup">Create Account</Link></div>

            <div className="divider"><span>OR</span></div>

            <div className="social-login">
              <button type="button" className="social-btn" onClick={() => window.location.href = authApi.google()}>
                <svg className="social-icon" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Google
              </button>
              <button type="button" className="social-btn" onClick={() => window.location.href = authApi.facebook()}>
                <svg className="social-icon" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                Facebook
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
