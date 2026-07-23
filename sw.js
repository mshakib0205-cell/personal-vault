// Study Vault Service Worker — v3 (No MEGA, Local Storage Only)
const CACHE_VERSION = 'sv-v3';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;

const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/main.css',
  '/css/app.css',
  '/js/localdb.js',
  '/js/storage.js',
  '/js/ui.js',
  '/js/upload.js',
  '/js/preview.js',
  '/js/search.js',
  '/js/sw-register.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ---- Install: cache new shell ----
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_URLS).catch(err => console.warn('[SW] Cache failed:', err)))
      .then(() => self.skipWaiting())  // Activate immediately
  );
});

// ---- Activate: DELETE all old caches ----
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== SHELL_CACHE)  // Delete EVERYTHING except current
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      ))
      .then(() => self.clients.claim())
  );
});

// ---- Fetch: Network-first for JS/HTML, cache fallback ----
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  // Skip external CDN (Prism.js etc) — always network
  if (url.origin !== self.location.origin) return;

  // App shell files: network-first so updates propagate fast
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(SHELL_CACHE).then(cache => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// ---- Message: force update ----
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
