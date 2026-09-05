import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../hooks/useAuth';
import { apiFetch } from '../lib/api';
import SiteShell from '../components/SiteShell';

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
        const res = await apiFetch(`/api/invitations/${invitationToken}/accept`, {
          method: 'POST',
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

      <SiteShell footer={false}>
        <section className="flex min-h-[85vh] items-center justify-center px-5">
          <div className="mkt-card w-full max-w-md p-8 text-center">
            <div className="relative mx-auto mb-6 flex h-14 w-14 items-center justify-center">
              {status === 'processing' && (
                <div
                  className="absolute inset-0 rounded-full border-2 border-[#2fd6e6] border-t-transparent"
                  style={{ animation: 'mkt-spin 1s linear infinite' }}
                />
              )}
              {status === 'success' && (
                <div className="mkt-mono flex h-14 w-14 items-center justify-center rounded-full border border-[#2fd6e680] text-[20px] text-[#2fd6e6]">✓</div>
              )}
              {status === 'error' && (
                <div className="mkt-mono flex h-14 w-14 items-center justify-center rounded-full border border-[#e5b84a80] text-[20px] text-[#e5b84a]">!</div>
              )}
            </div>
            <p className="mkt-eyebrow mb-3">
              <span className="dot">●</span> buildrs · invitation
            </p>
            <h1 className="mkt-h3 text-xl">
              {status === 'processing' && 'Accepting invitation'}
              {status === 'success' && 'Invitation accepted'}
              {status === 'error' && 'Something went wrong'}
            </h1>
            <p className="mt-3 text-[13.5px] text-[#a8adba]">{message}</p>
            {status === 'error' && (
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="mkt-btn mt-6 w-full justify-center"
              >
                Go to dashboard
              </button>
            )}
          </div>
        </section>
      </SiteShell>
    </>
  );
}