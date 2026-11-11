import { useCallback, useEffect, useRef, useState } from 'react';
import {
  dashboardApi,
  githubApi,
  discordApi,
  figmaApi,
  slackApi,
  projectApi,
  collaborationApi,
  meetingApi,
  companyApi,
} from '../lib/api';

const REFRESH_INTERVAL_MS = 30000;
const DASHBOARD_CACHE_KEY = 'buildrs-dashboard-cache-v1';

function dashboardCacheKey(userId) {
  return userId ? `${DASHBOARD_CACHE_KEY}:${userId}` : null;
}

function readDashboardCache(userId) {
  const key = dashboardCacheKey(userId);
  if (typeof window === 'undefined' || !key) return {};
  try {
    const cached = JSON.parse(window.sessionStorage.getItem(key) || '{}');
    return cached && typeof cached === 'object' ? cached : {};
  } catch {
    return {};
  }
}

function cacheDashboardValue(userId, key, value) {
  const storageKey = dashboardCacheKey(userId);
  if (typeof window === 'undefined' || !storageKey) return;
  try {
    const cached = readDashboardCache(userId);
    window.sessionStorage.setItem(storageKey, JSON.stringify({ ...cached, [key]: value }));
  } catch {
    // Continue with network data when browser storage is unavailable.
  }
}

const INTEGRATION_CATALOG = [
  { platform: 'github', name: 'GitHub' },
  { platform: 'discord', name: 'Discord' },
  { platform: 'figma', name: 'Figma' },
  { platform: 'slack', name: 'Slack' },
  { platform: 'notion', name: 'Notion' },
  { platform: 'vscode', name: 'VS Code' },
];

function formatTime(timestamp) {
  const now = new Date();
  const time = new Date(timestamp);
  const diff = Math.floor((now - time) / 1000);

  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
  return time.toLocaleDateString();
}

async function fetchGitHubActivity() {
  try {
    const data = await githubApi.listRepos({ per_page: 5 }, { noCache: true });
    if (!data.success || !data.repositories?.length) return [];

    const repo = data.repositories[0];
    const commitsData = await githubApi.getCommits(repo.owner, repo.name, { per_page: 3 }, { noCache: true });
    if (!commitsData.success || !commitsData.commits) return [];

    return commitsData.commits.map((commit) => ({
      type: 'integration',
      title: 'GitHub Commit',
      description: `${commit.message.split('\n')[0]} in ${repo.name}`,
      timestamp: commit.author.date,
      icon: 'github',
    }));
  } catch {
    return [];
  }
}

async function fetchDiscordActivity() {
  try {
    const guildsData = await discordApi.getGuilds({ noCache: true });
    if (!guildsData.success || !guildsData.guilds?.length) return [];

    const guild = guildsData.guilds[0];
    const channelsData = await discordApi.getGuildChannels(guild.id, { noCache: true });
    if (!channelsData.success || !channelsData.channels?.length) return [];

    const channel = channelsData.channels[0];
    const messagesData = await discordApi.getChannelMessages(channel.id, { limit: 3 }, { noCache: true });
    if (!messagesData.success || !messagesData.messages) return [];

    return messagesData.messages.map((msg) => ({
      type: 'team',
      title: 'Discord Message',
      description: `${msg.author.username}: ${msg.content.substring(0, 50)}${msg.content.length > 50 ? '...' : ''}`,
      timestamp: msg.timestamp,
      icon: 'discord',
    }));
  } catch {
    return [];
  }
}

async function fetchFigmaActivity() {
  try {
    const filesData = await figmaApi.listFiles({ noCache: true });
    if (!filesData.success || !filesData.files?.length) return [];

    const file = filesData.files[0];
    const commentsData = await figmaApi.getComments(file.key, { noCache: true });
    if (!commentsData.success || !commentsData.comments) return [];

    return commentsData.comments.slice(0, 3).map((comment) => ({
      type: 'integration',
      title: 'Figma Comment',
      description: `New comment on ${file.name}`,
      timestamp: comment.created_at,
      icon: 'figma',
    }));
  } catch {
    return [];
  }
}

async function fetchSlackActivity() {
  try {
    const channelsData = await slackApi.listConversations({ limit: 5 }, { noCache: true });
    if (!channelsData.success || !channelsData.channels?.length) return [];

    const channel = channelsData.channels[0];
    const messagesData = await slackApi.getHistory(channel.id, { limit: 3 }, { noCache: true });
    if (!messagesData.success || !messagesData.messages) return [];

    return messagesData.messages.map((msg) => ({
      type: 'team',
      title: 'Slack Message',
      description: `${msg.text?.substring(0, 50)}${msg.text?.length > 50 ? '...' : ''}`,
      timestamp: new Date(parseFloat(msg.ts) * 1000).toISOString(),
      icon: 'slack',
    }));
  } catch {
    return [];
  }
}

export function useDashboard(userId) {
  const currentUserId = userId ? String(userId) : null;
  const [stats, setStats] = useState(() => readDashboardCache(currentUserId).stats ?? null);
  const [trial, setTrial] = useState(() => readDashboardCache(currentUserId).trial ?? null);
  const [overview, setOverview] = useState(() => readDashboardCache(currentUserId).overview ?? null);
  const [integrations, setIntegrations] = useState(() => readDashboardCache(currentUserId).integrations ?? null);
  const [activity, setActivity] = useState(() => readDashboardCache(currentUserId).activity ?? null);
  const [projects, setProjects] = useState(() => readDashboardCache(currentUserId).projects ?? null);
  const [tasks, setTasks] = useState(() => readDashboardCache(currentUserId).tasks ?? null);
  const [companies, setCompanies] = useState(() => readDashboardCache(currentUserId).companies ?? null);
  const [meetings, setMeetings] = useState(() => readDashboardCache(currentUserId).meetings ?? null);
  const [loading, setLoading] = useState(() => readDashboardCache(currentUserId).overview == null);
  const mounted = useRef(true);
  const dashboardDataRequest = useRef(null);
  const cacheUserId = useRef(currentUserId);
  const saveCache = useCallback((key, value) => {
    cacheDashboardValue(currentUserId, key, value);
  }, [currentUserId]);
  const isCurrentUser = useCallback(
    () => mounted.current && cacheUserId.current === currentUserId,
    [currentUserId]
  );

  useEffect(() => {
    if (cacheUserId.current === currentUserId) return;
    cacheUserId.current = currentUserId;
    const cached = readDashboardCache(currentUserId);
    setStats(cached.stats ?? null);
    setTrial(cached.trial ?? null);
    setOverview(cached.overview ?? null);
    setIntegrations(cached.integrations ?? null);
    setActivity(cached.activity ?? null);
    setProjects(cached.projects ?? null);
    setTasks(cached.tasks ?? null);
    setCompanies(cached.companies ?? null);
    setMeetings(cached.meetings ?? null);
    setLoading(cached.overview == null);
  }, [currentUserId]);

  const loadDashboardData = useCallback(() => {
    if (!dashboardDataRequest.current || dashboardDataRequest.current.userId !== currentUserId) {
      const request = { userId: currentUserId, promise: dashboardApi.getData({ noCache: true }) };
      dashboardDataRequest.current = request;
      request.promise.then(
        () => {
          if (dashboardDataRequest.current === request) dashboardDataRequest.current = null;
        },
        () => {
          if (dashboardDataRequest.current === request) dashboardDataRequest.current = null;
        }
      );
    }
    return dashboardDataRequest.current.promise;
  }, [currentUserId]);

  const loadStats = useCallback(async () => {
    try {
      const result = await loadDashboardData();
      if (result.success && result.data?.stats) {
        if (!isCurrentUser()) return;
        setStats(result.data.stats);
        setTrial(result.data.trial || null);
        saveCache('stats', result.data.stats);
        saveCache('trial', result.data.trial || null);
      } else if (isCurrentUser()) {
        const emptyStats = { activeProjects: 0, totalCompleted: 0, teamMembers: 0, integrations: 0 };
        setStats(emptyStats);
        saveCache('stats', emptyStats);
      }
    } catch {
      if (isCurrentUser()) {
        const emptyStats = { activeProjects: 0, totalCompleted: 0, teamMembers: 0, integrations: 0 };
        setStats(emptyStats);
        saveCache('stats', emptyStats);
      }
    }
  }, [isCurrentUser, loadDashboardData, saveCache]);

  const loadOverview = useCallback(async () => {
    try {
      const result = await dashboardApi.getOverview({ noCache: true });
      if (!isCurrentUser()) return;
      const nextOverview = result.success && result.data ? result.data : null;
      setOverview(nextOverview);
      if (nextOverview) saveCache('overview', nextOverview);
    } catch {
      if (isCurrentUser()) setOverview(null);
    }
  }, [isCurrentUser, saveCache]);

  const loadIntegrationsHub = useCallback(async () => {
    try {
      const result = await loadDashboardData();
      if (!isCurrentUser()) return;
      if (result.success && result.data) {
        const connected = result.data.connectedIntegrations || [];
        const connectedPlatforms = connected.map((i) => i.platform || i);
        const nextIntegrations = INTEGRATION_CATALOG.map((entry) => ({
          ...entry,
          connected: connectedPlatforms.includes(entry.platform),
        }));
        setIntegrations(nextIntegrations);
        saveCache('integrations', nextIntegrations);
      } else {
        setIntegrations([]);
        saveCache('integrations', []);
      }
    } catch {
      // keep previous state on transient errors
    }
  }, [isCurrentUser, loadDashboardData, saveCache]);

  const loadActivity = useCallback(async () => {
    try {
      const results = await Promise.all([
        fetchGitHubActivity(),
        fetchDiscordActivity(),
        fetchFigmaActivity(),
        fetchSlackActivity(),
      ]);
      if (!isCurrentUser()) return;
      const all = results
        .flat()
        .filter(Boolean)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 10)
        .map((item) => ({ ...item, relativeTime: formatTime(item.timestamp) }));
      setActivity(all);
      saveCache('activity', all);
    } catch {
      if (isCurrentUser()) {
        setActivity([]);
        saveCache('activity', []);
      }
    }
  }, [isCurrentUser, saveCache]);

  const loadProjects = useCallback(async () => {
    try {
      const collected = [];

      try {
        const localData = await projectApi.list({ noCache: true });
        if (localData.success && localData.projects) {
          collected.push(
            ...localData.projects.map((project) => ({
              id: project.id,
              name: project.name,
              description: project.description || 'No description',
              status: project.status || 'active',
              type: 'local',
              updatedAt: project.updatedAt,
              stats: {
                progress: project.progress || 0,
                priority: project.priority || 'medium',
                members: project.members?.length || 0,
              },
            }))
          );
        }
      } catch {
        // local projects unavailable
      }

      try {
        const githubData = await githubApi.listRepos({ per_page: 5, sort: 'updated' }, { noCache: true });
        if (githubData.success && githubData.repositories) {
          collected.push(
            ...githubData.repositories.map((repo) => ({
              id: repo.id,
              name: repo.name,
              description: repo.description || 'No description',
              status: 'active',
              type: 'github',
              updatedAt: repo.updatedAt,
              stats: { stars: repo.stars, forks: repo.forks, language: repo.language },
              url: repo.url,
            }))
          );
        }
      } catch {
        // github projects unavailable
      }

      try {
        const companiesData = await companyApi.getMyCompanies({ noCache: true });
        const companyId = companiesData.success ? companiesData.companies?.[0]?._id : null;
        if (companyId) {
          const projectsData = await collaborationApi.getCompanyProjects(companyId, { noCache: true });
          if (projectsData.success && projectsData.projects) {
            collected.push(
              ...projectsData.projects.map((project) => ({
                id: project.id || project._id,
                name: project.name,
                description: project.description || 'No description',
                status: project.status,
                type: 'team',
                updatedAt: project.updatedAt,
                stats: {
                  progress: project.progress,
                  priority: project.priority,
                  members: project.members?.length || 0,
                },
              }))
            );
          }
        }
      } catch {
        // team projects unavailable
      }

      collected.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      if (isCurrentUser()) {
        const nextProjects = collected.slice(0, 5);
        setProjects(nextProjects);
        saveCache('projects', nextProjects);
      }
    } catch {
      if (isCurrentUser()) {
        setProjects([]);
        saveCache('projects', []);
      }
    }
  }, [isCurrentUser, saveCache]);

  const loadTasks = useCallback(async () => {
    try {
      const data = await projectApi.listTasks({ noCache: true });
      if (isCurrentUser()) {
        const nextTasks = data.success ? (data.tasks || []) : [];
        setTasks(nextTasks);
        saveCache('tasks', nextTasks);
      }
    } catch {
      if (isCurrentUser()) {
        setTasks([]);
        saveCache('tasks', []);
      }
    }
  }, [isCurrentUser, saveCache]);

  const loadCompanies = useCallback(async () => {
    try {
      const data = await companyApi.getMyCompanies({ noCache: true });
      if (isCurrentUser()) {
        const nextCompanies = data.success ? (data.companies || []) : [];
        setCompanies(nextCompanies);
        saveCache('companies', nextCompanies);
      }
    } catch {
      if (isCurrentUser()) {
        setCompanies([]);
        saveCache('companies', []);
      }
    }
  }, [isCurrentUser, saveCache]);

  const loadMeetings = useCallback(async () => {
    try {
      const companiesData = await companyApi.getMyCompanies({ noCache: true });
      const companies = companiesData.success ? companiesData.companies : [];
      const upcoming = [];

      for (const company of companies) {
        try {
          const data = await meetingApi.list(company.id, { upcoming: 'true' }, { noCache: true });
          if (data.success && data.meetings) {
            upcoming.push(...data.meetings);
          }
        } catch {
          // skip company meetings on failure
        }
      }

      upcoming.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
      if (isCurrentUser()) {
        setMeetings(upcoming);
        saveCache('meetings', upcoming);
      }
    } catch {
      if (isCurrentUser()) {
        setMeetings([]);
        saveCache('meetings', []);
      }
    }
  }, [isCurrentUser, saveCache]);

  const refreshAll = useCallback(async () => {
    if (!currentUserId) return;
    await Promise.all([loadStats(), loadOverview(), loadIntegrationsHub(), loadActivity(), loadProjects(), loadTasks(), loadCompanies(), loadMeetings()]);
  }, [currentUserId, loadStats, loadOverview, loadIntegrationsHub, loadActivity, loadProjects, loadTasks, loadCompanies, loadMeetings]);

  useEffect(() => {
    mounted.current = true;
    if (!currentUserId) return undefined;
    const overviewRequest = loadOverview().finally(() => {
      if (isCurrentUser()) setLoading(false);
    });
    const supportingRequests = Promise.all([
      loadStats(),
      loadIntegrationsHub(),
      loadActivity(),
      loadProjects(),
      loadTasks(),
      loadCompanies(),
      loadMeetings(),
    ]);
    Promise.all([overviewRequest, supportingRequests]).catch((error) => {
      console.error('[Dashboard] initial data load failed:', error);
    });

    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshAll();
    };
    document.addEventListener('visibilitychange', onVisible);
    const interval = setInterval(refreshAll, REFRESH_INTERVAL_MS);

    return () => {
      mounted.current = false;
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(interval);
    };
  }, [currentUserId, isCurrentUser, loadOverview, loadStats, loadIntegrationsHub, loadActivity, loadProjects, loadTasks, loadCompanies, loadMeetings, refreshAll]);

  const dataBelongsToCurrentUser = cacheUserId.current === currentUserId;
  return {
    stats: dataBelongsToCurrentUser ? stats : null,
    trial: dataBelongsToCurrentUser ? trial : null,
    overview: dataBelongsToCurrentUser ? overview : null,
    integrations: dataBelongsToCurrentUser ? integrations : null,
    activity: dataBelongsToCurrentUser ? activity : null,
    projects: dataBelongsToCurrentUser ? projects : null,
    tasks: dataBelongsToCurrentUser ? tasks : null,
    companies: dataBelongsToCurrentUser ? companies : null,
    meetings: dataBelongsToCurrentUser ? meetings : null,
    loading: !dataBelongsToCurrentUser || loading,
    refreshAll,
    loadStats,
    loadOverview,
    loadProjects,
    loadTasks,
    loadMeetings,
  };
}
