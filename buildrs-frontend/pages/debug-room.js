import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Code2,
  Copy,
  ExternalLink,
  FileCode2,
  GitBranch,
  Hash,
  Loader2,
  Lock,
  Mail,
  MessageSquare,
  Pencil,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch, isDemoTourActive } from '../lib/api';

const TABS = [
  { id: 'code', label: 'Code' },
  { id: 'investigation', label: 'Investigation' },
  { id: 'chat', label: 'Chat' },
  { id: 'members', label: 'Team Members' },
];

const INVESTIGATION_FIELDS = [
  { key: 'problem', label: 'Problem', placeholder: 'What is going wrong?' },
  { key: 'reproduction', label: 'Reproduction', placeholder: 'Steps that reproduce the issue' },
  { key: 'workingTheory', label: 'Working Theory', placeholder: 'What do you think is causing it?' },
  { key: 'nextStep', label: 'Next Step', placeholder: 'The next thing the room should try' },
];

const ROLE_LABELS = {
  host: 'Host',
  collaborator: 'Collaborator',
  viewer: 'Viewer',
};

function initials(name) {
  return String(name || 'U')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'U';
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/^#+/, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function isRecentlyActive(value) {
  if (!value) return false;
  return Date.now() - new Date(value).getTime() < 10 * 60 * 1000;
}

async function copyText(value) {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch (_) {
    return false;
  }
}

function Avatar({ name, size = 'md' }) {
  return (
    <span className={`dbgr-avatar dbgr-avatar-${size}`} title={name || 'Teammate'}>
      {initials(name)}
    </span>
  );
}

function AvatarStack({ participants = [], max = 3 }) {
  const visible = participants.slice(0, max);
  return (
    <span className="dbgr-avatar-stack">
      {visible.map((participant, index) => (
        <Avatar key={`${participant.id}-${index}`} name={participant.name} size="sm" />
      ))}
      {participants.length > max && (
        <span className="dbgr-avatar dbgr-avatar-sm dbgr-avatar-more">+{participants.length - max}</span>
      )}
    </span>
  );
}

function Notice({ tone = 'info', children, onClose }) {
  if (!children) return null;
  return (
    <div className={`dbgr-notice is-${tone}`} role="status">
      <span>{children}</span>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Dismiss">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function Modal({ title, subtitle, onClose, children, className = '' }) {
  return (
    <div className="dbgr-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className={`dbgr-modal ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="dbgr-modal-head">
          <div>
            <h2 className="dbgr-modal-title">{title}</h2>
            {subtitle && <p className="dbgr-modal-sub">{subtitle}</p>}
          </div>
          <button type="button" className="dbgr-modal-close" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SessionActivity({ activity }) {
  return (
    <section className="dbgr-panel dbgr-activity-panel">
      <h2 className="dbgr-panel-title">Session Activity</h2>
      {activity.length === 0 ? (
        <div className="dbgr-empty-small">
          <Clock className="h-4 w-4" />
          <p>No session activity yet. Join a room to start the timeline.</p>
        </div>
      ) : (
        <ul className="dbgr-activity-list">
          {activity.map((entry) => (
            <li key={entry.id} className="dbgr-activity-row">
              <span className="dbgr-activity-time">{formatTime(entry.createdAt)}</span>
              <span className="dbgr-activity-actor">{entry.actorName}</span>
              <span className="dbgr-activity-action">{entry.action}</span>
              <span className="dbgr-activity-target">{entry.target}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AiModelConfig({ config, loading, error }) {
  const defaultModel = config?.defaultModel || null;
  const fastModel = config?.fastModel || null;
  const privacy = config?.privacy || null;

  const renderModel = (entry) => {
    if (loading) return <p className="dbgr-ai-value is-muted">Loading configured model…</p>;
    if (!entry) return <p className="dbgr-ai-value is-muted">Not configured</p>;
    return (
      <>
        <p className="dbgr-ai-value">{entry.model}</p>
        <p className="dbgr-ai-provider">{entry.providerName}</p>
      </>
    );
  };

  return (
    <section className="dbgr-panel dbgr-ai-panel">
      <h2 className="dbgr-panel-title">AI Model Config</h2>
      <div className="dbgr-ai-field">
        <p className="dbgr-card-label">Default Agent Model</p>
        {renderModel(defaultModel)}
      </div>
      <div className="dbgr-ai-field">
        <p className="dbgr-card-label">Fast Tasks Model</p>
        {renderModel(fastModel)}
      </div>
      {error && <p className="dbgr-ai-note">{error}</p>}
      {!loading && !error && !defaultModel && (
        <p className="dbgr-ai-note">No AI provider is configured. Add a provider key to enable agent runs.</p>
      )}
      <div className="dbgr-privacy">
        <span className="dbgr-privacy-icon"><Lock className="h-4 w-4" /></span>
        <div>
          <p className="dbgr-privacy-title">
            {privacy?.available ? 'Privacy Mode Available' : 'Privacy Mode Not Connected'}
          </p>
          <p className="dbgr-privacy-copy">
            {privacy?.available
              ? (privacy.model ? `Local route: ${privacy.providerName} · ${privacy.model}` : 'Route sensitive tasks to local models')
              : 'Connect Ollama or LM Studio to route sensitive tasks locally'}
          </p>
          <Link href="/ai-pair" className="dbgr-link">Configure &rarr;</Link>
        </div>
      </div>
    </section>
  );
}

function RoomCard({ room, joinPrompt, busy, onJoin, onJoinViewer, onCancelPrompt }) {
  return (
    <article className="dbgr-room-card">
      <div className="dbgr-room-top">
        <div className="dbgr-room-copy">
          <div className="dbgr-room-title-line">
            <span className={`dbgr-live-dot ${room.status === 'ended' ? 'is-ended' : ''}`} />
            <h3 className="dbgr-room-name">#{room.roomId}</h3>
            <span className={`dbgr-active-badge ${room.status === 'ended' ? 'is-ended' : ''}`}>
              {room.status === 'ended' ? 'Ended' : `Active for ${room.activeMinutes} min`}
            </span>
          </div>
          <p className="dbgr-room-desc">{room.description || 'No description provided.'}</p>
        </div>

        <div className="dbgr-room-actions">
          {joinPrompt === room.id ? (
            <div className="dbgr-inline-join">
              <button type="button" className="dbgr-btn dbgr-btn-primary" disabled={busy} onClick={onJoinViewer}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Join as Viewer
              </button>
              <button type="button" className="dbgr-btn dbgr-btn-outline" onClick={onCancelPrompt}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" className="dbgr-btn dbgr-btn-outline" disabled={busy} onClick={onJoin}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {room.access?.joined ? 'Open Room' : 'Join Room'}
            </button>
          )}
        </div>
      </div>

      <div className="dbgr-shared-context">
        <div className="dbgr-shared-heading">Shared Context</div>
        <div className="dbgr-shared-grid">
          <div className="dbgr-shared-field">
            <span>Branch</span>
            <strong>{room.branch || 'Not set'}</strong>
          </div>
          <div className="dbgr-shared-field">
            <span>Open file</span>
            <strong>{room.openFile || 'Not set'}</strong>
          </div>
          <div className="dbgr-shared-field dbgr-shared-line">
            <span>Line</span>
            <strong>{room.activeLine || '—'}</strong>
          </div>
        </div>
        <div className="dbgr-participants">
          <div className="dbgr-participants-label">
            <span>Participants</span>
            <span>{room.participants.length} active</span>
          </div>
          <AvatarStack participants={room.participants} />
        </div>
      </div>
    </article>
  );
}

function CreateRoomModal({ onClose, onCreate }) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    branch: '',
    openFile: '',
    emails: '',
    participantAccess: 'collaborator',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    const name = slugify(form.name);
    if (!name) {
      setError('Room name must use lowercase letters, numbers, and hyphens only.');
      return;
    }
    if (!form.description.trim()) {
      setError('Describe what you are debugging.');
      return;
    }
    if (!form.branch.trim()) {
      setError('Branch is required.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onCreate({
        name,
        description: form.description.trim(),
        branch: form.branch.trim(),
        openFile: form.openFile.trim(),
        emails: form.emails.trim(),
        participantAccess: form.participantAccess,
      });
    } catch (err) {
      setError(err.message || 'Could not create the debug room.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="Create Debug Room"
      subtitle="Start collaboration session with the branch, file, and teammates"
      onClose={onClose}
      className="dbgr-modal-create"
    >
      <form className="dbgr-form" onSubmit={submit}>
        <div className="dbgr-field">
          <label className="dbgr-label" htmlFor="dbgr-name">Room name <span>*</span></label>
          <div className="dbgr-input-prefix">
            <Hash className="h-4 w-4" />
            <input
              id="dbgr-name"
              className="dbgr-input"
              value={form.name}
              onChange={(event) => setField('name', slugify(event.target.value))}
              placeholder="auth-refresh-debug"
              maxLength={60}
              autoFocus
            />
          </div>
          <p className="dbgr-help">Lowercase letters, numbers, and hyphens only.</p>
        </div>

        <div className="dbgr-field">
          <label className="dbgr-label" htmlFor="dbgr-description">What are you debugging? <span>*</span></label>
          <textarea
            id="dbgr-description"
            className="dbgr-textarea"
            value={form.description}
            onChange={(event) => setField('description', event.target.value)}
            placeholder="Describe the issue, expected behavior, and what the team should investigate."
            maxLength={2000}
          />
        </div>

        <div className="dbgr-field">
          <label className="dbgr-label" htmlFor="dbgr-branch">Branch <span>*</span></label>
          <input
            id="dbgr-branch"
            className="dbgr-input"
            value={form.branch}
            onChange={(event) => setField('branch', event.target.value)}
            placeholder="feature/auth-flow-redesign"
            maxLength={200}
          />
        </div>

        <div className="dbgr-field">
          <label className="dbgr-label" htmlFor="dbgr-file">Open file</label>
          <input
            id="dbgr-file"
            className="dbgr-input"
            value={form.openFile}
            onChange={(event) => setField('openFile', event.target.value)}
            placeholder="src/services/auth/jwt.service.ts"
            maxLength={500}
          />
        </div>

        <div className="dbgr-field">
          <label className="dbgr-label" htmlFor="dbgr-emails">Email Address</label>
          <input
            id="dbgr-emails"
            className="dbgr-input"
            value={form.emails}
            onChange={(event) => setField('emails', event.target.value)}
            placeholder="Enter email address"
          />
          <p className="dbgr-help">Add comma to separate two or more emails</p>
        </div>

        <div className="dbgr-field">
          <p className="dbgr-label">Participant Access</p>
          <div className="dbgr-access-grid">
            {[
              { id: 'viewer', title: 'Viewer', copy: 'Can follow shared context without changing it' },
              { id: 'collaborator', title: 'Collaborator', copy: 'Can update shared context during the session' },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                className={`dbgr-access-card ${form.participantAccess === option.id ? 'is-selected' : ''}`}
                onClick={() => setField('participantAccess', option.id)}
              >
                <span className="dbgr-access-title">{option.title}</span>
                <span className="dbgr-access-copy">{option.copy}</span>
              </button>
            ))}
          </div>
        </div>

        {error && <p className="dbgr-form-error">{error}</p>}

        <div className="dbgr-modal-actions">
          <button type="button" className="dbgr-btn dbgr-btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="dbgr-btn dbgr-btn-primary" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Create Room
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CreatedRoomModal({ room, onClose, onView }) {
  return (
    <Modal title="" onClose={onClose} className="dbgr-modal-created">
      <div className="dbgr-created">
        <span className="dbgr-created-check"><Check className="h-8 w-8" /></span>
        <p className="dbgr-created-eyebrow">Debug Room Created</p>
        <h2 className="dbgr-created-title">Debug Room Created Successfully</h2>
        <p className="dbgr-created-copy">You have successfully created a debug room</p>
        <div className="dbgr-modal-actions dbgr-created-actions">
          <button type="button" className="dbgr-btn dbgr-btn-outline" onClick={onClose}>Cancel</button>
          <button type="button" className="dbgr-btn dbgr-btn-primary" onClick={onView}>View Room</button>
        </div>
      </div>
      <span className="sr-only">{room.displayName}</span>
    </Modal>
  );
}

function InviteModal({ onClose, onInvite }) {
  const [emails, setEmails] = useState('');
  const [role, setRole] = useState('collaborator');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    if (!emails.trim()) {
      setError('Enter at least one email address.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onInvite({ emails, role });
      setSent(true);
    } catch (err) {
      setError(err.message || 'Could not send the invitations.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="Invite Member"
      subtitle="Add new participant to the debug room"
      onClose={onClose}
      className="dbgr-modal-invite"
    >
      {sent ? (
        <div className="dbgr-invite-sent">
          <span className="dbgr-created-check"><Check className="h-7 w-7" /></span>
          <h3>Invitation sent</h3>
          <p>Your teammates can join the room from their Debug Room list.</p>
          <div className="dbgr-modal-actions">
            <button type="button" className="dbgr-btn dbgr-btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      ) : (
        <form className="dbgr-form" onSubmit={submit}>
          <div className="dbgr-field">
            <label className="dbgr-label" htmlFor="dbgr-invite-emails">Email Address</label>
            <input
              id="dbgr-invite-emails"
              className="dbgr-input"
              value={emails}
              onChange={(event) => setEmails(event.target.value)}
              placeholder="Enter email address"
              autoFocus
            />
            <p className="dbgr-help">Add comma to separate two or more emails</p>
          </div>

          <div className="dbgr-field">
            <p className="dbgr-label">Grant Access</p>
            <div className="dbgr-access-grid">
              {[
                { id: 'viewer', title: 'Viewer', copy: 'Can view shared context without changing it' },
                { id: 'collaborator', title: 'Collaborator', copy: 'Can update shared context during the session' },
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`dbgr-access-card ${role === option.id ? 'is-selected' : ''}`}
                  onClick={() => setRole(option.id)}
                >
                  <span className="dbgr-access-title">{option.title}</span>
                  <span className="dbgr-access-copy">{option.copy}</span>
                </button>
              ))}
            </div>
          </div>

          {error && <p className="dbgr-form-error">{error}</p>}

          <div className="dbgr-modal-actions">
            <button type="button" className="dbgr-btn dbgr-btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="dbgr-btn dbgr-btn-primary" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Send Invite
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function CodeTab({ room, code, loading, error, onCopy, copyHint }) {
  const file = code?.file;
  const activeLine = code?.activeLine || room.activeLine || 0;
  const highlights = code?.highlights || [];
  const lines = file?.content ? file.content.split('\n') : [];
  const fileName = file?.name || (room.openFile ? room.openFile.split('/').pop() : 'No file selected');
  const permalink = typeof window !== 'undefined'
    ? `${window.location.origin}/debug-room?room=${room.roomId}`
    : `/debug-room?room=${room.roomId}`;

  return (
    <section className="dbgr-panel dbgr-code-panel">
      <div className="dbgr-code-context">
        <div className="dbgr-meta-tile">
          <span>Repository</span>
          <strong>{room.repository || 'Not linked'}</strong>
        </div>
        <div className="dbgr-meta-tile">
          <span>Branch</span>
          <strong>{room.branch || 'Not set'}</strong>
        </div>
        <div className="dbgr-meta-tile">
          <span>Open file</span>
          <strong>{room.openFile || 'Not set'}</strong>
        </div>
        <div className="dbgr-meta-tile dbgr-meta-line">
          <span>Active line</span>
          <strong>{activeLine || '—'}</strong>
        </div>
        <div className="dbgr-code-context-actions">
          <Link href="/source-code" className="dbgr-link">Browse Locally</Link>
          <Link href={`/editor?file=${encodeURIComponent(room.openFile || '')}&branch=${encodeURIComponent(room.branch || '')}`} className="dbgr-btn dbgr-btn-outline">
            Open in Code Viewer
          </Link>
        </div>
      </div>

      <div className="dbgr-copy-row">
        <button type="button" className="dbgr-link-btn" onClick={() => onCopy(room.branch, 'Copied branch')}>
          <Copy className="h-3.5 w-3.5" /> Copy Branch
        </button>
        <button type="button" className="dbgr-link-btn" onClick={() => onCopy(room.openFile, 'Copied path')}>
          <Copy className="h-3.5 w-3.5" /> Copy Path
        </button>
        <button type="button" className="dbgr-link-btn" onClick={() => onCopy(permalink, 'Copied permalink')}>
          <Copy className="h-3.5 w-3.5" /> Copy Permalink
        </button>
        {copyHint && <span className="dbgr-copy-hint">{copyHint}</span>}
      </div>

      <div className="dbgr-code-frame">
        <div className="dbgr-code-frame-head">
          <span className="dbgr-file-tab"><FileCode2 className="h-3.5 w-3.5" /> {fileName}</span>
          <div className="dbgr-code-head-actions">
            <button type="button" className="dbgr-btn dbgr-btn-outline dbgr-btn-tiny" onClick={() => onCopy(lines.join('\n'), 'Copied code')} disabled={!file}>
              Copy code
            </button>
            <Link href={`/editor?file=${encodeURIComponent(room.openFile || '')}&line=${activeLine}`} className="dbgr-btn dbgr-btn-outline dbgr-btn-tiny">
              Expand
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="dbgr-code-empty"><Loader2 className="h-5 w-5 animate-spin" /><p>Loading shared file…</p></div>
        ) : error ? (
          <div className="dbgr-code-empty"><FileCode2 className="h-5 w-5" /><p>{error}</p></div>
        ) : !file ? (
          <div className="dbgr-code-empty">
            <FileCode2 className="h-5 w-5" />
            <p>No matching file snapshot in this workspace yet.</p>
            <span>Open the file in the editor to publish it, then refresh the room.</span>
          </div>
        ) : (
          <div className="dbgr-code-body">
            {lines.map((line, index) => {
              const lineNumber = index + 1;
              const highlight = highlights.find((entry) => entry.line === lineNumber);
              return (
                <div
                  key={lineNumber}
                  className={`dbgr-code-line ${lineNumber === activeLine ? 'is-active' : ''}`}
                >
                  <span className="dbgr-line-no">{lineNumber}</span>
                  <span className="dbgr-line-text">{line || ' '}</span>
                  {highlight && (
                    <span className="dbgr-cursor-chip">
                      <i /> {highlight.name} · {ROLE_LABELS[highlight.role] || highlight.role}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function InvestigationTab({ room, editing, draft, setDraft, onEdit, onCancel, onSave, saving, error }) {
  const canEdit = Boolean(room.access?.canEdit);
  const linked = [
    {
      key: 'task',
      label: 'Task',
      empty: 'No linked task yet',
      href: room.context?.task?.href || '/tasks',
    },
    {
      key: 'pullRequest',
      label: 'Pull Request',
      empty: 'No pull request yet',
      href: room.context?.pullRequest?.href || '/source-code',
    },
    {
      key: 'branch',
      label: 'Branch',
      empty: room.branch || 'No branch linked',
      href: room.context?.branch?.href || '/source-code',
    },
    {
      key: 'specification',
      label: 'Specifications',
      empty: 'No specification linked',
      href: room.context?.specification?.href || '/specs',
    },
  ];

  return (
    <>
      <section className="dbgr-panel">
        <div className="dbgr-panel-head">
          <div>
            <h2 className="dbgr-panel-title">Current Investigation</h2>
            <p className="dbgr-panel-sub">
              {canEdit ? 'Collaborator access · edits are shared with the room' : 'Read-only · Collaborator access required to edit'}
            </p>
          </div>
          {canEdit && !editing && (
            <button type="button" className="dbgr-btn dbgr-btn-outline dbgr-btn-tiny" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
          )}
        </div>

        <div className="dbgr-investigation-grid">
          {INVESTIGATION_FIELDS.map((field) => (
            <div key={field.key} className="dbgr-investigation-card">
              <p className="dbgr-card-label">{field.label}</p>
              {editing ? (
                <textarea
                  className="dbgr-textarea dbgr-textarea-small"
                  value={draft[field.key] || ''}
                  placeholder={field.placeholder}
                  maxLength={4000}
                  onChange={(event) => setDraft((prev) => ({ ...prev, [field.key]: event.target.value }))}
                />
              ) : (
                <p className={`dbgr-investigation-value ${room.investigation?.[field.key] ? '' : 'is-empty'}`}>
                  {room.investigation?.[field.key] || 'Not captured yet.'}
                </p>
              )}
            </div>
          ))}
        </div>

        {error && <p className="dbgr-form-error">{error}</p>}

        {editing && (
          <div className="dbgr-edit-actions">
            <button type="button" className="dbgr-btn dbgr-btn-outline" onClick={onCancel} disabled={saving}>Cancel</button>
            <button type="button" className="dbgr-btn dbgr-btn-primary" onClick={onSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Investigation
            </button>
          </div>
        )}
      </section>

      <section className="dbgr-panel">
        <div className="dbgr-panel-head">
          <div>
            <h2 className="dbgr-panel-title">Linked Context</h2>
            <p className="dbgr-panel-sub">The task, pull request, branch, and specification behind this session</p>
          </div>
        </div>
        <div className="dbgr-linked-grid">
          {linked.map((item) => {
            const entry = room.context?.[item.key] || {};
            return (
              <div key={item.key} className="dbgr-linked-card">
                <div className="dbgr-linked-head">
                  <span className="dbgr-card-label">{item.label}</span>
                  {entry.status && <span className="dbgr-linked-status">{entry.status}</span>}
                </div>
                <p className={`dbgr-linked-title ${entry.title ? '' : 'is-empty'}`}>
                  {entry.title || item.empty}
                </p>
                <Link href={item.href} className="dbgr-link dbgr-linked-open">Open</Link>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

function ChatTab({ room, draft, setDraft, onSend, sending }) {
  return (
    <section className="dbgr-panel dbgr-chat-panel">
      <div className="dbgr-panel-head">
        <h2 className="dbgr-panel-title">Room Chat</h2>
        <Link href={`/ai-pair?room=${encodeURIComponent(room.roomId)}`} className="dbgr-btn dbgr-btn-outline dbgr-btn-tiny">
          <Sparkles className="h-3.5 w-3.5" /> Ask AI about this context
        </Link>
      </div>

      <div className="dbgr-chat-list">
        {room.chat.length === 0 ? (
          <div className="dbgr-chat-empty">
            <MessageSquare className="h-5 w-5" />
            <p>No messages yet. Share the first observation with the room.</p>
          </div>
        ) : room.chat.map((message) => (
          <div key={message.id} className={`dbgr-chat-row ${message.role === 'ai' ? 'is-ai' : ''}`}>
            <Avatar name={message.name} size="sm" />
            <div className="dbgr-chat-content">
              <div className="dbgr-chat-meta">
                <strong>{message.name}</strong>
                <span>{formatTime(message.createdAt)}</span>
                <i className="dbgr-chat-dot" />
              </div>
              <div className="dbgr-chat-bubble">{message.message}</div>
            </div>
          </div>
        ))}
      </div>

      <form
        className="dbgr-chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
      >
        <input
          className="dbgr-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Message the room…"
          maxLength={2000}
          aria-label="Message the room"
        />
        <button type="submit" className="dbgr-btn dbgr-btn-primary" disabled={!draft.trim() || sending}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send
        </button>
      </form>
    </section>
  );
}

function MembersTab({ room, onInvite }) {
  const participants = room.participants || [];
  const canInvite = Boolean(room.access?.canInvite);
  const pendingInvites = (room.invites || []).filter((invite) => invite.status === 'pending');

  return (
    <section className="dbgr-panel">
      <div className="dbgr-panel-head">
        <div>
          <h2 className="dbgr-panel-title">Team Members</h2>
          <p className="dbgr-panel-sub">{participants.length} in the room · {pendingInvites.length} pending invite{pendingInvites.length === 1 ? '' : 's'}</p>
        </div>
        {canInvite && (
          <button type="button" className="dbgr-btn dbgr-btn-outline dbgr-btn-tiny" onClick={onInvite}>
            <UserPlus className="h-3.5 w-3.5" /> Invite Member
          </button>
        )}
      </div>

      <div className="dbgr-members">
        {participants.map((participant) => {
          const online = isRecentlyActive(participant.lastSeenAt);
          return (
            <div key={participant.id} className="dbgr-member-row">
              <Avatar name={participant.name} />
              <div className="dbgr-member-copy">
                <div className="dbgr-member-name-line">
                  <strong>{participant.name}</strong>
                  <span className={`dbgr-member-status ${online ? 'is-online' : 'is-away'}`}>
                    {online ? 'online' : 'away'}
                  </span>
                </div>
                <p className="dbgr-member-role">{ROLE_LABELS[participant.role] || 'Viewer'}</p>
                <p className="dbgr-member-activity">
                  <i className={`dbgr-member-dot ${online ? 'is-online' : 'is-away'}`} />
                  {online ? `Viewing line ${participant.activeLine || room.activeLine || '—'}` : 'Last seen earlier'}
                </p>
              </div>
              <div className="dbgr-member-badges">
                <span className="dbgr-tag">{ROLE_LABELS[participant.role] || 'Viewer'}</span>
                {participant.role === 'host' && <span className="dbgr-tag"><Code2 className="h-3 w-3" /> Code</span>}
                {participant.role === 'collaborator' && <span className="dbgr-tag"><GitBranch className="h-3 w-3" /> PR</span>}
              </div>
            </div>
          );
        })}
      </div>

      {canInvite && pendingInvites.length > 0 && (
        <div className="dbgr-pending-invites">
          <p className="dbgr-card-label">Pending invites</p>
          {pendingInvites.map((invite) => (
            <div key={invite.id} className="dbgr-pending-row">
              <Mail className="h-4 w-4" />
              <span>{invite.email}</span>
              <span className="dbgr-tag">{ROLE_LABELS[invite.role] || invite.role}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function RoomDetail({
  room,
  tab,
  setTab,
  code,
  codeLoading,
  codeError,
  onCopy,
  copyHint,
  onLeave,
  onJoin,
  busy,
  editing,
  draft,
  setDraft,
  onEdit,
  onCancelEdit,
  onSave,
  saving,
  investigationError,
  chatDraft,
  setChatDraft,
  onSendChat,
  sendingChat,
  onInvite,
  onBack,
}) {
  const joined = Boolean(room.access?.joined);
  const readOnly = !room.access?.canEdit;

  return (
    <>
      <header className="workspace-header dbgr-detail-header">
        <div className="dbgr-detail-heading">
          <button type="button" className="dbgr-back" onClick={onBack} aria-label="Back to debug rooms">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="dbgr-detail-copy">
            <p className="dash-crumb">Collaboration <span className="sep">/</span> Debug Rooms</p>
            <div className="dbgr-detail-title-line">
              <h1 className="dash-title">{room.displayName}</h1>
              <span className={`dbgr-active-badge ${room.status === 'ended' ? 'is-ended' : ''}`}>
                {room.status === 'ended' ? 'Ended' : 'Active'}
              </span>
              <span className="dbgr-detail-active">Active for {room.activeMinutes} min</span>
            </div>
            <p className="dbgr-room-desc">{room.description || 'Shared debugging session.'}</p>
          </div>
        </div>

        <div className="dbgr-detail-actions">
          <AvatarStack participants={room.participants} />
          {readOnly && <span className="dbgr-readonly"><Lock className="h-3 w-3" /> Read-only</span>}
          {joined ? (
            <button type="button" className="dbgr-btn dbgr-btn-primary" onClick={onLeave} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Leave Room
            </button>
          ) : (
            <button type="button" className="dbgr-btn dbgr-btn-primary" onClick={onJoin} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {readOnly ? 'Join as Viewer' : 'Join Room'}
            </button>
          )}
        </div>
      </header>

      <div className="workspace-content dbgr-content">
        <nav className="dbgr-tabs" aria-label="Debug room sections">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={`dbgr-tab ${tab === id ? 'is-active' : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        {tab === 'code' && (
          <CodeTab
            room={room}
            code={code}
            loading={codeLoading}
            error={codeError}
            onCopy={onCopy}
            copyHint={copyHint}
          />
        )}

        {tab === 'investigation' && (
          <InvestigationTab
            room={room}
            editing={editing}
            draft={draft}
            setDraft={setDraft}
            onEdit={onEdit}
            onCancel={onCancelEdit}
            onSave={onSave}
            saving={saving}
            error={investigationError}
          />
        )}

        {tab === 'chat' && (
          <ChatTab
            room={room}
            draft={chatDraft}
            setDraft={setChatDraft}
            onSend={onSendChat}
            sending={sendingChat}
          />
        )}

        {tab === 'members' && <MembersTab room={room} onInvite={onInvite} />}
      </div>
    </>
  );
}

export default function DebugRoomPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const subscription = useAuthStore((state) => state.subscription);

  const roomParam = typeof router.query.room === 'string' ? router.query.room : '';

  const withTour = (query) => (isDemoTourActive() ? { ...query, tour: '1' } : query);

  const goToRooms = () => {
    router.push({ pathname: '/debug-room', query: withTour({}) }, undefined, { shallow: true });
  };

  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState('');
  const [activeRoom, setActiveRoom] = useState(null);
  const [activeLoading, setActiveLoading] = useState(false);
  const [activeError, setActiveError] = useState('');
  const [tab, setTab] = useState('code');
  const [joinPrompt, setJoinPrompt] = useState(null);
  const [busyRoomId, setBusyRoomId] = useState(null);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createdRoom, setCreatedRoom] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [code, setCode] = useState(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [copyHint, setCopyHint] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ problem: '', reproduction: '', workingTheory: '', nextStep: '' });
  const [savingInvestigation, setSavingInvestigation] = useState(false);
  const [investigationError, setInvestigationError] = useState('');
  const [chatDraft, setChatDraft] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const [modelConfig, setModelConfig] = useState(null);
  const [modelConfigLoading, setModelConfigLoading] = useState(true);
  const [modelConfigError, setModelConfigError] = useState('');

  const loadRooms = useCallback(async () => {
    setRoomsLoading(true);
    setRoomsError('');
    try {
      const result = await apiFetch('/api/debug-rooms');
      setRooms(Array.isArray(result.rooms) ? result.rooms : []);
    } catch (err) {
      setRoomsError(err.message || 'Could not load debug rooms.');
    } finally {
      setRoomsLoading(false);
    }
  }, []);

  const loadRoom = useCallback(async (roomId) => {
    setActiveLoading(true);
    setActiveError('');
    try {
      const result = await apiFetch(`/api/debug-rooms/${encodeURIComponent(roomId)}`);
      if (!result.room) throw new Error('Debug room not found.');
      setActiveRoom(result.room);
      setDraft(result.room.investigation || { problem: '', reproduction: '', workingTheory: '', nextStep: '' });
      setEditing(false);
    } catch (err) {
      setActiveRoom(null);
      setActiveError(err.message || 'Could not load the debug room.');
    } finally {
      setActiveLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  useEffect(() => {
    let cancelled = false;
    setModelConfigLoading(true);
    apiFetch('/api/ai-pair/model-config')
      .then((result) => {
        if (!cancelled) setModelConfig(result);
      })
      .catch((err) => {
        if (!cancelled) setModelConfigError(err.message || 'Could not load AI model configuration.');
      })
      .finally(() => {
        if (!cancelled) setModelConfigLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!roomParam) {
      setActiveRoom(null);
      setActiveError('');
      setTab('code');
      return;
    }
    loadRoom(roomParam);
  }, [roomParam, loadRoom]);

  useEffect(() => {
    if (!activeRoom) return undefined;
    setDraft(activeRoom.investigation || { problem: '', reproduction: '', workingTheory: '', nextStep: '' });
    setEditing(false);
  }, [activeRoom?.id]);

  useEffect(() => {
    if (!roomParam) return undefined;
    const interval = setInterval(async () => {
      try {
        const result = await apiFetch(`/api/debug-rooms/${encodeURIComponent(roomParam)}`);
        if (result.room) {
          setActiveRoom((prev) => (prev && prev.id === result.room.id ? result.room : prev));
        }
      } catch (_) {
        // Background refresh is best-effort; the visible error state is enough.
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [roomParam]);

  useEffect(() => {
    if (!activeRoom || tab !== 'code') return undefined;
    let cancelled = false;
    setCodeLoading(true);
    setCodeError('');
    apiFetch(`/api/debug-rooms/${encodeURIComponent(activeRoom.id)}/code`)
      .then((result) => {
        if (!cancelled) setCode(result.code || null);
      })
      .catch((err) => {
        if (!cancelled) {
          setCode(null);
          setCodeError(err.message || 'Could not load the shared file.');
        }
      })
      .finally(() => {
        if (!cancelled) setCodeLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeRoom?.id, activeRoom?.openFile, activeRoom?.activeLine, tab]);

  const activity = useMemo(() => (
    rooms
      .flatMap((room) => (room.activity || []).map((entry) => ({ ...entry, roomId: room.roomId })))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10)
  ), [rooms]);

  const updateRoomInList = (updated) => {
    setRooms((prev) => prev.map((room) => (room.id === updated.id ? updated : room)));
  };

  const openRoom = (room) => {
    router.push({ pathname: '/debug-room', query: withTour({ room: room.roomId }) }, undefined, { shallow: true });
  };

  const joinRoom = async (room, role) => {
    setBusyRoomId(room.id);
    setActionError('');
    try {
      const result = await apiFetch(`/api/debug-rooms/${encodeURIComponent(room.id)}/join`, {
        method: 'POST',
        body: JSON.stringify({ role }),
      });
      if (!result.room) throw new Error('Could not join the debug room.');
      updateRoomInList(result.room);
      setJoinPrompt(null);
      openRoom(result.room);
    } catch (err) {
      setActionError(err.message || 'Could not join the debug room.');
    } finally {
      setBusyRoomId(null);
    }
  };

  const handleJoinClick = (room) => {
    if (room.access?.joined) {
      openRoom(room);
      return;
    }
    if (room.access?.canEdit) {
      joinRoom(room, room.access.role === 'host' ? 'host' : 'collaborator');
      return;
    }
    setJoinPrompt(room.id);
  };

  const leaveRoom = async () => {
    if (!activeRoom) return;
    setBusyRoomId(activeRoom.id);
    setActionError('');
    try {
      const result = await apiFetch(`/api/debug-rooms/${encodeURIComponent(activeRoom.id)}/leave`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (result.room) updateRoomInList(result.room);
      setActiveRoom(null);
      setNotice('You left the debug room.');
      await loadRooms();
      goToRooms();
    } catch (err) {
      setActionError(err.message || 'Could not leave the debug room.');
    } finally {
      setBusyRoomId(null);
    }
  };

  const joinActiveRoom = async () => {
    if (!activeRoom) return;
    await joinRoom(activeRoom, activeRoom.access?.canEdit ? 'collaborator' : 'viewer');
  };

  const createRoom = async (payload) => {
    const result = await apiFetch('/api/debug-rooms', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!result.room) throw new Error('Could not create the debug room.');
    setRooms((prev) => [result.room, ...prev.filter((room) => room.id !== result.room.id)]);
    setCreateOpen(false);
    setCreatedRoom(result.room);
  };

  const viewCreatedRoom = () => {
    const room = createdRoom;
    setCreatedRoom(null);
    if (room) openRoom(room);
  };

  const saveInvestigation = async () => {
    if (!activeRoom || savingInvestigation) return;
    setSavingInvestigation(true);
    setInvestigationError('');
    try {
      const result = await apiFetch(`/api/debug-rooms/${encodeURIComponent(activeRoom.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ investigation: draft }),
      });
      if (!result.room) throw new Error('Could not save the investigation.');
      setActiveRoom(result.room);
      updateRoomInList(result.room);
      setEditing(false);
      setNotice('Investigation updated.');
    } catch (err) {
      setInvestigationError(err.message || 'Could not save the investigation.');
    } finally {
      setSavingInvestigation(false);
    }
  };

  const sendChat = async () => {
    const message = chatDraft.trim();
    if (!activeRoom || !message || sendingChat) return;
    setSendingChat(true);
    setActionError('');
    try {
      const result = await apiFetch(`/api/debug-rooms/${encodeURIComponent(activeRoom.id)}/chat`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      });
      if (!result.room) throw new Error('Could not send the message.');
      setActiveRoom(result.room);
      updateRoomInList(result.room);
      setChatDraft('');
    } catch (err) {
      setActionError(err.message || 'Could not send the message.');
    } finally {
      setSendingChat(false);
    }
  };

  const sendInvites = async (payload) => {
    if (!activeRoom) return;
    const result = await apiFetch(`/api/debug-rooms/${encodeURIComponent(activeRoom.id)}/invite`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!result.room) throw new Error('Could not send the invitations.');
    setActiveRoom(result.room);
    updateRoomInList(result.room);
    setNotice(`Invitation${result.invited?.length === 1 ? '' : 's'} sent.`);
  };

  const copy = async (value, label) => {
    if (!value) {
      setNotice('Nothing to copy yet.');
      return;
    }
    const ok = await copyText(String(value));
    setCopyHint(ok ? label : 'Copy failed');
    setTimeout(() => setCopyHint(''), 2200);
  };

  const startEditing = () => {
    setDraft(activeRoom?.investigation || { problem: '', reproduction: '', workingTheory: '', nextStep: '' });
    setInvestigationError('');
    setEditing(true);
  };

  const pageTitle = 'Debug Room';

  return (
    <AuthGuard>
      <Head>
        <title>{activeRoom ? `${activeRoom.displayName} - Debug Room` : 'Debug Room - BuildrsHQ'}</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="workspace-container">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main">
          {!activeRoom && (
            <header className="workspace-header dash-header dbgr-header">
              <div>
                <p className="dash-crumb">Collaborate <span className="sep">/</span> Debug Room</p>
                <h1 className="dash-title">{pageTitle}</h1>
                <p className="dbgr-sub">Collaborative and joint sessions with common context</p>
              </div>
              <button type="button" className="dbgr-btn dbgr-btn-primary dbgr-create-btn" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Create Room
              </button>
            </header>
          )}

          {activeRoom ? (
            <RoomDetail
              room={activeRoom}
              tab={tab}
              setTab={setTab}
              code={code}
              codeLoading={codeLoading}
              codeError={codeError}
              onCopy={copy}
              copyHint={copyHint}
              onLeave={leaveRoom}
              onJoin={joinActiveRoom}
              busy={busyRoomId === activeRoom.id}
              editing={editing}
              draft={draft}
              setDraft={setDraft}
              onEdit={startEditing}
              onCancelEdit={() => setEditing(false)}
              onSave={saveInvestigation}
              saving={savingInvestigation}
              investigationError={investigationError}
              chatDraft={chatDraft}
              setChatDraft={setChatDraft}
              onSendChat={sendChat}
              sendingChat={sendingChat}
              onInvite={() => setInviteOpen(true)}
              onBack={goToRooms}
            />
          ) : (
            <div className="workspace-content dbgr-content">
              <Notice tone={actionError ? 'error' : 'info'} onClose={() => { setNotice(''); setActionError(''); }}>
                {actionError || notice}
              </Notice>

              {activeLoading ? (
                <div className="dbgr-page-state">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <p>Loading debug room…</p>
                </div>
              ) : activeError ? (
                <div className="dbgr-page-state is-error">
                  <ShieldCheck className="h-6 w-6" />
                  <p>{activeError}</p>
                  <button type="button" className="dbgr-btn dbgr-btn-outline" onClick={goToRooms}>
                    Back to rooms
                  </button>
                </div>
              ) : (
                <>
                  <section className="dbgr-section">
                    <div className="dbgr-section-head">
                      <h2 className="dbgr-section-title">Rooms</h2>
                      <span className="dbgr-section-meta">
                        {rooms.length} room{rooms.length === 1 ? '' : 's'} · {rooms.filter((room) => room.status !== 'ended').length} live
                      </span>
                    </div>

                    {roomsLoading ? (
                      <div className="dbgr-page-state">
                        <Loader2 className="h-6 w-6 animate-spin" />
                        <p>Loading rooms…</p>
                      </div>
                    ) : roomsError ? (
                      <div className="dbgr-page-state is-error">
                        <ShieldCheck className="h-6 w-6" />
                        <p>{roomsError}</p>
                        <button type="button" className="dbgr-btn dbgr-btn-outline" onClick={loadRooms}>Retry</button>
                      </div>
                    ) : rooms.length === 0 ? (
                      <div className="dbgr-empty">
                        <span className="dbgr-empty-icon"><Code2 className="h-5 w-5" /></span>
                        <h3>No debug rooms yet</h3>
                        <p>Create a room to share a branch, file, and live investigation with your team.</p>
                        <button type="button" className="dbgr-btn dbgr-btn-primary" onClick={() => setCreateOpen(true)}>
                          <Plus className="h-4 w-4" /> Create Room
                        </button>
                      </div>
                    ) : (
                      <div className="dbgr-room-list">
                        {rooms.map((room) => (
                          <RoomCard
                            key={room.id}
                            room={room}
                            joinPrompt={joinPrompt}
                            busy={busyRoomId === room.id}
                            onJoin={() => handleJoinClick(room)}
                            onJoinViewer={() => joinRoom(room, 'viewer')}
                            onCancelPrompt={() => setJoinPrompt(null)}
                          />
                        ))}
                      </div>
                    )}
                  </section>

                  <div className="dbgr-lower">
                    <SessionActivity activity={activity} />
                    <AiModelConfig config={modelConfig} loading={modelConfigLoading} error={modelConfigError} />
                  </div>
                </>
              )}
            </div>
          )}
        </main>
      </div>

      {createOpen && (
        <CreateRoomModal onClose={() => setCreateOpen(false)} onCreate={createRoom} />
      )}

      {createdRoom && (
        <CreatedRoomModal
          room={createdRoom}
          onClose={() => setCreatedRoom(null)}
          onView={viewCreatedRoom}
        />
      )}

      {inviteOpen && activeRoom && (
        <InviteModal onClose={() => setInviteOpen(false)} onInvite={sendInvites} />
      )}
    </AuthGuard>
  );
}
