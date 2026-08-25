import Head from 'next/head';
import ModernHeader from '../components/ModernHeader';
import Link from 'next/link';

export default function AuthSuccess() {
  return (
    <>
      <Head>
        <title>Authentication Successful - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="min-h-screen bg-[#0a1628] text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#1a2332] rounded-2xl border border-gray-700 p-8 text-center">
          <div className="w-16 h-16 bg-green-500 rounded-full mx-auto mb-6 flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
          </div>
          <h1 className="text-3xl font-bold mb-4">Authentication Successful</h1>
          <p className="text-gray-300 mb-8">You have successfully authenticated. Redirecting...</p>
          <Link href="/dashboard" className="inline-block cta-button px-8 py-3 rounded-lg text-white font-medium">Go to Dashboard</Link>
        </div>
      </div>
    </>
  );
}
