import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { Bell } from 'lucide-react';

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);

  return (
    <AuthGuard>
      <Head>
        <title>Dashboard - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="min-h-screen bg-navy flex">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main flex-1 ml-64">
          <header className="workspace-header">
            <div className="flex items-center gap-6">
              <h1 className="text-xl font-bold">Dashboard</h1>
              <div className="flex items-center gap-2">
                <span className="status-indicator status-online" />
                <span className="text-sm text-muted">All systems operational</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button type="button" className="btn-workspace btn-secondary" title="Notifications">
                <Bell className="w-4 h-4" />
              </button>
            </div>
          </header>

          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-navy-light rounded-lg p-6 border border-gray-700">
                <h3 className="text-sm font-medium text-gray-400 mb-2">Total Projects</h3>
                <p className="text-3xl font-bold">12</p>
              </div>
              <div className="bg-navy-light rounded-lg p-6 border border-gray-700">
                <h3 className="text-sm font-medium text-gray-400 mb-2">Active Sessions</h3>
                <p className="text-3xl font-bold">5</p>
              </div>
              <div className="bg-navy-light rounded-lg p-6 border border-gray-700">
                <h3 className="text-sm font-medium text-gray-400 mb-2">AI Chats Today</h3>
                <p className="text-3xl font-bold">24</p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
