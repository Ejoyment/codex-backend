import { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useAuthStore from '../store/authStore';
import { authApi } from '../lib/api';

export default function AuthSuccess() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    const handleAuthSuccess = async () => {
      if (token) {
        try {
          const res = await authApi.getMe();
          if (res.user?.onboardingCompleted) {
            router.replace('/dashboard');
          } else {
            router.replace('/onboarding');
          }
        } catch {
          router.replace('/sign_in');
        }
        return;
      }

      const hash = window.location.hash;
      const params = new URLSearchParams(hash.substring(1));
      const urlToken = params.get('token');

      if (!urlToken) {
        router.replace('/sign_in');
        return;
      }

      localStorage.setItem('authToken', urlToken);
      setAuth(urlToken, null);

      try {
        const res = await authApi.getMe();
        if (res.user) {
          setAuth(urlToken, res.user);
          if (res.user.onboardingCompleted) {
            router.replace('/dashboard');
          } else {
            router.replace('/onboarding');
          }
        } else {
          router.replace('/sign_in');
        }
      } catch {
        router.replace('/sign_in');
      }
    };

    handleAuthSuccess();
  }, [router, setAuth, token]);

  return (
    <>
      <Head>
        <title>Authentication Successful - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="min-h-screen bg-[#0a1628] text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#1a2332] rounded-2xl border border-gray-700 p-8 text-center">
          <div className="w-16 h-16 bg-green-500 rounded-full mx-auto mb-6 flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
          </div>
          <h1 className="text-3xl font-bold mb-4">Authentication Successful</h1>
          <p className="text-gray-300 mb-8">Completing authentication...</p>
          <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full mx-auto" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      </div>
    </>
  );
}
