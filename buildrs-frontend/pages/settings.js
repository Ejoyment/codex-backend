import { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch, subscriptionApi, integrationApi } from '../lib/api';
import { rateLimit, validate, createSubmitGuard } from '../lib/security';
import { getAvatarUrl } from '../lib/utils';
import { User, Shield, CreditCard, Plug, Camera, Save, ExternalLink, Unplug, Loader2 } from 'lucide-react';
import useToastStore from '../store/toastStore';

const submitGuard = createSubmitGuard();

const CROP_VIEW = 280;
const CROP_MAX_ZOOM = 4;
const CROP_EXPORT_MIN = 96;
const CROP_EXPORT_MAX = 512;

const PROVIDERS = [
  { id: 'github', label: 'GitHub', color: '#f0f6fc' },
  { id: 'discord', label: 'Discord', color: '#5865f2' },
  { id: 'slack', label: 'Slack', color: '#e01e5a' },
  { id: 'figma', label: 'Figma', color: '#a259ff' },
  { id: 'notion', label: 'Notion', color: '#fff' },
];

const PROVIDER_META = {
  github: { type: 'GitOps', desc: 'Repos, PRs, commit activity' },
  discord: { type: 'Chat', desc: 'Alerts and summaries' },
  slack: { type: 'Chat', desc: 'Alerts and summaries' },
  figma: { type: 'Design', desc: 'Design files and feedback' },
  notion: { type: 'Docs', desc: 'Standups and meeting notes' },
};

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
  const [clock, setClock] = useState('');
  const [crop, setCrop] = useState(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropPan, setCropPan] = useState({ x: 0, y: 0 });
  const [cropReady, setCropReady] = useState(false);
  const cropImgRef = useRef(null);
  const previewRef = useRef(null);
  const dragRef = useRef(null);
  const toast = useToastStore();

  useEffect(() => {
    const tick = () => {
      setClock(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

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
    setFieldErrors((prev) => {
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
      toast.error(`Too many requests. Wait ${rl.retryAfter}s`);
      submitGuard.release();
      return;
    }

    setSaving(true);
    try {
      const data = await apiFetch('/api/profile', {
        method: 'PUT',
        body: JSON.stringify({ fullName: name, email: user.email }),
      });
      if (data.user) {
        const token = localStorage.getItem('authToken');
        setAuth(token, { ...user, ...data.user });
      }
      toast.success('Profile updated successfully');
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
      submitGuard.release();
    }
  };

  const uploadPicture = async (file) => {
    const form = new FormData();
    form.append('profilePicture', file);
    const data = await apiFetch('/api/profile/picture', {
      method: 'POST',
      body: form,
    });
    if (data.profilePicture) {
      const token = localStorage.getItem('authToken');
      const updated = { ...user, profilePicture: data.profilePicture };
      setAuth(token, updated);
      toast.success('Profile picture updated');
    } else {
      throw new Error(data.message || 'Upload failed');
    }
  };

  const onPickPicture = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large — max 5MB');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Only image files are allowed');
      return;
    }
    if (crop?.src) URL.revokeObjectURL(crop.src);
    setCrop({ src: URL.createObjectURL(file), w: 0, h: 0 });
    setCropZoom(1);
    setCropPan({ x: 0, y: 0 });
    setCropReady(false);
  };

  const clampPan = (pos, drawW, drawH) => ({
    x: Math.min(0, Math.max(CROP_VIEW - drawW, pos.x)),
    y: Math.min(0, Math.max(CROP_VIEW - drawH, pos.y)),
  });

  const baseScale = (w, h) => Math.max(CROP_VIEW / w, CROP_VIEW / h);
  const drawSize = (w, h, zoom) => ({ w: w * baseScale(w, h) * zoom, h: h * baseScale(w, h) * zoom });

  const onCropLoad = (e) => {
    if (!crop) return;
    const w = e.currentTarget.naturalWidth;
    const h = e.currentTarget.naturalHeight;
    const d = drawSize(w, h, 1);
    setCrop((prev) => (prev ? { ...prev, w, h } : prev));
    setCropPan(clampPan({ x: (CROP_VIEW - d.w) / 2, y: (CROP_VIEW - d.h) / 2 }, d.w, d.h));
    setCropReady(true);
  };

  const onCropPointerDown = (e) => {
    if (!cropReady) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, start: { ...cropPan } };
  };

  const onCropPointerMove = (e) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId || !crop) return;
    const dims = drawSize(crop.w, crop.h, cropZoom);
    setCropPan(clampPan({ x: d.start.x + (e.clientX - d.sx), y: d.start.y + (e.clientY - d.sy) }, dims.w, dims.h));
  };

  const onCropPointerUp = () => {
    dragRef.current = null;
  };

  const applyZoom = (nextZoom) => {
    if (!crop || crop.w <= 0) return;
    const zoom = Math.min(CROP_MAX_ZOOM, Math.max(1, nextZoom));
    const dims = drawSize(crop.w, crop.h, zoom);
    const prev = drawSize(crop.w, crop.h, cropZoom);
    const cx = CROP_VIEW / 2 - cropPan.x;
    const cy = CROP_VIEW / 2 - cropPan.y;
    const pan = {
      x: CROP_VIEW / 2 - (cx * dims.w) / prev.w,
      y: CROP_VIEW / 2 - (cy * dims.h) / prev.h,
    };
    setCropZoom(zoom);
    setCropPan(clampPan(pan, dims.w, dims.h));
  };

  const onCropWheel = (e) => {
    e.preventDefault();
    applyZoom(cropZoom * Math.exp(-e.deltaY * 0.0012));
  };

  const resetCrop = (e) => {
    e.stopPropagation();
    if (!crop || crop.w <= 0) return;
    const d = drawSize(crop.w, crop.h, 1);
    setCropZoom(1);
    setCropPan(clampPan({ x: (CROP_VIEW - d.w) / 2, y: (CROP_VIEW - d.h) / 2 }, d.w, d.h));
  };

  const closeCrop = () => {
    if (uploading) return;
    if (crop?.src) URL.revokeObjectURL(crop.src);
    setCrop(null);
    setCropReady(false);
    setCropZoom(1);
    setCropPan({ x: 0, y: 0 });
  };

  useEffect(() => {
    const canvas = previewRef.current;
    const img = cropImgRef.current;
    if (!canvas || !img || !crop || crop.w <= 0 || !cropReady) return;
    const scale = baseScale(crop.w, crop.h) * cropZoom;
    const srcSize = CROP_VIEW / scale;
    const srcX = -cropPan.x / scale;
    const srcY = -cropPan.y / scale;
    const size = Math.max(CROP_EXPORT_MIN, Math.min(CROP_EXPORT_MAX, Math.round(srcSize)));
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, size, size);
  }, [crop, cropReady, cropZoom, cropPan]);

  const applyCrop = async () => {
    const canvas = previewRef.current;
    const img = cropImgRef.current;
    if (!canvas || !img || !crop || !cropReady) return;
    setUploading(true);
    try {
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed to process image'))), 'image/png');
      });
      const file = new File([blob], 'avatar.png', { type: 'image/png' });
      await uploadPicture(file);
      closeCrop();
    } catch (err) {
      toast.error(err.message || 'Failed to upload picture');
    } finally {
      setUploading(false);
    }
  };

  const connectProvider = async (provider) => {
    try {
      const data = await apiFetch(`/api/integrations/${provider}/auth`);
      if (data.url) window.location.href = data.url;
    } catch (err) {
      toast.error(err.message || 'Failed to start OAuth flow');
    }
  };

  const disconnectProvider = async (provider) => {
    try {
      await apiFetch(`/api/integrations/${provider}/disconnect`, { method: 'POST' });
      setIntegrations((prev) => prev.filter((i) => i.provider !== provider));
      toast.success(`${provider} disconnected`);
    } catch (err) {
      toast.error(err.message || 'Disconnect failed');
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
          <header className="workspace-header dash-header">
            <div>
              <p className="dash-crumb">
                BuildrsHQ <span className="sep">/</span> Settings
              </p>
              <h1 className="dash-title">Settings</h1>
              <div className="dash-statusline">
                <span className="status-indicator status-online" />
                <span>Account &amp; workspace preferences</span>
                <span className="dash-clock">· {clock || '—:——:——'}</span>
              </div>
            </div>
          </header>

          <div className="workspace-content">
            <div className="set-shell">
              <nav className="set-tabs">
                {TABS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveTab(id)}
                    className={`set-tab ${activeTab === id ? 'is-active' : ''}`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </nav>

              <div className="set-body">
                {activeTab === 'profile' && (
                  <form onSubmit={saveProfile} className="space-y-6 max-w-xl">
                    <div className="flex items-center gap-4">
                      <img
                        src={profilePictureUrl}
                        alt={user?.fullName || 'User'}
                        className="set-av"
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
                            onChange={onPickPicture}
                            className="hidden"
                            disabled={uploading}
                          />
                        </label>
                        <p className="set-note">JPG, PNG. Max 5MB.</p>
                      </div>
                    </div>

                    <div>
                      <label className="ws-label">Full Name</label>
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={() => validateField(name)}
                        className={`ws-input ${fieldErrors.fullName ? 'field-error' : ''}`}
                        autoComplete="name"
                        maxLength={100}
                      />
                      {fieldErrors.fullName && <p className="std-field-error">{fieldErrors.fullName}</p>}
                    </div>

                    <div>
                      <label className="ws-label">Email</label>
                      <input
                        value={user?.email || ''}
                        disabled
                        className="ws-input opacity-60 cursor-not-allowed"
                      />
                    </div>

                    <div>
                      <label className="ws-label">Role</label>
                      <input
                        value={role}
                        disabled
                        className="ws-input opacity-60 cursor-not-allowed capitalize"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-1">
                      <button
                        type="submit"
                        disabled={saving}
                        className="btn-workspace btn-primary"
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {saving ? 'Saving...' : 'Save Changes'}
                      </button>
                      <span className="set-hint">Changes apply across your workspace</span>
                    </div>
                  </form>
                )}

                {activeTab === 'security' && (
                  <div className="max-w-xl">
                    <div className="set-gate">
                      <div className="set-gate-ico">
                        <Shield className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="mem-rule" style={{ marginBottom: '0.15rem' }}>Security Settings</h3>
                        <p className="set-hint">Password change and 2FA are coming soon.</p>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'billing' && (
                  <div className="max-w-xl space-y-6">
                    <div className="set-plan">
                      <div>
                        <p className="set-plan-key">Current Plan</p>
                        <p className="set-plan-val">{subscription?.tier || 'Free'}</p>
                      </div>
                      <div>
                        <p className="set-plan-key">Status</p>
                        <p className="set-plan-val">
                          <span className={`${(!subscription || subscription.status === 'active') ? 'status-indicator status-online' : 'status-indicator'} mr-2`} />
                          {subscription?.status ? subscription.status : 'Active'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => router.push('/pricing')}
                      className="btn-workspace btn-primary"
                    >
                      <CreditCard className="w-4 h-4" />
                      Upgrade Plan
                    </button>
                  </div>
                )}

                {activeTab === 'integrations' && (
                  <div className="space-y-3 max-w-2xl">
                    {loadingIntegrations && (
                      <div className="flex items-center gap-2 set-hint py-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading integrations...
                      </div>
                    )}
                    {!loadingIntegrations &&
                      PROVIDERS.map(({ id, label, color }) => {
                        const integration = getIntegration(id);
                        const connected = integration?.isActive;
                        const meta = PROVIDER_META[id] || { type: 'Integration', desc: '' };
                        return (
                          <div key={id} className="set-int-row">
                            <div className="set-int-brand">
                              <div
                                className="int-ico"
                                style={{ backgroundColor: color + '18', color }}
                              >
                                {label.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <p className="set-int-name">{label}</p>
                                <p className="set-int-sub">
                                  {connected
                                    ? `Connected as ${integration.providerUsername || 'user'}`
                                    : `${meta.type} · ${meta.desc}`}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              {connected && (
                                <span className="pill" style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399' }}>
                                  Connected
                                </span>
                              )}
                              {connected ? (
                                <button
                                  type="button"
                                  onClick={() => disconnectProvider(id)}
                                  className="btn-workspace btn-secondary text-xs inline-flex items-center gap-1"
                                >
                                  <Unplug className="w-3 h-3" />
                                  Disconnect
                                </button>
                              ) : (
                                <button
                                  type="button"
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

      {crop && (
        <div className="pfp-overlay" role="dialog" aria-modal="true" aria-label="Crop profile photo">
          <div className="pfp-modal">
            <div className="pfp-head">
              <div className="ws-modal-title">Crop your photo</div>
              <button type="button" className="pfp-close" onClick={closeCrop} aria-label="Cancel crop" tabIndex={-1}>
                ✕
              </button>
            </div>

            <div className="pfp-body">
              <div
                className="pfp-crop"
                onPointerDown={onCropPointerDown}
                onPointerMove={onCropPointerMove}
                onPointerUp={onCropPointerUp}
                onPointerCancel={onCropPointerUp}
                onWheel={onCropWheel}
                onDoubleClick={resetCrop}
              >
                <img
                  ref={cropImgRef}
                  src={crop.src}
                  alt="Crop preview"
                  draggable={false}
                  onLoad={onCropLoad}
                  style={
                    crop.w > 0
                      ? {
                          width: drawSize(crop.w, crop.h, cropZoom).w,
                          height: drawSize(crop.w, crop.h, cropZoom).h,
                          left: cropPan.x,
                          top: cropPan.y,
                        }
                      : undefined
                  }
                />
                <div className="pfp-ring" />
              </div>

              <div className="pfp-side">
                <canvas ref={previewRef} className="pfp-preview" />
                <span className="pfp-side-label">preview</span>
              </div>
            </div>

            <div className="pfp-controls">
              <label htmlFor="pfp-zoom">Zoom</label>
              <input
                id="pfp-zoom"
                type="range"
                className="pfp-slider"
                min="1"
                max={CROP_MAX_ZOOM}
                step="0.01"
                value={cropZoom}
                onChange={(e) => applyZoom(Number(e.target.value))}
              />
              <button type="button" onClick={resetCrop} className="btn-workspace btn-secondary text-xs">
                Reset
              </button>
            </div>

            <div className="pfp-actions">
              <button type="button" onClick={closeCrop} className="btn-workspace btn-secondary" disabled={uploading}>
                Cancel
              </button>
              <button
                type="button"
                onClick={applyCrop}
                className="btn-workspace btn-primary inline-flex items-center gap-2"
                disabled={!cropReady || uploading}
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                {uploading ? 'Uploading...' : 'Apply & upload'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}