import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';

export default function Standup() {
  const user = useAuthStore((s) => s.user);

  return (
    <AuthGuard>
      <>
        <Head>
          <title>Standup - BuildrsHQ</title>
          <link rel="icon" href="/buildrs.png" />
        </Head>
        <div className="min-h-screen bg-navy flex">
          <Sidebar user={user} subscription={null} />
          <main className="workspace-main flex-1 ml-64">
            <header className="workspace-header">
              <h1 className="text-xl font-bold">Standup</h1>
            </header>
            <div className="p-6">
              <div className="bg-navy-light rounded-lg border border-gray-700 p-6">
                <p className="text-gray-300">Daily standup updates will appear here.</p>
              </div>
            </div>
          </main>
        </div>
      </>
    </AuthGuard>
  );
}
