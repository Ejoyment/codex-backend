import { isTokenExpired, rateLimit, sanitizeInput } from './security';
import { getDemoApiResponse, isDemoTourActive } from './demoFixtures';
export { isDemoTourActive };

// Normalize the API origin: strip trailing slashes and a trailing `/api` so an
// env value like `https://host/api` never doubles the prefix when combined with
// request paths that already start with `/api` (guarding against `/api/api/...`).
export function normalizeApiBaseUrl(raw) {
  return String(raw || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api$/i, '')
    .replace(/\/+$/, '');
}

export const API_BASE_URL = normalizeApiBaseUrl(
  typeof window !== 'undefined' 
    ? (localStorage.getItem('buildrsApiBase') || process.env.NEXT_PUBLIC_API_URL || '')
    : (process.env.NEXT_PUBLIC_API_URL || '')
);
// The Buildrs Figma helper reads this to know which backend to sync files to.
if (typeof window !== 'undefined' && API_BASE_URL) {
  try {
    localStorage.setItem('buildrsApiBase', API_BASE_URL);
  } catch (error) {
    // Storage can be unavailable (private mode); the helper has a default.
  }
}
// Realtime endpoints share the backend origin unless overridden — never fall
// back to localhost in production (REST-on-render + socket-on-localhost is a
// guaranteed split failure).
export const SOCKET_URL = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_SOCKET_URL || API_BASE_URL);
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;

// ---------------------------------------------------------------------------
// Client-side GET cache
//
// Pages used to refetch everything on every mount, so navigating away and back
// flashed loading skeletons and paid for data the app already had. Successful
// GET responses are now cached per user (memory + sessionStorage) for a short
// window. Mutations invalidate the resource they touched, and live/polling
// callers opt out with `{ noCache: true }` so they keep seeing fresh data.
// ---------------------------------------------------------------------------
const GET_CACHE_TTL_MS = 5 * 60 * 1000;
const GET_CACHE_PREFIX = 'buildrs-api-cache-v1';
const GET_CACHE_MAX_ENTRIES = 120;
// Large payloads (repo trees, file contents) don't belong in sessionStorage;
// keep them in memory-only so we never blow the per-origin quota.
const GET_CACHE_MAX_PERSIST_CHARS = 400 * 1024;

const getCacheMemory = new Map();
let getCacheMemoryUserId = null;

function getCacheUserId() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('user') || localStorage.getItem('auth-storage');
    if (!raw) return 'anon';
    const parsed = JSON.parse(raw);
    const user = parsed?.user || parsed?.state?.user || parsed;
    return String(user?._id || user?.id || user?.email || 'anon');
  } catch {
    return 'anon';
  }
}

function ensureCacheUser(userId) {
  if (getCacheMemoryUserId !== userId) {
    getCacheMemory.clear();
    getCacheMemoryUserId = userId;
  }
}

function buildGetCacheKey(path) {
  const userId = getCacheUserId();
  if (!userId) return null;
  ensureCacheUser(userId);
  return `${GET_CACHE_PREFIX}:${userId}:${path}`;
}

function pruneMemoryCache() {
  while (getCacheMemory.size > GET_CACHE_MAX_ENTRIES) {
    const oldest = getCacheMemory.keys().next().value;
    if (oldest === undefined) return;
    getCacheMemory.delete(oldest);
  }
}

function pruneSessionCache() {
  if (typeof window === 'undefined') return;
  const entries = [];
  try {
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (!key || !key.startsWith(GET_CACHE_PREFIX)) continue;
      let at = 0;
      try {
        at = JSON.parse(window.sessionStorage.getItem(key) || '{}').at || 0;
      } catch {
        at = 0;
      }
      entries.push({ key, at });
    }
    entries
      .sort((a, b) => a.at - b.at)
      .slice(0, Math.max(1, Math.ceil(entries.length / 2)))
      .forEach(({ key }) => window.sessionStorage.removeItem(key));
  } catch {
    /* storage unavailable */
  }
}

function readGetCache(key, ttlMs) {
  const now = Date.now();
  const mem = getCacheMemory.get(key);
  if (mem) {
    if (now - mem.at <= ttlMs) {
      try {
        return { hit: true, data: JSON.parse(mem.json) };
      } catch {
        getCacheMemory.delete(key);
      }
    } else {
      getCacheMemory.delete(key);
    }
  }
  if (typeof window === 'undefined') return { hit: false };
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return { hit: false };
    const entry = JSON.parse(raw);
    if (!entry || typeof entry.at !== 'number' || now - entry.at > ttlMs) {
      window.sessionStorage.removeItem(key);
      return { hit: false };
    }
    const data = JSON.parse(entry.json);
    getCacheMemory.set(key, entry);
    pruneMemoryCache();
    return { hit: true, data };
  } catch {
    return { hit: false };
  }
}

function writeGetCache(key, data) {
  let json;
  try {
    json = JSON.stringify(data);
  } catch {
    return;
  }
  if (typeof json !== 'string') return;
  const entry = { at: Date.now(), json };
  // Re-insert so the Map keeps recency order for pruning.
  getCacheMemory.delete(key);
  getCacheMemory.set(key, entry);
  pruneMemoryCache();

  if (typeof window === 'undefined' || json.length > GET_CACHE_MAX_PERSIST_CHARS) return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    pruneSessionCache();
    try {
      window.sessionStorage.setItem(key, JSON.stringify(entry));
    } catch {
      /* quota still exceeded — memory cache still works */
    }
  }
}

/** Resource bucket for a path: /api/company/123/members -> /api/company */
function getCacheScope(path) {
  const clean = String(path || '').split('?')[0];
  const parts = clean.split('/').filter(Boolean);
  if (parts[0] !== 'api') return parts[0] ? `/${parts[0]}` : '';
  if (parts[1] === 'v1' && parts[2]) return `/api/v1/${parts[2]}`;
  return parts[1] ? `/api/${parts[1]}` : '/api';
}

function pathMatchesScope(requestPath, scope) {
  return requestPath === scope
    || requestPath.startsWith(`${scope}/`)
    || requestPath.startsWith(`${scope}?`);
}

/**
 * Some GETs are one-shot handshakes rather than data: OAuth authorize URLs
 * carry a single-use `state`, so replaying a cached one breaks the next
 * connect attempt.
 */
function isNonCacheablePath(path) {
  const clean = String(path || '').split('?')[0].toLowerCase();
  return clean.endsWith('/connect') || clean.endsWith('/auth');
}

function removeCacheKeys(predicate) {
  for (const key of Array.from(getCacheMemory.keys())) {
    if (predicate(key)) getCacheMemory.delete(key);
  }
  if (typeof window === 'undefined') return;
  try {
    const doomed = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (key && key.startsWith(GET_CACHE_PREFIX) && predicate(key)) doomed.push(key);
    }
    doomed.forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Drop every cached GET for a resource bucket (e.g. `/api/notifications`).
 * Called automatically after successful mutations; exported so callers that
 * update data out-of-band (sockets, optimistic flows) can do the same.
 */
export function invalidateApiCache(scope) {
  const userId = getCacheUserId();
  if (!userId || !scope) return;
  ensureCacheUser(userId);
  const prefix = `${GET_CACHE_PREFIX}:${userId}:`;
  removeCacheKeys((key) => (
    key.startsWith(prefix) && pathMatchesScope(key.slice(prefix.length), scope)
  ));
}

/** Wipe the whole client cache (logout / user switch). */
export function clearApiCache() {
  getCacheMemory.clear();
  getCacheMemoryUserId = null;
  if (typeof window === 'undefined') return;
  try {
    const doomed = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (key && key.startsWith(GET_CACHE_PREFIX)) doomed.push(key);
    }
    doomed.forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    /* storage unavailable */
  }
}

function invalidateForMutation(path) {
  invalidateApiCache(getCacheScope(path));
}

export async function apiFetch(path, options = {}) {
  if (isDemoTourActive()) {
    return getDemoApiResponse(path, options);
  }

  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    noCache = false,
    forceRefresh = false,
    cacheTtlMs = GET_CACHE_TTL_MS,
    ...requestOptions
  } = options;
  const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;

  if (token && isTokenExpired(token)) {
    if (typeof window !== 'undefined') {
      clearApiCache();
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      localStorage.removeItem('subscription');
      localStorage.removeItem('auth-storage');
      localStorage.removeItem('supportAgent');
      localStorage.removeItem('supportAgentToken');
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

  // Cached reads only apply to browser GETs of plain data endpoints.
  // Handshakes, demo fixtures and server-side rendering always hit the source.
  const cacheable = method === 'GET'
    && !noCache
    && !isNonCacheablePath(path)
    && typeof window !== 'undefined';
  const cacheKey = cacheable ? buildGetCacheKey(path) : null;
  if (cacheKey && !forceRefresh) {
    const cached = readGetCache(cacheKey, cacheTtlMs);
    if (cached.hit) return cached.data;
  }

  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  // Never send JSON Content-Type with FormData — let browser set multipart boundary
  if (isFormData && headers['Content-Type']) {
    delete headers['Content-Type'];
  }

  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // A fresh controller per attempt: reusing an aborted controller made every
    // retry after a timeout fail immediately with AbortError.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${API_BASE_URL}${path}`, {
        ...requestOptions,
        headers,
        signal: controller.signal,
      });

      if (res.status === 429) {
        const parsed = parseInt(res.headers.get('Retry-After') || '5', 10);
        const retryAfter = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 30) : 5;
        const error = new Error(`Rate limited. Retry after ${retryAfter}s`);
        error.status = 429;
        error.retryAfter = retryAfter;
        throw error;
      }

      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        if (typeof window !== 'undefined' && !options.returnErrorData) {
          clearApiCache();
          localStorage.removeItem('authToken');
          localStorage.removeItem('user');
          localStorage.removeItem('subscription');
          localStorage.removeItem('auth-storage');
          localStorage.removeItem('supportAgent');
          localStorage.removeItem('supportAgentToken');
          window.location.href = '/sign_in';
        }
        const error = new Error(data.message || 'Unauthorized');
        error.status = 401;
        error.data = data;
        throw error;
      }

      if (!res.ok && !options.returnErrorData) {
        const error = new Error(data.message || data.error || 'API request failed');
        error.status = res.status;
        error.data = data;
        throw error;
      }

      if (method !== 'GET' && res.ok) {
        // The write succeeded, so anything cached for this resource is stale.
        invalidateForMutation(path);
      }

      if (cacheable && cacheKey && res.ok) {
        writeGetCache(cacheKey, data);
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
      if (attempt < MAX_RETRIES && method === 'GET') {
        const delayMs = err.status === 429
          ? (err.retryAfter || 5) * 1000
          : 1000 * (attempt + 1);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
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

export function normalizeCompanies(list) {
  return (list || []).map((c) => ({ ...c, id: c.id || c._id, _id: c._id || c.id }));
}

export const authApi = {
  signup: (fullName, email, password) =>
    apiFetch('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ fullName, email, password }),
      returnErrorData: true,
    }),

  signin: (email, password) =>
    apiFetch('/api/auth/signin', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      returnErrorData: true,
    }),

  getMe: () => apiFetch('/api/auth/me'),

  sendOTP: (email) =>
    apiFetch('/api/otp/send', {
      method: 'POST',
      body: JSON.stringify({ email }),
      returnErrorData: true,
    }),

  verifyOTP: (email, otp) =>
    apiFetch('/api/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ email, otp }),
      returnErrorData: true,
    }),

  resendOTP: (email) =>
    apiFetch('/api/otp/resend', {
      method: 'POST',
      body: JSON.stringify({ email }),
      returnErrorData: true,
    }),

  google: () => `${API_BASE_URL}/api/auth/google`,
};

export const companyApi = {
  create: (data) =>
    apiFetch('/api/company/create', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getMyCompanies: async (options = {}) => {
    const data = await apiFetch('/api/company/my-companies', options);
    return { ...data, companies: normalizeCompanies(data.companies) };
  },
  getDetails: (companyId) => apiFetch(`/api/company/${companyId}`),
  getMembers: (companyId) => apiFetch(`/api/company/${companyId}/members`),
  updateSettings: (companyId, settings) =>
    apiFetch(`/api/company/${companyId}/settings`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
};

export const subscriptionApi = {
  getCurrent: () => apiFetch('/api/v1/billing/subscription/current'),
  // User-initiated cancellation is always period-end; immediate revocation is
  // reserved for abuse/refund handling and is not exposed to the client.
  cancel: () => apiFetch('/api/v1/billing/cancel', { method: 'POST' }),
  resume: () => apiFetch('/api/v1/billing/subscription/resume', { method: 'POST' }),
  // Downgrades and moves to Free. Upgrades must go through checkout instead.
  changePlan: (tier, timing) =>
    apiFetch('/api/v1/billing/subscription/change-plan', {
      method: 'POST',
      body: JSON.stringify({ tier, timing }),
    }),
  setOverage: (enabled) =>
    apiFetch('/api/v1/billing/subscription/overage', {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),
};

export const billingApi = {
  getTrial: () => apiFetch('/api/v1/billing/trial/status'),
};

export const integrationApi = {
  list: (options = {}) => apiFetch('/api/integrations', options),
  github: (options = {}) => apiFetch('/api/github/status', options),
  slack: () => apiFetch('/api/slack/status'),
  discord: () => apiFetch('/api/discord/status'),
  notion: () => apiFetch('/api/notion/connect'),
  figma: () => apiFetch('/api/figma/status'),
};

export const dashboardApi = {
  getData: (options = {}) => apiFetch('/api/dashboard/data', options),
  getOverview: (options = {}) => apiFetch('/api/dashboard/overview', options),
  getPlatformData: (platform, options = {}) => apiFetch(`/api/dashboard/data/${platform}`, options),
  sync: (platform) => apiFetch(`/api/dashboard/sync/${platform}`, { method: 'POST' }),
};

export const githubApi = {
  listRepos: (params = {}, options = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/api/github/repos${qs ? `?${qs}` : ''}`, options);
  },
  getRepo: (owner, repo) => apiFetch(`/api/github/repos/${owner}/${repo}`),
  getBranches: (owner, repo) => apiFetch(`/api/github/repos/${owner}/${repo}/branches`),
  getCommits: (owner, repo, params = {}, options = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/api/github/repos/${owner}/${repo}/commits${qs ? `?${qs}` : ''}`, options);
  },
  getIssues: (owner, repo, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/api/github/repos/${owner}/${repo}/issues${qs ? `?${qs}` : ''}`);
  },
  getPulls: (owner, repo, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/api/github/repos/${owner}/${repo}/pulls${qs ? `?${qs}` : ''}`);
  },
  getStatus: (options = {}) => apiFetch('/api/github/status', options),
};

export const discordApi = {
  getGuilds: (options = {}) => apiFetch('/api/discord/guilds', options),
  getGuildChannels: (guildId, options = {}) => apiFetch(`/api/discord/guilds/${guildId}/channels`, options),
  getChannelMessages: (channelId, params = {}, options = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/api/discord/channels/${channelId}/messages${qs ? `?${qs}` : ''}`, options);
  },
  getStatus: () => apiFetch('/api/discord/status'),
};

export const figmaApi = {
  listFiles: (options = {}) => apiFetch('/api/figma/files', options),
  getFrames: (fileKey, { thumbnails = true } = {}) =>
    apiFetch(`/api/figma/files/${encodeURIComponent(fileKey)}/frames${thumbnails ? '' : '?thumbnails=0'}`, { timeoutMs: 45000 }),
  generateCode: ({ fileKey, nodeId, target = 'react', prompt = '', node, nodeName, fileName }) =>
    apiFetch('/api/design-code/generate', {
      method: 'POST',
      body: JSON.stringify({ fileKey, nodeId, target, prompt, node, nodeName, fileName }),
      timeoutMs: 120000,
    }),
  saveSnapshot: ({ fileKey, nodeId, nodeName, fileName, node }) =>
    apiFetch('/api/figma/snapshots', {
      method: 'POST',
      body: JSON.stringify({ fileKey, nodeId, nodeName, fileName, node }),
      timeoutMs: 60000,
    }),
  getComments: (fileKey, options = {}) => apiFetch(`/api/figma/files/${fileKey}/comments`, options),
  getStatus: () => apiFetch('/api/figma/status'),
  getLibrary: ({ refresh = false } = {}) =>
    apiFetch(`/api/figma/library${refresh ? '?refresh=1' : ''}`, { timeoutMs: 90000 }),
  savePersonalAccessToken: (token) =>
    apiFetch('/api/figma/personal-access-token', { method: 'POST', body: JSON.stringify({ token }) }),
  getPluginStatus: () => apiFetch('/api/figma/plugin/status'),
  createPluginToken: () => apiFetch('/api/figma/plugin/token', { method: 'POST' }),
  revokePluginToken: () => apiFetch('/api/figma/plugin/token', { method: 'DELETE' }),
};

export const slackApi = {
  listConversations: (params = {}, options = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/api/slack/conversations/list${qs ? `?${qs}` : ''}`, options);
  },
  getHistory: (channelId, params = {}, options = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/api/slack/conversations/history/${channelId}${qs ? `?${qs}` : ''}`, options);
  },
  getStatus: () => apiFetch('/api/slack/status'),
};

export const aiPairApi = {
  createSession: (data) =>
    apiFetch('/api/ai-pair/session', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  chat: (sessionId, message) =>
    apiFetch('/api/ai-pair/chat', {
      method: 'POST',
      body: JSON.stringify({ sessionId, message }),
      timeoutMs: 120000,
    }),
};

export const messagingApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/api/messaging/channels${qs ? `?${qs}` : ''}`);
  },
  send: (data) =>
    apiFetch('/api/messaging/messages', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

export const meetingApi = {
  list: (companyId, params = {}, options = {}) => {
    const qs = new URLSearchParams({ companyId, ...params }).toString();
    return apiFetch(`/api/meetings${qs ? `?${qs}` : ''}`, options);
  },
  create: (data) =>
    apiFetch('/api/meetings', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

export const supportApi = {
  createTicket: (data) =>
    apiFetch('/api/support/tickets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

export const projectApi = {
  list: (options = {}) => apiFetch('/api/projects', options),
  create: (data) =>
    apiFetch('/api/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  get: (projectId) => apiFetch(`/api/projects/${projectId}`),
  getProvisioning: (projectId, options = {}) => apiFetch(`/api/projects/${projectId}/provisioning`, options),
  retryProvisioning: (projectId) =>
    apiFetch(`/api/projects/${projectId}/provisioning/retry`, {
      method: 'POST',
    }),
  listProjectFiles: (projectId) => apiFetch(`/api/projects/${projectId}/files`),
  listTasks: (options = {}) => apiFetch('/api/projects/tasks', options),
  getTask: (taskId) => apiFetch(`/api/projects/tasks/${taskId}`),
  createTask: (data) =>
    apiFetch('/api/projects/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  listProjectTasks: (projectId) => apiFetch(`/api/projects/${projectId}/tasks`),
  createProjectTask: (projectId, data) =>
    apiFetch(`/api/projects/${projectId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

export const collaborationApi = {
  getCompanyProjects: (companyId, options = {}) =>
    apiFetch(`/api/collaboration/${companyId}/projects`, options),
};

export const agentApi = {
  delegate: (data) =>
    apiFetch('/api/v1/agent/delegate', {
      method: 'POST',
      body: JSON.stringify(data),
      timeoutMs: 300000,
    }),
  sessions: (options = {}) => apiFetch('/api/v1/agent/sessions', options),
  status: (taskId, options = {}) => apiFetch(`/api/v1/agent/status/${taskId}`, options),
  approve: (executionId, taskId) =>
    apiFetch('/api/v1/agent/approve', {
      method: 'POST',
      body: JSON.stringify({ executionId, taskId }),
    }),
  reject: (executionId, taskId) =>
    apiFetch('/api/v1/agent/reject', {
      method: 'POST',
      body: JSON.stringify({ executionId, taskId }),
    }),
  tweak: (executionId, taskId, feedback) =>
    apiFetch('/api/v1/agent/tweak', {
      method: 'POST',
      // Route requires `instruction`; taskId is accepted but unused there.
      body: JSON.stringify({ executionId, taskId, instruction: feedback }),
    }),
  cancel: (executionId) =>
    apiFetch('/api/v1/agent/cancel', {
      method: 'POST',
      body: JSON.stringify({ executionId }),
    }),
  verifySpec: (specId, taskId) =>
    apiFetch('/api/v1/specs/verify', {
      method: 'POST',
      body: JSON.stringify({ specId, taskId }),
    }),
  createSpec: (data) =>
    apiFetch('/api/v1/specs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getSpec: (specId) => apiFetch(`/api/v1/specs/${specId}`),
  driftReport: (workspaceId) =>
    apiFetch('/api/v1/specs/drift-report', {
      method: 'POST',
      body: JSON.stringify({ workspaceId }),
    }),
};
