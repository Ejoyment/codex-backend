import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { Video } from 'lucide-react';

export default function Meetings() {
  const user = useAuthStore((s) => s.user);

  return (
    <AuthGuard>
      <>
        <Head>
          <title>Meetings - BuildrsHQ</title>
          <link rel="icon" href="/buildrs.png" />
        </Head>
        <div className="min-h-screen bg-navy flex">
          <Sidebar user={user} subscription={null} />
          <main className="workspace-main flex-1 ml-64">
            <header className="workspace-header">
              <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold">Meetings</h1>
                <button type="button" className="cta-button px-4 py-2 rounded-lg text-white font-medium inline-flex items-center gap-2"><Video className="w-4 h-4" /> New Meeting</button>
              </div>
            </header>
            <div className="p-6">
              <div className="bg-navy-light rounded-lg border border-gray-700 divide-y divide-gray-700">
                {['Sprint Review', 'AI Pairing Session', 'Team Standup'].map((m) => (
                  <div key={m} className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-white">{m}</p>
                      <p className="text-sm text-gray-400">Today • 2:00 PM</p>
                    </div>
                    <span className="text-xs px-3 py-1 rounded-full bg-green-500/20 text-green-400">Upcoming</span>
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
