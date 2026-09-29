import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Bell, Check, CheckCheck, Trash2, Volume2, VolumeX, Loader2 } from 'lucide-react';
import {
  useNotificationStore,
  markAsRead,
  markAllAsRead,
  clearReadNotifications,
} from '../store/notificationStore';
import { playTestSound } from '../lib/notificationSound';
import { getAvatarUrl } from '../lib/utils';

// Map event types to a colour so the bell reads at a glance.
const TONE = {
  mention: 'var(--danger, #ef4444)',
  direct_message: 'var(--accent, #6366f1)',
  task_assigned: 'var(--warning, #f59e0b)',
  agent_failed: 'var(--danger, #ef4444)',
  agent_needs_input: 'var(--warning, #f59e0b)',
  deployment_failed: 'var(--danger, #ef4444)',
  payment_failed: 'var(--danger, #ef4444)',
  payment_succeeded: 'var(--success, #22c55e)',
  deployment_succeeded: 'var(--success, #22c55e)',
  spec_verified: 'var(--success, #22c55e)',
  spec_failed: 'var(--danger, #ef4444)',
};

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

function NotificationRow({ notification, onOpen }) {
  const unread = !notification.read;
  const tone = TONE[notification.type];

  const handleClick = () => {
    onOpen(notification);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`notif-row ${unread ? 'notif-row-unread' : ''}`}
      style={tone ? { borderLeft: `3px solid ${tone}` } : undefined}
      title={notification.message}
    >
      {notification.actorAvatar || notification.actorName ? (
        <img
          className="notif-avatar"
          src={getAvatarUrl(notification, notification.actorName || 'User')}
          alt=""
        />
      ) : (
        <span className="notif-avatar notif-avatar-fallback" style={tone ? { background: tone } : undefined}>
          <Bell size={14} />
        </span>
      )}
      <span className="notif-body">
        <span className="notif-title">{notification.title}</span>
        <span className="notif-message">{notification.message}</span>
        <span className="notif-time">{timeAgo(notification.createdAt)}</span>
      </span>
      {unread && <span className="notif-unread-dot" aria-label="Unread" />}
    </button>
  );
}

export default function NotificationBell() {
  const router = useRouter();
  const items = useNotificationStore((s) => s.items);
  const count = useNotificationStore((s) => s.count);
  const loading = useNotificationStore((s) => s.loading);
  const muted = useNotificationStore((s) => s.muted);
  const connected = useNotificationStore((s) => s.connected);
  const toggleMuted = useNotificationStore((s) => s.toggleMuted);
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  // Close on outside click / Escape so the panel behaves like a real menu.
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleOpenItem = (notification) => {
    setOpen(false);
    if (!notification.read) markAsRead(notification._id);
    if (notification.link) router.push(notification.link);
  };

  const handleToggleSound = () => {
    const nextMuted = toggleMuted();
    // Un-muting deserves immediate confirmation, even on a visible tab.
    if (nextMuted) playTestSound();
  };

  return (
    <div className="notif-bell-wrap" ref={panelRef}>
      <button
        type="button"
        className="notif-bell-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
        aria-expanded={open}
        title={connected ? 'Notifications (live)' : 'Notifications (reconnecting…)'}
      >
        <Bell size={18} />
        {count > 0 && <span className="notif-badge">{count > 99 ? '99+' : count}</span>}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-panel-head">
            <span className="notif-panel-title">Notifications</span>
            <div className="notif-panel-actions">
              <button
                type="button"
                className="notif-icon-btn"
                onClick={handleToggleSound}
                title={muted ? 'Unmute notification sounds' : 'Mute notification sounds'}
                aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
              >
                {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              </button>
              <button
                type="button"
                className="notif-icon-btn"
                onClick={markAllAsRead}
                disabled={!count}
                title="Mark all as read"
                aria-label="Mark all as read"
              >
                <CheckCheck size={15} />
              </button>
              <button
                type="button"
                className="notif-icon-btn"
                onClick={clearReadNotifications}
                title="Clear read notifications"
                aria-label="Clear read notifications"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>

          <div className="notif-list">
            {loading && items.length === 0 && (
              <div className="notif-empty">
                <Loader2 size={16} className="notif-spin" /> Loading…
              </div>
            )}
            {!loading && items.length === 0 && (
              <div className="notif-empty">
                <Check size={16} /> You&apos;re all caught up
              </div>
            )}
            {items.map((notification) => (
              <NotificationRow
                key={notification._id}
                notification={notification}
                onOpen={handleOpenItem}
              />
            ))}
          </div>

          <button
            type="button"
            className="notif-panel-footer"
            onClick={() => {
              setOpen(false);
              router.push('/notifications');
            }}
          >
            View all notifications
          </button>
        </div>
      )}
    </div>
  );
}
