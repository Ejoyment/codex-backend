import Head from 'next/head';

export default function SkeletonLoader() {
  return (
    <>
      <Head>
        <title>Loading... - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>
      <div className="min-h-screen bg-navy flex items-center justify-center">
        <div className="text-white text-lg">Loading...</div>
      </div>
    </>
  );
}
