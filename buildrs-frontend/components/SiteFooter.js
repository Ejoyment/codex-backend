import Link from 'next/link';

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { href: '/features', label: 'Features' },
      { href: '/integrations', label: 'Integrations' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/changelog', label: 'Changelog' },
    ],
  },
  {
    title: 'Solutions',
    links: [
      { href: '/pricing', label: 'Startups' },
      { href: '/pricing', label: 'Remote teams' },
      { href: '/pricing', label: 'Agencies' },
      { href: '/pricing', label: 'Enterprise' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { href: '/docs', label: 'Docs' },
      { href: '/blog', label: 'Blog' },
      { href: '/support', label: 'Help center' },
      { href: '/changelog', label: 'Release notes' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/careers', label: 'Careers' },
      { href: '/contact', label: 'Contact' },
      { href: '/privacy', label: 'Privacy' },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-[#ffffff12]">
      <div className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8">
        <div className="grid grid-cols-2 gap-x-8 gap-y-12 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <img src="/buildrs.png" alt="BuildrsHQ" className="h-6 w-6 rounded" />
              <span className="text-[15px] font-semibold tracking-tight text-white">buildrs</span>
              <span className="mkt-mono text-[10px] uppercase tracking-widest text-[#686e7c]">· hq</span>
            </div>
            <p className="mt-4 max-w-[240px] text-[13px] leading-relaxed text-[#686e7c]">
              Your dev stack in one workspace — AI pair programming, live co-editing,
              tasks, and meetings. By CODEX INC.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="mkt-mono mb-4 text-[11px] uppercase tracking-[0.14em] text-[#686e7c]">
                {col.title}
              </h4>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="text-[13.5px] text-[#a8adba] transition-colors hover:text-white">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-[#ffffff0d] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="mkt-mono text-[11px] text-[#525764]">
            © 2026 buildrs · CODEX INC ENTERPRISE · built to ship
          </p>
          <div className="mkt-mono flex items-center gap-2 text-[11px] text-[#525764]">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: '#2fd6e6' }} />
            buildrshq.dev · status: stable
          </div>
        </div>
      </div>
    </footer>
  );
}