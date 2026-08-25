import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { useState } from 'react';

export default function SourceCode() {
  const user = useAuthStore((s) => s.user);
  const [repo, setRepo] = useState('');

  return (
    <AuthGuard>
      <>
        <Head>
          <title>Source Code - BuildrsHQ</title>
          <link rel="icon" href="/buildrs.png" />
        </Head>
        <div className="min-h-screen bg-navy flex">
          <Sidebar user={user} subscription={null} />
          <main className="workspace-main flex-1 ml-64">
            <header className="workspace-header">
              <h1 className="text-xl font-bold">Source Code</h1>
            </header>
            <div className="p-6">
              <div className="bg-navy-light rounded-lg border border-gray-700 p-6 max-w-2xl">
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium mb-2">Repository</label>
                    <input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repo" className="w-full px-4 py-2 bg-navy border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-accent" />
                  </div>
                  <button type="button" className="cta-button px-4 py-2 rounded-lg text-white font-medium">Load Repository</button>
                </div>
              </div>
            </div>
          </main>
        </div>
      </>
    </AuthGuard>
  );
}
