import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch } from '../lib/api';
import { Plus, Users, Crown, X, Send, ChevronRight, Building2 } from 'lucide-react';

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

  const fetchCompanies = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/company/my-companies');
      setCompanies(res.companies || []);
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
      setMembers(res.members || []);
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

  return (
    <AuthGuard>
      <Head>
        <title>Teams - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="min-h-screen bg-navy flex">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main flex-1 ml-64">
          <header className="workspace-header">
            <div className="flex items-center gap-4">
              {selectedCompany && (
                <button
                  type="button"
                  onClick={handleBackToList}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  ← Back
                </button>
              )}
              <h1 className="text-xl font-bold">
                {selectedCompany ? selectedCompany.name : 'Teams'}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="btn-workspace btn-secondary"
                onClick={() => setShowInviteModal(true)}
              >
                <Send className="w-4 h-4" />
                <span>Invite Member</span>
              </button>
              <button
                type="button"
                className="btn-workspace btn-primary"
                onClick={() => setShowCreateModal(true)}
              >
                <Plus className="w-4 h-4" />
                <span>Create Team</span>
              </button>
            </div>
          </header>

          <div className="p-6">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-gray-400">Loading teams...</div>
              </div>
            ) : selectedCompany ? (
              <TeamDetail
                company={selectedCompany}
                members={members}
                loadingMembers={loadingMembers}
                currentUser={user}
              />
            ) : companies.length === 0 ? (
              <EmptyState onCreateClick={() => setShowCreateModal(true)} />
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {companies.map((company) => (
                  <TeamCard
                    key={company._id}
                    company={company}
                    currentUser={user}
                    onClick={() => handleSelectCompany(company)}
                  />
                ))}
              </div>
            )}
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
    </AuthGuard>
  );
}

function TeamCard({ company, currentUser, onClick }) {
  const isOwner = company.owner === currentUser?._id;

  return (
    <div
      onClick={onClick}
      className="bg-navy-light rounded-lg border border-gray-700 p-6 cursor-pointer hover:border-gray-500 transition-colors group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors">
              {company.name}
            </h3>
            {isOwner && (
              <span className="inline-flex items-center gap-1 text-xs text-yellow-400">
                <Crown className="w-3 h-3" /> Owner
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-gray-300 transition-colors mt-1" />
      </div>

      {company.description && (
        <p className="text-gray-400 text-sm mb-4 line-clamp-2">{company.description}</p>
      )}

      <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-700/50">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Users className="w-4 h-4" />
          <span>
            {company.members?.length || 0}
            {company.memberLimit ? ` / ${company.memberLimit}` : ''} members
          </span>
        </div>
        {company.memberLimit && (
          <div className="w-20 h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{
                width: `${Math.min(
                  ((company.members?.length || 0) / company.memberLimit) * 100,
                  100
                )}%`,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function TeamDetail({ company, members, loadingMembers, currentUser }) {
  const isOwner = company.owner === currentUser?._id;

  return (
    <div className="space-y-6">
      <div className="bg-navy-light rounded-lg border border-gray-700 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Building2 className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">{company.name}</h2>
                {isOwner && (
                  <span className="inline-flex items-center gap-1 text-sm text-yellow-400">
                    <Crown className="w-4 h-4" /> You own this team
                  </span>
                )}
              </div>
            </div>
            {company.description && (
              <p className="text-gray-400 ml-15">{company.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-6 text-sm text-gray-400 pt-4 border-t border-gray-700/50">
          <span className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            {company.members?.length || 0}
            {company.memberLimit ? ` / ${company.memberLimit}` : ''} members
          </span>
          <span>
            Created {new Date(company.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>

      <div className="bg-navy-light rounded-lg border border-gray-700">
        <div className="px-6 py-4 border-b border-gray-700/50">
          <h3 className="font-bold text-white">Members</h3>
        </div>
        {loadingMembers ? (
          <div className="p-6 text-center text-gray-400">Loading members...</div>
        ) : members.length === 0 ? (
          <div className="p-6 text-center text-gray-400">No members yet.</div>
        ) : (
          <div className="divide-y divide-gray-700/50">
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
  const avatarSrc =
    u?.profilePicture ||
    u?.profilePhoto ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(u?.fullName || u?.name || 'U')}&background=3b82f6&color=fff`;

  return (
    <div className="flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors">
      <div className="flex items-center gap-4">
        <img
          src={avatarSrc}
          alt={u?.fullName || u?.name || 'Member'}
          className="w-10 h-10 rounded-full"
        />
        <div>
          <div className="font-medium text-white">{u?.fullName || u?.name || 'Unknown'}</div>
          <div className="text-sm text-gray-400">{u?.email || ''}</div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
          role === 'owner'
            ? 'bg-yellow-500/20 text-yellow-400'
            : role === 'admin'
            ? 'bg-purple-500/20 text-purple-400'
            : 'bg-gray-600/30 text-gray-300'
        }`}>
          {role}
        </span>
        {joinedAt && (
          <span className="text-xs text-gray-500">
            Joined {new Date(joinedAt).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onCreateClick }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex items-center justify-center mb-6">
        <Users className="w-8 h-8 text-blue-400" />
      </div>
      <h2 className="text-xl font-bold text-white mb-2">No teams yet</h2>
      <p className="text-gray-400 max-w-sm mb-6">
        Create your first team to start collaborating with your members.
      </p>
      <button
        type="button"
        className="btn-workspace btn-primary"
        onClick={onCreateClick}
      >
        <Plus className="w-4 h-4" />
        <span>Create Your First Team</span>
      </button>
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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl p-8 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-slate-900">Create Team</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Team Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Engineering"
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this team work on?"
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 resize-y"
            />
          </div>
          <div className="flex gap-3 justify-end mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-700 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 border-none rounded-lg bg-blue-500 text-white text-sm font-semibold disabled:opacity-60"
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
      const res = await apiFetch('/api/invitations/send', {
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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl p-8 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-slate-900">Invite Member</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>
        )}
        {success && (
          <div className="mb-4 p-3 rounded-lg bg-green-50 text-green-600 text-sm">
            Invitation sent successfully!
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Team *</label>
            <select
              required
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900"
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
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Email *</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex gap-3 justify-end mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-700 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || success}
              className="px-6 py-2.5 border-none rounded-lg bg-blue-500 text-white text-sm font-semibold disabled:opacity-60"
            >
              {submitting ? 'Sending...' : success ? 'Sent!' : 'Send Invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
