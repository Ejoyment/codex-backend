import Head from 'next/head';
import ModernHeader from '../components/ModernHeader';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { authApi } from '../lib/api';
import useAuthStore from '../store/authStore';

export default function VerifyEmail() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
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
    if (otp.length !== 4) return alert('Please enter the complete 4-digit code');
    setSubmitting(true);
    try {
      const result = await authApi.verifyOTP(sessionStorage.getItem('userEmail'), otp);
      if (result.success) {
        sessionStorage.setItem('otp', otp);
        if (result.token) {
          localStorage.setItem('authToken', result.token);
          setAuth(result.token, result.user || null);
        }
        router.push('/verify-success');
      } else {
        alert(result.message || 'Invalid OTP. Please try again.');
        setInputs(['', '', '', '']);
      }
    } catch (err) {
      if (err.data?.message) {
        alert(err.data.message);
      } else {
        alert('Network error. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    try {
      const result = await authApi.resendOTP(sessionStorage.getItem('userEmail'));
      if (result.success) {
        alert('Verification code has been resent to your email!');
        setInputs(['', '', '', '']);
      } else {
        alert(result.message || 'Error resending code');
      }
    } catch (err) {
      if (err.data?.message) {
        alert(err.data.message);
      } else {
        alert('Network error. Please try again.');
      }
    }
  };

  return (
    <>
      <Head>
        <title>Verify your Email - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="min-h-screen bg-gray-bg flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-navy rounded-full flex items-center justify-center"><span className="text-white text-sm font-bold">B</span></div>
                <span className="text-base font-semibold text-gray-700">BuildrsHQ</span>
              </div>
              <div className="flex space-x-1">
                <div className="w-3 h-3 bg-red-500 rounded-full" />
                <div className="w-3 h-3 bg-yellow-500 rounded-full" />
                <div className="w-3 h-3 bg-green-500 rounded-full" />
              </div>
            </div>

            <div className="text-center">
              <h2 className="text-2xl font-semibold text-gray-800 mb-3">Verify your Email</h2>
              <p className="text-sm text-gray-600 mb-8">We've sent a verification code to your email address</p>

              <form onSubmit={submit} className="mb-8">
                <div className="flex justify-center space-x-3 mb-8">
                  {inputs.map((val, idx) => (
                    <input
                      key={idx}
                      id={`otp-${idx}`}
                      type="text"
                      maxLength="1"
                      value={val}
                      onChange={(e) => onChange(idx, e.target.value)}
                      onKeyDown={(e) => onKeyDown(idx, e)}
                      className="w-14 h-14 text-center border border-gray-300 rounded-lg text-xl font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                      required
                    />
                  ))}
                </div>

                <button type="submit" disabled={submitting} className="w-full bg-navy text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-800 transition-colors disabled:opacity-50">
                  {submitting ? 'Verifying...' : 'Verify Email'}
                </button>
              </form>

              <p className="text-sm text-gray-500">
                Didn't receive the code? <button type="button" onClick={resend} className="text-navy hover:underline font-medium">Resend</button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
