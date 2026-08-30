import { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useAuthStore from '../store/authStore';
import { authApi } from '../lib/api';

export default function VerifySuccess() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    const redirect = async () => {
      if (!token) {
        router.replace('/sign_in');
        return;
      }

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
    };

    redirect();
  }, [token, router]);

  return (
    <>
      <Head>
        <title>Email Verified - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="min-h-screen bg-[#0a1628] text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#1a2332] rounded-2xl border border-gray-700 p-8 text-center">
          <div className="w-16 h-16 bg-green-500 rounded-full mx-auto mb-6 flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
          </div>
          <h1 className="text-3xl font-bold mb-4">Email Verified</h1>
          <p className="text-gray-300 mb-8">Your email has been verified successfully. Redirecting...</p>
          <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full mx-auto" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      </div>
    </>
  );
}
