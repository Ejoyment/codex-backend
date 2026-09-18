import Head from 'next/head';
import Link from 'next/link';
import SiteShell from '../components/SiteShell';

export default function AgentRegister() {
  return (
    <>
      <Head>
        <title>Setup Support Agent - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>
      <SiteShell footer={false}>
        <section className="flex min-h-[85vh] items-center justify-center px-5">
          <div className="mkt-card w-full max-w-md p-8 text-center">
            <p className="mkt-eyebrow mb-4">
              <span className="dot">●</span> buildrs · setup
            </p>
            <h1 className="mkt-h3 text-xl">Support agent setup</h1>
            <p className="mt-3 text-[13.5px] text-[#a8adba]">Configure your AI support agent.</p>
            <Link href="/support" className="mkt-btn mkt-btn-primary mt-6 w-full justify-center">
              Go to support <span className="mkt-arrow">→</span>
            </Link>
          </div>
        </section>
      </SiteShell>
    </>
  );
}