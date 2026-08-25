import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { Plus } from 'lucide-react';

export default function Tasks() {
  const user = useAuthStore((s) => s.user);

  return (
    <AuthGuard>
      <>
        <Head>
          <title>Tasks - BuildrsHQ</title>
          <link rel="icon" href="/buildrs.png" />
        </Head>
        <div className="min-h-screen bg-navy flex">
          <Sidebar user={user} subscription={null} />
          <main className="workspace-main flex-1 ml-64">
            <header className="workspace-header">
              <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold">Tasks</h1>
                <button type="button" className="cta-button px-4 py-2 rounded-lg text-white font-medium inline-flex items-center gap-2"><Plus className="w-4 h-4" /> New Task</button>
              </div>
            </header>
            <div className="p-6">
              <div className="bg-navy-light rounded-lg border border-gray-700 divide-y divide-gray-700">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-white">Sample Task {i}</p>
                      <p className="text-sm text-gray-400">Assigned to {user?.fullName || 'you'} • Due Feb {10 + i}</p>
                    </div>
                    <span className="text-xs px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-400">In Progress</span>
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
