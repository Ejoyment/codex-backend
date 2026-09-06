import Head from 'next/head';

export default function SkeletonLoader() {
  return (
    <>
      <Head>
        <title>Loading... - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>
      <div className="fixed inset-0 flex items-center justify-center bg-[#08080b]">
        <div className="text-center">
          <div
            className="w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center animate-pulse border border-[#ffffff12]"
            style={{ background: 'rgba(47, 214, 230, 0.12)' }}
          >
            <span className="text-[#2fd6e6] text-3xl font-bold">C</span>
          </div>
          <div className="text-[#565d6b] text-sm font-medium mb-4">Loading CODEX INC...</div>
          <div className="w-52 h-1 mx-auto rounded-full bg-[#ffffff0d] overflow-hidden">
            <div
              className="h-full w-full rounded-full"
              style={{
                background: '#2fd6e6',
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
