import Head from 'next/head';
import ModernHeader from '../components/ModernHeader';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../hooks/useAuth';

export default function SignIn() {
  const router = useRouter();
  const { signin, isLoading, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await signin(email, password);
    } catch (err) {
      // error handled in store
    }
  };

  return (
    <>
      <Head>
        <title>Sign In - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="min-h-screen bg-navy flex flex-col">
        <ModernHeader
          navigation={[]}
          ctaButtons={[
            { href: '/sign_in', label: 'Sign In' },
            { href: '/signup', label: 'Start Free Trial', primary: true },
          ]}
        />

        <main className="flex-1 flex items-center justify-center px-4">
          <div className="max-w-md w-full">
            <div className="bg-navy-light rounded-lg p-8 border border-gray-700">
              <h1 className="text-3xl font-bold mb-2 text-center">Welcome back</h1>
              <p className="text-gray-400 text-center mb-8">Sign in to your BuildrsHQ account</p>

              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <div className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-3 rounded">
                    {error}
                  </div>
                )}

                <div>
                  <label htmlFor="email" className="block text-sm font-medium mb-2">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-2 bg-navy border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-accent"
                    placeholder="you@example.com"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium mb-2">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full px-4 py-2 bg-navy border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-accent"
                    placeholder="••••••••"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full cta-button py-3 rounded-lg text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Signing in...' : 'Sign In'}
                </button>
              </form>

              <p className="text-center text-gray-400 mt-6">
                Don't have an account?{' '}
                <Link href="/signup" className="text-blue-accent hover:underline">
                  Sign up
                </Link>
              </p>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
