import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Bell, CheckCheck, Trash2, Volume2, VolumeX, Loader2 } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import {
  useNotificationStore,
  notificationApi,
  markAsRead,
  markAllAsRead,
  clearReadNotifications,
} from '../store/notificationStore';
import { playTestSound } from '../lib/notificationSound';

const CATEGORY_LABELS = {
  messages: 'Messages',
  tasks: 'Tasks',
  specs: 'Specs',
  agents: 'Agents',
  meetings: 'Meetings',
  workspace: 'Workspace',
  deployments: 'Deployments',
  billing: 'Billing',
};

const PAGE_SIZE = 30;

function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(then).toLocaleDateString();
}

export default function Notifications() {
  const router = useRouter();
  const items = useNotificationStore((s) => s.items);
  const count = useNotificationStore((s) => s.count);
  const muted = useNotificationStore((s) => s.muted);
  const preferences = useNotificationStore((s) => s.preferences);
  const toggleMuted = useNotificationStore((s) => s.toggleMuted);
  const setPreferences = useNotificationStore((s) => s.setPreferences);
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);

  const [older, setOlder] = useState([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [savingPref, setSavingPref] = useState(false);

  useEffect(() => {
    setOlder([]);
  }, [unreadOnly]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const res = await notificationApi.list({
        limit: PAGE_SIZE,
        skip: items.length + older.length,
        unreadOnly: unreadOnly ? 'true' : undefined,
      });
      if (res?.success) setOlder((prev) => [...prev, ...(res.notifications || [])]);
    } finally {
      setLoadingMore(false);
    }
  }, [items.length, older.length, unreadOnly]);

  const toggleCategory = async (key) => {
    const next = !preferences?.categories?.[key];
    setSavingPref(true);
    try {
      const res = await notificationApi.updatePreferences({ categories: { [key]: next } });
      if (res?.success) setPreferences(res.preferences);
    } finally {
      setSavingPref(false);
    }
  };

  const toggleHiddenOnly = async () => {
    setSavingPref(true);
    try {
      const res = await notificationApi.updatePreferences({
        soundWhenHiddenOnly: !preferences?.soundWhenHiddenOnly,
      });
      if (res?.success) setPreferences(res.preferences);
    } finally {
      setSavingPref(false);
    }
  };

  const all = [...items, ...older];
  const categories = preferences?.categories || {};

  return (
    <AuthGuard>
      <Head>
        <title>Notifications | BuildrsHQ</title>
      </Head>
      <div className="workspace-container">
        <Sidebar user={user} subscription={subscription} />
        <main className="workspace-main">
          <header className="workspace-header dash-header">
            <div>
              <p className="dash-crumb">BuildrsHQ <span className="sep">/</span> Notifications</p>
              <h1 className="dash-title">Notifications</h1>
            </div>
            <div className="notif-page-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  const nextMuted = toggleMuted();
                  if (nextMuted) playTestSound();
                }}
                title={muted ? 'Unmute sounds' : 'Mute sounds'}
              >
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                {muted ? 'Sounds off' : 'Sounds on'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={markAllAsRead}
                disabled={!count}
              >
                <CheckCheck size={16} /> Mark all read
              </button>
              <button type="button" className="btn btn-ghost" onClick={clearReadNotifications}>
                <Trash2 size={16} /> Clear read
              </button>
            </div>
          </header>

          <section className="notif-prefs">
            <h2>What should notify you</h2>
            <div className="notif-pref-grid">
              {Object.keys(CATEGORY_LABELS).map((key) => (
                <label key={key} className="notif-pref-toggle">
                  <input
                    type="checkbox"
                    checked={categories[key] !== false}
                    disabled={savingPref || preferences?.enabled === false}
                    onChange={() => toggleCategory(key)}
                  />
                  <span>{CATEGORY_LABELS[key]}</span>
                </label>
              ))}
            </div>
            <label className="notif-pref-toggle">
              <input
                type="checkbox"
                checked={preferences?.soundWhenHiddenOnly !== false}
                disabled={savingPref}
                onChange={toggleHiddenOnly}
              />
              <span>Play sound only when this tab is in the background</span>
            </label>
          </section>

          <div className="notif-filter">
            <button
              type="button"
              className={`notif-chip ${!unreadOnly ? 'active' : ''}`}
              onClick={() => setUnreadOnly(false)}
            >
              All
            </button>
            <button
              type="button"
              className={`notif-chip ${unreadOnly ? 'active' : ''}`}
              onClick={() => setUnreadOnly(true)}
            >
              Unread {count > 0 ? `(${count})` : ''}
            </button>
          </div>

          <div className="notif-page-list">
            {all.length === 0 && (
              <div className="notif-empty-page">
                <Bell size={28} />
                <p>Nothing here yet. Activity on your tasks, channels, agents and deployments will show up here.</p>
              </div>
            )}

            {all.map((notification) => (
              <button
                key={notification._id}
                type="button"
                className={`notif-page-row ${notification.read ? '' : 'notif-page-row-unread'}`}
                onClick={() => {
                  if (!notification.read) markAsRead(notification._id);
                  if (notification.link) router.push(notification.link);
                }}
              >
                <div className="notif-page-row-main">
                  <span className="notif-page-title">{notification.title}</span>
                  <span className="notif-page-message">{notification.message}</span>
                </div>
                <span className="notif-page-time">{timeAgo(notification.createdAt)}</span>
                {!notification.read && <span className="notif-unread-dot" />}
              </button>
            ))}

            {all.length > 0 && (
              <button
                type="button"
                className="btn btn-ghost notif-load-more"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore && <Loader2 size={15} className="notif-spin" />} Load more
              </button>
            )}
          </div>

          <p className="notif-footnote">
            Notifications are kept for 30 days. <Link href="/settings">Preferences</Link>
          </p>
        </main>
      </div>
    </AuthGuard>
  );
}
