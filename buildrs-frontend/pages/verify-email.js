import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { authApi } from '../lib/api';
import useAuthStore from '../store/authStore';
import useToastStore from '../store/toastStore';

export default function VerifyEmail() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const toast = useToastStore();
  const [inputs, setInputs] = useState(['', '', '', '']);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem('userEmail');
    if (!stored) {
      router.replace('/signup');
    }
  }, [router]);

  const onChange = (idx, value) => {
    const next = [...inputs];
    next[idx] = value.replace(/[^0-9]/g, '').slice(0, 1);
    setInputs(next);
    if (next[idx] && idx < inputs.length - 1) {
      const el = document.getElementById(`otp-${idx + 1}`);
      if (el) el.focus();
    }
  };

  const onKeyDown = (idx, e) => {
    if (e.key === 'Backspace' && !inputs[idx] && idx > 0) {
      const el = document.getElementById(`otp-${idx - 1}`);
      if (el) el.focus();
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    const otp = inputs.join('');
    if (otp.length !== 4) {
      toast.error('Please enter the complete 4-digit code');
      return;
    }
    setSubmitting(true);
    try {
      const result = await authApi.verifyOTP(sessionStorage.getItem('userEmail'), otp);
      if (result.success) {
        sessionStorage.setItem('otp', otp);
        if (result.token) {
          localStorage.setItem('authToken', result.token);
          setAuth(result.token, result.user || null);
        }
        toast.success('Email verified successfully');
        router.push('/verify-success');
      } else {
        toast.error(result.message || 'Invalid OTP. Please try again.');
        setInputs(['', '', '', '']);
      }
    } catch (err) {
      if (err.data?.message) {
        toast.error(err.data.message);
      } else {
        toast.error('Network error. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    try {
      const result = await authApi.resendOTP(sessionStorage.getItem('userEmail'));
      if (result.success) {
        toast.success('Verification code has been resent to your email!');
        setInputs(['', '', '', '']);
      } else {
        toast.error(result.message || 'Error resending code');
      }
    } catch (err) {
      if (err.data?.message) {
        toast.error(err.data.message);
      } else {
        toast.error('Network error. Please try again.');
      }
    }
  };

  return (
    <>
      <Head>
        <title>Verify your Email - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
        <style>{`
          .otp-input {
            width: 60px;
            height: 68px;
            text-align: center;
            font-family: ui-monospace, 'SF Mono', SFMono-Regular, 'Cascadia Code', Menlo, Consolas, monospace;
            font-size: 26px;
            font-weight: 700;
            color: #2fd6e6;
            background: #08080b;
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px;
            outline: none;
            transition: border-color 0.2s, box-shadow 0.2s;
          }
          .otp-input:focus {
            border-color: rgba(47, 214, 230, 0.65);
            box-shadow: 0 0 0 3px rgba(47, 214, 230, 0.12);
          }
          .window-dot {
            width: 10px;
            height: 10px;
            border-radius: 999px;
            opacity: 0.75;
          }
        `}</style>
      </Head>

      <div className="verify-page auth-page">
        <div className="verify-card">
          <div className="flex items-center justify-between mb-8" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
            <Link href="/" className="flex items-center" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
              <img src="/buildrs.png" alt="BuildrsHQ" width="30" height="30" style={{ borderRadius: 7, objectFit: 'contain' }} />
              <span className="logo-text">Buildrs<span>HQ</span></span>
            </Link>
            <div style={{ display: 'flex', gap: 6 }}>
              <div className="window-dot" style={{ background: '#f87171' }} />
              <div className="window-dot" style={{ background: '#e5b84a' }} />
              <div className="window-dot" style={{ background: '#34d399' }} />
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div className="auth-eyebrow" style={{ justifyContent: 'center', marginBottom: 14 }}>
              <span className="dot" />
              Two-factor
            </div>
            <h2 className="verify-title" style={{ fontSize: 22 }}>Verify your email</h2>
            <p className="verify-text" style={{ margin: '6px 0 28px' }}>
              We&apos;ve sent a verification code to your email address
            </p>

            <form onSubmit={submit} style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: '28px' }}>
                {inputs.map((val, idx) => (
                  <input
                    key={idx}
                    id={`otp-${idx}`}
                    type="text"
                    maxLength="1"
                    value={val}
                    onChange={(e) => onChange(idx, e.target.value)}
                    onKeyDown={(e) => onKeyDown(idx, e)}
                    className="otp-input"
                    required
                  />
                ))}
              </div>

              <button type="submit" disabled={submitting} className="btn-gradient">
                {submitting ? 'Verifying...' : 'Verify email'}
              </button>
            </form>

            <p className="verify-footer">
              Didn&apos;t receive the code?{' '}
              <button type="button" onClick={resend} style={{ color: '#2fd6e6', border: 'none', background: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                Resend
              </button>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}