import Head from 'next/head';
import ModernHeader from '../components/ModernHeader';
import Link from 'next/link';

export default function SetupSupportAgent() {
  return (
    <>
      <Head>
        <title>Setup Support Agent - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>
      <div className="min-h-screen bg-navy flex flex-col">
        <ModernHeader navigation={[]} ctaButtons={[{ href: '/sign_in', label: 'Sign In' }, { href: '/signup', label: 'Start Free Trial', primary: true }]} />
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="max-w-md w-full bg-navy-light rounded-lg p-8 border border-gray-700">
            <h1 className="text-2xl font-bold mb-4 text-center">Setup Support Agent</h1>
            <p className="text-gray-400 text-center mb-6">This setup flow is coming soon.</p>
            <Link href="/support" className="block text-center cta-button px-4 py-2 rounded-lg text-white font-medium">Go to Support</Link>
          </div>
        </main>
      </div>
    </>
  );
}
