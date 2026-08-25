import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';

export default function Teams() {
  const user = useAuthStore((s) => s.user);

  return (
    <AuthGuard>
      <>
        <Head>
          <title>Teams - BuildrsHQ</title>
          <link rel="icon" href="/buildrs.png" />
        </Head>
        <div className="min-h-screen bg-navy flex">
          <Sidebar user={user} subscription={null} />
          <main className="workspace-main flex-1 ml-64">
            <header className="workspace-header">
              <h1 className="text-xl font-bold">Teams</h1>
            </header>
            <div className="p-6">
              <div className="grid md:grid-cols-3 gap-6">
                {['Engineering', 'Design', 'Product'].map((team) => (
                  <div key={team} className="bg-navy-light rounded-lg border border-gray-700 p-6">
                    <h3 className="text-lg font-bold mb-2">{team}</h3>
                    <p className="text-gray-400 text-sm mb-4">{team} team workspace</p>
                    <div className="flex -space-x-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="w-8 h-8 rounded-full bg-gray-600 border-2 border-navy-light" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </main>
        </div>
      </>
    </AuthGuard>
  );
}
