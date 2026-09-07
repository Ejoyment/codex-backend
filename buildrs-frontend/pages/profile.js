import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch } from '../lib/api';
import { rateLimit, validate, createSubmitGuard } from '../lib/security';
import { Camera, Save, Loader2, User, Mail, Briefcase, Shield, CheckCircle } from 'lucide-react';
import useToastStore from '../store/toastStore';
import { getAvatarUrl } from '../lib/utils';

const submitGuard = createSubmitGuard();

export default function Profile() {
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);
  const setAuth = useAuthStore((s) => s.setAuth);

  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const toast = useToastStore();

  useEffect(() => {
    if (user) {
      setName(user.fullName || '');
    }
  }, [user]);

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

    const rl = rateLimit('profile-save', { maxAttempts: 5, windowMs: 60000 });
    if (!rl.allowed) {
      toast.error(`Too many requests. Wait ${rl.retryAfter}s`);
      submitGuard.release();
      return;
    }

    setSaving(true);
    try {
      const data = await apiFetch('/api/profile', {
        method: 'PUT',
        body: JSON.stringify({ fullName: name }),
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

  const uploadPicture = async (e) => {
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
    setUploading(true);
    try {
      const form = new FormData();
      form.append('profilePicture', file);
      const data = await apiFetch('/api/profile/picture', {
        method: 'POST',
        body: form,
      });
      if (data.profilePicture) {
        const updated = { ...user, profilePicture: data.profilePicture };
        const token = localStorage.getItem('authToken');
        setAuth(token, updated);
        toast.success('Profile picture updated');
      } else {
        toast.error(data.message || 'Upload failed');
      }
    } catch (err) {
      toast.error(err.message || 'Failed to upload picture');
    } finally {
      setUploading(false);
    }
  };

  const profilePictureUrl = getAvatarUrl(user, user?.fullName || user?.name || 'User');

  return (
    <AuthGuard>
      <Head>
        <title>Profile - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="workspace-container">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main">
          <header className="workspace-header">
            <div className="flex items-center gap-6">
              <h1 className="text-xl font-bold">Profile</h1>
            </div>
          </header>

          <div className="workspace-content">

            <div className="max-w-2xl">
              <div className="workspace-card">
                <div className="workspace-card-header">
                  <h2 className="workspace-card-title">Personal Information</h2>
                </div>
                <div className="workspace-card-body">
                  <form onSubmit={saveProfile} className="space-y-6" noValidate>
                    {/* Profile Picture */}
                    <div className="flex items-center gap-5">
                      <div className="relative">
                        <img
                          src={profilePictureUrl}
                          alt={user?.fullName || 'User'}
                          className="w-24 h-24 rounded-full object-cover border-2 border-gray-600"
                        />
                        {uploading && (
                          <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                            <Loader2 className="w-6 h-6 text-white animate-spin" />
                          </div>
                        )}
                      </div>
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
                        <p className="text-xs text-gray-500 mt-1.5">JPG, PNG. Max 5MB.</p>
                      </div>
                    </div>

                    {/* Full Name */}
                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium mb-2">
                        <User className="w-4 h-4 text-gray-400" />
                        Full Name
                      </label>
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={() => validateField(name)}
                        className={`w-full px-4 py-2.5 bg-navy border rounded-lg text-white focus:outline-none focus:border-blue-accent ${
                          fieldErrors.fullName ? 'border-red-500' : 'border-gray-600'
                        }`}
                        placeholder="Enter your full name"
                        autoComplete="name"
                        maxLength={100}
                      />
                      {fieldErrors.fullName && <p className="text-xs text-red-400 mt-1">{fieldErrors.fullName}</p>}
                    </div>

                    {/* Email (disabled) */}
                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium mb-2">
                        <Mail className="w-4 h-4 text-gray-400" />
                        Email
                      </label>
                      <input
                        value={user?.email || ''}
                        disabled
                        className="w-full px-4 py-2.5 bg-navy border border-gray-600 rounded-lg text-gray-400 cursor-not-allowed"
                      />
                      <p className="text-xs text-gray-500 mt-1.5">Contact support to change your email.</p>
                    </div>

                    {/* Role (disabled) */}
                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium mb-2">
                        <Shield className="w-4 h-4 text-gray-400" />
                        Role
                      </label>
                      <input
                        value={Array.isArray(user?.role) ? user.role.join(', ') : user?.role || ''}
                        disabled
                        className="w-full px-4 py-2.5 bg-navy border border-gray-600 rounded-lg text-gray-400 cursor-not-allowed capitalize"
                      />
                    </div>

                    {/* Company (disabled) */}
                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium mb-2">
                        <Briefcase className="w-4 h-4 text-gray-400" />
                        Company
                      </label>
                      <input
                        value={user?.company?.name || user?.company || ''}
                        disabled
                        className="w-full px-4 py-2.5 bg-navy border border-gray-600 rounded-lg text-gray-400 cursor-not-allowed"
                      />
                    </div>

                    {/* Save */}
                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={saving}
                        className="cta-button px-5 py-2.5 rounded-lg text-white font-medium inline-flex items-center gap-2 disabled:opacity-50"
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {saving ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
