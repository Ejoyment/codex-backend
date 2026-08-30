import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import TrialBanner from '../components/TrialBanner';
import StatCard from '../components/StatCard';
import IntegrationsHub from '../components/IntegrationsHub';
import ActivityFeed from '../components/ActivityFeed';
import ProjectsList from '../components/ProjectsList';
import CreateProjectModal from '../components/CreateProjectModal';
import CreateTaskModal from '../components/CreateTaskModal';
import useAuthStore from '../store/authStore';
import { useDashboard } from '../hooks/useDashboard';
import { getAvatarUrl } from '../lib/utils';
import { Bell, Plus } from 'lucide-react';

export default function Dashboard() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);
  const { stats, trial, integrations, activity, projects, loadStats, loadProjects } = useDashboard();

  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);

  return (
    <AuthGuard>
      <Head>
        <title>Dashboard - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="workspace-container">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main">
          <header className="workspace-header">
            <div className="flex items-center gap-6">
              <h1 className="text-xl font-bold">Dashboard</h1>
              <div className="flex items-center gap-2">
                <span className="status-indicator status-online" />
                <span className="text-sm text-muted">All systems operational</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button type="button" className="btn-workspace btn-secondary" title="Notifications">
                <Bell className="w-4 h-4" />
              </button>
              <button
                type="button"
                className="btn-workspace btn-primary"
                onClick={() => setShowProjectModal(true)}
              >
                <Plus className="w-4 h-4" />
                <span>New Project</span>
              </button>
              <img
                className="avatar"
                src={getAvatarUrl(user, user?.fullName || user?.name || 'User')}
                alt={user?.fullName || 'User'}
              />
            </div>
          </header>

          <div className="workspace-content">
            <TrialBanner trial={trial} />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
              <StatCard value={stats?.activeProjects} label="Active Projects" color="blue" />
              <StatCard value={stats?.totalCompleted} label="Completed Tasks" color="green" />
              <StatCard value={stats?.teamMembers} label="Team Members" color="purple" />
              <StatCard value={stats?.integrations} label="Integrations" color="orange" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="workspace-card">
                <div className="workspace-card-header">
                  <h2 className="workspace-card-title">Quick Actions</h2>
                </div>
                <div className="workspace-card-body">
                  <div className="flex flex-col gap-3">
                    <button type="button" className="btn-workspace btn-primary" onClick={() => setShowTaskModal(true)}>
                    
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                      </svg>
                      Create Task
                    </button>
                    <button
                      type="button"
                      className="btn-workspace btn-secondary"
                      onClick={() => router.push('/teams?action=invite')}
                    >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                             <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
                    </svg>
                      Invite Team
                    </button>
                    <button
                      type="button"
                      className="btn-workspace btn-secondary"
                      onClick={() => router.push('/source-code')}
                    >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
                    </svg>
                      View Code
                    </button>
                    <button
                      type="button"
                      className="btn-workspace btn-secondary"
                      onClick={() => router.push('/ai-pair')}
                    >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path>
                    </svg>
                      AI Pair Chat
                    </button>
                  </div>
                </div>
              </div>

              <div className="workspace-card md:col-span-2">
                <div className="workspace-card-header">
                  <h2 className="workspace-card-title">Recent Activity</h2>
                </div>
                <div className="workspace-card-body">
                  <ActivityFeed activity={activity} />
                </div>
              </div>
            </div>

            <div className="workspace-card mb-6">
              <div className="workspace-card-header">
                <div className="flex items-center justify-between">
                  <h2 className="workspace-card-title">Integrations Hub</h2>
                  <a href="/integrations" className="text-sm font-medium text-blue-400 no-underline">
                    View All →
                  </a>
                </div>
              </div>
              <div className="workspace-card-body">
                <IntegrationsHub integrations={integrations} />
              </div>
            </div>

            <div className="workspace-card">
              <div className="workspace-card-header">
                <div className="flex items-center justify-between">
                  <h2 className="workspace-card-title">Recent Projects</h2>
                  <a href="/workspace" className="text-sm font-medium text-blue-400 no-underline">
                    View All →
                  </a>
                </div>
              </div>
              <div className="workspace-card-body">
                <ProjectsList projects={projects} onViewAll={() => setShowProjectModal(true)} />
              </div>
            </div>
          </div>
        </main>
      </div>

      {showProjectModal && (
        <CreateProjectModal
          onClose={() => setShowProjectModal(false)}
          onCreated={async () => {
            await Promise.all([loadProjects(), loadStats()]);
          }}
        />
      )}

      {showTaskModal && (
        <CreateTaskModal
          onClose={() => setShowTaskModal(false)}
          onCreated={async () => {
            await loadStats();
          }}
        />
      )}
    </AuthGuard>
  );
}
