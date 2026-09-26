import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch, normalizeCompanies } from '../lib/api';
import { getTierLimits, normalizeTier } from '../lib/tier';
import { getAvatarUrl } from '../lib/utils';
import {
  Plus,
  Users,
  Crown,
  X,
  Send,
  ChevronRight,
  ChevronLeft,
  Building2,
  Settings,
  Save,
  Loader2,
  Mail,
} from 'lucide-react';

const ROLE_TINTS = {
  owner: { bg: 'rgba(229, 184, 74, 0.12)', text: '#e5b84a' },
  admin: { bg: 'rgba(167, 139, 250, 0.12)', text: '#a78bfa' },
  member: { bg: 'rgba(154, 161, 174, 0.1)', text: '#9aa1ae' },
  viewer: { bg: 'rgba(47, 214, 230, 0.1)', text: '#2fd6e6' },
};

export default function Teams() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);

  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () => {
      setClock(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const tier = normalizeTier(subscription?.tier);
  const tierLimits = getTierLimits(tier);
  const memberCountForLimit = selectedCompany ? (members.length || selectedCompany.memberCount || 0) : 0;
  const memberLimitForCheck = selectedCompany?.memberLimit ?? tierLimits.maxMembers;
  const inviteAtLimit = memberLimitForCheck !== -1 && memberCountForLimit >= memberLimitForCheck;

  const handleSettingsUpdated = (updated) => {
    setCompanies((prev) => prev.map((c) => (c._id === updated._id || c._id === updated.id ? { ...c, ...updated } : c)));
    setSelectedCompany((prev) => (prev ? { ...prev, ...updated } : prev));
    setShowSettingsModal(false);
  };

  const fetchCompanies = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/company/my-companies');
      setCompanies(normalizeCompanies(res.companies));
    } catch (err) {
      console.error('Failed to fetch companies:', err);
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMembers = useCallback(async (companyId) => {
    try {
      setLoadingMembers(true);
      const res = await apiFetch(`/api/company/${companyId}/members`);
      const valid = (res.members || []).filter(m => m && m.user);
      if (valid.length !== (res.members || []).length) {
        console.warn(`Filtered ${ (res.members || []).length - valid.length } member(s) with missing user reference for company ${companyId}`);
      }
      setMembers(valid);
    } catch (err) {
      console.error('Failed to fetch members:', err);
      setMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  useEffect(() => {
    if (router.query.action === 'invite') {
      setShowInviteModal(true);
    }
  }, [router.query]);

  const handleSelectCompany = (company) => {
    setSelectedCompany(company);
    fetchMembers(company._id);
  };

  const handleBackToList = () => {
    setSelectedCompany(null);
    setMembers([]);
  };

  const totalMembers = companies.reduce((sum, c) => sum + (c.members?.length || 0), 0);
  const ownedTeams = companies.filter((c) => c.owner === user?._id || c.owner?._id === user?._id).length;
  const managedTeams = companies.filter((c) => c.owner === user?._id || c.owner?._id === user?._id || c.userRole === 'owner' || c.userRole === 'admin').length;

  const kpis = [
    { label: 'Workspaces', value: companies.length, sub: 'teams you belong to', color: 'blue', Icon: Building2 },
    { label: 'Total Members', value: totalMembers, sub: 'across all teams', color: 'green', Icon: Users },
    { label: 'Owned', value: ownedTeams, sub: 'you control', color: 'orange', Icon: Crown },
    { label: 'Managed', value: managedTeams, sub: 'admin access', color: 'purple', Icon: Settings },
  ];

  return (
    <AuthGuard>
      <Head>
        <title>Teams - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="workspace-container">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main">
          <header className="workspace-header dash-header">
            <div>
              <p className="dash-crumb">
                BuildrsHQ <span className="sep">/</span> Teams{selectedCompany ? <><span className="sep">/</span>{selectedCompany.name}</> : null}
              </p>
              <h1 className="dash-title">{selectedCompany ? selectedCompany.name : 'Teams'}</h1>
              <div className="dash-statusline">
                <span className="status-indicator status-online" />
                <span>{loading ? 'Loading...' : `${companies.length} teams · ${totalMembers} members`}</span>
                <span className="dash-clock">· {clock || '—:——:——'}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {selectedCompany && (
                <button type="button" className="tm-back" onClick={handleBackToList}>
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Back
                </button>
              )}
              {inviteAtLimit && selectedCompany && (
                <span className="text-xs text-[#e5b84a] hidden md:inline">
                  Member limit reached —
                  <button type="button" onClick={() => router.push('/pricing')} className="underline hover:text-[#f2cd6b] ml-1">
                    Upgrade to {tier === 'freebie' ? 'Professional' : 'Enterprise'}
                  </button>
                </span>
              )}
              <button
                type="button"
                className={`btn-workspace btn-secondary ${inviteAtLimit ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => !inviteAtLimit && setShowInviteModal(true)}
                disabled={inviteAtLimit}
                title={inviteAtLimit ? `Member limit reached (${memberLimitForCheck} members)` : 'Invite a member'}
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Invite Member</span>
              </button>
              <button
                type="button"
                className="btn-workspace btn-primary"
                onClick={() => setShowCreateModal(true)}
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Create Team</span>
              </button>
            </div>
          </header>

          <div className="workspace-content">
            <div className="tm-content">
              {loading ? (
                <div className="workspace-card">
                  <div className="workspace-card-body">
                    <div className="dash-empty">
                      <div className="dash-empty-ico">
                        <Loader2 className="w-5 h-5 animate-spin" />
                      </div>
                      <p className="dash-empty-title">Loading teams...</p>
                    </div>
                  </div>
                </div>
              ) : selectedCompany ? (
                <TeamDetail
                  company={selectedCompany}
                  members={members}
                  loadingMembers={loadingMembers}
                  currentUser={user}
                  onOpenSettings={() => setShowSettingsModal(true)}
                />
              ) : companies.length === 0 ? (
                <EmptyState onCreateClick={() => setShowCreateModal(true)} />
              ) : (
                <>
                  <section className="dash-section">
                    <div className="dash-section-head">
                      <div className="dash-eyebrow">
                        <span className="dot" />
                        <b>Network</b> · your organization
                      </div>
                    </div>
                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                      {kpis.map((kpi) => (
                        <div key={kpi.label} className={`dash-kpi dash-kpi-${kpi.color}`}>
                          <div className="dash-kpi-head">
                            <span className="dash-kpi-eyebrow">{kpi.label}</span>
                            <span className="dash-kpi-ico"><kpi.Icon className="w-4 h-4" /></span>
                          </div>
                          <div className="dash-kpi-value">{kpi.value}</div>
                          <div className="dash-kpi-meta-row">
                            <span className="dash-kpi-meta">{kpi.sub}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="dash-section">
                    <div className="dash-section-head">
                      <div className="dash-eyebrow">
                        <span className="dot" />
                        <b>Workspaces</b> · select to manage
                      </div>
                      <span className="badge-count">{companies.length} teams</span>
                    </div>
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {companies.map((company) => (
                        <TeamCard
                          key={company._id}
                          company={company}
                          currentUser={user}
                          onClick={() => handleSelectCompany(company)}
                        />
                      ))}
                    </div>
                  </section>
                </>
              )}
            </div>
          </div>
        </main>
      </div>

      {showCreateModal && (
        <CreateTeamModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(company) => {
            setCompanies((prev) => [...prev, company]);
            setShowCreateModal(false);
          }}
        />
      )}

      {showInviteModal && (
        <InviteMemberModal
          companies={companies}
          selectedCompanyId={selectedCompany?._id}
          onClose={() => setShowInviteModal(false)}
        />
      )}

      {showSettingsModal && selectedCompany && (
        <CompanySettingsModal
          company={selectedCompany}
          onClose={() => setShowSettingsModal(false)}
          onUpdated={handleSettingsUpdated}
        />
      )}
    </AuthGuard>
  );
}

function TeamCard({ company, currentUser, onClick }) {
  const isOwner = company.owner === currentUser?._id || company.owner?._id === currentUser?._id;
  const memberCount = company.members?.length || 0;
  const limit = company.memberLimit;
  const fillPct = limit ? Math.min(Math.round((memberCount / limit) * 100), 100) : 0;

  return (
    <div onClick={onClick} className="tm-card">
      <div className="tm-card-head">
        <div className="tm-id">
          <div className="tm-icon">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="tm-card-title-row">
              <h3 className="tm-card-title">{company.name}</h3>
              {isOwner && (
                <span className="pill" style={{ background: 'rgba(229,184,74,0.12)', color: '#e5b84a' }}>
                  <Crown className="w-3 h-3" /> Owner
                </span>
              )}
            </div>
          </div>
        </div>
        <ChevronRight className="tm-chev" />
      </div>

      {company.description && <p className="tm-desc">{company.description}</p>}

      <div className="tm-foot">
        <span className="tm-foot-meta">
          <Users className="w-4 h-4" />
          <span>
            {memberCount}
            {limit ? ` / ${limit}` : ''}
          </span>
        </span>
        {limit ? (
          <div className="tm-capacity">
            <div className="tm-cap-label">
              <span>{fillPct}% full</span>
              <span>capacity</span>
            </div>
            <div className="prog-track">
              <div className="prog-fill" style={{ width: `${fillPct}%` }} />
            </div>
          </div>
        ) : (
          <span className="tier-badge">Unlimited seats</span>
        )}
      </div>
    </div>
  );
}

function TeamDetail({ company, members, loadingMembers, currentUser, onOpenSettings }) {
  const isOwner = company.owner === currentUser?._id || company.owner?._id === currentUser?._id;
  const canManage = isOwner || company.userRole === 'admin' || company.userRole === 'owner';
  const memberCount = company.members?.length || members.length || 0;
  const limit = company.memberLimit;
  const fillPct = limit ? Math.min(Math.round((memberCount / limit) * 100), 100) : 0;
  const adminCount = members.filter((m) => m.role === 'admin' || m.role === 'owner').length;

  return (
    <div className="space-y-5">
      <div className="tm-hero">
        <div className="tm-hero-top">
          <div className="tm-hero-id">
            <div className="tm-hero-icon">
              <Building2 className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="tm-hero-title">{company.name}</h2>
              {isOwner ? (
                <p className="tm-hero-sub">
                  <Crown className="w-3 h-3" style={{ color: '#e5b84a' }} />
                  You own this team
                </p>
              ) : (
                <p className="tm-hero-sub">
                  <Users className="w-3 h-3" />
                  {company.userRole || 'member'} access
                </p>
              )}
            </div>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="btn-workspace btn-secondary"
              title="Team settings"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Settings</span>
            </button>
          )}
        </div>

        {company.description && <p className="tm-desc mb-4">{company.description}</p>}

        <div className="tm-hero-stats">
          <div>
            <p className="tm-stat-label">Members</p>
            <p className="tm-stat-value">{memberCount}{limit ? ` / ${limit}` : ''}</p>
          </div>
          <div>
            <p className="tm-stat-label">Owners & Admins</p>
            <p className="tm-stat-value">{adminCount}</p>
          </div>
          <div>
            <p className="tm-stat-label">Capacity</p>
            <p className="tm-stat-value">{limit ? `${fillPct}%` : '∞'}</p>
          </div>
          <div>
            <p className="tm-stat-label">Created</p>
            <p className="tm-stat-value" style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: '0.85rem', fontWeight: 600 }}>
              {new Date(company.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        </div>

        {limit && (
          <div className="tm-hero-capacity">
            <div className="prog-track">
              <div className="prog-fill" style={{ width: `${fillPct}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="workspace-card">
        <div className="workspace-card-header flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="card-ico">
              <Users className="w-4 h-4" />
            </span>
            <h2 className="workspace-card-title">Members</h2>
          </div>
          <span className="badge-count">{members.length} active</span>
        </div>
        {loadingMembers ? (
          <div className="workspace-card-body">
            <div className="dash-empty">
              <div className="dash-empty-ico">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
              <p className="dash-empty-title">Loading members...</p>
            </div>
          </div>
        ) : members.length === 0 ? (
          <div className="workspace-card-body">
            <div className="dash-empty">
              <div className="dash-empty-ico">
                <Mail className="w-5 h-5" />
              </div>
              <p className="dash-empty-title">No members yet</p>
              <p className="dash-empty-sub">Invite teammates to start collaborating.</p>
            </div>
          </div>
        ) : (
          <div>
            {members.map((m, i) => (
              <MemberRow key={m.user?._id || i} member={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MemberRow({ member }) {
  const { user: u, role, joinedAt } = member;
  const avatarSrc = getAvatarUrl(u, u?.fullName || u?.name || 'U');
  const tint = ROLE_TINTS[role] || ROLE_TINTS.member;

  return (
    <div className="tm-member-row">
      <div className="tm-member-id">
        <img
          src={avatarSrc}
          alt={u?.fullName || u?.name || 'Member'}
          className="tm-avatar"
        />
        <div className="min-w-0">
          <div className="tm-member-name">{u?.fullName || u?.name || 'Unknown'}</div>
          <div className="tm-member-mail">{u?.email || ''}</div>
        </div>
      </div>
      <div className="tm-member-side">
        <span className="pill" style={{ background: tint.bg, color: tint.text }}>
          {role}
        </span>
        {joinedAt && (
          <span className="tm-joined">
            Joined {new Date(joinedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onCreateClick }) {
  return (
    <div className="workspace-card">
      <div className="workspace-card-body">
        <div className="dash-empty">
          <div className="dash-empty-ico" style={{ width: 52, height: 52 }}>
            <Users className="w-6 h-6" />
          </div>
          <p className="dash-empty-title" style={{ fontSize: '0.95rem', marginBottom: '0.35rem' }}>No teams yet</p>
          <p className="dash-empty-sub">
            Create your first team to start collaborating with your members.
          </p>
          <button
            type="button"
            className="btn-workspace btn-primary mt-5"
            onClick={onCreateClick}
          >
            <Plus className="w-4 h-4" />
            <span>Create Your First Team</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateTeamModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch('/api/company/create', {
        method: 'POST',
        body: JSON.stringify({
          name: trimmedName,
          description: description.trim(),
        }),
      });
      if (res.success !== false && res.company) {
        onCreated(res.company);
      } else {
        setError(res.message || 'Failed to create team');
      }
    } catch (err) {
      setError(err.message || 'Failed to create team. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] p-4" onClick={onClose}>
      <div
        className="ws-modal p-8 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2.5">
            <span className="card-ico">
              <Plus className="w-4 h-4" />
            </span>
            <h3 className="ws-modal-title">Create Team</h3>
          </div>
          <button type="button" onClick={onClose} className="text-[#565d6b] hover:text-[#eceef1]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="std-alert std-alert-error mb-4">
            <AlertCircleIcon />
            <p>{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="ws-label">Team Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Engineering"
              className="ws-input"
            />
          </div>
          <div className="mb-4">
            <label className="ws-label">Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this team work on?"
              className="ws-textarea"
            />
          </div>
          <div className="flex gap-3 justify-end mt-6">
            <button
              type="button"
              onClick={onClose}
              className="btn-workspace btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-workspace btn-primary"
            >
              {submitting ? 'Creating...' : 'Create Team'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function InviteMemberModal({ companies, selectedCompanyId, onClose }) {
  const [email, setEmail] = useState('');
  const [companyId, setCompanyId] = useState(selectedCompanyId || '');
  const [role, setRole] = useState('member');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !companyId) return;

    setSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await apiFetch('/api/invitations', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          companyId,
          role,
        }),
      });
      if (res.success !== false) {
        setSuccess(true);
        setEmail('');
        setTimeout(() => onClose(), 1500);
      } else {
        setError(res.message || 'Failed to send invitation');
      }
    } catch (err) {
      setError(err.message || 'Failed to send invitation. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] p-4" onClick={onClose}>
      <div
        className="ws-modal p-8 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2.5">
            <span className="card-ico" style={{ background: 'rgba(47,214,230,0.09)', borderColor: 'rgba(47,214,230,0.22)', color: '#2fd6e6' }}>
              <Send className="w-4 h-4" />
            </span>
            <h3 className="ws-modal-title">Invite Member</h3>
          </div>
          <button type="button" onClick={onClose} className="text-[#565d6b] hover:text-[#eceef1]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="std-alert std-alert-error mb-4">
            <AlertCircleIcon />
            <p>{error}</p>
          </div>
        )}
        {success && (
          <div className="std-alert std-alert-success mb-4">
            <MailIcon />
            <p>Invitation sent successfully!</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="ws-label">Team *</label>
            <select
              required
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="ws-select"
            >
              <option value="">Select a team</option>
              {companies.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-4">
            <label className="ws-label">Email *</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
              className="ws-input"
            />
          </div>
          <div className="mb-4">
            <label className="ws-label">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="ws-select"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex gap-3 justify-end mt-6">
            <button
              type="button"
              onClick={onClose}
              className="btn-workspace btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || success}
              className="btn-workspace btn-primary"
            >
              {submitting ? 'Sending...' : success ? 'Sent!' : 'Send Invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CompanySettingsModal({ company, onClose, onUpdated }) {
  const [name, setName] = useState(company.name || '');
  const [description, setDescription] = useState(company.description || '');
  const [allowMemberInvites, setAllowMemberInvites] = useState(company.settings?.allowMemberInvites ?? true);
  const [requireApproval, setRequireApproval] = useState(company.settings?.requireApproval ?? false);
  const [defaultRole, setDefaultRole] = useState(company.settings?.defaultRole || 'member');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/company/${company._id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      const settingsRes = await apiFetch(`/api/company/${company._id}/settings`, {
        method: 'PUT',
        body: JSON.stringify({ allowMemberInvites, requireApproval, defaultRole }),
      });
      const updated = { ...company, name: res.company?.name || name.trim(), description: description.trim(), settings: settingsRes.settings || { allowMemberInvites, requireApproval, defaultRole } };
      setSuccess(true);
      setTimeout(() => onUpdated(updated), 800);
    } catch (err) {
      setError(err.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] p-4" onClick={onClose}>
      <div className="ws-modal p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2.5">
            <span className="card-ico">
              <Settings className="w-4 h-4" />
            </span>
            <h3 className="ws-modal-title">Team Settings</h3>
          </div>
          <button type="button" onClick={onClose} className="text-[#565d6b] hover:text-[#eceef1]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="std-alert std-alert-error mb-4">
            <AlertCircleIcon />
            <p>{error}</p>
          </div>
        )}
        {success && (
          <div className="std-alert std-alert-success mb-4">
            <CheckIcon />
            <p>Settings saved!</p>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="ws-label">Team Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="ws-input" required maxLength={100} />
          </div>
          <div>
            <label className="ws-label">Description</label>
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="ws-textarea" placeholder="What does this team work on?" />
          </div>
          <div className="border-t border-[#ffffff0d] pt-4 space-y-3">
            <h4 className="text-sm font-semibold text-[#eceef1]">Permissions</h4>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={allowMemberInvites} onChange={(e) => setAllowMemberInvites(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-[#2fd6e6] focus:ring-[#2fd6e6]" style={{ accentColor: '#2fd6e6' }} />
              <span className="text-sm text-[#a8adba]">Allow members to invite others</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={requireApproval} onChange={(e) => setRequireApproval(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-[#2fd6e6] focus:ring-[#2fd6e6]" style={{ accentColor: '#2fd6e6' }} />
              <span className="text-sm text-[#a8adba]">Require approval for new members</span>
            </label>
            <div>
              <label className="ws-label">Default role for new members</label>
              <select value={defaultRole} onChange={(e) => setDefaultRole(e.target.value)} className="ws-select">
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 justify-end mt-6">
            <button type="button" onClick={onClose} className="btn-workspace btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-workspace btn-primary inline-flex items-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AlertCircleIcon() {
  return <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>;
}

function MailIcon() {
  return <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></svg>;
}

function CheckIcon() {
  return <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" /></svg>;
}