import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch, companyApi, projectApi } from '../lib/api';
import { Plus, FolderOpen, Users, Calendar, X } from 'lucide-react';

export default function Workspace() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);

  const [workspaces, setWorkspaces] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorkspace, setSelectedWorkspace] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [error, setError] = useState('');

  const loadWorkspaces = useCallback(async () => {
    try {
      const [companyRes, projectRes] = await Promise.all([
        companyApi.getMyCompanies(),
        projectApi.list(),
      ]);
      setWorkspaces(companyRes.companies || []);
      setProjects(projectRes.projects || []);
    } catch (err) {
      console.error('Failed to load workspaces:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  const getProjectCount = (workspaceId) => {
    return projects.filter((p) => p.company === workspaceId).length;
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError('');
    try {
      await apiFetch('/api/company/create', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim(), description: newDescription.trim() }),
      });
      setNewName('');
      setNewDescription('');
      setShowCreateModal(false);
      await loadWorkspaces();
    } catch (err) {
      setError(err.message || 'Failed to create workspace');
    } finally {
      setCreating(false);
    }
  };

  const handleSelectWorkspace = (workspace) => {
    setSelectedWorkspace(
      selectedWorkspace?._id === workspace._id ? null : workspace
    );
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <AuthGuard>
      <Head>
        <title>Workspace - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="min-h-screen bg-navy flex">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main flex-1 ml-64">
          <header className="workspace-header">
            <div className="flex items-center gap-6">
              <h1 className="text-xl font-bold">Workspace</h1>
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                className="cta-button"
                onClick={() => setShowCreateModal(true)}
              >
                <Plus className="w-4 h-4" />
                <span>New Workspace</span>
              </button>
              <img
                className="avatar"
                src={
                  user?.profilePicture ||
                  user?.profilePhoto ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.fullName || user?.name || 'User')}&background=3b82f6&color=fff`
                }
                alt={user?.fullName || 'User'}
              />
            </div>
          </header>

          <div className="workspace-content p-6">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-gray-400">Loading workspaces...</div>
              </div>
            ) : workspaces.length === 0 ? (
              <div className="bg-navy-light rounded-lg p-12 border border-gray-700 text-center">
                <FolderOpen className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold mb-2">No Workspaces Yet</h2>
                <p className="text-gray-400 mb-6">
                  Create your first workspace to organize projects and collaborate with your team.
                </p>
                <button
                  type="button"
                  className="cta-button"
                  onClick={() => setShowCreateModal(true)}
                >
                  <Plus className="w-4 h-4" />
                  Create Workspace
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                  {workspaces.map((ws) => (
                    <div
                      key={ws._id}
                      className={`workspace-card cursor-pointer transition-all ${
                        selectedWorkspace?._id === ws._id
                          ? 'ring-2 ring-blue-500'
                          : ''
                      }`}
                      onClick={() => handleSelectWorkspace(ws)}
                    >
                      <div className="workspace-card-header">
                        <div className="flex items-center justify-between">
                          <h2 className="workspace-card-title">{ws.name}</h2>
                          <span className="bg-blue-500/20 text-blue-400 text-xs font-semibold px-2 py-1 rounded-full">
                            {getProjectCount(ws._id)} projects
                          </span>
                        </div>
                      </div>
                      <div className="workspace-card-body">
                        <p className="text-gray-400 text-sm mb-4 line-clamp-2">
                          {ws.description || 'No description provided.'}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <div className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            <span>{ws.members?.length || 0}/{ws.memberLimit || '∞'} members</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>{formatDate(ws.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {selectedWorkspace && (
                  <div className="workspace-card">
                    <div className="workspace-card-header">
                      <div className="flex items-center justify-between">
                        <h2 className="workspace-card-title">
                          Projects in {selectedWorkspace.name}
                        </h2>
                        <button
                          type="button"
                          className="text-gray-400 hover:text-white"
                          onClick={() => setSelectedWorkspace(null)}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="workspace-card-body">
                      {projects.filter((p) => p.company === selectedWorkspace._id).length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                          <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p>No projects in this workspace yet.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {projects
                            .filter((p) => p.company === selectedWorkspace._id)
                            .map((project) => (
                              <div
                                key={project._id}
                                className="flex items-center justify-between p-3 rounded-lg bg-navy-light border border-gray-700"
                              >
                                <div className="flex items-center gap-3">
                                  <FolderOpen className="w-4 h-4 text-blue-400" />
                                  <div>
                                    <p className="text-sm font-medium text-white">
                                      {project.name}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                      {project.description || 'No description'}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  {project.status && (
                                    <span className="text-xs text-gray-400 capitalize">
                                      {project.status}
                                    </span>
                                  )}
                                  {typeof project.progress === 'number' && (
                                    <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-blue-500 rounded-full"
                                        style={{ width: `${project.progress}%` }}
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-navy-light border border-gray-700 rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">New Workspace</h2>
              <button
                type="button"
                className="text-gray-400 hover:text-white"
                onClick={() => {
                  setShowCreateModal(false);
                  setError('');
                  setNewName('');
                  setNewDescription('');
                }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Workspace Name
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 bg-navy border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                  placeholder="e.g. My Team"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  className="w-full px-3 py-2 bg-navy border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
                  rows={3}
                  placeholder="What is this workspace for?"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                />
              </div>

              {error && (
                <p className="text-red-400 text-sm mb-4">{error}</p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  className="btn-workspace btn-secondary flex-1"
                  onClick={() => {
                    setShowCreateModal(false);
                    setError('');
                    setNewName('');
                    setNewDescription('');
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-workspace btn-primary flex-1"
                  disabled={!newName.trim() || creating}
                >
                  {creating ? 'Creating...' : 'Create Workspace'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}
