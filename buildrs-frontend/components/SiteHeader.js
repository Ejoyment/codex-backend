import Link from 'next/link';
import { useState } from 'react';

const NAV = [
  { href: '/features', label: 'Product' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/integrations', label: 'Integrations' },
  { href: '/blog', label: 'Blog' },
];

export default function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="mkt-header">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <div className="flex h-14 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/buildrs.png" alt="BuildrsHQ" className="h-6 w-6 rounded" />
            <span className="text-[15px] font-semibold tracking-tight text-white">
              buildrs
            </span>
            <span className="mkt-mono text-[10px] uppercase tracking-widest text-[#686e7c]">
              · hq
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="mkt-nav-link rounded-md px-3.5 py-1.5"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <Link
              href="/sign_in"
              className="mkt-nav-link rounded-md px-3.5 py-1.5"
            >
              Sign in
            </Link>
            <Link href="/signup" className="mkt-btn mkt-btn-primary !py-1.5 !px-4 !text-[13px]">
              Start free <span className="mkt-arrow">→</span>
            </Link>
          </div>

          <button
            type="button"
            aria-label="Toggle navigation"
            onClick={() => setOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-[#ffffff14] text-white md:hidden"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              {open ? (
                <path d="M3 3l10 10M13 3L3 13" />
              ) : (
                <path d="M2 4h12M2 8h12M2 12h12" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-[#ffffff12] bg-[#08080b] md:hidden">
          <div className="mx-auto max-w-[1200px] px-5 py-4">
            <div className="flex flex-col gap-1">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="rounded-md px-3 py-2.5 text-sm text-[#a8adba] hover:bg-white/5 hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
              <div className="h-px bg-[#ffffff12] my-2" />
              <Link
                href="/sign_in"
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2.5 text-sm text-[#a8adba]"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                onClick={() => setOpen(false)}
                className="mt-1 rounded-md px-3 py-2.5 text-center text-sm font-medium text-[#04181b]"
                style={{ background: '#2fd6e6' }}
              >
                Start free →
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}