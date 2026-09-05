import Head from 'next/head';
import SiteShell from '../components/SiteShell';

const SECTIONS = [
  { title: 'Agreement to Terms', text: 'By accessing or using BuildrsHQ, you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree with any of these terms, you are prohibited from using this service.' },
  { title: 'Use License', text: 'Permission is granted to temporarily use BuildrsHQ for personal or commercial purposes. This license does not allow republishing, selling, or redistributing our content without explicit consent.' },
  { title: 'User Accounts', text: 'You are responsible for maintaining the confidentiality of your account credentials and for all activities under your account. Notify us immediately of unauthorized use.' },
  { title: 'Payment & Billing', text: 'Paid plans are billed in advance on a recurring basis. Fees are nonrefundable except as required by law. We may change pricing with reasonable notice.' },
  { title: 'Intellectual Property', text: 'All content, features, and functionality of BuildrsHQ are owned by BuildrsHQ and are protected by copyright, trademark, and other intellectual property laws.' },
  { title: 'Termination', text: 'We reserve the right to suspend or terminate access to the service at our discretion, without notice, for conduct that we believe violates these terms or is harmful to other users, us, or third parties.' },
  { title: 'Limitation of Liability', text: 'BuildrsHQ shall not be liable for any indirect, incidental, special, or consequential damages resulting from your use or inability to use the service.' },
  { title: 'Governing Law', text: 'These terms are governed by and construed in accordance with applicable laws, without regard to conflict of law principles.' },
  { title: 'Contact Information', text: 'Questions about these Terms should be sent to legal@buildrshq.dev.' },
];

export default function Terms() {
  return (
    <>
      <Head>
        <title>Terms of Service — BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <SiteShell>
        {/* Hero */}
        <section className="relative overflow-hidden pt-36 pb-14 sm:pt-44">
          <div className="mkt-hero-bg" />
          <div className="relative mx-auto max-w-[860px] px-5 sm:px-8">
            <p className="mkt-eyebrow mb-6">
              <span className="dot">●</span> buildrs · legal
            </p>
            <h1 className="mkt-h1">Terms of service.</h1>
            <p className="mkt-mono mt-6 text-[12px] uppercase tracking-widest text-[#525764]">
              last updated · february 2026
            </p>
          </div>
        </section>

        {/* Sections */}
        <section className="mx-auto max-w-[860px] px-5 pb-24 sm:px-8">
          <div className="space-y-px overflow-hidden rounded-xl border border-[#ffffff12] bg-[#ffffff12]">
            {SECTIONS.map((s, i) => (
              <div key={s.title} className="flex flex-col gap-4 bg-[#0d0d12] p-7 sm:flex-row sm:gap-8 sm:p-8">
                <p className="mkt-num text-sm text-[#525764]">{`0${i + 1}`}</p>
                <div>
                  <h2 className="mkt-h3">{s.title}</h2>
                  <p className="mt-2.5 text-[14px] leading-relaxed text-[#a8adba]">{s.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </SiteShell>
    </>
  );
}