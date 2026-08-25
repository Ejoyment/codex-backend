import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { MessageSquare } from 'lucide-react';

export default function Messaging() {
  const user = useAuthStore((s) => s.user);

  return (
    <AuthGuard>
      <>
        <Head>
          <title>Messaging - BuildrsHQ</title>
          <link rel="icon" href="/buildrs.png" />
        </Head>
        <div className="min-h-screen bg-navy flex">
          <Sidebar user={user} subscription={null} />
          <main className="workspace-main flex-1 ml-64">
            <header className="workspace-header">
              <h1 className="text-xl font-bold">Messaging</h1>
            </header>
            <div className="p-6">
              <div className="bg-navy-light rounded-lg border border-gray-700 h-[calc(100vh-140px)] flex">
                <div className="w-64 border-r border-gray-700 p-4">
                  <div className="space-y-3">
                    {['General', 'Engineering', 'Design', 'Random'].map((channel) => (
                      <div key={channel} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer">
                        <span className="text-gray-400">#</span>
                        <span className="text-sm text-gray-200">{channel}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex-1 flex flex-col">
                  <div className="flex-1 flex items-center justify-center text-gray-400">
                    <div className="text-center">
                      <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>Select a channel to start messaging</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </>
    </AuthGuard>
  );
}
