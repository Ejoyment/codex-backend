import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { useState } from 'react';

export default function Support() {
  const user = useAuthStore((s) => s.user);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    try {
      await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('authToken')}` },
        body: JSON.stringify({ subject, message }),
      });
      alert('Support ticket created');
      setSubject('');
      setMessage('');
      setSubmitted(false);
    } catch (e) {
      alert('Failed to create ticket');
      setSubmitted(false);
    }
  };

  return (
    <AuthGuard>
      <>
        <Head>
          <title>Support - BuildrsHQ</title>
          <link rel="icon" href="/buildrs.png" />
        </Head>
        <div className="min-h-screen bg-navy flex">
          <Sidebar user={user} subscription={null} />
          <main className="workspace-main flex-1 ml-64">
            <header className="workspace-header">
              <h1 className="text-xl font-bold">Support</h1>
            </header>
            <div className="p-6">
              <div className="bg-navy-light rounded-lg border border-gray-700 p-6 max-w-2xl">
                <form onSubmit={submit} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium mb-2">Subject</label>
                    <input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full px-4 py-2 bg-navy border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-accent" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Message</label>
                    <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows="6" className="w-full px-4 py-2 bg-navy border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-accent" required />
                  </div>
                  <button type="submit" disabled={submitted} className="cta-button px-4 py-2 rounded-lg text-white font-medium disabled:opacity-50">{submitted ? 'Submitting...' : 'Submit Ticket'}</button>
                </form>
              </div>
            </div>
          </main>
        </div>
      </>
    </AuthGuard>
  );
}
