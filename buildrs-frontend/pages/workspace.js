import { useCallback, useEffect, useState, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch, companyApi, projectApi } from '../lib/api';
import { getAvatarUrl } from '../lib/utils';
import { Plus, FolderOpen, Users, Calendar, X } from 'lucide-react';
import { useCachedData } from '../hooks/useCachedData';

export default function Workspace() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);
  const userId = user?._id || user?.id || user?.userId || null;

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [error, setError] = useState('');
  const [selectedWorkspace, setSelectedWorkspace] = useState(null);

  const {
    data: workspaces,
    loading: loadingWorkspaces,
    refresh: refreshWorkspaces,
  } = useCachedData(userId, 'workspaces', async () => {
    const [companyRes, projectRes] = await Promise.all([
      companyApi.getMyCompanies({ noCache: true }),
      projectApi.list({ noCache: true }),
    ]);
    const workspaces = companyRes.companies || [];
    const allProjects = projectRes.projects || [];
    return { workspaces, projects: allProjects };
  }, { refreshOnVisibility: true, intervalMs: 30000 });

  const workspacesList = workspaces?.workspaces || [];
  const allProjects = workspaces?.projects || [];

  const getProjectCount = (workspaceId) => {
    return allProjects.filter((p) => p.workspaceId === workspaceId).length;
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
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
        noCache: true,
      });
      setNewName('');
      setNewDescription('');
      setShowCreateModal(false);
      await refreshWorkspaces();
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

  const formatDateStr = (date) => {
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
                src={getAvatarUrl(user, user?.fullName || user?.name || 'User')}
                alt={user?.fullName || 'User'}
              />
            </div>
          </header>

          <div className="workspace-content p-6">
            {loadingWorkspaces ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-gray-400">Loading workspaces...</div>
              </div>
            ) : workspacesList.length === 0 ? (
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
                  {workspacesList.map((ws) => (
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
                        <p className="text-gray-400 text-sm">{ws.description || 'No description'}</p>
                        <div className="flex items-center justify-between mt-4">
                          <span className="text-xs text-gray-500">{formatDateStr(ws.createdAt)}</span>
                          <Users className="w-4 h-4 text-gray-500" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {selectedWorkspace && (
                  <div className="mt-8 bg-navy-card rounded-lg p-6 border border-gray-700">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold">{selectedWorkspace.name}</h3>
                      <button
                        type="button"
                        onClick={() => setSelectedWorkspace(null)}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        <X className="w-3 h-3 mr-1" /> Close
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-gray-800/50 p-4 rounded">
                        <p className="text-xs text-gray-400 uppercase">Projects</p>
                        <p className="text-xl font-bold">{getProjectCount(selectedWorkspace._id)}</p>
                      </div>
                      <div className="bg-gray-800/50 p-4 rounded">
                        <p className="text-xs text-gray-400 uppercase">Created</p>
                        <p className="text-sm text-white">{formatDateStr(selectedWorkspace.createdAt)}</p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
