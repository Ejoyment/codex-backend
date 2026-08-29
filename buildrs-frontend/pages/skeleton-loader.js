import Head from 'next/head';

export default function SkeletonLoader() {
  return (
    <>
      <Head>
        <title>Loading... - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>
      <div className="fixed inset-0 flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div
            className="w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center animate-pulse"
            style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
          >
            <span className="text-white text-3xl font-bold">C</span>
          </div>
          <div className="text-slate-500 text-sm font-medium mb-4">Loading CODEX INC...</div>
          <div className="w-52 h-1 mx-auto rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full w-full rounded-full"
              style={{
                background: 'linear-gradient(90deg, #667eea, #764ba2)',
                animation: 'skeletonLoadingBar 1.5s ease-in-out infinite',
              }}
            />
          </div>
        </div>
      </div>
      <style jsx>{`
        @keyframes skeletonLoadingBar {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </>
  );
}
