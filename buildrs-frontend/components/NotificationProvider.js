import { useEffect } from 'react';
import useAuthStore from '../store/authStore';
import {
  connectNotifications,
  disconnectNotifications,
  loadNotifications,
  useNotificationStore,
} from '../store/notificationStore';
import { unlockAudio } from '../lib/notificationSound';

/**
 * Mounted once from _app. Owns the single /notifications socket for the whole
 * session, seeds the initial list, and unlocks audio on the first gesture.
 *
 * Every authenticated page gets real-time notifications without any per-page
 * wiring, and the bell in the sidebar reads from the same store.
 */
export default function NotificationProvider({ children }) {
  const token = useAuthStore((s) => s.token);
  const count = useNotificationStore((s) => s.count);

  useEffect(() => {
    if (!token) return undefined;

    connectNotifications();
    loadNotifications();

    // Browsers keep audio suspended until the user interacts with the page.
    const onFirstGesture = () => {
      unlockAudio();
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
    };
    window.addEventListener('pointerdown', onFirstGesture);
    window.addEventListener('keydown', onFirstGesture);

    // Focus/reconnect resync: a laptop that slept can miss pushes entirely.
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        loadNotifications();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    // Another tab marking notifications read shouldn't leave this one stale.
    const onStorage = (event) => {
      if (event.key === 'buildrs:notification-read-at') {
        loadNotifications();
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
      disconnectNotifications();
    };
  }, [token]);

  // Keep the tab title in sync so an unread count is visible even in a
  // background tab or with the bell scrolled out of view.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const base = 'BuildrsHQ';
    document.title = count > 0 ? `(${count}) ${base}` : base;
  }, [count]);

  return children;
}
