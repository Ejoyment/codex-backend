// Demo-tour fixtures for the Debug Room page. Kept in a separate module so the
// main demo fixture table stays readable; mutations here only affect the demo
// session, never the real API.

const now = () => new Date().toISOString();

const codeText = `import { TokenExpiredError } from '../errors/auth.errors'
import { tokenStore } from './token-store'
import { createTokenPair, verifyRefreshToken } from './token-utils'
import { auditRefresh } from './audit'
import { logger } from '../logger'
import { maskToken } from '../security/mask'
import type { RefreshRecord, TokenPair } from './types'
import type { RequestContext } from '../http/context'

const MAX_ROTATION_ATTEMPTS = 3
const REFRESH_WINDOW_MS = 30_000
const REVOCATION_GRACE_MS = 5_000

type RefreshOptions = {
  requestId?: string
  userAgent?: string
  ip?: string
}

type RotationResult = {
  pair: TokenPair
  record: RefreshRecord
  rotated: boolean
}

function refreshContext(
  refreshToken: string,
  userId: string,
  options: RefreshOptions = {},
) {
  return {
    refreshToken,
    userId,
    requestId: options.requestId,
    userAgent: options.userAgent,
    ip: options.ip,
  }
}

function logRefresh(event: string, context: ReturnType<typeof refreshContext>) {
  logger.info(event, {
    userId: context.userId,
    requestId: context.requestId,
    token: maskToken(context.refreshToken),
  })
}

function assertWithinWindow(record: RefreshRecord) {
  const age = Date.now() - new Date(record.issuedAt).getTime()
  if (age > REFRESH_WINDOW_MS) {
    throw new TokenExpiredError('Refresh window has elapsed')
  }
}

async function findStoredToken(refreshToken: string) {
  const storedToken = await tokenStore.find(refreshToken)
  if (!storedToken) {
    throw new TokenExpiredError('Refresh token is unknown')
  }
  assertWithinWindow(storedToken)
  return storedToken
}

async function revokeIfRotated(record: RefreshRecord) {
  if (record.rotatedAt) {
    const elapsed = Date.now() - new Date(record.rotatedAt).getTime()
    if (elapsed > REVOCATION_GRACE_MS) {
      await tokenStore.revoke(record.value)
    }
  }
}

async function auditFailure(context: ReturnType<typeof refreshContext>, error: Error) {
  await auditRefresh({
    userId: context.userId,
    requestId: context.requestId,
    outcome: 'rejected',
    reason: error.message,
  })
}

async function auditSuccess(context: ReturnType<typeof refreshContext>, pair: TokenPair) {
  await auditRefresh({
    userId: context.userId,
    requestId: context.requestId,
    outcome: 'rotated',
    tokenId: pair.refreshTokenId,
  })
}

async function rotate(record: RefreshRecord, context: ReturnType<typeof refreshContext>) {
  logRefresh('auth.refresh.start', context)
  assertWithinWindow(record)
  await revokeIfRotated(record)
  return record
}

export async function refreshTokenPair(
  refreshToken: string,
  userId: string,
): Promise<TokenPair> {
  const storedToken = await tokenStore.find(refreshToken)

  if (!storedToken || storedToken.revokedAt) {
    throw new TokenExpiredError('Refresh token is invalid')
  }

  const payload = await verifyRefreshToken(refreshToken)
  await tokenStore.revoke(refreshToken)

  return createTokenPair(payload.userId)
}

export async function revokeTokenFamily(userId: string) {
  const activeTokens = await tokenStore.findByUser(userId)
  await Promise.all(
    activeTokens.map((token) => tokenStore.revoke(token.value)),
  )
}`;

const codeLines = codeText.split('\n');
const activeLine = Math.max(1, codeLines.findIndex((line) => line.includes('Refresh token is invalid')) + 1);

const rooms = [
  {
    id: 'demo-debug-auth',
    roomId: 'auth-flow-debug',
    name: 'auth-flow-debug',
    displayName: '#auth-flow-debug',
    description: 'Debugging JWT refresh token edge case on mobile Safari',
    repository: 'acme/horizon-web',
    branch: 'feature/auth-flow-redesign',
    openFile: 'src/services/auth/jwt.service.ts',
    activeLine,
    status: 'active',
    activeMinutes: 14,
    participants: [
      { id: 'demo-sarah', name: 'Sarah Chen', role: 'host', activeLine, joinedAt: now(), lastSeenAt: now(), isHost: true },
      { id: 'demo-marcus', name: 'Marcus Webb', role: 'collaborator', activeLine: activeLine + 5, joinedAt: now(), lastSeenAt: now(), isHost: false },
    ],
    invites: [],
    investigation: {
      problem: 'Refresh-token rotation occasionally rejects a valid token on mobile Safari after the application returns from the background completely.',
      reproduction: 'Sign in through OAuth on mobile Safari. Leave the application in the background until the access token expires. Return and trigger two API requests at nearly the same time. Observe one successful refresh and one TOKEN_EXPIRED response.',
      workingTheory: 'Two requests attempt to rotate the same refresh token. The first request revokes before the second request completes validation accordingly.',
      nextStep: 'Confirm whether refresh requests can share an in-flight token rotation promise.',
    },
    context: {
      task: { title: 'OAuth2 + JWT auth flow redesign', status: 'In Progress', href: '/tasks' },
      pullRequest: { title: '', status: '', href: '/source-code' },
      branch: { title: 'feature/auth-flow-redesign', status: 'Active', href: '/source-code' },
      specification: { title: 'auth-security.spec.yaml', status: '8/9 requirements passing', href: '/specs' },
    },
    chat: [
      { id: 'demo-chat-1', name: 'Sarah Chen', role: 'host', message: 'I can reproduce it when two requests hit refresh immediately after Safari resumes.', createdAt: now(), isMine: false },
      { id: 'demo-chat-2', name: 'Marcus Webb', role: 'collaborator', message: 'The client interceptor is not deduplicating refresh calls, both request use the same token.', createdAt: now(), isMine: false },
      { id: 'demo-chat-3', name: 'Sarah Chen', role: 'host', message: 'I am checking whether we should fix this in the client, the API, or both.', createdAt: now(), isMine: true },
      { id: 'demo-chat-4', name: 'BuildrsHQ AI', role: 'ai', message: 'The current server flow revokes the token before issuing the replacement. Concurrent requests should share the in-flight rotation promise.', createdAt: now(), isMine: false },
    ],
    activity: [
      { id: 'demo-activity-1', actorName: 'Sarah Chen', action: 'Joined debug room', target: '#auth-flow-debug', createdAt: now() },
      { id: 'demo-activity-2', actorName: 'Marcus Webb', action: 'Opened file', target: 'src/services/auth/jwt.service.ts', createdAt: now() },
      { id: 'demo-activity-3', actorName: 'BuildrsHQ AI', action: 'Agent started', target: 'OAuth2 + JWT auth flow redesign', createdAt: now() },
      { id: 'demo-activity-4', actorName: 'Priya Patel', action: 'Created debug room', target: '#payment-webhook-issue', createdAt: now() },
    ],
    access: { role: 'host', canView: true, canEdit: true, canInvite: true, isHost: true, isCompanyMember: true, invited: false, joined: true },
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: 'demo-debug-webhooks',
    roomId: 'payment-webhook-issue',
    name: 'payment-webhook-issue',
    displayName: '#payment-webhook-issue',
    description: 'Tracing Stripe signature validation failure under HTTPS redirect',
    repository: 'acme/horizon-web',
    branch: 'feature/payments-webhooks',
    openFile: 'src/api/webhooks/stripe.ts',
    activeLine: 23,
    status: 'active',
    activeMinutes: 38,
    participants: [
      { id: 'demo-priya', name: 'Priya Patel', role: 'host', activeLine: 23, joinedAt: now(), lastSeenAt: now(), isHost: true },
    ],
    invites: [],
    investigation: {
      problem: 'Stripe signatures fail validation whenever the webhook endpoint answers through the HTTPS redirect.',
      reproduction: 'Send a test webhook through the production hostname and compare the raw request body with the locally received payload.',
      workingTheory: 'The redirect proxy is re-encoding the request body before Express receives it.',
      nextStep: 'Capture the raw body at the proxy boundary and compare signatures.',
    },
    context: {
      task: { title: 'Stripe webhook verification', status: 'In Progress', href: '/tasks' },
      pullRequest: { title: '', status: '', href: '/source-code' },
      branch: { title: 'feature/payments-webhooks', status: 'Active', href: '/source-code' },
      specification: { title: 'payments.spec.yaml', status: '4/5 requirements passing', href: '/specs' },
    },
    chat: [
      { id: 'demo-chat-5', name: 'Priya Patel', role: 'host', message: 'I captured the raw body before and after the redirect, the bytes differ.', createdAt: now(), isMine: false },
    ],
    activity: [
      { id: 'demo-activity-5', actorName: 'Priya Patel', action: 'Created debug room', target: '#payment-webhook-issue', createdAt: now() },
    ],
    access: { role: 'viewer', canView: true, canEdit: false, canInvite: false, isHost: false, isCompanyMember: true, invited: false, joined: false },
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: 'demo-debug-checkout',
    roomId: 'checkout-timeout',
    name: 'checkout-timeout',
    displayName: '#checkout-timeout',
    description: 'Investigating intermittent checkout timeouts on mobile connections',
    repository: 'acme/horizon-web',
    branch: 'fix/checkout-timeouts',
    openFile: 'src/checkout/submit-payment.ts',
    activeLine: 41,
    status: 'active',
    activeMinutes: 52,
    participants: [
      { id: 'demo-devon', name: 'Devon Roy', role: 'host', activeLine: 41, joinedAt: now(), lastSeenAt: now(), isHost: true },
      { id: 'demo-amara', name: 'Amara Fancy', role: 'collaborator', activeLine: 44, joinedAt: now(), lastSeenAt: now(), isHost: false },
    ],
    invites: [],
    investigation: {
      problem: 'Checkout requests occasionally time out after the payment intent is confirmed.',
      reproduction: 'Throttle the connection to 3G and submit a payment while backgrounding the app.',
      workingTheory: 'The confirmation poll continues after the app loses focus and exhausts the retry budget.',
      nextStep: 'Pause the poll while the document is hidden and resume on visibility.',
    },
    context: {
      task: { title: 'Checkout resilience', status: 'In Progress', href: '/tasks' },
      pullRequest: { title: 'PR #47 · Pause checkout polling', status: 'Open', href: '/source-code' },
      branch: { title: 'fix/checkout-timeouts', status: 'Active', href: '/source-code' },
      specification: { title: 'checkout.spec.yaml', status: '6/7 requirements passing', href: '/specs' },
    },
    chat: [
      { id: 'demo-chat-6', name: 'Devon Roy', role: 'host', message: 'Retries continue for 90 seconds after the document is hidden.', createdAt: now(), isMine: false },
    ],
    activity: [
      { id: 'demo-activity-6', actorName: 'Devon Roy', action: 'Created debug room', target: '#checkout-timeout', createdAt: now() },
    ],
    access: { role: 'collaborator', canView: true, canEdit: true, canInvite: true, isHost: false, isCompanyMember: true, invited: false, joined: false },
    createdAt: now(),
    updatedAt: now(),
  },
];

function parseBody(rawBody) {
  if (!rawBody) return {};
  if (typeof rawBody === 'object') return rawBody;
  try {
    return JSON.parse(rawBody);
  } catch (_) {
    return {};
  }
}

function findRoom(id) {
  return rooms.find((room) => room.id === id || room.roomId === id) || null;
}

function parseEmails(value) {
  return String(value || '')
    .split(/[,;\n]/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry));
}

function codeForRoom(room) {
  const hasMatchingFile = room.openFile === 'src/services/auth/jwt.service.ts';
  return {
    file: hasMatchingFile
      ? {
        id: 'demo-jwt-file',
        name: 'jwt.service.ts',
        path: 'src/services/auth/jwt.service.ts',
        language: 'typescript',
        content: codeText,
        lineCount: codeLines.length,
      }
      : null,
    activeLine: room.activeLine || 0,
    highlights: room.participants
      .filter((participant) => participant.activeLine > 0)
      .map((participant) => ({
        line: participant.activeLine,
        name: participant.name,
        role: participant.role,
      })),
  };
}

function touchActivity(room, action, target) {
  room.activity.unshift({
    id: `demo-activity-${Date.now()}`,
    actorName: 'Alex Morgan',
    action,
    target,
    createdAt: now(),
  });
  room.lastActiveAt = now();
}

export function getDebugRoomDemoResponse(pathname, method, rawBody) {
  if (pathname === '/api/ai-pair/model-config' && method === 'GET') {
    // Mirrors the shape and real model identifiers returned by the backend so
    // the demo tour doesn't display invented model names.
    const groq = { provider: 'groq', providerName: 'Groq (Fast Inference)', model: 'openai/gpt-oss-120b', type: 'cloud' };
    return {
      success: true,
      defaultModel: groq,
      fastModel: groq,
      privacy: { available: false, enabled: false, provider: null, providerName: null, model: null },
      providers: [groq],
    };
  }

  if (pathname === '/api/debug-rooms' && method === 'GET') {
    return { rooms };
  }

  if (pathname === '/api/debug-rooms' && method === 'POST') {
    const body = parseBody(rawBody);
    const name = String(body.name || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '') || `room-${Date.now()}`;
    const roomId = rooms.some((room) => room.roomId === name) ? `${name}-${rooms.length + 1}` : name;
    const emails = parseEmails(body.emails);
    const role = body.participantAccess === 'collaborator' ? 'collaborator' : 'viewer';
    const room = {
      id: `demo-debug-${Date.now()}`,
      roomId,
      name: roomId,
      displayName: `#${roomId}`,
      description: body.description || '',
      repository: 'acme/horizon-web',
      branch: body.branch || 'main',
      openFile: body.openFile || '',
      activeLine: 0,
      status: 'active',
      activeMinutes: 1,
      participants: [
        { id: 'demo-alex', name: 'Alex Morgan', role: 'host', activeLine: 0, joinedAt: now(), lastSeenAt: now(), isHost: true },
      ],
      invites: emails.map((email) => ({ id: `demo-invite-${email}`, email, role, status: 'pending', invitedAt: now() })),
      investigation: { problem: '', reproduction: '', workingTheory: '', nextStep: '' },
      context: {
        task: { title: '', status: '', href: '/tasks' },
        pullRequest: { title: '', status: '', href: '/source-code' },
        branch: { title: body.branch || 'main', status: 'Active', href: '/source-code' },
        specification: { title: '', status: '', href: '/specs' },
      },
      chat: [],
      activity: [{ id: `demo-activity-${Date.now()}`, actorName: 'Alex Morgan', action: 'Created debug room', target: `#${roomId}`, createdAt: now() }],
      access: { role: 'host', canView: true, canEdit: true, canInvite: true, isHost: true, isCompanyMember: true, invited: false, joined: true },
      createdAt: now(),
      updatedAt: now(),
    };
    rooms.unshift(room);
    return { room };
  }

  const match = pathname.match(/^\/api\/debug-rooms\/([^/]+)(?:\/(join|leave|chat|invite|code))?$/);
  if (!match) return null;
  const room = findRoom(match[1]);
  if (!room) return null;
  const action = match[2];
  const body = parseBody(rawBody);

  if (!action && method === 'GET') {
    return { room };
  }

  if (!action && method === 'PATCH') {
    if (body.investigation && typeof body.investigation === 'object') {
      room.investigation = { ...room.investigation, ...body.investigation };
      touchActivity(room, 'Updated investigation', `#${room.roomId}`);
    }
    if (body.context && typeof body.context === 'object') {
      room.context = { ...room.context, ...body.context };
      touchActivity(room, 'Updated linked context', `#${room.roomId}`);
    }
    return { room };
  }

  if (action === 'join' && method === 'POST') {
    if (!room.participants.some((participant) => participant.id === 'demo-alex')) {
      room.participants.push({
        id: 'demo-alex',
        name: 'Alex Morgan',
        role: room.access.canEdit ? 'collaborator' : 'viewer',
        activeLine: room.activeLine,
        joinedAt: now(),
        lastSeenAt: now(),
        isHost: false,
      });
      touchActivity(room, 'Joined debug room', `#${room.roomId}`);
    }
    room.access = { ...room.access, joined: true };
    return { room };
  }

  if (action === 'leave' && method === 'POST') {
    room.participants = room.participants.filter((participant) => participant.id !== 'demo-alex');
    room.access = { ...room.access, joined: false };
    touchActivity(room, 'Left debug room', `#${room.roomId}`);
    return { room };
  }

  if (action === 'chat' && method === 'POST') {
    const message = String(body.message || '').trim();
    if (message) {
      room.chat.push({
        id: `demo-chat-${Date.now()}`,
        name: 'Alex Morgan',
        role: room.access.role || 'viewer',
        message,
        createdAt: now(),
        isMine: true,
      });
    }
    return { room };
  }

  if (action === 'invite' && method === 'POST') {
    const emails = parseEmails(body.emails || body.email);
    const role = body.role === 'collaborator' ? 'collaborator' : 'viewer';
    for (const email of emails) {
      const existing = room.invites.find((invite) => invite.email === email);
      if (existing) {
        existing.role = role;
        existing.status = 'pending';
      } else {
        room.invites.push({ id: `demo-invite-${email}`, email, role, status: 'pending', invitedAt: now() });
      }
    }
    touchActivity(room, `Invited ${emails.length === 1 ? emails[0] : `${emails.length} teammates`}`, `#${room.roomId}`);
    return { invited: emails, room };
  }

  if (action === 'code' && method === 'GET') {
    return { code: codeForRoom(room) };
  }

  return null;
}
