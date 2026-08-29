/**
 * Frontend Security Utilities
 * Rate limiting, input validation, token expiry, debounce
 */

// ============ RATE LIMITER ============
const rateLimitStore = new Map();

export function rateLimit(key, { maxAttempts = 5, windowMs = 60000 } = {}) {
  const now = Date.now();
  const record = rateLimitStore.get(key) || { attempts: 0, resetAt: now + windowMs };

  if (now > record.resetAt) {
    record.attempts = 0;
    record.resetAt = now + windowMs;
  }

  record.attempts++;
  rateLimitStore.set(key, record);

  if (record.attempts > maxAttempts) {
    const retryAfter = Math.ceil((record.resetAt - now) / 1000);
    return { allowed: false, retryAfter, remaining: 0 };
  }

  return { allowed: true, retryAfter: 0, remaining: maxAttempts - record.attempts };
}

export function resetRateLimit(key) {
  rateLimitStore.delete(key);
}

// ============ DEBOUNCE ============
export function debounce(fn, delayMs = 300) {
  let timer;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}

// ============ TOKEN EXPIRY ============
export function isTokenExpired(token) {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const expiryMs = payload.exp * 1000;
    return Date.now() >= expiryMs;
  } catch {
    return true;
  }
}

export function getTokenRemainingMs(token) {
  if (!token) return 0;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const expiryMs = payload.exp * 1000;
    return Math.max(0, expiryMs - Date.now());
  } catch {
    return 0;
  }
}

// ============ INPUT VALIDATION ============
const VALIDATION_RULES = {
  email: {
    test: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    message: 'Invalid email address',
  },
  password: {
    test: (v) => v.length >= 8,
    message: 'Password must be at least 8 characters',
  },
  passwordStrong: {
    test: (v) => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/.test(v),
    message: 'Must contain uppercase, lowercase, number, and special character',
  },
  fullName: {
    test: (v) => v.trim().length >= 2 && v.trim().length <= 100,
    message: 'Name must be 2-100 characters',
  },
  required: {
    test: (v) => v !== null && v !== undefined && String(v).trim().length > 0,
    message: 'This field is required',
  },
  maxLength: (max) => ({
    test: (v) => String(v).length <= max,
    message: `Must be ${max} characters or less`,
  }),
  minLength: (min) => ({
    test: (v) => String(v).length >= min,
    message: `Must be at least ${min} characters`,
  }),
  noScript: {
    test: (v) => !/<script[\s>]/i.test(v),
    message: 'Script tags are not allowed',
  },
  noHtml: {
    test: (v) => !/<[^>]*>/i.test(v),
    message: 'HTML tags are not allowed',
  },
};

export function validate(value, rules) {
  const errors = [];
  const ruleList = Array.isArray(rules) ? rules : [rules];

  for (const rule of ruleList) {
    const validator = typeof rule === 'string' ? VALIDATION_RULES[rule] : rule;
    if (validator && !validator.test(value)) {
      errors.push(validator.message);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateForm(fields) {
  const errors = {};
  let valid = true;

  for (const [field, value, rules] of fields) {
    const result = validate(value, rules);
    if (!result.valid) {
      errors[field] = result.errors[0];
      valid = false;
    }
  }

  return { valid, errors };
}

// ============ SANITIZE ============
export function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export function stripHtml(input) {
  if (typeof input !== 'string') return input;
  return input.replace(/<[^>]*>/g, '');
}

// ============ SUBMIT GUARD ============
export function createSubmitGuard() {
  let submitting = false;

  return {
    acquire: () => {
      if (submitting) return false;
      submitting = true;
      return true;
    },
    release: () => { submitting = false; },
    isSubmitting: () => submitting,
  };
}

// ============ PASSWORD STRENGTH ============
export function getPasswordStrength(password) {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^\w\s]/.test(password)) score++;

  const labels = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];
  const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-blue-500', 'bg-green-500'];

  return {
    score,
    label: labels[Math.min(score, 4)],
    color: colors[Math.min(score, 4)],
    percent: Math.min(score * 20, 100),
  };
}

// ============ ABORT WITH TIMEOUT ============
export function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timeoutId));
}
