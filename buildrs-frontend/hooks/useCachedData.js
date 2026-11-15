import { useCallback, useEffect, useRef, useState } from 'react';

const REFRESH_INTERVAL_MS = 30000;
const CACHE_PREFIX = 'buildrs-page-cache-v1';

function cacheKey(userId, key) {
  return userId ? `${CACHE_PREFIX}:${userId}:${key}` : null;
}

function readCache(userId, key) {
  const k = cacheKey(userId, key);
  if (typeof window === 'undefined' || !k) return null;
  try {
    const raw = window.sessionStorage.getItem(k);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(userId, key, value) {
  const k = cacheKey(userId, key);
  if (typeof window === 'undefined' || !k) return;
  try {
    window.sessionStorage.setItem(k, JSON.stringify(value));
  } catch {
    // Storage unavailable; continue without caching.
  }
}

/**
 * Hook that mirrors the dashboard's data-loading pattern:
 * 1. Reads from sessionStorage on first render (instant, no flash)
 * 2. Fetches fresh data in the background
 * 3. Deduplicates in-flight requests
 * 4. Guards against stale closures (isCurrentUser)
 * 5. Refreshes on tab visibility change and on a 30s interval
 *
 * @param {string} userId - Current user id (used for cache scoping)
 * @param {string} key - Cache key for this data slice
 * @param {function} fetcher - Async function that returns { success, data, ... }
 * @param {object} options - { refreshOnVisibility, intervalMs, initialData }
 */
export function useCachedData(userId, key, fetcher, options = {}) {
  const {
    refreshOnVisibility = true,
    intervalMs = REFRESH_INTERVAL_MS,
    initialData = null,
  } = options;

  const currentUserId = userId ? String(userId) : null;
  const [data, setData] = useState(() => {
    const cached = readCache(currentUserId, key);
    return cached ?? initialData ?? [];
  });
  const [loading, setLoading] = useState(() => readCache(currentUserId, key) == null);
  const mounted = useRef(true);
  const requestRef = useRef(null);
  const cacheUserIdRef = useRef(currentUserId);
  const saveCache = useCallback((value) => {
    writeCache(currentUserId, key, value);
  }, [currentUserId, key]);

  // Re-hydrate from cache when the user changes.
  useEffect(() => {
    if (cacheUserIdRef.current === currentUserId) return;
    cacheUserIdRef.current = currentUserId;
    const cached = readCache(currentUserId, key);
    setData(cached ?? initialData);
    setLoading(cached == null);
  }, [currentUserId, key, initialData]);

  const load = useCallback(async () => {
    if (!requestRef.current || requestRef.current.userId !== currentUserId) {
      const request = { userId: currentUserId, promise: fetcher() };
      requestRef.current = request;
      request.promise.then(
        () => {
          if (requestRef.current === request) requestRef.current = null;
        },
        () => {
          if (requestRef.current === request) requestRef.current = null;
        }
      );
    }
    return requestRef.current.promise;
  }, [currentUserId, fetcher]);

  const refresh = useCallback(async () => {
    if (!currentUserId) return;
    try {
      setLoading(true);
      const result = await load();
      if (!mounted.current) return;
      if (result.success && result.data !== undefined) {
        setData(result.data);
        saveCache(result.data);
      }
    } catch {
      // keep previous state on transient errors
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [currentUserId, load, saveCache]);

  useEffect(() => {
    mounted.current = true;
    if (!currentUserId) return undefined;

    // Kick off an initial background refresh (cache already rendered instantly).
    refresh();

    let onVisible;
    if (refreshOnVisibility) {
      onVisible = () => {
        if (document.visibilityState === 'visible') refresh();
      };
      document.addEventListener('visibilitychange', onVisible);
    }

    const interval = intervalMs > 0 ? setInterval(refresh, intervalMs) : null;

    return () => {
      mounted.current = false;
      if (refreshOnVisibility && onVisible) {
        document.removeEventListener('visibilitychange', onVisible);
      }
      if (interval) clearInterval(interval);
    };
  }, [currentUserId, refresh, refreshOnVisibility, intervalMs]);

  const dataBelongsToCurrentUser = cacheUserIdRef.current === currentUserId;
  return {
    data: dataBelongsToCurrentUser ? data : initialData,
    loading: !dataBelongsToCurrentUser || loading,
    refresh,
  };
}
