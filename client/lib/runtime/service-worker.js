/* Phase 3 — Service worker: cache dependency tarballs / node_modules snapshots
 * for faster repeat boots. App-shell + opaque tarball cache only; never caches
 * API responses or room/socket traffic.
 */
const VERSION = 'phase3-v1';
const STATIC_CACHE = `static-${VERSION}`;
const DEPS_CACHE = `deps-${VERSION}`;

// Dependency tarballs / snapshots eligible for caching (repeat-boot speedup).
const DEP_PATTERNS = [/\.tgz$/i, /\.tar\.gz$/i, /node_modules/i, /\/deps\//i, /webcontainer/i];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => ![STATIC_CACHE, DEPS_CACHE].includes(k) && (k.startsWith('static-') || k.startsWith('deps-')))
          .map((k) => caches.delete(k))
      ).then(() => self.clients.claim())
    )
  );
});

function isDepRequest(url) {
  return DEP_PATTERNS.some((re) => re.test(url));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = request.url;
  // Never cache API, socket, or auth traffic.
  if (/\/api\//i.test(url) || /socket\.io/i.test(url) || /\/auth\//i.test(url)) return;
  if (!isDepRequest(url)) return;
  event.respondWith(
    caches.open(DEPS_CACHE).then(async (cache) => {
      const hit = await cache.match(request);
      if (hit) return hit;
      try {
        const res = await fetch(request);
        if (res && res.ok) cache.put(request, res.clone());
        return res;
      } catch (err) {
        if (hit) return hit;
        throw err;
      }
    })
  );
});
