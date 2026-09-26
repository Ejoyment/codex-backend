import Head from 'next/head';
import { useState } from 'react';
import useToastStore from '../store/toastStore';
import SiteShell from '../components/SiteShell';
import {
  ScrollReveal,
  StaggerChildren,
  StaggerItem,
  ParticleField,
  MouseGlow,
  MagneticButton,
} from '../components/AnimationKit';

const SELLING_POINTS = [
  ['ai', 'a 30-minute run-through of the workspace, your stack in mind'],
  ['live', 'see real co-editing, the AI pair, and a standup in one session'],
  ['billing', 'pricing fit for your team size and region answered honestly'],
];

export default function Demo() {
  const [form, setForm] = useState({ fullName: '', email: '', company: '', teamSize: '', date: '', message: '' });
  const toastSuccess = useToastStore((s) => s.success);

  const onChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const onSubmit = (e) => {
    e.preventDefault();
    toastSuccess('Demo request received. We will reach out shortly.');
    setForm({ fullName: '', email: '', company: '', teamSize: '', date: '', message: '' });
  };

  return (
    <>
      <Head>
        <title>Schedule a Demo — BuildrsHQ</title>
        <meta
          name="description"
          content="Book a personalized walkthrough of Buildrs — see co-editing, the AI pair, and standups live."
        />
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <SiteShell>
        <MouseGlow />
        <ParticleField count={15} />
        {/* Hero */}
        <section className="relative overflow-hidden pt-36 pb-16 sm:pt-44">
          <div className="mkt-hero-bg" />
          <div className="relative mx-auto max-w-[1200px] px-5 sm:px-8">
            <ScrollReveal>
              <p className="mkt-eyebrow mb-6">
                <span className="dot">●</span> buildrs · demo
              </p>
            </ScrollReveal>
            <ScrollReveal delay={0.1}>
              <h1 className="mkt-h1">
                See it <span className="accent">live</span>.
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={0.2}>
              <p className="mkt-sub mt-6 max-w-[520px]">
                A personalized walkthrough of the workspace — 30 minutes, your questions answered
                with the product on screen.
              </p>
            </ScrollReveal>
          </div>
        </section>

        {/* Split */}
        <section className="mx-auto grid max-w-[1200px] gap-10 px-5 pb-20 sm:px-8 lg:grid-cols-[0.9fr_1.1fr]">
          <ScrollReveal direction="left">
          <div>
            <p className="mkt-eyebrow mb-6">
              <span className="dot">●</span> what you’ll see
            </p>
            <StaggerChildren className="space-y-px overflow-hidden rounded-xl border border-[#ffffff12] bg-[#ffffff12]" stagger={0.08}>
              {SELLING_POINTS.map(([tag, text]) => (
                <StaggerItem key={tag}>
                <div className="flex gap-5 bg-[#0d0d12] p-6">
                  <span className="mkt-pill flex-shrink-0">{tag}</span>
                  <p className="text-[13.5px] leading-relaxed text-[#a8adba]">{text}</p>
                </div>
                </StaggerItem>
              ))}
            </StaggerChildren>
            <div className="mkt-card mt-6 p-6">
              <div className="mkt-live mb-2">
                <span className="dot" />
                <span className="mkt-mono text-[11px] uppercase tracking-widest text-[#686e7c]">
                  no slideware — the live workspace
                </span>
              </div>
              <p className="text-[13px] leading-relaxed text-[#a8adba]">
                We demo the real product, not a deck. Bring your stack and we’ll talk through how
                Buildrs would sit in it.
              </p>
            </div>
          </div>
          </ScrollReveal>

          <ScrollReveal direction="right">
          <div className="mkt-card p-8 sm:p-10">
            <h2 className="mkt-h3">Request a slot</h2>
            <form onSubmit={onSubmit} className="mt-7 space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <label className="mkt-label">Full name</label>
                  <input type="text" name="fullName" value={form.fullName} onChange={onChange} className="mkt-input" placeholder="Jane Doe" required />
                </div>
                <div>
                  <label className="mkt-label">Work email</label>
                  <input type="email" name="email" value={form.email} onChange={onChange} className="mkt-input" placeholder="jane@company.com" required />
                </div>
              </div>
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <label className="mkt-label">Company</label>
                  <input type="text" name="company" value={form.company} onChange={onChange} className="mkt-input" placeholder="Acme Inc" required />
                </div>
                <div>
                  <label className="mkt-label">Team size</label>
                  <select name="teamSize" value={form.teamSize} onChange={onChange} className="mkt-select" required>
                    <option value="">Select</option>
                    <option value="1-10">1–10 people</option>
                    <option value="11-50">11–50 people</option>
                    <option value="51-200">51–200 people</option>
                    <option value="200+">200+ people</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mkt-label">Preferred date</label>
                <input type="date" name="date" value={form.date} onChange={onChange} className="mkt-input" required
                  style={{ colorScheme: 'dark' }}
                />
              </div>
              <div>
                <label className="mkt-label">Message <span className="normal-case tracking-normal">(optional)</span></label>
                <textarea name="message" rows="3" value={form.message} onChange={onChange} className="mkt-textarea" placeholder="Anything we should prep for?" />
              </div>
              <MagneticButton strength={0.08}>
                <button type="submit" className="mkt-btn mkt-btn-primary w-full justify-center !py-3.5 text-[15px]">
                  Request demo <span className="mkt-arrow">→</span>
                </button>
              </MagneticButton>
              <p className="mkt-mono text-center text-[11px] text-[#525764]">
                replies within one business day · no obligation
              </p>
            </form>
          </div>
          </ScrollReveal>
        </section>
      </SiteShell>
    </>
  );
}