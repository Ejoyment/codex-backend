import Head from 'next/head';
import ModernHeader from '../components/ModernHeader';
import Link from 'next/link';

const sections = [
  { title: 'Agreement to Terms', text: 'By accessing or using BuildrsHQ, you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree with any of these terms, you are prohibited from using this service.' },
  { title: 'Use License', text: 'Permission is granted to temporarily use BuildrsHQ for personal or commercial purposes. This license does not allow republishing, selling, or redistributing our content without explicit consent.' },
  { title: 'User Accounts', text: 'You are responsible for maintaining the confidentiality of your account credentials and for all activities under your account. Notify us immediately of unauthorized use.' },
  { title: 'Payment & Billing', text: 'Paid plans are billed in advance on a recurring basis. Fees are nonrefundable except as required by law. We may change pricing with reasonable notice.' },
  { title: 'Intellectual Property', text: 'All content, features, and functionality of BuildrsHQ are owned by BuildrsHQ and are protected by copyright, trademark, and other intellectual property laws.' },
  { title: 'Termination', text: 'We reserve the right to suspend or terminate access to the service at our discretion, without notice, for conduct that we believe violates these terms or is harmful to other users, us, or third parties.' },
  { title: 'Limitation of Liability', text: 'BuildrsHQ shall not be liable for any indirect, incidental, special, or consequential damages resulting from your use or inability to use the service.' },
  { title: 'Governing Law', text: 'These terms are governed by and construed in accordance with applicable laws, without regard to conflict of law principles.' },
  { title: 'Contact Information', text: 'Questions about these Terms should be sent to legal@buildershq.com.' },
];

export default function Terms() {
  return (
    <>
      <Head>
        <title>Terms of Service - BuildrsHQ</title>
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
            <h1 className="text-4xl md:text-5xl font-bold mb-8 text-center">Terms of Service</h1>
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
