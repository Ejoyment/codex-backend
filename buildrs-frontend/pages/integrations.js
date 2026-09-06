import { useState, useEffect } from 'react';
import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch } from '../lib/api';
import useToastStore from '../store/toastStore';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Link2, Unlink, ExternalLink, Loader2, Plug2, User, RefreshCw } from 'lucide-react';

const PROVIDERS = [
  {
    key: 'github',
    name: 'GitHub',
    color: { bg: 'rgba(255,255,255,0.06)', text: '#e5e7eb' },
    description: 'Sync repositories, track commits, and manage code directly from BuildrsHQ.',
  },
  {
    key: 'discord',
    name: 'Discord',
    color: { bg: 'rgba(139,156,246,0.1)', text: '#8b9cf6' },
    description: 'Get real-time notifications and collaborate with your team via Discord channels.',
  },
  {
    key: 'slack',
    name: 'Slack',
    color: { bg: 'rgba(232,121,249,0.1)', text: '#e879f9' },
    description: 'Receive project updates and task alerts in your Slack workspace.',
  },
  {
    key: 'figma',
    name: 'Figma',
    color: { bg: 'rgba(192,132,252,0.1)', text: '#c084fc' },
    description: 'Import designs and collaborate with your design team seamlessly.',
  },
  {
    key: 'notion',
    name: 'Notion',
    color: { bg: 'rgba(255,255,255,0.06)', text: '#d4d4d8' },
    description: 'Sync documentation, project notes, and knowledge base content.',
  },
  {
    key: 'vscode',
    name: 'VS Code',
    color: { bg: 'rgba(96,165,250,0.1)', text: '#60a5fa' },
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
  const toast = useToastStore();
  const [confirmDisconnect, setConfirmDisconnect] = useState(null);
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () => {
      setClock(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

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
      toast.error(`Failed to start ${providerKey} connection. Please try again.`);
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async (providerKey) => {
    setConfirmDisconnect(providerKey);
  };

  const handleConfirmDisconnect = async () => {
    const providerKey = confirmDisconnect;
    if (!providerKey) return;
    setConfirmDisconnect(null);
    try {
      setDisconnecting(providerKey);
      await apiFetch(`/api/integrations/${providerKey}`, { method: 'DELETE' });
      setIntegrations((prev) => prev.filter((i) => i.provider !== providerKey));
      toast.success(`${providerKey} disconnected`);
    } catch (err) {
      console.error(`Failed to disconnect ${providerKey}:`, err);
      toast.error(`Failed to disconnect ${providerKey}. Please try again.`);
    } finally {
      setDisconnecting(null);
    }
  };

  const connectedCount = integrations.filter((i) => i.isActive).length;
  const availableCount = PROVIDERS.filter((p) => !p.infoOnly).length;
  const infoCount = PROVIDERS.filter((p) => p.infoOnly).length;
  const unconnectedCount = availableCount - connectedCount;

  function formatLastSync(dateStr) {
    if (!dateStr) return 'Synced pending';
    const d = new Date(dateStr);
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff < 60_000) return 'Synced just now';
    if (diff < 3_600_000) return `Synced ${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `Synced ${Math.floor(diff / 3_600_000)}h ago`;
    return `Synced ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }

  return (
    <AuthGuard>
      <Head>
        <title>Integrations - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="workspace-container">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main">
          <header className="workspace-header dash-header">
            <div>
              <p className="dash-crumb">
                BuildrsHQ <span className="sep">/</span> Integrations
              </p>
              <h1 className="dash-title">Integrations</h1>
              <div className="dash-statusline">
                <span className="status-indicator status-online" />
                <span>{connectedCount} of {availableCount} integrations connected</span>
                <span className="dash-clock">· {clock || '—:——:——'}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="dash-pill hidden md:inline-flex">
                <Plug2 className="w-3 h-3" style={{ color: '#2fd6e6' }} />
                {connectedCount}/{availableCount} connected
              </span>
              <button type="button" className="btn-workspace btn-secondary" onClick={fetchIntegrations}>
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>
          </header>

          <div className="workspace-content">
            <div className="dash-kpis" style={{ marginBottom: '1.5rem' }}>
              <div className="dash-kpi dash-kpi-blue"
                onClick={() => {}}
                style={{ cursor: 'default' }}
              >
                <div className="dash-kpi-ico"><Plug2 className="w-4 h-4" /></div>
                <div>
                  <p className="dash-kpi-val">{connectedCount}<span className="dash-kpi-unit">/{availableCount}</span></p>
                  <p className="dash-kpi-label">Connected</p>
                </div>
              </div>
              <div className="dash-kpi dash-kpi-green" style={{ cursor: 'default' }}>
                <div className="dash-kpi-ico"><Link2 className="w-4 h-4" /></div>
                <div>
                  <p className="dash-kpi-val">{unconnectedCount}</p>
                  <p className="dash-kpi-label">Ready to connect</p>
                </div>
              </div>
              <div className="dash-kpi dash-kpi-orange" style={{ cursor: 'default' }}>
                <div className="dash-kpi-ico"><ExternalLink className="w-4 h-4" /></div>
                <div>
                  <p className="dash-kpi-val">{integrations.length}</p>
                  <p className="dash-kpi-label">Total connections</p>
                </div>
              </div>
              <div className="dash-kpi dash-kpi-purple" style={{ cursor: 'default' }}>
                <div className="dash-kpi-ico"><User className="w-4 h-4" /></div>
                <div>
                  <p className="dash-kpi-val">{infoCount}</p>
                  <p className="dash-kpi-label">Built-in features</p>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="dash-empty" style={{ paddingTop: '4rem' }}>
                <div className="dash-empty-ico">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
                <p className="dash-empty-title">Loading integrations...</p>
              </div>
            ) : error ? (
              <div className="workspace-card">
                <div className="std-alert std-alert-error m-4">
                  <Loader2 className="w-4 h-4 flex-shrink-0" />
                  <p className="flex-1">{error}</p>
                </div>
                <div className="p-4 pt-0">
                  <button type="button" className="btn-workspace btn-primary" onClick={fetchIntegrations}>
                    Retry
                  </button>
                </div>
              </div>
            ) : (
              <div className="int-grid">
                {PROVIDERS.map((provider) => {
                  const status = getStatus(provider.key);
                  const isActive = status?.isActive;
                  const isConnecting = connecting === provider.key;
                  const isDisconnectingVal = disconnecting === provider.key;

                  return (
                    <div
                      key={provider.key}
                      className={`int-card ${isActive ? 'is-active' : ''}`}
                    >
                      <div className="int-card-top">
                        <div className="int-title-row">
                          <div
                            className="int-ico"
                            style={{ background: provider.color.bg, color: provider.color.text }}
                          >
                            {provider.name[0]}
                          </div>
                          <div className="int-name-wrap">
                            <p className="int-name">{provider.name}</p>
                            <p className="int-kind">Integration</p>
                          </div>
                        </div>
                        {provider.infoOnly ? (
                          <span className="pill int-pill" style={{ background: 'rgba(47,214,230,0.08)', color: '#2fd6e6' }}>
                            Info Only
                          </span>
                        ) : isActive ? (
                          <span className="pill int-pill" style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399' }}>
                            Connected
                          </span>
                        ) : (
                          <span className="pill int-pill" style={{ background: 'rgba(255,255,255,0.05)', color: '#9aa1ae' }}>
                            Not Connected
                          </span>
                        )}
                      </div>

                      <p className="int-desc">{provider.description}</p>

                      <div className="int-meta">
                        <div className="int-meta-item">
                          <User className="w-3.5 h-3.5" />
                          <span className="int-meta-val">
                            {isActive && status?.providerUsername
                              ? status.providerUsername
                              : provider.infoOnly
                                ? 'Built-in'
                                : '—'}
                          </span>
                        </div>
                        <div className="int-meta-item">
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span className="int-meta-val">
                            {isActive && status?.lastSyncedAt
                              ? formatLastSync(status.lastSyncedAt)
                              : provider.infoOnly
                                ? 'Always available'
                                : 'No sync yet'}
                          </span>
                        </div>
                      </div>

                      <div className="int-actions">
                        {provider.infoOnly ? (
                          <span className="int-footnote">
                            Included in every workspace
                          </span>
                        ) : isActive ? (
                          <button
                            type="button"
                            className="btn-workspace btn-secondary"
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
                            className="btn-workspace btn-primary"
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
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      <ConfirmDialog
        isOpen={!!confirmDisconnect}
        onClose={() => setConfirmDisconnect(null)}
        onConfirm={handleConfirmDisconnect}
        title="Disconnect Integration"
        message={`Are you sure you want to disconnect ${confirmDisconnect}?`}
        confirmText="Disconnect"
      />
    </AuthGuard>
  );
}