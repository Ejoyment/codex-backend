import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import useToastStore from '../store/toastStore';
import SiteShell from '../components/SiteShell';

const CHANNELS = [
  {
    tag: 'general',
    title: 'Email us',
    desc: 'The right inbox for questions, partnerships, and everything in between.',
    href: 'mailto:hello@buildrshq.dev',
    label: 'hello@buildrshq.dev',
  },
  {
    tag: 'support',
    title: 'Support',
    desc: 'Stuck in your workspace? Start a ticket with full context, answered by AI.',
    href: '/support',
    label: 'open support center →',
  },
  {
    tag: 'community',
    title: 'Community',
    desc: 'Talk to the builders and other teams in the Buildrs community.',
    href: '#',
    label: 'join the community →',
  },
];

const OTHER = [
  ['sales', 'Interested in Buildrs for your team?', 'sales@buildrshq.dev'],
  ['technical', 'Need help with a specific issue?', 'support@buildrshq.dev'],
  ['press', 'Media inquiries and press kit.', 'press@buildrshq.dev'],
];

export default function Contact() {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    company: '',
    subject: 'General Inquiry',
    message: '',
  });
  const toast = useToastStore();

  const onChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const onSubmit = (e) => {
    e.preventDefault();
    toast.success('Message sent. We will get back to you soon.');
    setForm({ firstName: '', lastName: '', email: '', company: '', subject: 'General Inquiry', message: '' });
  };

  return (
    <>
      <Head>
        <title>Contact — BuildrsHQ</title>
        <meta
          name="description"
          content="Get in touch with the Buildrs team — sales, support, partnership, and press."
        />
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <SiteShell>
        {/* Hero */}
        <section className="relative overflow-hidden pt-36 pb-16 sm:pt-44">
          <div className="mkt-hero-bg" />
          <div className="relative mx-auto max-w-[1200px] px-5 sm:px-8">
            <p className="mkt-eyebrow mb-6">
              <span className="dot">●</span> buildrs · contact
            </p>
            <h1 className="mkt-h1">
              Talk to the <span className="accent">builders</span>.
            </h1>
            <p className="mkt-sub mt-6 max-w-[500px]">
              Real humans, open channels. Pick the one that fits and we will get back to you
              within a day.
            </p>
          </div>
        </section>

        {/* Channels */}
        <section className="mx-auto max-w-[1200px] px-5 sm:px-8">
          <div className="mkt-grid grid-cols-1 md:grid-cols-3">
            {CHANNELS.map((c) => (
              <div key={c.title} className="mkt-cell">
                <p className="mkt-mono text-[10.5px] uppercase tracking-widest text-[#525764]">{c.tag}</p>
                <h3 className="mkt-h3 mt-3">{c.title}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-[#a8adba]">{c.desc}</p>
                {c.href.startsWith('mailto:') ? (
                  <a href={c.href} className="mkt-mono mt-4 inline-block text-[12px] text-[#2fd6e6]">
                    {c.label}
                  </a>
                ) : (
                  <Link href={c.href} className="mkt-mono mt-4 inline-block text-[12px] text-[#2fd6e6]">
                    {c.label}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Form + side */}
        <section className="mx-auto grid max-w-[1200px] gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="mkt-card p-8 sm:p-10">
            <h2 className="mkt-h3">Send us a message</h2>
            <form onSubmit={onSubmit} className="mt-8 space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <label className="mkt-label">First name</label>
                  <input type="text" name="firstName" value={form.firstName} onChange={onChange} className="mkt-input" placeholder="Jane" required />
                </div>
                <div>
                  <label className="mkt-label">Last name</label>
                  <input type="text" name="lastName" value={form.lastName} onChange={onChange} className="mkt-input" placeholder="Doe" required />
                </div>
              </div>
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <label className="mkt-label">Email</label>
                  <input type="email" name="email" value={form.email} onChange={onChange} className="mkt-input" placeholder="jane@company.com" required />
                </div>
                <div>
                  <label className="mkt-label">Company</label>
                  <input type="text" name="company" value={form.company} onChange={onChange} className="mkt-input" placeholder="Acme Inc" />
                </div>
              </div>
              <div>
                <label className="mkt-label">Subject</label>
                <select name="subject" value={form.subject} onChange={onChange} className="mkt-select">
                  <option>General Inquiry</option>
                  <option>Sales</option>
                  <option>Partnership</option>
                  <option>Press</option>
                  <option>Careers</option>
                </select>
              </div>
              <div>
                <label className="mkt-label">Message</label>
                <textarea name="message" rows="5" value={form.message} onChange={onChange} className="mkt-textarea" placeholder="Tell us how we can help..." required />
              </div>
              <button type="submit" className="mkt-btn mkt-btn-primary w-full justify-center !py-3.5 text-[15px]">
                Send message <span className="mkt-arrow">→</span>
              </button>
            </form>
          </div>

          <div>
            <h2 className="mkt-h3">Other ways to reach us</h2>
            <div className="mt-6 space-y-px overflow-hidden rounded-xl border border-[#ffffff12] bg-[#ffffff12]">
              {OTHER.map(([name, desc, email]) => (
                <div key={name} className="bg-[#0d0d12] p-6">
                  <p className="mkt-mono text-[10.5px] uppercase tracking-widest text-[#2fd6e6]">{name}</p>
                  <p className="mt-2 text-[13.5px] text-[#a8adba]">{desc}</p>
                  <a href={`mailto:${email}`} className="mkt-mono mt-2 inline-block text-[12px] text-[#a8adba] hover:text-white">
                    {email}
                  </a>
                </div>
              ))}
            </div>

            <div className="mkt-card mt-6 p-6">
              <h3 className="mkt-h3">Prefer async?</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[#a8adba]">
                File it in the support center and an AI agent with workspace access starts triaging in seconds.
              </p>
              <Link href="/support" className="mkt-btn mt-5 !text-[14px]">
                Open support <span className="mkt-arrow">→</span>
              </Link>
            </div>
          </div>
        </section>
      </SiteShell>
    </>
  );
}