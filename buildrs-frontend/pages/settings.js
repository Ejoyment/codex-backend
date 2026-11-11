import { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch, isDemoTourActive } from '../lib/api';
import { rateLimit, validate, createSubmitGuard } from '../lib/security';
import { getAvatarUrl } from '../lib/utils';
import { normalizeTier } from '../lib/tier';
import { FREE_PLAN, planById } from '../lib/plans';
import {
  Shield,
  Camera,
  Save,
  Loader2,
  Zap,
  AlertTriangle,
  Trash2,
  Check,
  Bot,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  X,
} from 'lucide-react';
import useToastStore from '../store/toastStore';

const submitGuard = createSubmitGuard();

const CROP_VIEW = 280;
const CROP_MAX_ZOOM = 4;
const CROP_EXPORT_MIN = 96;
const CROP_EXPORT_MAX = 512;

const TABS = [
  { id: 'profile', label: 'Profile and Account' },
  { id: 'ai', label: 'AI Models Configuration' },
  { id: 'security', label: 'Security' },
];

const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { id: 'upper', label: 'One uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { id: 'lower', label: 'One lowercase letter', test: (v) => /[a-z]/.test(v) },
  { id: 'number', label: 'One number', test: (v) => /\d/.test(v) },
  { id: 'symbol', label: 'One special character', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

export default function Settings() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);
  const setAuth = useAuthStore((s) => s.setAuth);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const [activeTab, setActiveTab] = useState(() => {
    // Deep-linkable tabs (?tab=profile, ?tab=ai, ?tab=security).
    const initial = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('tab')
      : null;
    return TABS.some((t) => t.id === initial) ? initial : 'profile';
  });
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [crop, setCrop] = useState(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropPan, setCropPan] = useState({ x: 0, y: 0 });
  const [cropReady, setCropReady] = useState(false);
  const cropImgRef = useRef(null);
  const previewRef = useRef(null);
  const dragRef = useRef(null);
  const toast = useToastStore();
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const [modelConfig, setModelConfig] = useState(null);
  const [modelConfigLoading, setModelConfigLoading] = useState(false);
  const [modelConfigError, setModelConfigError] = useState('');

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordFieldErrors, setPasswordFieldErrors] = useState({});
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const fullName = `${firstName} ${lastName}`.replace(/\s+/g, ' ').trim();
  const activeRole = Array.isArray(role) ? role.join(', ') : (role || 'Member');
  const tier = normalizeTier(subscription?.tier);
  const currentPlan = planById(tier) || FREE_PLAN;
  const isBusiness = ['team_standard', 'team_premium', 'enterprise'].includes(tier);
  const passwordChecks = PASSWORD_RULES.map((rule) => ({ ...rule, passed: rule.test(newPassword) }));
  const passwordValid = passwordChecks.every((rule) => rule.passed);
  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;

  const handleDeleteAccount = async () => {
    if (deleteText !== 'DELETE' || deleting) return;
    const confirmed = window.confirm(
      'Delete your account permanently? Your profile, projects, files, AI sessions, messages and deployments will be removed. This cannot be undone.'
    );
    if (!confirmed) return;
    setDeleting(true);
    try {
      const data = await apiFetch('/api/auth/delete-account', {
        method: 'DELETE',
        body: JSON.stringify({ confirm: 'DELETE' }),
      });
      if (data.success) {
        if (isDemoTourActive()) {
          toast.success('Demo mode — no account changes were made');
          return;
        }
        clearAuth();
        router.replace('/sign_in');
      } else {
        toast.error(data.message || 'Failed to delete account');
      }
    } catch (err) {
      toast.error(err.message || 'Failed to delete account');
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    const parts = (user.fullName || '').trim().split(/\s+/);
    setFirstName(parts.shift() || '');
    setLastName(parts.join(' '));
    setRole(user.role || '');
  }, [user]);

  const loadModelConfig = useCallback(async () => {
    setModelConfigLoading(true);
    setModelConfigError('');
    try {
      const data = await apiFetch('/api/ai-pair/model-config');
      setModelConfig(data);
    } catch (err) {
      setModelConfigError(err.message || 'Could not load AI model configuration.');
    } finally {
      setModelConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'ai' && !modelConfig) loadModelConfig();
  }, [activeTab, modelConfig, loadModelConfig]);

  const validateField = useCallback((value) => {
    const result = validate(value, ['required', 'fullName', 'noScript']);
    setFieldErrors((prev) => {
      if (result.valid) { const n = { ...prev }; delete n.fullName; return n; }
      return { ...prev, fullName: result.errors[0] };
    });
    return result.valid;
  }, []);

  const resetProfileForm = useCallback(() => {
    if (!user) return;
    const parts = (user.fullName || '').trim().split(/\s+/);
    setFirstName(parts.shift() || '');
    setLastName(parts.join(' '));
    setFieldErrors({});
  }, [user]);

  const saveProfile = async (e) => {
    e.preventDefault();
    if (!submitGuard.acquire()) return;
    if (!validateField(fullName)) { submitGuard.release(); return; }

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
        body: JSON.stringify({ fullName, email: user.email }),
      });
      if (data.user) {
        if (!isDemoTourActive()) {
          const token = localStorage.getItem('authToken');
          setAuth(token, { ...user, ...data.user });
        }
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
      if (!isDemoTourActive()) {
        const token = localStorage.getItem('authToken');
        const updated = { ...user, profilePicture: data.profilePicture };
        setAuth(token, updated);
      }
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

  const finishPasswordChange = () => {
    clearAuth();
    router.replace('/sign_in');
  };

  const closePassword = () => {
    if (passwordBusy) return;
    if (passwordSuccess) {
      finishPasswordChange();
      return;
    }
    setPasswordOpen(false);
    setPasswordSuccess(false);
    setPasswordError('');
    setPasswordFieldErrors({});
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
  };

  const clearPasswordFieldError = (key) => {
    setPasswordFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    if (passwordBusy) return;
    const errors = {};
    if (!currentPassword) errors.current = 'Enter your current password.';
    if (!passwordValid) errors.next = 'Password does not meet the requirements below.';
    if (!confirmPassword) errors.confirm = 'Confirm your new password.';
    else if (newPassword !== confirmPassword) errors.confirm = "Passwords don't match.";
    setPasswordFieldErrors(errors);
    setPasswordError('');
    if (Object.keys(errors).length > 0) return;

    const rl = rateLimit('settings-password', { maxAttempts: 5, windowMs: 60000 });
    if (!rl.allowed) {
      setPasswordError(`Too many attempts. Wait ${rl.retryAfter}s.`);
      return;
    }

    setPasswordBusy(true);
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setPasswordSuccess(true);
    } catch (err) {
      const message = err.message || 'Could not change your password.';
      if (/current password is incorrect/i.test(message)) {
        setPasswordFieldErrors({ current: 'Current password is incorrect.' });
      } else {
        setPasswordError(message);
      }
    } finally {
      setPasswordBusy(false);
    }
  };

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
          <div className="workspace-content set-page">
            <header className="set-page-head">
              <p className="set-breadcrumb">Manage <span>/</span> Settings</p>
              <h1 className="set-title">Settings</h1>
              <p className="set-subtitle">Manage account, AI preferences, Security Settings</p>
            </header>

            <nav className="set-tabs" role="tablist" aria-label="Settings sections">
              {TABS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === id}
                  onClick={() => setActiveTab(id)}
                  className={`set-tab ${activeTab === id ? 'is-active' : ''}`}
                >
                  {label}
                </button>
              ))}
            </nav>

            <div className="set-body">
              {activeTab === 'profile' && (
                <>
                  <form onSubmit={saveProfile} className="set-card" noValidate>
                    <div className="set-card-head">
                      <h2 className="set-card-title">Profile</h2>
                      <p className="set-card-sub">Manage your profile settings</p>
                    </div>

                    <div className="set-profile-banner">
                      <img
                        src={profilePictureUrl}
                        alt={user?.fullName || 'User'}
                        className="set-avatar"
                        onError={(e) => {
                          if (e.currentTarget.src !== profilePictureUrl) return;
                          const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.fullName || user?.name || 'User')}&background=3b82f6&color=fff&size=128`;
                          e.currentTarget.src = fallback;
                        }}
                      />
                      <div className="set-profile-copy">
                        <p className="set-profile-name">{user?.fullName || fullName || 'Your profile'}</p>
                        <p className="set-profile-email">{user?.email || '—'}</p>
                      </div>
                      <label className="set-btn set-btn-ghost set-upload-btn">
                        <Camera className="set-btn-icon" />
                        {uploading ? 'Uploading…' : 'Update Profile Pic'}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={onPickPicture}
                          className="set-file-input"
                          disabled={uploading}
                        />
                      </label>
                    </div>

                    <div className="set-form-grid">
                      <label className="set-field">
                        <span className="set-label">First Name</span>
                        <input
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          onBlur={() => validateField(fullName)}
                          className={`set-input ${fieldErrors.fullName ? 'is-error' : ''}`}
                          autoComplete="given-name"
                          maxLength={60}
                        />
                      </label>
                      <label className="set-field">
                        <span className="set-label">Last Name</span>
                        <input
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          onBlur={() => validateField(fullName)}
                          className={`set-input ${fieldErrors.fullName ? 'is-error' : ''}`}
                          autoComplete="family-name"
                          maxLength={60}
                        />
                      </label>
                      <label className="set-field set-field-full">
                        <span className="set-label">Email Address</span>
                        <input
                          value={user?.email || ''}
                          disabled
                          className="set-input"
                          autoComplete="email"
                        />
                      </label>
                    </div>
                    {fieldErrors.fullName && <p className="set-field-error">{fieldErrors.fullName}</p>}

                    <div className="set-card-actions">
                      <button type="button" className="set-btn set-btn-secondary" onClick={resetProfileForm} disabled={saving}>
                        Cancel
                      </button>
                      <button type="submit" className="set-btn set-btn-primary" disabled={saving}>
                        {saving ? <Loader2 className="set-btn-icon animate-spin" /> : <Save className="set-btn-icon" />}
                        {saving ? 'Saving…' : 'Save Changes'}
                      </button>
                    </div>
                  </form>

                  <section className="set-card">
                    <div className="set-card-head">
                      <h2 className="set-card-title">Account</h2>
                      <p className="set-card-sub">Manage your account settings</p>
                    </div>

                    <div className="set-form-grid">
                      <label className="set-field">
                        <span className="set-label">Account Type</span>
                        <select
                          className="set-input set-select"
                          value={isBusiness ? 'business' : 'personal'}
                          disabled
                        >
                          <option value="personal">Personal</option>
                          <option value="business">Business</option>
                        </select>
                      </label>
                      <label className="set-field">
                        <span className="set-label">Role</span>
                        <input className="set-input" value={activeRole} disabled />
                      </label>
                      <div className="set-field set-field-full">
                        <span className="set-label">Subscription Plan</span>
                        <div className="set-plan-box">
                          <div>
                            <p className="set-plan-name">
                              {currentPlan.name}
                              {subscription?.status === 'trial' ? ' · Trial' : ''}
                            </p>
                            <p className="set-plan-meta">
                              {isBusiness ? 'Business workspace' : 'Individual workspace'}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="set-btn set-btn-ghost"
                            onClick={() => router.push('/billing')}
                          >
                            Upgrade
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="set-card-actions">
                      <button type="button" className="set-btn set-btn-secondary" onClick={resetProfileForm} disabled={saving}>
                        Cancel
                      </button>
                      <button type="button" className="set-btn set-btn-primary" onClick={saveProfile} disabled={saving}>
                        {saving ? <Loader2 className="set-btn-icon animate-spin" /> : <Save className="set-btn-icon" />}
                        {saving ? 'Saving…' : 'Save Changes'}
                      </button>
                    </div>
                  </section>
                </>
              )}

              {activeTab === 'ai' && (
                <section className="set-card">
                  <div className="set-card-head">
                    <h2 className="set-card-title">AI Models Configuration</h2>
                    <p className="set-card-sub">The models powering agents, fast tasks and private routing</p>
                  </div>

                  {modelConfigLoading ? (
                    <div className="set-loading">
                      <Loader2 className="set-btn-icon animate-spin" />
                      Loading model configuration…
                    </div>
                  ) : modelConfigError ? (
                    <div className="set-inline-error">
                      <AlertTriangle className="set-error-icon" />
                      <div>
                        <p className="set-row-title">AI configuration unavailable</p>
                        <p className="set-row-sub">{modelConfigError}</p>
                        <button type="button" className="set-btn set-btn-secondary set-retry-btn" onClick={loadModelConfig}>
                          Retry
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="set-model-grid">
                        <div className="set-model-card">
                          <span className="set-model-icon"><Bot className="set-btn-icon" /></span>
                          <p className="set-model-label">Default Agent Model</p>
                          <p className="set-model-name">{modelConfig?.defaultModel?.model || 'Not configured'}</p>
                          <p className="set-model-provider">
                            {modelConfig?.defaultModel?.providerName || 'Add a provider key to enable agent runs'}
                          </p>
                        </div>
                        <div className="set-model-card">
                          <span className="set-model-icon"><Zap className="set-btn-icon" /></span>
                          <p className="set-model-label">Fast Tasks Model</p>
                          <p className="set-model-name">{modelConfig?.fastModel?.model || 'Not configured'}</p>
                          <p className="set-model-provider">
                            {modelConfig?.fastModel?.providerName || 'Falls back to the default agent model'}
                          </p>
                        </div>
                        <div className="set-model-card">
                          <span className="set-model-icon"><Shield className="set-btn-icon" /></span>
                          <p className="set-model-label">Privacy Mode</p>
                          <p className="set-model-name">
                            {modelConfig?.privacy?.available ? 'Available' : 'Not connected'}
                          </p>
                          <p className="set-model-provider">
                            {modelConfig?.privacy?.available
                              ? `${modelConfig.privacy.providerName || 'Local provider'}${modelConfig.privacy.model ? ` · ${modelConfig.privacy.model}` : ''}`
                              : 'Connect Ollama or LM Studio to route sensitive tasks locally'}
                          </p>
                        </div>
                      </div>

                      {Array.isArray(modelConfig?.providers) && modelConfig.providers.length > 0 && (
                        <div className="set-provider-block">
                          <p className="set-label">Available providers</p>
                          <div className="set-provider-chips">
                            {modelConfig.providers.map((provider) => (
                              <span key={provider.key} className="set-provider-chip">
                                {provider.name || provider.key}
                                <span className="set-provider-type">{provider.type || 'cloud'}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="set-card-actions">
                        <button type="button" className="set-btn set-btn-secondary" onClick={() => router.push('/ai-pair')}>
                          Open AI Pair
                        </button>
                        <button type="button" className="set-btn set-btn-primary" onClick={() => router.push('/ai-pair')}>
                          Configure Models
                        </button>
                      </div>
                    </>
                  )}
                </section>
              )}

              {activeTab === 'security' && (
                <>
                  <section className="set-card">
                    <div className="set-card-head">
                      <h2 className="set-card-title">Security</h2>
                      <p className="set-card-sub">Manage your password and account protections</p>
                    </div>

                    <div className="set-security-list">
                      <div className="set-security-row">
                        <span className="set-security-icon"><KeyRound className="set-btn-icon" /></span>
                        <div className="set-security-copy">
                          <p className="set-row-title">Password</p>
                          <p className="set-row-sub">Use a unique password with at least 8 characters.</p>
                        </div>
                        <button type="button" className="set-btn set-btn-ghost" onClick={() => setPasswordOpen(true)}>
                          Change password
                        </button>
                      </div>
                      <div className="set-security-row">
                        <span className="set-security-icon"><Shield className="set-btn-icon" /></span>
                        <div className="set-security-copy">
                          <p className="set-row-title">Two-factor authentication</p>
                          <p className="set-row-sub">Add a second step when signing in to your account.</p>
                        </div>
                        <span className="set-tag">Coming soon</span>
                      </div>
                    </div>
                  </section>

                  <section className="set-card set-card-danger">
                    <div className="set-card-head">
                      <h2 className="set-card-title">Delete Account</h2>
                      <p className="set-card-sub">Permanently remove your account and workspace data</p>
                    </div>

                    <div className="set-danger-body">
                      <p className="set-danger-copy">
                        Permanently deletes your profile, projects, files, AI sessions, messages, deployments
                        and usage data. Your integration connections (GitHub, Figma, Slack, Notion, Discord)
                        and synced data such as GitHub repos are kept. This cannot be undone.
                      </p>
                      <label className="set-field">
                        <span className="set-label">Type DELETE to confirm</span>
                        <input
                          type="text"
                          value={deleteText}
                          onChange={(e) => setDeleteText(e.target.value)}
                          placeholder="DELETE"
                          className="set-input"
                          autoComplete="off"
                        />
                      </label>
                      <div className="set-card-actions">
                        <button
                          type="button"
                          onClick={handleDeleteAccount}
                          disabled={deleteText !== 'DELETE' || deleting}
                          className="set-btn set-btn-danger"
                        >
                          {deleting ? <Loader2 className="set-btn-icon animate-spin" /> : <Trash2 className="set-btn-icon" />}
                          {deleting ? 'Deleting…' : 'Delete my account'}
                        </button>
                      </div>
                    </div>
                  </section>
                </>
              )}

            </div>
          </div>
        </main>
      </div>

      {passwordOpen && (
        <div className="set-modal-backdrop" role="presentation" onClick={closePassword}>
          <div
            className="set-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="set-password-title"
            onClick={(e) => e.stopPropagation()}
          >
            {passwordSuccess ? (
              <div className="set-password-success">
                <span className="set-success-icon"><CheckCircle2 className="set-success-glyph" /></span>
                <h2 id="set-password-title" className="set-modal-title">Password changed</h2>
                <p className="set-modal-sub">
                  Your password was updated. For your security, every session has been signed out.
                </p>
                <button type="button" className="set-btn set-btn-primary" onClick={finishPasswordChange}>
                  Sign in again
                </button>
              </div>
            ) : (
              <form onSubmit={submitPassword} noValidate>
                <div className="set-modal-head">
                  <div>
                    <h2 id="set-password-title" className="set-modal-title">New Password</h2>
                    <p className="set-modal-sub">Enter your current password and choose a new one.</p>
                  </div>
                  <button type="button" className="set-modal-close" onClick={closePassword} aria-label="Close">
                    <X className="set-btn-icon" />
                  </button>
                </div>

                {passwordError && (
                  <div className="set-modal-alert" role="alert">
                    <AlertTriangle className="set-error-icon" />
                    {passwordError}
                  </div>
                )}

                <label className="set-field">
                  <span className="set-label">Current Password</span>
                  <div className="set-password-input">
                    <input
                      type={showCurrent ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => { setCurrentPassword(e.target.value); clearPasswordFieldError('current'); }}
                      className={`set-input ${passwordFieldErrors.current ? 'is-error' : ''}`}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="set-eye-btn"
                      onClick={() => setShowCurrent((v) => !v)}
                      aria-label={showCurrent ? 'Hide current password' : 'Show current password'}
                    >
                      {showCurrent ? <EyeOff className="set-btn-icon" /> : <Eye className="set-btn-icon" />}
                    </button>
                  </div>
                  {passwordFieldErrors.current && <span className="set-field-error">{passwordFieldErrors.current}</span>}
                </label>

                <label className="set-field">
                  <span className="set-label">New Password</span>
                  <div className="set-password-input">
                    <input
                      type={showNew ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => { setNewPassword(e.target.value); clearPasswordFieldError('next'); }}
                      className={`set-input ${passwordFieldErrors.next ? 'is-error' : ''}`}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="set-eye-btn"
                      onClick={() => setShowNew((v) => !v)}
                      aria-label={showNew ? 'Hide new password' : 'Show new password'}
                    >
                      {showNew ? <EyeOff className="set-btn-icon" /> : <Eye className="set-btn-icon" />}
                    </button>
                  </div>
                  {passwordFieldErrors.next && <span className="set-field-error">{passwordFieldErrors.next}</span>}
                </label>

                <ul className="set-password-rules">
                  {passwordChecks.map((rule) => (
                    <li key={rule.id} className={rule.passed ? 'is-pass' : 'is-fail'}>
                      {rule.passed ? <Check className="set-rule-icon" /> : <X className="set-rule-icon" />}
                      {rule.label}
                    </li>
                  ))}
                </ul>

                <label className="set-field">
                  <span className="set-label">Confirm New Password</span>
                  <div className="set-password-input">
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); clearPasswordFieldError('confirm'); }}
                      className={`set-input ${
                        passwordFieldErrors.confirm || (confirmPassword && !passwordsMatch) ? 'is-error' : ''
                      }`}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="set-eye-btn"
                      onClick={() => setShowConfirm((v) => !v)}
                      aria-label={showConfirm ? 'Hide confirmation password' : 'Show confirmation password'}
                    >
                      {showConfirm ? <EyeOff className="set-btn-icon" /> : <Eye className="set-btn-icon" />}
                    </button>
                  </div>
                  {passwordFieldErrors.confirm && <span className="set-field-error">{passwordFieldErrors.confirm}</span>}
                  {!passwordFieldErrors.confirm && confirmPassword && !passwordsMatch && (
                    <span className="set-field-error">Passwords don&apos;t match.</span>
                  )}
                </label>

                <div className="set-modal-actions">
                  <button type="button" className="set-btn set-btn-secondary" onClick={closePassword} disabled={passwordBusy}>
                    Cancel
                  </button>
                  <button type="submit" className="set-btn set-btn-primary" disabled={passwordBusy}>
                    {passwordBusy ? <Loader2 className="set-btn-icon animate-spin" /> : <KeyRound className="set-btn-icon" />}
                    {passwordBusy ? 'Updating…' : 'Update Password'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

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
