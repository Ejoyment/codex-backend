import { create } from 'zustand';
import { io } from 'socket.io-client';
import { apiFetch } from '../lib/api';
import useToastStore from '../store/toastStore';
import {
  playNotificationSound,
  unlockAudio,
  isSoundMuted,
  setSoundMuted,
} from '../lib/notificationSound';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000';
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
  markAllRead: () => apiFetch('/api/notifications/read-all', { method: 'PUT' }),
  remove: (id) => apiFetch(`/api/notifications/${id}`, { method: 'DELETE' }),
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
  if (seenIds().has(notification._id)) return;

  rememberSeen(notification._id);
  store.prepend(notification);

  const prefs = store.preferences || {};
  playNotificationSound({
    muted: store.muted || prefs.sound === false,
    hiddenOnly: prefs.soundWhenHiddenOnly !== false,
    priority: notification.priority || 'normal',
  });

  // Only the attention-grabbing ones raise a toast; the rest live in the bell.
  if (notification.priority === 'high') {
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
  if (socket) return socket;

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
    const [list, prefs] = await Promise.all([
      notificationApi.list({ limit: MAX_VISIBLE }).catch(() => null),
      notificationApi.getPreferences().catch(() => null),
    ]);
    if (list?.success) store.setItems(list.notifications || []);
    if (prefs?.success) store.setPreferences(prefs.preferences);
    if (!list?.success) refreshCount();
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

export async function deleteNotification(id) {
  const store = useNotificationStore.getState();
  store.remove(id);
  try {
    await notificationApi.remove(id);
  } catch {
    refreshCount();
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
