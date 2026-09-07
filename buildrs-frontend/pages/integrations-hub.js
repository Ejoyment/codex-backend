import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch } from '../lib/api';
import { getAvatarUrl } from '../lib/utils';
import { GitBranch, MessageCircle, Hash, Figma, FileText, Monitor, Unplug, RefreshCw, CheckCircle2, ExternalLink, AlertCircle } from 'lucide-react';

const PROVIDERS = [
  {
    id: 'github',
    name: 'GitHub',
    category: 'Version Control',
    description: 'Connect repositories, track commits, manage issues and pull requests.',
    icon: GitBranch,
    color: '#e2e8f0',
    connectable: true,
  },
  {
    id: 'discord',
    name: 'Discord',
    category: 'Communication',
    description: 'Sync servers, channels, and messages for team communication.',
    icon: MessageCircle,
    color: '#5865f2',
    connectable: true,
  },
  {
    id: 'slack',
    name: 'Slack',
    category: 'Communication',
    description: 'Integrate workspaces, conversations, and channel history.',
    icon: Hash,
    color: '#e01e5a',
    connectable: true,
  },
  {
    id: 'figma',
    name: 'Figma',
    category: 'Design',
    description: 'Access design files, comments, and collaborate on visual assets.',
    icon: Figma,
    color: '#a259ff',
    connectable: true,
  },
  {
    id: 'notion',
    name: 'Notion',
    category: 'Documentation',
    description: 'Import docs, wikis, and project notes for centralized knowledge.',
    icon: FileText,
    color: '#ffffff',
    connectable: true,
  },
  {
    id: 'vscode',
    name: 'VS Code',
    category: 'IDE',
    description: 'Built-in editor integration for real-time code editing and collaboration.',
    icon: Monitor,
    color: '#007acc',
    connectable: false,
  },
];

const CATEGORY_ORDER = ['Version Control', 'Communication', 'Design', 'Documentation', 'IDE'];

export default function IntegrationsHub() {
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);

  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError] = useState(null);

  const fetchIntegrations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch('/api/integrations');
      setIntegrations(data.integrations || []);
    } catch (err) {
      setError(err.message || 'Failed to load integrations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  const handleConnect = async (providerId) => {
    try {
      setActionLoading(providerId);
      setError(null);
      const data = await apiFetch(`/api/integrations/${providerId}/auth`);
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setError(err.message || `Failed to connect ${providerId}`);
      setActionLoading(null);
    }
  };

  const handleDisconnect = async (providerId) => {
    try {
      setActionLoading(providerId);
      setError(null);
      await apiFetch(`/api/integrations/${providerId}`, { method: 'DELETE' });
      setIntegrations((prev) => prev.filter((i) => i.provider !== providerId));
    } catch (err) {
      setError(err.message || `Failed to disconnect ${providerId}`);
    } finally {
      setActionLoading(null);
    }
  };

  const isConnected = (providerId) => integrations.some((i) => i.provider === providerId && i.isActive);
  const getIntegration = (providerId) => integrations.find((i) => i.provider === providerId);

  const categories = CATEGORY_ORDER.map((cat) => ({
    name: cat,
    providers: PROVIDERS.filter((p) => p.category === cat),
  }));

  return (
    <AuthGuard>
      <Head>
        <title>Integrations Hub - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="workspace-container">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main">
          <header className="workspace-header">
            <div className="flex items-center gap-6">
              <h1 className="text-xl font-bold">Integrations Hub</h1>
              <div className="flex items-center gap-2">
                <span className="status-indicator status-online" />
                <span className="text-sm text-muted">Connect your tools</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                className="btn-workspace btn-secondary"
                onClick={fetchIntegrations}
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
              <img
                className="avatar"
                src={getAvatarUrl(user, user?.fullName || user?.name || 'User')}
                alt={user?.fullName || 'User'}
              />
            </div>
          </header>

          <div className="workspace-content">
            {error && (
              <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <RefreshCw className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-4" />
                  <p className="text-muted text-sm">Loading integrations...</p>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                {categories.map((category) => (
                  <div key={category.name}>
                    <div className="flex items-center gap-3 mb-4">
                      <h2 className="text-sm font-semibold text-white uppercase tracking-wider">{category.name}</h2>
                      <div className="flex-1 h-px bg-[var(--ws-border)]" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {category.providers.map((provider) => {
                        const Icon = provider.icon;
                        const connected = isConnected(provider.id);
                        const integration = getIntegration(provider.id);
                        const isAction = actionLoading === provider.id;

                        return (
                          <div
                            key={provider.id}
                            className="workspace-card integration-card rounded-xl transition-colors"
                          >
                            <div className="workspace-card-body">
                              <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                  <div
                                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                                    style={{ backgroundColor: `${provider.color}15` }}
                                  >
                                    <Icon className="w-6 h-6" style={{ color: provider.color }} />
                                  </div>
                                  <div>
                                    <h3 className="font-semibold text-white text-sm">{provider.name}</h3>
                                    {connected && integration?.providerUsername && (
                                      <p className="text-xs text-muted mt-0.5">{integration.providerUsername}</p>
                                    )}
                                  </div>
                                </div>
                                {connected ? (
                                  <span className="badge badge-green px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Connected
                                  </span>
                                ) : (
                                  <span className="badge badge-gray px-2 py-0.5 rounded text-[11px] font-medium">
                                    Not Connected
                                  </span>
                                )}
                              </div>

                              <p className="text-xs text-muted mb-4 leading-relaxed">{provider.description}</p>

                              <div className="flex items-center gap-2">
                                {provider.connectable ? (
                                  connected ? (
                                    <button
                                      type="button"
                                      className="btn-workspace btn-secondary text-xs flex-1 justify-center"
                                      onClick={() => handleDisconnect(provider.id)}
                                      disabled={isAction}
                                    >
                                      <Unplug className="w-3.5 h-3.5" />
                                      {isAction ? 'Disconnecting...' : 'Disconnect'}
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className="btn-workspace btn-primary text-xs flex-1 justify-center"
                                      onClick={() => handleConnect(provider.id)}
                                      disabled={isAction}
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                      {isAction ? 'Connecting...' : 'Connect'}
                                    </button>
                                  )
                                ) : (
                                  <div className="flex items-center gap-2 text-xs text-muted w-full justify-center py-1.5">
                                    <Monitor className="w-3.5 h-3.5" />
                                    <span>Built-in feature</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {!loading && PROVIDERS.filter((p) => !p.connectable).length === PROVIDERS.length && (
                  <div className="text-center py-12">
                    <p className="text-muted text-sm">All integrations are managed through your workspace settings.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
