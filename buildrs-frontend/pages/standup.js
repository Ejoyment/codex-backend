import { useState, useEffect } from 'react';
import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch, projectApi, companyApi } from '../lib/api';
import { Send, Clock, CheckCircle2, AlertCircle, ListChecks } from 'lucide-react';

export default function Standup() {
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);

  const [yesterday, setYesterday] = useState('');
  const [today, setToday] = useState('');
  const [blockers, setBlockers] = useState('');
  const [tasks, setTasks] = useState([]);
  const [selectedTasks, setSelectedTasks] = useState([]);
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState('');
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [pastStandups, setPastStandups] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [tasksRes, companiesRes] = await Promise.all([
          projectApi.listTasks(),
          companyApi.getMyCompanies(),
        ]);

        if (tasksRes.success) setTasks(tasksRes.tasks || []);
        if (companiesRes.success) {
          const comps = companiesRes.companies || [];
          setCompanies(comps);
          if (comps.length > 0) setSelectedCompany(comps[0]._id);
        }

        const stored = JSON.parse(localStorage.getItem('pastStandups') || '[]');
        setPastStandups(stored);
      } catch (err) {
        setError(err.message || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  useEffect(() => {
    if (!selectedCompany) return;
    async function loadChannels() {
      try {
        const res = await apiFetch(`/api/messaging/channels?companyId=${selectedCompany}`);
        if (res.success) setChannels(res.channels || []);
      } catch {
        setChannels([]);
      }
    }
    loadChannels();
  }, [selectedCompany]);

  function toggleTask(taskId) {
    setSelectedTasks((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!yesterday.trim() && !today.trim() && !blockers.trim()) {
      setError('Please fill in at least one field');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const standup = {
        _id: Date.now().toString(),
        yesterday: yesterday.trim(),
        today: today.trim(),
        blockers: blockers.trim(),
        relatedTasks: selectedTasks,
        channelId: selectedChannel,
        companyId: selectedCompany,
        timestamp: new Date().toISOString(),
        author: user?.fullName || user?.name || 'User',
      };

      await apiFetch('/api/standup', {
        method: 'POST',
        body: JSON.stringify(standup),
      }).catch(() => {});

      const updated = [standup, ...pastStandups];
      setPastStandups(updated);
      localStorage.setItem('pastStandups', JSON.stringify(updated));

      setYesterday('');
      setToday('');
      setBlockers('');
      setSelectedTasks([]);
      setSelectedChannel('');
      setSuccess('Standup submitted successfully!');
    } catch (err) {
      setError(err.message || 'Failed to submit standup');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthGuard>
      <Head>
        <title>Standup - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="min-h-screen bg-navy flex">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main flex-1 ml-64">
          <header className="workspace-header">
            <div className="flex items-center gap-6">
              <h1 className="text-xl font-bold">Standup</h1>
              <span className="text-sm text-muted">Daily updates & progress</span>
            </div>
          </header>

          <div className="workspace-content p-6">
            {error && (
              <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}

            {success && (
              <div className="mb-6 p-4 rounded-lg bg-green-500/10 border border-green-500/30 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
                <p className="text-green-300 text-sm">{success}</p>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <div className="workspace-card">
                    <div className="workspace-card-header">
                      <h2 className="workspace-card-title flex items-center gap-2">
                        <Clock className="w-4 h-4 text-blue-400" />
                        What did you do yesterday?
                      </h2>
                    </div>
                    <div className="workspace-card-body">
                      <textarea
                        className="form-textarea w-full"
                        rows={4}
                        placeholder="Describe what you accomplished yesterday..."
                        value={yesterday}
                        onChange={(e) => setYesterday(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="workspace-card">
                    <div className="workspace-card-header">
                      <h2 className="workspace-card-title flex items-center gap-2">
                        <ListChecks className="w-4 h-4 text-green-400" />
                        What are you working on today?
                      </h2>
                    </div>
                    <div className="workspace-card-body">
                      <textarea
                        className="form-textarea w-full"
                        rows={4}
                        placeholder="Describe your plan for today..."
                        value={today}
                        onChange={(e) => setToday(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="workspace-card">
                    <div className="workspace-card-header">
                      <h2 className="workspace-card-title flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-orange-400" />
                        Any blockers?
                      </h2>
                    </div>
                    <div className="workspace-card-body">
                      <textarea
                        className="form-textarea w-full"
                        rows={3}
                        placeholder="Anything slowing you down or blocking progress?"
                        value={blockers}
                        onChange={(e) => setBlockers(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="workspace-card">
                    <div className="workspace-card-header">
                      <h2 className="workspace-card-title">Related Tasks</h2>
                    </div>
                    <div className="workspace-card-body">
                      {loading ? (
                        <p className="text-sm text-muted">Loading tasks...</p>
                      ) : tasks.length === 0 ? (
                        <p className="text-sm text-muted">No tasks found</p>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {tasks.map((task) => (
                            <label
                              key={task._id}
                              className="flex items-center gap-2 p-2 rounded hover:bg-white/5 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={selectedTasks.includes(task._id)}
                                onChange={() => toggleTask(task._id)}
                                className="rounded border-gray-600 bg-navy text-blue-500 focus:ring-blue-500"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-200 truncate">{task.title}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-xs text-muted">{task.status}</span>
                                  {task.priority && (
                                    <span className="text-xs text-muted">· {task.priority}</span>
                                  )}
                                </div>
                              </div>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="workspace-card">
                    <div className="workspace-card-header">
                      <h2 className="workspace-card-title">Post to Channel</h2>
                    </div>
                    <div className="workspace-card-body space-y-3">
                      <div>
                        <label className="block text-sm text-muted mb-1">Company</label>
                        <select
                          className="form-textarea w-full text-sm"
                          value={selectedCompany}
                          onChange={(e) => setSelectedCompany(e.target.value)}
                        >
                          {companies.map((c) => (
                            <option key={c._id} value={c._id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm text-muted mb-1">Channel</label>
                        <select
                          className="form-textarea w-full text-sm"
                          value={selectedChannel}
                          onChange={(e) => setSelectedChannel(e.target.value)}
                        >
                          <option value="">Select a channel</option>
                          {channels.map((ch) => (
                            <option key={ch._id} value={ch._id}>
                              {ch.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="cta-button w-full flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    {submitting ? 'Submitting...' : 'Submit Standup'}
                  </button>
                </div>
              </div>
            </form>

            {pastStandups.length > 0 && (
              <div className="mt-8">
                <h2 className="text-lg font-bold mb-4">Past Standups</h2>
                <div className="space-y-4">
                  {pastStandups.map((s) => (
                    <div key={s._id} className="workspace-card">
                      <div className="workspace-card-header">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted">
                            {new Date(s.timestamp).toLocaleString()}
                          </span>
                          <span className="text-sm text-muted">{s.author}</span>
                        </div>
                      </div>
                      <div className="workspace-card-body space-y-3">
                        {s.yesterday && (
                          <div>
                            <p className="text-xs font-medium text-blue-400 mb-1">Yesterday</p>
                            <p className="text-sm text-gray-300">{s.yesterday}</p>
                          </div>
                        )}
                        {s.today && (
                          <div>
                            <p className="text-xs font-medium text-green-400 mb-1">Today</p>
                            <p className="text-sm text-gray-300">{s.today}</p>
                          </div>
                        )}
                        {s.blockers && (
                          <div>
                            <p className="text-xs font-medium text-orange-400 mb-1">Blockers</p>
                            <p className="text-sm text-gray-300">{s.blockers}</p>
                          </div>
                        )}
                        {s.relatedTasks?.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-purple-400 mb-1">Related Tasks</p>
                            <div className="flex flex-wrap gap-1">
                              {s.relatedTasks.map((taskId) => {
                                const task = tasks.find((t) => t._id === taskId);
                                return (
                                  <span
                                    key={taskId}
                                    className="text-xs bg-white/10 px-2 py-0.5 rounded"
                                  >
                                    {task?.title || taskId}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
