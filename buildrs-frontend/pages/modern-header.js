import Head from 'next/head';

export default function ModernHeaderPage() {
  return (
    <>
      <Head>
        <title>Modern Header - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>
      <div className="min-h-screen bg-navy flex items-center justify-center">
        <p className="text-gray-400">Modern header component preview is not needed as a standalone page.</p>
      </div>
    </>
  );
}
