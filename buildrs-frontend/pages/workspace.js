import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';

export default function Workspace() {
  const user = useAuthStore((s) => s.user);

  return (
    <AuthGuard>
      <Head>
        <title>Workspace - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="min-h-screen bg-navy flex">
        <Sidebar user={user} subscription={null} />

        <main className="workspace-main flex-1 ml-64">
          <header className="workspace-header">
            <div className="flex items-center gap-6">
              <h1 className="text-xl font-bold">Workspace</h1>
            </div>
          </header>

          <div className="p-6">
            <div className="bg-navy-light rounded-lg p-8 border border-gray-700 text-center">
              <h2 className="text-2xl font-bold mb-4">Your Workspace</h2>
              <p className="text-gray-400 mb-6">
                Select a project or file from the sidebar to get started.
              </p>
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
