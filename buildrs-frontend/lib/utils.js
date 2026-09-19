export function getApiBaseUrl() {
  const envBase = process.env.NEXT_PUBLIC_API_URL || 'https://codex-backend-7utu.onrender.com';
  return envBase.replace(/\/+$/, '').replace(/\/api$/, '');
}

export function getAvatarUrl(user, fallbackName) {
  const name = fallbackName || user?.fullName || user?.name || 'User';
  const base = getApiBaseUrl();
  const profilePicture = user?.profilePicture;

  if (!profilePicture) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=3b82f6&color=fff`;
  }

  if (profilePicture.startsWith('http://') || profilePicture.startsWith('https://')) {
    return profilePicture;
  }

  const normalizedPicture = profilePicture.startsWith('uploads/') ? `/${profilePicture}` : profilePicture;

  if (normalizedPicture.startsWith('/uploads/')) {
    return `${base}${normalizedPicture}`;
  }

  return profilePicture;
}

export function normalizeUserId(user) {
  return String(user?._id || user?.id || user?.userId || '');
}
