import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch, subscriptionApi, integrationApi } from '../lib/api';
import { rateLimit, validate, createSubmitGuard } from '../lib/security';
import { getAvatarUrl } from '../lib/utils';
import { User, Shield, CreditCard, Plug, Camera, Save, ExternalLink, Unplug, Loader2 } from 'lucide-react';

const submitGuard = createSubmitGuard();

const PROVIDERS = [
  { id: 'github', label: 'GitHub', color: '#f0f6fc' },
  { id: 'discord', label: 'Discord', color: '#5865f2' },
  { id: 'slack', label: 'Slack', color: '#e01e5a' },
  { id: 'figma', label: 'Figma', color: '#a259ff' },
  { id: 'notion', label: 'Notion', color: '#fff' },
];

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'integrations', label: 'Integrations', icon: Plug },
];

export default function Settings() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);
  const setAuth = useAuthStore((s) => s.setAuth);
  const setSubscription = useAuthStore((s) => s.setSubscription);

  const [activeTab, setActiveTab] = useState('profile');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [integrations, setIntegrations] = useState([]);
  const [loadingIntegrations, setLoadingIntegrations] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (user) {
      setName(user.fullName || '');
      setRole(user.role || '');
    }
  }, [user]);

  useEffect(() => {
    if (activeTab === 'billing' && !subscription) {
      subscriptionApi.getCurrent().then((data) => {
        if (data.subscription) setSubscription(data.subscription);
      }).catch(() => {});
    }
    if (activeTab === 'integrations') {
      setLoadingIntegrations(true);
      integrationApi.list()
        .then((data) => setIntegrations(data.integrations || []))
        .catch(() => setIntegrations([]))
        .finally(() => setLoadingIntegrations(false));
    }
  }, [activeTab, subscription, setSubscription]);

  const validateField = useCallback((value) => {
    const result = validate(value, ['required', 'fullName', 'noScript']);
    setFieldErrors(prev => {
      if (result.valid) { const n = { ...prev }; delete n.fullName; return n; }
      return { ...prev, fullName: result.errors[0] };
    });
    return result.valid;
  }, []);

  const saveProfile = async (e) => {
    e.preventDefault();
    if (!submitGuard.acquire()) return;
    if (!validateField(name)) { submitGuard.release(); return; }

    const rl = rateLimit('settings-save', { maxAttempts: 5, windowMs: 60000 });
    if (!rl.allowed) {
      alert(`Too many requests. Wait ${rl.retryAfter}s`);
      submitGuard.release();
      return;
    }

    setSaving(true);
    try {
      const data = await apiFetch('/api/profile', {
        method: 'PUT',
        body: JSON.stringify({ fullName: name, email: user.email }),
      });
      if (data.user) setAuth(localStorage.getItem('authToken'), data.user);
      alert('Profile updated');
    } catch {
      alert('Update failed');
    } finally {
      setSaving(false);
      submitGuard.release();
    }
  };

  const uploadPicture = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('File too large (max 5MB)');
      return;
    }
    if (!file.type.startsWith('image/')) {
      alert('Only image files are allowed');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('profilePicture', file);
      const data = await apiFetch('/api/profile/picture', {
        method: 'POST',
        body: form,
      });
      // Backend returns { success: true, profilePicture: '/uploads/profiles/...' } — see routes/profile.js POST /picture
      if (data.profilePicture) {
        const token = localStorage.getItem('authToken');
        const updated = { ...user, profilePicture: data.profilePicture };
        setAuth(token, updated);
      }
    } catch {
      alert('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const connectProvider = async (provider) => {
    try {
      const data = await apiFetch(`/api/integrations/${provider}/auth`);
      if (data.url) window.location.href = data.url;
    } catch {
      alert('Failed to start OAuth flow');
    }
  };

  const disconnectProvider = async (provider) => {
    try {
      await apiFetch(`/api/integrations/${provider}/disconnect`, { method: 'POST' });
      setIntegrations((prev) => prev.filter((i) => i.provider !== provider));
    } catch {
      alert('Disconnect failed');
    }
  };

  const getIntegration = (providerId) =>
    integrations.find((i) => i.provider === providerId);

  const profilePictureUrl = getAvatarUrl(user, user?.fullName || user?.name || 'User');

  return (
    <AuthGuard>
      <Head>
        <title>Settings - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="workspace-container">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main">
          <header className="workspace-header">
            <div className="flex items-center gap-6">
              <h1 className="text-xl font-bold">Settings</h1>
            </div>
          </header>

          <div className="p-6">
            <div className="bg-navy-light rounded-lg border border-gray-700">
              {/* Tab Navigation */}
              <div className="flex border-b border-gray-700">
                {TABS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium capitalize transition-colors ${
                      activeTab === id
                        ? 'border-b-2 border-blue-500 text-white'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div className="p-6">
                {activeTab === 'profile' && (
                  <form onSubmit={saveProfile} className="space-y-6 max-w-xl">
                    {/* Profile Picture */}
                    <div className="flex items-center gap-4">
                      <img
                        src={profilePictureUrl}
                        alt={user?.fullName || 'User'}
                        className="w-20 h-20 rounded-full object-cover border-2 border-gray-600"
                        onError={(e) => {
                          if (e.currentTarget.src !== profilePictureUrl) return;
                          const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.fullName || user?.name || 'User')}&background=3b82f6&color=fff&size=128`;
                          e.currentTarget.src = fallback;
                        }}
                      />
                      <div>
                        <label className="btn-workspace btn-secondary cursor-pointer inline-flex items-center gap-2">
                          <Camera className="w-4 h-4" />
                          {uploading ? 'Uploading...' : 'Change Photo'}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={uploadPicture}
                            className="hidden"
                            disabled={uploading}
                          />
                        </label>
                        <p className="text-xs text-gray-500 mt-1">JPG, PNG. Max 5MB.</p>
                      </div>
                    </div>

                    {/* Full Name */}
                    <div>
                      <label className="block text-sm font-medium mb-2">Full Name</label>
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={() => validateField(name)}
                        className={`w-full px-4 py-2 bg-navy border rounded-lg text-white focus:outline-none focus:border-blue-accent ${
                          fieldErrors.fullName ? 'border-red-500' : 'border-gray-600'
                        }`}
                        autoComplete="name"
                        maxLength={100}
                      />
                      {fieldErrors.fullName && <p className="text-xs text-red-400 mt-1">{fieldErrors.fullName}</p>}
                    </div>

                    {/* Email (disabled) */}
                    <div>
                      <label className="block text-sm font-medium mb-2">Email</label>
                      <input
                        value={user?.email || ''}
                        disabled
                        className="w-full px-4 py-2 bg-navy border border-gray-600 rounded-lg text-gray-400 cursor-not-allowed"
                      />
                    </div>

                    {/* Role (disabled) */}
                    <div>
                      <label className="block text-sm font-medium mb-2">Role</label>
                      <input
                        value={role}
                        disabled
                        className="w-full px-4 py-2 bg-navy border border-gray-600 rounded-lg text-gray-400 cursor-not-allowed capitalize"
                      />
                    </div>

                    {/* Save */}
                    <button
                      type="submit"
                      disabled={saving}
                      className="cta-button px-4 py-2 rounded-lg text-white font-medium inline-flex items-center gap-2 disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </form>
                )}

                {activeTab === 'security' && (
                  <div className="max-w-xl">
                    <div className="bg-navy rounded-lg border border-gray-600 p-6 text-center">
                      <Shield className="w-10 h-10 text-gray-500 mx-auto mb-3" />
                      <h3 className="text-lg font-semibold mb-2">Security Settings</h3>
                      <p className="text-gray-400">Password change and 2FA coming soon.</p>
                    </div>
                  </div>
                )}

                {activeTab === 'billing' && (
                  <div className="max-w-xl space-y-6">
                    <div className="bg-navy rounded-lg border border-gray-600 p-6">
                      <h3 className="text-lg font-semibold mb-4">Current Plan</h3>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-400">Plan</p>
                          <p className="text-white font-medium capitalize">
                            {subscription?.tier || 'Free'}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-400">Status</p>
                          <p className="text-white font-medium capitalize">
                            {subscription?.status || 'Active'}
                          </p>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => router.push('/pricing')}
                      className="cta-button px-4 py-2 rounded-lg text-white font-medium inline-flex items-center gap-2"
                    >
                      <CreditCard className="w-4 h-4" />
                      Upgrade Plan
                    </button>
                  </div>
                )}

                {activeTab === 'integrations' && (
                  <div className="space-y-4">
                    {loadingIntegrations && (
                      <div className="flex items-center gap-2 text-gray-400">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading integrations...
                      </div>
                    )}
                    {!loadingIntegrations &&
                      PROVIDERS.map(({ id, label, color }) => {
                        const integration = getIntegration(id);
                        const connected = integration?.isActive;
                        return (
                          <div
                            key={id}
                            className="flex items-center justify-between bg-navy rounded-lg border border-gray-600 p-4"
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm"
                                style={{ backgroundColor: color + '20', color }}
                              >
                                {label.charAt(0)}
                              </div>
                              <div>
                                <p className="text-white font-medium">{label}</p>
                                <p className="text-xs text-gray-500">
                                  {connected
                                    ? `Connected as ${integration.providerUsername || 'user'}`
                                    : 'Not connected'}
                                </p>
                              </div>
                            </div>
                            <div>
                              {connected ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-green-400 font-medium mr-2">
                                    Connected
                                  </span>
                                  <button
                                    onClick={() => disconnectProvider(id)}
                                    className="btn-workspace btn-secondary text-xs inline-flex items-center gap-1"
                                  >
                                    <Unplug className="w-3 h-3" />
                                    Disconnect
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => connectProvider(id)}
                                  className="btn-workspace btn-primary text-xs inline-flex items-center gap-1"
                                >
                                  <ExternalLink className="w-3 h-3" />
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
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
