/**
 * Shared AI failure classification and retry timing.
 *
 * Providers fail in three very different ways and treating them alike is what
 * makes a deployment repair die:
 *
 *  - transient/provider-side: `503 Service Unavailable`, "high demand",
 *    overloaded, 429, gateway errors, network resets. Retrying later or using
 *    another model/provider works and must never be reported as a code error.
 *  - model-side: the configured model was renamed/removed (404). Retrying the
 *    same name is pointless; another model from the same provider works.
 *  - caller-side: bad API key, token/context limit. Retrying burns budget and
 *    the user has to fix the configuration, so surface it.
 *
 * Used by utils/aiService (retries + failover) and by the deployment self-heal
 * worker (so a provider outage does not consume a repair attempt).
 */

function readInt(raw, fallback) {
    const value = parseInt(raw, 10);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
}

const DEFAULT_MAX_RETRIES = readInt(process.env.AI_MAX_RETRIES, 2);
const BASE_DELAY_MS = readInt(process.env.AI_RETRY_BASE_MS, 700);
const MAX_DELAY_MS = readInt(process.env.AI_RETRY_MAX_MS, 10000);

const TRANSIENT_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const AUTH_PATTERN = /invalid api key|incorrect api key|invalid_api_key|unauthorized|authentication failed|api key not valid|permission denied|\b401\b|\b403\b/i;
const TOKEN_LIMIT_PATTERN = /request too large|tokens per minute|rate_limit_exceeded|context_length_exceeded|maximum context length|too many tokens|reduce your message size/i;
const MODEL_PATTERN = /model[^\n]{0,60}(not found|does not exist|is not available|not available|decommissioned|unsupported|is not supported)|no such model|unknown model/i;
const TRANSIENT_PATTERN = /service unavailable|high demand|overloaded|temporarily unavailable|try again later|too many requests|resource.?exhausted|fetch failed|socket hang up|econnreset|econnrefused|etimedout|network error|bad gateway|gateway time-?out|\b50[0234]\b/i;
const TIMEOUT_PATTERN = /timed? ?out|timeout/i;

function statusOf(error) {
    const direct = Number(
        error?.status || error?.statusCode || error?.response?.status || error?.code
    );
    if (Number.isInteger(direct) && direct >= 400 && direct <= 599) return direct;
    // SDK errors (Gemini) only carry the code in the message:
    // "[503 Service Unavailable] This model is currently experiencing..."
    const match = String(error?.message || '').match(/\b([45]\d{2})\b/);
    return match ? Number(match[1]) : null;
}

function retryAfterMsOf(error) {
    const explicit = Number(error?.retryAfterMs);
    if (Number.isFinite(explicit) && explicit >= 0) return explicit;

    const header = error?.headers?.get?.('retry-after')
        || error?.response?.headers?.get?.('retry-after')
        || error?.response?.headers?.['retry-after'];
    if (header) {
        const seconds = Number(header);
        if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
        const at = Date.parse(header);
        if (Number.isFinite(at)) return Math.max(0, at - Date.now());
    }

    // Gemini puts a retryDelay ("37s") in the 429 details.
    const match = String(error?.message || '').match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i);
    if (match) return Math.round(Number(match[1]) * 1000);
    return null;
}

/**
 * @returns {{ retryable: boolean, kind: 'auth'|'token_limit'|'model'|'timeout'|'transient'|'unknown',
 *             status: number|null, retryAfterMs: number|null, modelMissing: boolean }}
 */
function classifyAiError(error) {
    const message = String(error?.message || error || '');
    const status = statusOf(error);
    const retryAfterMs = retryAfterMsOf(error);
    const name = String(error?.name || '');

    if (status === 401 || status === 403 || AUTH_PATTERN.test(message)) {
        return { retryable: false, kind: 'auth', status, retryAfterMs, modelMissing: false };
    }
    if (TOKEN_LIMIT_PATTERN.test(message)) {
        return { retryable: false, kind: 'token_limit', status, retryAfterMs, modelMissing: false };
    }
    if (status === 404 || MODEL_PATTERN.test(message)) {
        return { retryable: false, kind: 'model', status, retryAfterMs, modelMissing: true };
    }
    if (name === 'TimeoutError' || name === 'AbortError' || TIMEOUT_PATTERN.test(message)) {
        return { retryable: true, kind: 'timeout', status, retryAfterMs, modelMissing: false };
    }
    if (TRANSIENT_STATUS.has(status) || TRANSIENT_PATTERN.test(message)) {
        return { retryable: true, kind: 'transient', status, retryAfterMs, modelMissing: false };
    }
    return { retryable: false, kind: 'unknown', status, retryAfterMs, modelMissing: false };
}

/** Provider is reachable but the chosen model is overloaded/unavailable. */
function isTransientAiError(error) {
    const info = typeof error === 'string' ? classifyAiError(new Error(error)) : classifyAiError(error);
    return info.retryable;
}

/** Provider-side outage (not the caller's key, not the model name). */
function isProviderOutageError(error) {
    const info = typeof error === 'string' ? classifyAiError(new Error(error)) : classifyAiError(error);
    return info.retryable && info.kind !== 'token_limit';
}

/**
 * Delay before the next attempt. Honours Retry-After/retryDelay from the
 * provider, otherwise exponential backoff with jitter so parallel agent runs
 * do not retry in lockstep. `attempt` is 1-based.
 */
function retryDelayMs(attempt, options = {}) {
    const retryAfterMs = Number(options.retryAfterMs);
    if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
        return Math.min(Math.round(retryAfterMs), options.maxDelayMs ?? MAX_DELAY_MS * 3);
    }
    const base = options.baseDelayMs ?? BASE_DELAY_MS;
    const cap = options.maxDelayMs ?? MAX_DELAY_MS;
    const exponential = Math.min(base * Math.pow(2, Math.max(0, attempt - 1)), cap);
    const jitter = options.jitter === false ? 1 : 0.75 + Math.random() * 0.5;
    return Math.round(exponential * jitter);
}

function sleep(ms, signal) {
    if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
        if (signal?.aborted) return resolve();
        const timer = setTimeout(() => {
            if (signal?.removeEventListener) signal.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        timer.unref?.();
        const onAbort = () => {
            clearTimeout(timer);
            resolve();
        };
        if (signal?.addEventListener) signal.addEventListener('abort', onAbort, { once: true });
    });
}

module.exports = {
    classifyAiError,
    isTransientAiError,
    isProviderOutageError,
    retryDelayMs,
    sleep,
    statusOf,
    retryAfterMsOf,
    DEFAULT_MAX_RETRIES,
    BASE_DELAY_MS,
    MAX_DELAY_MS,
};
