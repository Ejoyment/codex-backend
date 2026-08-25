import Head from 'next/head';
import ModernHeader from '../components/ModernHeader';
import Link from 'next/link';
import AuthGuard from '../components/AuthGuard';
import { useAuth } from '../hooks/useAuth';

export default function Integrations() {
  const { token } = useAuth();

  const integrations = [
    { name: 'GitHub', desc: 'Sync your repositories and manage code directly from BuildrsHQ', provider: 'github', color: 'bg-gray-900', button: 'Connect GitHub' },
    { name: 'Figma', desc: 'Import designs and collaborate with your design team', provider: 'figma', color: 'bg-purple-600', button: 'Connect Figma' },
    { name: 'Slack', desc: 'Get notifications and updates in your Slack workspace', provider: 'slack', color: 'bg-purple-700', button: 'Connect Slack' },
    { name: 'VS Code', desc: 'Sync your VS Code settings and extensions', provider: 'vscode', color: 'bg-blue-600', button: 'Connect VS Code' },
    { name: 'Notion', desc: 'Sync documentation and project notes', provider: 'notion', color: 'bg-gray-800', button: 'Connect Notion' },
  ];

  return (
    <>
      <Head>
        <title>Integrations - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <AuthGuard>
        <div className="min-h-screen bg-gray-50 text-gray-900">
          <nav className="bg-white shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between h-16">
                <div className="flex items-center">
                  <span className="text-2xl font-bold text-blue-600">BuildrsHQ</span>
                </div>
                <div className="flex items-center space-x-4">
                  <Link href="/dashboard" className="text-gray-700 hover:text-blue-600">Dashboard</Link>
                  <Link href="/settings" className="text-gray-700 hover:text-blue-600">Settings</Link>
                </div>
              </div>
            </div>
          </nav>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Integrations</h1>
              <p className="text-gray-600">Connect your favorite tools to BuildrsHQ</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {integrations.map((item) => (
                <div key={item.provider} className="bg-white rounded-lg shadow-sm p-6 border-2 border-gray-200 hover:border-blue-500 transition">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className={`w-12 h-12 ${item.color} rounded-lg flex items-center justify-center text-white font-bold`}>{item.name[0]}</div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{item.name}</h3>
                        <p className="text-xs text-gray-500">Integration</p>
                      </div>
                    </div>
                    <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">Not Connected</span>
                  </div>
                  <p className="text-sm text-gray-600 mb-4">{item.desc}</p>
                  <button className="w-full bg-gray-900 text-white py-2 rounded-lg hover:bg-gray-800 transition">{item.button}</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </AuthGuard>
    </>
  );
}
