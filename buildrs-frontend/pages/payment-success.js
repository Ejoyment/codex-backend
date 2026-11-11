import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import SiteShell from '../components/SiteShell';
import { apiFetch } from '../lib/api';

function firstQueryValue(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * Provider callback landing page.
 *
 * Stripe, Paystack and Flutterwave all redirect here (the URLs are hardcoded
 * on the server), but the confirmation belongs on /billing — that is where the
 * purchase started and where the Figma "Payment Successful" frame lives. So
 * this page verifies the transaction when the provider hands back a reference
 * and then hands straight off to /billing with a `payment` flag.
 */
export default function PaymentSuccess() {
  const router = useRouter();
  const [status, setStatus] = useState('verifying');

  const reference = firstQueryValue(router.query.reference) || firstQueryValue(router.query.trxref);
  const transactionId = firstQueryValue(router.query.transaction_id);
  const provider = firstQueryValue(router.query.provider);

  useEffect(() => {
    if (!router.isReady) return;

    let active = true;

    const verify = async () => {
      if (transactionId) {
        await apiFetch('/api/v1/billing/flutterwave/verify', {
          method: 'POST',
          body: JSON.stringify({ transaction_id: transactionId }),
        });
      } else if (reference) {
        await apiFetch('/api/v1/billing/paystack/verify', {
          method: 'POST',
          body: JSON.stringify({ reference }),
        });
      }
    };

    const run = async () => {
      try {
        await verify();
        if (!active) return;
        router.replace({ pathname: '/billing', query: { payment: 'success', ...(provider ? { provider } : {}) } });
      } catch (err) {
        if (!active) return;
        setStatus('error');
        router.replace({ pathname: '/billing', query: { payment: 'failed', ...(provider ? { provider } : {}) } });
      }
    };

    run();

    return () => {
      active = false;
    };
  }, [router.isReady, reference, transactionId, provider]);

  const failed = status === 'error';

  return (
    <>
      <Head>
        <title>{`${failed ? 'Payment Not Confirmed' : 'Confirming Payment'} - BuildrsHQ`}</title>
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
              {failed ? 'We couldn\u2019t confirm your payment' : 'Confirming your payment'}
            </h1>
            <p className="mt-3 text-[13.5px] leading-relaxed text-[#a9b7c4]">
              {failed
                ? 'Your card may have been charged even though activation did not complete. Taking you back to billing — contact support with your payment reference if anything looks wrong.'
                : 'One moment while we activate your subscription and take you back to billing.'}
            </p>
          </div>
        </section>
      </SiteShell>
    </>
  );
}
