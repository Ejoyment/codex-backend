import Head from 'next/head';
import SiteShell from '../components/SiteShell';

const SECTIONS = [
  { title: 'Introduction', text: 'BuildrsHQ (“we”, “our”, or “us”) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform.' },
  { title: 'Information We Collect', text: 'We collect personal information such as name, email, company name, and payment information. We also collect usage data, device information, and logs to improve service reliability and performance.' },
  { title: 'How We Use Your Information', text: 'Your data is used to provide and improve the service, communicate updates, ensure security, and comply with legal obligations. We do not sell your personal data to third parties.' },
  { title: 'Your Code', text: 'Your source code and project content in the workspace are yours. We do not train AI models on your code, and project context is tenant-scoped and encrypted.' },
  { title: 'Data Sharing & Disclosure', text: 'We may share data with trusted service providers, comply with legal requests, or protect our rights and users. Aggregated anonymized data may be used for research and product improvements.' },
  { title: 'Security', text: 'We implement administrative, technical, and physical security measures to protect your data. However, no system is completely secure, and you should safeguard your credentials.' },
  { title: 'Your Rights', text: 'Depending on your jurisdiction, you may have rights to access, correct, delete, or export your data, and to object to certain processing. Contact us to exercise these rights.' },
  { title: 'Cookies', text: 'We use cookies and similar technologies to enhance your experience, analyze usage, and personalize content. You can manage cookie preferences through your browser settings.' },
  { title: 'Contact Us', text: 'If you have questions about this Privacy Policy, contact us at privacy@buildrshq.dev.' },
];

export default function Privacy() {
  return (
    <>
      <Head>
        <title>Privacy Policy — BuildrsHQ</title>
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
            <h1 className="mkt-h1">Privacy policy.</h1>
            <p className="mkt-sub mt-6 max-w-[560px]">
              Short version: your code is yours, we never sell your data, and we don’t train AI on
              your source. The details, below.
            </p>
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