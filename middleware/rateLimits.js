/**
 * Shared server-side rate limiters for write endpoints that previously relied
 * only on the client-side limiter in buildrs-frontend/lib/api.js
 * (10 non-GET requests per minute per path — trivially bypassed by anyone
 * calling the API directly).
 *
 * Limits are deliberately generous: they stop floods and cost-burn
 * (AI calls run at real money per request), not legitimate use.
 * Skipped in NODE_ENV=test so the suite stays deterministic.
 */
const rateLimit = require('express-rate-limit');

const skipInTest = () => process.env.NODE_ENV === 'test';

function makeLimiter({ windowMs, max, message }) {
    return rateLimit({
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        skip: skipInTest,
        message: { success: false, message },
    });
}

// 60 messages/min per IP (client allows ~10/min).
const messageSendLimiter = makeLimiter({
    windowMs: 60 * 1000,
    max: 60,
    message: 'Too many messages, please slow down.',
});

// 10 tickets/min per IP — tickets are agent-facing work items.
const supportTicketLimiter = makeLimiter({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many tickets, please try again later.',
});

// 60 support replies/min per IP.
const supportReplyLimiter = makeLimiter({
    windowMs: 60 * 1000,
    max: 60,
    message: 'Too many replies, please slow down.',
});

// 20 AI chat requests/min per IP — each one costs real inference money.
const aiChatLimiter = makeLimiter({
    windowMs: 60 * 1000,
    max: 20,
    message: 'Too many AI requests, please try again shortly.',
});

// 10 agent delegations/min per IP — spins up AI runs and containers.
const agentDelegateLimiter = makeLimiter({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many agent requests, please try again shortly.',
});

// 5 dev-gate password attempts per 15 minutes per IP — password guessing.
const devGateLimiter = makeLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many attempts, please try again later.',
});

module.exports = {
    devGateLimiter,
    messageSendLimiter,
    supportTicketLimiter,
    supportReplyLimiter,
    aiChatLimiter,
    agentDelegateLimiter,
};
