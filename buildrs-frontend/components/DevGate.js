import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';

// Very simple dev lock for the auth pages. No backend involved: the typed
// password is compared client-side against NEXT_PUBLIC_DEV_PASSWORD and,
// on match, a flag in localStorage unlocks the real page.
//
// NOTE: this is obfuscation, not security — the expected value ships in the
// JS bundle. It keeps casual visitors out during dev; the real backend auth
// is untouched. For real protection, gate in middleware instead.

const FLAG = 'buildrs-dev-unlocked';

export default function DevGate({ title, children }) {
  const [checked, setChecked] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      setUnlocked(window.localStorage.getItem(FLAG) === '1');
    } catch {
      // storage unavailable — stay locked
    }
    setChecked(true);
  }, []);

  // Render nothing until the client check runs, so SSR HTML always matches.
  if (!checked) return null;
  if (unlocked) return <>{children}</>;

  const expected = process.env.NEXT_PUBLIC_DEV_PASSWORD || '';
  const configured = expected.length > 0;
  const waitlistUrl = process.env.NEXT_PUBLIC_WAITLIST_URL || '/';

  const submit = (e) => {
    e.preventDefault();
    setError('');
    if (!configured) {
      setError('Dev access is not configured on this deployment yet.');
      return;
    }
    if (pass === expected) {
      try {
        window.localStorage.setItem(FLAG, '1');
      } catch {
        // storage unavailable — unlock for this tab only
      }
      setPass('');
      setUnlocked(true);
    } else {
      setError('Wrong password. Try again.');
    }
  };

  return (
    <>
      <Head>
        <title>{title} — Dev preview</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>
      <div
        className="auth-page mkt"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: '440px', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '9px', marginBottom: '28px' }}>
            <img src="/buildrs.png" alt="Buildrs" style={{ width: '32px', height: '32px', borderRadius: '8px' }} />
            <span style={{ fontSize: '18px', fontWeight: 650, color: '#eceef1' }}>Buildrs</span>
            <span className="mkt-mono" style={{ fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#686e7c' }}>· hq</span>
          </div>

          <p className="mkt-mono" style={{ fontSize: '11px', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#2fd6e6', margin: '0 0 12px' }}>
            Dev preview
          </p>
          <h1 style={{ fontSize: 'clamp(28px,5vw,40px)', fontWeight: 700, letterSpacing: '-0.02em', color: '#eceef1', margin: '0 0 14px' }}>
            Welcome to Buildrs HQ
          </h1>
          <p style={{ fontSize: '15px', color: '#a8adba', lineHeight: 1.7, margin: '0 0 28px' }}>
            We&apos;re still in development, so {title.toLowerCase()} isn&apos;t open yet.
            Add yourself to the waitlist and we&apos;ll let you in on launch day.
          </p>

          <Link href={waitlistUrl} className="mkt-btn mkt-btn-primary" style={{ display: 'inline-block', padding: '12px 32px', fontSize: '15px', textDecoration: 'none' }}>
            Join the waitlist →
          </Link>

          <div style={{ marginTop: '22px' }}>
            <button
              type="button"
              onClick={() => { setShowPass((v) => !v); setError(''); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12.5px', color: '#686e7c', textDecoration: 'underline', textUnderlineOffset: '3px' }}
            >
              {showPass ? 'Hide dev access' : 'Dev access'}
            </button>

            {showPass && (
              <form onSubmit={submit} style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <input
                  type="password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  placeholder="Dev password"
                  autoComplete="off"
                  style={{
                    flex: 1, minWidth: 0, height: '44px', padding: '10px 16px',
                    borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(255,255,255,0.05)', color: '#eceef1',
                    fontSize: '14px', outline: 'none',
                  }}
                />
                <button
                  type="submit"
                  className="mkt-btn mkt-btn-primary"
                  style={{ height: '44px', padding: '0 20px', fontSize: '14px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  Enter
                </button>
              </form>
            )}
            {error && <p style={{ fontSize: '13px', color: '#f87171', marginTop: '10px' }}>{error}</p>}
          </div>
        </div>
      </div>
    </>
  );
}
