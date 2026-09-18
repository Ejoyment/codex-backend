export function getAvatarUrl(user, fallbackName) {
  const name = fallbackName || user?.fullName || user?.name || 'User';
  const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000')
    .replace(/\/+$/, '')
    .replace(/\/api$/, '');

  if (!user?.profilePicture) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=3b82f6&color=fff`;
  }

  if (user.profilePicture.startsWith('/uploads/')) {
    return `${base}${user.profilePicture}`;
  }

  return user.profilePicture;
}

export function normalizeUserId(user) {
  return String(user?._id || user?.id || user?.userId || '');
}
