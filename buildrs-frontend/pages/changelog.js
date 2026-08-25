import Head from 'next/head';
import ModernHeader from '../components/ModernHeader';
import Link from 'next/link';

const versions = [
  { version: '2.5.0', tag: 'Latest', date: 'February 8, 2026', items: ['Added AI pair programming feature', 'Improved code completion speed by 40%', 'Fixed terminal rendering issues on Windows', 'Enhanced syntax highlighting for 15+ languages'] },
  { version: '2.4.0', date: 'January 25, 2026', items: ['New collaborative editing features', 'Improved Git integration', 'Fixed memory leak in large projects', 'Updated documentation'] },
  { version: '2.3.0', date: 'January 10, 2026', items: ['Added dark mode themes', 'Performance improvements', 'Bug fixes and stability improvements'] },
];

const footerLinks = [
  { title: 'Product', links: [{ href: '/features', label: 'Features' }, { href: '/pricing', label: 'Pricing' }, { href: '/changelog', label: 'Changelog' }] },
  { title: 'Company', links: [{ href: '/about', label: 'About' }, { href: '/blog', label: 'Blog' }, { href: '/careers', label: 'Careers' }] },
  { title: 'Resources', links: [{ href: '/docs', label: 'Documentation' }, { href: '/support', label: 'Support' }] },
  { title: 'Legal', links: [{ href: '/privacy', label: 'Privacy Policy' }, { href: '/terms', label: 'Terms of Service' }] },
];

export default function Changelog() {
  return (
    <>
      <Head>
        <title>Changelog - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="min-h-screen bg-[#0a1628] text-white overflow-x-hidden">
        <div className="cube cube-1" />
        <div className="cube cube-2" />
        <div className="cube cube-3" />

        <ModernHeader
          navigation={[
            { href: '/features', label: 'Features' },
            { href: '/pricing', label: 'Pricing' },
            { href: '/blog', label: 'Blog' },
            { href: '/changelog', label: 'Changelog' },
          ]}
          ctaButtons={[
            { href: '/sign_in', label: 'Sign In' },
            { href: '/signup', label: 'Start Free Trial', primary: true },
          ]}
        />

        <div className="h-20" />

        <section className="content py-20 px-4">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-5xl md:text-6xl font-bold mb-6 text-center">Changelog</h1>
            <p className="text-xl text-gray-300 mb-12 text-center">Track all updates and improvements to BuildrsHQ</p>

            <div className="space-y-8">
              {versions.map((v) => (
                <div key={v.version} className="bg-[#1a2332] p-8 rounded-xl border border-gray-700">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-2xl font-bold">Version {v.version}</h3>
                    {v.tag && <span className="bg-green-500 text-white px-3 py-1 rounded-full text-sm">{v.tag}</span>}
                  </div>
                  <div className="text-gray-400 mb-4">{v.date}</div>
                  <ul className="space-y-2 text-gray-300">
                    {v.items.map((item, idx) => (<li key={idx}>• {item}</li>))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer className="content bg-[#070F34] border-t border-gray-700 py-16 px-4">
          <div className="max-w-7xl mx-auto grid md:grid-cols-4 gap-8 mb-12">
            {footerLinks.map((group) => (
              <div key={group.title}>
                <h4 className="text-lg font-bold mb-4">{group.title}</h4>
                <ul className="space-y-2 text-gray-400">
                  {group.links.map((link) => (<li key={link.href}><Link href={link.href} className="hover:text-white transition">{link.label}</Link></li>))}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-700 pt-8 text-center text-gray-400">
            <p>&copy; 2026 BuildrsHQ. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </>
  );
}
