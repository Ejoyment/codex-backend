import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { useState, useEffect } from 'react';

export default function Profile() {
  const user = useAuthStore((s) => s.user);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.fullName || '');
      setEmail(user.email || '');
      setRole(user.role?.join(', ') || '');
    }
  }, [user]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('authToken')}` },
        body: JSON.stringify({ fullName: name, email }),
      });
      const data = await res.json();
      if (data.user) useAuthStore.getState().setAuth(localStorage.getItem('authToken'), data.user);
      alert('Profile updated');
    } catch (e) {
      alert('Update failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthGuard>
      <>
        <Head>
          <title>Profile - BuildrsHQ</title>
          <link rel="icon" href="/buildrs.png" />
        </Head>
        <div className="min-h-screen bg-navy flex">
          <Sidebar user={user} subscription={null} />
          <main className="workspace-main flex-1 ml-64">
            <header className="workspace-header">
              <h1 className="text-xl font-bold">Profile</h1>
            </header>
            <div className="p-6">
              <div className="bg-navy-light rounded-lg border border-gray-700 p-6 max-w-2xl">
                <form onSubmit={save} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium mb-2">Full Name</label>
                    <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-2 bg-navy border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-accent" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Email</label>
                    <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-2 bg-navy border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-accent" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Role</label>
                    <input value={role} disabled className="w-full px-4 py-2 bg-navy border border-gray-700 rounded-lg text-gray-400" />
                  </div>
                  <button type="submit" disabled={saving} className="cta-button px-4 py-2 rounded-lg text-white font-medium disabled:opacity-50">{saving ? 'Saving...' : 'Save Changes'}</button>
                </form>
              </div>
            </div>
          </main>
        </div>
      </>
    </AuthGuard>
  );
}
