import Head from 'next/head';
import ModernHeader from '../components/ModernHeader';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../hooks/useAuth';

export default function AcceptInvitation() {
  const router = useRouter();
  const { token } = useAuth();
  const [status, setStatus] = useState('processing');
  const [message, setMessage] = useState('Accepting invitation...');

  useEffect(() => {
    const invitationToken = router.query.token;
    if (!invitationToken) {
      setStatus('error');
      setMessage('Invalid invitation link.');
      return;
    }

    const accept = async () => {
      if (!token) {
        router.replace(`/sign_in?redirect=/accept-invitation?token=${invitationToken}`);
        return;
      }

      try {
        const res = await fetch('/api/invitations/${invitationToken}/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('authToken')}` },
        });
        const data = await res.json();
        if (data.success) {
          setStatus('success');
          setMessage('Invitation accepted! Redirecting...');
          setTimeout(() => router.push('/dashboard'), 2000);
        } else {
          setStatus('error');
          setMessage(data.message || 'Failed to accept invitation.');
        }
      } catch (e) {
        setStatus('error');
        setMessage('Network error. Please try again.');
      }
    };

    accept();
  }, [router, token]);

  return (
    <>
      <Head>
        <title>Accept Invitation - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="min-h-screen bg-[#0a1628] text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#1a2332] rounded-2xl border border-gray-700 p-8 text-center">
          {status === 'processing' && (
            <>
              <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
              <h1 className="text-2xl font-bold mb-2">Accepting Invitation</h1>
              <p className="text-gray-300">{message}</p>
            </>
          )}
          {status === 'success' && (
            <>
              <div className="w-16 h-16 bg-green-500 rounded-full mx-auto mb-6 flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
              </div>
              <h1 className="text-2xl font-bold mb-2">Invitation Accepted</h1>
              <p className="text-gray-300 mb-6">{message}</p>
            </>
          )}
          {status === 'error' && (
            <>
              <div className="w-16 h-16 bg-red-500 rounded-full mx-auto mb-6 flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </div>
              <h1 className="text-2xl font-bold mb-2">Oops!</h1>
              <p className="text-gray-300 mb-6">{message}</p>
              <button type="button" onClick={() => router.push('/dashboard')} className="cta-button px-6 py-3 rounded-lg text-white font-medium">Go to Dashboard</button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
