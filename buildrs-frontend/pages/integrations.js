import { useState, useEffect } from 'react';
import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch } from '../lib/api';
import { Link2, Unlink, ExternalLink, Loader2, Plug } from 'lucide-react';

const PROVIDERS = [
  {
    key: 'github',
    name: 'GitHub',
    color: 'bg-gray-800',
    description: 'Sync repositories, track commits, and manage code directly from BuildrsHQ.',
  },
  {
    key: 'discord',
    name: 'Discord',
    color: 'bg-indigo-600',
    description: 'Get real-time notifications and collaborate with your team via Discord channels.',
  },
  {
    key: 'slack',
    name: 'Slack',
    color: 'bg-purple-700',
    description: 'Receive project updates and task alerts in your Slack workspace.',
  },
  {
    key: 'figma',
    name: 'Figma',
    color: 'bg-purple-500',
    description: 'Import designs and collaborate with your design team seamlessly.',
  },
  {
    key: 'notion',
    name: 'Notion',
    color: 'bg-gray-900',
    description: 'Sync documentation, project notes, and knowledge base content.',
  },
  {
    key: 'vscode',
    name: 'VS Code',
    color: 'bg-blue-600',
    description: 'Connect your editor environment for enhanced code sync capabilities.',
    infoOnly: true,
  },
];

export default function Integrations() {
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);

  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connecting, setConnecting] = useState(null);
  const [disconnecting, setDisconnecting] = useState(null);

  const fetchIntegrations = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch('/api/integrations');
      setIntegrations(data.integrations || []);
    } catch (err) {
      console.error('Failed to load integrations:', err);
      setError(err.message || 'Failed to load integrations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const getStatus = (providerKey) => {
    return integrations.find((i) => i.provider === providerKey);
  };

  const handleConnect = async (providerKey) => {
    try {
      setConnecting(providerKey);
      const data = await apiFetch(`/api/integrations/${providerKey}/auth`);
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error(`Failed to initiate ${providerKey} connection:`, err);
      alert(`Failed to start ${providerKey} connection. Please try again.`);
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async (providerKey) => {
    if (!window.confirm(`Are you sure you want to disconnect ${providerKey}?`)) return;
    try {
      setDisconnecting(providerKey);
      await apiFetch(`/api/integrations/${providerKey}`, { method: 'DELETE' });
      setIntegrations((prev) => prev.filter((i) => i.provider !== providerKey));
    } catch (err) {
      console.error(`Failed to disconnect ${providerKey}:`, err);
      alert(`Failed to disconnect ${providerKey}. Please try again.`);
    } finally {
      setDisconnecting(null);
    }
  };

  const connectedCount = integrations.filter((i) => i.isActive).length;

  return (
    <AuthGuard>
      <Head>
        <title>Integrations - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="workspace-container">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main">
          <header className="workspace-header">
            <div className="flex items-center gap-6">
              <h1 className="text-xl font-bold">Integrations</h1>
              <span className="text-sm text-muted">
                {connectedCount} of {PROVIDERS.length} connected
              </span>
            </div>
            <div className="flex items-center gap-4">
              <button type="button" className="btn-workspace btn-secondary" onClick={fetchIntegrations}>
                Refresh
              </button>
            </div>
          </header>

          <div className="workspace-content">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                <span className="ml-3 text-muted">Loading integrations...</span>
              </div>
            ) : error ? (
              <div className="workspace-card">
                <div className="workspace-card-body text-center py-12">
                  <p className="text-red-400 mb-4">{error}</p>
                  <button type="button" className="btn-workspace btn-primary" onClick={fetchIntegrations}>
                    Retry
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {PROVIDERS.map((provider) => {
                  const status = getStatus(provider.key);
                  const isActive = status?.isActive;
                  const isConnecting = connecting === provider.key;
                  const isDisconnectingVal = disconnecting === provider.key;

                  return (
                    <div
                      key={provider.key}
                      className={`workspace-card ${isActive ? 'border border-green-500/30' : ''}`}
                    >
                      <div className="workspace-card-body">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-12 h-12 ${provider.color} rounded-lg flex items-center justify-center text-white font-bold text-lg`}
                            >
                              {provider.name[0]}
                            </div>
                            <div>
                              <h3 className="font-semibold text-white">{provider.name}</h3>
                              <p className="text-xs text-muted">Integration</p>
                            </div>
                          </div>
                          {provider.infoOnly ? (
                            <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded-full">
                              Info Only
                            </span>
                          ) : isActive ? (
                            <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full">
                              Connected
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-gray-500/20 text-gray-400 text-xs rounded-full">
                              Not Connected
                            </span>
                          )}
                        </div>

                        <p className="text-sm text-muted mb-4">{provider.description}</p>

                        {isActive && status && (
                          <div className="text-xs text-muted mb-4 space-y-1">
                            {status.providerUsername && (
                              <p>
                                <span className="text-white font-medium">{status.providerUsername}</span>
                              </p>
                            )}
                            {status.providerEmail && (
                              <p>{status.providerEmail}</p>
                            )}
                            {status.lastSyncedAt && (
                              <p>
                                Last synced: {new Date(status.lastSyncedAt).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        )}

                        <div className="flex gap-2">
                          {provider.infoOnly ? (
                            <span className="flex-1 text-center py-2 text-sm text-muted">
                              Built-in feature
                            </span>
                          ) : isActive ? (
                            <button
                              type="button"
                              className="btn-workspace btn-secondary flex-1 flex items-center justify-center gap-2"
                              onClick={() => handleDisconnect(provider.key)}
                              disabled={isDisconnectingVal}
                            >
                              {isDisconnectingVal ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Unlink className="w-4 h-4" />
                              )}
                              Disconnect
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn-workspace btn-primary flex-1 flex items-center justify-center gap-2"
                              onClick={() => handleConnect(provider.key)}
                              disabled={isConnecting}
                            >
                              {isConnecting ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Link2 className="w-4 h-4" />
                              )}
                              Connect
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
