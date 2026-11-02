import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import SiteShell from '../components/SiteShell';
import { apiFetch } from '../lib/api';

function firstQueryValue(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default function PaymentSuccess() {
  const router = useRouter();
  const [status, setStatus] = useState('idle');

  const reference = firstQueryValue(router.query.reference) || firstQueryValue(router.query.trxref);
  const transactionId = firstQueryValue(router.query.transaction_id);

  useEffect(() => {
    if (!router.isReady) return;
    if (!reference && !transactionId) return;

    let active = true;
    setStatus('verifying');

    const verify = async () => {
      try {
        if (transactionId) {
          await apiFetch('/api/v1/billing/flutterwave/verify', {
            method: 'POST',
            body: JSON.stringify({ transaction_id: transactionId }),
          });
        } else {
          await apiFetch('/api/v1/billing/paystack/verify', {
            method: 'POST',
            body: JSON.stringify({ reference }),
          });
        }
        if (active) setStatus('verified');
      } catch (err) {
        if (active) setStatus('error');
      }
    };

    verify();
    return () => {
      active = false;
    };
  }, [router.isReady, reference, transactionId]);

  const verifying = status === 'verifying';
  const failed = status === 'error';

  return (
    <>
      <Head>
        <title>{failed ? 'Payment Not Confirmed' : 'Payment Successful'} - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <SiteShell footer={false}>
        <section className="flex min-h-[85vh] items-center justify-center px-5">
          <div className="mkt-card w-full max-w-md p-8 text-center">
            <div className="mkt-mono mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full border border-[#12dce580] text-[20px] text-[#12dce5]">
              {failed ? '!' : '✓'}
            </div>
            <p className="mkt-eyebrow mb-3">
              <span className="dot">●</span> buildrs · billing
            </p>
            <h1 className="mkt-h3 text-xl">
              {failed ? 'We couldn\u2019t confirm your payment' : verifying ? 'Confirming your payment' : 'Payment successful'}
            </h1>
            <p className="mt-3 text-[13.5px] leading-relaxed text-[#a9b7c4]">
              {failed
                ? 'Your card may have been charged even though activation did not complete. Contact support with your payment reference and we will finish setting up your trial.'
                : verifying
                  ? 'One moment while we activate your subscription.'
                  : 'Thanks — your subscription is now active, and the whole workspace is unlocked.'}
            </p>
            <div className="mt-7 flex flex-col gap-3">
              <Link href="/dashboard" className="mkt-btn mkt-btn-primary w-full justify-center">
                Go to dashboard <span className="mkt-arrow">→</span>
              </Link>
              <Link href="/pricing" className="mkt-btn w-full justify-center">
                View plans
              </Link>
            </div>
          </div>
        </section>
      </SiteShell>
    </>
  );
}
