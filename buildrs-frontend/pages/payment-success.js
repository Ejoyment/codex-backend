import Head from 'next/head';
import Link from 'next/link';
import SiteShell from '../components/SiteShell';

export default function PaymentSuccess() {
  return (
    <>
      <Head>
        <title>Payment Successful - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <SiteShell footer={false}>
        <section className="flex min-h-[85vh] items-center justify-center px-5">
          <div className="mkt-card w-full max-w-md p-8 text-center">
            <div className="mkt-mono mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full border border-[#2fd6e680] text-[20px] text-[#2fd6e6]">
              ✓
            </div>
            <p className="mkt-eyebrow mb-3">
              <span className="dot">●</span> buildrs · billing
            </p>
            <h1 className="mkt-h3 text-xl">Payment successful</h1>
            <p className="mt-3 text-[13.5px] leading-relaxed text-[#a8adba]">
              Thanks — your subscription is now active, and the whole workspace is unlocked.
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