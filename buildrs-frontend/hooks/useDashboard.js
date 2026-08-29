import { useCallback, useEffect, useRef, useState } from 'react';
import {
  authApi,
  dashboardApi,
  githubApi,
  discordApi,
  figmaApi,
  slackApi,
  projectApi,
  collaborationApi,
} from '../lib/api';

const REFRESH_INTERVAL_MS = 30000;

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
    const data = await githubApi.listRepos({ per_page: 5 });
    if (!data.success || !data.repositories?.length) return [];

    const repo = data.repositories[0];
    const commitsData = await githubApi.getCommits(repo.owner, repo.name, { per_page: 3 });
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
    const guildsData = await discordApi.getGuilds();
    if (!guildsData.success || !guildsData.guilds?.length) return [];

    const guild = guildsData.guilds[0];
    const channelsData = await discordApi.getGuildChannels(guild.id);
    if (!channelsData.success || !channelsData.channels?.length) return [];

    const channel = channelsData.channels[0];
    const messagesData = await discordApi.getChannelMessages(channel.id, { limit: 3 });
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
    const filesData = await figmaApi.listFiles();
    if (!filesData.success || !filesData.files?.length) return [];

    const file = filesData.files[0];
    const commentsData = await figmaApi.getComments(file.key);
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
    const channelsData = await slackApi.listConversations({ limit: 5 });
    if (!channelsData.success || !channelsData.channels?.length) return [];

    const channel = channelsData.channels[0];
    const messagesData = await slackApi.getHistory(channel.id, { limit: 3 });
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

export function useDashboard() {
  const [stats, setStats] = useState(null);
  const [trial, setTrial] = useState(null);
  const [integrations, setIntegrations] = useState(null); // null = loading, [] = empty
  const [activity, setActivity] = useState(null);
  const [projects, setProjects] = useState(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const loadStats = useCallback(async () => {
    try {
      const result = await dashboardApi.getData();
      if (result.success && result.data?.stats) {
        if (!mounted.current) return;
        setStats(result.data.stats);
        setTrial(result.data.trial || null);
      } else if (mounted.current) {
        setStats({ activeProjects: 0, totalCompleted: 0, teamMembers: 0, integrations: 0 });
      }
    } catch {
      if (mounted.current) {
        setStats({ activeProjects: 0, totalCompleted: 0, teamMembers: 0, integrations: 0 });
      }
    }
  }, []);

  const loadIntegrationsHub = useCallback(async () => {
    try {
      const result = await dashboardApi.getData();
      if (!mounted.current) return;
      if (result.success && result.data) {
        const connected = result.data.connectedIntegrations || [];
        const connectedPlatforms = connected.map((i) => i.platform || i);
        setIntegrations(
          INTEGRATION_CATALOG.map((entry) => ({
            ...entry,
            connected: connectedPlatforms.includes(entry.platform),
          }))
        );
      } else {
        setIntegrations([]);
      }
    } catch {
      // keep previous state on transient errors
    }
  }, []);

  const loadActivity = useCallback(async () => {
    try {
      const results = await Promise.all([
        fetchGitHubActivity(),
        fetchDiscordActivity(),
        fetchFigmaActivity(),
        fetchSlackActivity(),
      ]);
      if (!mounted.current) return;
      const all = results
        .flat()
        .filter(Boolean)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 10)
        .map((item) => ({ ...item, relativeTime: formatTime(item.timestamp) }));
      setActivity(all);
    } catch {
      if (mounted.current) setActivity([]);
    }
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const collected = [];

      try {
        const localData = await projectApi.list();
        if (localData.success && localData.projects) {
          collected.push(
            ...localData.projects.map((project) => ({
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
        const githubData = await githubApi.listRepos({ per_page: 5, sort: 'updated' });
        if (githubData.success && githubData.repositories) {
          collected.push(
            ...githubData.repositories.map((repo) => ({
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
        const userData = await authApi.getMe();
        if (userData.success && userData.user?.company) {
          const projectsData = await collaborationApi.getCompanyProjects(userData.user.company);
          if (projectsData.success && projectsData.projects) {
            collected.push(
              ...projectsData.projects.map((project) => ({
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
      if (mounted.current) setProjects(collected.slice(0, 5));
    } catch {
      if (mounted.current) setProjects([]);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadStats(), loadIntegrationsHub(), loadActivity(), loadProjects()]);
  }, [loadStats, loadIntegrationsHub, loadActivity, loadProjects]);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      await refreshAll();
      if (mounted.current) setLoading(false);
    })();

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
  }, [refreshAll]);

  return { stats, trial, integrations, activity, projects, loading, refreshAll, loadStats, loadProjects };
}
