export function getApiBaseUrl() {
  const envBase = process.env.NEXT_PUBLIC_API_URL || 'https://codex-backend-7utu.onrender.com';
  return envBase.replace(/\/+$/, '').replace(/\/api$/, '');
}

export function getAvatarUrl(user, fallbackName) {
  const name = fallbackName || user?.fullName || user?.name || 'User';
  const base = getApiBaseUrl();
  const profilePicture = user?.profilePicture || user?.avatar || '';

  if (!profilePicture || profilePicture === 'null' || profilePicture === 'undefined') {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=3b82f6&color=fff`;
  }

  if (typeof profilePicture !== 'string') {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=3b82f6&color=fff`;
  }

  const trimmed = profilePicture.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  let normalizedPicture = trimmed;
  if (normalizedPicture.startsWith('uploads/')) {
    normalizedPicture = `/${normalizedPicture}`;
  }
  if (!normalizedPicture.startsWith('/')) {
    normalizedPicture = `/${normalizedPicture}`;
  }

  if (normalizedPicture.startsWith('/uploads/')) {
    return `${base}${normalizedPicture}`;
  }

  if (normalizedPicture.startsWith('/api/uploads/')) {
    return `${base}${normalizedPicture.replace(/^\/api/, '')}`;
  }

  return normalizedPicture.startsWith('/') ? `${base}${normalizedPicture}` : `${base}/${normalizedPicture}`;
}

export function normalizeUserId(user) {
  return String(user?._id || user?.id || user?.userId || '');
}
