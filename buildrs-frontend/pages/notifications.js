import { useEffect, useState, useCallback, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  BellOff, Square, SquareCheckBig, Trash2, Loader2, Settings2, Lock,
} from 'lucide-react';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import useToastStore from '../store/toastStore';
import {
  useNotificationStore,
  notificationApi,
  markAsRead,
  markAsUnread,
  markAllAsRead,
  deleteNotifications,
  clearReadNotifications,
} from '../store/notificationStore';

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
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'read', label: 'Read' },
];

// Failures and anything else the platform marks `high` read red, so an urgent
// row is recognisable before reading it. The trial reminder is one of these.
const URGENT_TYPES = new Set([
  'payment_failed',
  'deployment_failed',
  'deployment_heal_failed',
  'spec_failed',
  'agent_failed',
  'trial_expiring',
  'system_alert',
]);

const isUrgent = (notification) =>
  notification.priority === 'high' || URGENT_TYPES.has(notification.type);

// Server-owned rows: present for as long as the condition lasts, not until the
// user dismisses them (the trial reminder disappears when the trial ends).
const isLocked = (notification) => notification.locked === true;

function formatNotificationTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  if (sameDay) return `Today ${time}`;
  if (isYesterday) return `Yesterday ${time}`;
  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`;
}

function matchesFilter(notification, filter) {
  if (filter === 'unread') return !notification.read;
  if (filter === 'read') return Boolean(notification.read);
  return true;
}

export default function Notifications() {
  const router = useRouter();
  const items = useNotificationStore((s) => s.items);
  const count = useNotificationStore((s) => s.count);
  const preferences = useNotificationStore((s) => s.preferences);
  const setPreferences = useNotificationStore((s) => s.setPreferences);
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);
  const toast = useToastStore();

  const [filter, setFilter] = useState('all');
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [showPrefs, setShowPrefs] = useState(false);
  const [savingPref, setSavingPref] = useState(false);
  const fetchedRef = useRef(0);
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const fetchPage = useCallback(async (skip, currentFilter) => {
    const res = await notificationApi.list({
      limit: PAGE_SIZE,
      skip,
      unreadOnly: currentFilter === 'unread' ? 'true' : undefined,
      readOnly: currentFilter === 'read' ? 'true' : undefined,
    });
    return res;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSelectMode(false);
    setSelected(new Set());
    fetchedRef.current = 0;
    (async () => {
      try {
        const res = await fetchPage(0, filter);
        if (cancelled || !res?.success) return;
        const rows = res.notifications || [];
        setList(rows);
        fetchedRef.current = rows.length;
        setTotal(res.total ?? rows.length);
        setFilteredTotal(res.filteredTotal ?? rows.length);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [filter, fetchPage]);

  // Live socket arrivals (prepended to the shared store) join the page list
  // when they match the active filter.
  useEffect(() => {
    if (!items.length) return;
    setList((prev) => {
      const fresh = items.filter(
        (n) => !prev.some((p) => p._id === n._id) && matchesFilter(n, filterRef.current)
      );
      if (!fresh.length) return prev;
      setTotal((t) => t + fresh.length);
      setFilteredTotal((t) => t + fresh.length);
      return [...fresh, ...prev];
    });
  }, [items]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const res = await fetchPage(fetchedRef.current, filterRef.current);
      if (res?.success) {
        const rows = res.notifications || [];
        fetchedRef.current += rows.length;
        setList((prev) => {
          const known = new Set(prev.map((n) => n._id));
          return [...prev, ...rows.filter((n) => !known.has(n._id))];
        });
        if (typeof res.total === 'number') setTotal(res.total);
        if (typeof res.filteredTotal === 'number') setFilteredTotal(res.filteredTotal);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage]);

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

  const toggleSelected = (id) => {
    const target = list.find((n) => n._id === id);
    if (target && isLocked(target)) {
      toast.info('This notification stays until your trial ends');
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectMode) {
      setSelectMode(false);
      setSelected(new Set());
      return;
    }
    setSelectMode(true);
    // Locked rows are not deletable, so they must not be pulled into a batch.
    setSelected(new Set(list.filter((n) => !isLocked(n)).map((n) => n._id)));
  };

  const handleDeleteSelected = async () => {
    const ids = [...selected].filter((id) => {
      const target = list.find((n) => n._id === id);
      return !target || !isLocked(target);
    });
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} selected notification${ids.length === 1 ? '' : 's'}?`)) return;
    const res = await deleteNotifications(ids);
    setList((prev) => prev.filter((n) => !selected.has(n._id) || isLocked(n)));
    setTotal((t) => Math.max(0, t - ids.length));
    setFilteredTotal((t) => Math.max(0, t - ids.length));
    setSelectMode(false);
    setSelected(new Set());
    if (res?.skipped) {
      toast.info('Locked notifications stay until your trial ends');
    }
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead();
    setList((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleToggleRead = (notification) => {
    const nextRead = !notification.read;
    setList((prev) => prev.map((n) => (n._id === notification._id ? { ...n, read: nextRead } : n)));
    if (nextRead) markAsRead(notification._id);
    else markAsUnread(notification._id);
  };

  const openNotification = (notification) => {
    if (!notification.read) {
      setList((prev) => prev.map((n) => (n._id === notification._id ? { ...n, read: true } : n)));
      markAsRead(notification._id);
    }
    if (notification.link) {
      if (/^https?:\/\//.test(notification.link)) window.open(notification.link, '_blank', 'noopener');
      else router.push(notification.link);
    }
  };

  const readCount = Math.max(0, total - count);
  const categories = preferences?.categories || {};
  const hasMore = list.length < filteredTotal;

  return (
    <AuthGuard>
      <Head>
        <title>Notifications | BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>
      <div className="workspace-container">
        <Sidebar user={user} subscription={subscription} />
        <main className="workspace-main">
          <div className="workspace-content">
            <div className="notif-page">
              <header className="notif-head">
                <p className="notif-crumb">Manage / Notification</p>
                <h1 className="notif-title">Notifications</h1>
                <p className="notif-subtitle">
                  Stay updated on project activities, tasks, AI agents, audits and workspace events
                </p>
              </header>

              <div className="notif-toolbar">
                <div className="notif-filters" role="tablist" aria-label="Filter notifications">
                  {FILTERS.map(({ key, label }) => {
                    const badge = key === 'unread' ? count : key === 'read' ? readCount : null;
                    return (
                      <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={filter === key}
                        className={`notif-filter-btn ${filter === key ? 'active' : ''}`}
                        onClick={() => setFilter(key)}
                      >
                        {label}
                        {badge !== null && badge > 0 && (
                          <span className="notif-count-badge">{badge}</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="notif-actions">
                  {selectMode ? (
                    <>
                      <button type="button" className="notif-action-btn" onClick={toggleSelectAll}>
                        <SquareCheckBig className="notif-action-icon checked" />
                        Unselect All
                      </button>
                      <button
                        type="button"
                        className="notif-action-btn notif-action-danger"
                        onClick={handleDeleteSelected}
                        disabled={!selected.size}
                      >
                        <Trash2 className="notif-action-icon" />
                        Delete All{selected.size ? ` (${selected.size})` : ''}
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="notif-action-btn" onClick={toggleSelectAll} disabled={!list.length}>
                        <Square className="notif-action-icon" />
                        Select All
                      </button>
                      <button type="button" className="notif-action-btn" onClick={handleMarkAllRead} disabled={!count}>
                        <Square className="notif-action-icon" />
                        Mark all as Read
                      </button>
                    </>
                  )}
                </div>
              </div>

              {loading ? (
                <div className="notif-empty-card">
                  <Loader2 className="w-6 h-6 notif-spin" />
                  <p className="notif-muted">Loading notifications…</p>
                </div>
              ) : list.length === 0 ? (
                <div className="notif-empty-card">
                  <span className="notif-empty-icon"><BellOff className="w-7 h-7" /></span>
                  <p className="notif-empty-eyebrow">Zero_Notifications</p>
                  <h2 className="notif-empty-title">No Notification Received</h2>
                  <p className="notif-muted">All your notifications activities on the platform will be shown here</p>
                </div>
              ) : (
                <div className="notif-rows">
                  {list.map((notification) => {
                    const isSelected = selected.has(notification._id);
                    const urgent = isUrgent(notification);
                    const locked = isLocked(notification);
                    return (
                      <article
                        key={notification._id}
                        className={`notif-row-card ${isSelected ? 'notif-row-selected' : ''} ${
                          urgent ? 'notif-row-urgent' : ''
                        } ${locked ? 'notif-row-locked' : ''}`}
                        onClick={() => {
                          if (selectMode) toggleSelected(notification._id);
                          else openNotification(notification);
                        }}
                      >
                        {selectMode && (
                          <button
                            type="button"
                            className={`notif-check ${isSelected ? 'checked' : ''}`}
                            aria-label={
                              locked
                                ? 'This notification cannot be deleted'
                                : isSelected
                                  ? 'Deselect notification'
                                  : 'Select notification'
                            }
                            aria-pressed={isSelected}
                            aria-disabled={locked}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSelected(notification._id);
                            }}
                          >
                            {locked ? (
                              <Lock className="w-5 h-5 notif-lock-icon" />
                            ) : isSelected ? (
                              <SquareCheckBig className="w-5 h-5" />
                            ) : (
                              <Square className="w-5 h-5" />
                            )}
                          </button>
                        )}

                        <div className="notif-row-main">
                          <h3 className="notif-row-title">
                            {!notification.read && <span className="notif-unread-dot" />}
                            {notification.title}
                            {urgent && <span className="notif-urgent-tag">Urgent</span>}
                          </h3>
                          <p className="notif-row-message">{notification.message}</p>
                          {locked && (
                            <p className="notif-row-note">
                              <Lock className="notif-row-note-icon" aria-hidden="true" />
                              Can&apos;t be deleted — removed automatically when your trial ends
                            </p>
                          )}
                        </div>

                        {!selectMode && (
                          <div className="notif-row-side">
                            <span className="notif-row-time">{formatNotificationTime(notification.createdAt)}</span>
                            <div className="notif-row-actions">
                              <button
                                type="button"
                                className="notif-text-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleRead(notification);
                                }}
                              >
                                {notification.read ? 'Mark as Unread' : 'Mark as Read'}
                              </button>
                              <button
                                type="button"
                                className="notif-open-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openNotification(notification);
                                }}
                              >
                                Open
                              </button>
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}

              {hasMore && (
                <div className="notif-load-more-wrap">
                  <button type="button" className="notif-load-more-btn" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore && <Loader2 className="w-4 h-4 notif-spin" />}
                    Load more
                  </button>
                </div>
              )}

              <div className="notif-foot">
                <button type="button" className="notif-prefs-toggle" onClick={() => setShowPrefs((v) => !v)}>
                  <Settings2 className="w-4 h-4" />
                  Notification preferences
                </button>
                <p className="notif-muted">
                  Notifications are kept for 30 days. <Link href="/settings">Preferences</Link>
                </p>
                {showPrefs && (
                  <div className="notif-prefs-card">
                    <h2 className="notif-prefs-title">What should notify you</h2>
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
                    <button type="button" className="notif-text-btn" onClick={clearReadNotifications}>
                      Clear read notifications
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
