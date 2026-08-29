import { isTokenExpired, rateLimit, sanitizeInput } from './security';

const API_BASE_URL = 'https://codex-backend-7utu.onrender.com/api';
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;

export async function apiFetch(path, options = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;

  if (token && isTokenExpired(token)) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      localStorage.removeItem('subscription');
      window.location.href = '/sign_in';
    }
    throw new Error('Session expired');
  }

  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    const rl = rateLimit(`api:${path}`, { maxAttempts: 10, windowMs: 60000 });
    if (!rl.allowed) {
      throw new Error(`Too many requests. Try again in ${rl.retryAfter}s`);
    }
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);

  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '5', 10);
        throw new Error(`Rate limited. Retry after ${retryAfter}s`);
      }

      if (res.status === 401) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('authToken');
          localStorage.removeItem('user');
          localStorage.removeItem('subscription');
          window.location.href = '/sign_in';
        }
        throw new Error('Unauthorized');
      }

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const error = new Error(data.message || 'API request failed');
        error.status = res.status;
        error.data = data;
        throw error;
      }

      return data;
    } catch (err) {
      lastError = err;
      if (err.name === 'AbortError') {
        throw new Error('Request timed out');
      }
      if (err.message === 'Session expired' || err.message === 'Unauthorized') {
        throw err;
      }
      if (attempt < MAX_RETRIES && !options.method) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

export function sanitize(body) {
  if (typeof body !== 'object' || body === null) return body;
  const clean = {};
  for (const [key, value] of Object.entries(body)) {
    clean[key] = typeof value === 'string' ? sanitizeInput(value) : value;
  }
  return clean;
}

export const authApi = {
  signup: (fullName, email, password) =>
    apiFetch('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ fullName, email, password }),
    }),

  signin: (email, password) =>
    apiFetch('/auth/signin', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  getMe: () => apiFetch('/auth/me'),

  sendOTP: (email) =>
    apiFetch('/otp/send', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  verifyOTP: (email, otp) =>
    apiFetch('/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ email, otp }),
    }),

  resendOTP: (email) =>
    apiFetch('/otp/resend', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  google: () => `${API_BASE_URL}/auth/google`,
  facebook: () => `${API_BASE_URL}/auth/facebook`,
};

export const companyApi = {
  getMyCompanies: () => apiFetch('/company/my-companies'),
  getDetails: (companyId) => apiFetch(`/company/${companyId}`),
  getMembers: (companyId) => apiFetch(`/company/${companyId}/members`),
};

export const subscriptionApi = {
  getCurrent: () => apiFetch('/subscription/current'),
};

export const billingApi = {
  getTrial: () => apiFetch('/trial-billing/status'),
};

export const integrationApi = {
  list: () => apiFetch('/integrations'),
  github: () => apiFetch('/github'),
  slack: () => apiFetch('/slack'),
  discord: () => apiFetch('/discord'),
  notion: () => apiFetch('/notion'),
  figma: () => apiFetch('/figma'),
};

export const dashboardApi = {
  getData: () => apiFetch('/dashboard/data'),
  getPlatformData: (platform) => apiFetch(`/dashboard/data/${platform}`),
  sync: (platform) => apiFetch(`/dashboard/sync/${platform}`, { method: 'POST' }),
};

export const githubApi = {
  listRepos: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/github/repos${qs ? `?${qs}` : ''}`);
  },
  getRepo: (owner, repo) => apiFetch(`/github/repos/${owner}/${repo}`),
  getCommits: (owner, repo, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/github/repos/${owner}/${repo}/commits${qs ? `?${qs}` : ''}`);
  },
  getIssues: (owner, repo, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/github/repos/${owner}/${repo}/issues${qs ? `?${qs}` : ''}`);
  },
  getPulls: (owner, repo, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/github/repos/${owner}/${repo}/pulls${qs ? `?${qs}` : ''}`);
  },
  getStatus: () => apiFetch('/github/status'),
};

export const discordApi = {
  getGuilds: () => apiFetch('/discord/guilds'),
  getGuildChannels: (guildId) => apiFetch(`/discord/guilds/${guildId}/channels`),
  getChannelMessages: (channelId, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/discord/channels/${channelId}/messages${qs ? `?${qs}` : ''}`);
  },
  getStatus: () => apiFetch('/discord/status'),
};

export const figmaApi = {
  listFiles: () => apiFetch('/figma/files'),
  getComments: (fileKey) => apiFetch(`/figma/files/${fileKey}/comments`),
  getStatus: () => apiFetch('/figma/status'),
};

export const slackApi = {
  listConversations: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/slack/conversations/list${qs ? `?${qs}` : ''}`);
  },
  getHistory: (channelId, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/slack/conversations/history/${channelId}${qs ? `?${qs}` : ''}`);
  },
  getStatus: () => apiFetch('/slack/status'),
};

export const aiPairApi = {
  createSession: (data) =>
    apiFetch('/ai-pair/session', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  chat: (sessionId, message) =>
    apiFetch('/ai-pair/chat', {
      method: 'POST',
      body: JSON.stringify({ sessionId, message }),
    }),
};

export const messagingApi = {
  list: () => apiFetch('/messaging'),
  send: (data) =>
    apiFetch('/messaging', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

export const meetingApi = {
  list: () => apiFetch('/meetings'),
  create: (data) =>
    apiFetch('/meetings', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

export const supportApi = {
  createTicket: (data) =>
    apiFetch('/support/tickets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

export const projectApi = {
  list: () => apiFetch('/projects'),
  create: (data) =>
    apiFetch('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  get: (projectId) => apiFetch(`/projects/${projectId}`),
  listTasks: () => apiFetch('/projects/tasks'),
  createTask: (data) =>
    apiFetch('/projects/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  listProjectTasks: (projectId) => apiFetch(`/projects/${projectId}/tasks`),
  createProjectTask: (projectId, data) =>
    apiFetch(`/projects/${projectId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

export const collaborationApi = {
  getCompanyProjects: (companyId) => apiFetch(`/collaboration/${companyId}/projects`),
};
