import { create } from 'zustand';
import { io } from 'socket.io-client';
import { apiFetch, SOCKET_URL } from '../lib/api';
import useToastStore from '../store/toastStore';
import {
  playNotificationSound,
  unlockAudio,
  isSoundMuted,
  setSoundMuted,
} from '../lib/notificationSound';

const MAX_VISIBLE = 30;
const CLIENT_SEEN_KEY = 'buildrs:notification-seen';

// Notifications live in a store so the bell, the dropdown, the history page and
// the socket all share one source of truth. Mounted once from _app.
export const useNotificationStore = create((set, get) => ({
  items: [],
  count: 0,
  byCategory: {},
  preferences: null,
  connected: false,
  loading: false,
  muted: typeof window !== 'undefined' ? isSoundMuted() : false,
  open: false,

  setOpen: (open) => set({ open }),
  setMuted: (muted) => {
    const next = setSoundMuted(muted);
    set({ muted: next });
    return next;
  },
  toggleMuted: () => get().setMuted(!get().muted),

  setLoading: (loading) => set({ loading }),

  setItems: (items) => set({ items, count: items.filter((n) => !n.read).length }),

  setCount: (count, byCategory) => set({ count, byCategory: byCategory || {} }),

  setPreferences: (preferences) => set({ preferences }),
  setConnected: (connected) => set({ connected }),

  prepend: (notification) =>
    set((state) => {
      if (state.items.some((n) => n._id === notification._id)) return state;
      const items = [notification, ...state.items].slice(0, MAX_VISIBLE);
      return { items, count: state.count + (notification.read ? 0 : 1) };
    }),

  // Only decrement when this call is what flipped the row, so a double click
  // (or a re-render) can't under-count the badge.
  markRead: (id) =>
    set((state) => {
      const target = state.items.find((n) => n._id === id);
      const wasUnread = Boolean(target && !target.read);
      return {
        items: state.items.map((n) => (n._id === id ? { ...n, read: true } : n)),
        count: wasUnread ? Math.max(0, state.count - 1) : state.count,
      };
    }),

  // Only increment when this call is what flipped the row back to unread.
  markUnread: (id) =>
    set((state) => {
      const target = state.items.find((n) => n._id === id);
      const wasRead = Boolean(target && target.read);
      return {
        items: state.items.map((n) => (n._id === id ? { ...n, read: false } : n)),
        count: wasRead ? state.count + 1 : state.count,
      };
    }),

  markAllRead: () =>
    set((state) => ({ items: state.items.map((n) => ({ ...n, read: true })), count: 0, byCategory: {} })),

  remove: (id) =>
    set((state) => {
      const target = state.items.find((n) => n._id === id);
      return {
        items: state.items.filter((n) => n._id !== id),
        count: target && !target.read && state.count > 0 ? state.count - 1 : state.count,
      };
    }),

  removeMany: (ids) =>
    set((state) => {
      const idSet = new Set(ids);
      const removedUnread = state.items.filter((n) => idSet.has(n._id) && !n.read).length;
      return {
        items: state.items.filter((n) => !idSet.has(n._id)),
        count: Math.max(0, state.count - removedUnread),
      };
    }),

  clearRead: () => set((state) => ({ items: state.items.filter((n) => !n.read) })),
}));

let socket = null;

/** Ids already shown as a toast, so a reconnect replay can't re-toast. */
function seenIds() {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = JSON.parse(localStorage.getItem(CLIENT_SEEN_KEY) || '[]');
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}

function rememberSeen(id) {
  if (typeof localStorage === 'undefined' || !id) return;
  try {
    const next = [...seenIds(), id].slice(-200);
    localStorage.setItem(CLIENT_SEEN_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
}

export const notificationApi = {
  list: (params = {}) => {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
    ).toString();
    return apiFetch(`/api/notifications${query ? `?${query}` : ''}`);
  },
  unreadCount: () => apiFetch('/api/notifications/unread-count'),
  markRead: (id) => apiFetch(`/api/notifications/${id}/read`, { method: 'PUT' }),
  markUnread: (id) => apiFetch(`/api/notifications/${id}/unread`, { method: 'PUT' }),
  markAllRead: () => apiFetch('/api/notifications/read-all', { method: 'PUT' }),
  remove: (id) => apiFetch(`/api/notifications/${id}`, { method: 'DELETE' }),
  removeMany: (ids) =>
    apiFetch('/api/notifications', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }),
  clearRead: () => apiFetch('/api/notifications/read-all', { method: 'DELETE' }),
  getPreferences: () => apiFetch('/api/notifications/preferences'),
  updatePreferences: (patch) =>
    apiFetch('/api/notifications/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
};

function handleIncoming(notification) {
  if (!notification || !notification._id) return;
  const store = useNotificationStore.getState();
  if (store.items.some((n) => n._id === notification._id)) return;

  // Only skip the toast if we've already shown this notification in this session.
  // Always prepend to the store so the bell/dropdown stay in sync with the server.
  rememberSeen(notification._id);
  store.prepend(notification);

  const prefs = store.preferences || {};
  const alreadySeen = seenIds().has(notification._id);
  playNotificationSound({
    muted: store.muted || prefs.sound === false,
    hiddenOnly: prefs.soundWhenHiddenOnly !== false,
    priority: notification.priority || 'normal',
  });

  // Only the attention-grabbing ones raise a toast; the rest live in the bell.
  if (notification.priority === 'high' && !alreadySeen) {
    useToastStore.getState().addToast(notification.message || notification.title, 'info', 6000);
  }
}

async function refreshCount() {
  try {
    const res = await notificationApi.unreadCount();
    if (res?.success) useNotificationStore.getState().setCount(res.count || 0);
  } catch {
    /* badge will resync on the next socket event or page load */
  }
}

/**
 * Opens the shared notification socket. Reference-counted so multiple mounted
 * consumers (bell + page) never create competing connections.
 */
export function connectNotifications() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
  if (!token) return null;
  // Reuse an existing live socket; if it's closed, create a fresh one.
  if (socket && socket.connected) return socket;
  if (socket && !socket.connected) {
    socket.disconnect();
    socket = null;
  }

  socket = io(`${SOCKET_URL}/notifications`, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
  });

  socket.on('connect', () => {
    useNotificationStore.getState().setConnected(true);
    // Re-sync authoritative state after a reconnect.
    socket.emit('notification:sync');
  });
  socket.on('disconnect', () => useNotificationStore.getState().setConnected(false));
  socket.on('notification:new', handleIncoming);
  // Server-owned rows (the trial reminder) are removed when they stop applying.
  socket.on('notification:removed', ({ id } = {}) => {
    if (id) useNotificationStore.getState().remove(id);
  });
  socket.on('notification:count', ({ count, byCategory }) =>
    useNotificationStore.getState().setCount(count || 0, byCategory)
  );

  return socket;
}

export function disconnectNotifications() {
  if (!socket) return;
  socket.disconnect();
  socket = null;
  useNotificationStore.getState().setConnected(false);
}

/** Load the initial list, badge and preferences. Safe to call more than once. */
export async function loadNotifications() {
  const store = useNotificationStore.getState();
  store.setLoading(true);
  try {
    const [list, prefs, countRes] = await Promise.all([
      notificationApi.list({ limit: MAX_VISIBLE }).catch(() => null),
      notificationApi.getPreferences().catch(() => null),
      notificationApi.unreadCount().catch(() => null),
    ]);
    if (list?.success) store.setItems(list.notifications || []);
    if (countRes?.success) store.setCount(countRes.count || 0);
    else if (!list?.success) refreshCount();
    if (prefs?.success) store.setPreferences(prefs.preferences);
  } finally {
    store.setLoading(false);
  }
}

export async function markAsRead(id) {
  useNotificationStore.getState().markRead(id);
  try {
    await notificationApi.markRead(id);
  } finally {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('buildrs:notification-read-at', String(Date.now()));
    }
  }
}

export async function markAllAsRead() {
  useNotificationStore.getState().markAllRead();
  try {
    await notificationApi.markAllRead();
  } finally {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('buildrs:notification-read-at', String(Date.now()));
    }
  }
}

export async function markAsUnread(id) {
  useNotificationStore.getState().markUnread(id);
  try {
    await notificationApi.markUnread(id);
  } finally {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('buildrs:notification-read-at', String(Date.now()));
    }
  }
}

export async function deleteNotification(id) {
  const store = useNotificationStore.getState();
  store.remove(id);
  try {
    await notificationApi.remove(id);
  } catch {
    refreshCount();
  }
}

export async function deleteNotifications(ids) {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return null;
  const store = useNotificationStore.getState();
  store.removeMany(unique);
  try {
    const res = await notificationApi.removeMany(unique);
    // Locked rows are refused by the server; pull the authoritative list so
    // they reappear instead of vanishing from this tab only.
    if (res?.skipped) await loadNotifications();
    return res;
  } catch {
    refreshCount();
    return null;
  }
}

export async function clearReadNotifications() {
  useNotificationStore.getState().clearRead();
  try {
    await notificationApi.clearRead();
  } catch {
    refreshCount();
  }
}
