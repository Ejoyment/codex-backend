import Head from 'next/head';
import ModernHeader from '../components/ModernHeader';
import Link from 'next/link';

const sections = [
  { title: 'Introduction', text: 'BuildrsHQ (“we”, “our”, or “us”) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform.' },
  { title: 'Information We Collect', text: 'We collect personal information such as name, email, company name, and payment information. We also collect usage data, device information, and logs to improve service reliability and performance.' },
  { title: 'How We Use Your Information', text: 'Your data is used to provide and improve the service, communicate updates, ensure security, and comply with legal obligations. We do not sell your personal data to third parties.' },
  { title: 'Data Sharing & Disclosure', text: 'We may share data with trusted service providers, comply with legal requests, or protect our rights and users. Aggregated anonymized data may be used for research and product improvements.' },
  { title: 'Security', text: 'We implement administrative, technical, and physical security measures to protect your data. However, no system is completely secure, and you should safeguard your credentials.' },
  { title: 'Your Rights', text: 'Depending on your jurisdiction, you may have rights to access, correct, delete, or export your data, and to object to certain processing. Contact us to exercise these rights.' },
  { title: 'Cookies', text: 'We use cookies and similar technologies to enhance your experience, analyze usage, and personalize content. You can manage cookie preferences through your browser settings.' },
  { title: 'Contact Us', text: 'If you have questions about this Privacy Policy, contact us at privacy@buildershq.com.' },
];

export default function Privacy() {
  return (
    <>
      <Head>
        <title>Privacy Policy - BuildrsHQ</title>
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
          ]}
          ctaButtons={[
            { href: '/sign_in', label: 'Sign In' },
            { href: '/signup', label: 'Start Free Trial', primary: true },
          ]}
        />

        <div className="h-20" />

        <section className="content py-20 px-4">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-4xl md:text-5xl font-bold mb-8 text-center">Privacy Policy</h1>
            <p className="text-gray-300 text-center mb-12">Last updated: February 2026</p>

            <div className="bg-[#1a2332] rounded-2xl border border-gray-700 p-8 md:p-12 space-y-10">
              {sections.map((s, i) => (
                <div key={i}>
                  <h2 className="text-2xl font-bold mb-3">{s.title}</h2>
                  <p className="text-gray-300 leading-relaxed">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer className="content bg-[#070F34] border-t border-gray-700 py-12 px-4">
          <div className="max-w-7xl mx-auto grid md:grid-cols-4 gap-8">
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/features" className="hover:text-white">Features</Link></li>
                <li><Link href="/pricing" className="hover:text-white">Pricing</Link></li>
                <li><Link href="/changelog" className="hover:text-white">Changelog</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/about" className="hover:text-white">About</Link></li>
                <li><Link href="/blog" className="hover:text-white">Blog</Link></li>
                <li><Link href="/careers" className="hover:text-white">Careers</Link></li>
                <li><Link href="/contact" className="hover:text-white">Contact</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Resources</h4>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/docs" className="hover:text-white">Documentation</Link></li>
                <li><Link href="/support" className="hover:text-white">Support</Link></li>
                <li><Link href="/privacy" className="hover:text-white">Privacy</Link></li>
                <li><Link href="/terms" className="hover:text-white">Terms</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-700 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2026 BuildrsHQ. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </>
  );
}
